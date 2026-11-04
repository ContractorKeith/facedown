import { expect, spyOn, test } from "bun:test";
import { clock } from "../../src/server/clock";
import { Store } from "../../src/server/store";
import { corruptMove } from "../../src/server/store/testing";
import { Tables } from "../../src/server/tables";
import type { Peer } from "../../src/server/tables/types";
import { FakeClock, scratch } from "./helpers";

for (const corruption of ["null", "illegal", "gap", "json"] as const)
  test(`boot abandons ${corruption} log and keeps another game playable`, () => {
    const temp = scratch(),
      store = new Store(temp.db),
      time = new FakeClock();
    let tables = new Tables(store, time);
    const host = { id: "host", name: "guest-host" };
    const bad = tables.create("spades", host),
      good = tables.create("spades", host);
    for (const table of [bad, good]) {
      tables.fill(table.id, host);
      tables.start(table.id, host);
      tables.lifecycle.apply(table, { seat: 1, timeout: true });
    }
    tables.stop();
    corruptMove(temp.db, bad.id, corruption);
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      tables = new Tables(store, time);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0])).toContain(bad.id);
      expect(store.gameStatus(bad.id)).toBe("abandoned");
      expect(() => tables.get(bad.id)).toThrow("not_found");
      const restored = tables.get(good.id);
      expect(restored.seq).toBe(1);
      tables.join(good.id, 0, { session: host, send: () => {} });
      tables.lifecycle.apply(restored, { seat: 2, timeout: true });
      expect(restored.seq).toBe(2);
      expect(store.loadGame(good.id)?.moves.length).toBe(2);
    } finally {
      warn.mockRestore();
      tables.stop();
      store.close();
      temp.clean();
    }
  });

for (const kind of ["bot", "turn"] as const)
  test(`throwing store in real ${kind} timer freezes only its table; disconnect stays safe`, async () => {
    const temp = scratch();
    class FailingStore extends Store {
      failing = "";
      override appendMove(...args: Parameters<Store["appendMove"]>): void {
        if (args[0] === this.failing) throw new Error("disk unavailable");
        super.appendMove(...args);
      }
    }
    const store = new FailingStore(temp.db),
      tables = new Tables(store, clock, { turn: 5, hold: 10000, bot: 1 });
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      const host = { id: "host", name: "guest-host" },
        table = tables.create("spades", host);
      const received: unknown[] = [];
      let resolve!: () => void;
      const unavailable = new Promise<void>((r) => {
        resolve = r;
      });
      const peer: Peer = {
        session: host,
        send: (m) => {
          received.push(m);
          if ((m as { code?: string }).code === "unavailable") resolve();
        },
      };
      tables.join(table.id, 0, peer);
      if (kind === "turn") {
        for (const seat of [1, 2, 3] as const)
          tables.join(table.id, seat, {
            session: { id: `p${seat}`, name: `guest-${seat}` },
            send: () => {},
          });
      } else tables.fill(table.id, host);
      store.failing = table.id;
      tables.start(table.id, host);
      await unavailable;
      expect(table.status).toBe("unavailable");
      expect(table.seq).toBe(0);
      expect(table.deadline).toBe(null);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(received).toContainEqual({
        t: "error",
        code: "unavailable",
        message: "Table unavailable",
      });
      expect(() => tables.disconnect(peer)).not.toThrow();
      const good = tables.create("spades", host);
      tables.fill(good.id, host);
      tables.start(good.id, host);
      tables.lifecycle.apply(good, { seat: 1, timeout: true });
      expect(good.seq).toBe(1);
    } finally {
      tables.stop();
      store.close();
      warn.mockRestore();
      temp.clean();
    }
  });

test("a throw in hold callback freezes the table and cancels the pending turn", () => {
  const temp = scratch(),
    store = new Store(temp.db),
    clock = new FakeClock();
  const tables = new Tables(store, clock, { turn: 100, hold: 1, bot: 100 });
  const warn = spyOn(console, "warn").mockImplementation(() => {});
  try {
    const host = { id: "host", name: "guest-host" },
      peer = { session: host, send: () => {} };
    const table = tables.create("spades", host),
      messages: unknown[] = [];
    let fail = false;
    const watcher = {
      session: { id: "watcher", name: "guest-watch" },
      send: (m: unknown) => {
        messages.push(m);
        if (fail && (m as { t: string }).t === "view")
          throw new Error("send failed");
      },
    };
    tables.join(table.id, 0, peer);
    tables.spectate(table.id, watcher);
    tables.fill(table.id, host);
    tables.start(table.id, host);
    tables.disconnect(peer);
    fail = true;
    clock.advance(1);
    expect(table.status).toBe("unavailable");
    expect(clock.pending).toBe(0);
    expect(messages).toContainEqual({
      t: "error",
      code: "unavailable",
      message: "Table unavailable",
    });
    clock.advance(1000);
    expect(table.seq).toBe(0);
    tables.disconnect(watcher);
    expect(clock.pending).toBe(0);
  } finally {
    warn.mockRestore();
    tables.stop();
    store.close();
    temp.clean();
  }
});
