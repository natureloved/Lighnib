/**
 * thursday.test.ts — Pidgin copy pass (§8 Thu 19).
 *
 * Rule: no user-facing string may contain internal jargon — invariant
 * codes (INV-), wallet error codes (QUOTA_EXCEEDED, SCOPE_*), protocol
 * names (NWC, BOLT11, get_budget, Nostr) or byte-level terms (32-byte).
 * Product names (LNbits NWC in the wallet list) are not prose and are
 * out of scope for this scan — it walks LOCALE.copy only.
 *
 * Field labels on the receipt card ("hash:", "preimage:") are data labels
 * for the proof itself, not prose; they are not in LOCALE.copy and are
 * covered by the manual pass, not this test.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { LOCALE, scopeStateLabel, type ScopeState } from "@lighnib/shared";
import { budgetRefusalMessage } from "../apps/web/src/lib/pay-flow";

const BANNED = [
  "INV-",
  "QUOTA_EXCEEDED",
  "get_budget",
  "32-byte",
  "BOLT11",
  "NWC",
  "SCOPE_",
  "Nostr",
] as const;

/** Collect every string leaf under an object (functions are skipped). */
function stringLeaves(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (value && typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      stringLeaves(v, out);
    }
  }
  return out;
}

test("copy: no LOCALE.copy string contains internal jargon", () => {
  const leaves = stringLeaves(LOCALE.copy);
  assert.ok(leaves.length > 20, `expected many copy strings, got ${leaves.length}`);
  for (const text of leaves) {
    for (const token of BANNED) {
      assert.ok(
        !text.includes(token),
        `copy contains banned token ${token}: ${JSON.stringify(text)}`,
      );
    }
  }
});

test("copy: payOverBudget output is plain Pidgin with the remaining shown", () => {
  const text = LOCALE.copy.payOverBudget(33_183);
  assert.match(text, /This invoice pass your daily scope/);
  assert.match(text, /Remaining: 33,183 sats/);
  for (const token of BANNED) {
    assert.ok(!text.includes(token), `payOverBudget contains ${token}`);
  }
});

test("copy: scope states have plain-words labels, never the raw code", () => {
  const states: ScopeState[] = [
    "UNREGISTERED",
    "LOGGED_IN",
    "PAYING",
    "RECEIPTED",
    "DISPUTED",
    "RESOLVED",
    "REFUNDED",
    "REVOKED",
  ];
  for (const state of states) {
    const label = scopeStateLabel(state);
    assert.notEqual(label, state, `${state} must not be shown raw`);
    assert.ok(label.length > 0, `${state} needs a label`);
    assert.ok(!label.includes("_"), `${state} label must not look like a code: ${label}`);
  }
  assert.equal(scopeStateLabel("LOGGED_IN"), "Logged in");
  assert.equal(scopeStateLabel("RECEIPTED"), "Receipt don land");
  assert.equal(scopeStateLabel("REVOKED"), "Revoked");
});

test("copy: budget refusal maps every reason code to plain Pidgin", () => {
  assert.match(budgetRefusalMessage("QUOTA_EXCEEDED", 100), /pass your daily scope/);
  assert.match(budgetRefusalMessage("SCOPE_REVOKED", 100), /don revoke/);
  assert.match(budgetRefusalMessage("SCOPE_EXPIRED", 100), /don expire/);
  assert.match(budgetRefusalMessage("SCOPE_NOT_LIVE", 100), /don expire/);
  assert.match(budgetRefusalMessage(undefined, 100), /pass your daily scope/);
  for (const reason of ["QUOTA_EXCEEDED", "SCOPE_REVOKED", "SCOPE_EXPIRED", undefined]) {
    const text = budgetRefusalMessage(reason, 100);
    for (const token of BANNED) {
      assert.ok(!text.includes(token), `refusal for ${reason} contains ${token}`);
    }
  }
});

test("copy: verify checklist has all six checks in plain words", () => {
  const labels = LOCALE.copy.verifyCheckLabels;
  const keys = Object.keys(labels);
  assert.deepEqual(
    [...keys].sort(),
    ["complete", "hashFormat", "nostrEventMatches", "preimageFormat", "preimageMatchesHash", "settled"],
  );
  for (const text of Object.values(labels)) {
    for (const token of BANNED) {
      assert.ok(!text.includes(token), `verify label contains ${token}: ${text}`);
    }
  }
});

/**
 * Navigation regression (Bug E, found Thu by the 3G/browser pass):
 * the session (incl. the NWC secret) lives in module memory only
 * (INV-8) — a plain <a href> full-reloads the page and wipes it, so
 * login → pay lost the session. In-app links must be Next <Link>
 * (client-side navigation, module state survives).
 */
test("nav: no plain <a> links to in-app routes (session would be lost)", async () => {
  const { readdir, readFile } = await import("node:fs/promises");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "apps", "web", "src");
  const files: string[] = [];
  async function walk(dir: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) await walk(p);
      else if (p.endsWith(".tsx")) files.push(p);
    }
  }
  await walk(root);
  assert.ok(files.length > 5, `expected web source files, got ${files.length}`);
  for (const f of files) {
    const src = await readFile(f, "utf8");
    assert.ok(!/<a\s+href="\//.test(src), `${f} uses a plain <a href="/…"> — use next/link`);
    assert.ok(!/<a\s+href=\{`/.test(src), `${f} uses a plain <a href={\`…\`}> — use next/link`);
    // A <button> nested in a <Link> full-reloads in this Next 16 build
    // (verified live: window marker dies, navigation entry appears) —
    // the in-memory session is lost. Buttons navigate via router.push.
    assert.ok(
      !/<Link[^>]*>\s*<button/.test(src),
      `${f} nests a <button> inside a <Link> — use router.push on the button instead`,
    );
  }
});
