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

Status: planned, no code yet. See [`docs/PLAN.md`](docs/PLAN.md).

MIT licensed.

### Check a game yourself

Open a finished game’s replay to see every hand and step through its moves. Before the
first deal, the server publishes a seed commitment (the SHA-256 of its secret seed).
After the game, it reveals the seed. Your browser checks that commitment and runs the
same game engine through the move log. “Verified” means the seed matches and the log
produces the stored final scores and winner; “Mismatch” tells you which check failed.
