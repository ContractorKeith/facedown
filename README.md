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
