"use client";

import { useEffect, useState } from "react";
import { LOCALE } from "@lighnib/shared";
import { api } from "@/lib/api";
import type { BoundReceipt } from "@lighnib/shared";

/** /receipts — verifiable bound receipt cards (INV-5, INV-6). */
export default function ReceiptsPage() {
  const [receipts, setReceipts] = useState<BoundReceipt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState<Record<string, boolean>>({});

  useEffect(() => {
    api.listReceipts().then(setReceipts).catch((e) => setError((e as Error).message));
  }, []);

  async function verify(id: string) {
    const res = await api.verifyReceipt(id);
    setVerified((v) => ({ ...v, [id]: res.valid }));
  }

  return (
    <>
      <h1>{LOCALE.copy.receiptTitle}</h1>
      <p>{LOCALE.copy.receiptBody}</p>
      {error && <div className="error">{error}</div>}
      {receipts.length === 0 && (
        <p className="small">No receipts yet. Pay a supplier invoice first.</p>
      )}
      {receipts.map((r) => (
        <div className="card" key={r.id}>
          <span className="tag">BOUND RECEIPT · VERIFIED CARD</span>
          <h2>
            {r.vendorName} — {r.amountSats.toLocaleString()} sats
          </h2>
          <p>
            {LOCALE.currencySymbol}
            {r.amountFiat.toLocaleString()} · {r.purpose}
          </p>
          <p className="small">Order: {r.orderId} · Supplier: {r.supplierId}</p>
          <p className="small mono">hash: {r.paymentHash}</p>
          <p className="small mono">preimage: {r.preimage.slice(0, 24)}…</p>
          <p className="small">Settled: {new Date(r.settledAt).toLocaleString()}</p>
          {verified[r.id] === true && (
            <div className="ok">Verified: preimage match payment hash. Na real payment.</div>
          )}
          {verified[r.id] === false && (
            <div className="error">Verification fail — no trust this receipt.</div>
          )}
          <button className="secondary" onClick={() => verify(r.id)}>
            Verify receipt
          </button>
          <a href={`/dispute?receipt=${r.id}`}>
            <button className="secondary">Open dispute</button>
          </a>
        </div>
      ))}
    </>
  );
}
