"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LOCALE } from "@lighnib/shared";
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

export default function Home() {
  const router = useRouter();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [metricsDemo, setMetricsDemo] = useState(false);

  useEffect(() => {
    api
      .getMetrics()
      .then(setMetrics)
      .catch(() => {
        setMetrics(DEMO_METRICS);
        setMetricsDemo(true);
      });
  }, []);

  const m = metrics ?? DEMO_METRICS;
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
    </BlurFade>
  );
}
