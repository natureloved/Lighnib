/**
 * Bound receipts (INV-5, INV-6).
 *
 * INV-5: every settled payment MUST become a bound receipt.
 * INV-6: a receipt exists only AFTER settlement and carries
 * amount + vendor + purpose + payment hash + preimage — never a
 * bare payment notification (e.g. Nostr 9735) alone.
 *
 * Verification: sha256(preimage) must equal paymentHash.
 */

import { hexToBytes, sha256Hex } from "./sha256";
import type { BoundReceipt } from "./types";

export interface ReceiptInput {
  id: string;
  orderId: string;
  supplierId: string;
  vendorName: string;
  purpose: string;
  amountSats: number;
  amountFiat: number;
  currency: BoundReceipt["currency"];
  paymentHash: string;
  preimage: string;
  settledAt?: string;
  /** Wallet pubkey of the payer, for the Nostr event. */
  payerPubkey: string;
}

const HEX_64 = /^[0-9a-f]{64}$/i;

export function buildBoundReceipt(input: ReceiptInput): BoundReceipt {
  // INV-6: refuse to build a receipt without settlement proof.
  if (!input.preimage || !HEX_64.test(input.preimage)) {
    throw new Error("INV-6: receipt requires a valid 32-byte preimage (settlement proof)");
  }
  if (!input.paymentHash || !HEX_64.test(input.paymentHash)) {
    throw new Error("INV-6: receipt requires a valid 32-byte payment hash");
  }
  if (sha256Hex(hexToBytes(input.preimage)) !== input.paymentHash.toLowerCase()) {
    throw new Error("INV-6: preimage does not match payment hash — not a settled payment");
  }
  if (!input.vendorName || !input.purpose) {
    throw new Error("INV-6: receipt requires vendor and purpose");
  }
  if (input.amountSats <= 0) {
    throw new Error("INV-6: receipt requires a positive amount");
  }
  const settledAt = input.settledAt ?? new Date().toISOString();
  return {
    id: input.id,
    orderId: input.orderId,
    supplierId: input.supplierId,
    vendorName: input.vendorName,
    purpose: input.purpose,
    amountSats: input.amountSats,
    amountFiat: input.amountFiat,
    currency: input.currency,
    paymentHash: input.paymentHash.toLowerCase(),
    preimage: input.preimage.toLowerCase(),
    settledAt,
    status: "SETTLED",
    nostrEvent: {
      kind: 1,
      pubkey: input.payerPubkey,
      content: JSON.stringify({
        type: "lighnib-receipt",
        receiptId: input.id,
        orderId: input.orderId,
        supplierId: input.supplierId,
        vendor: input.vendorName,
        purpose: input.purpose,
        amountSats: input.amountSats,
        paymentHash: input.paymentHash.toLowerCase(),
        preimage: input.preimage.toLowerCase(),
        settledAt,
      }),
    },
  };
}

/** Verify a bound receipt: settled, complete, preimage matches hash,
 *  and the public Nostr event content matches the receipt fields
 *  (so a tampered amount/vendor cannot pass as the same receipt). */
export function verifyReceipt(receipt: BoundReceipt): boolean {
  if (receipt.status !== "SETTLED") return false;
  if (!receipt.vendorName || !receipt.purpose) return false;
  if (receipt.amountSats <= 0) return false;
  if (!HEX_64.test(receipt.paymentHash) || !HEX_64.test(receipt.preimage)) return false;
  if (
    sha256Hex(hexToBytes(receipt.preimage)) !== receipt.paymentHash.toLowerCase()
  ) {
    return false;
  }
  try {
    const content = JSON.parse(receipt.nostrEvent.content) as Record<string, unknown>;
    if (content.type !== "lighnib-receipt") return false;
    if (content.receiptId !== receipt.id) return false;
    if (content.orderId !== receipt.orderId) return false;
    if (content.supplierId !== receipt.supplierId) return false;
    if (content.vendor !== receipt.vendorName) return false;
    if (content.purpose !== receipt.purpose) return false;
    if (content.amountSats !== receipt.amountSats) return false;
    if (content.paymentHash !== receipt.paymentHash.toLowerCase()) return false;
    if (content.preimage !== receipt.preimage.toLowerCase()) return false;
  } catch {
    return false;
  }
  return true;
}

/** Human-readable receipt line, used by the AI explainer + voice readout. */
export function receiptSummary(receipt: BoundReceipt, currencySymbol: string): string {
  return (
    `You pay ${currencySymbol}${receipt.amountFiat.toLocaleString()} ` +
    `(${receipt.amountSats.toLocaleString()} sats) to ${receipt.vendorName} ` +
    `for ${receipt.purpose}. Receipt ${receipt.id} — payment hash ` +
    `${receipt.paymentHash.slice(0, 12)}… confirmed.`
  );
}
