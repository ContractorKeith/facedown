import { expect, test } from "bun:test";
import { fixture } from "./helpers";

test("reserved lookalikes and invalid registrations do not consume the five-result budget", async () => {
  const f = fixture();
  try {
    for (const username of [
      "b0t",
      "bot_",
      "_bot",
      "__b0ts__",
      "empty_seat",
      "you",
      "null",
      "undefined",
    ])
      expect(
        (
          await f.request("/api/register", "", {
            username,
            password: "correct horse",
          })
        ).status,
      ).toBe(400);
    for (let i = 0; i < 6; i++)
      expect(
        (
          await f.request("/api/register", "", {
            username: "valid_user",
            password: "short",
          })
        ).status,
      ).toBe(400);
    expect(
      (
        await f.request("/api/register", "", {
          username: "valid_user",
          password: "correct horse",
        })
      ).status,
    ).toBe(201);
    for (let i = 0; i < 4; i++)
      expect(
        (
          await f.request("/api/register", "", {
            username: "valid_user",
            password: "correct horse",
          })
        ).status,
      ).toBe(409);
    expect(
      (
        await f.request("/api/register", "", {
          username: "another_user",
          password: "correct horse",
        })
      ).status,
    ).toBe(429);
  } finally {
    await f.stop();
  }
});

test("invalid table bodies do not spend the creation budget", async () => {
  const f = fixture();
  try {
    const cookie = await f.guest();
    for (let i = 0; i < 12; i++)
      expect(
        (await f.request("/api/tables", cookie, { type: "invalid" })).status,
      ).toBe(400);
    expect(
      (await f.request("/api/tables", cookie, { type: "spades" })).status,
    ).toBe(201);
  } finally {
    await f.stop();
  }
});
