import { dealRng, shuffle } from "../core/random";
import { nextSeat, type Seat } from "../core/types";

export type Pip = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type TileId = `${Pip}-${Pip}`;
export type DominoesRuleset = { maxPip: 6; handSize: 5; target: 100 };
export const ruleset: DominoesRuleset = { maxPip: 6, handSize: 5, target: 100 };
export const tiles: readonly TileId[] = Array.from({ length: 7 }, (_, a) =>
  Array.from({ length: 7 - a }, (_, b) => `${a}-${a + b}` as TileId),
).flat();
export const ends = (tile: TileId): [number, number] => [
  Number(tile[0]),
  Number(tile[2]),
];
export const pips = (tile: TileId): number =>
  ends(tile).reduce((a, b) => a + b);
export type Move =
  | { play: TileId; end: "left" | "right" }
  | { draw: true }
  | { pass: true };
export type Play = { tile: TileId; seat: Seat; left: number; right: number };
export type State = {
  seed: string;
  deal: number;
  leader: Seat;
  turn: Seat | null;
  hands: [TileId[], TileId[], TileId[], TileId[]];
  boneyard: TileId[];
  line: Play[];
  scores: [number, number];
  consecutivePasses: number;
};
export type View = {
  hand: TileId[];
  line: Play[];
  openEnds: [number, number] | null;
  tileCounts: number[];
  boneyardCount: number;
  scores: [number, number];
  deal: number;
  toAct: Seat | null;
  consecutivePasses: number;
};

// Doubles outrank all other tiles; remaining ties use the higher end.
export function firstTile(hands: readonly (readonly TileId[])[]): TileId {
  const tile = hands.flat().sort((a, b) => {
    const double = (id: TileId) => Number(id[0] === id[2]);
    return (
      double(b) - double(a) || pips(b) - pips(a) || ends(b)[1] - ends(a)[1]
    );
  })[0];
  if (!tile) throw new Error("No dealt tiles");
  return tile;
}

export function deal(
  seed: string,
  n: number,
  scores: [number, number],
  previousLeader?: Seat,
): State {
  const shuffled = shuffle(tiles, dealRng(seed, n));
  const hands: State["hands"] = [
    shuffled.slice(0, 5),
    shuffled.slice(5, 10),
    shuffled.slice(10, 15),
    shuffled.slice(15, 20),
  ];
  const leader =
    previousLeader === undefined
      ? (hands.findIndex((hand) => hand.includes(firstTile(hands))) as Seat)
      : nextSeat(previousLeader);
  return {
    seed,
    deal: n,
    leader,
    turn: leader,
    hands,
    boneyard: shuffled.slice(20),
    line: [],
    scores: [...scores],
    consecutivePasses: 0,
  };
}

// Structural locations keep this production module independent of test code.
export type Place = { seat: Seat } | { public: true } | { hidden: true };
export function locate(state: State): ReadonlyMap<string, readonly Place[]> {
  const result = new Map<string, Place[]>();
  const add = (tile: TileId, place: Place) =>
    result.set(tile, [...(result.get(tile) ?? []), place]);
  for (const [seat, hand] of state.hands.entries())
    for (const tile of hand) add(tile, { seat: seat as Seat });
  for (const tile of state.boneyard) add(tile, { hidden: true });
  for (const play of state.line) add(play.tile, { public: true });
  return result;
}
