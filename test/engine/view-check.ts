import { deepStrictEqual, ok } from "node:assert";
import type { Viewer } from "../../src/engine/core/types";
import type { Place } from "./invariants";

function tokens(value: unknown): string[] {
  if (typeof value === "string") return value.split(/[^A-Za-z0-9-]+/);
  if (typeof value === "number") return [String(value)];
  if (Array.isArray(value)) return value.flatMap(tokens);
  if (value && typeof value === "object")
    return Object.entries(value).flatMap(([key, item]) => [
      ...tokens(key),
      ...tokens(item),
    ]);
  return [];
}
export function checkView(
  view: unknown,
  viewer: Viewer,
  locations: ReadonlyMap<string, readonly Place[]>,
): void {
  deepStrictEqual(
    JSON.parse(JSON.stringify(view)),
    view,
    "view must be plain JSON",
  );
  for (const id of tokens(view)) {
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
