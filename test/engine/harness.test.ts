import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { sha256 } from "../../src/engine/core/sha256";
import { playout } from "./harness";
import { highcardEntry } from "./highcard";
import { locate, type State } from "./highcard/state";

const seed = sha256("harness checks");
test("conservation rejects duplicate locations and persists the failing replay", () => {
  const entry = {
    ...highcardEntry,
    locate(state: State) {
      const places = new Map(locate(state));
      const first = state.hands[0][0];
      if (first) places.set(first, [{ seat: 0 }, { seat: 1 }]);
      return places;
    },
  };
  expect(() => playout(entry, seed)).toThrow(
    "conservation: duplicate or missing piece",
  );
  const replay = JSON.parse(
    readFileSync(`.tmp/playout-highcard-${seed}.json`, "utf8"),
  );
  expect(replay).toEqual({
    type: "highcard",
    ruleset: entry.ruleset,
    seed,
    moves: [],
  });
});
test("conservation rejects a piece disappearing after a move", () => {
  const entry = {
    ...highcardEntry,
    locate(state: State) {
      const places = new Map(locate(state));
      for (const play of state.trick) places.delete(play.card);
      return places;
    },
  };
  expect(() => playout(entry, seed)).toThrow("conservation: piece set changed");
});
test("legality rejects an illegal bot choice", () => {
  expect(() =>
    playout({ ...highcardEntry, bot: () => ({ card: "invalid" }) }, seed),
  ).toThrow("legality: bot chose illegal move");
});
test("termination and game-supplied scoring checks are enforced", () => {
  expect(() => playout({ ...highcardEntry, maxMoves: 0 }, seed)).toThrow(
    "termination: move bound exceeded",
  );
  expect(() =>
    playout(
      {
        ...highcardEntry,
        checkOutcome() {
          throw new Error("bad score");
        },
      },
      seed,
    ),
  ).toThrow("bad score");
});
