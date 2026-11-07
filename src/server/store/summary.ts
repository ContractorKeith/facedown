import type { Database } from "bun:sqlite";
import type { GameType } from "../../engine/core/types";
import type { Session } from "../http/sessions";

export function storedSummary(
  db: Database,
  id: string,
  session: Session | null,
) {
  const row = db
    .query<
      { type: GameType; status: string; rated: number; host_session: string },
      [string]
    >(
      "SELECT type,status,rated,host_session FROM games WHERE id=? AND status IN ('finished','abandoned')",
    )
    .get(id);
  if (!row) return null;
  const seats = db
    .query<
      {
        name: string;
        bot: number;
        account_id: string | null;
        session_hash: string | null;
      },
      [string]
    >(
      `SELECT COALESCE(a.username,s.guest_name,'bot') AS name,s.bot_now AS bot,s.account_id,s.session_hash
     FROM game_seats s LEFT JOIN accounts a ON a.id=s.account_id WHERE s.game_id=? ORDER BY seat`,
    )
    .all(id);
  return {
    id,
    type: row.type,
    status: row.status,
    rated: !!row.rated,
    seats: seats.map((s) => ({ name: s.name, bot: !!s.bot, connected: false })),
    host:
      !!session &&
      (row.host_session === session.id ||
        seats.some(
          (s) =>
            s.session_hash === row.host_session &&
            !!session.accountId &&
            s.account_id === session.accountId,
        )),
  };
}
