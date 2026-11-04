import { expect, test } from "bun:test";
import { initial, rateTeams, update } from "../../src/engine/rating";

test("Glickman's published worked example", () => {
  const result = update({ rating: 1500, rd: 200, volatility: 0.06 }, [
    { rating: 1400, rd: 30, score: 1 },
    { rating: 1550, rd: 100, score: 0 },
    { rating: 1700, rd: 300, score: 0 },
  ]);
  // The paper rounds intermediate values; the unrounded result is 1464.05067.
  expect(Math.abs(result.rating - 1464.06)).toBeLessThan(0.02);
  expect(result.rd).toBeCloseTo(151.52, 2);
  expect(Math.abs(result.volatility - 0.05999)).toBeLessThan(0.00001);
  expect(result.rating).toBeCloseTo(1464.05067, 5);
  expect(result.volatility).toBeCloseTo(0.0599959843, 10);
});
test("teams average opposing rating and RD from the same starting snapshot", () => {
  const players = [
    initial,
    { ...initial, rating: 1300, rd: 50 },
    initial,
    { ...initial, rating: 1900, rd: 250 },
  ];
  const results = rateTeams(players, 0, [false, false, false, false]);
  expect(results[0]).toEqual(
    update(initial, [{ rating: 1600, rd: 150, score: 1 }]),
  );
  expect(results[2]).toEqual(results[0]);
  expect(results[1]).toEqual(
    update(players[1] as typeof initial, [{ rating: 1500, rd: 350, score: 0 }]),
  );
});
test("leaver on winning team scores zero; no inactivity decay", () => {
  const results = rateTeams([initial, initial, initial, initial], 0, [
    true,
    false,
    false,
    false,
  ]);
  expect(results[0]?.rating).toBeLessThan(1500);
  expect(results[2]?.rating).toBeGreaterThan(1500);
  expect(update(initial, [])).toEqual(initial);
});
