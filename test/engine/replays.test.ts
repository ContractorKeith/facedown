/** biome-ignore-all lint/style/noNonNullAssertion: The checked-in highcard golden supplies the required moves. */
import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fold } from "../../src/engine/core/fold";
import type { Envelope } from "../../src/engine/core/types";
import { canonical } from "./canonical";
import { highcard } from "./highcard";
import type { Move } from "./highcard/state";
import { type Replay, verifyReplay } from "./replay";

const directory = join(import.meta.dir, "../replays");
const files = readdirSync(directory).filter((file) => file.endsWith(".json"));
if (!files.length) throw new Error("No golden replays found");
const load = (file: string): Replay =>
  JSON.parse(readFileSync(join(directory, file), "utf8"));
const golden = files.find((file) => file.startsWith("highcard-"))!;
for (const file of files)
  test(`golden replay: ${file}`, () => verifyReplay(load(file), file));

test("a different legal golden move reaches the hash mismatch path", () => {
  const replay = load(golden);
  const moves = replay.moves as Envelope<Move>[];
  const prefix = fold(highcard, replay.seed, moves.slice(0, 13));
  if (!prefix.ok) throw new Error("Invalid golden prefix");
  const seat = moves[13]!.seat;
  const move = { card: "TD" };
  expect(highcard.legalMoves(prefix.state, seat)).toContainEqual(move);
  moves[13] = { seat, move };
  expect(fold(highcard, replay.seed, moves).ok).toBe(true);
  expect(() => verifyReplay(replay, golden)).toThrow(
    "Final state hash differs",
  );
});
test.each([
  [
    "moves",
    (replay: Record<string, unknown>) => {
      delete replay.moves;
    },
  ],
  [
    "moves[0].move",
    (replay: Record<string, unknown>) => {
      replay.moves = [{ seat: 1 }];
    },
  ],
  [
    "moves[0].seat",
    (replay: Record<string, unknown>) => {
      replay.moves = [{ move: { card: "AC" } }];
    },
  ],
  [
    "moves[0].timeout",
    (replay: Record<string, unknown>) => {
      replay.moves = [{ seat: 1, timeout: false }];
    },
  ],
  [
    "expectedOutcome.scores",
    (replay: Record<string, unknown>) => {
      replay.expectedOutcome = { scores: [], winner: 0 };
    },
  ],
])("malformed golden names its file and field %s", (field, corrupt) => {
  const replay = load(golden) as unknown as Record<string, unknown>;
  corrupt(replay);
  expect(() => verifyReplay(replay, "malformed.json")).toThrow(
    `malformed.json: invalid or missing field ${field}`,
  );
});
test("canonical JSON sorts keys recursively and preserves array order", () => {
  expect(canonical({ z: [{ b: 1, a: 2 }], a: "x" })).toBe(
    '{"a":"x","z":[{"a":2,"b":1}]}',
  );
});
