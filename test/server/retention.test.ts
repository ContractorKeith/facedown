import { expect, test } from "bun:test";
import { Store } from "../../src/server/store";
import { Tables } from "../../src/server/tables";
import type { Peer } from "../../src/server/tables/types";
import { FakeClock, scratch } from "./helpers";

function setup() {
  const temp = scratch(),
    store = new Store(temp.db),
    clock = new FakeClock();
  const tables = new Tables(store, clock, { turn: 100, hold: 100, bot: 0 }, 50);
  const host = { id: "host", name: "guest-host" };
  return {
    store,
    clock,
    tables,
    host,
    clean() {
      tables.stop();
      store.close();
      temp.clean();
    },
  };
}

test("three open tables per host; ten creations per ten minutes, even after closing", () => {
  const f = setup();
  try {
    for (let i = 0; i < 3; i++) f.tables.create("spades", f.host);
    expect(() => f.tables.create("spades", f.host)).toThrow("conflict");
    f.clock.advance(50);
    expect(f.tables.list()).toEqual([]);
    for (let i = 4; i < 10; i++) {
      const t = f.tables.create("spades", f.host),
        peer = { session: f.host, send: () => {} };
      f.tables.join(t.id, 0, peer);
      f.tables.leave(t.id, peer);
    }
    expect(() => f.tables.create("spades", f.host)).toThrow("rate_limited");
    f.clock.advance(600000);
    expect(() => f.tables.create("spades", f.host)).not.toThrow();
  } finally {
    f.clean();
  }
});

test("open TTL ignores spectators; a connected human prevents expiry", () => {
  const f = setup();
  try {
    const table = f.tables.create("spades", f.host),
      spectator = { session: { id: "s", name: "guest-s" }, send: () => {} };
    f.clock.advance(25);
    f.tables.spectate(table.id, spectator);
    f.clock.advance(25);
    expect(() => f.tables.get(table.id)).toThrow("not_found");
    const next = f.tables.create("spades", f.host),
      peer = { session: f.host, send: () => {} };
    f.tables.join(next.id, 0, peer);
    f.clock.advance(500);
    expect(f.tables.get(next.id)).toBe(next);
    f.tables.disconnect(peer);
    expect(() => f.tables.get(next.id)).toThrow("not_found");
    expect(f.clock.pending).toBe(0);
  } finally {
    f.clean();
  }
});

test("open last-socket release transfers host, permits bot fill, and closes on last human", () => {
  const f = setup();
  try {
    const table = f.tables.create("spades", f.host);
    const hostPeer = { session: f.host, send: () => {} },
      secondSocket = { ...hostPeer };
    const next = {
      session: { id: "next", name: "guest-next" },
      send: () => {},
    };
    f.tables.join(table.id, 0, hostPeer);
    f.tables.join(table.id, 0, secondSocket);
    f.tables.join(table.id, 2, next);
    f.tables.disconnect(hostPeer);
    expect(table.seats[0]).not.toBe(null);
    f.tables.disconnect(secondSocket);
    expect(table.seats[0]).toBe(null);
    expect(table.host).toBe(next.session.id);
    f.tables.fill(table.id, next.session);
    expect(table.seats[0]?.bot).toBe(true);
    f.tables.leave(table.id, next);
    expect(() => f.tables.get(table.id)).toThrow("not_found");
  } finally {
    f.clean();
  }
});

test("finished table evicts on last viewer or ten minutes; over is once per subscription", () => {
  const f = setup();
  try {
    const table = f.tables.create("dominoes", f.host),
      messages: unknown[] = [];
    const watcher: Peer = {
      session: { id: "spectator", name: "guest-s" },
      send: (m) => {
        messages.push(m);
      },
    };
    f.tables.spectate(table.id, watcher);
    f.tables.fill(table.id, f.host);
    f.tables.start(table.id, f.host);
    f.clock.advance(100); // Host becomes bot; zero-delay bots finish.
    expect(table.status).toBe("finished");
    const count = () =>
      messages.filter((m) => (m as { t: string }).t === "over").length;
    expect(count()).toBe(1);
    f.tables.lifecycle.broadcast(table);
    expect(count()).toBe(1);
    const newcomer: Peer = {
      session: { id: "new", name: "guest-new" },
      send: (m) => {
        messages.push(m);
      },
    };
    f.tables.spectate(table.id, newcomer);
    expect(count()).toBe(2);
    f.tables.spectate(table.id, newcomer);
    expect(count()).toBe(2);
    f.tables.disconnect(newcomer);
    f.tables.lifecycle.broadcast(table);
    expect(count()).toBe(2);
    f.clock.advance(599999);
    expect(f.tables.get(table.id)).toBe(table);
    f.clock.advance(1);
    expect(() => f.tables.get(table.id)).toThrow("not_found");
    expect(f.store.gameStatus(table.id)).toBe("finished");
    expect(f.clock.pending).toBe(0);
    const second = f.tables.create("dominoes", f.host);
    f.tables.spectate(second.id, watcher);
    f.tables.fill(second.id, f.host);
    f.tables.start(second.id, f.host);
    f.clock.advance(100);
    f.tables.disconnect(watcher);
    expect(() => f.tables.get(second.id)).toThrow("not_found");
    expect(f.clock.pending).toBe(0);
  } finally {
    f.clean();
  }
});

test("host succession follows the next occupied human seat clockwise", () => {
  const f = setup();
  try {
    const table = f.tables.create("spades", f.host);
    const first = { session: f.host, send: () => {} },
      second = { session: { id: "two", name: "guest-two" }, send: () => {} },
      third = { session: { id: "three", name: "guest-three" }, send: () => {} };
    f.tables.join(table.id, 0, first);
    f.tables.join(table.id, 1, second);
    f.tables.join(table.id, 3, third);
    f.tables.leave(table.id, first);
    expect(table.host).toBe(second.session.id);
    f.tables.join(table.id, 0, first);
    f.tables.leave(table.id, second);
    expect(table.host).toBe(third.session.id);
  } finally {
    f.clean();
  }
});
