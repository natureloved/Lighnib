import Link from "next/link";
import { LOCALE } from "@lighnib/shared";

export default function Home() {
  return (
    <>
      <div className="hero">
        <span className="tag">Dakar Bitcoin Hack 2026</span>
        <h1>Lighnib</h1>
        <p>{LOCALE.tagline}</p>
        <p>
          <strong>{LOCALE.oneLiner}</strong>
        </p>
      </div>

      <p>
        A Lagos market trader logs in to her supplier portal by connecting her
        Lightning wallet — no password, no form. The login carries a{" "}
        {LOCALE.currencySymbol}
        {LOCALE.demoDailyBudgetNgn.toLocaleString()}/day budget, payable only to
        portal suppliers. Every payment gets an AI-explained receipt, spoken
        aloud in Pidgin. Disputes go to the {LOCALE.mediator}.
      </p>

      <p className="small">{LOCALE.honestLine}</p>

      <div className="card">
        <h2>How e work</h2>
        <p>
          <strong>1. Login</strong> — connect wallet, na the key.{" "}
          <strong>2. Pay</strong> — pay supplier invoice, app check am first.{" "}
          <strong>3. Receipt</strong> — bound receipt na proof.{" "}
          <strong>4. Dispute</strong> — mediator see the same receipt.
        </p>
        <Link href="/login">
          <button>Start — log in with your wallet</button>
        </Link>
      </div>

      <div className="card">
        <h2>Wallets wey work</h2>
        <p className="small">{LOCALE.supportedWallets.join(" · ")}</p>
        <p className="small">
          Phoenix has NO NWC — e no dey supported. Alby Hub must be v1.19.0 or
          newer.
        </p>
      </div>
    </>
  );
}
