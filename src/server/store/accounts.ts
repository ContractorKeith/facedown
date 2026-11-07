import type { Database } from "bun:sqlite";
import type { Session } from "../http/sessions";
export type Account = { id: string; username: string; password_hash: string };
export class AccountStore {
  constructor(private db: Database) {}
  create(id: string, username: string, hash: string, now: number): boolean {
    return (
      this.db.run("INSERT OR IGNORE INTO accounts VALUES (?,?,?,?)", [
        id,
        username,
        hash,
        now,
      ]).changes === 1
    );
  }
  find(username: string): Account | null {
    return this.db
      .query<Account, [string]>(
        "SELECT id,username,password_hash FROM accounts WHERE username=?",
      )
      .get(username);
  }
  issue(hash: string, account: string, expires: number, now: number): string[] {
    return this.db
      .transaction(() => {
        this.db.run("DELETE FROM sessions WHERE expires_at<=?", [now]);
        this.db.run("INSERT INTO sessions VALUES (?,?,?)", [
          hash,
          account,
          expires,
        ]);
        // SQLite rowid preserves issuance order, including equal expiry times.
        const revoked = this.db
          .query<{ token_hash: string }, [string]>(
            "SELECT token_hash FROM sessions WHERE account_id=? ORDER BY rowid DESC LIMIT -1 OFFSET 10",
          )
          .all(account);
        for (const row of revoked) this.revoke(row.token_hash);
        return revoked.map((row) => row.token_hash);
      })
      .immediate();
  }
  transferGuest(previous: string, next: Session): void {
    this.db
      .transaction(() => {
        this.db.run(
          `UPDATE game_seats SET session_hash=?,account_id=?,guest_name=NULL
        WHERE session_hash=? AND account_id IS NULL AND game_id IN (SELECT id FROM games WHERE status='live')`,
          [next.id, next.accountId ?? null, previous],
        );
        this.db.run(
          "UPDATE games SET host_session=? WHERE host_session=? AND status='live'",
          [next.id, previous],
        );
        this.db.run("DELETE FROM guest_sessions WHERE token_hash=?", [
          previous,
        ]);
      })
      .immediate();
  }
  resolve(hash: string, now: number): Session | null {
    return this.db
      .query<
        Session,
        [string, number]
      >(`SELECT s.token_hash AS id,a.username AS name,a.id AS accountId
      FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE token_hash=? AND expires_at>?`)
      .get(hash, now);
  }
  revoke(hash: string): void {
    this.db.run("DELETE FROM sessions WHERE token_hash=?", [hash]);
    this.db.run("DELETE FROM guest_sessions WHERE token_hash=?", [hash]);
  }
}
