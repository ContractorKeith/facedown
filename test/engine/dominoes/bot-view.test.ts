import { expect, test } from "bun:test";
import { seats, type Viewer } from "../../../src/engine/core/types";
import { dominoes, locate } from "../../../src/engine/dominoes";
import { checkView } from "../view-check";
import { apply, initial, setup } from "./helpers";

test("bot plays heaviest tile and prefers a double on equal pips", () => {
  const state = setup({
    hands: [["2-6", "4-4", "0-4"], [], [], []],
    line: [{ tile: "2-4", seat: 3, left: 2, right: 4 }],
  });
  expect(
    dominoes.bot(
      dominoes.view(state, { seat: 0 }),
      dominoes.legalMoves(state, 0),
    ),
  ).toEqual({ play: "4-4", end: "right" });
  state.hands[0].push("4-6");
  expect(
    dominoes.bot(
      dominoes.view(state, { seat: 0 }),
      dominoes.legalMoves(state, 0),
    ),
  ).toEqual({ play: "4-6", end: "right" });
});
test("bot selects the end exposing a number held in more remaining tiles", () => {
  const state = setup({ hands: [["2-3", "0-3", "1-3"], [], [], []] });
  const legal = dominoes.legalMoves(state, 0);
  expect(legal).toContainEqual({ play: "2-3", end: "left" });
  expect(legal).toContainEqual({ play: "2-3", end: "right" });
  const view = dominoes.view(state, { seat: 0 });
  expect(dominoes.bot(view, legal)).toEqual({ play: "2-3", end: "left" });
  expect(dominoes.bot(view, legal)).toEqual(dominoes.bot(view, legal));
});
test("bot draws and passes when forced; timeout is exactly its view-based move", () => {
  const state = setup({
    hands: [["0-0"], ["1-1"], ["4-4"], ["5-5"]],
    boneyard: ["0-1"],
  });
  for (const current of [state, { ...state, boneyard: [] }]) {
    const legal = dominoes.legalMoves(current, 0);
    const move = dominoes.bot(dominoes.view(current, { seat: 0 }), legal);
    expect(move).toEqual(
      current.boneyard.length ? { draw: true } : { pass: true },
    );
    expect(dominoes.apply(current, { seat: 0, timeout: true })).toEqual(
      dominoes.apply(current, { seat: 0, move }),
    );
  }
});
test("all five JSON views hide every boneyard tile; walker rejects a planted array", () => {
  const state = initial();
  const locations = locate(state);
  const viewers: Viewer[] = [
    ...seats.map((seat) => ({ seat })),
    { spectator: true },
  ];
  for (const viewer of viewers) {
    const view = dominoes.view(state, viewer);
    expect(() => checkView(view, viewer, locations)).not.toThrow();
    expect(() =>
      checkView({ ...view, boneyard: [...state.boneyard] }, viewer, locations),
    ).toThrow("no leak:");
    for (const tile of state.boneyard)
      expect(locations.get(tile)).toEqual([{ hidden: true }]);
  }
});
test("drawn tile becomes private to drawing seat; views cannot mutate state", () => {
  const state = setup({
    hands: [["0-0"], ["1-1"], ["4-4"], ["5-5"]],
    boneyard: ["0-1", "1-2"],
  });
  const next = apply(state, { draw: true });
  expect(dominoes.view(next, { seat: 0 }).hand).toContain("0-1");
  expect(dominoes.view(next, { spectator: true }).hand).toEqual([]);
  expect(dominoes.view(next, { seat: 1 }).hand).not.toContain("0-1");
  const before = structuredClone(next);
  const view = dominoes.view(next, { seat: 0 });
  view.hand.pop();
  view.scores[0] = 99;
  view.line.splice(0);
  view.tileCounts[0] = 90;
  expect(next).toEqual(before);
  expect(state.hands[0]).toEqual(["0-0"]);
});
test("fixed ruleset rejects unsupported configurations", () => {
  expect(() =>
    dominoes.init("seed", { ...dominoes.ruleset, target: 200 } as never),
  ).toThrow("Dominoes uses");
});
