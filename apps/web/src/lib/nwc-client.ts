/**
 * nwc-client.ts, client-side NWC calls (browser only).
 *
 * All NWC calls happen HERE, in the browser. The secret is handed to
 * @getalby/sdk's NWCClient from browser memory only (NwcSessionMemory.use)
 * and is never stored, logged, or sent to the API.
 *
 * Least privilege (INV-8): this module exposes payInvoice (spend) and
 * lookupInvoice (read-only status check for the reconcile path, no
 * funds movement). No balance reads, no transaction history, no
 * get_info - the wallet pubkey (identity) is parsed from the
 * connection URI itself.
 */

"use client";

import { NWCClient } from "@getalby/sdk";
import { nwcSession } from "./session";

/** Parse the wallet pubkey out of a `nostr+walletconnect://<pubkey>?…` URI. */
export function parseWalletPubkey(nwcUri: string): string | null {
  const m = /^nostr\+walletconnect:\/\/([0-9a-f]{64})/i.exec(nwcUri.trim());
  return m ? m[1].toLowerCase() : null;
}

export function isValidNwcUri(nwcUri: string): boolean {
  return parseWalletPubkey(nwcUri) !== null && nwcUri.includes("secret=");
}

export interface PayResult {
  preimage: string;
  feesPaidSats: number;
}

/**
 * Pay a BOLT11 invoice with the connected wallet.
 * Throws on wallet refusal (e.g. QUOTA_EXCEEDED, over budget).
 */
export async function payInvoice(invoice: string): Promise<PayResult> {
  return nwcSession.use(async (secret) => {
    // The NWCClient needs the full URI; the secret comes from memory only.
    // We rebuild the URI from the stored secret via the session holder.
    const uri = secret; // secret holds the full nostr+walletconnect:// URI
    const client = new NWCClient({ nostrWalletConnectUrl: uri });
    try {
      const res = (await client.payInvoice({ invoice })) as {
        preimage?: string;
        fees_paid?: number;
      };
      if (!res.preimage) {
        throw new Error("Wallet did not return a preimage, payment not settled");
      }
      return { preimage: res.preimage, feesPaidSats: res.fees_paid ?? 0 };
    } finally {
      (client as unknown as { close?: () => void }).close?.();
    }
  });
}

export interface LookupResult {
  state: "settled" | "pending" | "failed" | "accepted";
  preimage: string;
  settledAt: number;
  amountSats: number;
}

/**
 * Look up an invoice by payment hash, read-only. Used only by the
 * reconcile path after an uncertain payment: it asks the WALLET
 * whether the payment settled, independent of what the app recorded.
 * Throws when the wallet does not support lookup_invoice.
 */
export async function lookupInvoice(paymentHash: string): Promise<LookupResult> {
  return nwcSession.use(async (secret) => {
    const client = new NWCClient({ nostrWalletConnectUrl: secret });
    try {
      const tx = await client.lookupInvoice({ payment_hash: paymentHash });
      return {
        state: tx.state,
        preimage: tx.preimage ?? "",
        settledAt: tx.settled_at ?? 0,
        amountSats: tx.amount ?? 0,
      };
    } finally {
      (client as unknown as { close?: () => void }).close?.();
    }
  });
}

/**
 * Store a pasted NWC connection URI in browser memory only.
 * The full URI (including the secret) is the bearer token, it is kept
 * in the NwcSessionMemory holder and nowhere else.
 */
export function connectWallet(nwcUri: string, ttlMs: number): string {
  const pubkey = parseWalletPubkey(nwcUri);
  if (!pubkey) throw new Error("That no be valid wallet connection code.");
  nwcSession.set(nwcUri.trim(), ttlMs);
  return pubkey;
}
