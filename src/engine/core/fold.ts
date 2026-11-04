import type { Envelope, Game, MoveError } from "./types";

export type FoldResult<S> =
  | { ok: true; state: S }
  | { ok: false; index: number; error: MoveError };

// Rebuild the cache, stopping at the first rejected envelope (zero-based index).
export function fold<S, M, V, R, K extends string>(
  game: Game<S, M, V, R, K>,
  seed: string,
  moves: readonly Envelope<M>[],
): FoldResult<S> {
  let state = game.init(seed, game.ruleset);
  for (const [index, envelope] of moves.entries()) {
    const result = game.apply(state, envelope);
    if (!result.ok) return { ...result, index };
    state = result.state;
  }
  return { ok: true, state };
}
