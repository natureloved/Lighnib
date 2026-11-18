/**
 * Security tests, INV-8 (bearer token).
 * The NWC secret must be browser-memory only: never localStorage,
 * never the server, never logs. Least privilege: pay_invoice only.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  FORBIDDEN_SECRET_KEYS,
  NWC_ALLOWED_METHODS,
  NwcSessionMemory,
  containsForbiddenSecretKey,
  containsSecret,
  scrubSecrets,
} from "../packages/shared/src/index";

const SECRET = "nostr+walletconnect://deadbeef".concat("00".repeat(29), "?secret=supersecretvalue&relay=wss://relay.test");

test("INV-8: least privilege, pay_invoice is the ONLY allowed NWC method", () => {
  assert.deepEqual([...NWC_ALLOWED_METHODS], ["pay_invoice"]);
});

test("INV-8: session holder never serialises the secret", () => {
  const session = new NwcSessionMemory();
  session.set(SECRET, 8 * 3600_000);
  const json = JSON.stringify({ session });
  assert.equal(containsSecret(json, SECRET), false);
  assert.equal(containsSecret(json, "supersecretvalue"), false);
  assert.equal(session.toJSON(), undefined);
});

test("INV-8: secret is usable in memory, then wiped on revoke/logout", () => {
  const session = new NwcSessionMemory();
  assert.equal(session.isLive, false);
  session.set(SECRET, 8 * 3600_000);
  assert.equal(session.isLive, true);
  const seen = session.use((s) => s);
  assert.equal(seen, SECRET);
  session.clear(); // revoke = logout
  assert.equal(session.isLive, false);
  assert.throws(() => session.use((s) => s), /no live NWC session/);
});

test("INV-8: expired session refuses use", () => {
  const session = new NwcSessionMemory();
  session.set(SECRET, -1000); // already expired
  assert.equal(session.isLive, false);
  assert.throws(() => session.use((s) => s), /no live NWC session/);
});

test("INV-8: forbidden secret keys are detected, including nested", () => {
  for (const key of FORBIDDEN_SECRET_KEYS) {
    assert.equal(containsForbiddenSecretKey({ [key]: "x" }), true, key);
  }
  assert.equal(
    containsForbiddenSecretKey({ scope: { nested: { nwcSecret: "x" } } }),
    true,
  );
  assert.equal(containsForbiddenSecretKey({ walletPubkey: "ab".repeat(32) }), false);
  assert.equal(containsForbiddenSecretKey({ amountSats: 100 }), false);
  assert.equal(containsForbiddenSecretKey(null), false);
  assert.equal(containsForbiddenSecretKey("plain string"), false);
});

test("INV-8: secret never appears in scrubbed logs", () => {
  const logLine = `paying invoice, session=${SECRET} amount=12500`;
  const scrubbed = scrubSecrets(logLine, [SECRET]);
  assert.equal(containsSecret(scrubbed, SECRET), false);
  assert.equal(containsSecret(scrubbed, "supersecretvalue"), false);
  assert.match(scrubbed, /\[REDACTED-NWC-SECRET\]/);
  assert.match(scrubbed, /amount=12500/); // non-secret content survives
});

test("INV-8: no localStorage usage in the shared package", async () => {
  // The shared package must not USE browser storage at all.
  // (Checked by source scan for actual API usage, the words may appear
  // in comments explaining the ban. The web app is audited separately.)
  const fs = await import("node:fs");
  const path = await import("node:path");
  const srcDir = path.resolve(import.meta.dirname, "../packages/shared/src");
  for (const file of fs.readdirSync(srcDir)) {
    const content = fs.readFileSync(path.join(srcDir, file), "utf8");
    assert.equal(/localStorage\s*\./.test(content), false, `${file} must not use localStorage`);
    assert.equal(/sessionStorage\s*\./.test(content), false, `${file} must not use sessionStorage`);
    assert.equal(/document\.cookie/.test(content), false, `${file} must not use cookies`);
  }
});
