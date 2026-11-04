import type { Game, GameType, Seat } from "./core/types";

export type Place = { seat: Seat } | { public: true } | { hidden: true };
// Entries carry invariant hooks so registering a game also enrolls it in playouts.
// An array preserves duplicate ids so conservation can detect duplicate pieces.
export interface GameEntry<
  S = unknown,
  M = unknown,
  V = unknown,
  R = unknown,
  K extends string = GameType,
> extends Game<S, M, V, R, K> {
  locate(state: S): ReadonlyMap<string, readonly Place[]>;
  illegalMove(state: S, seat: Seat): M;
  checkOutcome(state: S): void;
  maxMoves: number;
}
export const registry = new Map<GameType, GameEntry>();
