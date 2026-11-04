import type { Envelope, Outcome } from "../../src/engine/core/types";

export type Replay = {
  type: string;
  ruleset: unknown;
  seed: string;
  moves: Envelope<unknown>[];
  expectedOutcome: Outcome;
  expectedFinalStateHash: string;
};
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
export function validateReplay(value: unknown, file: string): Replay {
  const fail = (field: string): never => {
    throw new Error(`${file}: invalid or missing field ${field}`);
  };
  if (!object(value)) fail("replay");
  // Explicit casts below follow checks so malformed input never reaches game.apply.
  const replay = value as Record<string, unknown>;
  if (typeof replay.type !== "string" || !replay.type) fail("type");
  if (!("ruleset" in replay) || replay.ruleset === undefined) fail("ruleset");
  if (typeof replay.seed !== "string" || !/^[0-9a-f]{64}$/.test(replay.seed))
    fail("seed");
  if (!Array.isArray(replay.moves)) fail("moves");
  for (const [index, item] of (replay.moves as unknown[]).entries()) {
    const field = `moves[${index}]`;
    if (!object(item)) fail(field);
    const envelope = item as Record<string, unknown>;
    if (![0, 1, 2, 3].includes(envelope.seat as number)) fail(`${field}.seat`);
    if ("timeout" in envelope) {
      if (envelope.timeout !== true || "move" in envelope)
        fail(`${field}.timeout`);
    } else if (
      !("move" in envelope) ||
      envelope.move === undefined ||
      envelope.move === null
    )
      fail(`${field}.move`);
  }
  const outcome = replay.expectedOutcome;
  if (!object(outcome)) fail("expectedOutcome");
  const checked = outcome as Record<string, unknown>;
  if (checked.winner !== 0 && checked.winner !== 1)
    fail("expectedOutcome.winner");
  if (
    !Array.isArray(checked.scores) ||
    checked.scores.length !== 2 ||
    !checked.scores.every(
      (score) => typeof score === "number" && Number.isFinite(score),
    )
  )
    fail("expectedOutcome.scores");
  if (
    typeof replay.expectedFinalStateHash !== "string" ||
    !/^[0-9a-f]{64}$/.test(replay.expectedFinalStateHash)
  )
    fail("expectedFinalStateHash");
  return replay as Replay;
}
