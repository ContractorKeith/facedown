import { deepStrictEqual, ok } from "node:assert";
import { locate, type State, spades } from "../../src/engine/spades";
import { deck } from "../../src/engine/spades/cards";
import type { GameInvariants } from "./invariants";

export const spadesInvariants: GameInvariants<State> = {
  pieces: deck,
  locate,
  illegalMove: () => ({ bid: -1 }),
  maxMoves: 5600,
  checkOutcome(state) {
    const outcome = spades.outcome(state);
    ok(outcome);
    ok(outcome.scores[outcome.winner] >= 500);
    ok(
      outcome.scores[outcome.winner] >
        outcome.scores[outcome.winner === 0 ? 1 : 0],
    );
    deepStrictEqual(outcome.scores, state.scores);
    ok(state.played.length === 52 && state.trick.length === 0);
    ok(state.tricks.reduce((sum, tricks) => sum + tricks, 0) === 13);
    ok(
      state.bags.every(
        (bags) => Number.isInteger(bags) && bags >= 0 && bags < 10,
      ),
    );
    ok(state.hands.every((hand) => hand.length === 0));
  },
};
