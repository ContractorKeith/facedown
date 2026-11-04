import { expect, test } from "bun:test";
import { sha256 } from "../../src/engine/core/sha256";
import type { Team } from "../../src/engine/core/types";
import { type State, spades } from "../../src/engine/spades";
import { deck } from "../../src/engine/spades/cards";
import { playout } from "./harness";
import { spadesInvariants } from "./spades-invariants";

function finalPlay(
  scores: State["scores"],
  deal = 0,
  lastScoringTeam: Team | null = null,
  overrides: Partial<State> = {},
) {
  const state = spades.init("0".repeat(64), spades.ruleset);
  Object.assign(state, {
    phase: "playing",
    deal,
    turn: 3,
    scores,
    lastScoringTeam,
    bids: [3, 3, 3, 4],
    tricks: [3, 3, 3, 3],
    hands: [[], [], [], ["AS"]],
    played: deck.filter((card) => !["2C", "3C", "4C", "AS"].includes(card)),
    trick: [
      { seat: 0, card: "2C" },
      { seat: 1, card: "3C" },
      { seat: 2, card: "4C" },
    ],
  });
  Object.assign(state, overrides);
  const result = spades.apply(state, { seat: 3, move: { play: "AS" } });
  if (!result.ok) throw new Error(result.error.message);
  return result.state;
}
test("a team ending a deal at -200 loses by mercy", () => {
  const state = finalPlay([-260, -50]);
  expect(spades.outcome(state)).toEqual({ scores: [-200, 20], winner: 1 });
});
test("when both teams reach mercy the higher score wins", () => {
  expect(spades.outcome(finalPlay([-300, -300]))).toEqual({
    scores: [-240, -230],
    winner: 1,
  });
});
test("deal 50 ends below target with the higher score winning", () => {
  const state = finalPlay([0, 0], 49);
  expect(state.deal).toBe(49);
  expect(spades.outcome(state)).toEqual({ scores: [60, 70], winner: 1 });
});
test("a deal-50 score tie goes to the last scoring deal winner", () => {
  // Team 1 wins this deal 70–60, bringing the total to 70–70.
  expect(spades.outcome(finalPlay([10, 0], 49))).toEqual({
    scores: [70, 70],
    winner: 1,
  });
});
test("an equal-points last deal retains the previous scoring winner, else seat 1's team", () => {
  const tied = finalPlay([80, 80], 49, 0, { bids: [4, 4, 4, 4] });
  expect(tied.lastDeal?.points).toEqual([-80, -80]);
  expect(spades.outcome(tied)?.winner).toBe(0);
  expect(
    spades.outcome(finalPlay([80, 80], 49, null, { bids: [4, 4, 4, 4] }))
      ?.winner,
  ).toBe(1);
});
test("lastDeal survives redealing, includes only public scoring data, and is detached", () => {
  expect(
    spades.view(spades.init("0".repeat(64), spades.ruleset), {
      spectator: true,
    }).lastDeal,
  ).toBeNull();
  const state = finalPlay([0, 0]);
  expect(state.deal).toBe(1);
  expect(state.lastDeal).toEqual({
    bids: [3, 3, 3, 4],
    tricks: [3, 3, 3, 4],
    points: [60, 70],
    bags: [0, 0],
  });
  const view = spades.view(state, { spectator: true });
  expect(view.lastDeal).toEqual(state.lastDeal);
  if (!view.lastDeal) throw new Error("Missing summary");
  view.lastDeal.bids[0] = 13;
  view.lastDeal.tricks[0] = 99;
  view.lastDeal.points[0] = 999;
  view.lastDeal.bags[0] = 9;
  expect(state.lastDeal?.points).toEqual([60, 70]);
  expect(state.lastDeal?.bids).toEqual([3, 3, 3, 4]);
  expect(state.lastDeal?.tricks).toEqual([3, 3, 3, 4]);
  expect(state.lastDeal?.bags).toEqual([0, 0]);
});
test("deliberate overbidding terminates independently of normal bot bidding", () => {
  const overbidding = {
    ...spades,
    ...spadesInvariants,
    bot(
      view: Parameters<typeof spades.bot>[0],
      legal: Parameters<typeof spades.bot>[1],
    ) {
      return (
        legal.find((move) => "bid" in move && move.bid === 13) ??
        spades.bot(view, legal)
      );
    },
    apply(state: State, envelope: Parameters<typeof spades.apply>[1]) {
      // Resolve timeouts through this test bot as well, without changing production policy.
      if ("timeout" in envelope)
        return spades.apply(state, {
          seat: envelope.seat,
          move: this.bot(
            spades.view(state, { seat: envelope.seat }),
            spades.legalMoves(state, envelope.seat),
          ),
        });
      return spades.apply(state, envelope);
    },
  };
  const { state, moves } = playout(overbidding, sha256("overbid"));
  expect(moves).toHaveLength(50 * 56);
  expect(state.deal).toBe(49);
  expect(spades.outcome(state)).not.toBeNull();
  expect(Math.min(...state.scores)).toBeLessThanOrEqual(-200);
});

test("lastDeal reports net points and earned bags before penalties", () => {
  const state = finalPlay([0, 0], 0, null, {
    bids: [3, 3, 2, 2],
    bags: [9, 9],
  });
  expect(state.lastDeal?.points).toEqual([-49, -48]);
  expect(state.lastDeal?.bags).toEqual([1, 2]);
  expect(state.bags).toEqual([0, 1]);
});

test("equal mercy scores continue until the deal cap resolves the tie", () => {
  const live = finalPlay([-300, -310]);
  expect(live.scores).toEqual([-240, -240]);
  expect(live.turn).not.toBeNull();
  expect(spades.outcome(live)).toBeNull();
  expect(spades.outcome(finalPlay([-300, -310], 49))?.winner).toBe(1);
});
