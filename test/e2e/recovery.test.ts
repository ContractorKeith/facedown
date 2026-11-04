import { expect, spyOn, test } from "bun:test";
import { corruptMove } from "../../src/server/store/testing";
import { fixture } from "./helpers";

for (const corruption of ["null", "illegal", "gap"] as const)
  test(`restart quarantines ${corruption} game: replay 404, healthy table resumes`, async () => {
    const f = fixture(),
      warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      const bad = await f.game("spades"),
        good = await f.game("dominoes");
      const table = f.app.tables.get(bad.id);
      f.app.tables.lifecycle.apply(table, { seat: 1, timeout: true });
      // Damage the actual SQLite file before a new server instance loads it.
      corruptMove(f.db, bad.id, corruption);
      await f.restart();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(f.app.store.gameStatus(bad.id)).toBe("abandoned");
      expect((await f.request(`/api/games/${bad.id}`)).status).toBe(404);
      expect(f.app.tables.list().map((t) => t.id)).toEqual([good.id]);
      for (const seat of [0, 1, 2, 3] as const)
        good.players[seat] = await f.connect(
          good.cookies[seat] as string,
          { seat },
          good.id,
        );
      await f.play(
        good.id,
        good.players,
        () => f.app.tables.get(good.id).seq >= 1,
      );
      expect(f.app.store.loadGame(good.id)?.moves.length).toBe(1);
    } finally {
      await f.stop();
      warn.mockRestore();
    }
  });

test("table creation returns 409 for open-table cap and 429 for ten-minute budget", async () => {
  const f = fixture({ openTTL: 50 });
  try {
    const cookie = await f.guest();
    for (let i = 0; i < 3; i++)
      expect(
        (await f.request("/api/tables", cookie, { type: "spades" })).status,
      ).toBe(201);
    for (let i = 3; i < 10; i++)
      expect(
        (await f.request("/api/tables", cookie, { type: "spades" })).status,
      ).toBe(409);
    expect(
      (await f.request("/api/tables", cookie, { type: "spades" })).status,
    ).toBe(429);
    f.clock.advance(600000);
    expect(
      (
        await f.request("/api/tables", cookie, {
          type: "spades",
          casual: false,
        })
      ).status,
    ).toBe(201);
  } finally {
    await f.stop();
  }
});

test("malformed table creation requests also consume the per-session budget", async () => {
  const f = fixture();
  try {
    const cookie = await f.guest();
    for (let i = 0; i < 10; i++)
      expect(
        (await f.request("/api/tables", cookie, { type: "invalid" })).status,
      ).toBe(400);
    expect(
      (await f.request("/api/tables", cookie, { type: "spades" })).status,
    ).toBe(429);
  } finally {
    await f.stop();
  }
});
