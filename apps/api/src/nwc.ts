/**
 * nwc.ts, NWC capability info for the API.
 *
 * The API NEVER sees the NWC secret: all NWC calls happen client-side
 * in the browser (see apps/web/src/lib/nwc-client.ts). This module only
 * publishes what the API is allowed to know: supported wallets, the
 * least-privilege method list (pay_invoice only), and scope validation.
 * A request carrying a secret is rejected by the guard in index.ts (INV-8).
 */

import { NWC_ALLOWED_METHODS, SUPPORTED_WALLETS } from "@lighnib/shared";

export const NWC_INFO = {
  /** Least privilege: the connection may ONLY pay invoices (INV-8). */
  allowedMethods: [...NWC_ALLOWED_METHODS],
  /** Wallets that support NWC. Phoenix has NO NWC, never list it. */
  supportedWallets: [...SUPPORTED_WALLETS],
  /** NIP-47 hold invoices live in the extensions repo (Aug 2026), check via get_info. */
  holdInvoiceNote:
    "Hold invoices are an NWC extension: check wallet support via get_info. " +
    "Demo disputes settle/cancel within minutes (hold window).",
  /** What the API will never accept. */
  neverAccepted: [
    "NWC secret / connection URI",
    "private keys",
    "wallet credentials",
  ],
  budgetEnforcement:
    "Budget is enforced WALLET-side (NWC quota, QUOTA_EXCEEDED). " +
    "The API re-checks the scope from public data only.",
  supplierEnforcement:
    "Supplier allowlist is enforced APP-side via INV-9 (hash↔supplierId " +
    "recorded pre-payment, checked pre-request). The wallet has no payee field.",
} as const;

export interface ScopeRequest {
  walletPubkey: string;
  dailyBudgetSats: number;
  dailyBudgetFiat: number;
  currency: "NGN" | "XOF";
  sessionHours: number;
}

/** Validate a scope-creation request (public data only, no secret field exists). */
export function validateScopeRequest(body: unknown): ScopeRequest {
  if (body === null || typeof body !== "object") {
    throw new Error("Scope request must be an object");
  }
  const b = body as Record<string, unknown>;
  if (typeof b.walletPubkey !== "string" || !/^[0-9a-f]{64}$/i.test(b.walletPubkey)) {
    throw new Error("walletPubkey must be a 64-hex-char public key");
  }
  if (typeof b.dailyBudgetSats !== "number" || b.dailyBudgetSats <= 0) {
    throw new Error("dailyBudgetSats must be a positive number");
  }
  if (typeof b.dailyBudgetFiat !== "number" || b.dailyBudgetFiat <= 0) {
    throw new Error("dailyBudgetFiat must be a positive number");
  }
  if (b.currency !== "NGN" && b.currency !== "XOF") {
    throw new Error("currency must be NGN or XOF");
  }
  if (typeof b.sessionHours !== "number" || b.sessionHours <= 0 || b.sessionHours > 24) {
    throw new Error("sessionHours must be between 0 and 24");
  }
  return b as unknown as ScopeRequest;
}
