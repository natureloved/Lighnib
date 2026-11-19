# Lighnib, Small Lightning payments, locked.

> **Your wallet is the key. Lighnib it.**

> **The login IS the spending permission.** There is no password and no
> separate payment step. Connect your Lightning wallet and the connection
> itself is the credential; its budget is the permission scope. Revoke
> the login and the spending dies instantly. Separate systems cannot do
> that.

Lighnib is wallet-as-key for local commerce (Dakar Bitcoin Hack 2026). A
merchant logs in to a supplier portal by connecting their Lightning wallet -
the NWC connection is the credential, and its budget is the permission
scope. Every payment is bound to the purchase as a verifiable receipt,
explained by AI and spoken aloud in Pidgin. Disputes go to one named
mediator (state machine built and unit-tested; live hold cut, see spike
verdict below). No password, no screenshot, no bank, no NIN.

**Live demo:** https://lighnib.vercel.app
**Repo:** https://github.com/natureloved/Lighnib (public, MIT)

**Demo videos (silent screen recordings of the real app on test sats,
with burned-in Pidgin captions, narration scripts alongside):**
`~/workspace/demo-videos/lighnib/lighnib-90s.mp4` (84 s) and
`lighnib-3min.mp4` (112 s). They are **not committed to this repo**
(kept out by design); upload them with the submission. The videos have
no audio track, this VM has no voices, so captions + the narration
scripts carry the words.

**Honest security line:** Budget enforced by the wallet. Supplier enforced
by the app + bound receipt. Mediator sees any mismatch.

## Judge 5-min guide (start here)

You need: a phone or laptop, and any NWC wallet: [Alby Hub](https://albyhub.com) (≥ v1.19.0),
[Zeus](https://zeusln.app), [LNbits NWC](https://lnbits.com), [Coinos](https://v3.coinos.io),
[Blitz](https://blitzwalletapp.com), or [Rizful](https://rizful.com) (browser, no install).
**Phoenix has NO NWC, do not use it.**

Note: Blitz keeps its NWC balance separate from its main balance, so fund the NWC side before paying. Rizful is custodial and browser-based, no app to install.

### If you do not have a wallet yet (3 min)

1. **Install Alby Hub** (≥ v1.19.0) from [albyhub.com](https://albyhub.com), or install
   [Zeus](https://zeusln.app). Alby Hub is the tested path.
2. **Fund it with Mutinynet test sats** from a Mutinynet faucet.
   You need enough for the ₦50,000/day demo budget (about 33,333 sats).
3. **Create an NWC connection** in Alby Hub: methods **pay_invoice
   only**, budget **₦50,000/day** (33,333 sats), expiry **24 hours**.
   Copy the connection string (`nostr+walletconnect://...`).
4. Paste it into Lighnib `/login` and connect. Skip to step 2 below.

### Fastest path: pre-funded demo merchant (30 s, no setup)

A seeded demo merchant is already funded with test sats. On `/login`,
tap "Use demo wallet", no pasting, no setup. The connection string in
the Devpost submission's Additional info upload (demo-login.txt) remains
the backup if the button ever fails. Test sats only, clearly labelled,
revoke any time. Use this if you skip the wallet setup above. After
login, open `/pay` and tap "Get a demo invoice" for a fresh 100-sat
invoice, no invoice needed beforehand.

### Happy path (2 min)

1. **Run it** (2 min): `docker compose up`, or `npm install && npm run dev`
   (web on http://localhost:3000, api on http://localhost:3001).
   Then seed the demo world: `npm run seed` (1 merchant + 1 supplier +
   1 named mediator + 10 bound receipts + 2 blocked payments, all on
   local test sats). The seed prints the merchant NWC URI to paste at
   login. Requires local LNbits 1.7.1 + the local NWC relay, see Setup.
2. **Log in** (30 s): open `/login`, tap "Use demo wallet" (or paste the
   merchant connection URI from the seed output). Scope shows ₦50,000/day.
   No password, no form.
3. **Pay** (1 min): open `/pay`, pick supplier-balogun-001 (the seeded
   demo supplier), tap "Get a demo invoice" for a fresh 100-sat
   invoice, then pay it. A bound receipt appears on settlement,
   AI-explained, spoken in Pidgin.
3b. **Verify a receipt like a third party** (1 min): open `/receipts`.
   Every settled payment is a bound receipt card (amount + vendor +
   purpose + hash + preimage). Copy any receipt JSON and paste it into
   "Verify a receipt you receive", the check runs in your own browser
   (no trust in our server) with a server cross-check: preimage hashes
   to the payment hash, the public Nostr receipt matches the card. Hit
   "Explain this receipt" for the AI explainer (template fallback when
   no LLM key is set) and "Replay readout" to hear it spoken.
   Open the app as `http://localhost:3000` (not `127.0.0.1`, Next 16
   blocks the dev HMR websocket for the 127.0.0.1 origin and the page
   never hydrates; `allowedDevOrigins` now covers it, but localhost is
   the tested path).
4. **Watch the two enforcers** (1 min):
   - A ₦70,000 invoice → **the app refuses it first** (over the ₦50,000
     scope, the user sees "This invoice pass your daily scope. Wallet
     go refuse am.") before the wallet is ever asked. The wallet is the
     backstop: the seed log shows the same invoice refused directly by
     the wallet with verbatim `QUOTA_EXCEEDED`.
   - An invoice from a supplier not on the allowlist → **the app refuses
     before the wallet is ever asked** ("This invoice no dey recorded
     for any supplier for this portal.", INV-9 hash mismatch).
5. **Dispute** (code only, not live): the `/dispute` route and the
   dispute state machine exist and are unit-tested, but the live mediator
   hold is CUT for the MVP (see Wednesday decision below). The page says
   so in plain language. Do not demo a live dispute on the current
   wallet service.

Demo data is seeded by `npm run seed` (1 merchant + 1 supplier + 1 named
mediator + 10 bound receipts + 2 blocked payments). No real funds, no
token, no account to create.

## How suppliers join

A supplier mints each invoice in their own Lightning wallet (Rizful, Zeus,
Alby Hub, or any wallet that can add a memo), with the memo
`Lighnib:order#ID:supplierId`. Before a merchant can pay, the invoice
payment hash must be registered with Lighnib, so the app can check the
invoice really belongs to the supplier named in the memo. In the demo,
registration is done by the operator: seed data, or the mint endpoint,
which mints and registers in one call.

In the pilot, joining is agent-assisted. The onboarding agent verifies the
trader with the market association, helps them set up their wallet, adds
their supplier ID to the list, and registers their invoices. There is no
self-serve supplier signup yet, and that is deliberate: the supplier
allowlist is a security control, and letting anyone add themselves to it
would defeat it. A verified supplier registry is a Phase 2 item.

## Setup

One command: `docker compose up --build` (web + api + LNbits ≥ 1.7.1).
Or local dev: `npm install && npm run dev` (web :3000, api :3001) plus
`bash scripts/start-lnbits.sh` (LNbits :5000) and
`node scripts/local-relay.mjs 7777` (Nostr relay). Then `npm run seed`.
See `docker-compose.yml` and `scripts/`. Node 20+, npm 10+.

## Architecture

```
Browser (Next.js) ──HTTPS──> API (Fastify, no funds, no NWC secret)
     │  wss (NWC)                │
     │                           │ (mint only)
     └──────> Nostr relay ──> LNbits + nwcprovider (FakeWallet, test sats)
```

The browser talks to the API (HTTP) and to the relay (wss, NWC client).
The API talks to LNbits at runtime for one thing only: minting supplier
invoices (POST /api/invoices/mint, supplier invoice key, mints + reads,
cannot pay). Everything else is seed-time setup. LNbits holds the demo
wallets; the nwcprovider extension connects to the relay. Every payment
is bound to its purchase (INV-9) and lands as a verifiable bound receipt
(INV-5/INV-6).

## Threat model

- **NWC secret is a bearer token.** It lives in browser memory only,
  never in localStorage, never on the server, never in logs. Short
  expiry (24h demo). Least privilege: `pay_invoice` only. Revoke =
  logout: the secret is wiped from memory and the scope is revoked
  server-side, so a revoked scope never pays again.
- **Blast radius:** one scope, ₦50,000/day. A stolen secret can spend
  at most that day's budget, only to allowlisted suppliers (the app
  refuses anything else before the wallet is asked), and every spend
  leaves a bound receipt that names the supplier.
- **Budget enforced by the wallet.** The wallet returns
  `QUOTA_EXCEEDED` on overspend. The app re-checks the scope before
  every payment as a backstop.
- **Supplier enforced by the app + bound receipt.** INV-9: the app
  decodes the BOLT11 invoice, looks up the payment hash in the binding
  registry (recorded at invoice creation), and refuses an unknown hash
  or a supplier mismatch before any wallet request. The bound receipt
  makes any bypass auditable.
- **Mediator sees any mismatch.** The receipt is the proof; the
  mediator judges from it. No funds are held by the app or the API.

## Constraints

- **Dispute hold window:** the live mediator hold is CUT for the MVP.
  LNbits FakeWallet has no hold invoices and the NWC service advertises
  no hold methods, so a live dispute must decide within minutes (the
  demo window). Production dispute over hours/days is the next
  iteration (longer escrow via Alby Hub hold invoices).
- **TTS:** no dedicated Pidgin voice exists. The spoken receipt uses
  the Web Speech API with an English voice reading Pidgin text,
  labelled honestly in the UI. Mute and replay are on every receipt.
- **AI explainer:** the LLM path needs `LLM_API_URL` + `LLM_API_KEY`.
  Without a key the template fallback explains the receipt and is
  labelled "Template fallback, no LLM key set". Never claim a real LLM
  explained a receipt until a key is set and the call is seen live.
- **Reload wipes the session by design (INV-8).** A full page reload
  clears the in-memory NWC secret and logs the user out. Client-side
  navigation preserves it.

## Metrics

Live counts from the API (`GET /api/metrics`), also shown on the
homepage:

- Merchants/week: **10** (pilot target, 1 Lagos market)
- Receipts/day: **10** (seeded; live count from the API)
- Overspend blocks: **1** (seeded wallet `QUOTA_EXCEEDED`; live count)
- Wrong-supplier blocks: **1** (seeded INV-9 refusal; live count)
- Dispute resolution: **<5 min** (demo, inside the hold window)

Pilot targets are labelled as targets, not live numbers.

## Next iteration

Mainnet (real sats, real suppliers), a MoMo/Wave payout leg so receipts
settle in FCFA/₦, longer escrow for production disputes, and a Senegal
skin (FCFA, French/Wolof, Soynade Oolel-Voices for Wolof/French TTS).
The mediator becomes a hold-capable service (Alby Hub hold invoices).

## Thursday build (2026-11-19), Pidgin copy, Slow 3G, videos, clean clone

- **Pidgin copy pass:** every user-facing string on the happy path is
  now Pidgin/English, login ("Wallet connection code"), pay ("Supplier
  invoice code"), wallet, receipts, dispute, and all refusal messages
  ("This invoice pass your daily scope. Wallet go refuse am.",
  "This invoice no dey recorded for any supplier for this portal.").
  Technical codes (INV-9, QUOTA_EXCEEDED, BOLT11, NWC, get_budget) no
  longer appear in the UI; a test bans them from `config/locale.ts`
  copy. Scope states are plain words ("You never log in", "Scope
  remaining", "This login don revoke"). Honest labels kept: English
  voice reading Pidgin text, dispute cut, template explainer.
- **Bug E found live by the browser pass (critical, fixed + verified):**
  the in-memory session (INV-8: NWC secret browser-memory only) was
  lost on navigation, login → pay showed "You never log in". Root
  cause: plain `<a href>` links full-reload, and `<Link><button>`
  nesting also full-reloads in this Next 16 build (proven with a
  `window.__marker` probe). Fix: all in-app navigation now uses Next
  `Link` for text links and `router.push()` on button onClick. A
  regression test bans both patterns in `apps/web/src`. Verified live
  in headless Chrome: after login, /pay shows the live scope, Pay is
  enabled, and a second visit to /pay stays logged in.
- **Slow-3G load test (production build, cold load, ~245 KB, 26–27
  requests):** unthrottled load 155–639 ms, FCP 56–504 ms; **Slow 3G
  (500 kbps, 400 ms RTT): load ~4.05 s, FCP ~850–900 ms, React mounted
  + login interactive in all 8 runs** (desktop + Tecno-like 720×1600
  viewport). LCP is not emitted in this headless build, FCP + load
  event are the reported paint metrics. No fix was needed; the happy
  path works on a slow connection.
- **Demo videos:** 90-sec (`lighnib-90s.mp4`, 84 s) and 3-min
  (`lighnib-3min.mp4`, 112 s), assembled with ffmpeg from real
  Playwright recordings of the production build on test sats (login →
  pay → bound receipt → receipts → wallet → both enforcers → dispute
  cut, plus a second clip: scope raised to ₦100,000/day in one tap -
  a new connection, because a wallet budget is fixed per NWC
  connection, and the refused ₦70,000 invoice then settling).
  Title/section cards + burned-in Pidgin captions; narration scripts
  alongside. **Silent** (no audio track, this VM has no voices;
  Playwright captures no audio). Nothing in them is faked.
- **Clean-clone test:** fresh copy minus node_modules/.local/data/.git,
  `npm install` (14 s), `npm test` **80/80**, typecheck + build pass,
  dev servers on alternate ports (api :3301 healthy, all 6 routes 200
  on web :3200), total under 1 minute. A true `git clone` of the
  private repo was not possible on this VM (gh CLI is not authed; the
  repo is private), the copy simulates it. Two findings: (1) `/tmp`
  is a 512 MB tmpfs and was 100% full, the clone test must run on the
  main disk, not /tmp. (2) A fresh tree failed 2 test files before
  `npm run build` because `@lighnib/shared` resolves to compiled
  `dist/`, **fixed** with `pretest`/`predev` hooks that build shared
  first; a stranger's `npm test` / `npm run dev` now works straight
  after install.
- **Seed + e2e re-run after the copy changes:** seed 10/10 receipts
  verified, 2 blocked; **live e2e 13/13 pass**. Tests: `npm test` →
  **80 pass, 0 fail** (was 74). Build + typecheck pass.

## Wednesday build (2026-11-18), receipts polish + AI explainer + TTS + dispute decision

- **Bound receipts, polished:** `/receipts` now shows the seeded receipts
  as verifiable cards (amount + vendor + purpose + hash + preimage), each
  with Verify, Copy receipt JSON, Explain (AI explainer + source label)
  and Replay/Mute readout. **Third-party verify:** paste any receipt JSON
  into "Verify a receipt you receive", the check runs in the verifier's
  own browser via the shared `verifyReceiptDetail` (per-check results:
  settled, complete, hash/preimage format, preimage→hash, Nostr event
  match) with a server cross-check at `POST /api/receipts/verify-pasted`
  that consults no stored state. Verified live in headless Chrome:
  a real seeded receipt verifies (7/7 checks), a tampered vendor fails
  only the Nostr cross-check. `seed/demo-data.json` now stores the FULL
  bound receipts (preimage included, public settlement proof, not a
  secret), so anyone can verify them offline from the file alone.
- **AI explainer:** the LLM path (`LLM_API_URL` + `LLM_API_KEY` +
  `LLM_MODEL`) was verified live against a local OpenAI-compatible stub:
  `source=llm`, correct request shape (model + 2 messages), and a 500
  from the provider falls back to the template, never throws. The
  template fallback is the live demo path (no LLM key in this
  environment) and was verified live on the API and in the e2e. **The
  real-provider LLM path is UNTESTED** (no key exists here), do not
  claim a real LLM explained a receipt until a key is set and the call
  is seen live.
- **TTS (Web Speech API):** verified in headless Chrome, `speechSynthesis`
  exists, `speak()` is called without throwing, Replay/Mute are wired,
  and the honest label ("No dedicated Pidgin voice, English voice
  reading Pidgin text") shows on every spoken receipt. **But:** the
  headless VM has zero installed voices, so `speak()` is a silent no-op
  here, no audio was heard on this machine. Real audio must be checked
  on a real device (Thursday Tecno test).
- **Dispute decision, CUT CLEANLY (Wed 18 Nov).** Timeboxed
  investigation: a hold-capable NWC service DOES exist, Alby Hub merged
  hold-invoice support (getAlby/hub#1298, spec #2065 closed, v1.24.7
  current) and the NIP-47 hold methods are real. It is NOT within this
  build's reach here: Docker is unusable on this VM (Alby Hub's
  documented install path), an LDK node needs on-chain funding + channel
  liquidity + P2P peers, and this VM blocks the network paths a node
  needs (all public Nostr relays fail the wss handshake with a TLS
  interception error, verified live). Standing it up would eat
  Thursday's must-dos for a stretch goal, so the mediator stays cut:
  the `/dispute` page now carries the cut in plain language ("records a
  dispute claim, it holds no funds"), the state machine/routes/tests
  stay as the design, and the post-MVP path is named: **Alby Hub
  (hold invoices merged) as the wallet service**. Nothing in the app or
  docs claims a live dispute runs.
- **Dev-server quirk found live:** opening the app as
  `http://127.0.0.1:3000` makes Next 16 block the dev HMR websocket and
  the page never hydrates (buttons dead, receipts never load, no
  console error). Use `http://localhost:3000`. Fixed for both origins
  with `allowedDevOrigins: ["127.0.0.1"]` in `next.config.mjs`.
- **Stack restore (Wed):** a service restart wiped `/tmp` (LNbits venv +
  data, relay, demo wallets). Rebuilt persistently under `.local/`
  (gitignored): `scripts/start-lnbits.sh` + `lnbits==1.7.1` venv,
  nwcprovider 1.2.1 installed manually from the release zip (the API
  install path fails, the extensions manifest fetch is mangled by the
  sandbox proxy), extension activated + enabled for the admin account,
  provider relay re-pointed at the local relay
  (`ext_nwcprovider.sqlite3 config.relay = ws://localhost:7777`), admin
  password set via first-install. Seed + e2e re-verified live after the
  restore (13/13).
- **Tests:** `npm test` → **74 pass, 0 fail** (was 62). `npm run build`
  and `npm run typecheck` pass. Live e2e re-run after the restore:
  **13/13 pass**.

## Tuesday build (2026-11-17), web pay flow verified live

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
  each run, 100,000 test sats (synthetic labelled ledger credit -
  test-only, same mechanism as the spike), 10 live 100-sat receipts all
  verified, both blocked payments recorded. Credentials (NWC URIs +
  admin keys) go to `seed/.demo-credentials.json` (mode 600, gitignored).
- **Two bugs found live by the e2e and fixed:** (1) the shared BOLT11
  decoder did not skip the 35-bit timestamp, so it returned null for
  every real invoice, the test builder shared the same wrong
  assumption, so the round-trip passed while real invoices failed.
  Fixed + a real-LNbits-invoice regression test. (2) The web api client
  sent `Content-Type: application/json` with an empty body on body-less
  POSTs (explain/cancel/revoke/timeout-check); Fastify 5 rejects that
  with 400. The client now sends `{}`. Both have regression tests.
- **Tests:** `npm test` → **62 pass, 0 fail** (was 49). `npm run build`
  and `npm run typecheck` pass (the root typecheck was broken in the
  skeleton, the web project is `noEmit` and cannot be a `tsc -b`
  reference; fixed by typechecking it in the root program instead).
- **Docker: NOT verified on this VM.** `docker compose` plugin is
  missing and the daemon cannot start (`iptables … Permission denied
  (you must be root)`, the secure VM denies NET_ADMIN). `docker compose
  up` is shipped but unverified here; verify it on a machine with
  working Docker before relying on it for the demo.

## Day-1 spike verdict (2026-11-16, LNbits 1.7.1 + nwcprovider 1.2.1, local)

- **Check 1, PASS (live):** wallet enforces the daily budget. Over-budget
  pay returned verbatim `QUOTA_EXCEEDED: "The wallet has exceeded its
  spending quota."` App-side INV-9 refused an unknown hash and a
  non-allowlisted supplier with **zero** wallet requests. (One caveat:
  nwcprovider does not implement the `get_budget` read method, so the app
  cannot read remaining budget over NWC, it tracks spend itself.)
- **Check 2, PASS (live):** bound receipt is third-party verifiable -
  sha256(preimage) == payment hash, LNbits lookup shows paid with the
  exact amount, BOLT11 decodes to the same hash + amount + the
  `Lighnib:<orderId>:<supplierId>` memo.
- **Check 3, FAIL (live, two layers):** hold invoices are unsupported by
  this wallet service. NWC `get_info` advertises only
  `make_invoice, lookup_invoice, get_balance, get_info` (no
  `make_hold_invoice`), and creating a hold invoice via the LNbits core
  API returns `{"detail": "Hold invoices are not supported by this
  wallet."}` (FakeWallet has no hold implementation). **Per the build
  spec §7.3, the mediator is CUT and the MVP is receipt-only.** The
  dispute state machine, routes and unit tests stay in the code as the
  design for a hold-capable wallet service; nothing in the demo claims a
  live dispute runs today. Wednesday's timeboxed investigation confirmed
  the cut and named the post-MVP path (Alby Hub, hold invoices merged -
  see Wednesday build above).

## Setup

```bash
npm install
npm run dev        # web :3000 + api :3001 (concurrently)
npm run seed       # demo world: 1 merchant + 1 supplier + 1 mediator + 10 receipts + 2 blocked
npm run e2e:live   # live end-to-end check of the web pay flow (needs seed + dev servers)
npm test           # state-machine + INV-1–INV-9 + web-flow + seed + Wednesday + Thursday unit tests (80)
npm run build      # build all workspaces
npm run typecheck  # tsc -b (root) + per-workspace typechecks
```

Local wallet service (test sats only, LNbits 1.7.1 + nwcprovider 1.2.1
+ local NWC relay; the seed starts the relay itself if it is down):

```bash
./scripts/start-lnbits.sh   # LNbits on :5000 (persistent install under .local/)
```

A service restart wipes `/tmp`, so the LNbits venv + data live under
`.local/` (gitignored), not `/tmp`. First run on a fresh data folder:
set the admin password once via
`PUT /api/v1/auth/first_install` (`first_install_token` is
`lighnib-first-install-2026` unless `LNBITS_FIRST_INSTALL_TOKEN` is
changed), install + activate + enable the nwcprovider extension, and
point its relay at the local relay (`ws://localhost:7777`), see
WEDNESDAY-REPORT.md for the exact commands. The seed then works
unchanged.

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
              , holds NO funds, never sees the NWC secret
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
spoken) → Dispute (state machine only; live hold cut, see spike verdict).

**State machine:** `UNREGISTERED → LOGGED_IN → PAYING → RECEIPTED →
DISPUTED → RESOLVED | REFUNDED → REVOKED`

## Threat model, bearer token

The NWC secret is a **bearer token**: leak = impersonate + spend.
Mitigations, built in:

- **Browser-memory only**, never localStorage, never sessionStorage,
  never a cookie, never the server, never logs. The API rejects any
  request carrying a secret key (HTTP 400, INV-8 guard).
- **Short expiry**, a working day (8 h). Expired sessions refuse use.
- **Revoke = logout**, one connection, one revocation. Revoke the login
  and spending dies instantly. (This is also the answer to "why not
  NIP-98 + NWC separately?": one connection, one revocation, scope
  travels with identity.)
- **Least privilege**, `pay_invoice` only. No balance reads, no history.
- **Small budgets**, ₦50,000/day blast radius, stated out loud.

**Trust assumptions (never claim "trustless"):** the NWC wallet + LNbits
are trusted to enforce the budget; the merchant is trusted to keep their
wallet secret; the mediator is trusted to rule honestly (the bound receipt
limits dishonesty, a release only goes to a party named in the receipt,
and the release is public).

**Versions that matter:** LNbits **≥ 1.7.1** (critical vuln 2026-11-08,
1.7.0 2026-11-10, 1.7.1 2026-11-11 rotates auth keys, update alone is
insufficient, rotate wallet keys + funding credentials + rebuild
connections). Alby Hub **≥ v1.19.0** (v1.7–v1.18 internet-takeover flaw,
fixed Aug 2025). Dedicated LNbits wallet per merchant. Phoenix has NO NWC.

## Constraints

- **NWC enforces budget ONLY, not payee.** No payee field exists in
  NIP-47. Supplier enforcement is app-side via INV-9 (hash↔supplierId
  recorded pre-payment, checked pre-request); the bound receipt makes any
  bypass visible.
- **Disputes decide within minutes (NIP-47 hold window), when a
  hold-capable wallet service is used.** The Day-1 spike (2026-11-16)
  proved the LNbits/FakeWallet service has no hold invoices, so the live
  mediator hold is CUT for the MVP (Wednesday decision: a hold-capable
  service exists, Alby Hub, hold invoices merged, but is not runnable
  on this VM; post-MVP path). The dispute state machine stays as code +
  tests and the `/dispute` page says plainly that it records a claim
  and holds no funds. Production disputes (hours/days, longer escrow)
  are a next iteration.
- **No dedicated Pidgin TTS.** Spoken receipts use the Web Speech API -
  an English voice reading Pidgin text, honestly labelled in the UI.
  **No audio was heard on this VM** (zero installed voices), real
  audio must be checked on a real device.
- **nwcprovider does not implement `get_budget`.** The app cannot read
  remaining budget over NWC, it tracks spend itself from settled
  receipts. The wallet tab shows the app-tracked remaining, not a
  wallet-reported figure.
- **Docker NOT verified on this VM** (compose plugin missing, daemon
  cannot start, iptables/NET_ADMIN denied). `docker compose up` is
  shipped but unverified here; verify it on a machine with working
  Docker before relying on it for the demo.
- **LLM explainer: real provider UNTESTED.** The LLM path was verified
  only against a local stub; no key exists here. Until a key is set and
  a live call is seen, the template fallback is the honest demo path.
- **Test sats only.** MVP settles on Lightning; ₦/FCFA is display-only.
  Wave/MoMo settlement leg is a next iteration. Locale (currency,
  language, mediator) is config, Senegal skin is a config swap.
- **No token. No mediator network** (one named mediator). No group
  buying, no delivery escrow, no global directory.

## Metrics (what we measure)

1. Merchants onboarded / week
2. Bound receipts / day
3. Overspend blocks (wallet QUOTA_EXCEEDED)
4. Wrong-supplier blocks (app INV-9 refusal)
5. Dispute resolution time (minutes, inside the hold window, post-MVP
   metric; the live hold is cut, so this is 0 / not measured in the MVP)

## Next iteration

- Live mediator hold via a hold-capable wallet service (Alby Hub -
  hold invoices merged in getAlby/hub#1298, spec #2065, v1.24.7) once
  it can run with real channels; longer-escrow production disputes
  (beyond the NIP-47 hold window)
- Wave / MoMo payout leg settling receipts in FCFA/₦
- Senegal skin (FCFA, French/Wolof, Dakar market association mediator)
- Supplier directory (SpendMap) once the login lane is proven

## Licence

MIT, see [LICENSE](LICENSE).
