import { expect, test } from "bun:test";
import { AuthLimits } from "../../src/server/http/auth-limits";

test("concurrent verifications reserve both budgets and successful logins only reset their user", () => {
  const limits = new AuthLimits();
  const attempts = Array.from({ length: 5 }, () =>
    limits.login("ip", "victim", 0),
  );
  expect(() => limits.login("ip", "victim", 0)).toThrow("rate_limited");
  for (const finish of attempts) finish(false);
  limits.login("ip", "attacker", 0)(true);
  expect(() => limits.login("ip", "victim", 0)).toThrow("rate_limited");
  for (let i = 0; i < 15; i++) limits.login("ip", `other_${i}`, 0)(false);
  expect(() => limits.login("ip", "attacker", 0)).toThrow("rate_limited");
  expect(() => limits.login("different_ip", "victim", 0)).not.toThrow();
  expect(() => limits.login("ip", "victim", 900000)).not.toThrow();
});
test("success clears only that user's failure budget while preserving IP failures", () => {
  const limits = new AuthLimits();
  for (let i = 0; i < 4; i++) limits.login("ip", "victim", 0)(false);
  limits.login("ip", "victim", 0)(true);
  for (let i = 0; i < 4; i++) limits.login("ip", "victim", 0)(false);
  expect(() => limits.login("ip", "victim", 0)).not.toThrow();
});

test("a successful empty budget does not shorten the next failure window", () => {
  const limits = new AuthLimits();
  limits.login("ip", "victim", 0)(true);
  for (let i = 0; i < 5; i++) limits.login("ip", "victim", 899999)(false);
  expect(() => limits.login("ip", "victim", 900000)).toThrow("rate_limited");
});
