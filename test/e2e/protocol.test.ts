import { expect, test } from "bun:test";
import { fixture } from "./helpers";
import { checkWire } from "./wire";

test("cheat attempts reject without changing state or the move log", async () => {
  const f = fixture();
  try {
    const g = await f.game("spades");
    const table = f.app.tables.get(g.id);
    const unchanged = async (index: number, message: unknown, code: string) => {
      const state = structuredClone(table.state),
        seq = table.seq;
      const client = g.players[index];
      if (!client) throw new Error("No client");
      f.clock.advance(1001);
      client.send(message);
      await client.error(code);
      expect(table.state).toEqual(state);
      expect(table.seq).toBe(seq);
      expect(f.app.store.loadGame(g.id)?.moves.length).toBe(seq);
    };
    await unchanged(
      0,
      { t: "move", table: g.id, seq: 0, move: { bid: 3 } },
      "not_your_turn",
    );
    await unchanged(
      1,
      { t: "move", table: g.id, seq: 1, move: { bid: 3 } },
      "stale_seq",
    );
    expect((await g.players[1]?.view(0))?.view).toEqual(
      table.game.view(table.state, { seat: 1 }),
    );
    await unchanged(
      1,
      { t: "move", table: g.id, seq: 0, move: { bid: 99 } },
      "illegal_move",
    );
    await unchanged(
      1,
      { t: "move", table: g.id, seq: 0, move: { bid: 3 }, seat: 2 },
      "bad_request",
    );
    await unchanged(0, { t: "join", table: g.id, seat: 1 }, "forbidden");
    f.clock.advance(1001);
    const state = structuredClone(table.state);
    for (let i = 0; i < 6; i++)
      g.players[0]?.send({ t: "move", table: g.id, seq: 0, move: { bid: 3 } });
    await g.players[0]?.error("rate_limited");
    expect(table.state).toEqual(state);
    expect(table.seq).toBe(0);
    f.clock.advance(1001);
    await f.play(g.id, g.players, () => table.seq >= 4);
    const actor = table.game.toAct(table.state) as 0 | 1 | 2 | 3;
    const other = ((actor + 1) % 4) as 0 | 1 | 2 | 3;
    const view = table.game.view(table.state, { seat: other }) as {
      hand: string[];
    };
    await unchanged(
      actor,
      { t: "move", table: g.id, seq: table.seq, move: { play: view.hand[0] } },
      "illegal_move",
    );
    const spectatorState = structuredClone(table.state);
    g.spectator.send({
      t: "move",
      table: g.id,
      seq: table.seq,
      move: { play: view.hand[0] },
    });
    await g.spectator.error("forbidden");
    expect(table.state).toEqual(spectatorState);
    const record = f.app.store.loadGame(g.id);
    if (!record) throw new Error("Missing record");
    checkWire(record, f.clients);
    const oversized = await f.connect(
      g.cookies[0] as string,
      { seat: 0 },
      g.id,
    );
    const closed = new Promise<CloseEvent>((resolve) =>
      oversized.ws.addEventListener("close", resolve, { once: true }),
    );
    oversized.ws.send("x".repeat(4097));
    // Bun enforces maxPayloadLength before the message callback.
    expect([1006, 1009]).toContain((await closed).code);
    expect(table.state).toEqual(spectatorState);
    checkWire(record, f.clients);
  } finally {
    await f.stop();
  }
});

test("reactions are fixed, seat-scoped and limited across a seat's sockets", async () => {
  const f = fixture();
  try {
    const g = await f.game("dominoes");
    const client = g.players[0];
    if (!client) throw new Error("Missing player");
    client.send({ t: "react", table: g.id, id: "nice" });
    expect(await g.spectator.next((m) => m.t === "reaction")).toMatchObject({
      seat: 0,
      id: "nice",
    });
    const second = await f.connect(g.cookies[0] as string, { seat: 0 }, g.id);
    second.send({ t: "react", table: g.id, id: "wow" });
    await second.error("rate_limited");
    f.clock.advance(3000);
    second.send({ t: "react", table: g.id, id: "wow" });
    await g.spectator.next((m) => m.t === "reaction" && m.id === "wow");
    client.send({ t: "react", table: g.id, id: "arbitrary text" });
    await client.error("bad_request");
    g.spectator.send({ t: "react", table: g.id, id: "gg" });
    await g.spectator.error("forbidden");
    const record = f.app.store.loadGame(g.id);
    if (!record) throw new Error("Missing record");
    checkWire(record, f.clients);
  } finally {
    await f.stop();
  }
});

test("HTTP sessions, origins, lobby, host authority and malformed requests", async () => {
  const f = fixture();
  try {
    expect(await (await f.request("/healthz")).text()).toBe("ok");
    expect((await f.request("/")).headers.get("content-type")).toContain(
      "text/html",
    );
    expect((await f.request("/api/me")).status).toBe(403);
    const host = await f.guest(),
      other = await f.guest();
    expect(await (await f.request("/api/me", host)).json()).toMatchObject({
      guest: true,
    });
    expect(
      (
        await f.request(
          "/api/tables",
          host,
          { type: "spades" },
          "https://evil.example",
        )
      ).status,
    ).toBe(403);
    expect(
      (await f.request("/api/tables", "", { type: "spades" })).status,
    ).toBe(403);
    for (const body of [
      null,
      [],
      { type: "hearts" },
      { type: "spades", casual: "yes" },
    ])
      expect((await f.request("/api/tables", host, body)).status).toBe(400);
    const { id } = (await (
      await f.request("/api/tables", host, { type: "spades" })
    ).json()) as { id: string };
    expect((await f.request(`/api/tables/${id}/start`, host, {})).status).toBe(
      400,
    );
    expect((await f.request(`/api/tables/${id}/bots`, other, {})).status).toBe(
      403,
    );
    expect((await f.request(`/api/tables/${id}/bots`, host, {})).status).toBe(
      200,
    );
    const lobby = await (await f.request("/api/tables")).json();
    expect(lobby).toMatchObject([{ id, type: "spades", status: "open" }]);
    expect(JSON.stringify(lobby)).not.toMatch(/seed|session|hand/);
    expect((await f.request(`/api/tables/${id}/start`, host, {})).status).toBe(
      200,
    );
    expect((await f.request(`/api/tables/${id}/start`, host, {})).status).toBe(
      400,
    );
    expect((await f.request("/ws", host)).status).toBe(400);
    expect(
      (await f.request("/ws", host, undefined, "https://evil.example")).status,
    ).toBe(403);
    expect((await f.request("/api/games/aaaaaaaaaa")).status).toBe(404);
  } finally {
    await f.stop();
  }
});
