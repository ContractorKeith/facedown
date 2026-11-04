import { expect, test } from "bun:test";
import { dealRng, shuffle } from "../../../src/engine/core/random";
import { dominoes } from "../../../src/engine/dominoes";
import { firstTile, tiles } from "../../../src/engine/dominoes/state";
import { apply, initial, setup } from "./helpers";

test("double-six deals five per seat and keeps shuffled remainder in order", () => {
  const state = initial();
  const order = shuffle(tiles, dealRng(state.seed, 0));
  expect(state.hands.map((hand) => hand.length)).toEqual([5, 5, 5, 5]);
  expect(state.hands.flat()).toEqual(order.slice(0, 20));
  expect(state.boneyard).toEqual(order.slice(20));
  expect(new Set([...state.hands.flat(), ...state.boneyard]).size).toBe(28);
});
test("first deal holder must lead highest dealt double", () => {
  const state = setup({
    deal: 0,
    line: [],
    turn: 2,
    hands: [["5-6"], ["4-4"], ["6-6", "1-1"], ["0-0"]],
  });
  expect(dominoes.legalMoves(state, 2)).toEqual([{ play: "6-6", end: "left" }]);
  expect(dominoes.legalMoves(state, 1)).toEqual([]);
  const real = initial();
  expect(real.hands[real.leader]).toContain(firstTile(real.hands));
});
test("without a dealt double first lead uses highest pip total, then higher end", () => {
  expect(firstTile([["1-6"], ["2-5"], ["3-4"], ["0-6"]])).toBe("1-6");
  const state = setup({
    deal: 0,
    line: [],
    turn: 1,
    hands: [["1-6"], ["5-6", "0-1"], ["3-4"], ["2-5"]],
  });
  expect(dominoes.legalMoves(state, 1)).toEqual([{ play: "5-6", end: "left" }]);
});
test("opening requires left and leaves both tile ends open", () => {
  const state = setup({ line: [] });
  expect(
    dominoes.apply(state, { seat: 0, move: { play: "1-2", end: "right" } }).ok,
  ).toBe(false);
  const next = apply(state, { play: "1-2", end: "left" });
  expect(dominoes.view(next, { spectator: true }).openEnds).toEqual([1, 2]);
  expect(next.line).toEqual([{ tile: "1-2", seat: 0, left: 1, right: 2 }]);
});
test("later deals rotate left of previous leader and permit any opening tile", () => {
  const state = setup({
    leader: 2,
    hands: [["1-2"], ["3-4"], ["0-1"], ["5-6"]],
  });
  const next = apply(state, { play: "1-2", end: "left" });
  expect(next.deal).toBe(2);
  expect(next.leader).toBe(3);
  expect(next.turn).toBe(3);
  expect(dominoes.legalMoves(next, 3)).toEqual(
    next.hands[3].map((play) => ({ play, end: "left" })),
  );
  expect(next.boneyard).toEqual(
    shuffle(tiles, dealRng(state.seed, 2)).slice(20),
  );
});
test("play must match an open end, orienting the line on either side", () => {
  const state = setup({
    hands: [["1-2", "3-5", "0-0"], ["4-5"], ["1-6"], ["0-6"]],
  });
  expect(dominoes.legalMoves(state, 0)).toEqual([
    { play: "1-2", end: "left" },
    { play: "3-5", end: "right" },
  ]);
  expect(apply(state, { play: "3-5", end: "right" }).line.at(-1)).toMatchObject(
    { left: 3, right: 5 },
  );
  const reversed = setup({
    line: [{ tile: "2-3", seat: 3, left: 3, right: 2 }],
  });
  expect(
    apply(reversed, { play: "1-2", end: "right" }).line.at(-1),
  ).toMatchObject({ left: 2, right: 1 });
});
test("draw repeatedly from next boneyard tile until playable without advancing seat", () => {
  let state = setup({
    hands: [["0-0"], ["1-1"], ["4-4"], ["5-5"]],
    boneyard: ["0-1", "4-6", "1-2"],
  });
  for (const tile of ["0-1", "4-6", "1-2"] as const) {
    expect(dominoes.legalMoves(state, 0)).toEqual([{ draw: true }]);
    state = apply(state, { draw: true });
    expect(state.hands[0].at(-1)).toBe(tile);
    expect(state.turn).toBe(0);
  }
  expect(dominoes.legalMoves(state, 0)).toEqual([{ play: "1-2", end: "left" }]);
});
test("draw is forbidden when playable; pass is forbidden until boneyard empty", () => {
  const playable = setup({ boneyard: ["6-6"] });
  expect(dominoes.apply(playable, { seat: 0, move: { draw: true } }).ok).toBe(
    false,
  );
  const stuck = setup({
    hands: [["0-0"], ["1-1"], ["4-4"], ["5-5"]],
    boneyard: ["0-1"],
  });
  expect(dominoes.apply(stuck, { seat: 0, move: { pass: true } }).ok).toBe(
    false,
  );
  const empty = apply(stuck, { draw: true });
  expect(dominoes.legalMoves(empty, 0)).toEqual([{ pass: true }]);
  expect(dominoes.apply(empty, { seat: 0, move: { draw: true } }).ok).toBe(
    false,
  );
});
test("domino scores only opponents' unrounded pips including partner exclusion", () => {
  const state = setup({ hands: [["1-2"], ["3-4"], ["6-6"], ["5-6"]] });
  expect(apply(state, { play: "1-2", end: "left" }).scores).toEqual([18, 0]);
});
test("four consecutive passes block; lower team total scores opponents' pips", () => {
  let state = setup({ hands: [["0-0"], ["4-4"], ["1-1"], ["5-5"]] });
  for (let i = 1; i <= 3; i++) {
    state = apply(state, { pass: true });
    expect(state.consecutivePasses).toBe(i);
    expect(state.deal).toBe(1);
  }
  state = apply(state, { pass: true });
  expect(state.scores).toEqual([18, 0]);
  expect(state.deal).toBe(2);
});
test("equal blocked team totals score nothing", () => {
  let state = setup({
    line: [{ tile: "6-6", seat: 3, left: 6, right: 6 }],
    hands: [["0-0"], ["0-3"], ["1-4"], ["0-2"]],
    scores: [30, 40],
  });
  for (let i = 0; i < 4; i++) state = apply(state, { pass: true });
  expect(state.scores).toEqual([30, 40]);
  expect(state.turn).not.toBeNull();
});
test("a play resets consecutive passes", () => {
  const next = apply(setup({ consecutivePasses: 3 }), {
    play: "1-2",
    end: "left",
  });
  expect(next.consecutivePasses).toBe(0);
});
test("100 ends game immediately; a deal awards only one team", () => {
  const state = setup({
    hands: [["1-2"], ["3-4"], ["6-6"], ["5-6"]],
    scores: [82, 99],
  });
  const next = apply(state, { play: "1-2", end: "left" });
  expect(next.deal).toBe(1);
  expect(dominoes.toAct(next)).toBeNull();
  expect(dominoes.outcome(next)).toEqual({ scores: [100, 99], winner: 0 });
  expect(dominoes.legalMoves(next, 0)).toEqual([]);
  expect(dominoes.apply(next, { seat: 0, timeout: true })).toMatchObject({
    ok: false,
    error: { code: "game_over" },
  });
});
test("out of turn and malformed moves reject without changing input", () => {
  const state = initial();
  const snapshot = structuredClone(state);
  expect(
    dominoes.apply(state, {
      seat: ((state.leader + 1) % 4) as 0,
      timeout: true,
    }),
  ).toMatchObject({ ok: false, error: { code: "not_your_turn" } });
  expect(
    dominoes.apply(state, {
      seat: state.leader,
      move: { draw: false } as never,
    }).ok,
  ).toBe(false);
  expect(state).toEqual(snapshot);
});

test("team one can win by domino and score only the opposing seats", () => {
  const state = setup({
    turn: 1,
    hands: [["6-6"], ["3-4"], ["5-6"], ["0-0"]],
    scores: [99, 77],
  });
  const next = apply(state, { play: "3-4", end: "right" });
  expect(dominoes.outcome(next)).toEqual({ scores: [99, 100], winner: 1 });
});
test("blocked team one win reaches target without another deal", () => {
  const state = setup({
    consecutivePasses: 3,
    turn: 3,
    hands: [["4-4"], ["0-0"], ["5-5"], ["1-1"]],
    scores: [90, 85],
  });
  const next = apply(state, { pass: true });
  expect(next.deal).toBe(state.deal);
  expect(next.consecutivePasses).toBe(4);
  expect(dominoes.outcome(next)).toEqual({ scores: [90, 103], winner: 1 });
});
