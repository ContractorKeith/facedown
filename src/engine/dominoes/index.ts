import { type Game, nextSeat, teamOf } from "../core/types";
import { bot } from "./bot";
import {
  type DominoesRuleset,
  deal,
  ends,
  firstTile,
  type Move,
  pips,
  ruleset,
  type State,
  type View,
} from "./state";

export type { DominoesRuleset, Move, State, TileId, View } from "./state";
export { locate } from "./state";

export const dominoes: Game<State, Move, View, DominoesRuleset> = {
  type: "dominoes",
  ruleset,
  init(seed, config) {
    if (config.maxPip !== 6 || config.handSize !== 5 || config.target !== 100)
      throw new Error("Dominoes uses double-six, five tiles each, target 100");
    return deal(seed, 0, [0, 0]);
  },
  toAct: (state) => state.turn,
  legalMoves(state, seat) {
    if (state.turn !== seat) return [];
    const hand = state.hands[seat];
    // An opening tile always uses left; it exposes both printed ends.
    if (!state.line.length) {
      const opening = state.deal === 0 ? [firstTile(state.hands)] : hand;
      return opening.map((play) => ({ play, end: "left" }));
    }
    const left = state.line[0]?.left;
    const right = state.line.at(-1)?.right;
    const moves: Move[] = [];
    for (const tile of hand) {
      if (ends(tile).includes(left as number))
        moves.push({ play: tile, end: "left" });
      if (ends(tile).includes(right as number))
        moves.push({ play: tile, end: "right" });
    }
    return moves.length
      ? moves
      : state.boneyard.length
        ? [{ draw: true }]
        : [{ pass: true }];
  },
  apply(state, envelope) {
    const reject = (code: "game_over" | "not_your_turn" | "illegal_move") =>
      ({ ok: false, error: { code, message: code } }) as const;
    if (state.turn === null) return reject("game_over");
    if (envelope.seat !== state.turn) return reject("not_your_turn");
    const legal = dominoes.legalMoves(state, envelope.seat);
    const move =
      "timeout" in envelope
        ? bot(dominoes.view(state, { seat: envelope.seat }), legal)
        : envelope.move;
    // Match the full move shape, rejecting extra fields and malformed values.
    const candidate = legal.find(
      (item) =>
        move !== null &&
        typeof move === "object" &&
        Object.keys(item).length === Object.keys(move).length &&
        Object.entries(item).every(
          ([key, value]) =>
            (move as unknown as Record<string, unknown>)[key] === value,
        ),
    );
    if (!candidate) return reject("illegal_move");
    const next: State = {
      ...state,
      hands: state.hands.map((hand) => [...hand]) as State["hands"],
      boneyard: [...state.boneyard],
      line: state.line.map((play) => ({ ...play })),
      scores: [...state.scores],
    };
    const seat = envelope.seat;
    if ("draw" in candidate) {
      const tile = next.boneyard.shift();
      if (tile === undefined) throw new Error("Empty boneyard");
      next.hands[seat].push(tile);
      next.consecutivePasses = 0;
      return { ok: true, state: next };
    }
    next.turn = nextSeat(seat);
    if ("pass" in candidate) next.consecutivePasses++;
    else {
      next.consecutivePasses = 0;
      next.hands[seat] = next.hands[seat].filter(
        (tile) => tile !== candidate.play,
      );
      let [left, right] = ends(candidate.play);
      const join =
        candidate.end === "left" ? next.line[0]?.left : next.line.at(-1)?.right;
      if (
        join !== undefined &&
        (candidate.end === "left" ? right : left) !== join
      )
        [left, right] = [right, left];
      const play = { tile: candidate.play, seat, left, right };
      if (candidate.end === "left") next.line.unshift(play);
      else next.line.push(play);
    }
    if (next.hands[seat].length === 0 || next.consecutivePasses === 4) {
      const totals: [number, number] = [0, 0];
      next.hands.forEach((hand, index) => {
        totals[teamOf(index as typeof seat)] += hand.reduce(
          (sum, tile) => sum + pips(tile),
          0,
        );
      });
      const winner =
        next.hands[seat].length === 0
          ? teamOf(seat)
          : totals[0] === totals[1]
            ? null
            : totals[0] < totals[1]
              ? 0
              : 1;
      if (winner !== null) next.scores[winner] += totals[winner === 0 ? 1 : 0];
      // Only one team scores per deal, so both cannot reach 100 together.
      if (next.scores.some((score) => score >= ruleset.target))
        next.turn = null;
      else
        return {
          ok: true,
          state: deal(state.seed, state.deal + 1, next.scores, state.leader),
        };
    }
    return { ok: true, state: next };
  },
  view(state, viewer) {
    const first = state.line[0];
    const last = state.line.at(-1);
    return {
      hand: "seat" in viewer ? [...state.hands[viewer.seat]] : [],
      line: state.line.map((play) => ({ ...play })),
      openEnds: first && last ? [first.left, last.right] : null,
      tileCounts: state.hands.map((hand) => hand.length),
      boneyardCount: state.boneyard.length,
      scores: [...state.scores],
      deal: state.deal,
      toAct: state.turn,
      consecutivePasses: state.consecutivePasses,
    };
  },
  outcome: (state) =>
    state.turn === null
      ? {
          scores: [...state.scores],
          winner: state.scores[0] >= ruleset.target ? 0 : 1,
        }
      : null,
  bot,
};
