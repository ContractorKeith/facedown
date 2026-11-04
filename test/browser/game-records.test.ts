import { afterEach, expect, test } from "bun:test";
import { liveRecord, rememberGame } from "../../client/src/game-records";

const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
afterEach(() => {
  if (original) Object.defineProperty(globalThis, "localStorage", original);
  else Reflect.deleteProperty(globalThis, "localStorage");
});
test("the saved anchor advances to the latest checked hash, including broken continuity", () => {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });
  const commitment = "ab".repeat(32);
  rememberGame("table", { commitment, logHash: commitment, unbroken: true });
  const latest = { commitment, logHash: "cd".repeat(32), unbroken: false };
  rememberGame("table", latest);
  expect(liveRecord("table")).toEqual(latest);
  expect(storage.has("fd:game:table")).toBe(true);
});
test("disabled storage cannot break play or supply a verified anchor", () => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw new Error("Disabled");
    },
  });
  expect(() =>
    rememberGame("table", { commitment: "ab".repeat(32) }),
  ).not.toThrow();
  expect(liveRecord("table")).toBeUndefined();
});
