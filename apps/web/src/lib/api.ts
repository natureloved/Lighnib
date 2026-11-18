/**
 * api.ts, typed fetch helpers for the Lighnib API.
 * The API holds no funds and never sees the NWC secret; these calls
 * carry public data only (pubkeys, hashes, amounts).
 */

import type { BoundReceipt, Dispute, Scope } from "@lighnib/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  // Fastify rejects a POST with `Content-Type: application/json` and an
  // empty body (FST_ERR_CTP_EMPTY_JSON_BODY). Body-less POSTs (explain,
  // cancel, revoke, timeout-check) therefore send an empty JSON object.
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    ...(init?.body === undefined && init?.method === "POST" ? { body: "{}" } : {}),
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `API error ${res.status}`);
  return body as T;
}

export const api = {
  health: () => req<{ ok: boolean }>("/health"),
  nwcInfo: () => req<{ supportedWallets: string[]; allowedMethods: string[] }>("/api/nwc/info"),

  login: (input: {
    walletPubkey: string;
    dailyBudgetSats: number;
    dailyBudgetFiat: number;
    currency: "NGN" | "XOF";
    sessionHours: number;
  }) => req<Scope>("/api/scope/login", { method: "POST", body: JSON.stringify(input) }),

  getScope: (id: string) => req<Scope>(`/api/scope/${id}`),
  checkSpend: (id: string, amountSats: number) =>
    req<{ allowed: boolean; reason?: string; remainingSats: number }>(
      `/api/scope/${id}/check`,
      { method: "POST", body: JSON.stringify({ amountSats }) },
    ),
  beginPayment: (id: string, amountSats: number) =>
    req<Scope>(`/api/scope/${id}/begin-payment`, {
      method: "POST",
      body: JSON.stringify({ amountSats }),
    }),
  settlePayment: (id: string, amountSats: number) =>
    req<Scope>(`/api/scope/${id}/settle-payment`, {
      method: "POST",
      body: JSON.stringify({ amountSats }),
    }),
  cancelPayment: (id: string) =>
    req<Scope>(`/api/scope/${id}/cancel-payment`, { method: "POST" }),
  revokeScope: (id: string) =>
    req<Scope>(`/api/scope/${id}/revoke`, { method: "POST" }),

  decodeInvoice: (invoice: string) =>
    req<{
      valid: boolean;
      amountSats?: number | null;
      paymentHash?: string;
      description?: string | null;
      memo?: { orderId: string; supplierId: string } | null;
    }>("/api/invoices/decode", { method: "POST", body: JSON.stringify({ invoice }) }),

  checkBinding: (paymentHash: string, supplierId?: string, amountSats?: number) =>
    req<{ allowed: boolean; reason?: string }>(`/api/invoices/check`, {
      method: "POST",
      body: JSON.stringify({ paymentHash, supplierId, amountSats }),
    }),

  recordBinding: (input: {
    paymentHash: string;
    supplierId: string;
    orderId: string;
    amountSats: number;
    memo: string;
  }) =>
    req<{ paymentHash: string; supplierId: string; orderId: string; amountSats: number; memo: string }>(
      `/api/invoices`,
      { method: "POST", body: JSON.stringify(input) },
    ),

  createReceipt: (input: Record<string, unknown>) =>
    req<BoundReceipt>("/api/receipts", { method: "POST", body: JSON.stringify(input) }),
  listReceipts: () => req<BoundReceipt[]>("/api/receipts"),
  verifyReceipt: (id: string) =>
    req<{ exists: boolean; valid: boolean }>(`/api/receipts/${id}/verify`),
  verifyPasted: (receipt: unknown) =>
    req<{
      valid: boolean;
      checks: {
        valid: boolean;
        settled: boolean;
        complete: boolean;
        hashFormat: boolean;
        preimageFormat: boolean;
        preimageMatchesHash: boolean;
        nostrEventMatches: boolean;
      } | null;
      reason?: string;
    }>("/api/receipts/verify-pasted", {
      method: "POST",
      body: JSON.stringify(receipt),
    }),

  explainReceipt: (receiptId: string) =>
    req<{ text: string; source: "llm" | "template" }>(`/api/explainer/${receiptId}`, {
      method: "POST",
    }),

  openDispute: (receiptId: string, buyerPubkey: string) =>
    req<Dispute>("/api/disputes", {
      method: "POST",
      body: JSON.stringify({ receiptId, buyerPubkey }),
    }),
  listDisputes: () => req<Dispute[]>("/api/disputes"),
  releaseDispute: (id: string, mediator: string, to: "buyer" | "supplier") =>
    req<Dispute>(`/api/disputes/${id}/release`, {
      method: "POST",
      body: JSON.stringify({ mediator, to }),
    }),
  timeoutCheckDispute: (id: string) =>
    req<Dispute>(`/api/disputes/${id}/timeout-check`, { method: "POST" }),

  convert: (params: { ngn?: number; sats?: number; btcPrice?: number }) => {
    const q = new URLSearchParams();
    if (params.ngn !== undefined) q.set("ngn", String(params.ngn));
    if (params.sats !== undefined) q.set("sats", String(params.sats));
    if (params.btcPrice !== undefined) q.set("btcPrice", String(params.btcPrice));
    return req<{ sats?: number; fiat?: number; currency?: string }>(`/api/convert?${q}`);
  },
};
