import { dealRng, shuffle } from "../core/random";
import { nextSeat, type Seat } from "../core/types";
import { type CardId, deck, type Play } from "./cards";

export const SpadesRuleset = {
  target: 500,
  nil: true,
  blindNil: false,
  bagLimit: 10,
  bagPenalty: 100,
  maxDeals: 50,
  mercyScore: -200,
} as const;
export type Ruleset = {
  target: number;
  nil: boolean;
  blindNil: boolean;
  bagLimit: number;
  bagPenalty: number;
  maxDeals: number;
  mercyScore: number;
};
export type DealSummary = {
  bids: State["bids"];
  tricks: State["tricks"];
  points: [number, number];
  // Bags earned in this deal, before any ten-bag deduction.
  bags: [number, number];
};
export type Move = { bid: number } | { play: CardId };
export type State = {
  seed: string;
  ruleset: Ruleset;
  lastDeal: DealSummary | null;
  lastScoringTeam: 0 | 1 | null;
  deal: number;
  dealer: Seat;
  turn: Seat | null;
  phase: "bidding" | "playing";
  hands: [CardId[], CardId[], CardId[], CardId[]];
  bids: [number | null, number | null, number | null, number | null];
  trick: Play[];
  played: CardId[];
  tricks: [number, number, number, number];
  scores: [number, number];
  bags: [number, number];
  spadesBroken: boolean;
};
export type View = Pick<
  State,
  | "deal"
  | "dealer"
  | "phase"
  | "bids"
  | "trick"
  | "tricks"
  | "scores"
  | "bags"
  | "spadesBroken"
  | "lastDeal"
> & {
  seat: Seat | null;
  hand: CardId[];
  toAct: Seat | null;
};
export function deal(
  seed: string,
  n: number,
  scores: [number, number],
  bags: [number, number],
  ruleset: Ruleset,
  lastDeal: DealSummary | null = null,
  lastScoringTeam: 0 | 1 | null = null,
): State {
  const cards = shuffle(deck, dealRng(seed, n));
  const dealer = (n % 4) as Seat;
  return {
    seed,
    ruleset: { ...ruleset },
    lastDeal,
    lastScoringTeam,
    deal: n,
    dealer,
    turn: nextSeat(dealer),
    phase: "bidding",
    hands: [
      cards.slice(0, 13),
      cards.slice(13, 26),
      cards.slice(26, 39),
      cards.slice(39),
    ],
    bids: [null, null, null, null],
    trick: [],
    played: [],
    tricks: [0, 0, 0, 0],
    scores: [...scores],
    bags: [...bags],
    spadesBroken: false,
  };
}
export type Place = { seat: Seat } | { public: true };
export function locate(state: State): ReadonlyMap<string, readonly Place[]> {
  const result = new Map<string, Place[]>();
  const add = (card: CardId, place: Place) => {
    const places = result.get(card);
    if (places) places.push(place);
    else result.set(card, [place]);
  };
  for (const seat of [0, 1, 2, 3] as const)
    for (const card of state.hands[seat]) add(card, { seat });
  for (const card of state.played) add(card, { public: true });
  for (const play of state.trick) add(play.card, { public: true });
  return result;
}
