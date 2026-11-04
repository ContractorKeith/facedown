export type Seat = 0 | 1 | 2 | 3;
export type Team = 0 | 1;
export type Viewer = { seat: Seat } | { spectator: true };
export type Envelope<M> =
  | { seat: Seat; move: M }
  | { seat: Seat; timeout: true };
export type GameType = "spades" | "dominoes";
export type MoveError = {
  code: "illegal_move" | "not_your_turn" | "game_over";
  message: string;
};
export type Outcome = { scores: [number, number]; winner: Team };

// K lets test-only games implement the contract without joining the production types.
export interface Game<S, M, V, R, K extends string = GameType> {
  type: K;
  ruleset: R;
  init(seed: string, ruleset: R): S;
  toAct(state: S): Seat | null;
  legalMoves(state: S, seat: Seat): M[];
  apply(
    state: S,
    envelope: Envelope<M>,
  ): { ok: true; state: S } | { ok: false; error: MoveError };
  view(state: S, viewer: Viewer): V;
  outcome(state: S): Outcome | null;
  bot(view: V, legal: M[]): M;
}

export const seats: readonly Seat[] = [0, 1, 2, 3];
export const teamOf = (seat: Seat): Team => (seat % 2) as Team;
export const partnerOf = (seat: Seat): Seat => ((seat + 2) % 4) as Seat;
export const nextSeat = (seat: Seat): Seat => ((seat + 1) % 4) as Seat;
