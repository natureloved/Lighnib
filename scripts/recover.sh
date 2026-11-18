#!/usr/bin/env bash
# Lighnib Instabox auto-recovery.
# Restarts the demo backend stack (LNbits, relay, API) and fresh
# Cloudflare quick tunnels after the machine suspends/resumes, then
# rewires Vercel (NEXT_PUBLIC_API_URL) and the demo login file with
# the new tunnel URLs.
#
# Run ON the Instabox machine (it manages local processes + tunnels).
# Safe to run repeatedly: it only restarts what is down and only
# re-tunnels when the current tunnels are dead. Writes a status
# file to /tmp/lighnib-recover-status.json and logs to
# /tmp/lighnib-recover.log.
#
# The live frontend is on Vercel (lighnib.vercel.app). Only the API
# (3001) and relay (7777) tunnels matter for the live demo; the web
# dev server (3000) is local-only and is not tunnelled here.
set -u
REPO="$HOME/workspace/lighnib"
LOG="/tmp/lighnib-recover.log"
STATUS="/tmp/lighnib-recover-status.json"
CLOUDFLARED="$HOME/cloudflared"
mkdir -p "$(dirname "$LOG")"
exec >>"$LOG" 2>&1
echo "=== recover run $(date -u +%FT%TZ) ==="

# --- helpers ---------------------------------------------------------------
port_up() { # port_up <port> : true if something listens on localhost:<port>
  (exec 3<>/dev/tcp/127.0.0.1/"$1") 2>/dev/null
}
http_ok() { # http_ok <url> : true on HTTP 2xx/3xx within 8s
  local code
  code=$(curl -s -m 8 -o /dev/null -w "%{http_code}" "$1" 2>/dev/null || echo 000)
  case "$code" in 2*|3*) return 0;; *) return 1;; esac
}
tunnel_url() { # tunnel_url <port> : first trycloudflare URL from the tunnel log
  grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" "/tmp/tunnel2-$1.log" 2>/dev/null | head -1
}

# --- 1. LNbits (5000) -------------------------------------------------------
if ! port_up 5000; then
  echo "LNbits down, starting"
  cd "$REPO" && setsid nohup bash scripts/start-lnbits.sh > /tmp/lnbits-run.log 2>&1 < /dev/null &
  for _ in $(seq 1 30); do port_up 5000 && break; sleep 2; done
fi
port_up 5000 && echo "LNbits up on 5000" || echo "LNbits FAILED to start"

# --- 2. Relay (7777) ---------------------------------------------------------
if ! port_up 7777; then
  echo "relay down, starting"
  cd "$REPO" && setsid nohup node scripts/local-relay.mjs 7777 > /tmp/relay-run.log 2>&1 < /dev/null &
  for _ in $(seq 1 15); do port_up 7777 && break; sleep 2; done
fi
port_up 7777 && echo "relay up on 7777" || echo "relay FAILED to start"

# --- 3. API (3001) ------------------------------------------------------------
# The API is started by `npm run dev` (concurrently with web). If 3001 is
# down, restart the whole dev pair; web (3000) is local-only.
if ! port_up 3001; then
  echo "API down, restarting dev pair"
  pkill -f "concurrently.*@lighnib/api" 2>/dev/null || true
  sleep 2
  cd "$REPO" && setsid nohup npm run dev > /tmp/dev-run.log 2>&1 < /dev/null &
  for _ in $(seq 1 30); do port_up 3001 && break; sleep 2; done
fi
port_up 3001 && echo "API up on 3001" || echo "API FAILED to start"

# --- 4. Tunnels (API 3001, relay 7777) ----------------------------------------
# A tunnel is alive if its URL responds. Otherwise kill all cloudflared
# and start fresh ones; quick-tunnel URLs change on every restart.
need_tunnel=0
API_URL=$(tunnel_url 3001); RELAY_URL=$(tunnel_url 7777)
if [ -z "$API_URL" ] || ! http_ok "$API_URL/"; then
  echo "API tunnel dead/missing ($API_URL), will re-tunnel"; need_tunnel=1
fi
if [ -z "$RELAY_URL" ]; then
  echo "relay tunnel missing, will re-tunnel"; need_tunnel=1
fi
if [ "$need_tunnel" = "1" ]; then
  echo "killing old cloudflared"
  pkill -f "cloudflared tunnel" 2>/dev/null || true
  sleep 3
  rm -f /tmp/tunnel2-3001.log /tmp/tunnel2-7777.log
  setsid nohup "$CLOUDFLARED" tunnel --url http://127.0.0.1:3001 > /tmp/tunnel2-3001.log 2>&1 < /dev/null &
  setsid nohup "$CLOUDFLARED" tunnel --url http://127.0.0.1:7777 > /tmp/tunnel2-7777.log 2>&1 < /dev/null &
  # Wait for both URLs to appear in the logs (up to ~90s).
  for _ in $(seq 1 45); do
    API_URL=$(tunnel_url 3001); RELAY_URL=$(tunnel_url 7777)
    [ -n "$API_URL" ] && [ -n "$RELAY_URL" ] && break
    sleep 2
  done
  echo "new API tunnel: $API_URL"
  echo "new relay tunnel: $RELAY_URL"
fi

# --- 5. Rewire Vercel + demo login -------------------------------------------
# Only rewire when we have fresh URLs. Vercel env is build-time inlined,
# so changing NEXT_PUBLIC_API_URL needs a redeploy.
if [ -n "$API_URL" ] && [ -n "$RELAY_URL" ]; then
  RELAY_WSS="${RELAY_URL/https:/wss:}"
  # Vercel: set the API URL and redeploy production. Skip if unchanged.
  # NOTE: run vercel from the REPO ROOT, not apps/web. apps/web/.vercel
  # links to a stray project named "web"; the repo root .vercel links to
  # the real "lighnib" project that serves lighnib.vercel.app. Deploying
  # from the repo root also uploads the whole monorepo, so the
  # @lighnib/shared workspace package resolves (deploying from apps/web
  # alone fails npm install with a 404 for @lighnib/shared).
  CUR_API=$(cd "$REPO" && npx vercel env ls --environment=production 2>/dev/null | grep NEXT_PUBLIC_API_URL | awk '{print $2}' | head -1)
  if [ "$CUR_API" != "$API_URL" ]; then
    echo "Vercel NEXT_PUBLIC_API_URL: $CUR_API -> $API_URL"
    cd "$REPO" && printf "%s" "$API_URL" | npx vercel env rm NEXT_PUBLIC_API_URL --environment=production --yes 2>/dev/null || true
    cd "$REPO" && printf "%s" "$API_URL" | npx vercel env add NEXT_PUBLIC_API_URL --environment=production 2>/dev/null
    cd "$REPO" && npx vercel --prod --yes 2>&1 | tail -2
    echo "Vercel redeployed with API $API_URL"
  else
    echo "Vercel API URL unchanged ($API_URL), no redeploy"
  fi
  # Demo login file: rebuild the merchant NWC URI with the new relay.
  # The secret URI is stored in seed/.demo-credentials.json (mode 600).
  if [ -f "$REPO/seed/.demo-credentials.json" ]; then
    node - "$RELAY_WSS" <<'NODEEOF'
const fs = require("fs");
const path = require("path");
const creds = JSON.parse(fs.readFileSync(path.join(process.env.HOME, "workspace/lighnib/seed/.demo-credentials.json"), "utf8"));
const relay = process.argv[2];
function swapRelay(uri) {
  // NWC URI: nostr+walletconnect://<pubkey>?relay=<old>&secret=<s>&lud16=<l>
  const u = new URL(uri);
  u.searchParams.set("relay", relay);
  return u.toString();
}
const login = swapRelay(creds.merchantNwcUriPublic || creds.merchantNwcUri);
fs.writeFileSync(path.join(process.env.HOME, "workspace/lighnib-demo-login.txt"), login + "\n");
console.log("demo login regenerated with relay", relay);
NODEEOF
  fi
  # Status file for the watcher / humans.
  cat > "$STATUS" <<EOF
{"at":"$(date -u +%FT%TZ)","api":"$API_URL","relay":"$RELAY_URL","lnbits_up":$(port_up 5000 && echo true || echo false),"relay_up":$(port_up 7777 && echo true || echo false),"api_up":$(port_up 3001 && echo true || echo false)}
EOF
  echo "status written to $STATUS"
else
  echo "MISSING tunnel URLs (api='$API_URL' relay='$RELAY_URL'), not rewiring"
fi
echo "=== recover done $(date -u +%FT%TZ) ==="
