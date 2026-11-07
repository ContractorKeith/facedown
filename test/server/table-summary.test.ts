import { expect, test } from "bun:test";
import { Store } from "../../src/server/store";
import { Tables } from "../../src/server/tables";
import { FakeClock, scratch } from "./helpers";

test("summary reads open/live memory and terminal storage with no seed", () => {
  const temp = scratch(),
    store = new Store(temp.db),
    clock = new FakeClock();
  const tables = new Tables(store, clock, { turn: 10, hold: 10, bot: 0 });
  const host = { id: "host", name: "guest-host" };
  try {
    const t = tables.create("dominoes", host);
    expect(tables.summary(t.id, host)).toMatchObject({
      status: "open",
      host: true,
    });
    tables.fill(t.id, host);
    tables.start(t.id, host);
    expect(tables.summary(t.id)).toMatchObject({ status: "live", host: false });
    expect(tables.summary(t.id)).not.toHaveProperty("seed");
    clock.advance(100);
    expect(() => tables.get(t.id)).toThrow("not_found");
    expect(tables.summary(t.id)).toMatchObject({
      status: "finished",
      type: "dominoes",
    });
    store.abandon(t.id);
    expect(tables.summary(t.id).status).toBe("abandoned");
    expect(() => tables.summary("unknown")).toThrow("not_found");
  } finally {
    tables.stop();
    store.close();
    temp.clean();
  }
});
