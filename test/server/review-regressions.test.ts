import { expect, test } from "bun:test";
import { GuestSessions } from "../../src/server/http/sessions";
import { Store } from "../../src/server/store";
import { Tables } from "../../src/server/tables";
import { FakeClock, scratch } from "./helpers";

test("unissued guest bearer tokens are rejected", () => {
  // The resolver must consult issued sessions, rather than trusting token shape.
  const temp = scratch(),
    store = new Store(temp.db),
    sessions = new GuestSessions(store, true);
  try {
    expect(
      sessions.resolve(
        new Request("http://localhost/api/me", {
          headers: { cookie: `fd=${"a".repeat(64)}` },
        }),
      ),
    ).toBe(null);
  } finally {
    store.close();
    temp.clean();
  }
});

test("last socket leaving an open table frees its seat and transfers host", () => {
  const temp = scratch(),
    store = new Store(temp.db),
    clock = new FakeClock(),
    tables = new Tables(store, clock);
  const host = { id: "host", name: "guest-host" },
    next = { id: "next", name: "guest-next" };
  const peer = { session: host, send: () => {} },
    other = { session: next, send: () => {} };
  try {
    const table = tables.create("spades", host);
    tables.join(table.id, 0, peer);
    tables.join(table.id, 1, other);
    tables.leave(table.id, peer);
    expect(table.seats[0]).toBe(null);
    expect(table.host).toBe(next.id);
    tables.disconnect(other);
    expect(() => tables.get(table.id)).toThrow("not_found");
  } finally {
    tables.stop();
    store.close();
    temp.clean();
  }
});
