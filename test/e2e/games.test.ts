import { expect, test } from "bun:test";
import { fixture } from "./helpers";
import { checkWire } from "./wire";

for (const type of ["spades", "dominoes"] as const)
  test(`four clients finish ${type}, spectator wire is private, replay verifies`, async () => {
    const f = fixture();
    try {
      const g = await f.game(type);
      expect((await f.request(`/api/games/${g.id}`)).status).toBe(404);
      await f.play(g.id, g.players);
      await Promise.all(
        [...g.players, g.spectator].map((c) => c.next((m) => m.t === "over")),
      );
      const response = await f.request(`/api/games/${g.id}`);
      expect(response.status).toBe(200);
      const replay = await response.json();
      const record = f.app.store.loadGame(g.id);
      if (!record) throw new Error("Missing persisted game");
      expect(replay).toMatchObject({
        seed: record.seed,
        moves: record.moves,
        outcome: record.outcome,
      });
      expect(JSON.stringify(replay)).not.toContain("session");
      checkWire(record, f.clients);
      expect(f.clock.pending).toBe(0);
    } finally {
      await f.stop();
    }
  }, 30000);

test("restart mid-deal restores the same view, reconnects and finishes", async () => {
  const f = fixture();
  try {
    const g = await f.game("spades");
    await f.play(g.id, g.players, () => f.app.tables.get(g.id).seq >= 10);
    const before = f.app.tables.get(g.id);
    const views = [0, 1, 2, 3].map((seat) =>
      before.game.view(before.state, { seat: seat as 0 | 1 | 2 | 3 }),
    );
    const seq = before.seq;
    await f.restart();
    expect(f.app.tables.get(g.id).seq).toBe(seq);
    expect(
      f.app.tables.get(g.id).seats.every((s) => s?.sockets.size === 0),
    ).toBe(true);
    for (const seat of [0, 1, 2, 3] as const) {
      const c = await f.connect(g.cookies[seat] as string, { seat }, g.id);
      expect((await c.view(seq)).view).toEqual(views[seat]);
      g.players[seat] = c;
    }
    const spectator = await f.connect(
      await f.guest(),
      { spectator: true },
      g.id,
    );
    await f.play(g.id, g.players);
    await Promise.all(
      [...g.players, spectator].map((c) => c.next((m) => m.t === "over")),
    );
    const record = f.app.store.loadGame(g.id);
    if (!record) throw new Error("Missing record");
    checkWire(record, f.clients);
  } finally {
    await f.stop();
  }
}, 30000);
