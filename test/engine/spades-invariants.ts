import { deepStrictEqual, ok } from "node:assert";
import { locate, type State, spades } from "../../src/engine/spades";
import { deck } from "../../src/engine/spades/cards";
import type { GameInvariants } from "./invariants";

export const spadesInvariants: GameInvariants<State> = {
  pieces: deck,
  locate,
  illegalMove(state, seat) {
    if (state.phase === "bidding") return { bid: -1 };
    const hand = state.hands[seat];
    const suit = state.trick[0]?.card[1];
    const revoke =
      suit && hand.some((card) => card[1] === suit)
        ? hand.find((card) => card[1] !== suit)
        : undefined;
    return { play: revoke ?? deck.find((card) => !hand.includes(card)) };
  },
  maxMoves: 50 * 56,
  checkOutcome(state) {
    const outcome = spades.outcome(state);
    ok(outcome);
    ok(
      Math.max(...state.scores) >= state.ruleset.target ||
        Math.min(...state.scores) <= state.ruleset.mercyScore ||
        state.deal + 1 === state.ruleset.maxDeals,
    );
    const expected =
      state.scores[0] === state.scores[1]
        ? (state.lastScoringTeam ?? 1)
        : state.scores[0] > state.scores[1]
          ? 0
          : 1;
    ok(outcome.winner === expected);
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
