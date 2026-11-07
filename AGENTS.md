# facedown

A server and phone-first web client for four-handed partner games (Spades and partner Draw
Dominoes in v1; Hearts and Euchre later) where the server is the only party that sees hidden
information. Every game is a seed plus a move log; the seed is committed before the first
deal and revealed after the last, so any finished game can be replayed and checked. Bun +
TypeScript, a pure engine, `bun:sqlite`, a Svelte client, deployed through hoist. MIT.
"Done" for v1 is every v1 row in `docs/PLAN.md` §3 working, `scripts/accept.sh` green from a
clean clone, and the app live behind hoist.

## Status

M0–M7 merged; skeptic round 1 fixes in progress

## Commands

```bash
bun install
bun run typecheck         # tsc --noEmit
bun run lint              # Biome
bun test                  # unit, purity, goldens, 200 playouts per game
bun run start             # server, PORT defaults to 8080
bun run dev               # server with watch and insecure cookie for localhost HTTP
bun run build             # client into dist/client
bun run dev:client        # Vite, proxies API and WS to :8080
bun run test:browser      # phone viewport Playwright smoke
bun run test:container    # opt-in Docker image + lease handoff e2e
bun run test:e2e          # real HTTP + WebSocket server tests
bun run replay:record <type> <64-char-hex-seed>
bash scripts/accept.sh    # full gate, 2000 playouts per game
```

## Pointers

- `docs/PLAN.md` — feature matrix, architecture and engine contract, rules, data model,
  API/protocol, milestones, testing.
- `CONTEXT.md` — glossary. Use its words in code, issues and PRs (Deal, not round; Hand is
  what a seat holds).
- `docs/adr/0001` — seed + move log is the record, with a seed commitment; `0002` — move-log hash chain.
- Session logs: `~/Projects/worklog/projects/facedown.md` (not in this repo).

## Conventions & Gotchas

- `src/engine` is pure: imports only from `src/engine`; no `Bun`, `process`, `Date`,
  `Math.random`, `crypto`, timers, `fetch` or DOM. A test enforces it. The browser replay
  viewer runs the same engine. `Math.exp`/`Math.log` are allowed only in `src/engine/rating`.
- Only `view(state, viewer)` output reaches a client. Bots and timeout auto-play decide
  from a seat's view and legal moves, never from full state.
- State is always `fold(init(seed), moves)`; in-memory state and snapshots are caches.
- The seed is never returned by any API while a game is live.
- Only `src/server/store` touches SQLite.
- Containers run as bun, with writable persistent data mounted at `/data`; image default is `/data/facedown.db`.
- `/healthz` is healthy during standby. The `tables` SQLite lease gates table traffic and rebuild (5 s heartbeat, 20 s expiry, 250 ms poll).
- SIGTERM rejects moves with `unavailable`, drains writes, closes WS with 1012 and releases the lease; exit deadline is 9 s. Confirmed lease loss closes sockets, fails health, and exits 1 for replacement.
- `HOST` defaults to `127.0.0.1`; the container sets `HOST=0.0.0.0`.
- `FACEDOWN_TRUST_PROXY=1` trusts the last X-Forwarded-For hop (Caddy appends it); set in the container behind hoist only. Otherwise limits use the socket IP.
- `FACEDOWN_PING_MS` sends socket pings every 20000 ms by default.
- Guests: 30/IP/hour; registrations: 5 successes or conflicts/IP/hour; account sessions: 10 (oldest revoked).
- Sockets: 8/session, 16/account, 32/IP; moves allow bursts of 10/s per socket.
- Open tables: 200 globally; lobby: newest 50 open plus newest 50 live.
- `FACEDOWN_DB` selects the SQLite file (default `./facedown.db`); tests use scratch files.
- `FACEDOWN_ORIGIN` pins the exact mutation/WS Origin in production; unset uses the request origin.
- `FACEDOWN_OPEN_TTL_MS` expires open tables without connected humans (default 1800000 ms).
- `FACEDOWN_OPEN_HOLD_MS` holds dropped open seats for 600000 ms; explicit leave releases them immediately.
- Open table creation: at most 3/session, 3/account, 6/IP; 10 creates/session per 10 min after body validation.
- `FACEDOWN_TURN_MS` / `FACEDOWN_HOLD_MS` / `FACEDOWN_BOT_MS`: 30000 / 180000 / 600 ms.
- Local plain HTTP needs `FACEDOWN_INSECURE_COOKIE=1`: cookie `fd`, without Secure; production uses `__Host-fd`.
- Rated games require four distinct accounts at start and no casual flag; bot-held seats at finish score a loss, reclaim clears it.
- Browser smoke needs `bunx playwright install chromium` (CI adds `--with-deps`).
- Tooling is Bun, `tsc --noEmit`, Biome. No ESLint, Prettier, Vitest or ORM.
- Commits: `<type>: <description>`, author @ContractorKeith only.

## Tracking

- GitHub issues are the tickets, one per milestone, label `milestone`; `skeptic` for review
  findings.
- Basecamp project "github" has ONE card titled `facedown` with one step per milestone
  (`project-board` skill). Complete the step when the milestone PR merges; update "Next:".
- One milestone = one issue = one branch = one draft PR = one T3 worker thread in its own
  worktree. M0 and M7 land alone; M1 ∥ M2 (merge M1 first); M4 ∥ M5 (merge M4 first).
- Per PR: worker's done-when → orchestrator full-diff read and accept rerun → cold reviewer
  → `pr-stress` → fixes → one PR comment → `gh pr ready` → merge. `skeptic-review` is the
  release gate before v0.1.0.

## Out of Scope

- Free-text chat, email/OAuth, AI bots, multiple server processes, Redis, Postgres. Never.
- Hearts, Euchre, table rule options, matchmaking, tournaments, blind nil, rating decay.
  After v1.
