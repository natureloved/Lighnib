/**
 * INV-9 — invoice↔supplier binding.
 *
 * Suppliers mint invoices through the portal wallet with memo
 * `Lighnib:order#<orderId>:<supplierId>`. The app records
 * payment_hash ↔ supplierId AT INVOICE CREATION, and checks it
 * BEFORE any wallet request. Unknown hash → refused. Supplier
 * mismatch → refused. BOLT11 has no payee field, so this app-side
 * check is the only supplier enforcement — the wallet enforces
 * budget only (INV-2), never the supplier (INV-3).
 */

import type { BindingCheck, InvoiceBinding } from "./types";

export class InvoiceBindingRegistry {
  private bindings = new Map<string, InvoiceBinding>();

  /** Record a binding at invoice creation. Overwriting a hash is refused. */
  record(binding: InvoiceBinding): void {
    if (this.bindings.has(binding.paymentHash)) {
      throw new Error(
        `Payment hash already bound: ${binding.paymentHash.slice(0, 12)}…`,
      );
    }
    this.bindings.set(binding.paymentHash, binding);
  }

  get(paymentHash: string): InvoiceBinding | undefined {
    return this.bindings.get(paymentHash);
  }

  size(): number {
    return this.bindings.size;
  }

  /**
   * Pre-payment check, run BEFORE any wallet request.
   * - Unknown hash → refused (UNKNOWN_INVOICE_HASH).
   * - Supplier mismatch → refused (SUPPLIER_MISMATCH).
   * - Amount mismatch → refused (AMOUNT_MISMATCH).
   */
  check(
    paymentHash: string,
    expectedSupplierId?: string,
    expectedAmountSats?: number,
  ): BindingCheck {
    const binding = this.bindings.get(paymentHash);
    if (!binding) {
      return { allowed: false, reason: "UNKNOWN_INVOICE_HASH" };
    }
    if (expectedSupplierId && binding.supplierId !== expectedSupplierId) {
      return { allowed: false, reason: "SUPPLIER_MISMATCH", binding };
    }
    if (
      expectedAmountSats !== undefined &&
      binding.amountSats !== expectedAmountSats
    ) {
      return { allowed: false, reason: "AMOUNT_MISMATCH", binding };
    }
    return { allowed: true, binding };
  }
}

/** Build the memo a supplier's invoice must carry. */
export function buildLighnibMemo(orderId: string, supplierId: string): string {
  return `Lighnib:order#${orderId}:${supplierId}`;
}
