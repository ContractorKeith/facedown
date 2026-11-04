import { expect, test } from "bun:test";
import { Store } from "../../src/server/store";
import { Tables } from "../../src/server/tables";
import { FakeClock, scratch } from "./helpers";

test("200 open tables globally; lobby keeps the newest 50 open and 50 live", () => {
  const temp = scratch(),
    store = new Store(temp.db),
    clock = new FakeClock();
  const tables = new Tables(store, clock);
  try {
    const live: string[] = [],
      open: string[] = [];
    for (let i = 0; i < 55; i++) {
      const host = { id: `live-${i}`, name: `player-${i}` };
      const t = tables.create("spades", host);
      live.push(t.id);
      tables.fill(t.id, host);
      tables.start(t.id, host);
      clock.time++;
    }
    for (let i = 0; i < 200; i++) {
      const t = tables.create("spades", {
        id: `open-${i}`,
        name: `player-${i}`,
      });
      open.push(t.id);
      clock.time++;
    }
    expect(() =>
      tables.create("spades", { id: "overflow", name: "extra" }),
    ).toThrow("busy");
    const lobby = tables.list();
    expect(lobby).toHaveLength(100);
    expect(lobby.filter((t) => t.status === "open").map((t) => t.id)).toEqual(
      open.slice(-50).reverse(),
    );
    expect(lobby.filter((t) => t.status === "live").map((t) => t.id)).toEqual(
      live.slice(-50).reverse(),
    );
  } finally {
    tables.stop();
    store.close();
    temp.clean();
  }
});
