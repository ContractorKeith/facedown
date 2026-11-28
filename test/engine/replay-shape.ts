import type {
  Envelope,
  Outcome,
  Seat,
  Team,
} from "../../src/engine/core/types";

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
const isSeat = (value: unknown): value is Seat =>
  value === 0 || value === 1 || value === 2 || value === 3;
const isTeam = (value: unknown): value is Team => value === 0 || value === 1;
const isHash = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{64}$/.test(value);

function fail(file: string, field: string): never {
  throw new Error(`${file}: invalid or missing field ${field}`);
}

function envelopeOf(
  item: unknown,
  field: string,
  file: string,
): Envelope<unknown> {
  if (!object(item)) fail(file, field);
  const seat = item.seat;
  if (!isSeat(seat)) fail(file, `${field}.seat`);
  if ("timeout" in item) {
    if (item.timeout !== true || "move" in item) fail(file, `${field}.timeout`);
    return { seat, timeout: true };
  }
  if (item.move === undefined || item.move === null)
    fail(file, `${field}.move`);
  return { seat, move: item.move };
}

function outcomeOf(value: unknown, file: string): Outcome {
  if (!object(value)) fail(file, "expectedOutcome");
  const { winner, scores } = value;
  if (!isTeam(winner)) fail(file, "expectedOutcome.winner");
  if (!Array.isArray(scores) || scores.length !== 2)
    fail(file, "expectedOutcome.scores");
  const [us, them]: unknown[] = scores;
  if (
    typeof us !== "number" ||
    typeof them !== "number" ||
    !Number.isFinite(us) ||
    !Number.isFinite(them)
  )
    fail(file, "expectedOutcome.scores");
  return { scores: [us, them], winner };
}

export function validateReplay(value: unknown, file: string): Replay {
  if (!object(value)) fail(file, "replay");
  const { type, ruleset, seed, moves, expectedFinalStateHash } = value;
  if (typeof type !== "string" || !type) fail(file, "type");
  if (ruleset === undefined) fail(file, "ruleset");
  if (!isHash(seed)) fail(file, "seed");
  if (!Array.isArray(moves)) fail(file, "moves");
  const envelopes = moves.map((item: unknown, index) =>
    envelopeOf(item, `moves[${index}]`, file),
  );
  const expectedOutcome = outcomeOf(value.expectedOutcome, file);
  if (!isHash(expectedFinalStateHash)) fail(file, "expectedFinalStateHash");
  return {
    type,
    ruleset,
    seed,
    moves: envelopes,
    expectedOutcome,
    expectedFinalStateHash,
  };
}
