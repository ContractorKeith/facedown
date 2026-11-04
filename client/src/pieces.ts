const ranks: Record<string, string> = {
  A: "Ace",
  K: "King",
  Q: "Queen",
  J: "Jack",
  T: "Ten",
  "9": "Nine",
  "8": "Eight",
  "7": "Seven",
  "6": "Six",
  "5": "Five",
  "4": "Four",
  "3": "Three",
  "2": "Two",
};
const suits: Record<string, string> = {
  S: "spades",
  H: "hearts",
  C: "clubs",
  D: "diamonds",
};
const pips = ["zero", "one", "two", "three", "four", "five", "six"];
export const cardName = (card: string) =>
  `${ranks[card[0] ?? ""]} of ${suits[card[1] ?? ""]}`;
export const tileName = (tile: string) =>
  `${pips[Number(tile[0])]}–${pips[Number(tile[2])]} tile`;
export function sortHand(hand: string[], dominoes: boolean): string[] {
  return [...hand].sort((a, b) =>
    dominoes
      ? Number(b[2]) - Number(a[2]) || Number(b[0]) - Number(a[0])
      : "SHCD".indexOf(a[1] ?? "") - "SHCD".indexOf(b[1] ?? "") ||
        "23456789TJQKA".indexOf(b[0] ?? "") -
          "23456789TJQKA".indexOf(a[0] ?? ""),
  );
}
