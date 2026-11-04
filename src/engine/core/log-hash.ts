import { isPlainObject } from "./envelope";
import { sha256 } from "./sha256";
import type { Envelope } from "./types";

// Sort object keys recursively; array order and JSON scalar values remain significant.
export function canonicalJSON(value: unknown): string {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  )
    return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${Array.from(value, canonicalJSON).join(",")}]`;
  if (isPlainObject(value))
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJSON(value[key])}`)
      .join(",")}}`;
  throw new Error("Value is not JSON");
}
export const hashMove = (
  previous: string,
  envelope: Envelope<unknown>,
): string => sha256(`${previous}:${canonicalJSON(envelope)}`);
export const moveLogHash = (
  commitment: string,
  moves: readonly Envelope<unknown>[],
): string => moves.reduce(hashMove, commitment);
