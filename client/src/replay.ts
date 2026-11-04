import { sha256 } from "../../src/engine/core/sha256";
import type { Envelope, Outcome, Seat } from "../../src/engine/core/types";
import { registry } from "../../src/engine/registry";
import type { GameType, ViewMessage } from "./api";

export type ReplayRecord = {
  type: GameType;
  ruleset: unknown;
  seed: string;
  commitment: string;
  moves: Envelope<unknown>[];
  outcome: Outcome;
  rated: boolean;
  seats: { seat: Seat; name: string }[];
  rating_changes: { username: string; before: number; after: number }[];
};
export type Frame = {
  view: ViewMessage["view"];
  hands: string[][];
  toAct: Seat | null;
};
// Fold every move before exposing any frames: an invalid log is never a valid replay.
export function verifyReplay(record: ReplayRecord) {
  const failures: string[] = [];
  if (sha256(record.seed) !== record.commitment)
    failures.push("Seed commitment check failed");
  const game = registry.get(record.type);
  if (!game) throw new Error("Unsupported game type");
  let state = game.init(record.seed, record.ruleset);
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
  return { failures, frames };
}
