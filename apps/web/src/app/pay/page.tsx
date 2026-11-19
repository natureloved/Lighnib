"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LOCALE } from "@lighnib/shared";
import { api } from "@/lib/api";
import { payInvoice } from "@/lib/nwc-client";
import { runPayFlow } from "@/lib/pay-flow";
import { getSession, setSession, subscribeSession } from "@/lib/session";
import { speak, stopSpeaking, VOICE_LABEL } from "@/lib/voice";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { NumberTicker } from "@/components/ui/number-ticker";
import { Confetti, type ConfettiRef } from "@/components/ui/confetti";
import { BlurFade } from "@/components/ui/blur-fade";

/**
 * /pay, supplier invoice pay flow with scope remaining.
 * The orchestration lives in lib/pay-flow.ts (decode → INV-9 → INV-2 →
 * wallet pay → bound receipt → explainer → speak). This page is UI only.
 */

const SUPPLIERS: { id: string; label: string; vendorName: string }[] = [
  {
    id: "supplier-balogun-001",
    label: "Balogun provisions, Mama Nkechi",
    vendorName: "Balogun provisions, Mama Nkechi",
  },
  { id: "supplier-001", label: "supplier-001, Mama Nkechi provisions", vendorName: "Mama Nkechi provisions" },
  { id: "supplier-002", label: "supplier-002, Balogun textiles", vendorName: "Balogun textiles" },
  {
    id: "supplier-999",
    label: "supplier-999, no dey for this portal (demo block)",
    vendorName: "Unknown supplier",
  },
];

const OUTLINE_BTN =
  "mt-2.5 h-12 w-full rounded-[14px] border-primary bg-card text-base font-semibold hover:bg-secondary";

export default function PayPage() {
  const router = useRouter();
  const [invoice, setInvoice] = useState("");
  const [supplierId, setSupplierId] = useState("supplier-balogun-001");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Awaited<ReturnType<typeof api.createReceipt>> | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [minting, setMinting] = useState(false);
  const [session, setSessionState] = useState(getSession());
  const confettiRef = useRef<ConfettiRef>(null);

  useEffect(() => subscribeSession(() => setSessionState(getSession())), []);

  const scope = session.scope;

  async function mintDemoInvoice() {
    setError(null);
    setStatus(null);
    if (!scope) {
      setError("Log in first, connect your wallet on the Login page.");
      return;
    }
    if (supplierId === "supplier-999") {
      setError("This supplier cannot mint invoices on the demo.");
      return;
    }
    setMinting(true);
    try {
      const supplier = SUPPLIERS.find((s) => s.id === supplierId) ?? SUPPLIERS[0];
      const result = await api.mintInvoice({
        supplierId,
        orderId: `ORD-DEMO-${Date.now().toString(36).toUpperCase()}`,
        amountSats: 100,
      });
      setInvoice(result.paymentRequest);
      setStatus(`Fresh invoice ready, 100 sats for ${supplier.vendorName}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMinting(false);
    }
  }

  async function pay() {
    setError(null);
    setStatus(null);
    setReceipt(null);
    setExplanation(null);
    if (!scope) {
      setError("Log in first, connect your wallet on the Login page.");
      return;
    }
    if (!invoice.trim()) {
      setError("Paste the supplier invoice code.");
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
      setStatus("Payment settled, receipt don land.");
      void confettiRef.current?.fire({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 },
        colors: ["#f2b705", "#0b1f14", "#ffffff"],
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const remaining = scope ? scope.dailyBudgetSats - scope.spentTodaySats : 0;
  const spentPct = scope
    ? Math.min(100, Math.round((scope.spentTodaySats / scope.dailyBudgetSats) * 100))
    : 0;

  return (
    <>
      <Confetti
        ref={confettiRef}
        manualstart
        className="pointer-events-none fixed inset-0 z-50"
      />
      <BlurFade delay={0}>
        <h1>{LOCALE.copy.payTitle}</h1>
        <p>{LOCALE.copy.payBody}</p>

        {!scope && (
          <div className="error">
            You never log in. <Link href="/login">Connect your wallet first</Link>.
          </div>
        )}
        <div className="pay-grid">
        {scope && (
          <Card className="mb-5">
            <CardContent className="pt-6">
              <p className="small" style={{ margin: 0 }}>
                Scope remaining
              </p>
              <p className="amount" style={{ fontSize: 26, margin: "4px 0 0" }}>
                <NumberTicker value={remaining} /> sats
              </p>
              <Progress value={spentPct} className="my-3 h-1" aria-hidden="true" />
              <p className="small" style={{ margin: "4px 0 0" }}>
                of {scope.dailyBudgetSats.toLocaleString()} sats/day · Spent{" "}
                {scope.spentTodaySats.toLocaleString()} sats
              </p>
            </CardContent>
          </Card>
        )}

        <Card className="mb-5">
          <CardContent className="pt-6">
            <Label htmlFor="supplier">Supplier</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger id="supplier" className="mt-2 h-12 rounded-xl text-base">
                <SelectValue placeholder="Pick a supplier" />
              </SelectTrigger>
              <SelectContent>
                {SUPPLIERS.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Label htmlFor="invoice">Supplier invoice code</Label>
            <Textarea
              id="invoice"
              rows={3}
              placeholder="lnbc…"
              value={invoice}
              onChange={(e) => setInvoice(e.target.value)}
              className="mt-2 text-base"
            />
            <p className="small">
              App go decode am, check say the invoice belong to this supplier,
              check your scope, before wallet ever see am.
            </p>
            <Button
              variant="outline"
              className={OUTLINE_BTN}
              onClick={mintDemoInvoice}
              disabled={minting || busy || !scope || supplierId === "supplier-999"}
            >
              {minting ? "Minting…" : "Get a demo invoice"}
            </Button>
            <Button
              className="mt-4 h-12 w-full rounded-[14px] text-base font-semibold active:scale-[0.985]"
              onClick={pay}
              disabled={busy || !scope}
            >
              {busy ? "Paying…" : "Pay invoice"}
            </Button>
            {status && <div className="ok">{status}</div>}
            {error && <div className="error">{error}</div>}
          </CardContent>
        </Card>
        </div>
      </BlurFade>

      {receipt && (
        <div className="slip relative">
          <div className="perf" aria-hidden="true" />
            <span className="stamp stamp-in">BOUND RECEIPT</span>
            <h2>
              {receipt.vendorName}, {receipt.amountSats.toLocaleString()} sats
            </h2>
            <p className="small">Purpose: {receipt.purpose}</p>
            <p className="small mono">hash: {receipt.paymentHash}</p>
            <p className="small mono">preimage: {receipt.preimage.slice(0, 24)}…</p>
            <p className="small">Settled: {receipt.settledAt}</p>
            {explanation && (
              <>
                <p>{explanation}</p>
                <p className="small">{VOICE_LABEL}</p>
                <Button variant="outline" className={OUTLINE_BTN} onClick={() => explanation && speak(explanation)}>
                  Replay readout
                </Button>
                <Button variant="outline" className={OUTLINE_BTN} onClick={stopSpeaking}>
                  Mute
                </Button>
              </>
            )}
            <Button variant="outline" className={OUTLINE_BTN} onClick={() => router.push("/receipts")}>
              See all receipts
            </Button>
          </div>
      )}
    </>
  );
}
