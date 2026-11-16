// Minimal local Nostr relay (NIP-01 subset) for Lighnib demo/test use.
// Copied from the Day-1 spike (hackathon-ideation-engine/.../spike/).
// Test/demo-only: runs on localhost, in-memory store, no signature
// verification, no persistence, no rate limits. Sufficient for NWC
// (NIP-47) traffic: kinds 23194/23195, filters
// kinds/authors/#p/#e/since/until/limit. NOT part of the product — the
// shipped app works with any NWC relay the user's wallet uses.
// Usage: node scripts/local-relay.mjs [port]   (default 7777)
import { WebSocketServer } from "ws";

const PORT = Number(process.argv[2] || 7777);
const events = []; // stored events in arrival order
const subs = new Map(); // ws -> Map<subId, filters[]>

function tagValues(ev, name) {
  return ev.tags.filter((t) => t[0] === name).map((t) => t[1]);
}

function matches(ev, filter) {
  if (filter.ids && !filter.ids.includes(ev.id)) return false;
  if (filter.authors && !filter.authors.includes(ev.pubkey)) return false;
  if (filter.kinds && !filter.kinds.includes(ev.kind)) return false;
  if (filter.since && ev.created_at < filter.since) return false;
  if (filter.until && ev.created_at > filter.until) return false;
  for (const [key, vals] of Object.entries(filter)) {
    if (key.startsWith("#")) {
      const have = tagValues(ev, key.slice(1));
      if (!vals.some((v) => have.includes(v))) return false;
    }
  }
  return true;
}

function matchesAny(ev, filters) {
  return filters.some((f) => matches(ev, f));
}

const wss = new WebSocketServer({ port: PORT, host: "127.0.0.1" });
console.log(`[relay] listening ws://127.0.0.1:${PORT}`);

wss.on("connection", (ws) => {
  subs.set(ws, new Map());
  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      ws.send(JSON.stringify(["NOTICE", "invalid json"]));
      return;
    }
    const [type, ...rest] = msg;
    if (type === "EVENT") {
      const ev = rest[0];
      if (!ev || !ev.id || !ev.pubkey || typeof ev.kind !== "number" || !Array.isArray(ev.tags)) {
        ws.send(JSON.stringify(["OK", ev?.id || "", false, "invalid: malformed event"]));
        return;
      }
      if (!events.some((e) => e.id === ev.id)) events.push(ev);
      ws.send(JSON.stringify(["OK", ev.id, true, ""]));
      for (const [client, clientSubs] of subs) {
        if (client === ws || client.readyState !== 1) continue;
        for (const [subId, filters] of clientSubs) {
          if (matchesAny(ev, filters)) {
            client.send(JSON.stringify(["EVENT", subId, ev]));
            break;
          }
        }
      }
    } else if (type === "REQ") {
      const [subId, ...filters] = rest;
      if (!subId || filters.length === 0) {
        ws.send(JSON.stringify(["NOTICE", "invalid REQ"]));
        return;
      }
      subs.get(ws).set(subId, filters);
      let sent = 0;
      for (const ev of events) {
        const limit = filters.reduce((m, f) => Math.min(m, f.limit ?? Infinity), Infinity);
        if (sent >= limit) break;
        if (matchesAny(ev, filters)) {
          ws.send(JSON.stringify(["EVENT", subId, ev]));
          sent++;
        }
      }
      ws.send(JSON.stringify(["EOSE", subId]));
    } else if (type === "CLOSE") {
      subs.get(ws).delete(rest[0]);
    } else {
      ws.send(JSON.stringify(["NOTICE", `unknown message type: ${type}`]));
    }
  });
  ws.on("close", () => subs.delete(ws));
  ws.on("error", () => subs.delete(ws));
});
