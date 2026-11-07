import { expect, test } from "bun:test";
import { sessionHashes } from "../../src/server/store/testing";
import { fixture } from "./helpers";

const Socket = WebSocket as unknown as new (
  url: string,
  options: Bun.WebSocketOptions,
) => WebSocket;
const cookieOf = (response: Response) =>
  response.headers.get("set-cookie")?.split(";")[0] as string;

test("70 logins cannot multiply account limits or deny another IP a table", async () => {
  const old = process.env.FACEDOWN_TRUST_PROXY;
  process.env.FACEDOWN_TRUST_PROXY = "1";
  const f = fixture();
  const sockets: WebSocket[] = [];
  try {
    const origin = `http://127.0.0.1:${f.app.server.port}`;
    const request = (
      path: string,
      cookie: string,
      body: unknown,
      ip = "attacker",
    ) =>
      fetch(`${origin}${path}`, {
        method: "POST",
        headers: {
          origin,
          cookie,
          "x-forwarded-for": ip,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
    const credentials = { username: "flood_user", password: "correct horse" };
    const first = cookieOf(await request("/api/register", "", credentials));
    let created = 0;
    const cookies = [first];
    for (let i = 0; i < 70; i++) {
      const response = await request("/api/login", "", credentials);
      expect(response.status).toBe(200);
      const cookie = cookieOf(response);
      cookies.push(cookie);
      const table = await request("/api/tables", cookie, { type: "spades" });
      if (table.status === 201) created++;
      else expect(table.status).toBe(409);
    }
    expect(created).toBe(3);
    expect(sessionHashes(f.db)).toHaveLength(10);
    for (const cookie of cookies.slice(0, -10))
      expect((await f.request("/api/me", cookie)).status).toBe(401);
    const open = async (cookie: string, ip: string, accepted: boolean) => {
      const ws = new Socket(`${origin.replace("http:", "ws:")}/ws`, {
        headers: { cookie, origin, "x-forwarded-for": ip },
      });
      sockets.push(ws);
      if (!accepted) {
        const closed = await new Promise<CloseEvent>((resolve) =>
          ws.addEventListener("close", resolve, { once: true }),
        );
        expect(closed).toMatchObject({
          code: 1008,
          reason: "too_many_sockets",
        });
        return;
      }
      await new Promise<void>((resolve, reject) => {
        ws.addEventListener("open", () => resolve(), { once: true });
        ws.addEventListener("error", reject, { once: true });
      });
      ws.send(JSON.stringify({ t: "spectate", table: "aaaaaaaaaa" }));
      await new Promise<void>((resolve) =>
        ws.addEventListener("message", () => resolve(), { once: true }),
      );
      expect(ws.readyState).toBe(WebSocket.OPEN);
    };
    const recent = cookies.slice(-10);
    for (const cookie of recent.slice(0, 2))
      for (let i = 0; i < 8; i++) await open(cookie, "attacker", true);
    await open(recent[2] as string, "different-ip", false); // Account cap, independent of IP.
    const guests: string[] = [];
    for (let i = 0; i < 5; i++)
      guests.push(cookieOf(await request("/api/guest", "", {})));
    for (const cookie of guests.slice(0, 2))
      for (let i = 0; i < 8; i++) await open(cookie, "attacker", true);
    await open(guests[2] as string, "attacker", false); // IP cap across identities.
    for (const cookie of guests.slice(0, 3))
      expect(
        (await request("/api/tables", cookie, { type: "spades" })).status,
      ).toBe(201);
    expect(
      (await request("/api/tables", guests[3] as string, { type: "spades" }))
        .status,
    ).toBe(409);
    const friend = cookieOf(await request("/api/guest", "", {}, "friend"));
    expect(
      (await request("/api/tables", friend, { type: "spades" }, "friend"))
        .status,
    ).toBe(201);
    await open(friend, "friend", true);
    // Oldest session eviction also revokes its already-open sockets.
    const evicted = sockets[0] as WebSocket;
    const closed = new Promise<CloseEvent>((resolve) =>
      evicted.addEventListener("close", resolve, { once: true }),
    );
    expect((await request("/api/login", "", credentials)).status).toBe(200);
    expect((await closed).code).toBe(1008);
  } finally {
    for (const ws of sockets) ws.close();
    await f.stop();
    if (old === undefined) delete process.env.FACEDOWN_TRUST_PROXY;
    else process.env.FACEDOWN_TRUST_PROXY = old;
  }
}, 90000);
