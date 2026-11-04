/** biome-ignore-all lint/style/noNonNullAssertion: The checked-in highcard golden supplies the required moves. */
import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { canonical } from "./canonical";
import { type Replay, verifyReplay } from "./replay";

const directory = join(import.meta.dir, "../replays");
const files = readdirSync(directory).filter((file) => file.endsWith(".json"));
if (!files.length) throw new Error("No golden replays found");
for (const file of files) {
  test(`golden replay: ${file}`, () => {
    const replay: Replay = JSON.parse(
      readFileSync(join(directory, file), "utf8"),
    );
    verifyReplay(replay);
  });
}
test("changing one golden move fails verification", () => {
  const file = files.find((file) => file.startsWith("highcard-"))!;
  const replay: Replay = JSON.parse(
    readFileSync(join(directory, file), "utf8"),
  );
  replay.moves[0] = { seat: replay.moves[0]!.seat, move: { card: "invalid" } };
  expect(() => verifyReplay(replay)).toThrow("Replay contains rejected move");
});
test("canonical JSON sorts keys recursively and preserves array order", () => {
  expect(canonical({ z: [{ b: 1, a: 2 }], a: "x" })).toBe(
    '{"a":"x","z":[{"a":2,"b":1}]}',
  );
});
