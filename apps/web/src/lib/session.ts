/**
 * session.ts, browser-memory-only session store (INV-8).
 *
 * The NWC secret lives in a module-level NwcSessionMemory instance:
 * - never localStorage, never sessionStorage, never a cookie,
 * - never sent to the API (the API rejects it anyway),
 * - never logged (logs go through scrubSecrets),
 * - wiped on revoke / page close (memory dies with the tab).
 *
 * Only public data (wallet pubkey, scope id) is kept alongside it.
 */

"use client";

import { NwcSessionMemory, type Scope } from "@lighnib/shared";

export const nwcSession = new NwcSessionMemory();

export interface SessionState {
  walletPubkey: string | null;
  scope: Scope | null;
  connected: boolean;
}

let state: SessionState = { walletPubkey: null, scope: null, connected: false };
const listeners = new Set<() => void>();

export function getSession(): SessionState {
  return state;
}

export function setSession(patch: Partial<SessionState>): void {
  state = { ...state, ...patch };
  for (const fn of listeners) fn();
}

export function subscribeSession(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Revoke = logout: wipe the secret from memory and clear the scope. */
export function logoutSession(): void {
  nwcSession.clear();
  setSession({ walletPubkey: null, scope: null, connected: false });
}
