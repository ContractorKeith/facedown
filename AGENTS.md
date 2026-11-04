# facedown

A server and phone-first web client for four-handed partner games (Spades and partner Draw
Dominoes in v1; Hearts and Euchre later) where the server is the only party that sees hidden
information. Every game is a seed plus a move log; the seed is committed before the first
deal and revealed after the last, so any finished game can be replayed and checked. Bun +
TypeScript, a pure engine, `bun:sqlite`, a Svelte client, deployed through hoist. MIT.
"Done" for v1 is every v1 row in `docs/PLAN.md` §3 working, `scripts/accept.sh` green from a
clean clone, and the app live behind hoist.

## Status

M0 complete; M1 Spades engine and bot implemented in this PR.

## Commands

```bash
bun install
bun run typecheck         # tsc --noEmit
bun run lint              # Biome
bun test                  # unit, purity, goldens, 200 playouts per game
bun run replay:record <type> <64-char-hex-seed>
bash scripts/accept.sh    # full gate, 2000 playouts per game
```

## Pointers

- `docs/PLAN.md` — feature matrix, architecture and engine contract, rules, data model,
  API/protocol, milestones, testing.
- `CONTEXT.md` — glossary. Use its words in code, issues and PRs (Deal, not round; Hand is
  what a seat holds).
- `docs/adr/0001` — seed + move log is the record, with a seed commitment.
- Session logs: `~/Projects/worklog/projects/facedown.md` (not in this repo).

## Conventions & Gotchas

- `src/engine` is pure: imports only from `src/engine`; no `Bun`, `process`, `Date`,
  `Math.random`, `crypto`, timers, `fetch` or DOM. A test enforces it. The browser replay
  viewer runs the same engine.
- Only `view(state, viewer)` output reaches a client. Bots and timeout auto-play decide
  from a seat's view and legal moves, never from full state.
- State is always `fold(init(seed), moves)`; in-memory state and snapshots are caches.
- The seed is never returned by any API while a game is live.
- Only `src/server/store` touches SQLite.
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
