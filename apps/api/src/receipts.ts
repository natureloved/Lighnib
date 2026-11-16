/**
 * receipts.ts — INV-9 invoice bindings + bound receipts (INV-5, INV-6).
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

export const bindings = new InvoiceBindingRegistry();

const receipts = new Map<string, BoundReceipt>();

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

/**
 * Third-party verify: a verifier pastes a receipt JSON they received
 * (e.g. from a merchant's phone) and gets per-check results. No stored
 * state is consulted — the receipt proves itself via the preimage/hash
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
