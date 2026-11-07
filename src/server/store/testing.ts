import { Database } from "bun:sqlite";
import { migrations } from "./migrations";
// Intentional disk damage for boot regression tests. Never imported by the server.
export function corruptMove(
  path: string,
  id: string,
  kind: "null" | "illegal" | "gap" | "json",
): void {
  const db = new Database(path);
  try {
    if (kind === "gap")
      db.run("UPDATE moves SET seq=100 WHERE game_id=? AND seq=1", [id]);
    else
      db.run("UPDATE moves SET envelope_json=? WHERE game_id=? AND seq=1", [
        kind === "null"
          ? "null"
          : kind === "json"
            ? "{"
            : JSON.stringify({ seat: 1, move: { bid: 99 } }),
        id,
      ]);
  } finally {
    db.close();
  }
}

// Build an actual version-one database before testing the additive migration.
export function versionOne(path: string): void {
  const db = new Database(path);
  try {
    db.exec(migrations[0]);
    db.exec("PRAGMA user_version=1");
    for (const status of ["live", "finished", "abandoned"]) {
      db.run(
        `INSERT INTO games(id,type,ruleset_json,seed,commitment,status,created_at,host_session)
        VALUES (?,'spades','{}',?,'commitment',?,1,'host')`,
        [status, "0".repeat(64), status],
      );
      db.run(
        "INSERT INTO game_seats VALUES (?,0,NULL,'guest-old',0,0,'guest-token')",
        [status],
      );
    }
    db.run("INSERT INTO moves VALUES ('live',1,?,1)", [
      JSON.stringify({ seat: 0, timeout: true }),
    ]);
    db.run(
      "INSERT INTO guest_sessions VALUES ('guest-token','guest-old',0,99999)",
    );
  } finally {
    db.close();
  }
}
export function seedRating(
  path: string,
  account: string,
  rating: number,
  rd: number,
  games: number,
): void {
  const db = new Database(path);
  try {
    db.run("INSERT INTO ratings VALUES (?,'spades',?,?,0.06,?)", [
      account,
      rating,
      rd,
      games,
    ]);
  } finally {
    db.close();
  }
}
export function sessionHashes(path: string): string[] {
  const db = new Database(path);
  try {
    return db
      .query<{ token_hash: string }, []>("SELECT token_hash FROM sessions")
      .all()
      .map((s) => s.token_hash);
  } finally {
    db.close();
  }
}

// Immutable v3 schema used by c4be160, before bot_now existed.
export function versionThree(
  path: string,
  game: { ruleset: unknown; seed: string; commitment: string },
): void {
  const db = new Database(path);
  try {
    for (const migration of migrations.slice(0, 3)) db.exec(migration);
    db.exec("PRAGMA user_version=3");
    db.run(
      "INSERT INTO games(id,type,ruleset_json,seed,commitment,status,created_at,host_session) VALUES ('old','spades',?,?,?,'live',1,'host')",
      [JSON.stringify(game.ruleset), game.seed, game.commitment],
    );
    for (let seat = 0; seat < 4; seat++)
      db.run("INSERT INTO game_seats VALUES (?, ?, NULL, ?, ?, 0, ?)", [
        "old",
        seat,
        `guest-${seat}`,
        Number(seat > 0),
        seat === 0 ? "host" : null,
      ]);
  } finally {
    db.close();
  }
}

export function removeSeat(path: string, id: string): void {
  const db = new Database(path);
  try {
    db.run("DELETE FROM game_seats WHERE game_id=? AND seat=3", [id]);
  } finally {
    db.close();
  }
}
