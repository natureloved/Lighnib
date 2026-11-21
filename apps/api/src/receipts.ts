/**
 * receipts.ts, INV-9 invoice bindings + bound receipts (INV-5, INV-6).
 * All data is public: payment hashes, supplier ids, amounts. The API
 * never sees a secret and never holds funds.
 */

import {
  buildBoundReceipt,
  decodeBolt11,
  hexToBytes,
  parseLighnibMemo,
  sha256Hex,
  verifyReceipt,
  verifyReceiptDetail,
  type ReceiptVerificationDetail,
  InvoiceBindingRegistry,
  type BindingCheck,
  type BoundReceipt,
  type InvoiceBinding,
  type Scope,
} from "@lighnib/shared";
import { getScope, settlePayment } from "./scope";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

export const bindings = new InvoiceBindingRegistry();

const receipts = new Map<string, BoundReceipt>();

/**
 * File persistence (Wed fix, Task 2): receipts were in-memory only, so
 * every API restart wiped the seed data and /receipts showed empty.
 * Receipts now persist to data/receipts.json (gitignored) and reload on
 * startup, so the seeded history survives restarts and tunnel churn.
 * The file holds only public receipt data (hashes, preimages, amounts).
 */
/**
 * __dirname is the Node CommonJS module directory. The API tsconfig uses
 * module CommonJS, so import.meta is not available here (TS1343). Under
 * tsx (dev) __dirname is apps/api/src; in the built dist/ it is
 * apps/api/dist. In both cases ../data resolves to apps/api/data.
 */
declare const __dirname: string;

const DATA_DIR = join(__dirname, "..", "data");
const RECEIPTS_FILE = join(DATA_DIR, "receipts.json");

function loadReceipts(): void {
  try {
    if (!existsSync(RECEIPTS_FILE)) return;
    const raw = JSON.parse(readFileSync(RECEIPTS_FILE, "utf8")) as BoundReceipt[];
    if (!Array.isArray(raw)) return;
    for (const r of raw) {
      if (r && typeof r.id === "string" && r.paymentHash) receipts.set(r.id, r);
    }
  } catch {
    // Corrupt or unreadable file: start empty rather than crash the API.
  }
}

function saveReceipts(): void {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(RECEIPTS_FILE, JSON.stringify([...receipts.values()], null, 2));
  } catch {
    // Disk write failure must not break the payment flow; data stays in memory.
  }
}

// Load any persisted receipts at startup.
loadReceipts();

export function recordBinding(binding: InvoiceBinding): InvoiceBinding {
  bindings.record(binding);
  return binding;
}

/**
 * Validate a binding's memo against its supplier/order fields, for the
 * public POST /api/invoices route. A binding whose memo names a
 * different supplier or order than the body claims is a cross-supplier
 * registration attempt: refuse it. A missing or malformed memo is
 * refused too: the memo is the binding's evidence. (The mint endpoint
 * builds its own memo server-side, so it does not go through this
 * check; recordBinding itself stays a plain registry write.)
 */
export function validateBindingMemo(binding: InvoiceBinding): void {
  const memo = parseLighnibMemo(binding.memo ?? "");
  if (!memo) {
    throw new Error(
      "Binding requires a Lighnib memo (Lighnib:order#<orderId>:<supplierId>)",
    );
  }
  if (memo.supplierId !== binding.supplierId) {
    throw new Error("Binding memo supplier does not match the registered supplier");
  }
  if (memo.orderId !== binding.orderId) {
    throw new Error("Binding memo order does not match the registered order");
  }
}

export function checkBinding(
  paymentHash: string,
  expectedSupplierId?: string,
  expectedAmountSats?: number,
): BindingCheck {
  return bindings.check(paymentHash, expectedSupplierId, expectedAmountSats);
}

/** Decode a BOLT11 invoice the merchant pasted, incl. the Lighnib memo. */
export function decodeInvoice(invoice: string) {
  const decoded = decodeBolt11(invoice);
  if (!decoded) return { valid: false as const, reason: "INVALID_BOLT11" };
  return {
    valid: true as const,
    ...decoded,
    memo: parseLighnibMemo(decoded.description),
  };
}

/** INV-5/INV-6: build a bound receipt only from settled-payment data.
 *  Idempotent by payment hash: a payment that was settled once must
 *  never produce a second receipt. A retry or reconcile that replays
 *  the same hash returns the receipt that already exists. */
export function createReceipt(input: Parameters<typeof buildBoundReceipt>[0]): BoundReceipt {
  const existing = getReceiptByHash(input.paymentHash);
  if (existing) {
    // The preimage must still match the hash: a replay with a wrong
    // preimage is refused, never silently accepted as the real receipt.
    if (
      sha256Hex(hexToBytes(input.preimage)) !== input.paymentHash.toLowerCase()
    ) {
      throw new Error("INV-6: preimage does not match payment hash, not a settled payment");
    }
    return existing;
  }
  const receipt = buildBoundReceipt(input);
  receipts.set(receipt.id, receipt);
  saveReceipts();
  return receipt;
}

export function getReceiptByHash(paymentHash: string): BoundReceipt | undefined {
  const hash = paymentHash.toLowerCase();
  for (const r of receipts.values()) {
    if (r.paymentHash === hash) return r;
  }
  return undefined;
}

/**
 * Reconcile an uncertain payment (Nov 21 review, item 7): the wallet
 * paid, but the settle/receipt step failed, so the merchant does not
 * know whether the money moved. The caller passes the preimage the
 * wallet returned (or that a lookup_invoice returned). The preimage is
 * settlement proof: buildBoundReceipt refuses it unless it hashes to
 * the payment hash. The receipt is created idempotently by hash, and
 * the scope spend is recorded idempotently too, but only while the
 * scope is still PAYING. A scope that already settled (RECEIPTED) is
 * left alone; a scope in any other state is reported, not forced.
 * Never retry a payment blind: this endpoint is the recovery path.
 */
export function reconcilePayment(input: {
  scopeId: string;
  paymentHash: string;
  preimage: string;
  orderId: string;
  supplierId: string;
  vendorName: string;
  purpose: string;
  amountSats: number;
  amountFiat: number;
  currency: BoundReceipt["currency"];
  payerPubkey: string;
}): { receipt: BoundReceipt; scope: Scope | undefined; settled: boolean } {
  const receipt = createReceipt({
    id: `rcpt_${Date.now().toString(36)}`,
    orderId: input.orderId,
    supplierId: input.supplierId,
    vendorName: input.vendorName,
    purpose: input.purpose,
    amountSats: input.amountSats,
    amountFiat: input.amountFiat,
    currency: input.currency,
    paymentHash: input.paymentHash,
    preimage: input.preimage,
    payerPubkey: input.payerPubkey,
  });
  const scope = getScope(input.scopeId);
  let settled = false;
  if (scope && scope.state === "PAYING") {
    settlePayment(scope.id, input.amountSats, input.paymentHash);
    settled = true;
  }
  return { receipt, scope: getScope(input.scopeId), settled };
}

export function getReceipt(id: string): BoundReceipt | undefined {
  return receipts.get(id);
}

export function listReceipts(): BoundReceipt[] {
  return [...receipts.values()];
}

export function verifyReceiptById(id: string): { exists: boolean; valid: boolean } {
  const receipt = receipts.get(id);
  if (!receipt) return { exists: false, valid: false };
  return { exists: true, valid: verifyReceipt(receipt) };
}

/** Blocked payment attempts (seed + live): the two enforcers in action. */
export interface BlockedAttempt {
  id: string;
  kind: "overspend" | "wrong-supplier";
  reason: string;
  amountSats?: number;
  amountFiat?: number;
  supplierId?: string;
  orderId?: string;
  at: string;
}

const blocked = new Map<string, BlockedAttempt>();
const BLOCKED_FILE = join(DATA_DIR, "blocked.json");

function loadBlocked(): void {
  try {
    if (!existsSync(BLOCKED_FILE)) return;
    const raw = JSON.parse(readFileSync(BLOCKED_FILE, "utf8")) as BlockedAttempt[];
    if (!Array.isArray(raw)) return;
    for (const b of raw) {
      if (b && typeof b.id === "string" && b.kind) blocked.set(b.id, b);
    }
  } catch {
    // Start empty rather than crash.
  }
}

function saveBlocked(): void {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(BLOCKED_FILE, JSON.stringify([...blocked.values()], null, 2));
  } catch {
    // Disk failure must not break the flow.
  }
}

loadBlocked();

export function recordBlocked(attempt: BlockedAttempt): BlockedAttempt {
  blocked.set(attempt.id, attempt);
  saveBlocked();
  return attempt;
}

export function listBlocked(): BlockedAttempt[] {
  return [...blocked.values()];
}

/** Metrics for the homepage strip + README (Task 6). Counts are live. */
export function getMetrics(): {
  receipts: number;
  overspendBlocks: number;
  wrongSupplierBlocks: number;
  disputes: number;
} {
  const all = listBlocked();
  return {
    receipts: receipts.size,
    overspendBlocks: all.filter((b) => b.kind === "overspend").length,
    wrongSupplierBlocks: all.filter((b) => b.kind === "wrong-supplier").length,
    disputes: 0,
  };
}

/**
 * Third-party verify: a verifier pastes a receipt JSON they received
 * (e.g. from a merchant's phone) and gets per-check results. No stored
 * state is consulted. The checks prove the preimage matches the payment
 * hash and that the receipt fields match their embedded record. They do
 * NOT authenticate the supplier, order, or purpose: changing the same
 * field in both the receipt and the embedded record passes, because no
 * event signature is verified. Malformed input is a verification failure,
 * not a crash.
 */
export function verifyPastedReceipt(input: unknown): {
  valid: boolean;
  checks: ReceiptVerificationDetail | null;
  reason?: string;
} {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { valid: false, checks: null, reason: "NOT_A_RECEIPT_OBJECT" };
  }
  const r = input as Partial<BoundReceipt>;
  const required = [
    "id",
    "orderId",
    "supplierId",
    "vendorName",
    "purpose",
    "amountSats",
    "paymentHash",
    "preimage",
    "status",
    "nostrEvent",
  ] as const;
  for (const field of required) {
    if (r[field] === undefined || r[field] === null || r[field] === "") {
      return { valid: false, checks: null, reason: `MISSING_FIELD_${field}` };
    }
  }
  if (typeof r.nostrEvent !== "object" || typeof r.nostrEvent.content !== "string") {
    return { valid: false, checks: null, reason: "MISSING_FIELD_nostrEvent" };
  }
  const checks = verifyReceiptDetail(r as BoundReceipt);
  return { valid: checks.valid, checks };
}
