import { expect, test } from "bun:test";
import { sha256 } from "../../src/engine/core/sha256";
import { seats } from "../../src/engine/core/types";
import { registeredGames } from "./games";
import { playout, REFOLD_INTERVAL } from "./harness";
import { highcard, highcardEntry } from "./highcard";
import type { GameEntry } from "./invariants";

test("a registered game must have a test-only invariants entry", () => {
  const registered = new Map([
    ["spades" as const, { ...highcard, type: "spades" as const }],
  ]);
  expect(() => registeredGames(registered, new Map())).toThrow(
    "Missing invariants for registered game: spades",
  );
  const entries = registeredGames(
    registered,
    new Map([["spades", highcardEntry]]),
  );
  expect(entries[0]?.pieces).toEqual(highcardEntry.pieces);
});
test("600 moves refold at fixed intervals and once at game end", () => {
  let initializations = 0;
  const entry: GameEntry<number, number, string[], null, "long"> = {
    type: "long",
    ruleset: null,
    maxMoves: 600,
    pieces: seats.map((seat) => `piece-${seat}`),
    init() {
      initializations++;
      return 0;
    },
    toAct: (state) => (state === 600 ? null : 0),
    legalMoves: () => [1],
    bot: () => 1,
    apply: (state, envelope) =>
      "timeout" in envelope || envelope.move === 1
        ? { ok: true, state: state + 1 }
        : { ok: false, error: { code: "illegal_move", message: "invalid" } },
    view: (_state, viewer) =>
      "seat" in viewer ? [`piece-${viewer.seat}`] : [],
    outcome: (state) => (state === 600 ? { scores: [1, 0], winner: 0 } : null),
    locate: () => new Map(seats.map((seat) => [`piece-${seat}`, [{ seat }]])),
    illegalMove: () => 0,
    checkOutcome() {},
  };
  expect(playout(entry, sha256("long game")).moves).toHaveLength(600);
  // One live init, the empty-log check, interval checks, and the final check.
  expect(initializations).toBe(2 + Math.floor(600 / REFOLD_INTERVAL) + 1);
});
