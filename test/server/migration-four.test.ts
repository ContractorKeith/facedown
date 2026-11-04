import { expect, test } from "bun:test";
import { commitment } from "../../src/engine/core/random";
import { spades } from "../../src/engine/spades";
import { Store } from "../../src/server/store";
import { versionThree } from "../../src/server/store/testing";
import { Tables } from "../../src/server/tables";
import { FakeClock, scratch } from "./helpers";

test("v3 schema from c4be160 migrates bot flags and rebuild accepts reordered ruleset keys", () => {
  const temp = scratch(),
    seed = "0".repeat(64);
  const reordered = Object.fromEntries(
    Object.entries(spades.ruleset).reverse(),
  );
  versionThree(temp.db, {
    ruleset: reordered,
    seed,
    commitment: commitment(seed),
  });
  const store = new Store(temp.db),
    clock = new FakeClock(),
    tables = new Tables(store, clock);
  try {
    const table = tables.get("old");
    expect(table.status).toBe("live");
    expect(table.seats.map((s) => s?.bot)).toEqual([false, true, true, true]);
    expect(store.loadGame("old")?.seats.map((s) => s.botNow)).toEqual([
      false,
      true,
      true,
      true,
    ]);
    tables.lifecycle.apply(table, { seat: 1, timeout: true });
    expect(table.seq).toBe(1);
  } finally {
    tables.stop();
    store.close();
    temp.clean();
  }
});
