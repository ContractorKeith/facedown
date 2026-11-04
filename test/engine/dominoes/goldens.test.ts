import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Envelope } from "../../../src/engine/core/types";
import { dominoes, type Move } from "../../../src/engine/dominoes";
import { pips } from "../../../src/engine/dominoes/state";

type Events = {
  dominoes: number;
  blocks: number;
  ties: number;
  maxDraws: number;
};
function inspect(suffix: string): Events {
  const seed = suffix.padStart(64, "0");
  const replay = JSON.parse(
    readFileSync(
      join(import.meta.dir, `../../replays/dominoes-${seed}.json`),
      "utf8",
    ),
  );
  let state = dominoes.init(seed, dominoes.ruleset);
  const events: Events = { dominoes: 0, blocks: 0, ties: 0, maxDraws: 0 };
  let draws = 0;
  for (const envelope of replay.moves as Envelope<Move>[]) {
    const move =
      "move" in envelope
        ? envelope.move
        : dominoes.bot(
            dominoes.view(state, { seat: envelope.seat }),
            dominoes.legalMoves(state, envelope.seat),
          );
    draws = "draw" in move ? draws + 1 : 0;
    events.maxDraws = Math.max(events.maxDraws, draws);
    const result = dominoes.apply(state, envelope);
    if (!result.ok) throw new Error(result.error.message);
    const next = result.state;
    if (next.deal !== state.deal || next.turn === null) {
      const totals = [0, 0];
      state.hands.forEach((hand, seat) => {
        totals[seat % 2] =
          (totals[seat % 2] ?? 0) +
          hand
            .filter(
              (tile) =>
                !(
                  "play" in move &&
                  seat === envelope.seat &&
                  tile === move.play
                ),
            )
            .reduce((sum, tile) => sum + pips(tile), 0);
      });
      let winner: number | null;
      if ("pass" in move) {
        expect(state.consecutivePasses).toBe(3);
        events.blocks++;
        if (totals[0] === totals[1]) events.ties++;
        winner =
          totals[0] === totals[1]
            ? null
            : (totals[0] ?? 0) < (totals[1] ?? 0)
              ? 0
              : 1;
      } else {
        expect("play" in move).toBe(true);
        expect(state.hands[envelope.seat].length).toBe(1);
        events.dominoes++;
        winner = envelope.seat % 2;
      }
      const expected: [number, number] = [...state.scores];
      if (winner !== null)
        expected[winner] = (expected[winner] ?? 0) + (totals[1 - winner] ?? 0);
      expect(next.scores).toEqual(expected);
    }
    state = next;
  }
  expect(dominoes.outcome(state)).toEqual(replay.expectedOutcome);
  expect(Math.max(...state.scores)).toBeGreaterThanOrEqual(100);
  return events;
}

test("recorded seed 1 pins a domino win", () =>
  expect(inspect("1").dominoes).toBeGreaterThan(0));
test("recorded seed 4 pins a blocked deal", () =>
  expect(inspect("4").blocks).toBeGreaterThan(0));
test("recorded seed 13 pins a blocked tie awarding no points", () =>
  expect(inspect("d").ties).toBeGreaterThan(0));
test("recorded seed 3 pins drawing several tiles in a turn", () =>
  expect(inspect("3").maxDraws).toBeGreaterThanOrEqual(3));
test("recorded seed 2 pins a complete game reaching 100", () => {
  inspect("2");
});
