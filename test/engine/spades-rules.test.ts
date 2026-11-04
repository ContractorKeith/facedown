import { expect, test } from "bun:test";
import { dealRng, shuffle } from "../../src/engine/core/random";
import { nextSeat, type Seat } from "../../src/engine/core/types";
import {
  type Move,
  SpadesRuleset,
  type State,
  spades,
} from "../../src/engine/spades";
import { deck, trickWinner } from "../../src/engine/spades/cards";

const seed = `${"0".repeat(63)}1`;
const initial = () => spades.init(seed, SpadesRuleset);
function step(state: State, move: Move): State {
  if (state.turn === null) throw new Error("Finished");
  const result = spades.apply(state, { seat: state.turn, move });
  if (!result.ok) throw new Error(result.error.message);
  return result.state;
}
function playing(hand: State["hands"][0]): State {
  return {
    ...initial(),
    phase: "playing",
    bids: [1, 1, 1, 1],
    turn: 0,
    hands: [hand, [], [], []],
  };
}
test("fixed ruleset and 52 unique cards dealt with dealRng", () => {
  const state = initial();
  expect(state.hands.flat()).toEqual(shuffle(deck, dealRng(seed, 0)));
  expect(state.hands.map((hand) => hand.length)).toEqual([13, 13, 13, 13]);
  expect(SpadesRuleset).toEqual({
    target: 500,
    nil: true,
    blindNil: false,
    bagLimit: 10,
    bagPenalty: 100,
  });
  expect(() =>
    spades.init(seed, { ...SpadesRuleset, target: 100 } as never),
  ).toThrow();
});
test("bidding starts left of dealer and accepts each integer 0 through 13", () => {
  const state = initial();
  expect(state.turn).toBe(nextSeat(state.dealer));
  expect(spades.legalMoves(state, 1)).toEqual(
    Array.from({ length: 14 }, (_, bid) => ({ bid })),
  );
  for (const bid of [-1, 14, 1.5, NaN])
    expect(spades.apply(state, { seat: 1, move: { bid } }).ok).toBe(false);
  let next = state;
  for (const bid of [0, 13, 2, 3]) next = step(next, { bid });
  expect(next.bids).toEqual([3, 0, 13, 2]);
  expect(next.phase).toBe("playing");
  expect(next.turn).toBe(1);
});
test("must follow suit when able", () => {
  const state = playing(["2C", "AS", "3H"]);
  state.trick = [{ seat: 3, card: "AC" }];
  expect(spades.legalMoves(state, 0)).toEqual([{ play: "2C" }]);
  expect(spades.apply(state, { seat: 0, move: { play: "AS" } }).ok).toBe(false);
});
test("a void seat can discard or trump", () => {
  const state = playing(["AS", "3H"]);
  state.trick = [{ seat: 3, card: "AC" }];
  expect(spades.legalMoves(state, 0)).toEqual([{ play: "AS" }, { play: "3H" }]);
});
test("unbroken spades cannot be led with a side suit held", () => {
  expect(spades.legalMoves(playing(["AS", "3H"]), 0)).toEqual([{ play: "3H" }]);
});
test("only spades may be led before spades are broken", () => {
  expect(spades.legalMoves(playing(["AS", "2S"]), 0)).toEqual([
    { play: "AS" },
    { play: "2S" },
  ]);
});
test("playing any spade breaks spades and permits later spade leads", () => {
  const state = playing(["AS", "3H"]);
  state.trick = [{ seat: 3, card: "AC" }];
  const next = step(state, { play: "AS" });
  expect(next.spadesBroken).toBe(true);
  expect(
    spades.legalMoves(
      { ...next, turn: 0, trick: [], hands: [["AS", "3H"], [], [], []] },
      0,
    ),
  ).toContainEqual({ play: "AS" });
});
test("highest led card wins absent trump; off-suit high cards cannot win", () => {
  expect(
    trickWinner([
      { seat: 0, card: "3C" },
      { seat: 1, card: "AH" },
      { seat: 2, card: "KC" },
      { seat: 3, card: "QC" },
    ]).seat,
  ).toBe(2);
});
test("highest trump wins and the trick winner leads", () => {
  const state = playing(["3S"]);
  state.trick = [
    { seat: 1, card: "AC" },
    { seat: 2, card: "2S" },
    { seat: 3, card: "AH" },
  ];
  const next = step(state, { play: "3S" });
  expect(next.turn).toBe(0);
  expect(next.tricks).toEqual([1, 0, 0, 0]);
  expect(next.trick).toEqual([]);
  expect(next.played).toEqual(["AC", "2S", "AH", "3S"]);
});
test("timeouts resolve from the seat view and legal moves without mutating input", () => {
  let state = initial();
  for (let n = 0; n < 56; n++) {
    const before = structuredClone(state);
    const seat = state.turn as Seat;
    const move = spades.bot(
      spades.view(state, { seat }),
      spades.legalMoves(state, seat),
    );
    const result = spades.apply(state, { seat, timeout: true });
    expect(result).toEqual(spades.apply(state, { seat, move }));
    expect(state).toEqual(before);
    if (!result.ok) throw new Error(result.error.message);
    state = result.state;
  }
  expect(state.deal).toBe(1);
  expect(state.dealer).toBe(1);
  expect(state.turn).toBe(2);
  expect(state.hands.flat()).toEqual(shuffle(deck, dealRng(seed, 1)));
});
test("views expose only own hand and detached public information, never seed", () => {
  const state = initial();
  const seatView = spades.view(state, { seat: 0 });
  expect(seatView.hand).toEqual(state.hands[0]);
  expect(spades.view(state, { spectator: true }).hand).toEqual([]);
  expect(JSON.stringify(seatView)).not.toContain(seed);
  seatView.hand.pop();
  seatView.scores[0] = 99;
  seatView.bids[0] = 13;
  expect(state.hands[0].length).toBe(13);
  expect(state.scores).toEqual([0, 0]);
  expect(state.bids[0]).toBeNull();
});
test("wrong seat, wrong phase, malformed moves and finished games are rejected", () => {
  const state = initial();
  const before = structuredClone(state);
  expect(spades.apply(state, { seat: 0, move: { bid: 1 } })).toMatchObject({
    ok: false,
    error: { code: "not_your_turn" },
  });
  for (const move of [
    null,
    {},
    { play: "AC" },
    { bid: 1, play: "AC" },
    { bid: "1" },
  ])
    expect(spades.apply(state, { seat: 1, move } as never).ok).toBe(false);
  expect(state).toEqual(before);
  expect(spades.legalMoves({ ...state, turn: null }, 0)).toEqual([]);
  expect(
    spades.apply({ ...state, turn: null }, { seat: 0, timeout: true }),
  ).toMatchObject({ ok: false, error: { code: "game_over" } });
  expect(spades.outcome(state)).toBeNull();
});
