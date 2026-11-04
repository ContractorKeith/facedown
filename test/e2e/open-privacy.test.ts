import { expect, test } from "bun:test";
import { fixture } from "./helpers";
import { checkWire } from "./wire";

for (const type of ["spades", "dominoes"] as const)
  test(`open ${type} seat hopping reveals no pieces; start deals privately`, async () => {
    const f = fixture();
    try {
      const host = await f.guest(),
        spy = await f.guest();
      const { id } = await (
        await f.request("/api/tables", host, { type })
      ).json();
      const table = f.app.tables.get(id);
      expect(table.state).toBeNull();
      expect(table.seed).toBeNull();
      expect(f.app.store.loadGame(id)).toBeNull();
      const client = await f.connect(spy, { seat: 1 }, id);
      for (const seat of [2, 3, 1]) {
        client.send({ t: "leave", table: id });
        client.send({ t: "join", table: id, seat });
        await client.next((m) => m.t === "view" && m.you === seat);
      }
      for (const frame of client.messages) {
        expect(frame.view).toBeNull();
        expect(frame.commitment).toBeNull();
        expect(frame.logHash).toBeNull();
        expect(frame.lastMove).toBeNull();
        expect(JSON.stringify(frame)).not.toMatch(
          /\b(?:[2-9TJQKA][SHDC]|[0-6]-[0-6])\b/,
        );
      }
      await f.request(`/api/tables/${id}/bots`, host, {});
      await f.request(`/api/tables/${id}/start`, host, {});
      const live = await client.next(
        (m) => m.t === "view" && m.status === "live",
      );
      expect(live.you).toBe(1);
      expect(live.view).not.toBeNull();
      expect(live.commitment).toMatch(/^[a-f0-9]{64}$/);
      const record = f.app.store.loadGame(id);
      if (!record) throw new Error("Missing started game");
      checkWire(record, [client]);
    } finally {
      await f.stop();
    }
  });
