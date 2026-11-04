import { afterEach, expect, spyOn, test } from "bun:test";
import { fixture } from "./helpers";

let f: ReturnType<typeof fixture>;
afterEach(async () => {
  if (f) await f.stop();
});
const credentials = (username: string, password = "correct horse") => ({
  username,
  password,
});
test("four bad guesses plus attacker login cannot reset the victim budget", async () => {
  f = fixture();
  await f.request("/api/register", "", credentials("victim"));
  await f.request("/api/register", "", credentials("attacker"));
  for (let i = 0; i < 4; i++)
    expect(
      (
        await f.request(
          "/api/login",
          "",
          credentials("victim", "wrong password"),
        )
      ).status,
    ).toBe(401);
  expect(
    (await f.request("/api/login", "", credentials("attacker"))).status,
  ).toBe(200);
  expect(
    (await f.request("/api/login", "", credentials("victim", "wrong password")))
      .status,
  ).toBe(401);
  for (let i = 0; i < 4; i++) {
    expect(
      (await f.request("/api/login", "", credentials("attacker"))).status,
    ).toBe(200);
    expect(
      (
        await f.request(
          "/api/login",
          "",
          credentials("victim", "wrong password"),
        )
      ).status,
    ).toBe(429);
  }
  f.clock.advance(900000);
  expect(
    (await f.request("/api/login", "", credentials("victim"))).status,
  ).toBe(200);
});
test("twenty failures across usernames exhaust IP budget; success cannot clear it", async () => {
  f = fixture();
  await f.request("/api/register", "", credentials("attacker"));
  for (let i = 0; i < 20; i++) {
    expect(
      (await f.request("/api/login", "", credentials(`missing_${i}`))).status,
    ).toBe(401);
    if (i === 9)
      expect(
        (await f.request("/api/login", "", credentials("attacker"))).status,
      ).toBe(200);
  }
  expect(
    (await f.request("/api/login", "", credentials("attacker"))).status,
  ).toBe(429);
  f.clock.advance(900000);
  expect(
    (await f.request("/api/login", "", credentials("attacker"))).status,
  ).toBe(200);
});
test("registration allows five per IP per hour, including concurrent requests", async () => {
  f = fixture();
  const responses = await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      f.request("/api/register", "", credentials(`new_${i}`)),
    ),
  );
  expect(responses.filter((r) => r.status === 201)).toHaveLength(5);
  expect(responses.filter((r) => r.status === 429)).toHaveLength(3);
  f.clock.advance(3600000);
  expect(
    (await f.request("/api/register", "", credentials("after_hour"))).status,
  ).toBe(201);
});
test("unknown users verify a fixed Argon2id hash with the pinned account cost", async () => {
  f = fixture();
  await f.request("/api/register", "", credentials("existing"));
  const hash = f.app.store.accounts.find("existing")?.password_hash as string;
  expect(hash).toStartWith("$argon2id$v=19$m=19456,t=2,");
  const verify = spyOn(Bun.password, "verify");
  try {
    expect(
      (await f.request("/api/login", "", credentials("unknown_a"))).status,
    ).toBe(401);
    expect(
      (await f.request("/api/login", "", credentials("unknown_b"))).status,
    ).toBe(401);
    expect(verify).toHaveBeenCalledTimes(2);
    const dummy = verify.mock.calls[0]?.[1] as string;
    expect(dummy).toStartWith("$argon2id$v=19$m=19456,t=2,");
    expect(dummy).not.toBe(hash);
    expect(verify.mock.calls[1]?.[1]).toBe(dummy);
  } finally {
    verify.mockRestore();
  }
});
