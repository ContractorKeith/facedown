import { expect, test } from "bun:test";
import { fixture } from "./helpers";
import { checkWire } from "./wire";

test("disconnect holds seat, records timeouts, takes over with a bot, then reclaims", async () => {
  const f = fixture();
  try {
    const g = await f.game("spades");
    const table = f.app.tables.get(g.id);
    await g.players[1]?.close();
    await g.spectator.next(
      (m) =>
        m.t === "view" &&
        (m.seats as { connected: boolean }[])[1]?.connected === false,
    );
    expect(table.seats[1]?.bot).toBe(false);
    f.clock.advance(10000);
    expect(f.app.store.loadGame(g.id)?.moves[0]).toEqual({
      seat: 1,
      timeout: true,
    });
    f.clock.advance(20000);
    expect(table.seats[1]?.bot).toBe(true);
    // Play seat 0; the held seat's bot must now make a persisted move.
    const seq = table.seq,
      client = g.players[0];
    if (!client) throw new Error("Missing player");
    const view = await client.view(seq);
    client.send({
      t: "move",
      table: g.id,
      seq,
      move: table.game.bot(view.view, table.game.legalMoves(table.state, 0)),
    });
    await client.view(seq + 1);
    f.clock.advance(1);
    expect(f.app.store.loadGame(g.id)?.moves.at(-1)).toHaveProperty("move");
    const returned = await f.connect(g.cookies[1] as string, { seat: 1 }, g.id);
    g.players[1] = returned;
    expect(table.seats[1]?.bot).toBe(false);
    await f.play(g.id, g.players, () => table.seq >= seq + 8);
    expect(table.seats[1]?.sockets.size).toBe(1);
    const record = f.app.store.loadGame(g.id);
    if (!record) throw new Error("Missing record");
    checkWire(record, f.clients);
  } finally {
    await f.stop();
  }
});
