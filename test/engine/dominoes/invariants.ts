import {
  dominoes,
  locate,
  type Move,
  type State,
} from "../../../src/engine/dominoes";
import { ends, pips, tiles } from "../../../src/engine/dominoes/state";
import type { GameInvariants } from "../invariants";

export const dominoesInvariants: GameInvariants<State, Move> = {
  pieces: tiles,
  locate,
  illegalMove(state, seat) {
    const first = state.line[0];
    const last = state.line.at(-1);
    const tile =
      first &&
      last &&
      state.hands[seat].find(
        (tile) =>
          !ends(tile).includes(first.left) && !ends(tile).includes(last.right),
      );
    if (tile) return { play: tile, end: "left" };
    if (dominoes.legalMoves(state, seat).some((move) => "play" in move))
      return { draw: true };
    return state.boneyard.length ? { pass: true } : { draw: true };
  },
  // At most 28 plays, 8 draws, and three passes per play plus the final block.
  maxMoves: 50 * 128,
  checkOutcome(state) {
    const result = dominoes.outcome(state);
    const expectedWinner =
      state.scores[0] === state.scores[1]
        ? (state.lastScoringTeam ?? 1)
        : state.scores[0] > state.scores[1]
          ? 0
          : 1;
    if (
      !result ||
      result.winner !== expectedWinner ||
      state.deal >= 50 ||
      (!state.scores.some((score) => score >= 100) && state.deal !== 49) ||
      state.scores.some((score) => !Number.isInteger(score) || score < 0) ||
      !state.lastDeal
    )
      throw new Error("Incorrect dominoes outcome");
    const remaining = state.hands.map((hand) =>
      hand.reduce((sum, tile) => sum + pips(tile), 0),
    );
    if (remaining.some((pips, seat) => pips !== state.lastDeal?.pips[seat]))
      throw new Error("Incorrect final pip summary");
    const totals = [
      (remaining[0] ?? 0) + (remaining[2] ?? 0),
      (remaining[1] ?? 0) + (remaining[3] ?? 0),
    ];
    const ending = state.lastDeal.ending;
    let dealWinner: number | null;
    if (ending.kind === "blocked") {
      if (state.boneyard.length || state.consecutivePasses !== 4)
        throw new Error("Invalid block");
      dealWinner =
        totals[0] === totals[1]
          ? null
          : (totals[0] ?? 0) < (totals[1] ?? 0)
            ? 0
            : 1;
    } else {
      if (state.hands[ending.seat].length !== 0)
        throw new Error("Invalid domino");
      dealWinner = ending.seat % 2;
    }
    const points = [0, 0];
    if (dealWinner !== null) points[dealWinner] = totals[1 - dealWinner] ?? 0;
    if (points.some((points, team) => points !== state.lastDeal?.points[team]))
      throw new Error("Incorrect final points");
  },
};
