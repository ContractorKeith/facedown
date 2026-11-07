import { expect, test } from "bun:test";
import { startServer } from "../../src/server";
import { openHold, pingMS } from "../../src/server/clock";
import { Store } from "../../src/server/store";
import { removeSeat } from "../../src/server/store/testing";
import { Tables } from "../../src/server/tables";
import { Budget } from "../../src/server/ws/budget";
import { FakeClock, scratch } from "./helpers";

for (const [name, read, fallback] of [
  ["FACEDOWN_PING_MS", pingMS, 20000],
  ["FACEDOWN_OPEN_HOLD_MS", openHold, 600000],
] as const)
  test(`${name} validates timers`, () => {
    const old = process.env[name];
    try {
      delete process.env[name];
      expect(read()).toBe(fallback);
      for (const value of ["0", "-5", "abc", "1.5"]) {
        process.env[name] = value;
        expect(read).toThrow(`Invalid ${name}`);
      }
    } finally {
      if (old === undefined) delete process.env[name];
      else process.env[name] = old;
    }
  });

test("server rejects invalid ping configuration before opening a listener", async () => {
  const old = process.env.FACEDOWN_PING_MS;
  try {
    for (const value of ["0", "-5", "abc"]) {
      process.env.FACEDOWN_PING_MS = value;
      let app: ReturnType<typeof startServer> | undefined;
      try {
        expect(() => {
          app = startServer({ port: 0, db: ":memory:" });
        }).toThrow("Invalid FACEDOWN_PING_MS");
      } finally {
        await app?.stop();
      }
    }
  } finally {
    if (old === undefined) delete process.env.FACEDOWN_PING_MS;
    else process.env.FACEDOWN_PING_MS = old;
  }
});

test("rebuild abandons a live game with a missing seat", () => {
  const temp = scratch(),
    store = new Store(temp.db),
    clock = new FakeClock();
  let tables = new Tables(store, clock);
  try {
    const host = { id: "host", name: "guest-host" },
      t = tables.create("spades", host);
    tables.fill(t.id, host);
    tables.start(t.id, host);
    tables.stop();
    removeSeat(temp.db, t.id);
    tables = new Tables(store, clock);
    expect(store.gameStatus(t.id)).toBe("abandoned");
    expect(() => tables.get(t.id)).toThrow("not_found");
  } finally {
    tables.stop();
    store.close();
    temp.clean();
  }
});

test("move budget permits ten-move bursts but limits the eleventh", () => {
  const budget = new Budget();
  for (let i = 0; i < 10; i++) expect(budget.acceptMove(0)).toBe("ok");
  expect(budget.acceptMove(0)).toBe("limited");
  expect(budget.acceptMove(1000)).toBe("ok");
});
