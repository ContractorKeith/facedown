import { expect, test } from "bun:test";
import { seats, type Viewer } from "../../../src/engine/core/types";
import { dominoes, locate } from "../../../src/engine/dominoes";
import { checkView } from "../view-check";
import { apply, initial, setup } from "./helpers";
import { dominoesInvariants } from "./invariants";

const blocked = () =>
  setup({
    deal: 49,
    turn: 3,
    consecutivePasses: 3,
    line: [{ tile: "6-6", seat: 0, left: 6, right: 6 }],
    hands: [["0-0"], ["0-3"], ["1-4"], ["0-2"]],
  });

test("50th deal ends at the cap and higher score wins even if neither reaches 100", () => {
  for (const scores of [
    [30, 20],
    [20, 30],
  ] as [number, number][]) {
    const next = apply({ ...blocked(), scores }, { pass: true });
    expect(next.deal).toBe(49);
    expect(dominoes.toAct(next)).toBeNull();
    expect(dominoes.outcome(next)).toEqual({
      scores,
      winner: scores[0] > scores[1] ? 0 : 1,
    });
    expect(() => dominoesInvariants.checkOutcome(next)).not.toThrow();
  }
});
test("cap score tie uses last positively scoring team, else team of seat 1", () => {
  for (const lastScoringTeam of [0, 1, null] as const) {
    const state = {
      ...blocked(),
      scores: [40, 40] as [number, number],
      lastScoringTeam,
    };
    const next = apply(state, { pass: true });
    expect(dominoes.outcome(next)).toEqual({
      scores: [40, 40],
      winner: lastScoringTeam ?? 1,
    });
    expect(next.lastScoringTeam).toBe(lastScoringTeam);
  }
});
test("cap chooses overall higher score even if the other team wins the final deal", () => {
  const state = setup({
    deal: 49,
    hands: [["1-2"], ["0-3"], ["0-1"], ["0-2"]],
    scores: [20, 70],
  });
  const next = apply(state, { play: "1-2", end: "left" });
  expect(next.lastScoringTeam).toBe(0);
  expect(dominoes.outcome(next)).toEqual({ scores: [25, 70], winner: 1 });
  expect(() => dominoesInvariants.checkOutcome(next)).not.toThrow();
});
test("a final scoring deal can tie the game and becomes the cap tie-break", () => {
  const state = setup({
    deal: 49,
    hands: [["1-2"], ["0-3"], ["0-1"], ["0-2"]],
    scores: [35, 40],
    lastScoringTeam: 1,
  });
  const next = apply(state, { play: "1-2", end: "left" });
  expect(dominoes.outcome(next)).toEqual({ scores: [40, 40], winner: 0 });
});
test("a zero-point domino preserves the previous last scoring team", () => {
  const state = setup({
    hands: [["1-2"], ["0-0"], ["3-4"], []],
    lastScoringTeam: 1,
  });
  const next = apply(state, { play: "1-2", end: "left" });
  expect(next.lastScoringTeam).toBe(1);
  expect(next.lastDeal?.points).toEqual([0, 0]);
});
test("deal 49 below target continues; invalid maxDeals is rejected", () => {
  const state = { ...blocked(), deal: 48 };
  const next = apply(state, { pass: true });
  expect(next.deal).toBe(49);
  expect(dominoes.outcome(next)).toBeNull();
  expect(() =>
    dominoes.init("seed", { ...dominoes.ruleset, maxDeals: 51 } as never),
  ).toThrow();
});
test("lastDeal starts null and retains domino seat, remaining pips and points after redeal", () => {
  expect(initial().lastDeal).toBeNull();
  expect(dominoes.view(initial(), { spectator: true }).lastDeal).toBeNull();
  const state = setup({ hands: [["1-2"], ["3-4"], ["6-6"], ["5-6"]] });
  const next = apply(state, { play: "1-2", end: "left" });
  expect(next.lastDeal).toEqual({
    ending: { kind: "domino", seat: 0 },
    pips: [0, 7, 12, 11],
    points: [18, 0],
  });
  expect(next.lastScoringTeam).toBe(0);
  const viewers: Viewer[] = [
    ...seats.map((seat) => ({ seat })),
    { spectator: true },
  ];
  const before = structuredClone(next);
  for (const viewer of viewers) {
    const view = dominoes.view(next, viewer);
    expect(view.lastDeal).toEqual(next.lastDeal);
    expect(() => checkView(view, viewer, locate(next))).not.toThrow();
    if (view.lastDeal) {
      view.lastDeal.points[0] = 999;
      view.lastDeal.pips[0] = 999;
      view.lastDeal.ending.kind = "blocked";
    }
  }
  expect(next).toEqual(before);
  const turn = next.turn;
  if (turn === null) throw new Error("Unexpected finished game");
  const move = dominoes.bot(
    dominoes.view(next, { seat: turn }),
    dominoes.legalMoves(next, turn),
  );
  expect(apply(next, move).lastDeal).toEqual(next.lastDeal);
});
test("blocked summary includes remaining pips and both positive and tied point results", () => {
  const tied = apply(blocked(), { pass: true });
  expect(tied.lastDeal).toEqual({
    ending: { kind: "blocked" },
    pips: [0, 3, 5, 2],
    points: [0, 0],
  });
  const next = apply(
    setup({
      turn: 3,
      consecutivePasses: 3,
      hands: [["0-0"], ["4-4"], ["1-1"], ["5-5"]],
    }),
    { pass: true },
  );
  expect(next.lastDeal).toEqual({
    ending: { kind: "blocked" },
    pips: [0, 8, 2, 10],
    points: [18, 0],
  });
});
test("illegal probe uses a held nonmatching tile before trying a forbidden draw", () => {
  const state = setup({});
  const probe = dominoesInvariants.illegalMove(state, 0);
  expect(probe).toEqual({ play: "0-0", end: "left" });
  expect(dominoes.apply(state, { seat: 0, move: probe })).toMatchObject({
    ok: false,
  });
  const opening = setup({ line: [] });
  expect(dominoesInvariants.illegalMove(opening, 0)).toEqual({ draw: true });
  const matching = setup({ hands: [["1-2"], ["3-4"], ["0-1"], ["5-6"]] });
  expect(dominoesInvariants.illegalMove(matching, 0)).toEqual({ draw: true });
});
