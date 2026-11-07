import { expect, test } from "bun:test";
import { fixture } from "./helpers";

const Socket = WebSocket as unknown as new (
  url: string,
  options: Bun.WebSocketOptions,
) => WebSocket;

test("guest creation allows 30 attempts per IP per hour", async () => {
  const f = fixture();
  try {
    for (let i = 0; i < 30; i++)
      expect((await f.request("/api/guest", "", {})).status).toBe(200);
    expect((await f.request("/api/guest", "", {})).status).toBe(429);
    f.clock.advance(3600000);
    expect((await f.request("/api/guest", "", {})).status).toBe(200);
  } finally {
    await f.stop();
  }
});

test("ninth session socket closes 1008 and freeing a socket restores capacity", async () => {
  const f = fixture();
  const extra: WebSocket[] = [];
  try {
    const cookie = await f.guest();
    const { id } = await (
      await f.request("/api/tables", cookie, { type: "spades" })
    ).json();
    const clients = [];
    for (let i = 0; i < 8; i++)
      clients.push(await f.connect(cookie, { seat: 0 }, id));
    const origin = `http://127.0.0.1:${f.app.server.port}`;
    const ws = new Socket(`${origin.replace("http:", "ws:")}/ws`, {
      headers: { cookie, origin },
    });
    extra.push(ws);
    const closed = await new Promise<CloseEvent>((resolve) =>
      ws.addEventListener("close", resolve, { once: true }),
    );
    expect(closed.code).toBe(1008);
    expect(closed.reason).toBe("too_many_sockets");
    await clients[0]?.close();
    expect((await f.connect(cookie, { seat: 0 }, id)).ws.readyState).toBe(
      WebSocket.OPEN,
    );
  } finally {
    for (const ws of extra) ws.close();
    await f.stop();
  }
});

test("unseated sockets receive configured pings; oversized frames get the application close", async () => {
  const old = process.env.FACEDOWN_PING_MS;
  process.env.FACEDOWN_PING_MS = "10";
  const f = fixture();
  if (old === undefined) delete process.env.FACEDOWN_PING_MS;
  else process.env.FACEDOWN_PING_MS = old;
  let ws: WebSocket | undefined;
  try {
    const cookie = await f.guest(),
      origin = `http://127.0.0.1:${f.app.server.port}`;
    ws = new Socket(`${origin.replace("http:", "ws:")}/ws`, {
      headers: { cookie, origin },
    });
    const ping = await new Promise<unknown>((resolve) =>
      ws?.addEventListener(
        "message",
        (e) => resolve(JSON.parse(String(e.data))),
        { once: true },
      ),
    );
    expect(ping).toEqual({ t: "ping" });
    const closed = new Promise<CloseEvent>((resolve) =>
      ws?.addEventListener("close", resolve, { once: true }),
    );
    ws.send("x".repeat(16000));
    expect(await closed).toMatchObject({
      code: 1009,
      reason: "Message too large",
    });
  } finally {
    ws?.close();
    await f.stop();
  }
});

test("public GETs ignore invalid and expired cookies, mutations still reject them", async () => {
  const f = fixture();
  try {
    const expired = await f.guest();
    f.clock.advance(30 * 86400000);
    for (const cookie of ["fd=invalid", expired]) {
      for (const [path, status] of [
        ["/api/tables", 200],
        ["/api/leaderboard/spades", 200],
        ["/api/games/aaaaaaaaaa", 404],
        ["/api/players/absent", 404],
      ] as const)
        expect((await f.request(path, cookie)).status).toBe(status);
      expect(
        (await f.request("/api/tables", cookie, { type: "spades" })).status,
      ).toBe(401);
    }
  } finally {
    await f.stop();
  }
});
