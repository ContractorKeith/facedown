import { Database } from "bun:sqlite";
import type { Envelope, Outcome, Seat } from "../../engine/core/types";
import type { Session } from "../http/sessions";
import { AccountStore } from "./accounts";
import { GuestStore } from "./guests";
import { LeaseStore } from "./leases";
import { migrate } from "./migrate";
import { RatingStore } from "./ratings";
import { storedSummary } from "./summary";
import type { GameRecord, Row } from "./types";

export type { GameRecord, StoredSeat } from "./types";

export class Store {
  private db: Database;
  readonly leases: LeaseStore;
  readonly guests: GuestStore;
  readonly accounts: AccountStore;
  readonly ratings: RatingStore;
  constructor(path = process.env.FACEDOWN_DB ?? "./facedown.db") {
    this.db = new Database(path, { create: true, strict: true });
    this.leases = new LeaseStore(this.db);
    this.guests = new GuestStore(this.db);
    this.accounts = new AccountStore(this.db);
    this.ratings = new RatingStore(this.db);
    try {
      this.db.exec(
        "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;",
      );
      migrate(this.db);
    } catch (error) {
      this.db.close();
      throw error;
    }
  }
  createGame(
    record: Omit<GameRecord, "moves" | "outcome" | "status" | "rated"> & {
      rated?: boolean;
    },
  ): void {
    this.db
      .transaction(() => {
        this.db.run(
          "INSERT INTO games(id,type,ruleset_json,seed,commitment,status,created_at,host_session,casual,rated) VALUES (?,?,?,?,?,'live',?,?,?,?)",
          [
            record.id,
            record.type,
            JSON.stringify(record.ruleset),
            record.seed,
            record.commitment,
            record.created,
            record.host,
            Number(record.casual),
            Number(record.rated ?? false),
          ],
        );
        for (const seat of record.seats)
          this.db.run(
            "INSERT INTO game_seats(game_id,seat,guest_name,bot_at_start,leaver,session_hash,account_id,bot_now) VALUES (?,?,?,?,?,?,?,?)",
            [
              record.id,
              seat.seat,
              seat.accountId ? null : seat.name,
              Number(seat.bot),
              Number(seat.leaver),
              seat.session,
              seat.accountId ?? null,
              Number(seat.bot),
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
        const game = this.db
          .query<
            { type: GameRecord["type"]; rated: number; status: string },
            [string]
          >("SELECT type,rated,status FROM games WHERE id=?")
          .get(id);
        if (game?.status !== "live") throw new Error("Game is not live");
        this.db.run(
          "UPDATE games SET status='finished',outcome_json=?,finished_at=? WHERE id=?",
          [JSON.stringify(outcome), at, id],
        );
        if (game.rated) this.ratings.finish(id, game.type, outcome, leavers);
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
          account_id: string | null;
          session_hash: string | null;
          guest_name: string | null;
          bot_at_start: number;
          bot_now: number;
          leaver: number;
        },
        [string]
      >(
        `SELECT s.*,COALESCE(a.username,s.guest_name) AS guest_name FROM game_seats s LEFT JOIN accounts a ON a.id=s.account_id WHERE s.game_id=? ORDER BY s.seat`,
      )
      .all(id)
      .map((s) => ({
        seat: s.seat,
        accountId: s.account_id,
        session: s.session_hash,
        name: s.guest_name,
        bot: !!s.bot_at_start,
        botNow: !!s.bot_now,
        leaver: !!s.leaver,
      }));
    const moves = this.db
      .query<{ seq: number; envelope_json: string }, [string]>(
        "SELECT seq, envelope_json FROM moves WHERE game_id=? ORDER BY seq",
      )
      .all(id)
      .map((m, index) => {
        if (m.seq !== index + 1) throw new Error("Move sequence is not dense");
        return JSON.parse(m.envelope_json) as Envelope<unknown>;
      });
    return {
      id,
      casual: !!row.casual,
      rated: !!row.rated,
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
  summary(id: string, session: Session | null) {
    return storedSummary(this.db, id, session);
  }
  listLiveIds(): string[] {
    return this.db
      .query<{ id: string }, []>("SELECT id FROM games WHERE status='live'")
      .all()
      .map((r) => r.id);
  }
  listLive(): GameRecord[] {
    return this.listLiveIds().map((id) => this.loadGame(id) as GameRecord);
  }
  gameStatus(id: string): GameRecord["status"] | null {
    return (
      this.db
        .query<{ status: GameRecord["status"] }, [string]>(
          "SELECT status FROM games WHERE id=?",
        )
        .get(id)?.status ?? null
    );
  }
  setBot(id: string, seat: number, bot: boolean): void {
    this.db.run("UPDATE game_seats SET bot_now=? WHERE game_id=? AND seat=?", [
      Number(bot),
      id,
      seat,
    ]);
  }
  abandon(id: string): void {
    this.db.run("UPDATE games SET status='abandoned' WHERE id=?", [id]);
  }
  close(): void {
    this.db.close();
  }
}
