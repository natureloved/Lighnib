"use client";

import { useEffect, useState } from "react";
import { LOCALE, ngnToSats } from "@lighnib/shared";
import { api } from "@/lib/api";
import { connectWallet, isValidNwcUri } from "@/lib/nwc-client";
import { getSession, setSession, subscribeSession } from "@/lib/session";

/**
 * /login — connect-wallet (NWC) UI with scoped-budget display.
 * The NWC secret is pasted here and lives in browser memory ONLY —
 * never localStorage, never the server, never logs (INV-8).
 */
export default function LoginPage() {
  const [uri, setUri] = useState("");
  const [budgetNgn, setBudgetNgn] = useState<number>(LOCALE.demoDailyBudgetNgn);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [session, setSessionState] = useState(getSession());

  useEffect(() => subscribeSession(() => setSessionState(getSession())), []);

  async function connect() {
    setError(null);
    if (!isValidNwcUri(uri)) {
      setError("That no be valid NWC connection URI. Check am from your wallet.");
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
    return (
      <>
        <h1>You don log in</h1>
        <div className="ok">
          Wallet <span className="mono">{session.walletPubkey?.slice(0, 16)}…</span>{" "}
          connected. No password, no form — the connection na the key.
        </div>
        <div className="card">
          <h2>{LOCALE.copy.scopeLabel}</h2>
          <p>
            <strong>
              {LOCALE.currencySymbol}
              {s.dailyBudgetFiat.toLocaleString()} / day
            </strong>{" "}
            ({s.dailyBudgetSats.toLocaleString()} sats)
          </p>
          <p className="small">
            Spent today: {s.spentTodaySats.toLocaleString()} sats · Remaining:{" "}
            {(s.dailyBudgetSats - s.spentTodaySats).toLocaleString()} sats
          </p>
          <p className="small">
            Scope expires: {new Date(s.expiresAt).toLocaleTimeString()} · State:{" "}
            {s.state}
          </p>
          <p className="small">{LOCALE.honestLine}</p>
        </div>
        <a href="/pay">
          <button>Go pay supplier →</button>
        </a>
      </>
    );
  }

  return (
    <>
      <h1>{LOCALE.copy.loginTitle}</h1>
      <p>{LOCALE.copy.loginBody}</p>

      <div className="card">
        <label htmlFor="nwc-uri">NWC connection URI (from your wallet)</label>
        <input
          id="nwc-uri"
          type="password"
          autoComplete="off"
          placeholder="nostr+walletconnect://…"
          value={uri}
          onChange={(e) => setUri(e.target.value)}
        />
        <p className="small">
          Your secret stays in this browser tab memory only. E never enter
          localStorage, server, or log. E go expire after{" "}
          {LOCALE.sessionExpiryHours} hours.
        </p>

        <label htmlFor="budget">Daily scope ({LOCALE.currencySymbol})</label>
        <input
          id="budget"
          type="number"
          min={1000}
          step={1000}
          value={budgetNgn}
          onChange={(e) => setBudgetNgn(Number(e.target.value))}
        />
        <p className="small">
          Demo scope: {LOCALE.currencySymbol}
          {LOCALE.demoDailyBudgetNgn.toLocaleString()}/day. Wallet go enforce
          am — pass am and wallet go refuse (QUOTA_EXCEEDED).
        </p>

        <button onClick={connect} disabled={busy || !uri}>
          {busy ? "Connecting…" : "Connect wallet — log in"}
        </button>
        {error && <div className="error">{error}</div>}
      </div>

      <div className="card">
        <h2>Wallets wey work</h2>
        <p className="small">{LOCALE.supportedWallets.join(" · ")}</p>
        <p className="small">Phoenix has NO NWC — e no dey supported.</p>
      </div>
    </>
  );
}
