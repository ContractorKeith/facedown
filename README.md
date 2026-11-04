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

Status: M0–M7 merged; skeptic round 1 fixes in progress. See [`docs/PLAN.md`](docs/PLAN.md).

MIT licensed.

### Check a game yourself

Open a finished game’s replay to see every hand and step through its moves. Before the
first deal, the server publishes a seed commitment (the SHA-256 of its secret seed).
After the game, it reveals the seed. Your browser checks the standard ruleset, seed,
move-log hash chain, and stored final scores and winner. It checks each live move against
the previous hash and saves the latest anchor, so Verified requires a matching, unbroken
chain from the commitment through the final move.

With local records → "Verified: matches the commitment and move log your browser saw during the game".
Without → "Consistent: the seed matches the published commitment and the log replays to the stored result (this browser didn't watch this game live)".
Mismatch stays Mismatch and tells you which check failed.

## Run it locally

```sh
bun install
bun run build
bun run dev
```

Open http://localhost:8080. `dev` sets `FACEDOWN_INSECURE_COOKIE=1` for local HTTP,
including Safari. The default bind is `127.0.0.1`; override it with `HOST`.

## Deploy with hoist

Keith performs the first live push. On a hoist server with DNS pointing
`facedown.contractorkeith.com` at it:

```sh
export HOIST_HOST=your-server
hoist apps:create facedown --domain facedown.contractorkeith.com --health-path /healthz
hoist config:set facedown FACEDOWN_DB=/data/facedown.db FACEDOWN_ORIGIN=https://facedown.contractorkeith.com PORT=8080
```

**Persistent storage prerequisite:** current hoist has no volume verb or mount option
([hoist#40](https://github.com/ContractorKeith/hoist/issues/40)).
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
After SIGKILL, clients may show “reconnecting” for up to 20 seconds while the lease
expires.
The image sets `HOST=0.0.0.0` and honors `PORT` (8080 by default).
It sets `FACEDOWN_TRUST_PROXY=1`: limits use the last `X-Forwarded-For` hop,
which Caddy appends. Only expose this image behind hoist’s proxy. Outside the
image, proxy trust is off and limits use the socket address; enable it only
behind a trusted proxy. Registrations count all attempts (5/IP/hour), guests
allow 30/IP/hour, and sessions allow 8 sockets. The lobby returns the newest
50 open plus 50 live tables, with at most 200 open tables globally.
Sockets receive `{t:"ping"}` every 20 seconds (`FACEDOWN_PING_MS`). Back up `/data`, including SQLite WAL
safely with SQLite-aware tooling. Rollback restores an image and config, not database
contents; use a compatible release and retain the same volume.

For a local container handoff check, run `bun run test:container` with Docker access.
It creates and removes only its own `facedown-test-*` containers and volume, and
builds `facedown-test-image:latest` (under 200 MB). Without opt-in it skips; explicitly
opting in requires Docker and fails if unavailable.
