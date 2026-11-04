# facedown

Spades and partner dominoes with friends, on your phone, where nobody — not even your
browser — sees a card it shouldn't.

- The server is the only party that holds hidden cards and tiles. Your browser receives your
  hand and the public table, nothing else.
- Every game is a seed plus a move log. The server publishes the seed's SHA-256 before the
  first deal and reveals the seed after the last, so you can replay any finished game and
  check the deals were honest.
- Drop out and a bot holds your seat until you come back.
- Glicko-2 ratings per game, rated on 2v2 results.

Status: M0–M5 complete; M6 client and verified replays implemented; deployment is next. See [`docs/PLAN.md`](docs/PLAN.md).

MIT licensed.

### Check a game yourself

Open a finished game’s replay to see every hand and step through its moves. Before the
first deal, the server publishes a seed commitment (the SHA-256 of its secret seed).
After the game, it reveals the seed. Your browser checks the standard ruleset, seed,
move-log hash chain, and stored final scores and winner. It saves the first commitment
and final move-log hash seen live, so the replay can be compared with those local records.

With local records → "Verified: matches the commitment and move log your browser saw during the game".
Without → "Consistent: the seed matches the published commitment and the log replays to the stored result (this browser didn't watch this game live)".
Mismatch stays Mismatch and tells you which check failed.

## Deploy with hoist

Keith performs the first live push. On a hoist server with DNS pointing
`facedown.contractorkeith.com` at it:

```sh
export HOIST_HOST=your-server
hoist apps:create facedown --domain facedown.contractorkeith.com --health-path /healthz
hoist config:set facedown FACEDOWN_DB=/data/facedown.db FACEDOWN_ORIGIN=https://facedown.contractorkeith.com PORT=8080
```

**Persistent storage prerequisite:** current hoist has no volume verb or mount option.
Its Docker adapter does not attach persistent volumes. Before pushing, hoist must
support mounting one persistent Docker volume at `/data` in every facedown release,
including restart and rollback, writable by the image's `bun` user (UID 1000).
A volume must be shared by overlapping releases; keep separate volumes for previews.
Do not deploy with ephemeral container storage. There is no working hoist volume
command to paste today; this is the remaining deployment blocker.

Once that mount support is available and configured:

```sh
git remote add hoist hoist@your-server:facedown.git
git push hoist main
hoist logs facedown -f
hoist releases facedown --json
hoist logs facedown --release v1
hoist rollback facedown v1
```

Do not set `FACEDOWN_INSECURE_COOKIE` in production. Hoist health-checks `/healthz`
before cutover, then stops the old container. The standby returns 503 for table
traffic until it acquires the SQLite lease; sockets close with 1012 and reconnect.
The image honors `PORT` (8080 by default). Back up `/data`, including SQLite WAL
safely with SQLite-aware tooling. Rollback restores an image and config, not database
contents; use a compatible release and retain the same volume.

For a local container handoff check, run `bun run test:container` with Docker access.
It creates and removes only its own `facedown-test-*` containers and volume, and
builds `facedown-test-image:latest` (under 200 MB). Without Docker it prints a skip message.
