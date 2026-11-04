import { Database } from "bun:sqlite";
import type {
  Envelope,
  GameType,
  Outcome,
  Seat,
} from "../../engine/core/types";
import { migrations } from "./migrations";

export type StoredSeat = {
  seat: Seat;
  session: string | null;
  name: string | null;
  bot: boolean;
  leaver: boolean;
};
export type GameRecord = {
  id: string;
  type: GameType;
  ruleset: unknown;
  seed: string;
  commitment: string;
  host: string;
  created: number;
  status: "live" | "finished";
  seats: StoredSeat[];
  moves: Envelope<unknown>[];
  outcome: Outcome | null;
};
type Row = {
  id: string;
  type: GameType;
  ruleset_json: string;
  seed: string;
  commitment: string;
  host_session: string;
  created_at: number;
  status: GameRecord["status"];
  outcome_json: string | null;
};
export class Store {
  private db: Database;
  constructor(path = process.env.FACEDOWN_DB ?? "./facedown.db") {
    this.db = new Database(path, { create: true, strict: true });
    try {
      this.db.exec(
        "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;",
      );
      this.db
        .transaction(() => {
          const version =
            this.db
              .query<{ user_version: number }, []>("PRAGMA user_version")
              .get()?.user_version ?? 0;
          if (version > migrations.length)
            throw new Error("Database is newer than server");
          for (const [index, sql] of migrations.entries()) {
            if (index < version) continue;
            this.db.exec(sql);
            this.db.exec(`PRAGMA user_version=${index + 1}`);
          }
        })
        .immediate();
    } catch (error) {
      this.db.close();
      throw error;
    }
  }
  createGame(record: Omit<GameRecord, "moves" | "outcome" | "status">): void {
    this.db
      .transaction(() => {
        this.db.run(
          "INSERT INTO games(id,type,ruleset_json,seed,commitment,status,created_at,host_session) VALUES (?,?,?,?,?,'live',?,?)",
          [
            record.id,
            record.type,
            JSON.stringify(record.ruleset),
            record.seed,
            record.commitment,
            record.created,
            record.host,
          ],
        );
        for (const seat of record.seats)
          this.db.run(
            "INSERT INTO game_seats(game_id,seat,guest_name,bot_at_start,leaver,session_hash) VALUES (?,?,?,?,?,?)",
            [
              record.id,
              seat.seat,
              seat.name,
              Number(seat.bot),
              Number(seat.leaver),
              seat.session,
            ],
          );
      })
      .immediate();
  }
  // A terminal move and its outcome commit together, including leaver flags.
  appendMove(
    id: string,
    seq: number,
    envelope: Envelope<unknown>,
    at: number,
    finish?: { outcome: Outcome; leavers: boolean[] },
  ): void {
    this.db
      .transaction(() => {
        this.db.run("INSERT INTO moves VALUES (?,?,?,?)", [
          id,
          seq,
          JSON.stringify(envelope),
          at,
        ]);
        if (finish) this.finishGame(id, finish.outcome, finish.leavers, at);
      })
      .immediate();
  }
  finishGame(
    id: string,
    outcome: Outcome,
    leavers: boolean[],
    at: number,
  ): void {
    this.db
      .transaction(() => {
        this.db.run(
          "UPDATE games SET status='finished',outcome_json=?,finished_at=? WHERE id=?",
          [JSON.stringify(outcome), at, id],
        );
        leavers.forEach((leaver, seat) => {
          this.db.run(
            "UPDATE game_seats SET leaver=? WHERE game_id=? AND seat=?",
            [Number(leaver), id, seat],
          );
        });
      })
      .immediate();
  }
  loadGame(id: string): GameRecord | null {
    const row = this.db
      .query<Row, [string]>("SELECT * FROM games WHERE id=?")
      .get(id);
    if (!row) return null;
    const seats = this.db
      .query<
        {
          seat: Seat;
          session_hash: string | null;
          guest_name: string | null;
          bot_at_start: number;
          leaver: number;
        },
        [string]
      >("SELECT * FROM game_seats WHERE game_id=? ORDER BY seat")
      .all(id)
      .map((s) => ({
        seat: s.seat,
        session: s.session_hash,
        name: s.guest_name,
        bot: !!s.bot_at_start,
        leaver: !!s.leaver,
      }));
    const moves = this.db
      .query<{ envelope_json: string }, [string]>(
        "SELECT envelope_json FROM moves WHERE game_id=? ORDER BY seq",
      )
      .all(id)
      .map((m) => JSON.parse(m.envelope_json) as Envelope<unknown>);
    return {
      id,
      type: row.type,
      ruleset: JSON.parse(row.ruleset_json),
      seed: row.seed,
      commitment: row.commitment,
      host: row.host_session,
      created: row.created_at,
      status: row.status,
      seats,
      moves,
      outcome: row.outcome_json ? JSON.parse(row.outcome_json) : null,
    };
  }
  listLive(): GameRecord[] {
    return this.db
      .query<{ id: string }, []>("SELECT id FROM games WHERE status='live'")
      .all()
      .map(({ id }) => this.loadGame(id) as GameRecord);
  }
  close(): void {
    this.db.close();
  }
}
