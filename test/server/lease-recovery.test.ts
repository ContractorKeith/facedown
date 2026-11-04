import { expect, spyOn, test } from "bun:test";
import { TableLease } from "../../src/server/lease";
import { Store } from "../../src/server/store";
import { FakeClock, scratch } from "./helpers";

test("busy claim is retried until the waiting instance acquires", () => {
  const store = new Store(":memory:"),
    time = new FakeClock();
  const claim = store.leases.claim.bind(store.leases);
  let attempts = 0,
    acquired = 0,
    lost = 0;
  const warn = spyOn(console, "error").mockImplementation(() => {});
  spyOn(store.leases, "claim").mockImplementation((holder, now) => {
    if (++attempts < 3) throw new Error("SQLITE_BUSY");
    return claim(holder, now);
  });
  let lease: TableLease | undefined;
  try {
    expect(() => {
      lease = new TableLease(
        store,
        () => {
          acquired++;
        },
        () => {
          lost++;
        },
        time,
      );
    }).not.toThrow();
    time.advance(500);
    expect(acquired).toBe(1);
    expect(lease?.ready).toBe(true);
    expect(lost).toBe(0);
  } finally {
    lease?.stop();
    store.close();
    warn.mockRestore();
  }
});

test("heartbeat protects a slow asynchronous rebuild without holding a write transaction", async () => {
  const temp = scratch(),
    a = new Store(temp.db),
    b = new Store(temp.db),
    time = new FakeClock();
  let finish!: () => void;
  const rebuilt = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const lease = new TableLease(
    a,
    () => {
      expect(b.leases.claim("probe-during-rebuild", time.now())).toBe(false);
      return rebuilt;
    },
    () => {
      throw new Error("lost during rebuild");
    },
    time,
  );
  try {
    time.advance(25000);
    expect(b.leases.claim("competitor", time.now())).toBe(false);
    expect(lease.ready).toBe(false);
    finish();
    await Promise.resolve();
    expect(lease.ready).toBe(true);
  } finally {
    lease.stop();
    a.close();
    b.close();
    temp.clean();
  }
});
