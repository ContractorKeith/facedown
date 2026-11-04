import type { Database } from "bun:sqlite";
import { Fault } from "../tables/types";

export class LeaseStore {
  constructor(private db: Database) {}
  claim(holder: string, now = Date.now()): boolean {
    return (
      this.db.run(
        `INSERT INTO leases VALUES ('tables', ?, ?)
       ON CONFLICT(name) DO UPDATE SET holder=excluded.holder, heartbeat_at=excluded.heartbeat_at
       WHERE leases.heartbeat_at <= ?`,
        [holder, now, now - 20000],
      ).changes === 1
    );
  }
  owns(holder: string, now = Date.now()): boolean {
    return !!this.db
      .query(
        "SELECT 1 FROM leases WHERE name='tables' AND holder=? AND heartbeat_at>?",
      )
      .get(holder, now - 20000);
  }
  heartbeat(holder: string): boolean {
    const now = Date.now();
    return (
      this.db.run(
        "UPDATE leases SET heartbeat_at=? WHERE name='tables' AND holder=? AND heartbeat_at>?",
        [now, holder, now - 20000],
      ).changes === 1
    );
  }
  run<T>(holder: string, action: () => T): T {
    return this.db
      .transaction(() => {
        if (!this.owns(holder)) throw new Fault("unavailable");
        return action();
      })
      .immediate();
  }
  release(holder: string): void {
    this.db.run("DELETE FROM leases WHERE name='tables' AND holder=?", [
      holder,
    ]);
  }
}
