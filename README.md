# Lighnib — Small Lightning payments, locked.

> **Your wallet is the key. Lighnib it.**

Lighnib is wallet-as-key for local commerce (Dakar Bitcoin Hack 2026). A
merchant logs in to a supplier portal by connecting their Lightning wallet —
the NWC connection is the credential, and its budget is the permission
scope. Every payment is bound to the purchase as a verifiable receipt,
explained by AI and spoken aloud in Pidgin. Disputes go to one named
mediator (state machine built and unit-tested; live hold cut — see spike
verdict below). No password, no screenshot, no bank, no NIN.

**Honest security line:** Budget enforced by the wallet. Supplier enforced
by the app + bound receipt. Mediator sees any mismatch.

## Judge 5-min guide (start here)

You need: a phone or laptop, and any NWC wallet (Alby Hub ≥ v1.19.0,
Zeus, LNbits NWC, Mutiny, Coinos). **Phoenix has NO NWC — do not use it.**

1. **Run it** (2 min): `docker compose up` — or `npm install && npm run dev`
   (web on http://localhost:3000, api on http://localhost:3001).
   Then seed the demo world: `npm run seed` (1 merchant + 1 supplier +
   1 named mediator + 10 bound receipts + 2 blocked payments, all on
   local test sats). The seed prints the merchant NWC URI to paste at
   login. Requires local LNbits 1.7.1 + the local NWC relay — see Setup.
2. **Log in** (30 s): open `/login`, paste the merchant NWC connection URI
   from the seed output. Scope shows ₦50,000/day. No password, no form.
3. **Pay** (1 min): open `/pay`, pick supplier-balogun-001 (the seeded
   demo supplier), paste a supplier invoice. A bound receipt appears on
   settlement — AI-explained, spoken in Pidgin.
4. **Watch the two enforcers** (1 min):
   - A ₦70,000 invoice → **the app refuses it first** (over the ₦50,000
     scope, INV-2) before the wallet is ever asked. The wallet is the
     backstop: the seed log shows the same invoice refused directly by
     the wallet with verbatim `QUOTA_EXCEEDED`.
   - An invoice from a supplier not on the allowlist → **the app refuses
     before the wallet is ever asked** (INV-9 hash mismatch).
5. **Dispute** (code only — not live): the `/dispute` route and the
   dispute state machine exist and are unit-tested, but the live mediator
   hold is CUT for the MVP (see spike verdict). Do not demo a live dispute
   on the current wallet service.

Demo data is seeded by `npm run seed` (1 merchant + 1 supplier + 1 named
mediator + 10 bound receipts + 2 blocked payments). No real funds, no
token, no account to create.

## Tuesday build (2026-11-17) — web pay flow verified live

- **Live e2e (13/13 steps pass, `npm run e2e:live`):** the exact web code
  (`/login` → `/pay` → receipt → `/wallet`) was driven against a real
  NWC wallet on test sats: login + scope ₦50,000/day, a 150-sat payment
  settling to a verified bound receipt with a template AI explainer
  (spoken once), live remaining spend on the Wallet tab (spent 150,
  remaining 33,183), a ₦70,000 invoice refused by the app scope check
  with zero wallet requests, the same invoice refused directly by the
  wallet with verbatim `QUOTA_EXCEEDED`, an unknown-hash invoice refused
  by INV-9 with zero wallet requests, revoke (scope REVOKED, further
  payments refused) and logout wiping the secret from memory.
- **Seed (`npm run seed`, `seed/demo-data.json`):** fresh demo wallets
  each run, 100,000 test sats (synthetic labelled ledger credit —
  test-only, same mechanism as the spike), 10 live 100-sat receipts all
  verified, both blocked payments recorded. Credentials (NWC URIs +
  admin keys) go to `seed/.demo-credentials.json` (mode 600, gitignored).
- **Two bugs found live by the e2e and fixed:** (1) the shared BOLT11
  decoder did not skip the 35-bit timestamp, so it returned null for
  every real invoice — the test builder shared the same wrong
  assumption, so the round-trip passed while real invoices failed.
  Fixed + a real-LNbits-invoice regression test. (2) The web api client
  sent `Content-Type: application/json` with an empty body on body-less
  POSTs (explain/cancel/revoke/timeout-check); Fastify 5 rejects that
  with 400. The client now sends `{}`. Both have regression tests.
- **Tests:** `npm test` → **62 pass, 0 fail** (was 49). `npm run build`
  and `npm run typecheck` pass (the root typecheck was broken in the
  skeleton — the web project is `noEmit` and cannot be a `tsc -b`
  reference; fixed by typechecking it in the root program instead).
- **Docker: NOT verified on this VM.** `docker compose` plugin is
  missing and the daemon cannot start (`iptables … Permission denied
  (you must be root)` — the secure VM denies NET_ADMIN). `docker compose
  up` is shipped but unverified here; verify it on a machine with
  working Docker before relying on it for the demo.

## Day-1 spike verdict (2026-11-16, LNbits 1.7.1 + nwcprovider 1.2.1, local)

- **Check 1 — PASS (live):** wallet enforces the daily budget. Over-budget
  pay returned verbatim `QUOTA_EXCEEDED: "The wallet has exceeded its
  spending quota."` App-side INV-9 refused an unknown hash and a
  non-allowlisted supplier with **zero** wallet requests. (One caveat:
  nwcprovider does not implement the `get_budget` read method, so the app
  cannot read remaining budget over NWC — it tracks spend itself.)
- **Check 2 — PASS (live):** bound receipt is third-party verifiable —
  sha256(preimage) == payment hash, LNbits lookup shows paid with the
  exact amount, BOLT11 decodes to the same hash + amount + the
  `Lighnib:<orderId>:<supplierId>` memo.
- **Check 3 — FAIL (live, two layers):** hold invoices are unsupported by
  this wallet service. NWC `get_info` advertises only
  `make_invoice, lookup_invoice, get_balance, get_info` (no
  `make_hold_invoice`), and creating a hold invoice via the LNbits core
  API returns `{"detail": "Hold invoices are not supported by this
  wallet."}` (FakeWallet has no hold implementation). **Per the build
  spec §7.3, the mediator is CUT and the MVP is receipt-only.** The
  dispute state machine, routes and unit tests stay in the code as the
  design for a hold-capable wallet service (e.g. LND-backed NWC service);
  nothing in the demo claims a live dispute runs today.

## Setup

```bash
npm install
npm run dev        # web :3000 + api :3001 (concurrently)
npm run seed       # demo world: 1 merchant + 1 supplier + 1 mediator + 10 receipts + 2 blocked
npm run e2e:live   # live end-to-end check of the web pay flow (needs seed + dev servers)
npm test           # state-machine + INV-1–INV-9 + web-flow + seed unit tests (62)
npm run build      # build all workspaces
npm run typecheck  # tsc -b (root) + per-workspace typechecks
```

Docker (one command):

```bash
docker compose up   # web + api + LNbits 1.7.1 (FakeWallet, demo only)
```

Environment (api, optional): `LLM_API_URL` + `LLM_API_KEY` (+ `LLM_MODEL`)
enable the LLM receipt explainer; without them the template fallback
explains every receipt offline.

## Architecture

```
lighnib/
  apps/web/    Next.js PWA: /login, /pay, /wallet, /receipts, /dispute
  apps/api/    Fastify: nwc.ts, scope.ts, receipts.ts, disputes.ts, voice.ts, explainer.ts
               — holds NO funds, never sees the NWC secret
  packages/shared/  types, INV-1–INV-9, NGN/XOF↔sats
  config/locale.ts  THE SKIN: currency, TTS voice, mediator, copy
  tests/ · README.md · docker-compose.yml (web+api+LNbits ≥1.7.1)
```

```mermaid
flowchart LR
  Merchant -->|NWC connect (browser only)| Wallet[Lightning wallet\nAlby Hub / Zeus / LNbits NWC /\nMutiny / Coinos]
  Merchant -->|login = scope| Web[Next.js PWA]
  Web -->|public data only| API[Fastify API]
  Web -->|pay_invoice| Wallet
  API -->|INV-9 check| Bindings[hash↔supplier registry]
  API -->|bound receipt| Receipts[receipts + Nostr event]
  API -->|dispute| Mediator[Lagos market association]
  Wallet -->|enforces budget| Wallet
```

**Flow:** Login (NWC connection = session + scoped budget) → Pay (app
decodes BOLT11, INV-9 checks hash↔supplier, scope re-check, wallet pays)
→ Bound receipt (amount + vendor + purpose + hash + preimage, AI-explained,
spoken) → Dispute (state machine only; live hold cut — see spike verdict).

**State machine:** `UNREGISTERED → LOGGED_IN → PAYING → RECEIPTED →
DISPUTED → RESOLVED | REFUNDED → REVOKED`

## Threat model — bearer token

The NWC secret is a **bearer token**: leak = impersonate + spend.
Mitigations, built in:

- **Browser-memory only** — never localStorage, never sessionStorage,
  never a cookie, never the server, never logs. The API rejects any
  request carrying a secret key (HTTP 400, INV-8 guard).
- **Short expiry** — a working day (8 h). Expired sessions refuse use.
- **Revoke = logout** — one connection, one revocation. Revoke the login
  and spending dies instantly. (This is also the answer to "why not
  NIP-98 + NWC separately?": one connection, one revocation, scope
  travels with identity.)
- **Least privilege** — `pay_invoice` only. No balance reads, no history.
- **Small budgets** — ₦50,000/day blast radius, stated out loud.

**Trust assumptions (never claim "trustless"):** the NWC wallet + LNbits
are trusted to enforce the budget; the merchant is trusted to keep their
wallet secret; the mediator is trusted to rule honestly (the bound receipt
limits dishonesty — a release only goes to a party named in the receipt,
and the release is public).

**Versions that matter:** LNbits **≥ 1.7.1** (critical vuln 2026-11-08,
1.7.0 2026-11-10, 1.7.1 2026-11-11 rotates auth keys — update alone is
insufficient, rotate wallet keys + funding credentials + rebuild
connections). Alby Hub **≥ v1.19.0** (v1.7–v1.18 internet-takeover flaw,
fixed Aug 2025). Dedicated LNbits wallet per merchant. Phoenix has NO NWC.

## Constraints

- **NWC enforces budget ONLY, not payee.** No payee field exists in
  NIP-47. Supplier enforcement is app-side via INV-9 (hash↔supplierId
  recorded pre-payment, checked pre-request); the bound receipt makes any
  bypass visible.
- **Disputes decide within minutes (NIP-47 hold window) — when a
  hold-capable wallet service is used.** The Day-1 spike (2026-11-16)
  proved the LNbits/FakeWallet service has no hold invoices, so the live
  mediator hold is CUT for the MVP; the dispute state machine stays as
  code + tests. Production disputes (hours/days, longer escrow) are a
  next iteration.
- **No dedicated Pidgin TTS.** Spoken receipts use the Web Speech API —
  an English voice reading Pidgin text, honestly labelled in the UI.
- **Test sats only.** MVP settles on Lightning; ₦/FCFA is display-only.
  Wave/MoMo settlement leg is a next iteration. Locale (currency,
  language, mediator) is config — Senegal skin is a config swap.
- **No token. No mediator network** (one named mediator). No group
  buying, no delivery escrow, no global directory.

## Metrics (what we measure)

1. Merchants onboarded / week
2. Bound receipts / day
3. Overspend blocks (wallet QUOTA_EXCEEDED)
4. Wrong-supplier blocks (app INV-9 refusal)
5. Dispute resolution time (minutes, inside the hold window)

## Next iteration

- Longer-escrow production disputes (beyond the NIP-47 hold window)
- Wave / MoMo payout leg settling receipts in FCFA/₦
- Senegal skin (FCFA, French/Wolof, Dakar market association mediator)
- Supplier directory (SpendMap) once the login lane is proven

## Licence

MIT — see [LICENSE](LICENSE).
