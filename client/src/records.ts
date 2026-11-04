import { isPlainObject } from "../../src/engine/core/envelope";
import type { Envelope, Outcome, Seat } from "../../src/engine/core/types";
import type { GameType } from "./api";

export type ReplayRecord = {
  type: GameType;
  ruleset: unknown;
  seed: string;
  commitment: string;
  logHash: string;
  moves: Envelope<unknown>[];
  outcome: Outcome;
  rated: boolean;
  seats: { seat: Seat; name: string }[];
  rating_changes: { username: string; before: number; after: number }[];
};
export type Profile = {
  username: string;
  ratings: { type: GameType; rating: number; rd: number; games: number }[];
  games: { id: string; type: GameType; rated: boolean; outcome: Outcome }[];
};
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const type = (value: unknown) => value === "spades" || value === "dominoes";
const hash = (value: unknown) =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
export function validOutcome(value: unknown): value is Outcome {
  return (
    isPlainObject(value) &&
    Array.isArray(value.scores) &&
    value.scores.length === 2 &&
    value.scores.every(finite) &&
    (value.winner === 0 || value.winner === 1)
  );
}
export function parseReplay(value: unknown): ReplayRecord {
  if (
    !isPlainObject(value) ||
    !type(value.type) ||
    !isPlainObject(value.ruleset) ||
    !hash(value.seed) ||
    !hash(value.commitment) ||
    !hash(value.logHash) ||
    !Array.isArray(value.moves) ||
    !validOutcome(value.outcome) ||
    typeof value.rated !== "boolean" ||
    !Array.isArray(value.seats) ||
    !value.seats.every(
      (s) =>
        isPlainObject(s) &&
        [0, 1, 2, 3].includes(s.seat as number) &&
        typeof s.name === "string",
    ) ||
    !Array.isArray(value.rating_changes) ||
    !value.rating_changes.every(
      (c) =>
        isPlainObject(c) &&
        typeof c.username === "string" &&
        finite(c.before) &&
        finite(c.after),
    )
  )
    throw new Error("Malformed replay record");
  return value as ReplayRecord;
}
export function parseProfile(value: unknown): Profile {
  if (
    !isPlainObject(value) ||
    typeof value.username !== "string" ||
    !Array.isArray(value.ratings) ||
    !value.ratings.every(
      (r) =>
        isPlainObject(r) &&
        type(r.type) &&
        finite(r.rating) &&
        finite(r.rd) &&
        finite(r.games),
    ) ||
    !Array.isArray(value.games) ||
    !value.games.every(
      (g) =>
        isPlainObject(g) &&
        typeof g.id === "string" &&
        type(g.type) &&
        typeof g.rated === "boolean" &&
        validOutcome(g.outcome),
    )
  )
    throw new Error("Malformed player profile");
  return value as Profile;
}
