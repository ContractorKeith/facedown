import { afterEach, expect, test } from "bun:test";
import { seedRating } from "../../src/server/store/testing";
import { fixture } from "./helpers";

let f: ReturnType<typeof fixture>;
afterEach(async () => {
  if (f) await f.stop();
});

test("accounts validate, case-fold, authenticate, expire, revoke and enforce origins", async () => {
  f = fixture();
  for (const body of [
    { username: "ab", password: "long enough" },
    { username: "valid", password: "short" },
    { username: "bad-name", password: "long enough" },
    { username: "valid", password: "x".repeat(201) },
  ])
    expect((await f.request("/api/register", "", body)).status).toBe(400);
  expect(
    (
      await f.request(
        "/api/register",
        "",
        { username: "Keith_1", password: "correct horse" },
        "https://evil.test",
      )
    ).status,
  ).toBe(403);
  const registered = await f.request("/api/register", "", {
    username: "Keith_1",
    password: "correct horse",
  });
  expect(registered.status).toBe(201);
  expect(await registered.json()).toEqual({
    username: "keith_1",
    name: "keith_1",
    guest: false,
  });
  const cookie = registered.headers.get("set-cookie")?.split(";")[0] as string;
  expect(registered.headers.get("set-cookie")).toContain("Max-Age=604800");
  expect(
    (
      await f.request("/api/register", "", {
        username: "KEITH_1",
        password: "different password",
      })
    ).status,
  ).toBe(409);
  expect((await f.request("/api/me", cookie)).status).toBe(200);
  const created = (await (
    await f.request("/api/tables", cookie, { type: "spades" })
  ).json()) as { id: string };
  const client = await f.connect(cookie, { seat: 0 }, created.id);
  const closed = new Promise<CloseEvent>((resolve) =>
    client.ws.addEventListener("close", resolve, { once: true }),
  );
  expect((await f.request("/api/logout", cookie, {})).status).toBe(204);
  client.send({ t: "join", table: created.id, seat: 0 });
  expect((await closed).code).toBe(1008);
  expect((await f.request("/api/me", cookie)).status).toBe(401);
  const login = await f.request("/api/login", "", {
    username: "KEITH_1",
    password: "correct horse",
  });
  expect(login.status).toBe(200);
  const fresh = login.headers.get("set-cookie")?.split(";")[0] as string;
  await f.restart();
  expect((await f.request("/api/me", fresh)).status).toBe(200);
  f.clock.advance(7 * 86400000);
  expect((await f.request("/api/me", fresh)).status).toBe(401);
});
test("five failed logins throttle the socket IP despite spoofed forwarding headers", async () => {
  f = fixture();
  for (let i = 0; i < 5; i++)
    expect(
      (
        await f.request("/api/login", "", {
          username: "missing",
          password: "incorrect password",
        })
      ).status,
    ).toBe(401);
  expect(
    (
      await f.request("/api/login", "", {
        username: "missing",
        password: "incorrect password",
      })
    ).status,
  ).toBe(429);
  const response = await fetch(
    `http://127.0.0.1:${f.app.server.port}/api/login`,
    {
      method: "POST",
      headers: {
        origin: `http://127.0.0.1:${f.app.server.port}`,
        "content-type": "application/json",
        "x-forwarded-for": "other-ip",
      },
      body: JSON.stringify({
        username: "missing",
        password: "incorrect password",
      }),
    },
  );
  expect(response.status).toBe(429);
});

test("public leaderboard and profile expose ratings without account secrets", async () => {
  f = fixture();
  await f.request("/api/register", "", {
    username: "rated_player",
    password: "correct horse",
  });
  const account = f.app.store.accounts.find("rated_player");
  if (!account) throw new Error("Missing account");
  seedRating(f.db, account.id, 1700, 80, 25);
  const board = await (await f.request("/api/leaderboard/spades")).json();
  expect(board).toEqual([
    { username: "rated_player", rating: 1700, rd: 80, games: 25 },
  ]);
  const profile = await (await f.request("/api/players/RATED_PLAYER")).json();
  expect(profile).toMatchObject({
    username: "rated_player",
    ratings: [
      { type: "spades", rating: 1700, rd: 80, games: 25 },
      { type: "dominoes", rating: 1500, rd: 350, games: 0 },
    ],
    games: [],
  });
  expect(JSON.stringify(profile)).not.toContain(account.password_hash);
  expect(JSON.stringify(profile)).not.toContain(account.id);
});
test("an account table with bots at start becomes casual and never rates", async () => {
  f = fixture();
  const response = await f.request("/api/register", "", {
    username: "host_account",
    password: "correct horse",
  });
  const cookie = response.headers.get("set-cookie")?.split(";")[0] as string;
  const { id } = (await (
    await f.request("/api/tables", cookie, { type: "spades" })
  ).json()) as { id: string };
  await f.request(`/api/tables/${id}/bots`, cookie, {});
  await f.request(`/api/tables/${id}/start`, cookie, {});
  expect(f.app.tables.get(id).rated).toBe(false);
  f.clock.advance(40000);
  expect(f.app.store.gameStatus(id)).toBe("finished");
  expect(f.app.store.ratings.changes(id)).toEqual([]);
  const account = f.app.store.accounts.find("host_account");
  expect(f.app.store.ratings.pool(account?.id as string, "spades").games).toBe(
    0,
  );
});
