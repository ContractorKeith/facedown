import { expect, test } from "bun:test";
import { Store } from "../../src/server/store";
import { scratch } from "./helpers";

test("empty database migrates, reopens without changes, enforces dense seq and atomic finish", () => {
  const temp = scratch();
  let store = new Store(temp.db);
  try {
    expect(store.listLive()).toEqual([]);
    store.createGame({
      id: "abcdefghij",
      type: "spades",
      seed: "0".repeat(64),
      commitment: "hash",
      ruleset: {},
      host: "host",
      created: 0,
      seats: [],
    });
    const move = { seat: 0, timeout: true } as const;
    expect(() => store.appendMove("abcdefghij", 2, move, 0)).toThrow();
    store.appendMove("abcdefghij", 1, move, 0);
    expect(() => store.appendMove("abcdefghij", 1, move, 0)).toThrow();
    expect(() => store.appendMove("abcdefghij", 3, move, 0)).toThrow();
    store.close();
    store = new Store(temp.db);
    expect(store.loadGame("abcdefghij")?.moves).toEqual([move]);
    store.appendMove("abcdefghij", 2, move, 1, {
      outcome: { winner: 0, scores: [500, 0] },
      leavers: [],
    });
    expect(store.listLive()).toEqual([]);
    expect(store.loadGame("abcdefghij")?.outcome).toEqual({
      winner: 0,
      scores: [500, 0],
    });
    expect(() => store.appendMove("abcdefghij", 3, move, 2)).toThrow();
  } finally {
    store.close();
    temp.clean();
  }
});
