"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LOCALE, remainingBudgetSats, scopeStateLabel } from "@lighnib/shared";
import type { BoundReceipt } from "@lighnib/shared";
import { api } from "@/lib/api";
import LockSeal from "@/components/LockSeal";
import { getSession, logoutSession, setSession, subscribeSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NumberTicker } from "@/components/ui/number-ticker";
import { AnimatedCircularProgressBar } from "@/components/ui/animated-circular-progress-bar";
import { BlurFade } from "@/components/ui/blur-fade";

type BlockedAttempt = {
  id: string;
  kind: "overspend" | "wrong-supplier";
  reason: string;
  amountSats?: number;
  amountFiat?: number;
  supplierId?: string;
  orderId?: string;
  at: string;
};

/**
 * /wallet, connection / budget / revoke view.
 * The scope shown here is REFRESHED from the API on mount (and on demand),
 * so "remaining" is the live tracked spend, not the snapshot from login
 * time. Revoke = logout (INV-4): wipes the NWC secret from browser memory
 * and revokes the scope server-side. A revoked scope never pays again.
 */
export default function WalletPage() {
  const [session, setSessionState] = useState(getSession());
  const [error, setError] = useState<string | null>(null);
  const [revoked, setRevoked] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);
  const [historyReceipts, setHistoryReceipts] = useState<BoundReceipt[]>([]);
  const [historyBlocked, setHistoryBlocked] = useState<BlockedAttempt[]>([]);
  const [historyError, setHistoryError] = useState(false);

  useEffect(() => subscribeSession(() => setSessionState(getSession())), []);

  // Live refresh: the API is the source of truth for tracked spend.
  useEffect(() => {
    const scope = getSession().scope;
    if (!scope) return;
    let cancelled = false;
    api
      .getScope(scope.id)
      .then((fresh) => {
        if (cancelled) return;
        setSession({ scope: fresh });
        setRefreshedAt(new Date().toLocaleTimeString());
      })
      .catch(() => {
        // API unreachable, keep the login-time snapshot, say so below.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // History: receipts + blocked attempts, from the API. The connection is
  // pay_invoice only, so there is no NWC balance/transactions call here;
  // the API's tracked receipts and blocks are the history.
  useEffect(() => {
    if (!session.connected || !session.scope) return;
    let cancelled = false;
    Promise.all([api.listReceipts(), api.listBlocked()])
      .then(([receipts, blocked]) => {
        if (cancelled) return;
        setHistoryReceipts(receipts);
        setHistoryBlocked(blocked);
      })
      .catch(() => {
        if (cancelled) return;
        setHistoryError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [session.connected, session.scope]);

  async function refresh() {
    if (!session.scope) return;
    setRefreshing(true);
    try {
      const fresh = await api.getScope(session.scope.id);
      setSession({ scope: fresh });
      setRefreshedAt(new Date().toLocaleTimeString());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }

  async function revoke() {
    setError(null);
    try {
      if (session.scope) await api.revokeScope(session.scope.id);
      logoutSession();
      setRevoked(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (revoked || !session.connected || !session.scope) {
    return (
      <>
        <BlurFade delay={0}>
          <h1>{LOCALE.copy.walletTitle}</h1>
          {revoked && (
            <div className="ok">
              Revoked, logout done. Spending don die instantly; the connection
              no fit pay again.
            </div>
          )}
          {!revoked && <p>No wallet connected. <Link href="/login">Log in</Link> first.</p>}
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
      </>
    );
  }

  const s = session.scope;
  const remaining = remainingBudgetSats(s);
  const spentPct = Math.min(
    100,
    Math.round((s.spentTodaySats / s.dailyBudgetSats) * 100),
  );
  const remainingPct = 100 - spentPct;
  return (
    <>
      <BlurFade delay={0}>
        <h1>{LOCALE.copy.walletTitle}</h1>
        <Card>
          <CardHeader>
            <CardTitle>Connection</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="small mono">wallet: {session.walletPubkey}</p>
            <p className="small">State: {scopeStateLabel(s.state)}</p>
            <p className="small">Expires: {new Date(s.expiresAt).toLocaleString()}</p>
            <p className="small">
              {refreshedAt
                ? `Scope refreshed from server ${refreshedAt}, remaining na live tracked spend.`
                : "Showing the scope from login time, refresh to see live tracked spend."}
            </p>
            <Button
              variant="outline"
              className="mt-2.5 h-12 w-full rounded-[14px] border-primary bg-card text-base font-semibold hover:bg-secondary"
              onClick={refresh}
              disabled={refreshing}
            >
              {refreshing ? "Refreshing…" : "Refresh scope"}
            </Button>
          </CardContent>
        </Card>
        <div className="till">
          <div className="till-head">
            <LockSeal small />
            <div>
              <h2>{LOCALE.copy.scopeLabel}</h2>
              <p className="till-sub">
                {LOCALE.currencySymbol}
                {s.dailyBudgetFiat.toLocaleString()} / day
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
            Spent today: {s.spentTodaySats.toLocaleString()} sats · Wallet dey
            enforce the budget. Server dey re-check am too. (Wallet no fit tell
            us how much remain, so the app dey track spend itself.)
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>History</CardTitle>
          </CardHeader>
          <CardContent>
            {historyError ? (
              <p className="small">History unavailable.</p>
            ) : historyReceipts.length === 0 && historyBlocked.length === 0 ? (
              <p className="small">No payments or blocked attempts yet.</p>
            ) : (
              <ul className="flow">
                {historyReceipts.map((r) => (
                  <li key={r.id}>
                    <span>
                      <strong>
                        {r.amountSats.toLocaleString()} sats · {LOCALE.currencySymbol}
                        {r.amountFiat.toLocaleString()}
                      </strong>{" "}
                      to {r.vendorName} · {r.purpose} · Settled{" "}
                      {new Date(r.settledAt).toLocaleString()}
                    </span>
                  </li>
                ))}
                {historyBlocked.map((b) => (
                  <li key={b.id}>
                    <span>
                      <strong>BLOCKED, {b.kind === "overspend" ? "Overspend" : "Wrong supplier"}</strong>{" "}
                      · {b.reason}
                      {b.amountSats !== undefined &&
                        ` · ${b.amountSats.toLocaleString()} sats`}
                      {b.amountFiat !== undefined &&
                        ` · ${LOCALE.currencySymbol}${b.amountFiat.toLocaleString()}`}{" "}
                      · {new Date(b.at).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{LOCALE.copy.revokeLabel}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="small">{LOCALE.copy.revokeBody}</p>
            <Button
              variant="destructive"
              className="mt-2.5 h-12 w-full rounded-[14px] text-base font-semibold"
              onClick={revoke}
            >
              Revoke login
            </Button>
            {error && <div className="error">{error}</div>}
          </CardContent>
        </Card>
      </BlurFade>
    </>
  );
}
