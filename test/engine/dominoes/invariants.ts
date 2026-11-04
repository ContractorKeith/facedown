import { dominoes, locate, type State } from "../../../src/engine/dominoes";
import { pips, tiles } from "../../../src/engine/dominoes/state";
import type { GameInvariants } from "../invariants";

export const dominoesInvariants: GameInvariants<State> = {
  pieces: tiles,
  locate,
  illegalMove: () => ({ play: "invalid", end: "left" }),
  maxMoves: 20000,
  checkOutcome(state) {
    const result = dominoes.outcome(state);
    if (
      !result ||
      result.scores[result.winner] < 100 ||
      result.scores[result.winner === 0 ? 1 : 0] >= 100 ||
      result.scores.some((score) => !Number.isInteger(score) || score < 0) ||
      !(
        state.hands.some((hand) => hand.length === 0) ||
        state.consecutivePasses === 4
      )
    )
      throw new Error("Incorrect dominoes outcome");
    const totals = [0, 0];
    state.hands.forEach((hand, seat) => {
      totals[seat % 2] =
        (totals[seat % 2] ?? 0) +
        hand.reduce((sum, tile) => sum + pips(tile), 0);
    });
    if (state.consecutivePasses === 4) {
      if (
        state.boneyard.length ||
        (totals[result.winner] ?? 0) >= (totals[1 - result.winner] ?? 0)
      )
        throw new Error("Blocked winner must have fewer pips");
    } else if (
      !state.hands.some(
        (hand, seat) => hand.length === 0 && seat % 2 === result.winner,
      )
    )
      throw new Error("Winning team must domino");
  },
};
