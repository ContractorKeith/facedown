---
name: skeptic-env
description: "How a skeptical reviewer builds, runs, seeds and attacks facedown. Read by the skeptic-review skill; not a workflow on its own."
---

# skeptic-env — facedown

A Bun server and Svelte client for four-handed partner games (Spades, partner Draw
Dominoes). The server is the only trusted party: clients receive only `view()` output, and
every game is a seed plus a move log with a published seed commitment. "Done" for v1 is
every v1 row in `docs/PLAN.md` §3 working and `scripts/accept.sh` green.

## Stack and commands

```bash
export TMPDIR=$PWD/.tmp; mkdir -p .tmp
bun install --frozen-lockfile
bash scripts/accept.sh            # the whole gate; per-step scripts are listed in AGENTS.md
```

Scratch data: point `FACEDOWN_DB` at a file under `.tmp/`. Never use a real deploy's
database. Timers are injectable (`FACEDOWN_TURN_MS`, `FACEDOWN_HOLD_MS`) so disconnect and
timeout paths run in seconds.

## Platforms

| Platform | Ships | Review on | Notes |
|---|---|---|---|
| Linux | yes (server, container) | Omarchy | the deploy target |
| Browsers | yes (client) | Omarchy (Chromium), Mac Studio (Safari) | phone portrait first |

## What to attack

- **Hidden information.** Every message on the wire for every viewer: does any card or tile
  id appear that the viewer may not see? Boneyard, other hands, the seed while live, the
  replay endpoint while live, error messages that echo state.
- **Determinism.** Re-fold any stored game from seed + moves and compare; timeouts and bot
  moves inside the log; a golden replay edited by one move.
- **Protocol.** Out-of-turn moves, another seat's move, stale and replayed seq, oversized
  and malformed messages, floods past the rate limit, two sockets for one seat, reclaim
  races with the 3-minute bot takeover, spectator sockets sending moves.
- **Ratings.** Leaver rule (bot-held at end), reclaim clearing it, casual tables never
  touching ratings, guests never in rated games.
- **Restart.** Kill the server mid-deal; boot must rebuild every live table from SQLite.
- **Test honesty.** A playout invariant that still passes with its check removed; CI green
  while running zero playouts.

## Traps

- Spectators see no hands while live by design; hands appear only in the replay.
- Bots are deliberately simple rules, not strong players.
- `.claude/skills` is a symlink to `.agents/skills`; `CLAUDE.md` is one line (`@AGENTS.md`).
