"use client";

import { useEffect, useState } from "react";
import { LOCALE } from "@lighnib/shared";
import { api } from "@/lib/api";
import { payInvoice } from "@/lib/nwc-client";
import { getSession, subscribeSession } from "@/lib/session";
import { speak, stopSpeaking, VOICE_LABEL } from "@/lib/voice";

/**
 * /pay — supplier invoice pay flow with scope remaining.
 * Order of checks (before any wallet request):
 *   1. Decode BOLT11 → payment hash + amount + memo.
 *   2. INV-9: hash↔supplier binding must exist and match.
 *   3. INV-2: scope budget re-check (wallet enforces, server re-checks).
 * Only then is the wallet asked to pay. On settlement a bound receipt
 * is created (INV-5/INV-6) and explained + spoken.
 */
export default function PayPage() {
  const [invoice, setInvoice] = useState("");
  const [supplierId, setSupplierId] = useState("supplier-001");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Awaited<ReturnType<typeof api.createReceipt>> | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [session, setSessionState] = useState(getSession());

  useEffect(() => subscribeSession(() => setSessionState(getSession())), []);

  const scope = session.scope;

  async function pay() {
    setError(null);
    setStatus(null);
    setReceipt(null);
    setExplanation(null);
    if (!scope) {
      setError("Log in first — connect your wallet on the Login page.");
      return;
    }
    if (!invoice.trim()) {
      setError("Paste the supplier invoice (BOLT11).");
      return;
    }
    setBusy(true);
    try {
      // 1. Decode the invoice.
      const decoded = await api.decodeInvoice(invoice.trim());
      if (!decoded.valid || !decoded.paymentHash) {
        throw new Error("Invoice no valid — check the BOLT11 string.");
      }
      const amountSats = decoded.amountSats ?? 0;
      if (amountSats <= 0) throw new Error("Amountless invoices no dey supported for demo.");

      // 2. INV-9 — before ANY wallet request.
      const binding = await api.checkBinding(decoded.paymentHash, supplierId, amountSats);
      if (!binding.allowed) {
        if (binding.reason === "UNKNOWN_INVOICE_HASH") {
          throw new Error(
            "INV-9: this invoice hash no dey recorded for any supplier. App refuse am before wallet see am.",
          );
        }
        throw new Error(`INV-9: payment refused — ${binding.reason}.`);
      }

      // 3. INV-2 budget re-check (wallet is the primary enforcer).
      const check = await api.checkSpend(scope.id, amountSats);
      if (!check.allowed) {
        throw new Error(
          `Over budget: ${check.reason}. Remaining ${check.remainingSats.toLocaleString()} sats.`,
        );
      }

      // 4. Wallet pays (browser-side NWC, pay_invoice only).
      setStatus("Wallet dey pay…");
      await api.beginPayment(scope.id, amountSats);
      let preimage: string;
      try {
        const res = await payInvoice(invoice.trim());
        preimage = res.preimage;
      } catch (e) {
        await api.cancelPayment(scope.id);
        throw e;
      }

      // 5. Settlement → bound receipt (INV-5/INV-6).
      await api.settlePayment(scope.id, amountSats);
      const created = await api.createReceipt({
        id: `rcpt_${Date.now().toString(36)}`,
        orderId: decoded.memo?.orderId ?? "unknown",
        supplierId,
        vendorName: "Supplier " + supplierId,
        purpose: decoded.description ?? "supplier order",
        amountSats,
        amountFiat: 0,
        currency: LOCALE.currency,
        paymentHash: decoded.paymentHash,
        preimage,
        payerPubkey: session.walletPubkey ?? "",
      });
      setReceipt(created);
      setStatus("Payment settled — receipt don land.");

      // 6. AI explainer + spoken readout.
      const expl = await api.explainReceipt(created.id);
      setExplanation(expl.text);
      speak(expl.text);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>{LOCALE.copy.payTitle}</h1>
      <p>{LOCALE.copy.payBody}</p>

      {!scope && (
        <div className="error">
          You never log in. <a href="/login">Connect your wallet first</a>.
        </div>
      )}
      {scope && (
        <div className="card">
          <p className="small">
            Scope remaining:{" "}
            <strong>
              {(scope.dailyBudgetSats - scope.spentTodaySats).toLocaleString()} sats
            </strong>{" "}
            of {scope.dailyBudgetSats.toLocaleString()} sats/day
          </p>
        </div>
      )}

      <div className="card">
        <label htmlFor="supplier">Supplier</label>
        <select
          id="supplier"
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
        >
          <option value="supplier-001">supplier-001 — Mama Nkechi provisions</option>
          <option value="supplier-002">supplier-002 — Balogun textiles</option>
          <option value="supplier-999">supplier-999 — NOT on the allowlist (demo block)</option>
        </select>

        <label htmlFor="invoice">Supplier invoice (BOLT11)</label>
        <textarea
          id="invoice"
          rows={3}
          placeholder="lnbc…"
          value={invoice}
          onChange={(e) => setInvoice(e.target.value)}
        />
        <p className="small">
          App go decode am, check the hash against the supplier allowlist
          (INV-9), check your scope (INV-2) — before wallet ever see am.
        </p>
        <button onClick={pay} disabled={busy || !scope}>
          {busy ? "Paying…" : "Pay invoice"}
        </button>
        {status && <div className="ok">{status}</div>}
        {error && <div className="error">{error}</div>}
      </div>

      {receipt && (
        <div className="card">
          <span className="tag">BOUND RECEIPT</span>
          <h2>
            {receipt.vendorName} — {receipt.amountSats.toLocaleString()} sats
          </h2>
          <p className="small">Purpose: {receipt.purpose}</p>
          <p className="small mono">hash: {receipt.paymentHash}</p>
          <p className="small mono">preimage: {receipt.preimage.slice(0, 24)}…</p>
          <p className="small">Settled: {receipt.settledAt}</p>
          {explanation && (
            <>
              <p>{explanation}</p>
              <p className="small">{VOICE_LABEL}</p>
              <button className="secondary" onClick={() => explanation && speak(explanation)}>
                Replay readout
              </button>
              <button className="secondary" onClick={stopSpeaking}>
                Mute
              </button>
            </>
          )}
          <a href="/receipts">
            <button className="secondary">See all receipts</button>
          </a>
        </div>
      )}
    </>
  );
}
