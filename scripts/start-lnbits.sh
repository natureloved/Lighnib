#!/usr/bin/env bash
# Start local LNbits 1.7.1 (pip install) for Lighnib demo/dev.
# FakeWallet funding source, test sats only, no real funds.
# Persistent install (survives /tmp wipes): venv + data live under
# .local/ in this repo (gitignored). Replaces the spike's /tmp setup,
# which a service restart wiped on 2026-11-16.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export LNBITS_DATA_FOLDER="${LNBITS_DATA_FOLDER:-$ROOT/.local/lnbits-data}"
export LNBITS_BACKEND_WALLET_CLASS="${LNBITS_BACKEND_WALLET_CLASS:-FakeWallet}"
export LNBITS_ADMIN_UI=true
export LNBITS_SUPER_USER="${LNBITS_SUPER_USER:-$(cat "$ROOT/.local/superuser-id" 2>/dev/null || echo "")}"
export LNBITS_HOST="${LNBITS_HOST:-127.0.0.1}"
export LNBITS_PORT="${LNBITS_PORT:-5000}"
export LNBITS_LOG_LEVEL=INFO
# First-install token (deterministic, so the admin password can be set
# via PUT /api/v1/auth/first_install without reading the log).
export LNBITS_FIRST_INSTALL_TOKEN="${LNBITS_FIRST_INSTALL_TOKEN:-lighnib-first-install-2026}"
mkdir -p "$LNBITS_DATA_FOLDER"
# LNbits mounts static files via relative Path("lnbits","static"), it must
# run from a directory containing lnbits/static (the venv site-packages).
cd "$ROOT/.local/lnbits-venv/lib/python3.12/site-packages"
echo "Lighnib LNbits 1.7.1, data: $LNBITS_DATA_FOLDER port: $LNBITS_PORT superuser: $LNBITS_SUPER_USER"
exec "$ROOT/.local/lnbits-venv/bin/lnbits" --host "$LNBITS_HOST" --port "$LNBITS_PORT"
