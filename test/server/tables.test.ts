import { expect, test } from "bun:test";
import { fold } from "../../src/engine/core/fold";
import { Store } from "../../src/server/store";
import { Tables } from "../../src/server/tables";
import type { Peer } from "../../src/server/tables/types";
import { FakeClock, scratch } from "./helpers";

test("host rules, last-socket hold, timeout, takeover, reclaim, and cancellation", () => {
  const temp = scratch(),
    store = new Store(temp.db),
    clock = new FakeClock();
  const tables = new Tables(store, clock, { turn: 10, hold: 25, bot: 1 });
  const host = { id: "host", name: "guest-host" };
  const peer: Peer = { session: host, send: () => {} };
  const second: Peer = { ...peer };
  try {
    const table = tables.create("spades", host);
    expect(() => tables.start(table.id, host)).toThrow("bad_request");
    expect(() => tables.fill(table.id, { id: "other", name: "other" })).toThrow(
      "forbidden",
    );
    tables.fill(table.id, host);
    tables.join(table.id, 0, peer);
    tables.join(table.id, 0, second);
    tables.start(table.id, host);
    tables.disconnect(peer);
    clock.advance(3); // Three bots bid, then the human is up.
    expect(table.game.toAct(table.state)).toBe(0);
    clock.advance(10);
    expect(store.loadGame(table.id)?.moves.some((e) => "timeout" in e)).toBe(
      true,
    );
    tables.disconnect(second);
    clock.advance(24);
    expect(table.seats[0]?.bot).toBe(false);
    clock.advance(1);
    expect(table.seats[0]?.bot).toBe(true);
    tables.join(table.id, 0, peer);
    expect(table.seats[0]?.bot).toBe(false);
    clock.advance(1);
    const record = store.loadGame(table.id);
    if (!record) throw new Error("missing game");
    const rebuilt = fold(table.game, record.seed, record.moves);
    expect(rebuilt.ok && rebuilt.state).toEqual(table.state);
    tables.stop();
    expect(clock.pending).toBe(0);
  } finally {
    tables.stop();
    store.close();
    temp.clean();
  }
});

test("finishing while bot-held records a leaver and prevents reclaim", () => {
  const temp = scratch(),
    store = new Store(temp.db),
    clock = new FakeClock();
  const tables = new Tables(store, clock, { turn: 2, hold: 1, bot: 0 });
  try {
    const session = { id: "host", name: "guest-host" };
    const table = tables.create("dominoes", session);
    tables.fill(table.id, session);
    tables.start(table.id, session);
    clock.advance(1);
    expect(table.status).toBe("finished");
    expect(store.loadGame(table.id)?.seats[0]?.leaver).toBe(true);
    expect(() => tables.join(table.id, 0, { session, send: () => {} })).toThrow(
      "forbidden",
    );
  } finally {
    tables.stop();
    store.close();
    temp.clean();
  }
});

test("persistence failure leaves state, sequence and broadcasts unchanged", () => {
  const temp = scratch(),
    clock = new FakeClock();
  class FailingStore extends Store {
    override appendMove(): void {
      throw new Error("disk unavailable");
    }
  }
  const store = new FailingStore(temp.db),
    tables = new Tables(store, clock, { turn: 10, hold: 100, bot: 1 });
  try {
    const host = { id: "host", name: "guest-host" };
    const table = tables.create("spades", host),
      sent: unknown[] = [];
    tables.fill(table.id, host);
    tables.join(table.id, 0, {
      session: host,
      send: (m) => {
        sent.push(m);
      },
    });
    tables.start(table.id, host);
    const state = structuredClone(table.state),
      count = sent.length;
    expect(() =>
      tables.lifecycle.apply(table, { seat: 1, timeout: true }),
    ).toThrow("disk unavailable");
    expect(table.state).toEqual(state);
    expect(table.seq).toBe(0);
    expect(sent.length).toBe(count);
    expect(store.loadGame(table.id)?.moves).toEqual([]);
  } finally {
    tables.stop();
    store.close();
    temp.clean();
  }
});
