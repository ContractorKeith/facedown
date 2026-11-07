import { expect, test } from "bun:test";
import { dockerAvailable, requireDocker } from "../container/guard";

test("explicit container opt-in fails when Docker is unavailable", () => {
  expect(() => requireDocker(true, () => false)).toThrow(
    "Docker daemon access required",
  );
});

test("opt-in with Docker available and no opt-in both pass", () => {
  expect(() => requireDocker(true, () => true)).not.toThrow();
  expect(() => requireDocker(false, () => false)).not.toThrow();
});

test("the real probe reports a missing executable as unavailable, fast", () => {
  const path = process.env.PATH;
  process.env.PATH = "";
  const started = performance.now();
  try {
    expect(dockerAvailable()).toBe(false);
  } finally {
    process.env.PATH = path;
  }
  expect(performance.now() - started).toBeLessThan(2000);
});
