/**
 * invoices.ts, POST /api/invoices/mint - supplier invoice minting.
 *
 * The friction fix: before this endpoint, a supplier minted an invoice in
 * their own wallet, then the hash had to be registered with the API by a
 * second, manual step (POST /api/invoices) before any merchant could pay
 * it. Now one call does both: mint the invoice in the supplier's LNbits
 * wallet AND record the INV-9 binding, so the merchant can pay it straight
 * away. The merchant flow is unchanged: paste invoice → INV-9 check →
 * wallet pays → bound receipt.
 *
 * SECURITY - read before touching this file:
 * - This is the ONE place the API talks to LNbits. It uses the supplier
 *   wallet's INVOICE key from env (LNBITS_SUPPLIER_INVOICE_KEY), never
 *   from the request body and never logged. The invoice key can mint
 *   invoices and read the wallet, but it CANNOT pay: even if it leaks,
 *   it cannot drain the supplier wallet. The admin key is never used
 *   here and must never be put in this env var. Rotate quarterly.
 * - The request body carries NO secrets (the INV-8 preHandler in
 *   index.ts rejects bodies with secret keys). The key comes from env.
 * - The endpoint refuses the demo-block supplier (supplier-999) and any
 *   supplier not on the allowlist, and it validates amounts as integer
 *   sats in range. A bad invoice can never be minted through it.
 * - Idempotency: re-minting the same orderId with the same supplier and
 *   amount returns the original invoice, never a second one. Same
 *   orderId with different supplier/amount is a 400, not a second mint.
 */

import { buildLighnibMemo } from "@lighnib/shared";
import { bindings, recordBinding } from "./receipts";

/** Suppliers the mint endpoint serves, with the vendor name on the receipt. */
export const MINTABLE_SUPPLIERS: Record<string, string> = {
  "supplier-balogun-001": "Balogun provisions, Mama Nkechi",
  "supplier-001": "Mama Nkechi provisions",
  "supplier-002": "Balogun textiles",
};

/** Pilot per-order bounds, in sats. Max ≈ ₦2.8M at the demo rate. */
export const MIN_MINT_SATS = 1;
export const MAX_MINT_SATS = 3_333_333;

export interface MintRequest {
  supplierId: string;
  orderId: string;
  amountSats: number;
}

export interface MintResult {
  paymentRequest: string;
  paymentHash: string;
  supplierId: string;
  supplierName: string;
  orderId: string;
  amountSats: number;
  memo: string;
}

/** What LNbits returns for a created invoice (only the fields we use). */
export interface LnbitsInvoice {
  payment_request: string;
  payment_hash: string;
}

/** The LNbits call, injectable so tests can pass a fake. */
export type LnbitsMintFn = (args: {
  amountSats: number;
  memo: string;
}) => Promise<LnbitsInvoice>;

/** Real LNbits caller: POST /api/v1/payments with the supplier invoice key.
 * The invoice key mints invoices (out: false) but cannot pay, so this
 * caller can never move funds out of the supplier wallet. */
export function createLnbitsMintFn(
  lnbitsUrl: string,
  invoiceKey: string,
): LnbitsMintFn {
  const base = lnbitsUrl.replace(/\/$/, "");
  return async ({ amountSats, memo }) => {
    const res = await fetch(`${base}/api/v1/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": invoiceKey,
      },
      body: JSON.stringify({ out: false, amount: amountSats, memo }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      throw new Error(`LNbits mint failed: HTTP ${res.status}`);
    }
    const data = (await res.json()) as {
      payment_request?: unknown;
      payment_hash?: unknown;
    };
    if (
      typeof data.payment_request !== "string" ||
      typeof data.payment_hash !== "string"
    ) {
      throw new Error(
        "LNbits mint failed: missing payment_request/payment_hash",
      );
    }
    return {
      payment_request: data.payment_request,
      payment_hash: data.payment_hash,
    };
  };
}

const ORDER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

/** Minted invoices by orderId, for idempotency (same order → same invoice). */
const mintedByOrder = new Map<string, MintResult>();

function validateMintRequest(input: MintRequest): void {
  if (!input || typeof input !== "object") {
    throw new Error("Mint request must be an object");
  }
  if (typeof input.supplierId !== "string" || !MINTABLE_SUPPLIERS[input.supplierId]) {
    throw new Error(
      `Unknown or unmintable supplier: ${String(input.supplierId)}`,
    );
  }
  if (
    typeof input.orderId !== "string" ||
    !ORDER_ID_PATTERN.test(input.orderId)
  ) {
    throw new Error(
      "orderId must be 1-64 chars, letters/digits/_/- only, starting with a letter or digit",
    );
  }
  if (
    typeof input.amountSats !== "number" ||
    !Number.isInteger(input.amountSats) ||
    input.amountSats < MIN_MINT_SATS ||
    input.amountSats > MAX_MINT_SATS
  ) {
    throw new Error(
      `amountSats must be an integer between ${MIN_MINT_SATS} and ${MAX_MINT_SATS}`,
    );
  }
}

/**
 * Mint a supplier invoice in LNbits and record the INV-9 binding in one
 * step. Returns the invoice the merchant pays. Pure except for the
 * injected LNbits call and the binding registry.
 */
export async function mintInvoice(
  input: MintRequest,
  mintFn: LnbitsMintFn,
): Promise<MintResult> {
  validateMintRequest(input);
  const { supplierId, orderId, amountSats } = input;

  const existing = mintedByOrder.get(orderId);
  if (existing) {
    if (
      existing.supplierId !== supplierId ||
      existing.amountSats !== amountSats
    ) {
      throw new Error(
        `orderId ${orderId} was already minted with different supplier/amount`,
      );
    }
    return existing;
  }

  const supplierName = MINTABLE_SUPPLIERS[supplierId];
  const memo = buildLighnibMemo(orderId, supplierId);
  const lnbits = await mintFn({ amountSats, memo });

  const result: MintResult = {
    paymentRequest: lnbits.payment_request,
    paymentHash: lnbits.payment_hash,
    supplierId,
    supplierName,
    orderId,
    amountSats,
    memo,
  };
  // INV-9: the binding is recorded AT INVOICE CREATION, before any payment.
  // recordBinding throws if this hash is already bound; that surfaces as a
  // 400, and the invoice is not returned as mintable.
  recordBinding({
    paymentHash: result.paymentHash,
    supplierId,
    supplierName,
    orderId,
    amountSats,
    memo,
    createdAt: new Date().toISOString(),
  });
  mintedByOrder.set(orderId, result);
  return result;
}

/** Test helper: how many distinct orders have been minted in this process. */
export function mintedOrderCount(): number {
  return mintedByOrder.size;
}

/** Test helper: does the binding registry hold this hash. */
export function isHashBound(paymentHash: string): boolean {
  return bindings.get(paymentHash) !== undefined;
}
