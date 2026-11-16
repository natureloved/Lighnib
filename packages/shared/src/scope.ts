/**
 * Scope state machine + budget enforcement (INV-1, INV-2, INV-4).
 *
 * State machine (§4): UNREGISTERED → LOGGED_IN → PAYING → RECEIPTED →
 * DISPUTED → RESOLVED | REFUNDED → REVOKED
 *
 * Budget is enforced WALLET-side (NWC quota, QUOTA_EXCEEDED). The server
 * re-checks via get_budget where available — this module is that re-check.
 * Never claim the wallet enforces the supplier; that is INV-9 (inv9.ts).
 */

import type { BudgetCheck, Scope, ScopeState } from "./types";

export const SCOPE_TRANSITIONS: Record<ScopeState, ScopeState[]> = {
  UNREGISTERED: ["LOGGED_IN"],
  LOGGED_IN: ["PAYING", "REVOKED"],
  PAYING: ["RECEIPTED", "LOGGED_IN", "REVOKED"],
  RECEIPTED: ["DISPUTED", "PAYING", "REVOKED"],
  DISPUTED: ["RESOLVED", "REFUNDED", "REVOKED"],
  RESOLVED: ["REVOKED"],
  REFUNDED: ["REVOKED"],
  REVOKED: [],
};

/** Move a scope to the next state; throws on an illegal transition. */
export function transitionScope(state: ScopeState, next: ScopeState): ScopeState {
  if (!SCOPE_TRANSITIONS[state].includes(next)) {
    throw new Error(`Illegal scope transition: ${state} → ${next}`);
  }
  return next;
}

/** INV-1: a login is valid only while the NWC connection is live. */
export function isScopeLive(scope: Scope, now: Date = new Date()): boolean {
  if (scope.state === "REVOKED") return false;
  if (scope.revokedAt !== null) return false;
  if (new Date(scope.expiresAt).getTime() <= now.getTime()) return false;
  return scope.state !== "UNREGISTERED";
}

export function remainingBudgetSats(scope: Scope): number {
  return Math.max(0, scope.dailyBudgetSats - scope.spentTodaySats);
}

/**
 * INV-2: server-side budget re-check (wallet is the primary enforcer).
 * Over-budget → refused with QUOTA_EXCEEDED, before any wallet request.
 */
export function checkSpend(
  scope: Scope,
  amountSats: number,
  now: Date = new Date(),
): BudgetCheck {
  const remaining = remainingBudgetSats(scope);
  if (scope.state === "REVOKED" || scope.revokedAt !== null) {
    return { allowed: false, reason: "SCOPE_REVOKED", remainingSats: remaining };
  }
  if (new Date(scope.expiresAt).getTime() <= now.getTime()) {
    return { allowed: false, reason: "SCOPE_EXPIRED", remainingSats: remaining };
  }
  if (!isScopeLive(scope, now)) {
    return { allowed: false, reason: "SCOPE_NOT_LIVE", remainingSats: remaining };
  }
  if (amountSats > remaining) {
    return { allowed: false, reason: "QUOTA_EXCEEDED", remainingSats: remaining };
  }
  return { allowed: true, remainingSats: remaining };
}

/** Create a fresh scope for a login (state LOGGED_IN). */
export function createScope(input: {
  id: string;
  walletPubkey: string;
  dailyBudgetSats: number;
  dailyBudgetFiat: number;
  currency: Scope["currency"];
  sessionHours: number;
  now?: Date;
}): Scope {
  const now = input.now ?? new Date();
  return {
    id: input.id,
    walletPubkey: input.walletPubkey,
    state: "LOGGED_IN",
    dailyBudgetSats: input.dailyBudgetSats,
    spentTodaySats: 0,
    currency: input.currency,
    dailyBudgetFiat: input.dailyBudgetFiat,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + input.sessionHours * 3600_000).toISOString(),
    revokedAt: null,
  };
}

/** INV-4: revoke = logout. A revoked scope never pays again. */
export function revokeScope(scope: Scope, now: Date = new Date()): Scope {
  if (scope.state === "REVOKED") return scope;
  return {
    ...scope,
    state: transitionScope(scope.state, "REVOKED"),
    revokedAt: now.toISOString(),
  };
}

/** Record a settled spend against the scope (moves PAYING → RECEIPTED). */
export function recordSpend(scope: Scope, amountSats: number): Scope {
  if (scope.state !== "PAYING") {
    throw new Error(`Cannot record spend from state ${scope.state} (need PAYING)`);
  }
  return {
    ...scope,
    state: "RECEIPTED",
    spentTodaySats: scope.spentTodaySats + amountSats,
  };
}
