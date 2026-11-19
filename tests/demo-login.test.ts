/**
 * Demo login tests, GET /api/demo-login logic (demo-login.ts).
 * The endpoint serves the pre-funded demo merchant connection URI, with
 * its relay param swapped to the live tunnel host when the recover
 * status file says so. Tests use fake readers, so no seed file or
 * status file is needed.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { getDemoLogin, type JsonReader } from "../apps/api/src/demo-login";

const PUBKEY = "a".repeat(64);
const STORED_URI =
  `nostr+walletconnect://${PUBKEY}` +
  "?relay=wss%3A%2F%2Fold.relay.example&secret=deadbeef&lud16=demo%40example.com";

function fakeReader(value: unknown, throws = false): JsonReader {
  return async (_path: string) => {
    if (throws) throw new Error("ENOENT: no such file");
    return value;
  };
}

test("demo login swaps the relay to the live tunnel host", async () => {
  const { nwcUri } = await getDemoLogin({
    readCreds: fakeReader({ merchantNwcUri: STORED_URI }),
    readStatus: fakeReader({
      relay: "https://new-tunnel.trycloudflare.com",
    }),
  });
  assert.ok(
    nwcUri.includes("relay=wss%3A%2F%2Fnew-tunnel.trycloudflare.com"),
    `relay not swapped: ${nwcUri.slice(0, 80)}`,
  );
  assert.ok(!nwcUri.includes("old.relay.example"), "old relay still present");
  assert.ok(nwcUri.includes(`nostr+walletconnect://${PUBKEY}`), "pubkey changed");
  assert.ok(nwcUri.includes("secret=deadbeef"), "secret dropped");
});

test("demo login returns the stored URI unchanged with no status file", async () => {
  const { nwcUri } = await getDemoLogin({
    readCreds: fakeReader({ merchantNwcUri: STORED_URI }),
    readStatus: fakeReader(null, true),
  });
  assert.equal(nwcUri, STORED_URI);
});

test("demo login returns the stored URI when the status file has no relay", async () => {
  const { nwcUri } = await getDemoLogin({
    readCreds: fakeReader({ merchantNwcUri: STORED_URI }),
    readStatus: fakeReader({ api: "https://api.example.com" }),
  });
  assert.equal(nwcUri, STORED_URI);
});

test("demo login fails when no demo credentials exist", async () => {
  await assert.rejects(
    getDemoLogin({
      readCreds: fakeReader(null, true),
      readStatus: fakeReader(null, true),
    }),
    /Demo login is not configured/,
  );
});

test("demo login fails when the credentials have no merchant URI", async () => {
  await assert.rejects(
    getDemoLogin({
      readCreds: fakeReader({ note: "seed without a merchant URI" }),
      readStatus: fakeReader(null, true),
    }),
    /has no merchantNwcUri/,
  );
});
