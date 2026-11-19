/**
 * config/locale.ts, THE SKIN.
 *
 * Everything user-facing (currency, language, mediator, demo numbers, copy)
 * lives here and nowhere else. Swap this one file to re-skin Lighnib for
 * another market (e.g. Senegal: currency XOF, French/Wolof, mediator
 * "Dakar market association"). The engine never hard-codes a currency,
 * a mediator, or a demo amount.
 *
 * Demo numbers are DEMO numbers. The BTC price below is a placeholder
 * rate for the demo only, never present it as a live market price.
 */

export const LOCALE = {
  /** Market skin in use. */
  market: "Lagos, Nigeria",
  currency: "NGN" as const,
  currencySymbol: "₦",
  currencyCode: "NGN",
  /** Display languages, in order of preference. */
  languages: ["Pidgin", "English"] as const,
  /** The ONE named mediator for this market. There is no mediator network. */
  mediator: "Lagos market association",
  mediatorShort: "Market association",

  /** Brand. */
  tagline: "Small Lightning payments, locked.",
  oneLiner: "Your wallet is the key. Lighnib it.",
  nameMeaning:
    "Lighnib, Pidgin 'hold am' (hold it). Hold budget (login) + hold funds (mediator).",

  /** Demo scope: the budget a login carries. */
  demoDailyBudgetNgn: 50_000,
  /** Demo over-budget invoice: the wallet must refuse this (QUOTA_EXCEEDED). */
  demoOverBudgetNgn: 70_000,
  /** Demo supplier invoice that goes through. */
  demoInvoiceNgn: 12_500,

  /**
   * Placeholder BTC price used ONLY for demo NGN↔sats display.
   * Not a live price. Live conversion must come from a rate source
   * (see packages/shared conversion helpers, which take the rate as input).
   */
  demoBtcPriceNgn: 150_000_000,

  /** NIP-47 hold window: disputes must be decided within minutes. */
  holdWindowMinutes: 10,
  /** Working-day session: NWC connections expire at end of day. */
  sessionExpiryHours: 8,

  /** Wallets that support NWC. Phoenix has NO NWC, never list it. */
  supportedWallets: [
    "Alby Hub (≥ v1.19.0)",
    "Zeus",
    "LNbits NWC",
    "Coinos",
    "Blitz",
    "Rizful",
  ] as const,

  /** Honest security line, verbatim in pitch + README. */
  honestLine:
    "Budget enforced by the wallet. Supplier enforced by the app + bound receipt. Mediator sees any mismatch.",

  copy: {
    loginTitle: "Log in with your wallet",
    loginBody:
      "No password, no form. Connect your Lightning wallet, the connection na the key, and e carry your spending scope.",
    scopeLabel: "Your daily scope",
    payTitle: "Pay supplier",
    payBody: "Pay invoice from your scoped connection. Every payment get bound receipt.",
    receiptTitle: "Receipt",
    receiptBody: "This receipt na proof of wetin you pay, who you pay, and why.",
    disputeTitle: "Open dispute",
    disputeBody:
      "Something wrong with this payment? Open dispute, the market association mediator go see the same receipt.",
    walletTitle: "Your wallet",
    revokeLabel: "Revoke login (logout)",
    revokeBody:
      "Revoke na logout. Once you revoke, spending die instantly, the connection no fit pay again.",
    overBudget:
      "This invoice pass your daily scope. Wallet go refuse am. Raise scope or split the order.",
    wrongSupplier:
      "This invoice no belong to any supplier for this portal. App refuse am before wallet even see am.",
    voiceLabel:
      "Spoken readout: English voice reading Pidgin text (Web Speech API). No dedicated Pidgin voice.",

    /** Pay-flow refusal messages, the exact words the merchant sees. */
    payInvalidInvoice:
      "Invoice no valid, check the invoice code from your supplier.",
    payAmountless:
      "This invoice get no amount, ask your supplier for one with amount.",
    payUnknownHash:
      "This invoice no dey recorded for any supplier for this portal. App refuse am before wallet see am.",
    paySupplierMismatch:
      "This invoice belong to another supplier, not the one you pick. App refuse am.",
    payScopeRevoked:
      "This login don revoke. Connect your wallet again to pay.",
    payScopeExpired:
      "This login don expire. Connect your wallet again to pay.",
    /** Over-budget refusal, with the live remaining shown. */
    payOverBudget: (remainingSats: number) =>
      `This invoice pass your daily scope. Wallet go refuse am. Remaining: ${remainingSats.toLocaleString()} sats. Raise scope or split the order.`,

    /** Plain-words scope states, never show the raw state code. */
    scopeStates: {
      UNREGISTERED: "Not logged in",
      LOGGED_IN: "Logged in",
      PAYING: "Paying…",
      RECEIPTED: "Receipt don land",
      DISPUTED: "Dispute open",
      RESOLVED: "Settled by mediator",
      REFUNDED: "Refunded",
      REVOKED: "Revoked",
    } as const,

    /** Third-party verify checklist, in plain words. */
    verifyCheckLabels: {
      settled: "Receipt na settled payment",
      complete: "Vendor, purpose and amount dey complete",
      hashFormat: "Payment hash na real hash",
      preimageFormat: "Preimage na real preimage",
      preimageMatchesHash: "Preimage hash to the payment hash (na real payment)",
      nostrEventMatches: "Public receipt record match the card (nobody tamper am)",
    } as const,
  },
} as const;

export type Locale = typeof LOCALE;

/** Senegal skin (config swap only, not built, not demoed). */
export const LOCALE_SENEGAL = {
  market: "Dakar, Senegal",
  currency: "XOF" as const,
  currencySymbol: "FCFA ",
  currencyCode: "XOF",
  languages: ["Wolof", "French"] as const,
  mediator: "Dakar market association",
  mediatorShort: "Market association",
} as const;
