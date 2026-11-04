import { deepStrictEqual, ok } from "node:assert";
import type { Viewer } from "../../src/engine/core/types";
import type { Place } from "./invariants";

const separator = /[^A-Za-z0-9-]/;
function tokens(value: unknown, result: string[]): void {
  if (typeof value === "string") {
    if (separator.test(value)) result.push(...value.split(/[^A-Za-z0-9-]+/));
    else result.push(value);
  } else if (typeof value === "number") result.push(String(value));
  else if (Array.isArray(value)) {
    for (const item of value) tokens(item, result);
  } else if (value && typeof value === "object") {
    for (const key in value) {
      if (!Object.hasOwn(value, key)) continue;
      tokens(key, result);
      tokens((value as Record<string, unknown>)[key], result);
    }
  }
}
export function checkView(
  view: unknown,
  viewer: Viewer,
  locations: ReadonlyMap<string, readonly Place[]>,
  plainJson = true,
): void {
  if (plainJson)
    deepStrictEqual(
      JSON.parse(JSON.stringify(view)),
      view,
      "view must be plain JSON",
    );
  const ids: string[] = [];
  tokens(view, ids);
  for (const id of ids) {
    const places = locations.get(id);
    if (!places) continue;
    ok(
      places.some(
        (place) =>
          "public" in place ||
          ("seat" in place && "seat" in viewer && place.seat === viewer.seat),
      ),
      `no leak: ${id}`,
    );
  }
}
