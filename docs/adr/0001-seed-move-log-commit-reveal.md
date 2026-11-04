# Seed and move log are the game record, with a seed commitment

A game is stored as its seed plus its move log; all state is rebuilt by folding the moves through the pure engine, and snapshots are only a cache. The server publishes sha256(seed) when the game starts and reveals the seed when it ends, so any player can re-run every deal and confirm nothing was rigged. We chose this over storing state snapshots because it makes every replay a determinism test and lets players verify the server, which is the only trusted party.
