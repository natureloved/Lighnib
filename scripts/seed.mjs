// scripts/seed.mjs — demo seed for Lighnib (Dakar Bitcoin Hack 2026).
//
// Creates the demo world a stranger needs for the <5-min happy path:
//   1 merchant + 1 supplier + 1 named mediator + 10 bound receipts
//   + 2 blocked payments (1 wallet QUOTA_EXCEEDED, 1 app INV-9 refusal).
//
// TEST SATS ONLY. Local LNbits FakeWallet only — never real funds.
// Requires the stack running: `npm run dev` (API :3001, web :3000),
// LNbits 1.7.1 (:5000) and the local NWC relay (:7777, started
// automatically if it is not already up).
//
// What it does, in order:
//   1. Admin-login to LNbits, create FRESH merchant + supplier wallets
//      (timestamped names, so re-runs never collide with old demo data).
//   2. Fund the merchant wallet with 100,000 test sats via a synthetic
//      `success` ledger row in the LNbits DB — clearly labelled in the
//      memo. LNbits has no top-up endpoint; this is the same documented
//      test-only mechanism the Day-1 spike used. Only the initial
//      balance is synthetic; every payment under test runs through the
//      real NWC → LNbits payment path.
//   3. Register NWC connections: merchant budget = the ₦50,000/day scope
//      in sats at the demo rate; supplier invoice-only. Permissions are
//      GROUP names (pay, invoice, lookup, …), not method names.
//   4. Log the merchant in through the real API (scope creation).
//   5. Pay 10 supplier invoices live (100 sats each) → 10 bound receipts
//      created + verified through the real API.
//   6. Blocked #1 (wallet): a ₦70,000-equivalent invoice is paid DIRECTLY
//      via NWC, bypassing the app — the wallet refuses with verbatim
//      QUOTA_EXCEEDED. This is the wallet-side backstop; in the web flow
//      the app scope check refuses the same invoice first (INV-2), so
//      the seed proves both layers.
//   7. Blocked #2 (app): an invoice from a non-allowlisted supplier is
//      checked via the API — INV-9 refuses with UNKNOWN_INVOICE_HASH
//      before any wallet request; merchant balance is verified unchanged.
//   8. Writes seed/demo-data.json (NO secrets — safe to commit) and
//      seed/.demo-credentials.json (mode 600 — NWC URIs + admin keys,
//      gitignored, never printed in full).
//
// Usage:
//   LNBITS_URL=http://127.0.0.1:5000 API_URL=http://localhost:3001 \
//   node scripts/seed.mjs
// Defaults work on the dev machine (persistent LNbits data under
// .local/lnbits-data — see scripts/start-lnbits.sh). On a docker-compose
// machine set LNBITS_DATA_FOLDER to the LNbits volume path (or fund the
// merchant wallet another way and set SEED_SKIP_FUND=1 with a pre-funded
// wallet).
//
// Exit 0 on success, 1 on any failure. Prints a demo-ready summary.

import { spawn } from "node:child_process";
import { randomBytes, createHash } from "node:crypto";
import { writeFileSync, chmodSync, existsSync, mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { NWCClient } from "@getalby/sdk";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SEED_DIR = join(ROOT, "seed");

const LNBITS_URL = process.env.LNBITS_URL || "http://127.0.0.1:5000";
const API_URL = process.env.API_URL || "http://localhost:3001";
const RELAY_URL = process.env.RELAY_URL || "ws://127.0.0.1:7777";
const LNBITS_DATA_FOLDER =
  process.env.LNBITS_DATA_FOLDER || join(ROOT, ".local", "lnbits-data");
const ADMIN_USER = process.env.LNBITS_ADMIN_USER || "admin";
const ADMIN_PASSWORD =
  process.env.LNBITS_ADMIN_PASSWORD || "lighnib-spike-2026";
const SKIP_FUND = process.env.SEED_SKIP_FUND === "1";

const SUPPLIER_ID = "supplier-balogun-001";
const SUPPLIER_NAME = "Balogun provisions — Mama Nkechi";
const MEDIATOR = "Lagos market association";
const DAILY_BUDGET_NGN = 50_000;
const OVER_BUDGET_NGN = 70_000;
const DEMO_BTC_PRICE_NGN = 150_000_000; // demo placeholder rate, not a live price
const RECEIPT_COUNT = Number(process.env.SEED_RECEIPTS || "10");
const RECEIPT_SATS = Number(process.env.SEED_RECEIPT_SATS || "100");
const FUND_SATS = Number(process.env.SEED_FUND_SATS || "100000");

const ngnToSats = (ngn) => Math.round((ngn / DEMO_BTC_PRICE_NGN) * 100_000_000); // same rounding as packages/shared conversion.ts
const SCOPE_SATS = ngnToSats(DAILY_BUDGET_NGN); // 33,333
const OVER_BUDGET_SATS = ngnToSats(OVER_BUDGET_NGN); // 46,667

const out = {
  seededAt: new Date().toISOString(),
  market: "Lagos, Nigeria",
  merchant: {},
  supplier: { id: SUPPLIER_ID, name: SUPPLIER_NAME },
  mediator: { name: MEDIATOR },
  scope: {},
  receipts: [],
  blocked: [],
  notes: [],
};

function log(msg) {
  console.log(`[seed] ${msg}`);
}
function fail(msg) {
  console.error(`[seed] FATAL: ${msg}`);
  process.exit(1);
}

async function j(method, url, { token, apiKey, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (apiKey) headers["X-Api-Key"] = apiKey;
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`${method} ${url} -> HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  return data;
}

async function relayReachable() {
  try {
    const ws = new WebSocket(RELAY_URL);
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("timeout")), 3000);
      ws.onopen = () => {
        clearTimeout(t);
        resolve();
      };
      ws.onerror = (e) => {
        clearTimeout(t);
        reject(e);
      };
    });
    ws.close();
    return true;
  } catch {
    return false;
  }
}

async function ensureRelay() {
  if (await relayReachable()) {
    log(`relay already up at ${RELAY_URL}`);
    return;
  }
  log(`relay not reachable at ${RELAY_URL} — starting scripts/local-relay.mjs`);
  const port = new URL(RELAY_URL).port || "7777";
  const child = spawn(process.execPath, [join(ROOT, "scripts", "local-relay.mjs"), port], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await relayReachable()) {
      log(`relay started at ${RELAY_URL} (pid ${child.pid})`);
      return;
    }
  }
  fail(`local relay did not come up at ${RELAY_URL}`);
}

// Synthetic funding: LNbits has no top-up endpoint. Insert a labelled
// `success` ledger row, exactly as the Day-1 spike did. Test-only.
function fundWallet(walletId, amountSats, memo) {
  const dbPath = join(LNBITS_DATA_FOLDER, "database.sqlite3");
  if (!existsSync(dbPath)) {
    fail(
      `LNbits DB not found at ${dbPath}. Set LNBITS_DATA_FOLDER to the ` +
        `LNbits data folder, or pre-fund the merchant wallet and re-run with SEED_SKIP_FUND=1.`,
    );
  }
  const db = new DatabaseSync(dbPath);
  try {
    const hash = createHash("sha256").update(randomBytes(32)).digest("hex");
    const now = Math.floor(Date.now() / 1000);
    db.prepare(
      `INSERT INTO apipayments (checking_id, amount, fee, wallet_id, memo, time, payment_hash, preimage, extra, status)
       VALUES (?, ?, 0, ?, ?, ?, ?, NULL, '{}', 'success')`,
    ).run(hash, amountSats * 1000, walletId, memo, now, hash);
    log(`funded wallet ${walletId.slice(0, 8)}… with ${amountSats.toLocaleString()} test sats (synthetic ledger credit, labelled)`);
  } finally {
    db.close();
  }
}

const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);

// --- 0. Preconditions -------------------------------------------------------
const health = await j("GET", `${API_URL}/health`).catch((e) => fail(`API not reachable at ${API_URL} — run \`npm run dev\` first. (${e.message})`));
log(`API ok: ${health.service} v${health.version} (holdsFunds=${health.holdsFunds})`);
await j("GET", `${LNBITS_URL}/api/v1/health`).catch((e) =>
  fail(`LNbits not reachable at ${LNBITS_URL}. (${e.message})`),
);
log(`LNbits ok at ${LNBITS_URL}`);
await ensureRelay();

// --- 1. Admin login + fresh wallets ------------------------------------------
const login = await j("POST", `${LNBITS_URL}/api/v1/auth`, {
  body: { username: ADMIN_USER, password: ADMIN_PASSWORD },
});
if (!login.access_token) fail("LNbits admin login returned no access_token");
const jwt = login.access_token;

async function makeWallet(name) {
  const w = await j("POST", `${LNBITS_URL}/api/v1/wallet`, {
    token: jwt,
    body: { name, wallet_type: "lightning" },
  });
  log(`wallet ${name}: id=${w.id}`);
  return w;
}
const merchant = await makeWallet(`lighnib-demo-merchant-${stamp}`);
const supplier = await makeWallet(`lighnib-demo-supplier-${stamp}`);

// --- 2. Fund merchant (test-only synthetic credit) --------------------------
if (!SKIP_FUND) {
  fundWallet(
    merchant.id,
    FUND_SATS,
    "seed-test-funding (synthetic ledger credit, FakeWallet test instance only)",
  );
} else {
  out.notes.push("SEED_SKIP_FUND=1 — merchant wallet was NOT funded by the seed; pre-funded externally.");
}
const merchantWallet = await j("GET", `${LNBITS_URL}/api/v1/wallet`, { apiKey: merchant.adminkey });
log(`merchant balance: ${(merchantWallet.balance / 1000).toLocaleString()} sats`);

// --- 3. NWC connections (permissions are GROUP names) -----------------------
const nowSec = Math.floor(Date.now() / 1000);
async function registerNWC(wallet, description, permissions, budgets) {
  const secret = generateSecretKey();
  const pubkey = getPublicKey(secret);
  const secretHex = Buffer.from(secret).toString("hex");
  await j("PUT", `${LNBITS_URL}/nwcprovider/api/v1/nwc/${pubkey}`, {
    apiKey: wallet.adminkey,
    body: { description, expires_at: nowSec + 8 * 3600, permissions, budgets },
  });
  const pairing = await j("GET", `${LNBITS_URL}/nwcprovider/api/v1/pairing/${secretHex}`);
  // The pairing URI carries the relay as a URL-encoded query param and
  // may write it as localhost where we configured 127.0.0.1 — same host.
  const relayParam = new URL(decodeURIComponent(pairing)).searchParams.get("relay") ?? "";
  const relayHost = new URL(relayParam || RELAY_URL).host.replace("localhost", "127.0.0.1");
  const wantHost = new URL(RELAY_URL).host.replace("localhost", "127.0.0.1");
  if (relayHost !== wantHost) {
    out.notes.push(
      `WARNING: NWC pairing URI uses relay ${relayParam}, not ${RELAY_URL}. ` +
        `The LNbits NWC provider relay (ext_nwcprovider.sqlite3 config.relay) must point at the local relay for this VM.`,
    );
  }
  return { pubkey, uri: pairing };
}
const merchantNWC = await registerNWC(
  merchant,
  `lighnib-demo-merchant-${stamp}`,
  ["pay", "lookup", "history", "balance", "info"],
  [{ budget_msats: SCOPE_SATS * 1000, refresh_window: 86400, created_at: nowSec }],
);
log(`merchant NWC registered: budget ${SCOPE_SATS.toLocaleString()} sats/day (= ₦${DAILY_BUDGET_NGN.toLocaleString()} at demo rate)`);
const supplierNWC = await registerNWC(
  supplier,
  `lighnib-demo-supplier-${stamp}`,
  ["invoice", "lookup", "balance", "info"],
  [],
);

// --- 4. Login through the real API (scope creation) --------------------------
const scope = await j("POST", `${API_URL}/api/scope/login`, {
  body: {
    walletPubkey: merchantNWC.pubkey,
    dailyBudgetSats: SCOPE_SATS,
    dailyBudgetFiat: DAILY_BUDGET_NGN,
    currency: "NGN",
    sessionHours: 8,
  },
});
out.scope = {
  id: scope.id,
  dailyBudgetSats: scope.dailyBudgetSats,
  dailyBudgetFiat: scope.dailyBudgetFiat,
  currency: scope.currency,
  expiresAt: scope.expiresAt,
  state: scope.state,
};
log(`scope created: ${scope.id} — ₦${DAILY_BUDGET_NGN.toLocaleString()}/day (${SCOPE_SATS.toLocaleString()} sats)`);

// --- 5. Ten bound receipts, paid live ---------------------------------------
const client = new NWCClient({ nostrWalletConnectUrl: merchantNWC.uri });
const info = await client.getInfo();
log(`NWC connected: alias=${info.alias} methods=${(info.methods || []).join(",")}`);

async function createInvoice(apiKey, amountSats, memo) {
  return j("POST", `${LNBITS_URL}/api/v1/payments`, {
    apiKey,
    body: { out: false, amount: amountSats, memo },
  });
}

for (let i = 1; i <= RECEIPT_COUNT; i++) {
  const orderId = `ORD-SEED-${stamp}-${String(i).padStart(2, "0")}`;
  const memo = `Lighnib:order#${orderId}:${SUPPLIER_ID}`;
  const inv = await createInvoice(supplier.adminkey, RECEIPT_SATS, memo);
  await j("POST", `${API_URL}/api/invoices`, {
    body: {
      paymentHash: inv.payment_hash,
      supplierId: SUPPLIER_ID,
      orderId,
      amountSats: RECEIPT_SATS,
      memo,
    },
  });
  // Scope state machine: LOGGED_IN/RECEIPTED → PAYING before the wallet
  // is asked (same order as the web flow), then settle after payment.
  await j("POST", `${API_URL}/api/scope/${scope.id}/begin-payment`, {
    body: { amountSats: RECEIPT_SATS },
  });
  const paid = await client.payInvoice({ invoice: inv.payment_request });
  if (!paid?.preimage) fail(`receipt ${i}: wallet did not return a preimage`);
  const receipt = await j("POST", `${API_URL}/api/receipts`, {
    body: {
      id: `rcpt_seed_${stamp}_${String(i).padStart(2, "0")}`,
      orderId,
      supplierId: SUPPLIER_ID,
      vendorName: SUPPLIER_NAME,
      purpose: `Demo order ${i} — provisions from Balogun market`,
      amountSats: RECEIPT_SATS,
      amountFiat: 0,
      currency: "NGN",
      paymentHash: inv.payment_hash,
      preimage: paid.preimage,
      payerPubkey: merchantNWC.pubkey,
    },
  });
  const verified = await j("GET", `${API_URL}/api/receipts/${receipt.id}/verify`);
  if (!verified.valid) fail(`receipt ${i}: API verification failed`);
  await j("POST", `${API_URL}/api/scope/${scope.id}/settle-payment`, {
    body: { amountSats: RECEIPT_SATS },
  });
  // Store the FULL bound receipt (incl. preimage + Nostr event) so a
  // third party can verify it offline from this file alone — paste it
  // into /receipts "Verify a receipt you receive". No secrets: the
  // preimage is public settlement proof, not a credential.
  out.receipts.push(receipt);
  log(`receipt ${i}/${RECEIPT_COUNT}: ${receipt.id} — ${RECEIPT_SATS} sats, verified`);
}

// --- 6. Blocked #1 — wallet refuses over-budget (QUOTA_EXCEEDED, verbatim) ---
const overOrderId = `ORD-SEED-${stamp}-OVER`;
const invOver = await createInvoice(
  supplier.adminkey,
  OVER_BUDGET_SATS, // 46,667 sats = ₦70,000 at the demo rate
  `Lighnib:order#${overOrderId}:${SUPPLIER_ID}`,
);
await j("POST", `${API_URL}/api/invoices`, {
  body: {
    paymentHash: invOver.payment_hash,
    supplierId: SUPPLIER_ID,
    orderId: overOrderId,
    amountSats: OVER_BUDGET_SATS,
    memo: `Lighnib:order#${overOrderId}:${SUPPLIER_ID}`,
  },
});
let quotaError = "";
try {
  await client.payInvoice({ invoice: invOver.payment_request });
  fail("blocked #1: over-budget payment SUCCEEDED — wallet budget NOT enforced!");
} catch (e) {
  quotaError = `${e.code || e.name || ""} ${e.message || ""}`.trim();
  if (!/QUOTA_EXCEEDED/i.test(quotaError)) {
    fail(`blocked #1: wallet refused, but NOT with QUOTA_EXCEEDED: ${quotaError.slice(0, 200)}`);
  }
}
out.blocked.push({
  kind: "wallet-quota-exceeded",
  orderId: overOrderId,
  amountSats: OVER_BUDGET_SATS,
  amountNgn: OVER_BUDGET_NGN,
  walletError: quotaError,
  note: "Direct NWC pay, bypassing the app — the wallet itself refuses. In the web flow the app scope check (INV-2) refuses the same invoice first.",
});
log(`blocked #1: wallet refused ₦${OVER_BUDGET_NGN.toLocaleString()} invoice — ${quotaError.slice(0, 120)}`);

// --- 7. Blocked #2 — app INV-9 refuses unknown hash, zero wallet requests ---
const balanceBefore = (await j("GET", `${LNBITS_URL}/api/v1/wallet`, { apiKey: merchant.adminkey })).balance;
const invWrong = await createInvoice(
  supplier.adminkey,
  50,
  `Lighnib:order#${overOrderId}-WRONG:supplier-other-999`,
);
// Deliberately NOT recorded: the hash is unknown to the app.
const decoded = await j("POST", `${API_URL}/api/invoices/decode`, {
  body: { invoice: invWrong.payment_request },
});
const check = await j("POST", `${API_URL}/api/invoices/check`, {
  body: { paymentHash: decoded.paymentHash, supplierId: "supplier-other-999", amountSats: 50 },
});
if (check.allowed || check.reason !== "UNKNOWN_INVOICE_HASH") {
  fail(`blocked #2: INV-9 did not refuse the unknown hash as expected: ${JSON.stringify(check)}`);
}
const balanceAfter = (await j("GET", `${LNBITS_URL}/api/v1/wallet`, { apiKey: merchant.adminkey })).balance;
if (balanceAfter !== balanceBefore) {
  fail(`blocked #2: merchant balance changed (${balanceBefore} → ${balanceAfter} msat) — a wallet request must have happened`);
}
out.blocked.push({
  kind: "app-inv9-unknown-hash",
  orderId: `${overOrderId}-WRONG`,
  amountSats: 50,
  supplierId: "supplier-other-999",
  appRefusal: check.reason,
  walletRequestsMade: 0,
  merchantBalanceMsatUnchanged: balanceBefore === balanceAfter,
  note: "INV-9 refused before any wallet request — balance verified unchanged.",
});
log(`blocked #2: INV-9 refused unknown hash (supplier-other-999) — merchant balance unchanged`);

// --- 8. Write outputs ---------------------------------------------------------
mkdirSync(SEED_DIR, { recursive: true });
out.merchant = {
  walletId: merchant.id,
  walletPubkey: merchantNWC.pubkey,
  scopeId: scope.id,
  fundedTestSats: SKIP_FUND ? 0 : FUND_SATS,
  spentTestSats: RECEIPT_COUNT * RECEIPT_SATS,
};
const demoDataPath = join(SEED_DIR, "demo-data.json");
writeFileSync(demoDataPath, JSON.stringify(out, null, 2));
const creds = {
  note: "DEMO CREDENTIALS — bearer secrets. Never commit, never share, never log. Mode 600.",
  merchantNwcUri: merchantNWC.uri,
  supplierNwcUri: supplierNWC.uri,
  merchantAdminKey: merchant.adminkey,
  supplierAdminKey: supplier.adminkey,
  merchantWalletId: merchant.id,
  supplierWalletId: supplier.id,
};
const credsPath = join(SEED_DIR, ".demo-credentials.json");
writeFileSync(credsPath, JSON.stringify(creds, null, 2));
chmodSync(credsPath, 0o600);

console.log(`
========== LIGHNIB DEMO SEED — DONE ==========
Merchant wallet : ${merchant.id}
Supplier        : ${SUPPLIER_ID} (${SUPPLIER_NAME})
Mediator        : ${MEDIATOR} (named record — live hold is CUT, receipt-only MVP)
Scope           : ${scope.id} — ₦${DAILY_BUDGET_NGN.toLocaleString()}/day (${SCOPE_SATS.toLocaleString()} sats)
Receipts        : ${out.receipts.length} live payments, all verified (seed/demo-data.json)
Blocked #1      : wallet QUOTA_EXCEEDED on ₦${OVER_BUDGET_NGN.toLocaleString()} invoice
Blocked #2      : app INV-9 UNKNOWN_INVOICE_HASH, 0 wallet requests
Demo login      : paste the merchant NWC URI into http://localhost:3000/login
                  (URI is in seed/.demo-credentials.json, mode 600 — it is a
                  bearer secret, never share it)
Happy path      : login → /pay → paste a supplier invoice → bound receipt
===============================================
`);

// Close the NWC relay connection, or Node never exits (open WebSocket).
client.close?.();
process.exit(0);
