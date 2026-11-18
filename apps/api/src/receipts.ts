/**
 * receipts.ts, INV-9 invoice bindings + bound receipts (INV-5, INV-6).
 * All data is public: payment hashes, supplier ids, amounts. The API
 * never sees a secret and never holds funds.
 */

import {
  buildBoundReceipt,
  decodeBolt11,
  parseLighnibMemo,
  verifyReceipt,
  verifyReceiptDetail,
  type ReceiptVerificationDetail,
  InvoiceBindingRegistry,
  type BindingCheck,
  type BoundReceipt,
  type InvoiceBinding,
} from "@lighnib/shared";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const bindings = new InvoiceBindingRegistry();

const receipts = new Map<string, BoundReceipt>();

/**
 * File persistence (Wed fix, Task 2): receipts were in-memory only, so
 * every API restart wiped the seed data and /receipts showed empty.
 * Receipts now persist to data/receipts.json (gitignored) and reload on
 * startup, so the seeded history survives restarts and tunnel churn.
 * The file holds only public receipt data (hashes, preimages, amounts).
 */
const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "data");
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

/** INV-5/INV-6: build a bound receipt only from settled-payment data. */
export function createReceipt(input: Parameters<typeof buildBoundReceipt>[0]): BoundReceipt {
  const receipt = buildBoundReceipt(input);
  receipts.set(receipt.id, receipt);
  saveReceipts();
  return receipt;
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
 * state is consulted, the receipt proves itself via the preimage/hash
 * binding and the Nostr event cross-check. Malformed input is a
 * verification failure, not a crash.
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
