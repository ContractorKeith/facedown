/** biome-ignore-all lint/style/noNonNullAssertion: Legal moves and a completed four-card trick guarantee these entries. */
import {
  type Game,
  nextSeat,
  type Outcome,
  teamOf,
} from "../../../src/engine/core/types";
import type { GameEntry } from "../../../src/engine/registry";
import {
  deal,
  locate,
  type Move,
  type Ruleset,
  type State,
  type View,
} from "./state";

export { locate } from "./state";

export const highcard: Game<State, Move, View, Ruleset, "highcard"> = {
  type: "highcard",
  ruleset: { target: 2 },
  init(seed, ruleset) {
    if (ruleset.target !== 2) throw new Error("Highcard is fixed at two deals");
    return deal(seed, 0, [0, 0]);
  },
  toAct: (state) => state.turn,
  legalMoves(state, seat) {
    if (state.turn !== seat) return [];
    const hand = state.hands[seat];
    const suit = state.trick[0]?.card[1];
    const following = hand.filter((card) => card[1] === suit);
    return (following.length ? following : hand).map((card) => ({ card }));
  },
  apply(state, envelope) {
    if (state.turn === null)
      return {
        ok: false,
        error: { code: "game_over", message: "Game is over" },
      };
    if (state.turn !== envelope.seat)
      return {
        ok: false,
        error: { code: "not_your_turn", message: "Wrong seat" },
      };
    const legal = highcard.legalMoves(state, envelope.seat);
    const move =
      "timeout" in envelope
        ? highcard.bot(highcard.view(state, { seat: envelope.seat }), legal)
        : envelope.move;
    if (!legal.some((candidate) => candidate.card === move.card))
      return {
        ok: false,
        error: {
          code: "illegal_move",
          message: "Must play a held card and follow suit",
        },
      };
    const next: State = {
      ...state,
      hands: state.hands.map((hand, seat) =>
        seat === envelope.seat
          ? hand.filter((card) => card !== move.card)
          : [...hand],
      ) as State["hands"],
      trick: [...state.trick, { seat: envelope.seat, card: move.card }],
      played: [...state.played],
      tricks: [...state.tricks],
      scores: [...state.scores],
      turn: nextSeat(envelope.seat),
    };
    if (next.trick.length === 4) {
      const lead = next.trick[0]!;
      const winner = next.trick
        .filter((play) => play.card[1] === lead.card[1])
        .reduce((best, play) =>
          "9TJQKA".indexOf(play.card[0]!) > "9TJQKA".indexOf(best.card[0]!)
            ? play
            : best,
        );
      const team = teamOf(winner.seat);
      next.tricks[team]++;
      next.played.push(...next.trick.map((play) => play.card));
      next.trick = [];
      next.turn = winner.seat;
      if (next.tricks[team] === 2) {
        next.scores[team]++;
        if (next.scores[team] === highcard.ruleset.target) next.turn = null;
        else
          return {
            ok: true,
            state: deal(state.seed, state.deal + 1, next.scores),
          };
      }
    }
    return { ok: true, state: next };
  },
  view(state, viewer) {
    return {
      hand: "seat" in viewer ? [...state.hands[viewer.seat]] : [],
      trick: state.trick.map((play) => ({ ...play })),
      played: [...state.played],
      turn: state.turn,
      scores: [...state.scores],
    };
  },
  outcome(state): Outcome | null {
    if (state.turn !== null) return null;
    return { scores: [...state.scores], winner: state.scores[0] === 2 ? 0 : 1 };
  },
  bot(_view, legal) {
    const move = [...legal].sort((a, b) =>
      a.card < b.card ? -1 : a.card > b.card ? 1 : 0,
    )[0];
    if (!move) throw new Error("No legal moves");
    return move;
  },
};

export const highcardEntry: GameEntry<State, Move, View, Ruleset, "highcard"> =
  {
    ...highcard,
    locate,
    illegalMove: () => ({ card: "invalid" }),
    maxMoves: 36,
    checkOutcome(state) {
      const outcome = highcard.outcome(state);
      if (
        outcome?.scores[outcome.winner] !== 2 ||
        outcome.scores[1 - outcome.winner]! >= 2 ||
        state.tricks[outcome.winner] !== 2 ||
        state.scores[0] + state.scores[1] !== state.deal + 1
      )
        throw new Error("Incorrect highcard outcome");
    },
  };
