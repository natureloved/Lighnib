"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { LOCALE } from "@lighnib/shared";
import { api } from "@/lib/api";
import type { BoundReceipt, Dispute } from "@lighnib/shared";
import { getSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { BlurFade } from "@/components/ui/blur-fade";

/**
 * /dispute, open a dispute against a bound receipt (INV-7).
 *
 * LIVE MEDIATOR HOLD: CUT (Wed 18 Nov decision, see README).
 * The wallet service has no hold invoices, so opening a dispute here
 * records the dispute claim against the bound receipt, it does NOT
 * hold any funds, and no mediator release moves money. The receipt
 * is the proof; the named mediator judges from it. Post-MVP path:
 * Alby Hub (hold invoices merged, getAlby/hub#1298 + #2065).
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
      setError("Log in first, dispute need your wallet identity.");
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
      <BlurFade delay={0}>
        <h1>{LOCALE.copy.disputeTitle}</h1>
        <p>{LOCALE.copy.disputeBody}</p>
        <Alert variant="destructive">
          <TriangleAlert className="h-4 w-4" />
          <AlertTitle>Live mediator hold CUT for the MVP.</AlertTitle>
          <AlertDescription>
            Our wallet service has no hold invoices, so this page records a
            dispute claim against the bound receipt -{" "}
            <strong>it holds no funds</strong> and no release here moves money.
            The receipt is the proof; the named mediator ({LOCALE.mediator})
            judges from it. The dispute state machine below is the design for
            a hold-capable wallet service (post-MVP: Alby Hub). Do not demo
            this as a live escrow.
          </AlertDescription>
        </Alert>
        <p className="small">
          Mediator: <strong>{LOCALE.mediator}</strong> · Hold window (design):{" "}
          {LOCALE.holdWindowMinutes} minutes, a live dispute must decide inside
          am. Production dispute (hours/days) na next iteration.
        </p>

        <Card>
          <CardContent className="pt-6">
            <Label htmlFor="receipt">Bound receipt</Label>
            <Select value={receiptId} onValueChange={setReceiptId}>
              <SelectTrigger id="receipt" className="mt-2 h-12 rounded-xl text-base">
                <SelectValue placeholder="- pick a receipt -" />
              </SelectTrigger>
              <SelectContent>
                {receipts.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.id}, {r.vendorName}, {r.amountSats.toLocaleString()} sats
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              className="mt-4 h-12 w-full rounded-[14px] text-base font-semibold"
              onClick={open}
              disabled={busy || !receiptId}
            >
              {busy ? "Opening…" : "Open dispute"}
            </Button>
            {error && <div className="error">{error}</div>}
          </CardContent>
        </Card>
      </BlurFade>

      {dispute && (
          <div className="slip relative">
            <div className="perf" aria-hidden="true" />
            <span className="stamp">DISPUTE {dispute.state}</span>
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
              Design preview only: the mediator release below records a
              ruling against the receipt. No funds are held or moved, the
              live hold is cut (see the notice at the top). If deadline pass,
              the design auto-refunds to buyer.
            </p>
            <Button
              variant="outline"
              className="mt-2.5 h-12 w-full rounded-[14px] border-primary bg-card text-base font-semibold hover:bg-secondary"
              onClick={timeoutCheck}
            >
              Check timeout
            </Button>
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
