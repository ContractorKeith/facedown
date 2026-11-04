import type { Seat } from "../core/types";

export const ranks = "23456789TJQKA";
export type CardId =
  `${"2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "T" | "J" | "Q" | "K" | "A"}${"C" | "D" | "H" | "S"}`;
export const deck = [..."CDHS"].flatMap((suit) =>
  [...ranks].map((rank) => `${rank}${suit}` as CardId),
);
export const rank = (card: CardId): number => ranks.indexOf(card[0] ?? "");
export type Play = { seat: Seat; card: CardId };
// A trump beats every side suit; otherwise only the led suit can win.
export function beats(card: CardId, best: CardId): boolean {
  return card[1] === best[1] ? rank(card) > rank(best) : card[1] === "S";
}
export function trickWinner(trick: readonly Play[]): Play {
  const first = trick[0];
  if (!first) throw new Error("Empty trick");
  return trick
    .slice(1)
    .reduce((best, play) => (beats(play.card, best.card) ? play : best), first);
}
