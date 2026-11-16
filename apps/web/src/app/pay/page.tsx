"use client";

import { useEffect, useState } from "react";
import { LOCALE } from "@lighnib/shared";
import { api } from "@/lib/api";
import { payInvoice } from "@/lib/nwc-client";
import { runPayFlow } from "@/lib/pay-flow";
import { getSession, setSession, subscribeSession } from "@/lib/session";
import { speak, stopSpeaking, VOICE_LABEL } from "@/lib/voice";

/**
 * /pay — supplier invoice pay flow with scope remaining.
 * The orchestration lives in lib/pay-flow.ts (decode → INV-9 → INV-2 →
 * wallet pay → bound receipt → explainer → speak). This page is UI only.
 */

const SUPPLIERS: { id: string; label: string; vendorName: string }[] = [
  {
    id: "supplier-balogun-001",
    label: "supplier-balogun-001 — Balogun provisions, Mama Nkechi (seeded demo supplier)",
    vendorName: "Balogun provisions — Mama Nkechi",
  },
  { id: "supplier-001", label: "supplier-001 — Mama Nkechi provisions", vendorName: "Mama Nkechi provisions" },
  { id: "supplier-002", label: "supplier-002 — Balogun textiles", vendorName: "Balogun textiles" },
  {
    id: "supplier-999",
    label: "supplier-999 — NOT on the allowlist (demo block)",
    vendorName: "Unknown supplier",
  },
];

export default function PayPage() {
  const [invoice, setInvoice] = useState("");
  const [supplierId, setSupplierId] = useState("supplier-balogun-001");
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
      const supplier = SUPPLIERS.find((s) => s.id === supplierId) ?? SUPPLIERS[0];
      setStatus("Wallet dey pay…");
      const result = await runPayFlow(api, payInvoice, speak, {
        scope,
        walletPubkey: session.walletPubkey ?? "",
        supplierId,
        supplierName: supplier.vendorName,
        invoice: invoice.trim(),
      });
      // Keep the session scope fresh: the settled scope carries spentToday.
      setSession({ scope: result.scope });
      setReceipt(result.receipt);
      setExplanation(result.explanation);
      setStatus("Payment settled — receipt don land.");
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
          {SUPPLIERS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
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
