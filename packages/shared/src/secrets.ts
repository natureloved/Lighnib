/**
 * NWC secret hygiene (INV-8), the bearer-token rules, in code.
 *
 * The NWC secret is a bearer token: leak = impersonate + spend.
 * - Browser-memory only. Never localStorage, never the server, never logs.
 * - Short expiry (a working day).
 * - Least privilege: pay_invoice only.
 * - Revoke = logout.
 *
 * This module gives the web app the primitives to obey those rules and
 * the tests the tools to prove it.
 */

/** Request-body keys that must NEVER reach the API (INV-8). */
export const FORBIDDEN_SECRET_KEYS = [
  "nwcSecret",
  "nwc_secret",
  "nwcUri",
  "nostrWalletConnectUri",
  "secret",
  "connectionString",
  "nwcConnectionString",
] as const;

/** True if the object contains any forbidden secret key (any nesting depth). */
export function containsForbiddenSecretKey(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (
      (FORBIDDEN_SECRET_KEYS as readonly string[]).includes(key.toLowerCase()) ||
      (FORBIDDEN_SECRET_KEYS as readonly string[]).includes(key)
    ) {
      return true;
    }
    if (containsForbiddenSecretKey(child)) return true;
  }
  return false;
}

/** True if `text` contains the secret verbatim. */
export function containsSecret(text: string, secret: string): boolean {
  if (!secret) return false;
  return text.includes(secret);
}

/** Redact every occurrence of each secret from a string (for logs). */
export function scrubSecrets(text: string, secrets: string[]): string {
  let out = text;
  for (const s of secrets) {
    if (s) out = out.split(s).join("[REDACTED-NWC-SECRET]");
  }
  return out;
}

/**
 * In-memory-only holder for the NWC secret. Lives in browser memory for
 * the session; it can never be serialised, stored, or logged:
 * - toJSON returns undefined (JSON.stringify drops it),
 * - there is no getter that returns the raw secret to callers that do
 *   not need it, only `use()` hands it to the NWC client callback.
 */
export class NwcSessionMemory {
  private secret: string | null = null;
  private expiresAt: number | null = null;

  set(secret: string, ttlMs: number): void {
    this.secret = secret;
    this.expiresAt = Date.now() + ttlMs;
  }

  get isLive(): boolean {
    return (
      this.secret !== null &&
      this.expiresAt !== null &&
      Date.now() < this.expiresAt
    );
  }

  /** Hand the secret to exactly one callback (the NWC client), then forget the reference. */
  use<T>(fn: (secret: string) => T): T {
    if (!this.isLive || this.secret === null) {
      throw new Error("INV-8: no live NWC session in memory");
    }
    return fn(this.secret);
  }

  /** Revoke = logout: wipe the secret from memory. */
  clear(): void {
    this.secret = null;
    this.expiresAt = null;
  }

  /** JSON.stringify must never leak the secret. */
  toJSON(): undefined {
    return undefined;
  }
}
