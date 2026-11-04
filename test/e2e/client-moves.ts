import type { GameType } from "../../src/engine/core/types";
import type {
  Move as DominoMove,
  View as DominoView,
} from "../../src/engine/dominoes";
import type {
  Move as SpadesMove,
  View as SpadesView,
} from "../../src/engine/spades";

// Client rules use only the received hand and public fields.
export function legalMovesFromView(type: GameType, value: unknown): unknown[] {
  if (type === "spades") {
    const view = value as SpadesView;
    if (view.phase === "bidding")
      return Array.from({ length: 14 }, (_, bid) => ({ bid }));
    const suit = view.trick[0]?.card[1];
    const following = view.hand.filter((card) => card[1] === suit);
    const nonSpades = view.hand.filter((card) => card[1] !== "S");
    const cards = suit
      ? following.length
        ? following
        : view.hand
      : !view.spadesBroken && nonSpades.length
        ? nonSpades
        : view.hand;
    return cards.map((play) => ({ play }) satisfies SpadesMove);
  }
  const view = value as DominoView;
  if (!view.line.length) {
    const rank = (tile: string) =>
      Number(tile[0] === tile[2]) * 100 + Number(tile[0]) + Number(tile[2]);
    const opening =
      view.deal === 0
        ? [...view.hand]
            .sort((a, b) => rank(b) - rank(a) || Number(b[2]) - Number(a[2]))
            .slice(0, 1)
        : view.hand;
    return opening.map((play) => ({ play, end: "left" }) satisfies DominoMove);
  }
  const moves: DominoMove[] = [];
  for (const tile of view.hand) {
    const ends = [Number(tile[0]), Number(tile[2])];
    if (ends.includes(view.openEnds?.[0] as number))
      moves.push({ play: tile, end: "left" });
    if (ends.includes(view.openEnds?.[1] as number))
      moves.push({ play: tile, end: "right" });
  }
  return moves.length
    ? moves
    : view.boneyardCount
      ? [{ draw: true }]
      : [{ pass: true }];
}
