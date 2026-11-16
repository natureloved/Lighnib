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
