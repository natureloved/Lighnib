"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LOCALE, verifyReceiptDetail, type ReceiptVerificationDetail } from "@lighnib/shared";
import { api } from "@/lib/api";
import { speak, stopSpeaking, VOICE_LABEL } from "@/lib/voice";
import type { BoundReceipt } from "@lighnib/shared";

/** The six per-check keys — `valid` is the aggregate, not a checklist item. */
type CheckKey = Exclude<keyof ReceiptVerificationDetail, "valid">;
const CHECK_LABELS: { key: CheckKey; label: string }[] = (
  Object.keys(LOCALE.copy.verifyCheckLabels) as CheckKey[]
).map((key) => ({ key, label: LOCALE.copy.verifyCheckLabels[key] }));

function CheckList({ checks }: { checks: ReceiptVerificationDetail }) {
  return (
    <ul>
      {CHECK_LABELS.map(({ key, label }) => (
        <li key={key}>
          {checks[key] ? "✓" : "✗"} {label}
        </li>
      ))}
    </ul>
  );
}

/** /receipts — verifiable bound receipt cards (INV-5, INV-6) + third-party verify. */
export default function ReceiptsPage() {
  const router = useRouter();
  const [receipts, setReceipts] = useState<BoundReceipt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState<Record<string, boolean>>({});
  const [explanations, setExplanations] = useState<
    Record<string, { text: string; source: "llm" | "template" }>
  >({});
  const [copied, setCopied] = useState<string | null>(null);

  // Third-party verify: paste a receipt JSON, verify it in THIS browser
  // (no trust in our API) and cross-check it against the API.
  const [pasted, setPasted] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [pasteChecks, setPasteChecks] = useState<ReceiptVerificationDetail | null>(null);
  const [pasteServer, setPasteServer] = useState<boolean | null>(null);

  useEffect(() => {
    api.listReceipts().then(setReceipts).catch((e) => setError((e as Error).message));
  }, []);

  async function verify(id: string) {
    const res = await api.verifyReceipt(id);
    setVerified((v) => ({ ...v, [id]: res.valid }));
  }

  async function explain(id: string) {
    const res = await api.explainReceipt(id);
    setExplanations((e) => ({ ...e, [id]: res }));
  }

  async function copyReceipt(r: BoundReceipt) {
    try {
      await navigator.clipboard.writeText(JSON.stringify(r, null, 2));
      setCopied(r.id);
    } catch {
      setError("Clipboard blocked — copy the receipt from the page instead.");
    }
  }

  async function verifyPasted() {
    setPasteError(null);
    setPasteChecks(null);
    setPasteServer(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(pasted);
    } catch {
      setPasteError("That no be valid JSON. Paste the receipt JSON as copied from the card.");
      return;
    }
    // Client-side: runs in the verifier's browser, no trust in our API.
    try {
      setPasteChecks(verifyReceiptDetail(parsed as BoundReceipt));
    } catch {
      setPasteError("That JSON no be a bound receipt — e no get the fields we need.");
      return;
    }
    // Server cross-check: same checks, no stored state.
    try {
      const res = await api.verifyPasted(parsed);
      setPasteServer(res.valid);
    } catch {
      setPasteServer(null);
    }
  }

  return (
    <>
      <h1>{LOCALE.copy.receiptTitle}</h1>
      <p>{LOCALE.copy.receiptBody}</p>
      {error && <div className="error">{error}</div>}

      <div className="card">
        <span className="tag">THIRD-PARTY VERIFY</span>
        <h2>Verify a receipt you receive</h2>
        <p className="small">
          Paste the receipt JSON (copy am from the card below, or from the
          merchant phone). The check runs inside your own browser — you no
          need trust our server — and we cross-check am against the API too.
          Na the preimage be the proof: e must hash to the payment hash.
        </p>
        <label htmlFor="pasted-receipt">Receipt JSON</label>
        <textarea
          id="pasted-receipt"
          rows={4}
          placeholder='{"id": "rcpt_…", "paymentHash": "…", "preimage": "…", …}'
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
        />
        <button onClick={verifyPasted}>Verify pasted receipt</button>
        {pasteError && <div className="error">{pasteError}</div>}
        {pasteChecks && (
          <div className={pasteChecks.valid ? "ok" : "error"}>
            <p>
              <strong>
                {pasteChecks.valid
                  ? "Receipt valid — na real, settled payment."
                  : "Receipt INVALID — no trust am."}
              </strong>
            </p>
            <CheckList checks={pasteChecks} />
            {pasteServer === true && (
              <p className="small">Server cross-check agree: valid.</p>
            )}
            {pasteServer === false && (
              <p className="small">Server cross-check disagree: invalid.</p>
            )}
            {pasteServer === null && (
              <p className="small">Server cross-check unavailable — browser check stand alone.</p>
            )}
          </div>
        )}
      </div>

      {receipts.length === 0 && (
        <p className="small">
          No receipts yet. Pay a supplier invoice first — or run the demo
          seed: <span className="mono">npm run seed</span>, then refresh.
        </p>
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
          <button className="secondary" onClick={() => copyReceipt(r)}>
            {copied === r.id ? "Copied!" : "Copy receipt JSON"}
          </button>
          {explanations[r.id] ? (
            <>
              <p>{explanations[r.id].text}</p>
              <p className="small">
                Explainer:{" "}
                {explanations[r.id].source === "llm"
                  ? "AI (LLM)"
                  : "Template fallback — no LLM key set"}
              </p>
              <p className="small">{VOICE_LABEL}</p>
              <button
                className="secondary"
                onClick={() => speak(explanations[r.id].text)}
              >
                Replay readout
              </button>
              <button className="secondary" onClick={stopSpeaking}>
                Mute
              </button>
            </>
          ) : (
            <button className="secondary" onClick={() => explain(r.id)}>
              Explain this receipt
            </button>
          )}
          <button
            className="secondary"
            onClick={() => router.push(`/dispute?receipt=${r.id}`)}
          >
            Open dispute
          </button>
        </div>
      ))}
    </>
  );
}
