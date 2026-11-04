import { expect, test } from "bun:test";
import {
  SpadesRuleset,
  type State,
  spades,
  type View,
} from "../../src/engine/spades";
import { bot } from "../../src/engine/spades/bot";

function setup(
  hand: State["hands"][0],
  bids: State["bids"] = [3, 3, 3, 3],
): View {
  return {
    ...spades.view(spades.init("0".repeat(64), SpadesRuleset), { seat: 0 }),
    hand,
    bids,
    phase: "playing",
  };
}
test("bot bids side aces/kings, high spades and a long-spade bonus", () => {
  const view = setup([
    "AC",
    "KH",
    "QS",
    "KS",
    "AS",
    "2S",
    "3S",
    "2C",
    "3C",
    "4C",
    "5D",
    "6D",
    "7D",
  ]);
  const legal = Array.from({ length: 14 }, (_, bid) => ({ bid }));
  expect(bot(view, legal)).toEqual({ bid: 7 });
});
test("bot bids nil only on a very weak hand", () => {
  const view = setup([
    "2C",
    "3C",
    "4C",
    "5C",
    "6D",
    "7D",
    "8D",
    "9D",
    "2H",
    "3H",
    "4H",
    "2S",
    "3S",
  ]);
  const legal = Array.from({ length: 14 }, (_, bid) => ({ bid }));
  expect(bot(view, legal)).toEqual({ bid: 0 });
  expect(bot({ ...view, hand: [...view.hand.slice(1), "QC"] }, legal)).toEqual({
    bid: 1,
  });
});
test("bot follows low when no card wins", () => {
  const view = setup(["2C", "KC"]);
  view.trick = [{ seat: 3, card: "AC" }];
  expect(bot(view, [{ play: "KC" }, { play: "2C" }])).toEqual({ play: "2C" });
});
test("bot wins cheaply while the team still needs tricks", () => {
  const view = setup(["2C", "JC", "AC"]);
  view.trick = [{ seat: 3, card: "TC" }];
  expect(bot(view, [{ play: "AC" }, { play: "2C" }, { play: "JC" }])).toEqual({
    play: "JC",
  });
});
test.each([0, 2] as const)("bot ducks when seat %i bid nil", (seat) => {
  const view = setup(["2C", "AC"]);
  view.bids[seat] = 0;
  view.trick = [{ seat: 3, card: "TC" }];
  expect(bot(view, [{ play: "AC" }, { play: "2C" }])).toEqual({ play: "2C" });
});
test("bot does not overtake a winning partner or chase unneeded tricks", () => {
  const view = setup(["2C", "AC"]);
  view.trick = [{ seat: 2, card: "TC" }];
  const legal = [{ play: "AC" }, { play: "2C" }] as const;
  expect(bot(view, [...legal])).toEqual({ play: "2C" });
  view.trick = [{ seat: 3, card: "TC" }];
  view.tricks = [3, 0, 3, 0];
  expect(bot(view, [...legal])).toEqual({ play: "2C" });
});
test("bot leads low from its longest non-spade suit", () => {
  const view = setup(["2C", "2H", "3H", "AH", "AS"]);
  expect(
    bot(
      view,
      view.hand.map((play) => ({ play })),
    ),
  ).toEqual({ play: "2H" });
});
