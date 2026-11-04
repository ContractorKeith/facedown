import { expect, test } from "bun:test";
import type { Seat } from "../../src/engine/core/types";
import { highcard } from "./highcard";
import { deck, type State } from "./highcard/state";

function state(): State {
  return highcard.init("highcard rules", highcard.ruleset);
}
function play(current: State, seat: Seat, card: string): State {
  const result = highcard.apply(current, { seat, move: { card } });
  if (!result.ok) throw new Error(result.error.message);
  return result.state;
}
test("deal gives each seat three unique cards and starts left of the dealer", () => {
  const current = state();
  expect(current.hands.map((hand) => hand.length)).toEqual([3, 3, 3, 3]);
  expect(current.hands.flat().sort()).toEqual([...deck].sort());
  expect(highcard.toAct(current)).toBe(1);
  expect(highcard.legalMoves(current, 0)).toEqual([]);
});
test("follow suit is mandatory, and the highest led-suit card wins", () => {
  const initial: State = {
    ...state(),
    hands: [
      ["AC", "9D", "JD"],
      ["9C", "TD", "QD"],
      ["TC", "KD", "AD"],
      ["JC", "QC", "KC"],
    ],
  };
  let current = play(initial, 1, "9C");
  expect(highcard.legalMoves(current, 2)).toEqual([{ card: "TC" }]);
  expect(
    highcard.apply(current, { seat: 2, move: { card: "AD" } }),
  ).toMatchObject({ ok: false, error: { code: "illegal_move" } });
  current = play(current, 2, "TC");
  current = play(current, 3, "KC");
  current = play(current, 0, "AC");
  expect(current.turn).toBe(0);
  expect(current.tricks).toEqual([1, 0]);
  expect(current.trick).toEqual([]);
  expect(initial.hands[1]).toContain("9C");
});
test("a higher off-suit card cannot win a trick", () => {
  const initial: State = {
    ...state(),
    turn: 0,
    hands: [["9C"], ["AD"], ["TC"], ["JD"]],
  };
  let current = play(initial, 0, "9C");
  current = play(current, 1, "AD");
  current = play(current, 2, "TC");
  current = play(current, 3, "JD");
  expect(current.turn).toBe(2);
  expect(current.tricks).toEqual([1, 0]);
});
test("two tricks score a deal, rotate the dealer, and two deals finish", () => {
  const initial: State = {
    ...state(),
    turn: 0,
    hands: [["AC"], ["9C"], ["TC"], ["JC"]],
    tricks: [1, 0],
  };
  const finish = (current: State) =>
    play(play(play(play(current, 0, "AC"), 1, "9C"), 2, "TC"), 3, "JC");
  const next = finish(initial);
  expect(next.scores).toEqual([1, 0]);
  expect(next.deal).toBe(1);
  expect(next.dealer).toBe(1);
  expect(next.turn).toBe(2);
  expect(next.hands.map((hand) => hand.length)).toEqual([3, 3, 3, 3]);
  const final = finish({ ...initial, deal: 1, dealer: 1, scores: [1, 0] });
  expect(highcard.toAct(final)).toBeNull();
  expect(highcard.outcome(final)).toEqual({ scores: [2, 0], winner: 0 });
  expect(highcard.apply(final, { seat: 0, timeout: true })).toMatchObject({
    ok: false,
    error: { code: "game_over" },
  });
});
test("timeout equals a view-based bot move and views cannot mutate state", () => {
  const current = state();
  const snapshot = structuredClone(current);
  const view = highcard.view(current, { seat: 1 });
  const move = highcard.bot(view, highcard.legalMoves(current, 1));
  expect(highcard.apply(current, { seat: 1, timeout: true })).toEqual(
    highcard.apply(current, { seat: 1, move }),
  );
  view.hand.pop();
  view.scores[0] = 99;
  expect(current).toEqual(snapshot);
  expect(highcard.view(current, { spectator: true }).hand).toEqual([]);
});
