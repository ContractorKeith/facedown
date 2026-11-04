import type { Game, GameType, Seat } from "../../src/engine/core/types";

export type Place = { seat: Seat } | { public: true } | { hidden: true };
export interface GameInvariants<S = unknown, M = unknown> {
  pieces: readonly string[];
  locate(state: S): ReadonlyMap<string, readonly Place[]>;
  illegalMove(state: S, seat: Seat): M;
  checkOutcome(state: S): void;
  maxMoves: number;
}
export interface GameEntry<
  S = unknown,
  M = unknown,
  V = unknown,
  R = unknown,
  K extends string = GameType,
> extends Game<S, M, V, R, K>,
    GameInvariants<S, M> {}
