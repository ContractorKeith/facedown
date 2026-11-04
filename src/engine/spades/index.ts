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
  for (const key of Object.keys(SpadesRuleset) as (keyof Ruleset)[])
    if (ruleset[key] !== SpadesRuleset[key])
      throw new Error("Unsupported Spades ruleset");
  return deal(seed, 0, [0, 0], [0, 0]);
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
  };
}
export function apply(
  state: State,
  envelope: Envelope<Move>,
): ReturnType<Game<State, Move, View, Ruleset>["apply"]> {
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
    !move ||
    typeof move !== "object" ||
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
  const next: State = {
    ...state,
    bids: [...state.bids],
    hands: state.hands.map((hand) => [...hand]) as State["hands"],
    trick: [...state.trick],
    played: [...state.played],
    tricks: [...state.tricks],
    scores: [...state.scores],
    bags: [...state.bags],
  };
  next.turn = nextSeat(envelope.seat);
  if ("bid" in move) {
    next.bids[envelope.seat] = move.bid;
    if (next.bids.every((bid) => bid !== null)) {
      next.phase = "playing";
      next.turn = nextSeat(next.dealer);
    }
  } else {
    next.hands[envelope.seat] = next.hands[envelope.seat].filter(
      (card) => card !== move.play,
    );
    next.trick.push({ seat: envelope.seat, card: move.play });
    next.spadesBroken ||= move.play[1] === "S";
    if (next.trick.length === 4) {
      const winner = trickWinner(next.trick).seat;
      next.tricks[winner]++;
      next.turn = winner;
      next.played.push(...next.trick.map((play) => play.card));
      next.trick = [];
      if (next.played.length === 52) {
        Object.assign(next, scoreDeal(next));
        if (winningTeam(next.scores) !== null) next.turn = null;
        else
          return {
            ok: true,
            state: deal(next.seed, next.deal + 1, next.scores, next.bags),
          };
      }
    }
  }
  return { ok: true, state: next };
}
export const outcome = (state: State) => {
  const winner = winningTeam(state.scores);
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
