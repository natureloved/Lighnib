/**
 * Seed tests, the demo seed's output contract (scripts/seed.mjs).
 *
 * The seed itself needs live LNbits, so it is verified by running it
 * (see scripts/e2e-live.mts and TUESDAY-REPORT). These tests pin the
 * parts that must stay consistent without a live wallet:
 *   - the demo NGN→sats numbers the seed, the login page and the scope
 *     all agree on (via the shared conversion, not a copy);
 *   - the shape of seed/demo-data.json, so the demo UI and the e2e
 *     driver can rely on it, including that it carries NO secrets.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ngnToSats, satsToNgn, verifyReceipt } from "../packages/shared/src/index";

const DEMO_BTC_NGN = 84_000_000; // market rate as of Fri 2026-11-20 (config/locale.ts)

test("seed numbers agree with the shared conversion (login page, scope, seed)", () => {
  assert.equal(ngnToSats(50_000, DEMO_BTC_NGN), 59_524);
  assert.equal(ngnToSats(70_000, DEMO_BTC_NGN), 83_333);
  // The over-budget demo invoice must exceed the scope, or the wallet
  // refusal demo is meaningless.
  assert.ok(ngnToSats(70_000, DEMO_BTC_NGN) > ngnToSats(50_000, DEMO_BTC_NGN));
  // The diversified seed total fits inside the scope with room to spare.
  const seedTotal = [100, 200, 350, 500, 750, 1000, 1500, 2500, 5000, 10000].reduce((a, b) => a + b, 0);
  assert.equal(seedTotal, 21_900);
  assert.ok(seedTotal < ngnToSats(50_000, DEMO_BTC_NGN));
});

test("demo-data.json contract: 1+1+1+10+2, no secrets, all receipts verified", () => {
  const path = join(import.meta.dirname, "..", "seed", "demo-data.json");
  if (!existsSync(path)) {
    test.skip("seed has not been run yet, run `npm run seed` first");
    return;
  }
  const data = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  // 1 merchant + 1 supplier + 1 mediator.
  assert.ok((data.merchant as Record<string, unknown>).walletId);
  assert.equal((data.supplier as Record<string, unknown>).id, "supplier-balogun-001");
  assert.equal((data.mediator as Record<string, unknown>).name, "Lagos market association");
  // Scope matches the demo numbers.
  const scope = data.scope as Record<string, unknown>;
  assert.equal(scope.dailyBudgetSats, 59_524);
  assert.equal(scope.dailyBudgetFiat, 50_000);
  // 10 receipts, all verified, diversified across the three demo suppliers.
  // Each entry is the FULL bound receipt (incl. preimage + Nostr event),
  // so a third party can verify it offline from this file alone.
  const receipts = data.receipts as Record<string, unknown>[];
  assert.equal(receipts.length, 10);
  const expectedAmounts = [100, 200, 350, 500, 750, 1000, 1500, 2500, 5000, 10000];
  const allowedSuppliers = new Set(["supplier-balogun-001", "supplier-001", "supplier-002"]);
  const seenSuppliers = new Set<string>();
  for (let i = 0; i < receipts.length; i++) {
    const r = receipts[i];
    assert.equal(verifyReceipt(r as never), true);
    assert.equal(r.amountSats, expectedAmounts[i]);
    // Naira value at the demo rate (100 sats = ₦84), never ₦0.
    assert.equal(r.amountFiat, satsToNgn(r.amountSats as number, DEMO_BTC_NGN));
    assert.ok(allowedSuppliers.has(r.supplierId as string));
    seenSuppliers.add(r.supplierId as string);
    assert.equal(r.status, "SETTLED");
    assert.match(String(r.paymentHash), /^[0-9a-f]{64}$/);
    assert.match(String(r.preimage), /^[0-9a-f]{64}$/);
    assert.ok((r.nostrEvent as Record<string, unknown>).content);
  }
  // All three demo suppliers appear at least once.
  assert.equal(seenSuppliers.size, 3);
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
