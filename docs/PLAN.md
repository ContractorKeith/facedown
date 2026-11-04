# facedown — Build Plan

Status: planned, no code yet (2026-11-04). Sources studied: boardgame.io (MIT, the pure
game-logic plus per-player view seam), lila/Lichess (AGPL, ideas only: reconnect, Glicko-2,
replays), hoist (house process, Bun toolchain, SQLite, deploy target).

## 1. Goal

facedown is a server and web client for four-handed partner games played the way people
play them at a kitchen table: Spades and partner Draw Dominoes in v1, Hearts and Euchre
later. The server is the only party that ever sees hidden information. Every game is a seed
plus a move log, the seed is committed before the first deal and revealed after the last,
and anyone can replay the game and check that the deals were honest. v1 is done when every
row marked **v1** in §3 works, `scripts/accept.sh` passes from a clean clone, and the app
is live behind hoist on a VPS.

## 2. Problem and solution

**Problem.** Online card and domino rooms are either closed (no way to check a deal), full
of ads, or built so the client holds state it should never see. Players who leave wreck the
game for the other three, and ratings for partner games are an afterthought.

**Solution.** A small, honest table: open a table, share the link, fill empty seats with
bots, play on a phone. Your hand is the only hand your browser ever receives. Drop out and a
bot keeps your seat warm until you come back. Every finished game becomes a replay you can
step through with all hands face up and a check that the seed matches the commitment
published before the game began.

## 3. Feature matrix

**v1** = in scope now. **Later** = after v1. **Drop** = deliberately never.

| # | Feature | Decision | M | Notes |
|---|---|---|---|---|
| 1 | Pure deterministic engine: seed + move log → state | v1 | M0 | ADR 0001 |
| 2 | Seed commitment published at start, seed revealed at end | v1 | M0/M3 | sha256, pure TS in engine |
| 3 | `view(state, viewer)` is the only path to a client | v1 | M0 | no raw state over the wire, ever |
| 4 | Seeded bot playout harness with invariants, golden replays | v1 | M0 | no dependency |
| 5 | Spades, standard partnership ruleset + bot | v1 | M1 | §5.3 |
| 6 | Partner Draw Dominoes, double-six, 5 each + bot | v1 | M2 | §5.4 |
| 7 | Tables: create, invite link, open lobby, bot-fill, start | v1 | M3 | |
| 8 | WebSocket protocol: full view + seq per update | v1 | M3 | §6 |
| 9 | Turn timer 30 s, server-injected timeout move | v1 | M3 | engine has no clock |
| 10 | Disconnect: seat held, bot after 3 min, reclaim | v1 | M3 | |
| 11 | Spectators: public view only, live | v1 | M3/M6 | |
| 12 | Move validation, stale-seq rejection, rate limits | v1 | M3 | |
| 13 | Moves persisted per move; live tables rebuilt on boot | v1 | M3 | fold of seed + moves |
| 14 | Preset reactions | v1 | M3/M5 | no free text |
| 15 | Accounts: username + password, sessions; guests | v1 | M4 | Bun.password (argon2) |
| 16 | Rated vs casual games | v1 | M4 | rated = 4 signed-in humans at start |
| 17 | Glicko-2, one pool per game, team-average opponent | v1 | M4 | §5.5 |
| 18 | Leaver loss | v1 | M4 | bot-held seat at game end |
| 19 | Replay, profile, leaderboard APIs | v1 | M4 | |
| 20 | Client: lobby + table, phone portrait first, own SVG art | v1 | M5 | Svelte SPA |
| 21 | Client: login, replay viewer with seed check, profile, leaderboard, spectate | v1 | M6 | replay re-runs the engine in the browser |
| 22 | Deploy through hoist: Dockerfile, health, single-writer lease | v1 | M7 | Live push needs persistent-volume support: [hoist#40](https://github.com/ContractorKeith/hoist/issues/40) |
| 23 | Hearts, Euchre | Later | | another `Game` each |
| 24 | Per-table rule options | Later | | Ruleset is already a config object; UI only |
| 25 | Matchmaking queue, tournaments | Later | | |
| 26 | Blind nil, All Fives, double-nine | Later | | |
| 27 | Rating decay with inactivity | Later | | |
| 28 | Over-the-shoulder delayed spectating | Later | | adds a viewer type and a delay buffer |
| 29 | Free-text chat | Drop | | moderation and collusion |
| 30 | Email, OAuth, password reset by email | Drop | | no email provider |
| 31 | Multiple server processes, Redis, Postgres | Drop | | one process holds live tables |
| 32 | AI/ML bots | Drop | | bots are simple rules |

## 4. Architecture

```
src/engine/            pure: no I/O, no Bun/Node/DOM globals, no Date, no Math.random
  core/                Game interface, Seat/Viewer, Envelope, sha256, PRNG, shuffle, commitment
  spades/              Spades rules, view, bot
  dominoes/            Draw Dominoes rules, view, bot
  rating/              Glicko-2 and the 2v2 adapter
  registry.ts          game type → Game
src/server/            Bun.serve: HTTP API, WebSocket hub, tables, timers, store
  store/               the only code that touches SQLite (bun:sqlite)
client/                Svelte SPA built by Vite into dist/client, served by the server
test/
  engine/              unit + playout harness
  replays/             golden replay files (*.json)
  e2e/                 real server + real WebSocket clients
  browser/             one Playwright smoke
scripts/accept.sh      the acceptance; worker, reviewer and CI run it
```

Rules that hold the shape:
- **The engine is pure.** `src/engine` imports only from `src/engine`. No `Bun`, `process`,
  `fetch`, `Date`, `Math.random`, `crypto`, timers or DOM. A test scans the imports and
  globals and fails the build. The same engine runs in the server, the tests and the
  browser replay viewer.
- **Only `view()` leaves the server.** The server never serializes engine state to a client.
  Bots and timeout auto-play decide from `view(state, seat)` and the seat's legal moves,
  never from full state.
- **Seed + move log is the record (ADR 0001).** State is always `fold(init(seed), moves)`.
  Anything else in memory or SQLite (live state, snapshots) is a cache that can be rebuilt.
- **Only `src/server/store` touches SQLite.** Live tables are in memory in one process.

### Engine contract (decision-carrying type shape)

```ts
type Seat = 0 | 1 | 2 | 3;                 // teams: {0,2} and {1,3}
type Viewer = { seat: Seat } | { spectator: true };
type Envelope<M> = { seat: Seat; move: M } | { seat: Seat; timeout: true };

interface Game<S, M, V, R> {
  type: GameType;                          // 'spades' | 'dominoes'
  ruleset: R;                              // fixed per type in v1
  init(seed: string, ruleset: R): S;
  toAct(state: S): Seat | null;            // null when the game is over
  legalMoves(state: S, seat: Seat): M[];
  apply(state: S, e: Envelope<M>): { ok: true; state: S } | { ok: false; error: MoveError };
  view(state: S, viewer: Viewer): V;
  outcome(state: S): Outcome | null;       // scores and winning team when over
  bot(view: V, legal: M[]): M;             // deterministic; also resolves timeouts
}
```

`apply` resolves a timeout envelope by calling `bot(view(state, seat), legalMoves(...))`, so
a replay with timeouts is still deterministic. `apply` never mutates its input.

### Randomness

- The seed is 32 random bytes (hex), made by the server. Commitment = `sha256(seed)` hex.
- Deal `n` (0-based) shuffles with a PRNG seeded from `sha256(seed + ":" + n)`, Fisher–Yates.
- sha256 and the PRNG are pure TypeScript in `src/engine/core` (tests compare sha256 with
  `Bun.CryptoHasher`). Web Crypto is async and is not used by the engine.

### Dependencies and why

| Module | Why |
|---|---|
| `@biomejs/biome`, `typescript`, `@types/bun` (dev) | house toolchain, same pins as hoist |
| `svelte`, `vite`, `@sveltejs/vite-plugin-svelte` (dev) | the client framework Keith picked; output is static files |
| `@playwright/test` (dev) | the only thing that drives a real browser for the one smoke test |

No runtime dependencies on the server: `Bun.serve`, `bun:sqlite`, `Bun.password`.

## 5. Data model and rules

### 5.1 Identifiers

Game ids and table ids are the same string: 10 lowercase base32 chars. Usernames are
3–20 chars `[a-z0-9_]`, case-folded and unique. Guests get `guest-xxxx` display names and
no account row. Card ids: rank + suit, `2C`…`AS` (`T` for ten). Tile ids: `a-b` with
`a <= b`, `0-0`…`6-6`.

### 5.2 SQLite (WAL, numbered migrations, `user_version`)

- `accounts(id, username UNIQUE, password_hash, created_at)`
- `sessions(token_hash PK, account_id, expires_at)` — 7-day sessions, SHA-256 hashed tokens
- `games(id PK, type, ruleset_json, seed, commitment, status live|finished, rated, created_at, finished_at, outcome_json)`
- `game_seats(game_id, seat, account_id NULL, guest_name NULL, bot_at_start, leaver)`
- `moves(game_id, seq, envelope_json, at)` — PK (game_id, seq); seq is dense from 1
- `ratings(account_id, type, rating, rd, volatility, games)` — PK (account_id, type)
- `rating_changes(game_id, account_id, type, before, after)`
- `leases(name PK, holder, heartbeat_at)` — single-writer lease (M7)

The `seed` column is never returned by any API while `status = live`.

### 5.3 Spades ruleset (v1, fixed)

Partnership, seats 0+2 vs 1+3. 13 cards each. Dealer rotates; bidding and the first lead
start left of the dealer. Bids 0–13; 0 is nil (±100 to the bidder's team, scored
separately from the partner's bid). Team bid made: 10 × bid + 1 per overtrick (bag); set:
−10 × bid. Every 10 accumulated bags: −100 and bags reset by 10. Spades cannot be led until
broken unless the leader holds only spades. Follow suit if able. Game to 500; if both teams
pass 500 on the same deal, the higher score wins; a tie plays another deal. A team at
−200 or below at the end of a deal loses (mercy rule; if both are, the higher score wins). A
set team scores −10 × bid and no bag points, but its overtricks and nil tricks still count
as bags. No blind nil.

### 5.4 Dominoes ruleset (v1, fixed)

Partner Draw, double-six (28 tiles). 5 tiles each, 8 face down in the boneyard. The first
deal is led by the holder of the highest double (if none is dealt, the highest tile);
later deals are led by the seat left of the previous leader. A seat that cannot play draws
until it can play or the boneyard is empty, then passes. A deal ends when a seat
dominoes (plays its last tile) or the line is blocked (all four pass in a row). The
winning team scores the pips left in the opponents' hands, unrounded; when blocked, the team with the lower pip total wins the deal and scores the
opponents' pips; equal totals score nothing. Game to 100.

### 5.4.1 Every game ends

Both games stop after 50 deals whatever the score (`maxDeals` in the ruleset): the higher
score wins; on a tie the team that won the last scoring deal wins, and if no deal scored,
the team of seat 1. Termination is a property of the engine, not of the bots.

Both views carry `lastDeal`, a public summary of the previous deal (Spades: bids, tricks
per seat, points and bags per team; Dominoes: how it ended, pips per seat, points awarded),
so a client can show the result after the next deal has been dealt.

### 5.5 Ratings

Glicko-2 (τ = 0.5; start 1500 / RD 350 / σ 0.06). One rating pool per game type. A rated
game has four signed-in humans seated at the start; the host may also mark a table casual.
For each of the four starting accounts, the update treats the game as one match against a
virtual opponent with the opposing team's average rating and average RD, result 1/0. A
seat held by a bot when the game ends is a **leaver**: that account scores 0 whatever its
team did; everyone else uses the real result. The calculation always uses the four
starting accounts; a bot replacing someone mid-game does not change it. One rating period
is one game; no inactivity decay in v1.

## 6. API and protocol

HTTP (JSON; cookie session `__Host-fd`; mutations require the session cookie and a
same-origin `Origin` header):

```
POST /api/register {username,password}     → 201 account, sets session
POST /api/login    {username,password}     → 200, sets session; 5 failures per IP+username and 20 per IP / 15 min
POST /api/logout                           → 204
POST /api/guest                            → 200 guest session (casual only)
GET  /api/me                               → account or guest
GET  /api/tables                           → open and live tables (lobby)
POST /api/tables {type, casual?}           → 201 {id, inviteUrl}
POST /api/tables/:id/bots                  → fill empty seats with bots (host only)
POST /api/tables/:id/start                 → host only, 4 seats filled
GET  /api/games/:id                        → replay {type, ruleset, seats, commitment, seed, moves, outcome}; 404 while live
GET  /api/players/:username                → ratings per pool, recent games
GET  /api/leaderboard/:type                → top 50 by rating with RD < 150
GET  /healthz                              → 200 "ok"
GET  /*                                    → client SPA
```

WebSocket `/ws` (session from the cookie). Client → server:

```
{t:"join", table, seat}         take an empty seat, or reclaim your own
{t:"spectate", table}
{t:"move", table, seq, move}    seq = the seq of the view the move was made from
{t:"react", table, id}          id from the fixed reaction list
{t:"leave", table}
```

Server → client:

```
{t:"view", table, seq, view, toAct, deadline, seats, you, host, commitment, logHash, lastMove}   full view, every update
{t:"ping"}                                                           every 20 s; clients reconnect after 45 s of silence
{t:"reaction", table, seat, id}
{t:"over", table, outcome, seed}                                     seed revealed here
{t:"error", code, message}   codes: stale_seq, illegal_move, not_your_turn, rate_limited, not_found, forbidden, bad_request
```

While a table is open nothing is dealt: the server draws the seed and deals at `start`, and
open-table view messages carry `view: null`, `commitment: null`, `logHash: null`. `you` is the
receiving viewer's seat (or null); clients identify their seat from it, never from a name.
`lastMove` is the envelope that produced this seq (null at seq 0); a client extends the hash
chain itself with it (ADR 0002) and calls a replay Verified only if it saw the chain unbroken
from the commitment. Client IPs come from the last `X-Forwarded-For` hop when
`FACEDOWN_TRUST_PROXY=1` (set in the container image, which only runs behind hoist's proxy).

Rules: a move with `seq` other than the table's current seq is rejected `stale_seq` and the
client gets a fresh view. Moves: 5 per second per connection; messages over 4 KiB close the
socket. Reconnect is "open the socket, send `join` or `spectate`, receive the current
view". Turn timer 30 s; on expiry the server applies `{seat, timeout:true}`. A seat whose
last connection closed is held; after 3 minutes a bot takes it; the account can reclaim
with `join` until the game ends. Reactions: `nice`, `oops`, `gg`, `hurry`, `thanks`,
`wow`; 1 per 3 s per seat.

## 7. Milestones

Each milestone is one GitHub issue, one branch, one draft PR, one worker thread in its own
worktree.

| M | Deliverable | Depends on | Done when |
|---|---|---|---|
| M0 | Toolchain, engine core (types, sha256, PRNG, shuffle, commitment), test game `highcard`, playout harness + invariants, replay golden runner, purity test, `scripts/accept.sh`, CI | – | accept passes; harness catches a planted leak and a planted nondeterminism |
| M1 | Spades engine + bot + goldens | M0 | 2000 seeded playouts pass every invariant; rules tests per §5.3; goldens replay |
| M2 | Dominoes engine + bot + goldens | M0 | same, per §5.4; boneyard never in any seat or spectator view |
| M3 | Server: tables, lobby, guest sessions, WS protocol, timers, disconnect/bot/reclaim, spectators, rate limits, reactions, move persistence, boot rebuild, commitment and reveal | M1, M2 | e2e: four WS clients finish a game; stale seq, illegal move, rate limit, disconnect→bot→reclaim, restart mid-game resumes; no raw state ever on the wire |
| M4 | Accounts, sessions, rated/casual, Glicko-2 2v2, leaver loss, replay/profile/leaderboard APIs | M3 | e2e: rated game updates four ratings per §5.5; leaver scored 0; replay 404 while live, seed matches commitment after |
| M5 | Client: lobby, create/invite/bot-fill, table for both games, phone portrait, SVG art, reactions, reconnect; Playwright smoke | M3 | smoke: create table, bot-fill, play one deal of each game in a phone viewport |
| M6 | Client: register/login, replay viewer (engine in browser, seed check), profile, leaderboard, spectate | M4, M5 | smoke extended: log in, finish a casual game, open its replay, seed check shows "verified" |
| M7 | Deploy: Dockerfile, `/healthz`, single-writer lease, graceful shutdown, hoist deploy docs | M6 | container e2e: deploy, play, redeploy mid-game, game resumes; live at the chosen domain |

Parallel: M1 ∥ M2 after M0 (merge M1 first; M2 rebases on the registry). M4 ∥ M5 after
M3 (merge M4 first; M5 only touches `client/` and `test/browser/`). M0 and M7 land alone.

## 8. Testing

- **Engine (the highest seam).** `test/engine/playout.ts` plays N seeded bot-vs-bot games
  per game type (N = `FACEDOWN_PLAYOUTS`, default 2000 in accept, 200 in `bun test`) and
  after every move asserts: (1) **conservation** — every card or tile is in exactly one
  place; (2) **no leak** — walking each of the five views (four seats and a spectator)
  finds no card or tile id that the viewer may not see; (3) **legality** — the bot's move
  is in `legalMoves`, and `apply` rejects a sampled illegal move without changing state;
  (4) **determinism** — re-folding the move log from the seed gives a deep-equal state;
  (5) **termination and scoring** — the game ends within a bound and the outcome matches
  the rules. A failure prints `seed=<hex> moves=<n>` and writes the replay to `.tmp/`.
- **Golden replays.** `test/replays/<type>-<name>.json` = {type, ruleset, seed, moves,
  expectedOutcome, expectedFinalStateHash}. Hand-written ones pin specific rules (nil
  made, bag penalty, spades broken, blocked domino deal, tie at 500).
- **Server e2e.** Real `Bun.serve` on port 0 with a scratch SQLite file and real
  WebSocket clients; timer durations injectable (`FACEDOWN_TURN_MS`, `FACEDOWN_HOLD_MS`).
  Cheat attempts: moving out of turn, another seat's move, replayed seq, oversized message,
  asking for a live replay, reading another seat's view.
- **Browser.** One Playwright smoke (M5, extended in M6) in a 390×844 viewport.
- **Purity.** A test scans `src/engine/**` imports and forbidden globals.

## 9. Acceptance

`scripts/accept.sh` is the acceptance: typecheck, lint, unit and engine tests, 2000
playouts per game type, golden replays, server e2e, client build, and (when Playwright
browsers are installed or `CI=1`) the browser smoke. Worker, reviewer and CI run the same
script; the orchestrator never retypes it. Keep it under three minutes.

## 10. Process

- One milestone per worker thread (Codex gpt-6.1-sol, medium), briefed with `worker-brief`,
  draft PR; the orchestrator reads the full diff, reruns `scripts/accept.sh`, a cold
  `reviewer` read, `pr-stress` by a fresh thread, fix rounds in the author's thread, one PR
  comment per round, `gh pr ready`, merge.
- Before the v0.1.0 tag: `skeptic-review` on main, one labelled issue per confirmed bug.
- Tracking: GitHub issues are the truth; the Basecamp `facedown` card has one step per
  milestone.

## 11. Open questions

- Domain for the live deploy (M7): `facedown.contractorkeith.com` unless Keith picks another.
- Deploy overlap (M7): during a hoist cutover the old and new containers briefly share the
  SQLite file. Plan: a `leases` row; the new instance answers `/healthz` at once but loads
  live tables only after taking the lease, which the old instance releases on SIGTERM
  after it stops accepting moves; clients reconnect on socket close.
