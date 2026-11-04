import { expect, spyOn, test } from "bun:test";
import { fixture } from "../e2e/helpers";
import { FakeClock } from "./helpers";

test("a SIGSTOP-style stall demotes, closes every socket with 1012, fails health and exits", async () => {
  const time = new FakeClock();
  let wall = 0;
  time.now = () => wall;
  const exits: number[] = [];
  const f = fixture({
    leaseClock: time,
    exit: (code) => {
      exits.push(code);
    },
  });
  try {
    const { players, spectator } = await f.game("spades");
    const closed = [...players, spectator].map(
      (c) =>
        new Promise<number>((resolve) => {
          c.ws.addEventListener("close", (event) => resolve(event.code), {
            once: true,
          });
        }),
    );
    wall = 30000; // Wall time advances while JS callbacks were suspended.
    time.advance(5000);
    expect((await f.request("/healthz")).status).toBe(503);
    expect(await Promise.all(closed)).toEqual([1012, 1012, 1012, 1012, 1012]);
    await Bun.sleep(120);
    expect(exits).toEqual([1]);
    expect(f.app.tables.ready).toBe(false);
    expect(f.app.store.leases.claim("replacement", wall)).toBe(true);
  } finally {
    await f.stop();
  }
});

test("a transient heartbeat error retries without demoting an owned lease", async () => {
  const time = new FakeClock();
  const exits: number[] = [];
  const f = fixture({
    leaseClock: time,
    exit: (code) => {
      exits.push(code);
    },
  });
  const error = spyOn(console, "error").mockImplementation(() => {});
  const heartbeat = f.app.store.leases.heartbeat.bind(f.app.store.leases);
  let attempts = 0;
  spyOn(f.app.store.leases, "heartbeat").mockImplementation((...args) => {
    if (++attempts === 1) throw new Error("SQLITE_BUSY");
    return heartbeat(...args);
  });
  try {
    time.advance(5250);
    expect(attempts).toBe(2);
    expect(f.app.tables.ready).toBe(true);
    expect(exits).toEqual([]);
    expect((await f.request("/healthz")).status).toBe(200);
  } finally {
    error.mockRestore();
    await f.stop();
  }
});
