import type { MoveError } from "./types";

export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

// Validate the shared wire shape before a game reads any envelope fields.
export function checkEnvelope(value: unknown): MoveError | null {
  const invalid: MoveError = {
    code: "illegal_move",
    message: "Invalid move envelope",
  };
  if (!isPlainObject(value)) return invalid;
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== 2 ||
    !Object.hasOwn(value, "seat") ||
    ![0, 1, 2, 3].includes(value.seat as number)
  )
    return invalid;
  if (Object.hasOwn(value, "timeout"))
    return value.timeout === true ? null : invalid;
  return Object.hasOwn(value, "move") &&
    value.move !== undefined &&
    value.move !== null
    ? null
    : invalid;
}
