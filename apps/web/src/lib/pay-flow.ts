/**
 * pay-flow.ts — the /pay orchestration, extracted from the page so it can
 * be tested without a browser and driven live by scripts/e2e-live.mts.
 *
 * Order of checks (before ANY wallet request) — this order is the product:
 *   1. Decode BOLT11 → payment hash + amount + memo.
 *   2. INV-9: hash↔supplier binding must exist and match (app-side).
 *   3. INV-2: scope budget re-check (wallet is the primary enforcer).
 * Only then is the wallet asked to pay. On settlement a bound receipt is
 * created (INV-5/INV-6) and explained + spoken.
 *
 * On a wallet refusal (e.g. QUOTA_EXCEEDED) the scope is returned to
 * LOGGED_IN via cancelPayment and NO receipt is created.
 *
 * The caller passes the real api client + the real browser-side payInvoice
 * in production; tests pass stubs. Nothing in here touches the NWC secret
 * — payInvoiceFn is the only function that ever sees an invoice payment,
 * and it runs client-side (INV-8).
 */

import type { BoundReceipt, Scope } from "@lighnib/shared";
import { LOCALE, remainingBudgetSats } from "@lighnib/shared";

/** Map a budget-check reason code to the plain-words refusal a merchant sees. */
export function budgetRefusalMessage(reason: string | undefined, remainingSats: number): string {
  if (reason === "SCOPE_REVOKED") return LOCALE.copy.payScopeRevoked;
  if (reason === "SCOPE_EXPIRED" || reason === "SCOPE_NOT_LIVE")
    return LOCALE.copy.payScopeExpired;
  return LOCALE.copy.payOverBudget(remainingSats);
}

export interface PayFlowApi {
  decodeInvoice: (invoice: string) => Promise<{
    valid: boolean;
    amountSats?: number | null;
    paymentHash?: string;
    description?: string | null;
    memo?: { orderId: string; supplierId: string } | null;
  }>;
  checkBinding: (
    paymentHash: string,
    supplierId?: string,
    amountSats?: number,
  ) => Promise<{ allowed: boolean; reason?: string }>;
  checkSpend: (
    scopeId: string,
    amountSats: number,
  ) => Promise<{ allowed: boolean; reason?: string; remainingSats: number }>;
  beginPayment: (scopeId: string, amountSats: number) => Promise<Scope>;
  settlePayment: (scopeId: string, amountSats: number) => Promise<Scope>;
  cancelPayment: (scopeId: string) => Promise<Scope>;
  createReceipt: (input: Record<string, unknown>) => Promise<BoundReceipt>;
  explainReceipt: (
    receiptId: string,
  ) => Promise<{ text: string; source: "llm" | "template" }>;
}

export interface PayFlowInput {
  scope: Scope;
  walletPubkey: string;
  supplierId: string;
  supplierName: string;
  invoice: string;
}

export interface PayFlowResult {
  receipt: BoundReceipt;
  explanation: string;
  explanationSource: "llm" | "template";
  /** Scope after settlement (spent updated) — the page stores this. */
  scope: Scope;
}

export async function runPayFlow(
  api: PayFlowApi,
  payInvoiceFn: (invoice: string) => Promise<{ preimage: string }>,
  speakFn: (text: string) => void,
  input: PayFlowInput,
): Promise<PayFlowResult> {
  const { scope, walletPubkey, supplierId, supplierName, invoice } = input;
  const trimmed = invoice.trim();

  // 1. Decode the invoice.
  const decoded = await api.decodeInvoice(trimmed);
  if (!decoded.valid || !decoded.paymentHash) {
    throw new Error(LOCALE.copy.payInvalidInvoice);
  }
  const amountSats = decoded.amountSats ?? 0;
  if (amountSats <= 0) {
    throw new Error(LOCALE.copy.payAmountless);
  }

  // 2. INV-9 — before ANY wallet request.
  const binding = await api.checkBinding(decoded.paymentHash, supplierId, amountSats);
  if (!binding.allowed) {
    if (binding.reason === "UNKNOWN_INVOICE_HASH") {
      throw new Error(LOCALE.copy.payUnknownHash);
    }
    throw new Error(LOCALE.copy.paySupplierMismatch);
  }

  // 3. INV-2 budget re-check (wallet is the primary enforcer).
  const check = await api.checkSpend(scope.id, amountSats);
  if (!check.allowed) {
    throw new Error(budgetRefusalMessage(check.reason, check.remainingSats));
  }

  // 4. Wallet pays (browser-side NWC, pay_invoice only).
  await api.beginPayment(scope.id, amountSats);
  let preimage: string;
  try {
    const res = await payInvoiceFn(trimmed);
    preimage = res.preimage;
  } catch (e) {
    await api.cancelPayment(scope.id);
    // A wallet quota refusal is the same plain-words message as the
    // app-side budget check — never surface the raw error code.
    const msg = (e as Error).message ?? "";
    const code = (e as { code?: string }).code ?? "";
    if (/QUOTA_EXCEEDED/i.test(code) || /spending quota/i.test(msg)) {
      throw new Error(
        LOCALE.copy.payOverBudget(remainingBudgetSats(scope)),
      );
    }
    throw e;
  }

  // 5. Settlement → bound receipt (INV-5/INV-6).
  const settledScope = await api.settlePayment(scope.id, amountSats);
  const receipt = await api.createReceipt({
    id: `rcpt_${Date.now().toString(36)}`,
    orderId: decoded.memo?.orderId ?? "unknown",
    supplierId,
    vendorName: supplierName,
    purpose: decoded.description ?? "supplier order",
    amountSats,
    amountFiat: 0,
    currency: LOCALE.currency,
    paymentHash: decoded.paymentHash,
    preimage,
    payerPubkey: walletPubkey,
  });

  // 6. AI explainer + spoken readout.
  const expl = await api.explainReceipt(receipt.id);
  speakFn(expl.text);

  return {
    receipt,
    explanation: expl.text,
    explanationSource: expl.source,
    scope: settledScope,
  };
}
