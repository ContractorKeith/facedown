import { checkEnvelope, isPlainObject } from "../core/envelope";
import {
  type Envelope,
  type Game,
  nextSeat,
  type Seat,
  type Viewer,
} from "../core/types";
import { bot } from "./bot";
import { trickWinner } from "./cards";
import { scoreDeal, winningTeam } from "./scoring";
import {
  deal,
  type Move,
  type Ruleset,
  SpadesRuleset,
  type State,
  type View,
} from "./state";

export type { CardId } from "./cards";
export type { Move, Ruleset, State, View } from "./state";
export { locate, SpadesRuleset } from "./state";
export const init = (seed: string, ruleset: Ruleset): State => {
  if (
    !ruleset.nil ||
    ruleset.blindNil ||
    ![ruleset.target, ruleset.bagLimit, ruleset.maxDeals].every(
      (n) => Number.isInteger(n) && n > 0,
    ) ||
    !Number.isInteger(ruleset.bagPenalty) ||
    ruleset.bagPenalty < 0 ||
    !Number.isInteger(ruleset.mercyScore) ||
    ruleset.mercyScore >= 0
  )
    throw new Error("Unsupported Spades ruleset");
  return deal(seed, 0, [0, 0], [0, 0], ruleset);
};
export const toAct = (state: State): Seat | null => state.turn;
export function legalMoves(state: State, seat: Seat): Move[] {
  if (state.turn === null || state.turn !== seat) return [];
  if (state.phase === "bidding")
    return Array.from({ length: 14 }, (_, bid) => ({ bid }));
  const hand = state.hands[seat];
  const suit = state.trick[0]?.card[1];
  const following = hand.filter((card) => card[1] === suit);
  const nonSpades = hand.filter((card) => card[1] !== "S");
  const cards = suit
    ? following.length
      ? following
      : hand
    : !state.spadesBroken && nonSpades.length
      ? nonSpades
      : hand;
  return cards.map((play) => ({ play }));
}
export function view(state: State, viewer: Viewer): View {
  return {
    seat: "seat" in viewer ? viewer.seat : null,
    hand: "seat" in viewer ? [...state.hands[viewer.seat]] : [],
    deal: state.deal,
    dealer: state.dealer,
    toAct: state.turn,
    phase: state.phase,
    bids: [...state.bids],
    trick: state.trick.map((play) => ({ ...play })),
    tricks: [...state.tricks],
    scores: [...state.scores],
    bags: [...state.bags],
    spadesBroken: state.spadesBroken,
    lastDeal: state.lastDeal
      ? {
          bids: [...state.lastDeal.bids],
          tricks: [...state.lastDeal.tricks],
          points: [...state.lastDeal.points],
          bags: [...state.lastDeal.bags],
        }
      : null,
  };
}
export function apply(
  state: State,
  envelope: Envelope<Move>,
): ReturnType<Game<State, Move, View, Ruleset>["apply"]> {
  const envelopeError = checkEnvelope(envelope);
  if (envelopeError) return { ok: false, error: envelopeError };
  if (state.turn === null)
    return { ok: false, error: { code: "game_over", message: "Game is over" } };
  if (state.turn !== envelope.seat)
    return {
      ok: false,
      error: { code: "not_your_turn", message: "Wrong seat" },
    };
  const legal = legalMoves(state, envelope.seat);
  const move =
    "timeout" in envelope
      ? bot(view(state, { seat: envelope.seat }), legal)
      : envelope.move;
  if (
    !isPlainObject(move) ||
    Reflect.ownKeys(move).length !== 1 ||
    !Object.hasOwn(move, state.phase === "bidding" ? "bid" : "play") ||
    !legal.some((candidate) =>
      "bid" in candidate
        ? "bid" in move && candidate.bid === move.bid && !("play" in move)
        : "play" in move && candidate.play === move.play && !("bid" in move),
    )
  )
    return {
      ok: false,
      error: { code: "illegal_move", message: "Choose a legal bid or play" },
    };
  const next: State = { ...state };
  next.turn = nextSeat(envelope.seat);
  if ("bid" in move) {
    next.bids = [...state.bids];
    next.bids[envelope.seat] = move.bid;
    if (next.bids.every((bid) => bid !== null)) {
      next.phase = "playing";
      next.turn = nextSeat(next.dealer);
    }
  } else {
    next.hands = [...state.hands];
    next.hands[envelope.seat] = state.hands[envelope.seat].filter(
      (card) => card !== move.play,
    );
    next.trick = [...state.trick, { seat: envelope.seat, card: move.play }];
    next.spadesBroken ||= move.play[1] === "S";
    if (next.trick.length === 4) {
      const winner = trickWinner(next.trick).seat;
      next.tricks = [...state.tricks];
      next.tricks[winner]++;
      next.turn = winner;
      next.played = [...state.played, ...next.trick.map((play) => play.card)];
      next.trick = [];
      if (next.played.length === 52) {
        const scored = scoreDeal(next);
        next.scores = scored.scores;
        next.bags = scored.bags;
        const points: [number, number] = [
          next.scores[0] - state.scores[0],
          next.scores[1] - state.scores[1],
        ];
        next.lastDeal = {
          bids: [...next.bids],
          tricks: [...next.tricks],
          points,
          bags: scored.earnedBags,
        };
        if (points[0] !== points[1])
          next.lastScoringTeam = points[0] > points[1] ? 0 : 1;
        if (winningTeam(next) !== null) next.turn = null;
        else
          return {
            ok: true,
            state: deal(
              next.seed,
              next.deal + 1,
              next.scores,
              next.bags,
              next.ruleset,
              next.lastDeal,
              next.lastScoringTeam,
            ),
          };
      }
    }
  }
  return { ok: true, state: next };
}
export const outcome = (state: State) => {
  const winner = winningTeam(state);
  return state.turn === null && winner !== null
    ? { scores: [...state.scores] as [number, number], winner }
    : null;
};
export const spades: Game<State, Move, View, Ruleset> = {
  type: "spades",
  ruleset: SpadesRuleset,
  init,
  toAct,
  legalMoves,
  apply,
  view,
  outcome,
  bot,
};
