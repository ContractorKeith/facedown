# Test-only games and the playout harness

The `Game` contract takes a type parameter `K` for its type name so test-only games (`highcard`) implement it without being added to the production `GameType` union. Likewise `locate` returns structural places (`{seat}`, `{public}`, `{hidden}`) so production engine modules never import test code. The purity test parses sources through TypeScript 7's native API server with virtual files, so fixtures never touch disk.

Refolding the full log after every move is quadratic in game length, so the harness checks the empty log, checks at intervals and at the end, and keeps one live fold between. Engine states are plain JSON, so cloning is a JSON round trip, which keeps 2000-game playouts cheap. The Glicko-2 test expects 1464.05067, the unrounded value; Glickman's paper rounds intermediate values and prints a slightly different number.
