import { expect, test } from "bun:test";
import { Budget } from "../../src/server/ws/budget";
import { fixture } from "./helpers";

const Socket = WebSocket as unknown as new (
  url: string,
  options: Bun.WebSocketOptions,
) => WebSocket;
async function rejectedSocket(
  origin: string,
  cookie: string,
  headerOrigin = origin,
) {
  const ws = new Socket(`${origin.replace("http:", "ws:")}/ws`, {
    headers: { cookie, origin: headerOrigin },
  });
  let opened = false;
  ws.addEventListener("open", () => {
    opened = true;
    ws.close();
  });
  ws.addEventListener("error", (event) => event.preventDefault());
  await new Promise<void>((resolve) =>
    ws.addEventListener("close", () => resolve(), { once: true }),
  );
  expect(opened).toBe(false);
}

test("unknown/expired guest tokens return 401 and cannot open or retain a socket", async () => {
  const f = fixture();
  try {
    const origin = `http://127.0.0.1:${f.app.server.port}`;
    const unknown = `fd=${"a".repeat(64)}`;
    expect((await f.request("/api/me", unknown)).status).toBe(401);
    expect((await f.request("/api/tables", unknown)).status).toBe(401);
    expect(
      (await f.request("/api/tables", unknown, { type: "spades" })).status,
    ).toBe(401);
    await rejectedSocket(origin, unknown);
    const cookie = await f.guest();
    const ws = new Socket(`${origin.replace("http:", "ws:")}/ws`, {
      headers: { cookie, origin },
    });
    await new Promise<void>((resolve) =>
      ws.addEventListener("open", () => resolve(), { once: true }),
    );
    f.clock.advance(30 * 86400000);
    expect((await f.request("/api/me", cookie)).status).toBe(401);
    await rejectedSocket(origin, cookie);
    const closed = new Promise<CloseEvent>((resolve) =>
      ws.addEventListener("close", resolve, { once: true }),
    );
    ws.send("{}");
    expect((await closed).code).toBe(1008);
  } finally {
    await f.stop();
  }
});

test("configured Origin defeats matching hostile Host and Origin headers", async () => {
  const pinned = "https://facedown.example",
    f = fixture({ origin: pinned });
  try {
    const origin = `http://127.0.0.1:${f.app.server.port}`;
    expect((await f.request("/api/guest", "", {})).status).toBe(403);
    const guest = await f.request("/api/guest", "", {}, pinned);
    expect(guest.status).toBe(200);
    const cookie = guest.headers.get("set-cookie")?.split(";")[0] as string;
    const hostile = await fetch(`${origin}/api/tables`, {
      method: "POST",
      headers: { host: "evil.example", origin: "http://evil.example", cookie },
      body: JSON.stringify({ type: "spades" }),
    });
    expect(hostile.status).toBe(403);
    const created = await f.request(
      "/api/tables",
      cookie,
      { type: "spades", casual: true },
      pinned,
    );
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };
    expect(f.app.tables.get(id).casual).toBe(true);
    const c = await f.connect(cookie, { seat: 0 }, id, pinned);
    expect(c.messages[0]?.t).toBe("view");
    await rejectedSocket(origin, cookie);
    expect(
      (await f.request(`/api/tables/${id}/bots`, cookie, {}, pinned)).status,
    ).toBe(200);
    expect(
      (await f.request(`/api/tables/${id}/start`, cookie, {}, pinned)).status,
    ).toBe(200);
    expect(f.app.store.loadGame(id)?.casual).toBe(true);
  } finally {
    await f.stop();
  }
});

test("all-message budget caps join broadcasts and closes a sustained flood", async () => {
  const f = fixture();
  try {
    const g = await f.game("spades"),
      client = g.players[0];
    if (!client) throw new Error("Missing client");
    f.clock.advance(1001);
    for (let batch = 0; batch < 4; batch++) {
      const target = client.messages.length + 21;
      for (let i = 0; i < 21; i++)
        client.send({ t: "join", table: g.id, seat: 0 });
      await client.next(
        (m) => m.t === "error" && client.messages.length >= target,
      );
      f.clock.advance(750);
    }
    const closed = new Promise<CloseEvent>((resolve) =>
      client.ws.addEventListener("close", resolve, { once: true }),
    );
    for (let i = 0; i < 21; i++)
      client.send({ t: "join", table: g.id, seat: 0 });
    expect((await closed).code).toBe(1008);
    expect(f.app.tables.get(g.id).seq).toBe(0);
    expect(
      g.players[1]?.messages.filter((m) => m.t === "view").length,
    ).toBeLessThan(70);
  } finally {
    await f.stop();
  }
});

test("per-connection budgets retain five moves/s and reset flood after quiet", () => {
  const budget = new Budget();
  for (let i = 0; i < 5; i++) {
    expect(budget.accept(0)).toBe("ok");
    expect(budget.acceptMove(0)).toBe("ok");
  }
  expect(budget.acceptMove(0)).toBe("limited");
  for (let i = 5; i < 20; i++) expect(budget.accept(0)).toBe("ok");
  expect(budget.accept(0)).toBe("limited");
  for (let second = 1; second <= 4; second++) {
    const now = second * 1100;
    for (let i = 0; i < 20; i++) budget.accept(now);
    expect(budget.accept(now)).toBe("limited");
  }
});
