import type { Database } from "bun:sqlite";
export class GuestStore {
  constructor(private db: Database) {}
  issue(id: string, name: string, now: number, expires: number): boolean {
    return this.db
      .transaction(() => {
        this.db.run("DELETE FROM guest_sessions WHERE expires_at<=?", [now]);
        return (
          this.db.run("INSERT OR IGNORE INTO guest_sessions VALUES (?,?,?,?)", [
            id,
            name,
            now,
            expires,
          ]).changes === 1
        );
      })
      .immediate();
  }
  find(id: string, now: number): { id: string; name: string } | null {
    const row = this.db
      .query<{ name: string }, [string, number]>(
        "SELECT name FROM guest_sessions WHERE token_hash=? AND expires_at>?",
      )
      .get(id, now);
    return row ? { id, name: row.name } : null;
  }
}
