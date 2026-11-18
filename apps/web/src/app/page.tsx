"use client";

import { useRouter } from "next/navigation";
import { LOCALE } from "@lighnib/shared";
import LockSeal from "@/components/LockSeal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BlurFade } from "@/components/ui/blur-fade";

export default function Home() {
  const router = useRouter();
  return (
    <BlurFade delay={0}>
      <div className="hero">
        <LockSeal />
        <h1 className="display">Lighnib</h1>
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

      <Card>
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

      <Card>
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
