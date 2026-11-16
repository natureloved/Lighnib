/**
 * Seed tests — the demo seed's output contract (scripts/seed.mjs).
 *
 * The seed itself needs live LNbits, so it is verified by running it
 * (see scripts/e2e-live.mts and TUESDAY-REPORT). These tests pin the
 * parts that must stay consistent without a live wallet:
 *   - the demo NGN→sats numbers the seed, the login page and the scope
 *     all agree on (via the shared conversion, not a copy);
 *   - the shape of seed/demo-data.json, so the demo UI and the e2e
 *     driver can rely on it — including that it carries NO secrets.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ngnToSats, verifyReceipt } from "../packages/shared/src/index";

const DEMO_BTC_NGN = 150_000_000; // demo placeholder rate (config/locale.ts)

test("seed numbers agree with the shared conversion (login page, scope, seed)", () => {
  assert.equal(ngnToSats(50_000, DEMO_BTC_NGN), 33_333);
  assert.equal(ngnToSats(70_000, DEMO_BTC_NGN), 46_667);
  // The over-budget demo invoice must exceed the scope, or the wallet
  // refusal demo is meaningless.
  assert.ok(ngnToSats(70_000, DEMO_BTC_NGN) > ngnToSats(50_000, DEMO_BTC_NGN));
  // Ten 100-sat receipts fit inside the scope with room to spare.
  assert.ok(10 * 100 < ngnToSats(50_000, DEMO_BTC_NGN));
});

test("demo-data.json contract: 1+1+1+10+2, no secrets, all receipts verified", () => {
  const path = join(import.meta.dirname, "..", "seed", "demo-data.json");
  if (!existsSync(path)) {
    test.skip("seed has not been run yet — run `npm run seed` first");
    return;
  }
  const data = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  // 1 merchant + 1 supplier + 1 mediator.
  assert.ok((data.merchant as Record<string, unknown>).walletId);
  assert.equal((data.supplier as Record<string, unknown>).id, "supplier-balogun-001");
  assert.equal((data.mediator as Record<string, unknown>).name, "Lagos market association");
  // Scope matches the demo numbers.
  const scope = data.scope as Record<string, unknown>;
  assert.equal(scope.dailyBudgetSats, 33_333);
  assert.equal(scope.dailyBudgetFiat, 50_000);
  // 10 receipts, all verified, all for the allowlisted supplier.
  // Each entry is the FULL bound receipt (incl. preimage + Nostr event),
  // so a third party can verify it offline from this file alone.
  const receipts = data.receipts as Record<string, unknown>[];
  assert.equal(receipts.length, 10);
  for (const r of receipts) {
    assert.equal(verifyReceipt(r as never), true);
    assert.equal(r.amountSats, 100);
    assert.equal(r.supplierId, "supplier-balogun-001");
    assert.equal(r.status, "SETTLED");
    assert.match(String(r.paymentHash), /^[0-9a-f]{64}$/);
    assert.match(String(r.preimage), /^[0-9a-f]{64}$/);
    assert.ok((r.nostrEvent as Record<string, unknown>).content);
  }
  // 2 blocked payments: wallet QUOTA_EXCEEDED + app INV-9, in that order.
  const blocked = data.blocked as Record<string, unknown>[];
  assert.equal(blocked.length, 2);
  assert.equal(blocked[0].kind, "wallet-quota-exceeded");
  assert.match(String(blocked[0].walletError), /QUOTA_EXCEEDED/i);
  assert.equal(blocked[0].amountNgn, 70_000);
  assert.equal(blocked[1].kind, "app-inv9-unknown-hash");
  assert.equal(blocked[1].appRefusal, "UNKNOWN_INVOICE_HASH");
  assert.equal(blocked[1].walletRequestsMade, 0);
  // No secrets anywhere in the committed demo data.
  const flat = JSON.stringify(data);
  assert.ok(!/nostr\+walletconnect:\/\//.test(flat), "demo-data.json must not contain NWC URIs");
  assert.ok(!/adminkey/i.test(flat), "demo-data.json must not contain admin keys");
  assert.ok(!/secret/i.test(flat), "demo-data.json must not contain secrets");
});
