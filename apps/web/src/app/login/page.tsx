"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LOCALE, ngnToSats, scopeStateLabel } from "@lighnib/shared";
import { api } from "@/lib/api";
import { connectWallet, isValidNwcUri } from "@/lib/nwc-client";
import LockSeal from "@/components/LockSeal";
import { getSession, setSession, subscribeSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberTicker } from "@/components/ui/number-ticker";
import { AnimatedCircularProgressBar } from "@/components/ui/animated-circular-progress-bar";
import { BlurFade } from "@/components/ui/blur-fade";

/**
 * /login, connect-wallet (NWC) UI with scoped-budget display.
 * The NWC secret is pasted here and lives in browser memory ONLY -
 * never localStorage, never the server, never logs (INV-8).
 */
export default function LoginPage() {
  const router = useRouter();
  const [uri, setUri] = useState("");
  const [budgetNgn, setBudgetNgn] = useState<number>(LOCALE.demoDailyBudgetNgn);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [session, setSessionState] = useState(getSession());

  useEffect(() => subscribeSession(() => setSessionState(getSession())), []);

  async function connect() {
    setError(null);
    if (!isValidNwcUri(uri)) {
      setError("That no be valid wallet connection code. Check am from your wallet.");
      return;
    }
    setBusy(true);
    try {
      const pubkey = connectWallet(uri, LOCALE.sessionExpiryHours * 3600_000);
      const budgetSats = ngnToSats(budgetNgn, LOCALE.demoBtcPriceNgn);
      const scope = await api.login({
        walletPubkey: pubkey,
        dailyBudgetSats: budgetSats,
        dailyBudgetFiat: budgetNgn,
        currency: LOCALE.currency,
        sessionHours: LOCALE.sessionExpiryHours,
      });
      setSession({ walletPubkey: pubkey, scope, connected: true });
      setUri(""); // clear the pasted secret from the input immediately
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (session.connected && session.scope) {
    const s = session.scope;
    const remaining = s.dailyBudgetSats - s.spentTodaySats;
    const spentPct = Math.min(
      100,
      Math.round((s.spentTodaySats / s.dailyBudgetSats) * 100),
    );
    const remainingPct = 100 - spentPct;
    return (
      <>
        <BlurFade delay={0}>
          <h1>You don log in</h1>
          <div className="till">
            <div className="till-head">
              <LockSeal small />
              <div>
                <h2>Your till don lock</h2>
                <p className="till-sub">
                  Wallet{" "}
                  <span className="mono">{session.walletPubkey?.slice(0, 16)}…</span>{" "}
                  connected. No password, no form, the connection na the key.
                </p>
              </div>
              <div
                className="ml-auto shrink-0"
                aria-label={`${remainingPct}% of your daily scope remain`}
              >
                <AnimatedCircularProgressBar
                  max={100}
                  min={0}
                  value={remainingPct}
                  gaugePrimaryColor="#f2b705"
                  gaugeSecondaryColor="rgba(255,255,255,0.16)"
                  className="size-20 text-lg"
                />
              </div>
            </div>
            <p className="till-amount amount">
              <small>{LOCALE.currencySymbol}</small>
              <NumberTicker value={remaining} className="text-white" />{" "}
              <small>sats remain today</small>
            </p>
            <div className="ledger" aria-hidden="true">
              <span style={{ width: `${spentPct}%` }} />
            </div>
            <p className="till-meta">
              {LOCALE.currencySymbol}
              {s.dailyBudgetFiat.toLocaleString()} / day · Spent today:{" "}
              {s.spentTodaySats.toLocaleString()} sats · Expires{" "}
              {new Date(s.expiresAt).toLocaleTimeString()} ·{" "}
              {scopeStateLabel(s.state)}
            </p>
          </div>
          <p className="small">{LOCALE.honestLine}</p>
          <Button
            className="h-12 w-full rounded-[14px] text-base font-semibold active:scale-[0.985]"
            onClick={() => router.push("/pay")}
          >
            Go pay supplier
          </Button>
        </BlurFade>
      </>
    );
  }

  return (
    <BlurFade delay={0}>
      <h1>{LOCALE.copy.loginTitle}</h1>
      <p>{LOCALE.copy.loginBody}</p>

      <Card>
        <CardContent className="pt-6">
          <Label htmlFor="nwc-uri">Wallet connection code (from your wallet)</Label>
          <Input
            id="nwc-uri"
            type="password"
            autoComplete="off"
            placeholder="nostr+walletconnect://…"
            value={uri}
            onChange={(e) => setUri(e.target.value)}
            className="mt-2 h-12 text-base"
          />
          <p className="small">
            Your secret stays in this browser tab memory only. E never enter
            localStorage, server, or log. E go expire after{" "}
            {LOCALE.sessionExpiryHours} hours.
          </p>

          <Label htmlFor="budget">Daily scope ({LOCALE.currencySymbol})</Label>
          <Input
            id="budget"
            type="number"
            min={1000}
            step={1000}
            value={budgetNgn}
            onChange={(e) => setBudgetNgn(Number(e.target.value))}
            className="mt-2 h-12 text-base"
          />
          <p className="small">
            Demo scope: {LOCALE.currencySymbol}
            {LOCALE.demoDailyBudgetNgn.toLocaleString()}/day. Wallet go enforce
            am, pass am and wallet go refuse am.
          </p>

          <Button
            className="mt-4 h-12 w-full rounded-[14px] text-base font-semibold active:scale-[0.985]"
            onClick={connect}
            disabled={busy || !uri}
          >
            {busy ? "Connecting…" : "Connect wallet to log in"}
          </Button>
          {error && <div className="error">{error}</div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Wallets wey work</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="small">{LOCALE.supportedWallets.join(" · ")}</p>
          <p className="small">Phoenix has NO NWC, e no dey supported.</p>
        </CardContent>
      </Card>
    </BlurFade>
  );
}
