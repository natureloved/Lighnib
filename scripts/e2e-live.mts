// scripts/e2e-live.mts — LIVE end-to-end verification of the web pay flow.
//
// Drives the EXACT code the PWA uses — the web's own `api` client,
// `runPayFlow` orchestration and browser-side `payInvoice` (NWCClient)
// — against the real API + a real NWC wallet on test sats. Not mocks:
// the only stubs are the spoken-readout recorder (no audio in Node) and
// the LNbits invoice creation (supplier side, same as the real world).
//
// Prerequisite: `npm run seed` (creates seed/.demo-credentials.json with
// the merchant NWC URI + supplier admin key) and `npm run dev` running.
// Usage: npm run e2e:live
// Writes scripts/e2e-live-result.json. Exit 0 on PASS, 1 on FAIL.
//
// Steps (mirrors /pay exactly, then the /wallet contract + revoke):
//   1. Login via the web's connectWallet + api.login (scope ₦50,000/day).
//   2. Fresh 150-sat supplier order → runPayFlow → bound receipt,
//      verified via the API, explained (template — no LLM key set).
//   3. /wallet data: GET scope → remaining = budget − tracked spend.
//   4. Over-budget ₦70,000 invoice → app scope check refuses (INV-2),
//      wallet never asked; then a DIRECT NWC pay of the same invoice →
//      the wallet itself refuses with verbatim QUOTA_EXCEEDED.
//   5. Unknown-hash invoice → INV-9 refuses, wallet never asked.
//   6. Revoke (INV-4): scope REVOKED, a further pay is refused, and
//      logoutSession() wipes the secret from memory.
//
// TEST SATS ONLY. No real funds, no minting, no buying.

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { api } from "../apps/web/src/lib/api";
import { connectWallet, payInvoice } from "../apps/web/src/lib/nwc-client";
import { runPayFlow } from "../apps/web/src/lib/pay-flow";
import { getSession, logoutSession, setSession } from "../apps/web/src/lib/session";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LNBITS_URL = process.env.LNBITS_URL || "http://127.0.0.1:5000";
const SUPPLIER_ID = "supplier-balogun-001";

const result: {
  check: string;
  startedAt: string;
  finishedAt?: string;
  steps: { name: string; ok: boolean; detail: string }[];
  pass: boolean;
  verdict?: string;
  error?: string;
} = {
  check: "e2e-live-web-pay-flow",
  startedAt: new Date().toISOString(),
  steps: [],
  pass: false,
};

function step(name: string, ok: boolean, detail: string) {
  result.steps.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} — ${detail}`);
}
function finish(pass: boolean) {
  result.pass = pass;
  result.finishedAt = new Date().toISOString();
  writeFileSync(
    join(ROOT, "scripts", "e2e-live-result.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(`\n${result.verdict}`);
}
function fail(msg: string): never {
  result.error = msg;
  result.verdict = `FAIL — ${msg}`;
  finish(false);
  process.exit(1);
}

const credsPath = join(ROOT, "seed", ".demo-credentials.json");
let creds: { merchantNwcUri: string; supplierAdminKey: string };
try {
  creds = JSON.parse(readFileSync(credsPath, "utf8"));
} catch {
  fail(`seed credentials not found at ${credsPath} — run \`npm run seed\` first`);
}
if (!creds!.merchantNwcUri || !creds!.supplierAdminKey) {
  fail("seed credentials file is missing merchantNwcUri / supplierAdminKey");
}

// Count wallet requests: wrap the web's own payInvoice.
let walletPayCalls = 0;
async function countingPayInvoice(invoice: string) {
  walletPayCalls++;
  return payInvoice(invoice);
}

async function lnbits(path: string, opts: { method?: string; apiKey?: string; body?: unknown } = {}) {
  const res = await fetch(`${LNBITS_URL}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(opts.apiKey ? { "X-Api-Key": opts.apiKey } : {}),
    },
    ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`LNbits ${opts.method ?? "GET"} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as Record<string, unknown>;
}

try {
  // 0. Preconditions.
  const health = await api.health();
  step("api-health", health.ok === true, `lighnib-api ok, holdsFunds=${(health as { holdsFunds?: boolean }).holdsFunds}`);
  const lnbitsHealth = await lnbits("/api/v1/health");
  step("lnbits-health", typeof lnbitsHealth.server_time === "number", `LNbits up ${lnbitsHealth.up_time}`);

  // 1. Login — the web's own connectWallet (browser-memory session) + api.login.
  const pubkey = connectWallet(creds!.merchantNwcUri, 8 * 3600_000);
  const scope = await api.login({
    walletPubkey: pubkey,
    dailyBudgetSats: 33_333,
    dailyBudgetFiat: 50_000,
    currency: "NGN",
    sessionHours: 8,
  });
  setSession({ walletPubkey: pubkey, scope, connected: true });
  step(
    "web-login-scope",
    scope.state === "LOGGED_IN" && scope.dailyBudgetSats === 33_333,
    `scope ${scope.id}, ₦50,000/day = 33,333 sats, state=${scope.state}`,
  );

  // 2. Fresh order through the exact web flow.
  const orderId = `ORD-E2E-${Date.now()}`;
  const memo = `Lighnib:order#${orderId}:${SUPPLIER_ID}`;
  const inv = await lnbits("/api/v1/payments", {
    method: "POST",
    apiKey: creds!.supplierAdminKey,
    body: { out: false, amount: 150, memo },
  });
  const invoice = String(inv.payment_request);
  const paymentHash = String(inv.payment_hash);
  // INV-9: the binding is recorded AT INVOICE CREATION, before any payment.
  await api.recordBinding({
    paymentHash,
    supplierId: SUPPLIER_ID,
    orderId,
    amountSats: 150,
    memo,
  });
  const spoken: string[] = [];
  const payBefore = walletPayCalls;
  const flow = await runPayFlow(api, countingPayInvoice, (t) => spoken.push(t), {
    scope: getSession().scope!,
    walletPubkey: pubkey,
    supplierId: SUPPLIER_ID,
    supplierName: "Balogun provisions — Mama Nkechi",
    invoice,
  });
  setSession({ scope: flow.scope });
  step(
    "web-pay-flow-settles",
    flow.receipt.paymentHash === paymentHash && flow.receipt.amountSats === 150,
    `receipt ${flow.receipt.id}, hash=${paymentHash.slice(0, 16)}…, walletPayCalls=${walletPayCalls - payBefore}`,
  );
  step(
    "receipt-verified-via-api",
    (await api.verifyReceipt(flow.receipt.id)).valid === true,
    "GET /api/receipts/:id/verify → valid=true",
  );
  step(
    "explainer-template-fallback",
    flow.explanationSource === "template" && flow.explanation.length > 20,
    `source=template (no LLM key), ${flow.explanation.length} chars, spoken=${spoken.length} time(s)`,
  );

  // 3. /wallet data contract: live remaining tracked spend.
  const fresh = await api.getScope(flow.scope.id);
  step(
    "wallet-tab-live-remaining",
    fresh.spentTodaySats === 150 && fresh.dailyBudgetSats - fresh.spentTodaySats === 33_183,
    `spent=${fresh.spentTodaySats} remaining=${fresh.dailyBudgetSats - fresh.spentTodaySats} state=${fresh.state} expires=${fresh.expiresAt}`,
  );

  // 4. Over-budget ₦70,000 invoice: app refuses first (INV-2), wallet never asked…
  const overOrderId = `ORD-E2E-${Date.now()}-OVER`;
  const invOver = await lnbits("/api/v1/payments", {
    method: "POST",
    apiKey: creds!.supplierAdminKey,
    body: { out: false, amount: 46_667, memo: `Lighnib:order#${overOrderId}:${SUPPLIER_ID}` },
  });
  // Record the binding, so INV-9 passes and the BUDGET check is the refuser.
  await api.recordBinding({
    paymentHash: String(invOver.payment_hash),
    supplierId: SUPPLIER_ID,
    orderId: overOrderId,
    amountSats: 46_667,
    memo: `Lighnib:order#${overOrderId}:${SUPPLIER_ID}`,
  });
  const payBeforeOver = walletPayCalls;
  let overRefused = "";
  try {
    await runPayFlow(api, countingPayInvoice, () => {}, {
      scope: getSession().scope!,
      walletPubkey: pubkey,
      supplierId: SUPPLIER_ID,
      supplierName: "Balogun provisions — Mama Nkechi",
      invoice: String(invOver.payment_request),
    });
    step("web-over-budget-refused", false, "over-budget payment SUCCEEDED — not refused!");
  } catch (e) {
    overRefused = (e as Error).message;
    step(
      "web-over-budget-refused",
      /Over budget: QUOTA_EXCEEDED/.test(overRefused) && walletPayCalls === payBeforeOver,
      `${overRefused} (walletPayCalls delta=${walletPayCalls - payBeforeOver})`,
    );
  }
  // …then the wallet itself refuses the same invoice directly (the backstop).
  let quotaError = "";
  try {
    await countingPayInvoice(String(invOver.payment_request));
    step("wallet-quota-exceeded-backstop", false, "direct NWC pay SUCCEEDED over budget!");
  } catch (e) {
    quotaError = `${(e as { code?: string }).code || ""} ${(e as Error).message || ""}`.trim();
    step(
      "wallet-quota-exceeded-backstop",
      /QUOTA_EXCEEDED/i.test(quotaError),
      `wallet returned: ${quotaError.slice(0, 200)}`,
    );
  }

  // 5. Unknown-hash invoice: INV-9 refuses, wallet never asked.
  const invWrong = await lnbits("/api/v1/payments", {
    method: "POST",
    apiKey: creds!.supplierAdminKey,
    body: { out: false, amount: 50, memo: `Lighnib:order#${overOrderId}-WRONG:supplier-other-999` },
  });
  const payBeforeWrong = walletPayCalls;
  try {
    await runPayFlow(api, countingPayInvoice, () => {}, {
      scope: getSession().scope!,
      walletPubkey: pubkey,
      supplierId: "supplier-other-999",
      supplierName: "Unknown supplier",
      invoice: String(invWrong.payment_request),
    });
    step("web-inv9-unknown-hash-refused", false, "unknown-hash payment SUCCEEDED — INV-9 failed!");
  } catch (e) {
    step(
      "web-inv9-unknown-hash-refused",
      /INV-9: this invoice hash no dey recorded/.test((e as Error).message) &&
        walletPayCalls === payBeforeWrong,
      `${(e as Error).message.slice(0, 120)} (walletPayCalls delta=${walletPayCalls - payBeforeWrong})`,
    );
  }

  // 6. Revoke (INV-4): scope REVOKED, further pay refused, secret wiped.
  const revoked = await api.revokeScope(flow.scope.id);
  step("revoke-scope", revoked.state === "REVOKED", `state=${revoked.state} revokedAt=${revoked.revokedAt}`);
  const payBeforeRevoke = walletPayCalls;
  try {
    await runPayFlow(api, countingPayInvoice, () => {}, {
      scope: revoked,
      walletPubkey: pubkey,
      supplierId: SUPPLIER_ID,
      supplierName: "Balogun provisions — Mama Nkechi",
      invoice,
    });
    step("revoked-scope-never-pays", false, "payment went through on a REVOKED scope!");
  } catch (e) {
    step(
      "revoked-scope-never-pays",
      /SCOPE_REVOKED|Payment refused/.test((e as Error).message) && walletPayCalls === payBeforeRevoke,
      `${(e as Error).message.slice(0, 120)} (walletPayCalls delta=${walletPayCalls - payBeforeRevoke})`,
    );
  }
  logoutSession();
  step(
    "logout-wipes-secret",
    getSession().connected === false && getSession().walletPubkey === null,
    "session connected=false, walletPubkey=null after logoutSession()",
  );

  const failed = result.steps.filter((s) => !s.ok);
  result.verdict =
    failed.length === 0
      ? "PASS — web pay flow verified live end-to-end: login → INV-9 → budget → wallet pay → bound receipt → explainer → wallet tab → over-budget + INV-9 blocks → revoke. All against a real NWC wallet on test sats."
      : `FAIL — ${failed.length} step(s) failed: ${failed.map((s) => s.name).join(", ")}`;
  finish(failed.length === 0);
  process.exit(failed.length === 0 ? 0 : 1);
} catch (e) {
  fail(`unexpected: ${(e as Error).stack || (e as Error).message}`);
}
