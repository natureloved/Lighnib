/**
 * scope.ts, scope store + state machine (INV-1, INV-2, INV-4).
 * In-memory store for the demo skeleton; the API holds NO funds and
 * never sees the NWC secret, scopes carry only the wallet pubkey
 * (identity) and the budget (public scope data).
 */

import {
  checkSpend,
  createScope,
  isScopeLive,
  recordSpend,
  revokeScope,
  transitionScope,
  type BudgetCheck,
  type Scope,
} from "@lighnib/shared";

const scopes = new Map<string, Scope>();

export function createScopeRecord(input: {
  walletPubkey: string;
  dailyBudgetSats: number;
  dailyBudgetFiat: number;
  currency: Scope["currency"];
  sessionHours: number;
}): Scope {
  const id = `scope_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const scope = createScope({ id, ...input });
  scopes.set(id, scope);
  return scope;
}

export function getScope(id: string): Scope | undefined {
  return scopes.get(id);
}

export function listScopes(): Scope[] {
  return [...scopes.values()];
}

/** INV-2 server re-check (wallet is the primary enforcer). */
export function checkScopeSpend(id: string, amountSats: number): BudgetCheck {
  const scope = scopes.get(id);
  if (!scope) {
    return { allowed: false, reason: "SCOPE_NOT_LIVE", remainingSats: 0 };
  }
  return checkSpend(scope, amountSats);
}

/** Move a scope into PAYING before a wallet payment request. */
export function beginPayment(id: string, amountSats: number): Scope {
  const scope = scopes.get(id);
  if (!scope) throw new Error(`Unknown scope: ${id}`);
  const check = checkSpend(scope, amountSats);
  if (!check.allowed) {
    throw new Error(`Payment refused: ${check.reason} (remaining ${check.remainingSats} sats)`);
  }
  if (!isScopeLive(scope)) throw new Error("Scope is not live");
  const next: Scope = { ...scope, state: transitionScope(scope.state, "PAYING") };
  scopes.set(id, next);
  return next;
}

/** After wallet settlement, record the spend (PAYING → RECEIPTED).
 *  Idempotent per payment hash: a reconcile that replays the same hash
 *  returns the scope unchanged instead of double-counting the spend. */
const settledPaymentHashes = new Map<string, Set<string>>();

export function settlePayment(
  id: string,
  amountSats: number,
  paymentHash?: string,
): Scope {
  const scope = scopes.get(id);
  if (!scope) throw new Error(`Unknown scope: ${id}`);
  if (paymentHash) {
    const settled = settledPaymentHashes.get(id);
    if (settled?.has(paymentHash)) return scope;
  }
  const next = recordSpend(scope, amountSats);
  scopes.set(id, next);
  if (paymentHash) {
    const settled = settledPaymentHashes.get(id) ?? new Set<string>();
    settled.add(paymentHash);
    settledPaymentHashes.set(id, settled);
  }
  return next;
}

/** A failed/refused payment returns the scope to LOGGED_IN (no spend recorded). */
export function cancelPayment(id: string): Scope {
  const scope = scopes.get(id);
  if (!scope) throw new Error(`Unknown scope: ${id}`);
  if (scope.state !== "PAYING") return scope;
  const next: Scope = { ...scope, state: transitionScope("PAYING", "LOGGED_IN") };
  scopes.set(id, next);
  return next;
}

/** INV-4: revoke = logout. */
export function revokeScopeRecord(id: string): Scope {
  const scope = scopes.get(id);
  if (!scope) throw new Error(`Unknown scope: ${id}`);
  const next = revokeScope(scope);
  scopes.set(id, next);
  return next;
}
