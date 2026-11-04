import { expect, test } from "bun:test";
import { fixture } from "./helpers";

test("registration budgets use the last trusted hop and count invalid attempts", async () => {
  const old = process.env.FACEDOWN_TRUST_PROXY;
  process.env.FACEDOWN_TRUST_PROXY = "1";
  const f = fixture();
  const register = (forwarded: string) => {
    const origin = `http://127.0.0.1:${f.app.server.port}`;
    return fetch(`${origin}/api/register`, {
      method: "POST",
      headers: {
        origin,
        "x-forwarded-for": forwarded,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        username: "invalid-name",
        password: "long enough",
      }),
    });
  };
  try {
    for (let i = 0; i < 5; i++)
      expect((await register(`spoof-${i}, real-a`)).status).toBe(400);
    expect((await register("new-spoof, real-a")).status).toBe(429);
    expect((await register("new-spoof, real-b")).status).toBe(400);
  } finally {
    if (old === undefined) delete process.env.FACEDOWN_TRUST_PROXY;
    else process.env.FACEDOWN_TRUST_PROXY = old;
    await f.stop();
  }
});

for (const username of [
  "bot",
  "BOTS",
  "spectator",
  "system",
  "admin",
  "guest",
  "guestperson",
  "guest-person",
])
  test(`registration reserves ${username}`, async () => {
    const f = fixture();
    try {
      const response = await f.request("/api/register", "", {
        username,
        password: "long enough",
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ code: "reserved" });
    } finally {
      await f.stop();
    }
  });
