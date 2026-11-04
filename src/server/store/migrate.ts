import type { Database } from "bun:sqlite";
import { migrations } from "./migrations";
export function migrate(db: Database): void {
  db.transaction(() => {
    const version =
      db.query<{ user_version: number }, []>("PRAGMA user_version").get()
        ?.user_version ?? 0;
    if (version > migrations.length)
      throw new Error("Database is newer than server");
    for (const [index, sql] of migrations.entries()) {
      if (index < version) continue;
      db.exec(sql);
      db.exec(`PRAGMA user_version=${index + 1}`);
    }
  }).immediate();
}
