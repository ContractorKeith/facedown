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
