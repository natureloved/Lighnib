"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LOCALE, satsToNgn } from "@lighnib/shared";
import { api } from "@/lib/api";
import { lookupInvoice, payInvoice } from "@/lib/nwc-client";
import { PaymentUncertainError, runPayFlow } from "@/lib/pay-flow";
import { getSession, setSession, subscribeSession } from "@/lib/session";
import { speak, stopSpeaking, VOICE_LABEL } from "@/lib/voice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

const DEMO_AMOUNTS = [100, 1000, 10000, 83333];

const OUTLINE_BTN =
  "mt-2.5 h-12 w-full rounded-[14px] border-primary bg-card text-base font-semibold hover:bg-secondary";

export default function PayPage() {
  const router = useRouter();
  const [invoice, setInvoice] = useState("");
  const [supplierId, setSupplierId] = useState("supplier-balogun-001");
  const [demoAmount, setDemoAmount] = useState(100);
  const [amountText, setAmountText] = useState("100");
  const [mintedRequest, setMintedRequest] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState<PaymentUncertainError | null>(null);
  const [checking, setChecking] = useState(false);
  const [receipt, setReceipt] = useState<Awaited<ReturnType<typeof api.createReceipt>> | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [minting, setMinting] = useState(false);
  const [session, setSessionState] = useState(getSession());
  const confettiRef = useRef<ConfettiRef>(null);

  useEffect(() => subscribeSession(() => setSessionState(getSession())), []);

  const scope = session.scope;

  function clearStaleInvoice(nextAmount: number) {
    if (invoice && mintedRequest && invoice === mintedRequest) {
      setInvoice("");
      setMintedRequest(null);
      setStatus(
        `Amount changed to ${nextAmount.toLocaleString()} sats. Tap Get a demo invoice for a fresh one.`
      );
    }
  }

  function applyAmount(raw: string) {
    setAmountText(raw);
    const n = Number(raw);
    if (raw.trim() !== "" && Number.isInteger(n) && n >= 1 && n <= 3333333) {
      if (n !== demoAmount) {
        setDemoAmount(n);
        clearStaleInvoice(n);
      }
    }
  }

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
    const amountSats = Number(amountText);
    if (
      !Number.isInteger(amountSats) ||
      amountSats < 1 ||
      amountSats > 3333333
    ) {
      setError("Type an amount between 1 and 3,333,333 sats.");
      return;
    }
    if (amountSats !== demoAmount) setDemoAmount(amountSats);
    setMinting(true);
    try {
      const supplier = SUPPLIERS.find((s) => s.id === supplierId) ?? SUPPLIERS[0];
      const result = await api.mintInvoice({
        supplierId,
        orderId: `ORD-DEMO-${Date.now().toString(36).toUpperCase()}`,
        amountSats,
      });
      setInvoice(result.paymentRequest);
      setMintedRequest(result.paymentRequest);
      setAmountText(String(amountSats));
      setStatus(
        `Fresh invoice ready, ${amountSats.toLocaleString()} sats for ${supplier.vendorName}.`
      );
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
    setUncertain(null);
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
      // An uncertain payment is not a failed payment: the wallet may
      // have paid. Show the reconcile path, never a blind retry.
      if (e instanceof PaymentUncertainError) {
        setUncertain(e);
        setError(LOCALE.copy.payUncertain);
      } else {
        setError((e as Error).message);
      }
    } finally {
      setBusy(false);
    }
  }

  /**
   * Reconcile an uncertain payment (Nov 21 review, item 7). Asks the
   * wallet first whether the payment settled; a lookup failure is not
   * proof of failure, because the preimage the wallet already returned
   * is settlement proof by itself. The API verifies the preimage
   * against the hash before recording anything, and the receipt and
   * the scope spend are both idempotent by payment hash.
   */
  async function checkPaymentStatus() {
    if (!uncertain || !scope) return;
    setChecking(true);
    setError(null);
    setStatus(null);
    try {
      if (!uncertain.preimage) {
        // No settlement proof at all: the payment did not go through.
        await api.cancelPayment(scope.id);
        setUncertain(null);
        setStatus(LOCALE.copy.payNotSettled);
        return;
      }
      let preimage = uncertain.preimage;
      try {
        const found = await lookupInvoice(uncertain.paymentHash);
        if (found.state === "settled" && found.preimage) {
          preimage = found.preimage;
        }
      } catch {
        // Wallet could not confirm; the held preimage still proves
        // settlement, and the API checks it before recording.
        setStatus("Wallet could not confirm the payment, reconciling from the preimage your wallet returned.");
      }
      const result = await api.reconcilePayment({
        scopeId: scope.id,
        paymentHash: uncertain.paymentHash,
        preimage,
        orderId: uncertain.orderId,
        supplierId: uncertain.supplierId,
        vendorName: uncertain.supplierName,
        purpose: uncertain.purpose,
        amountSats: uncertain.amountSats,
        amountFiat: satsToNgn(uncertain.amountSats, LOCALE.demoBtcPriceNgn),
        currency: LOCALE.currency,
        payerPubkey: session.walletPubkey ?? "",
      });
      if (result.scope) setSession({ scope: result.scope });
      setReceipt(result.receipt);
      setExplanation(null);
      setUncertain(null);
      setStatus(LOCALE.copy.payReconciled);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChecking(false);
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
        <div style={{ display: "grid", gap: 20, alignContent: "start" }}>
        {scope && (
          <Card>
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

        <Card>
          <CardContent className="pt-6">
            <h2 style={{ fontSize: 20, margin: "0 0 12px" }}>How e work</h2>
            <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 10 }}>
              <li>
                App go decode the invoice, check say e belong to this
                supplier, check your scope, before wallet ever see am.
              </li>
              <li>
                Your wallet go pay am. The scope na the limit, pass am and
                wallet go refuse am.
              </li>
              <li>
                Receipt go land, bound to the payment. If wahala come, the
                market association mediator go see this same receipt.
              </li>
            </ol>
          </CardContent>
        </Card>
        </div>

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
            <p className="small" style={{ margin: "12px 0 6px" }}>
              Demo invoice amount
            </p>
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label="Demo invoice amount"
            >
              {DEMO_AMOUNTS.map((a) => (
                <Button
                  key={a}
                  type="button"
                  variant={demoAmount === a ? "default" : "outline"}
                  className="h-9 rounded-full px-3 text-sm"
                  onClick={() => applyAmount(String(a))}
                  disabled={
                    minting || busy || !scope || supplierId === "supplier-999"
                  }
                >
                  {a.toLocaleString()} sats
                </Button>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Input
                id="demo-amount"
                type="number"
                inputMode="numeric"
                min={1}
                max={3333333}
                value={amountText}
                onChange={(e) => applyAmount(e.target.value)}
                onBlur={() => {
                  const n = Number(amountText);
                  if (
                    amountText.trim() === "" ||
                    !Number.isInteger(n) ||
                    n < 1 ||
                    n > 3333333
                  ) {
                    setAmountText(String(demoAmount));
                  }
                }}
                disabled={
                  minting || busy || !scope || supplierId === "supplier-999"
                }
                aria-label="Custom demo invoice amount in sats"
                className="h-11 w-36 rounded-xl text-base"
              />
              <span className="small" style={{ margin: 0 }}>
                sats, or type your own amount
              </span>
            </div>
            <p className="small">
              Pick 83,333 sats to see the over-scope refusal, the app refuses
              it before the wallet ever sees it.
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
            {uncertain && (
              <Button
                className="mt-2.5 h-12 w-full rounded-[14px] text-base font-semibold active:scale-[0.985]"
                onClick={checkPaymentStatus}
                disabled={checking || !scope}
              >
                {checking ? "Checking…" : "Check payment status"}
              </Button>
            )}
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
