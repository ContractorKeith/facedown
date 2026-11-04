import { expect, test } from "bun:test";
import { cardName, sortHand, tileName } from "../../client/src/pieces";

test("Spades sorts suits in alternating colours and ranks descending without changing the view", () => {
  const hand = ["2D", "KH", "AS", "2S", "AC", "AH", "KD", "KC"];
  const copy = [...hand];
  expect(sortHand(hand, false)).toEqual([
    "AS",
    "2S",
    "AH",
    "KH",
    "AC",
    "KC",
    "KD",
    "2D",
  ]);
  expect(hand).toEqual(copy);
});
test("Dominoes sorts by high end then low end", () => {
  expect(sortHand(["0-0", "3-6", "1-6", "6-6", "4-5"], true)).toEqual([
    "6-6",
    "3-6",
    "1-6",
    "4-5",
    "0-0",
  ]);
});
test("cards and tiles have spoken names", () => {
  expect(cardName("AS")).toBe("Ace of spades");
  expect(cardName("TH")).toBe("Ten of hearts");
  expect(tileName("3-6")).toBe("three–six tile");
  expect(tileName("0-0")).toBe("zero–zero tile");
});
