/**
 * video-raise.mjs — register a SECOND merchant NWC connection with a
 * raised ₦100,000/day budget (66,667 sats), for the "scope raised in one
 * tap" beat of the 90-second demo (§9 step 4).
 *
 * A wallet budget is fixed per NWC connection, so raising the scope
 * means a new connection — that is the honest product behaviour, and
 * the demo shows it: revoke the old login, connect the raised one, the
 * refused ₦70,000 invoice now goes through.
 *
 * Writes video-raise.json (mode 600 — NWC URI is a bearer secret).
 */
import { readFileSync, writeFileSync, chmodSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";

const DIR = "/home/hatch/workspace/hackathon-ideation-engine/runs/2026-11-16-dakar-winners-2026/thursday";
const LIGHNIB = "/home/hatch/workspace/lighnib";
const LNBITS_URL = process.env.LNBITS_URL || "http://127.0.0.1:5000";
const RAISED_NGN = 100_000;
const RAISED_SATS = 66_667;

const creds = JSON.parse(
  readFileSync(join(LIGHNIB, "seed", ".demo-credentials.json"), "utf8"),
);

async function j(method, url, { apiKey, body } = {}) {
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { "X-Api-Key": apiKey } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

const nowSec = Math.floor(Date.now() / 1000);
const secret = generateSecretKey();
const pubkey = getPublicKey(secret);
const secretHex = Buffer.from(secret).toString("hex");
await j("PUT", `${LNBITS_URL}/nwcprovider/api/v1/nwc/${pubkey}`, {
  apiKey: creds.merchantAdminKey,
  body: {
    description: `lighnib-demo-merchant-raised-${Date.now()}`,
    expires_at: nowSec + 8 * 3600,
    permissions: ["pay", "lookup", "history", "balance", "info"],
    budgets: [{ budget_msats: RAISED_SATS * 1000, refresh_window: 86400, created_at: nowSec }],
  },
});
const pairing = await j("GET", `${LNBITS_URL}/nwcprovider/api/v1/pairing/${secretHex}`);
const outPath = join(DIR, "video-raise.json");
writeFileSync(outPath, JSON.stringify({ at: new Date().toISOString(), raisedNgn: RAISED_NGN, raisedSats: RAISED_SATS, nwcUri: pairing }, null, 2));
chmodSync(outPath, 0o600);
console.log(`raised connection: ₦${RAISED_NGN.toLocaleString()}/day (${RAISED_SATS.toLocaleString()} sats) -> ${outPath}`);
