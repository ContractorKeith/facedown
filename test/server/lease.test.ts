import { expect, test } from "bun:test";
import { Store } from "../../src/server/store";
import { Tables } from "../../src/server/tables";
import { FakeClock, scratch } from "./helpers";

test("two Tables instances fence moves and rebuild only after lease handoff", async () => {
  const temp = scratch();
  const a = new Store(temp.db),
    b = new Store(temp.db);
  const time = new FakeClock();
  const first = new Tables(a, time),
    second = new Tables(b, time);
  const host = { id: "host", name: "guest-host" };
  try {
    expect(first.ready).toBe(true);
    expect(second.ready).toBe(false);
    const table = first.create("spades", host);
    first.fill(table.id, host);
    first.start(table.id, host);
    first.lifecycle.apply(table, { seat: 1, timeout: true });
    expect(() =>
      second.move(table.id, 1, {}, { session: host, send() {} }),
    ).toThrow("unavailable");
    first.stop();
    for (let i = 0; i < 20 && !second.ready; i++) await Bun.sleep(50);
    expect(second.ready).toBe(true);
    const restored = second.get(table.id);
    expect(restored.seq).toBe(1);
    expect(restored.state).toEqual(table.state);
    expect(() =>
      first.lifecycle.apply(table, { seat: 2, timeout: true }),
    ).toThrow("unavailable");
    second.lifecycle.apply(restored, { seat: 2, timeout: true });
    expect(a.loadGame(table.id)?.moves.length).toBe(2);
  } finally {
    first.stop();
    second.stop();
    a.close();
    b.close();
    temp.clean();
  }
});

test("expired holder cannot refresh, write, or release its successor's lease", () => {
  const store = new Store(":memory:");
  try {
    const now = Date.now();
    expect(store.leases.claim("old", now - 20001)).toBe(true);
    expect(store.leases.claim("new", now)).toBe(true);
    expect(store.leases.heartbeat("old")).toBe(false);
    expect(() => store.leases.run("old", () => {})).toThrow("unavailable");
    store.leases.release("old");
    expect(store.leases.owns("new")).toBe(true);
  } finally {
    store.close();
  }
});

test("a failed broadcast cannot roll back a committed move", () => {
  const store = new Store(":memory:");
  const tables = new Tables(store, new FakeClock());
  const host = { id: "host", name: "guest-host" };
  try {
    const table = tables.create("spades", host);
    tables.fill(table.id, host);
    tables.start(table.id, host);
    const peer = {
      session: host,
      send() {
        throw new Error("socket failed");
      },
    };
    table.viewers.set(peer, { spectator: true });
    expect(() =>
      tables.lifecycle.apply(table, { seat: 1, timeout: true }),
    ).toThrow("socket failed");
    expect(table.seq).toBe(1);
    expect(store.loadGame(table.id)?.moves.length).toBe(1);
  } finally {
    tables.stop();
    store.close();
  }
});
