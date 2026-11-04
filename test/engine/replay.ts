import { deepStrictEqual, ok } from "node:assert";
import { fold } from "../../src/engine/core/fold";
import { sha256 } from "../../src/engine/core/sha256";
import { canonical } from "./canonical";
import { games } from "./games";
import type { GameEntry } from "./invariants";
import { validateReplay } from "./replay-shape";

export type { Replay } from "./replay-shape";

export function replayEntry(
  type: string,
): GameEntry<unknown, unknown, unknown, unknown, string> {
  const entry = games.find((entry) => entry.type === type);
  if (!entry) throw new Error(`Unknown game: ${type}`);
  return entry;
}
export function verifyReplay(input: unknown, file = "<replay>"): void {
  const replay = validateReplay(input, file);
  try {
    const entry = replayEntry(replay.type);
    deepStrictEqual(replay.ruleset, entry.ruleset, "ruleset differs");
    const result = fold(entry, replay.seed, replay.moves);
    if (!result.ok)
      throw new Error(`moves[${result.index}].move: ${result.error.message}`);
    deepStrictEqual(
      entry.outcome(result.state),
      replay.expectedOutcome,
      "Outcome differs",
    );
    ok(entry.outcome(result.state), "Replay must be finished");
    entry.checkOutcome(result.state);
    deepStrictEqual(
      sha256(canonical(result.state)),
      replay.expectedFinalStateHash,
      "Final state hash differs",
    );
  } catch (cause) {
    throw new Error(`${file}: ${String(cause)}`, { cause });
  }
}
