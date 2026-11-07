import { afterEach, expect, test } from "bun:test";
import type { Session } from "../../src/server/http/sessions";
import { fixture } from "./helpers";

let f: ReturnType<typeof fixture>;
afterEach(async () => {
  if (f) await f.stop();
});
const cookieOf = (response: Response) =>
  response.headers.get("set-cookie")?.split(";")[0] as string;
async function register(username = "keith") {
  const response = await f.request("/api/register", "", {
    username,
    password: "correct horse",
  });
  expect(response.status).toBe(201);
  return cookieOf(response);
}
function session(cookie: string): Session {
  const value = f.app.sessions.resolve(
    new Request("http://test", { headers: { cookie } }),
  );
  if (!value) throw new Error("Missing session");
  return value;
}
async function table(cookie: string) {
  const response = await f.request("/api/tables", cookie, { type: "spades" });
  return ((await response.json()) as { id: string }).id;
}
test("logout closes every socket immediately, stops private views, and starts the hold", async () => {
  f = fixture();
  const cookie = await register(),
    id = await table(cookie);
  const clients = await Promise.all([
    f.connect(cookie, { seat: 0 }, id),
    f.connect(cookie, { seat: 0 }, id),
  ]);
  await f.request(`/api/tables/${id}/bots`, cookie, {});
  await f.request(`/api/tables/${id}/start`, cookie, {});
  for (const client of clients)
    await client.next((m) => m.t === "view" && m.status === "live");
  const closed = clients.map(
    (c) =>
      new Promise<CloseEvent>((resolve) =>
        c.ws.addEventListener("close", resolve, { once: true }),
      ),
  );
  expect((await f.request("/api/logout", cookie, {})).status).toBe(204);
  for (const event of await Promise.all(closed)) expect(event.code).toBe(1008);
  const counts = clients.map((c) => c.messages.length);
  const t = f.app.tables.get(id);
  expect(t.seats[0]?.sockets.size).toBe(0);
  f.clock.advance(30000);
  expect(t.seats[0]?.bot).toBe(true);
  f.clock.advance(10000);
  expect(clients.map((c) => c.messages.length)).toEqual(counts);
});
test("any live session of an account reclaims its seat, including after restart", async () => {
  f = fixture();
  const old = await register(),
    id = await table(old);
  const client = await f.connect(old, { seat: 0 }, id);
  await f.request(`/api/tables/${id}/bots`, old, {});
  await f.request(`/api/tables/${id}/start`, old, {});
  await client.next((m) => m.t === "view" && m.status === "live");
  const response = await f.request("/api/login", "", {
    username: "keith",
    password: "correct horse",
  });
  const fresh = cookieOf(response);
  expect(fresh).not.toBe(old);
  await f.request("/api/logout", old, {});
  f.clock.advance(30000);
  expect(f.app.tables.get(id).seats[0]?.bot).toBe(true);
  const reclaimed = await f.connect(fresh, { seat: 0 }, id);
  expect(f.app.tables.get(id).seats[0]?.bot).toBe(false);
  reclaimed.send({ t: "join", table: id, seat: 1 });
  await reclaimed.error("forbidden");
  await f.restart();
  await f.connect(fresh, { seat: 0 }, id);
  expect(f.app.tables.get(id).seats[0]?.bot).toBe(false);
});
for (const method of ["register", "login"] as const)
  test(`${method} retires guest cookies and transfers open seats`, async () => {
    f = fixture();
    if (method === "login") await register();
    const guest = await f.guest(),
      old = session(guest),
      id = await table(guest);
    const client = await f.connect(guest, { seat: 0 }, id);
    const closed = new Promise<CloseEvent>((resolve) =>
      client.ws.addEventListener("close", resolve, { once: true }),
    );
    const response = await f.request(`/api/${method}`, guest, {
      username: "keith",
      password: "correct horse",
    });
    expect(response.status).toBe(method === "register" ? 201 : 200);
    expect((await closed).code).toBe(1008);
    expect(f.app.store.guests.find(old.id, f.clock.now())).toBe(null);
    expect(f.app.tables.list().some((t) => t.id === id)).toBe(true);
    const fresh = cookieOf(response);
    expect((await f.request("/api/me", fresh)).status).toBe(200);
  });
test("guest promotion transfers live seats while preserving casual status", async () => {
  f = fixture();
  const guest = await f.guest(),
    old = session(guest),
    id = await table(guest);
  await f.connect(guest, { seat: 0 }, id);
  await f.request(`/api/tables/${id}/bots`, guest, {});
  await f.request(`/api/tables/${id}/start`, guest, {});
  const response = await f.request("/api/register", guest, {
    username: "keith",
    password: "correct horse",
  });
  const t = f.app.tables.get(id);
  expect(t.seats[0]).toMatchObject({
    session: session(cookieOf(response)).id,
    accountId: session(cookieOf(response)).accountId,
  });
  expect(t.rated).toBe(false);
  expect(f.app.store.guests.find(old.id, f.clock.now())).toBe(null);
  const spectator = await f.connect(
    cookieOf(response),
    { spectator: true },
    id,
  );
  spectator.send({ t: "join", table: id, seat: 0 });
  await spectator.next((m) => m.t === "view" && m.you === 0);
  f.clock.advance(40000);
  expect(f.app.store.ratings.changes(id)).toEqual([]);
});

test("a second account session cannot take another open seat and may host from its own seat", async () => {
  f = fixture();
  const old = await register(),
    id = await table(old);
  const response = await f.request("/api/login", "", {
    username: "keith",
    password: "correct horse",
  });
  const fresh = cookieOf(response);
  const client = await f.connect(fresh, { spectator: true }, id);
  client.send({ t: "join", table: id, seat: 1 });
  await client.error("forbidden");
  client.send({ t: "join", table: id, seat: 0 });
  await client.next(
    (m) =>
      m.t === "view" &&
      (m.seats as { connected: boolean }[])[0]?.connected === true,
  );
  expect((await f.request(`/api/tables/${id}/bots`, fresh, {})).status).toBe(
    200,
  );
  expect((await f.request(`/api/tables/${id}/start`, fresh, {})).status).toBe(
    200,
  );
});
test("guest promotion transfers a reserved open seat even without a socket", async () => {
  f = fixture();
  const guest = await f.guest(),
    old = session(guest),
    id = await table(guest);
  const response = await f.request("/api/register", guest, {
    username: "keith",
    password: "correct horse",
  });
  expect(response.status).toBe(201);
  expect(f.app.store.guests.find(old.id, f.clock.now())).toBe(null);
  expect(f.app.tables.list().some((t) => t.id === id)).toBe(true);
  const cookies = response.headers.getSetCookie();
  expect(cookies[0]).toStartWith("fd=");
  expect(cookies[1]).toStartWith("__Host-fd=;");
  expect(cookies[1]).toContain("Max-Age=0");
});
