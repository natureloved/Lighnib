"use client";

import { useEffect, useState } from "react";
import { LOCALE } from "@lighnib/shared";
import { api } from "@/lib/api";
import { getSession, logoutSession, subscribeSession } from "@/lib/session";

/**
 * /wallet — connection / budget / revoke view.
 * Revoke = logout (INV-4): wipes the NWC secret from browser memory and
 * revokes the scope server-side. A revoked scope never pays again.
 */
export default function WalletPage() {
  const [session, setSessionState] = useState(getSession());
  const [error, setError] = useState<string | null>(null);
  const [revoked, setRevoked] = useState(false);

  useEffect(() => subscribeSession(() => setSessionState(getSession())), []);

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
        <h1>{LOCALE.copy.walletTitle}</h1>
        {revoked && (
          <div className="ok">
            Revoked — logout done. Spending don die instantly; the connection
            no fit pay again.
          </div>
        )}
        {!revoked && <p>No wallet connected. <a href="/login">Log in</a> first.</p>}
        <div className="card">
          <h2>Wallets wey work</h2>
          <p className="small">{LOCALE.supportedWallets.join(" · ")}</p>
          <p className="small">Phoenix has NO NWC — e no dey supported.</p>
        </div>
      </>
    );
  }

  const s = session.scope;
  const remaining = s.dailyBudgetSats - s.spentTodaySats;
  return (
    <>
      <h1>{LOCALE.copy.walletTitle}</h1>
      <div className="card">
        <h2>Connection</h2>
        <p className="small mono">wallet: {session.walletPubkey}</p>
        <p className="small">State: {s.state}</p>
        <p className="small">Expires: {new Date(s.expiresAt).toLocaleString()}</p>
      </div>
      <div className="card">
        <h2>{LOCALE.copy.scopeLabel}</h2>
        <p>
          <strong>
            {LOCALE.currencySymbol}
            {s.dailyBudgetFiat.toLocaleString()} / day
          </strong>
        </p>
        <p>Spent today: {s.spentTodaySats.toLocaleString()} sats</p>
        <p>Remaining: {remaining.toLocaleString()} sats</p>
        <p className="small">
          Budget na wallet dey enforce (NWC quota). Server dey re-check am too.
        </p>
      </div>
      <div className="card">
        <h2>{LOCALE.copy.revokeLabel}</h2>
        <p className="small">{LOCALE.copy.revokeBody}</p>
        <button className="danger" onClick={revoke}>
          Revoke login (logout)
        </button>
        {error && <div className="error">{error}</div>}
      </div>
    </>
  );
}
