"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LOCALE } from "@lighnib/shared";
import { api } from "@/lib/api";
import type { BoundReceipt, Dispute } from "@lighnib/shared";
import { getSession } from "@/lib/session";

/**
 * /dispute — open a dispute against a bound receipt (INV-7).
 * Disputes decide within the NIP-47 hold window (10 min demo).
 * Only the named mediator ({LOCALE.mediator}) releases, and only to a
 * party named in the receipt. Past the deadline: auto-refund to buyer.
 */
function DisputeInner() {
  const params = useSearchParams();
  const preselected = params.get("receipt") ?? "";
  const [receipts, setReceipts] = useState<BoundReceipt[]>([]);
  const [receiptId, setReceiptId] = useState(preselected);
  const [dispute, setDispute] = useState<Dispute | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.listReceipts().then(setReceipts).catch(() => undefined);
  }, []);

  async function open() {
    setError(null);
    if (!receiptId) {
      setError("Pick a receipt first.");
      return;
    }
    const session = getSession();
    if (!session.walletPubkey) {
      setError("Log in first — dispute need your wallet identity.");
      return;
    }
    setBusy(true);
    try {
      const d = await api.openDispute(receiptId, session.walletPubkey);
      setDispute(d);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function timeoutCheck() {
    if (!dispute) return;
    const d = await api.timeoutCheckDispute(dispute.id);
    setDispute(d);
  }

  return (
    <>
      <h1>{LOCALE.copy.disputeTitle}</h1>
      <p>{LOCALE.copy.disputeBody}</p>
      <p className="small">
        Mediator: <strong>{LOCALE.mediator}</strong> · Hold window:{" "}
        {LOCALE.holdWindowMinutes} minutes — dispute must decide inside am.
        Production dispute (hours/days) na next iteration.
      </p>

      <div className="card">
        <label htmlFor="receipt">Bound receipt</label>
        <select
          id="receipt"
          value={receiptId}
          onChange={(e) => setReceiptId(e.target.value)}
        >
          <option value="">— pick a receipt —</option>
          {receipts.map((r) => (
            <option key={r.id} value={r.id}>
              {r.id} — {r.vendorName} — {r.amountSats.toLocaleString()} sats
            </option>
          ))}
        </select>
        <button onClick={open} disabled={busy || !receiptId}>
          {busy ? "Opening…" : "Open dispute"}
        </button>
        {error && <div className="error">{error}</div>}
      </div>

      {dispute && (
        <div className="card">
          <span className="tag">DISPUTE {dispute.state}</span>
          <h2>Dispute {dispute.id}</h2>
          <p className="small">Receipt: {dispute.receiptId}</p>
          <p className="small">Mediator: {dispute.mediator}</p>
          <p className="small">
            Opened: {new Date(dispute.openedAt).toLocaleString()}
          </p>
          <p className="small">
            Deadline (hold window): {new Date(dispute.deadlineAt).toLocaleString()}
          </p>
          {dispute.releasedTo && (
            <p className="small">Released to: {dispute.releasedTo}</p>
          )}
          <p className="small">
            Mediator release happens on the mediator view (demo: mediator
            releases via the API). If deadline pass, funds auto-refund to
            buyer.
          </p>
          <button className="secondary" onClick={timeoutCheck}>
            Check timeout (auto-refund?)
          </button>
        </div>
      )}
    </>
  );
}

export default function DisputePage() {
  return (
    <Suspense>
      <DisputeInner />
    </Suspense>
  );
}
