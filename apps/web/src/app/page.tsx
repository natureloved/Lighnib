"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { LOCALE, receiptFiat, type BoundReceipt } from "@lighnib/shared";
import { api } from "@/lib/api";
import LockSeal from "@/components/LockSeal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BlurFade } from "@/components/ui/blur-fade";

type Metrics = {
  receipts: number;
  overspendBlocks: number;
  wrongSupplierBlocks: number;
  disputes: number;
};

/** Seeded demo numbers, shown when the live metrics fetch fails. */
const DEMO_METRICS: Metrics = {
  receipts: 10,
  overspendBlocks: 1,
  wrongSupplierBlocks: 1,
  disputes: 0,
};

/** Sample receipt shown when the live API cannot be reached. Labelled demo data on screen. */
const DEMO_RECEIPT: BoundReceipt = {
  id: "rcpt_sample",
  orderId: "ORD-DEMO",
  supplierId: "supplier-balogun-001",
  vendorName: "Balogun provisions, Mama Nkechi",
  purpose: "Demo order, provisions from Balogun market",
  amountSats: 100,
  amountFiat: 150,
  currency: "NGN",
  paymentHash:
    "a2ce78f405bfe51746057adee07ae6c61a5da5350cf57d60996a8753805c0d74",
  preimage:
    "b7ad6c1ea5b4a1c8e3f9d2a6b0c4e8f1a3d5c7b9e0f2a4c6d8e0b1a3c5d7",
  settledAt: "2026-11-19T11:00:00.000Z",
  status: "SETTLED",
  nostrEvent: { kind: 1, pubkey: "demo", content: "demo receipt" },
};

export default function Home() {
  const router = useRouter();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [metricsDemo, setMetricsDemo] = useState(false);
  const [receipt, setReceipt] = useState<BoundReceipt | null>(null);
  const [receiptDemo, setReceiptDemo] = useState(false);

  useEffect(() => {
    api
      .getMetrics()
      .then(setMetrics)
      .catch(() => {
        setMetrics(DEMO_METRICS);
        setMetricsDemo(true);
      });
    api
      .listReceipts()
      .then((rs) => {
        if (rs.length > 0) setReceipt(rs[0]);
        else {
          setReceipt(DEMO_RECEIPT);
          setReceiptDemo(true);
        }
      })
      .catch(() => {
        setReceipt(DEMO_RECEIPT);
        setReceiptDemo(true);
      });
  }, []);

  const m = metrics ?? DEMO_METRICS;
  const r = receipt ?? DEMO_RECEIPT;
  return (
    <BlurFade delay={0}>
      <div className="hero">
        <LockSeal />
        <h1 className="display">Lighnib</h1>
        <p>
          <strong>The login IS the spending permission.</strong>
        </p>
        <p>
          <strong>{LOCALE.oneLiner}</strong>
        </p>
        <p>{LOCALE.tagline}</p>
      </div>

      <Card className="mb-5">
        <CardHeader>
          <CardTitle>{LOCALE.copy.landingProblemTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <p>{LOCALE.copy.landingProblemBody}</p>
        </CardContent>
      </Card>

      <p>
        A Lagos market trader dey log in to her supplier portal with her
        Lightning wallet, no password, no form. The login carry{" "}
        {LOCALE.currencySymbol}
        {LOCALE.demoDailyBudgetNgn.toLocaleString()}/day budget, payable only to
        portal suppliers. Every payment get AI-explained receipt, spoken
        aloud in Pidgin. Dispute go to the {LOCALE.mediator} mediator.
      </p>

      <p className="small">{LOCALE.honestLine}</p>

      <Card className="mb-5">
        <CardHeader>
          <CardTitle>{LOCALE.copy.landingTrustTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="flow">
            {LOCALE.copy.landingTrustRows.map((row, i) => (
              <li key={row.label}>
                <span className="flow-n">{i + 1}</span>
                <span>
                  <strong>{row.label}</strong>: {row.text}
                </span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Card className="mb-5">
        <CardHeader>
          <CardTitle>How e work</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="flow">
            <li>
              <span className="flow-n">1</span>
              <span>
                <strong>Login</strong>: connect wallet, na the key.
              </span>
            </li>
            <li>
              <span className="flow-n">2</span>
              <span>
                <strong>Pay</strong>: pay supplier invoice, app check am first.
              </span>
            </li>
            <li>
              <span className="flow-n">3</span>
              <span>
                <strong>Receipt</strong>: bound receipt na proof.
              </span>
            </li>
            <li>
              <span className="flow-n">4</span>
              <span>
                <strong>Dispute</strong>: mediator see the same receipt.
              </span>
            </li>
          </ol>
          <Button
            className="mt-4 h-12 w-full rounded-[14px] text-base font-semibold active:scale-[0.985]"
            onClick={() => router.push("/login")}
          >
            Start: log in with your wallet
          </Button>
        </CardContent>
      </Card>

      <Card className="mb-5">
        <CardHeader>
          <CardTitle>{LOCALE.copy.landingReceiptTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <p>{LOCALE.copy.landingReceiptBody}</p>
          <div className="slip relative">
            <div className="perf" aria-hidden="true" />
            <LockSeal small />
            <span className="stamp">BOUND RECEIPT</span>
            <h2>
              {r.vendorName}, {r.amountSats.toLocaleString()} sats
            </h2>
            <p>
              {LOCALE.currencySymbol}
              {receiptFiat(r).toLocaleString()} ·{" "}
              {r.purpose}
            </p>
            <p className="small">
              Order: {r.orderId} · Supplier: {r.supplierId}
            </p>
            <p className="small mono">
              hash: {r.paymentHash.slice(0, 24)}…
            </p>
          </div>
          <p className="small">
            {receiptDemo
              ? LOCALE.copy.landingReceiptSampleNote
              : LOCALE.copy.landingReceiptLiveNote}{" "}
            <Link href="/receipts">See all receipts</Link>
          </p>
        </CardContent>
      </Card>

      <Card className="mb-5">
        <CardHeader>
          <CardTitle>Numbers so far</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="metrics-strip">
            <div>
              <strong>10</strong>
              <span>Merchants / week (pilot target, 1 market)</span>
            </div>
            <div>
              <strong>{m.receipts}</strong>
              <span>Receipts / day</span>
            </div>
            <div>
              <strong>{m.overspendBlocks}</strong>
              <span>Overspend blocks</span>
            </div>
            <div>
              <strong>{m.wrongSupplierBlocks}</strong>
              <span>Wrong-supplier blocks</span>
            </div>
            <div>
              <strong>&lt;5 min</strong>
              <span>Dispute resolution (demo)</span>
            </div>
          </div>
          {metricsDemo && (
            <p className="small">Demo data, live metrics unavailable.</p>
          )}
        </CardContent>
      </Card>

      <Card className="mb-5">
        <CardHeader>
          <CardTitle>Wallets wey work</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="small">{LOCALE.supportedWallets.join(" · ")}</p>
          <p className="small">
            Phoenix has NO NWC, e no dey supported. Alby Hub must be v1.19.0 or
            newer.
          </p>
        </CardContent>
      </Card>

      <Card className="mb-5">
        <CardHeader>
          <CardTitle>{LOCALE.copy.landingCtaTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <p>{LOCALE.copy.landingCtaBody}</p>
          <Button
            className="mt-4 h-12 w-full rounded-[14px] text-base font-semibold active:scale-[0.985]"
            onClick={() => router.push("/login")}
          >
            Start: log in with your wallet
          </Button>
          <p className="small">
            <Link
              href="https://github.com/natureloved/Lighnib#judge-5-min-guide"
              target="_blank"
              rel="noreferrer"
            >
              {LOCALE.copy.landingJudgeNote}
            </Link>
          </p>
        </CardContent>
      </Card>
    </BlurFade>
  );
}
