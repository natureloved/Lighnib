/**
 * demo-login.ts, GET /api/demo-login, one-tap demo wallet login.
 *
 * The login page used to need a long connection string pasted from a file.
 * This endpoint serves the pre-funded demo merchant connection straight
 * from the API, so the login page can connect in one tap. The URI is the
 * SAME one already shared with judges via the Devpost zip (demo-login.txt),
 * so serving it here adds no new exposure: demo-only endpoint, test sats
 * only, the connection is revocable at any time and can only spend the
 * demo budget. The API still never sees a secret in a request body;
 * this is a read of the server-side seed file, never a client upload.
 *
 * Relay swap: tunnels rotate, so the stored URI's relay goes stale. When
 * the recover status file exists, its `relay` field holds the live tunnel
 * host and the URI's relay param is swapped to it. No status file (local
 * dev) means the stored URI is returned unchanged.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

/** A JSON reader, injectable so tests can pass fakes. */
export type JsonReader = (filePath: string) => Promise<unknown>;

/** Real JSON reader: read + parse a file. */
export async function readJsonFile(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8")) as unknown;
}

/**
 * Where the demo credentials live, relative to the API process cwd
 * (apps/api when run via `npm run dev`). First hit wins.
 */
export function demoCredsCandidates(): string[] {
  const cwd = process.cwd();
  return [
    path.resolve(cwd, "../../seed/.demo-credentials.json"),
    path.resolve(cwd, "seed/.demo-credentials.json"),
    path.resolve(cwd, "../seed/.demo-credentials.json"),
  ];
}

/** Recover status file: written by scripts/recover.sh, holds live tunnels. */
export const DEMO_STATUS_PATH = "/tmp/lighnib-recover-status.json";

export interface DemoLoginDeps {
  readCreds?: JsonReader;
  readStatus?: JsonReader;
  credsPath?: string;
  statusPath?: string;
}

/**
 * Return the demo merchant connection URI, with its relay param swapped
 * to the live tunnel host when the recover status file says so.
 * Throws when no demo credentials are configured.
 */
export async function getDemoLogin(
  deps: DemoLoginDeps = {},
): Promise<{ nwcUri: string }> {
  const readCreds = deps.readCreds ?? readJsonFile;
  const readStatus = deps.readStatus ?? readJsonFile;

  const credsPaths = deps.credsPath
    ? [deps.credsPath]
    : demoCredsCandidates();
  let creds: unknown;
  for (const p of credsPaths) {
    try {
      creds = await readCreds(p);
      break;
    } catch {
      // Try the next candidate; missing at every path is a 503 below.
    }
  }
  const uri = (creds as { merchantNwcUri?: unknown } | undefined)
    ?.merchantNwcUri;
  if (typeof uri !== "string" || !uri) {
    throw new Error(
      "Demo login is not configured: seed/.demo-credentials.json is missing or has no merchantNwcUri",
    );
  }

  let relayHost: string | null = null;
  try {
    const status = await readStatus(deps.statusPath ?? DEMO_STATUS_PATH);
    const relay = (status as { relay?: unknown } | undefined)?.relay;
    if (typeof relay === "string" && relay) {
      relayHost = new URL(relay).host;
    }
  } catch {
    // No status file (local dev): return the stored URI unchanged.
  }
  if (!relayHost) return { nwcUri: uri };

  const url = new URL(uri);
  url.searchParams.set("relay", `wss://${relayHost}`);
  return { nwcUri: url.toString() };
}
