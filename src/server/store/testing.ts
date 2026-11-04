import { Database } from "bun:sqlite";
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
