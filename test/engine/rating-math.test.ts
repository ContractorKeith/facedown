import { expect, test } from "bun:test";
import { exp, log, sqrt } from "../../src/engine/rating/math";

test("arithmetic rating math agrees with native math across rating scales", () => {
  for (const value of [
    Number.MIN_VALUE,
    1e-100,
    1e-12,
    0.0036,
    0.06,
    0.5,
    1,
    2,
    100,
    1e12,
    1e100,
    Number.MAX_VALUE,
  ]) {
    expect(Math.abs(log(value) - Math.log(value))).toBeLessThan(2e-13);
    expect(sqrt(value)).toBeCloseTo(Math.sqrt(value), 12);
  }
  for (const value of [-100, -10, -6, -0.01, 0, 0.01, 1, 6, 10, 100])
    expect(Math.abs(exp(value) / Math.exp(value) - 1)).toBeLessThan(1e-14);
  for (const value of [0, -1, Infinity, NaN])
    expect(() => log(value)).toThrow();
});
