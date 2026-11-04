import { expect, spyOn, test } from "bun:test";
import { canonicalJSON } from "../../src/engine/core/log-hash";
import { sha256 } from "../../src/engine/core/sha256";
import { Store } from "../../src/server/store";
import { Tables } from "../../src/server/tables";
import { FakeClock, scratch } from "./helpers";

for (const type of ["spades", "dominoes"] as const)
  test(`${type} wire extends every hash using lastMove without rereading storage`, () => {
    const temp = scratch(),
      store = new Store(temp.db),
      clock = new FakeClock();
    const tables = new Tables(store, clock, { turn: 1, hold: 1, bot: 1 });
    const reads = spyOn(store, "loadGame");
    try {
      const host = { id: "host", name: "guest-host" };
      const table = tables.create(type, host);
      let previous = "",
        seq = -1;
      tables.spectate(table.id, {
        session: { id: "watch", name: "spectator" },
        send(raw) {
          const m = raw as Record<string, unknown>;
          if (m.t !== "view" || m.status === "open") return;
          expect(m.you).toBeNull();
          if (m.seq === 0) {
            expect(m.lastMove).toBeNull();
            expect(m.logHash).toBe(m.commitment);
            previous = m.commitment as string;
          } else if (m.seq !== seq) {
            expect(m.seq).toBe(seq + 1);
            expect(m.logHash).toBe(
              sha256(`${previous}:${canonicalJSON(m.lastMove)}`),
            );
            previous = m.logHash as string;
          }
          seq = m.seq as number;
        },
      });
      tables.fill(table.id, host);
      tables.start(table.id, host);
      clock.advance(20000);
      expect(table.status).toBe("finished");
      expect(seq).toBeGreaterThan(0);
      expect(reads).not.toHaveBeenCalled();
    } finally {
      reads.mockRestore();
      tables.stop();
      store.close();
      temp.clean();
    }
  });
