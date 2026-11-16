/** Shared types for Lighnib. Single source of truth for web + api. */

export type Currency = "NGN" | "XOF";

/** Scope state machine — §4 of the BUILD-PROMPT. */
export type ScopeState =
  | "UNREGISTERED"
  | "LOGGED_IN"
  | "PAYING"
  | "RECEIPTED"
  | "DISPUTED"
  | "RESOLVED"
  | "REFUNDED"
  | "REVOKED";

/** A login scope: an NWC connection + its daily budget. */
export interface Scope {
  id: string;
  /** Wallet public key (identity). Never the NWC secret. */
  walletPubkey: string;
  state: ScopeState;
  dailyBudgetSats: number;
  spentTodaySats: number;
  currency: Currency;
  dailyBudgetFiat: number;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

/** A supplier invoice binding, recorded at invoice creation (INV-9). */
export interface InvoiceBinding {
  paymentHash: string;
  supplierId: string;
  supplierName: string;
  orderId: string;
  amountSats: number;
  memo: string;
  createdAt: string;
}

/** A bound receipt: proof of a settled payment (INV-5, INV-6). */
export interface BoundReceipt {
  id: string;
  orderId: string;
  supplierId: string;
  vendorName: string;
  purpose: string;
  amountSats: number;
  amountFiat: number;
  currency: Currency;
  paymentHash: string;
  preimage: string;
  settledAt: string;
  status: "SETTLED";
  /** Nostr NIP-44 event payload carrying the receipt (public, verifiable). */
  nostrEvent: {
    kind: number;
    pubkey: string;
    content: string;
  };
}

export type DisputeState = "OPEN" | "MEDIATOR_REVIEW" | "RELEASED" | "REFUNDED";

/** A dispute against a bound receipt (INV-7). Only the named mediator releases. */
export interface Dispute {
  id: string;
  receiptId: string;
  buyerPubkey: string;
  supplierId: string;
  mediator: string;
  state: DisputeState;
  openedAt: string;
  /** Hold-window deadline: decide within minutes (NIP-47 hold window). */
  deadlineAt: string;
  releasedTo: "buyer" | "supplier" | null;
  releasedAt: string | null;
}

/** Result of a budget check (INV-2). Wallet enforces; server re-checks. */
export interface BudgetCheck {
  allowed: boolean;
  reason?: "QUOTA_EXCEEDED" | "SCOPE_EXPIRED" | "SCOPE_REVOKED" | "SCOPE_NOT_LIVE";
  remainingSats: number;
}

/** Result of an INV-9 pre-payment binding check. */
export interface BindingCheck {
  allowed: boolean;
  reason?: "UNKNOWN_INVOICE_HASH" | "SUPPLIER_MISMATCH" | "AMOUNT_MISMATCH";
  binding?: InvoiceBinding;
}

/** NWC methods Lighnib is allowed to request — least privilege (INV-8). */
export const NWC_ALLOWED_METHODS = ["pay_invoice"] as const;
export type NwcMethod = (typeof NWC_ALLOWED_METHODS)[number];

/** Wallets that support NWC. Phoenix has NO NWC — never list it. */
export const SUPPORTED_WALLETS = [
  "Alby Hub (≥ v1.19.0)",
  "Zeus",
  "LNbits NWC",
  "Mutiny",
  "Coinos",
] as const;
