import { dealRng, shuffle } from "../../../src/engine/core/random";
import { nextSeat, type Seat } from "../../../src/engine/core/types";
import type { Place } from "../invariants";

export const deck = [..."9TJQKA"].flatMap((rank) => [`${rank}C`, `${rank}D`]);
export type Play = { seat: Seat; card: string };
export type State = {
  seed: string;
  deal: number;
  dealer: Seat;
  turn: Seat | null;
  hands: [string[], string[], string[], string[]];
  trick: Play[];
  played: string[];
  tricks: [number, number];
  scores: [number, number];
};
export type Move = { card: string };
export type View = {
  hand: string[];
  trick: Play[];
  played: string[];
  turn: Seat | null;
  scores: [number, number];
};
export type Ruleset = { target: number };

export function deal(seed: string, n: number, scores: [number, number]): State {
  const cards = shuffle(deck, dealRng(seed, n));
  const dealer = (n % 4) as Seat;
  return {
    seed,
    deal: n,
    dealer,
    turn: nextSeat(dealer),
    hands: [
      cards.slice(0, 3),
      cards.slice(3, 6),
      cards.slice(6, 9),
      cards.slice(9, 12),
    ],
    trick: [],
    played: [],
    tricks: [0, 0],
    scores,
  };
}

export function locate(state: State): ReadonlyMap<string, readonly Place[]> {
  const result = new Map<string, Place[]>();
  const add = (card: string, place: Place) =>
    result.set(card, [...(result.get(card) ?? []), place]);
  for (const [seat, hand] of state.hands.entries()) {
    for (const card of hand) add(card, { seat: seat as Seat });
  }
  for (const card of state.played) add(card, { public: true });
  for (const play of state.trick) add(play.card, { public: true });
  return result;
}
