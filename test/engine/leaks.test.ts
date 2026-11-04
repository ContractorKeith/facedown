import { expect, test } from "bun:test";
import { sha256 } from "../../src/engine/core/sha256";
import { seats } from "../../src/engine/core/types";
import { playout } from "./harness";
import type { GameEntry } from "./invariants";

const numeric: GameEntry<null, never, unknown, null, "numeric"> = {
  type: "numeric",
  ruleset: null,
  pieces: ["7", "8", "9", "10"],
  maxMoves: 1,
  init: () => null,
  toAct: () => null,
  legalMoves: () => [],
  apply: () => ({ ok: false, error: { code: "game_over", message: "over" } }),
  bot() {
    throw new Error("not used");
  },
  view: (_state, viewer) => ("seat" in viewer ? [String(viewer.seat + 7)] : []),
  outcome: () => ({ scores: [1, 0], winner: 0 }),
  locate: () => new Map(seats.map((seat) => [String(seat + 7), [{ seat }]])),
  illegalMove() {
    throw new Error("not used");
  },
  checkOutcome() {},
};
test.each([
  ["embedded string", { leak: "hand:7" }],
  ["embedded key", { "hand:7": true }],
  ["number", { leak: 7 }],
  ["Map", new Map([["hand", 7]])],
  ["Set", new Set([7])],
  ["undefined", { leak: undefined }],
  ["function", { leak: () => 7 }],
])("a planted %s leak fails with the seed", (label, view) => {
  const seed = sha256(`leak: ${label}`);
  expect(() => playout({ ...numeric, view: () => view }, seed)).toThrow(
    new RegExp(
      `seed=${seed} moves=0.*${["embedded string", "embedded key", "number"].includes(label) ? "no leak" : "view must be plain JSON"}`,
    ),
  );
});
test("JSON views allow numbers that are visible to the viewer", () => {
  expect(() =>
    playout(
      {
        ...numeric,
        view: (_state, viewer) => ("seat" in viewer ? [viewer.seat + 7] : []),
      },
      sha256("own numbers"),
    ),
  ).not.toThrow();
});
test("an all-public locate fails initial seat ownership checks", () => {
  const seed = sha256("all public");
  const entry = {
    ...numeric,
    locate: () =>
      new Map(numeric.pieces.map((id) => [id, [{ public: true as const }]])),
  };
  expect(() => playout(entry, seed)).toThrow(
    new RegExp(`seed=${seed} moves=0.*locate: seat 0`),
  );
});
test("the declared piece set is checked at initialization", () => {
  expect(() =>
    playout(
      { ...numeric, pieces: [...numeric.pieces, "11"] },
      sha256("missing piece"),
    ),
  ).toThrow("conservation: piece set changed");
});
