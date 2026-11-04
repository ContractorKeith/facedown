import { expect, test } from "bun:test";
import { SpadesRuleset, type State, spades } from "../../src/engine/spades";
import { deck } from "../../src/engine/spades/cards";
import { scoreDeal } from "../../src/engine/spades/scoring";

function scoring(bids: State["bids"], tricks: State["tricks"]): State {
  return { ...spades.init("0".repeat(64), SpadesRuleset), bids, tricks };
}
test("made team contract scores ten per bid plus overtricks", () => {
  const result = scoreDeal(scoring([3, 3, 2, 2], [4, 3, 3, 3]));
  expect(result).toEqual({ scores: [52, 51], bags: [2, 1] });
});
test("set team loses ten times its contract", () => {
  expect(scoreDeal(scoring([4, 3, 4, 2], [3, 3, 3, 4]))).toEqual({
    scores: [-80, 52],
    bags: [0, 2],
  });
});
test("nil made adds 100 independently of the partner contract", () => {
  expect(scoreDeal(scoring([0, 3, 4, 3], [0, 4, 5, 4]))).toEqual({
    scores: [141, 62],
    bags: [1, 2],
  });
});
test("nil set loses 100 and its tricks count as bags", () => {
  expect(scoreDeal(scoring([0, 3, 4, 3], [2, 3, 5, 3]))).toEqual({
    scores: [-57, 60],
    bags: [3, 0],
  });
});
test("nil tricks do not rescue a set partner contract", () => {
  expect(scoreDeal(scoring([0, 3, 4, 3], [2, 4, 3, 4]))).toEqual({
    scores: [-138, 62],
    bags: [2, 2],
  });
});
test("both nils are scored independently and all their tricks are bags", () => {
  expect(scoreDeal(scoring([0, 5, 0, 5], [0, 5, 1, 7]))).toEqual({
    scores: [1, 102],
    bags: [1, 2],
  });
});
test("bags accumulate across deals without premature penalty", () => {
  const state = scoring([3, 3, 2, 2], [4, 3, 3, 3]);
  state.bags = [7, 8];
  state.scores = [100, 200];
  expect(scoreDeal(state)).toEqual({ scores: [152, 251], bags: [9, 9] });
});
test("every ten bags deducts 100 and ten bags, retaining excess", () => {
  const state = scoring([3, 3, 2, 2], [4, 3, 3, 3]);
  state.bags = [9, 9];
  state.scores = [100, 200];
  expect(scoreDeal(state)).toEqual({ scores: [52, 151], bags: [1, 0] });
});
test("multiple bag penalties can apply on the same deal", () => {
  const state = scoring([0, 1, 0, 1], [6, 0, 7, 0]);
  state.bags = [9, 0];
  expect(scoreDeal(state)).toEqual({ scores: [-387, -20], bags: [2, 0] });
});
// A legal final play closes the constructed deal and exercises score-to-next-deal transitions.
function finish(scores: State["scores"], bids: State["bids"] = [3, 3, 2, 2]) {
  const state = scoring(bids, [3, 3, 3, 3]);
  Object.assign(state, {
    phase: "playing",
    turn: 3,
    scores,
    hands: [[], [], [], ["AS"]],
    played: deck.filter((card) => !["2C", "3C", "4C", "AS"].includes(card)),
    trick: [
      { seat: 0, card: "2C" },
      { seat: 1, card: "3C" },
      { seat: 2, card: "4C" },
    ],
  });
  const result = spades.apply(state, { seat: 3, move: { play: "AS" } });
  if (!result.ok) throw new Error(result.error.message);
  return result.state;
}
test("reaching exactly 500 ends the game only after the deal", () => {
  const next = finish([449, 0]);
  expect(spades.outcome(next)).toEqual({ scores: [500, 52], winner: 0 });
  expect(next.turn).toBeNull();
  const live = scoring([3, 3, 2, 2], [0, 0, 0, 0]);
  live.scores = [500, 0];
  expect(spades.outcome(live)).toBeNull();
});
test("both teams at or above 500: higher score wins", () => {
  expect(spades.outcome(finish([460, 470]))).toEqual({
    scores: [511, 522],
    winner: 1,
  });
  expect(spades.outcome(finish([490, 470]))).toEqual({
    scores: [541, 522],
    winner: 0,
  });
});
test("equal scores at 500 play another deal, rotating dealer and first bidder", () => {
  const next = finish([449, 448]);
  expect(next.scores).toEqual([500, 500]);
  expect(spades.outcome(next)).toBeNull();
  expect(next.deal).toBe(1);
  expect(next.dealer).toBe(1);
  expect(next.turn).toBe(2);
  let state = next;
  for (let i = 0; i < 4; i++) {
    const result = spades.apply(state, {
      seat: state.turn ?? 0,
      move: { bid: 1 },
    });
    if (!result.ok) throw new Error(result.error.message);
    state = result.state;
  }
  expect(state.turn).toBe(2);
  expect(state.phase).toBe("playing");
});
