import { deepStrictEqual, ok } from "node:assert";
import { fold } from "../../src/engine/core/fold";
import { sha256 } from "../../src/engine/core/sha256";
import type { Envelope, Outcome } from "../../src/engine/core/types";
import type { GameEntry } from "../../src/engine/registry";
import { canonical } from "./canonical";
import { games } from "./games";

export type Replay = {
  type: string;
  ruleset: unknown;
  seed: string;
  moves: Envelope<unknown>[];
  expectedOutcome: Outcome;
  expectedFinalStateHash: string;
};
export function replayEntry(
  type: string,
): GameEntry<unknown, unknown, unknown, unknown, string> {
  const entry = games.find((entry) => entry.type === type);
  if (!entry) throw new Error(`Unknown game: ${type}`);
  return entry;
}
export function verifyReplay(replay: Replay): void {
  const entry = replayEntry(replay.type);
  deepStrictEqual(replay.ruleset, entry.ruleset, "Ruleset differs");
  const result = fold(entry, replay.seed, replay.moves);
  ok(result.ok, "Replay contains rejected move");
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
}
