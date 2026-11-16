/**
 * Scope state machine tests — INV-1, INV-2, INV-4.
 * Covers ALL transitions of:
 * UNREGISTERED → LOGGED_IN → PAYING → RECEIPTED → DISPUTED →
 * RESOLVED | REFUNDED → REVOKED
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  SCOPE_TRANSITIONS,
  checkSpend,
  createScope,
  isScopeLive,
  recordSpend,
  revokeScope,
  transitionScope,
  type Scope,
  type ScopeState,
} from "../packages/shared/src/index";

function liveScope(overrides: Partial<Scope> = {}): Scope {
  return {
    ...createScope({
      id: "scope_test",
      walletPubkey: "a".repeat(64),
      dailyBudgetSats: 50_000,
      dailyBudgetFiat: 50_000,
      currency: "NGN",
      sessionHours: 8,
    }),
    ...overrides,
  };
}

test("every declared transition is accepted", () => {
  for (const [from, tos] of Object.entries(SCOPE_TRANSITIONS) as [ScopeState, ScopeState[]][]) {
    for (const to of tos) {
      assert.equal(transitionScope(from, to), to, `${from} → ${to}`);
    }
  }
});

test("every undeclared transition throws", () => {
  const states = Object.keys(SCOPE_TRANSITIONS) as ScopeState[];
  for (const from of states) {
    for (const to of states) {
      if (SCOPE_TRANSITIONS[from].includes(to)) continue;
      assert.throws(() => transitionScope(from, to), /Illegal scope transition/, `${from} → ${to}`);
    }
  }
});

test("full happy path: UNREGISTERED → … → REVOKED", () => {
  let s: ScopeState = "UNREGISTERED";
  s = transitionScope(s, "LOGGED_IN");
  s = transitionScope(s, "PAYING");
  s = transitionScope(s, "RECEIPTED");
  s = transitionScope(s, "DISPUTED");
  s = transitionScope(s, "RESOLVED");
  s = transitionScope(s, "REVOKED");
  assert.equal(s, "REVOKED");
});

test("REFUNDED branch: DISPUTED → REFUNDED → REVOKED", () => {
  let s: ScopeState = "DISPUTED";
  s = transitionScope(s, "REFUNDED");
  s = transitionScope(s, "REVOKED");
  assert.equal(s, "REVOKED");
});

test("REVOKED is terminal — no transitions out", () => {
  assert.deepEqual(SCOPE_TRANSITIONS.REVOKED, []);
});

test("INV-1: scope is live only while NWC live (not expired, not revoked)", () => {
  assert.equal(isScopeLive(liveScope()), true);
  assert.equal(
    isScopeLive(liveScope({ expiresAt: new Date(Date.now() - 1000).toISOString() })),
    false,
  );
  assert.equal(isScopeLive(liveScope({ state: "REVOKED", revokedAt: new Date().toISOString() })), false);
  assert.equal(isScopeLive(liveScope({ state: "UNREGISTERED" })), false);
});

test("INV-2: over-budget spend refused with QUOTA_EXCEEDED", () => {
  const scope = liveScope({ spentTodaySats: 40_000 });
  const check = checkSpend(scope, 20_000);
  assert.equal(check.allowed, false);
  assert.equal(check.reason, "QUOTA_EXCEEDED");
  assert.equal(check.remainingSats, 10_000);
});

test("INV-2: exact-budget spend allowed; demo ₦70,000 over ₦50,000 scope refused", () => {
  const scope = liveScope({ dailyBudgetSats: 33_333 });
  assert.equal(checkSpend(scope, 33_333).allowed, true);
  assert.equal(checkSpend(scope, 33_334).allowed, false);
});

test("INV-2: expired scope refused with SCOPE_EXPIRED", () => {
  const scope = liveScope({ expiresAt: new Date(Date.now() - 1000).toISOString() });
  const check = checkSpend(scope, 100);
  assert.equal(check.allowed, false);
  assert.equal(check.reason, "SCOPE_EXPIRED");
});

test("INV-4: revoked scope never pays (revoke-before-spend)", () => {
  const scope = revokeScope(liveScope());
  assert.equal(scope.state, "REVOKED");
  const check = checkSpend(scope, 100);
  assert.equal(check.allowed, false);
  assert.equal(check.reason, "SCOPE_REVOKED");
});

test("recordSpend only from PAYING, moves to RECEIPTED and deducts budget", () => {
  const scope = liveScope({ state: "PAYING" });
  const next = recordSpend(scope, 5_000);
  assert.equal(next.state, "RECEIPTED");
  assert.equal(next.spentTodaySats, 5_000);
  assert.throws(() => recordSpend(liveScope(), 1), /Cannot record spend/);
});

test("revokeScope is idempotent-safe: revoking a revoked scope keeps it revoked", () => {
  const once = revokeScope(liveScope());
  const twice = revokeScope(once);
  assert.equal(twice.state, "REVOKED");
});
