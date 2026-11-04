import { canonicalJSON, moveLogHash } from "../../src/engine/core/log-hash";
import { sha256 } from "../../src/engine/core/sha256";
import type { Seat } from "../../src/engine/core/types";
import { registry } from "../../src/engine/registry";
import type { ViewMessage } from "./api";
import type { LiveRecord } from "./game-records";
import { parseReplay } from "./records";

export type { ReplayRecord } from "./records";

export type Frame = {
  view: NonNullable<ViewMessage["view"]>;
  hands: string[][];
  toAct: Seat | null;
};
// Fold every move before exposing any frames: an invalid log is never a valid replay.
export function verifyReplay(value: unknown, local?: LiveRecord) {
  const record = parseReplay(value);
  const failures: string[] = [];
  if (sha256(record.seed) !== record.commitment)
    failures.push("Seed commitment check failed");
  const game = registry.get(record.type);
  if (!game) throw new Error("Unsupported game type");
  if (canonicalJSON(record.ruleset) !== canonicalJSON(game.ruleset))
    failures.push("Ruleset check failed");
  const logHash = moveLogHash(record.commitment, record.moves);
  if (logHash !== record.logHash) failures.push("Move log hash check failed");
  if (local && local.commitment !== record.commitment)
    failures.push("Saved commitment check failed");
  const observedHash =
    local?.seq === undefined
      ? record.logHash
      : moveLogHash(record.commitment, record.moves.slice(0, local.seq));
  if (
    local?.logHash &&
    (local.logHash !== observedHash || (local.seq ?? 0) > record.moves.length)
  )
    failures.push("Saved move log hash check failed");
  if (local?.tampered) failures.push("Live move log changed unexpectedly");
  let state = game.init(record.seed, game.ruleset);
  const frames: Frame[] = [];
  const capture = () =>
    frames.push({
      view: game.view(state, { spectator: true }) as Frame["view"],
      hands: ([0, 1, 2, 3] as Seat[]).map(
        (seat) => (game.view(state, { seat }) as Frame["view"]).hand,
      ),
      toAct: game.toAct(state),
    });
  capture();
  for (const [index, envelope] of record.moves.entries()) {
    const result = game.apply(state, envelope);
    if (!result.ok)
      return {
        failures: [
          ...failures,
          `Move ${index + 1} failed to fold: ${result.error.message}`,
        ],
        frames: [],
      };
    state = result.state;
    capture();
  }
  const outcome = game.outcome(state);
  if (
    !outcome ||
    outcome.winner !== record.outcome.winner ||
    outcome.scores.some((score, i) => score !== record.outcome.scores[i])
  )
    failures.push("Stored outcome check failed");
  return {
    failures,
    frames,
    verified:
      local?.unbroken === true &&
      !!local?.logHash &&
      (local.seq === undefined || local.seq === record.moves.length) &&
      failures.length === 0,
  };
}
