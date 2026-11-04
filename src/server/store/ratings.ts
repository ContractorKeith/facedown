import type { Database } from "bun:sqlite";
import type { GameType, Outcome } from "../../engine/core/types";
import { initial, type Rating, rateTeams } from "../../engine/rating";

type PoolRating = Rating & { type: GameType; games: number };
export class RatingStore {
  constructor(private db: Database) {}
  finish(
    id: string,
    type: GameType,
    outcome: Outcome,
    leavers: boolean[],
  ): void {
    const seats = this.db
      .query<{ account_id: string }, [string]>(
        "SELECT account_id FROM game_seats WHERE game_id=? ORDER BY seat",
      )
      .all(id);
    if (seats.length !== 4 || seats.some((s) => !s.account_id))
      throw new Error("Invalid rated seats");
    const before = seats.map((s) => this.pool(s.account_id, type));
    const after = rateTeams(before, outcome.winner, leavers);
    seats.forEach((seat, i) => {
      const old = before[i] as PoolRating,
        next = after[i] as Rating;
      this.db.run(
        `INSERT INTO ratings VALUES (?,?,?,?,?,?) ON CONFLICT(account_id,type)
        DO UPDATE SET rating=excluded.rating,rd=excluded.rd,volatility=excluded.volatility,games=excluded.games`,
        [
          seat.account_id,
          type,
          next.rating,
          next.rd,
          next.volatility,
          old.games + 1,
        ],
      );
      this.db.run("INSERT INTO rating_changes VALUES (?,?,?,?,?)", [
        id,
        seat.account_id,
        type,
        old.rating,
        next.rating,
      ]);
    });
  }
  pool(account: string, type: GameType): PoolRating {
    return (
      this.db
        .query<PoolRating, [string, string]>(
          "SELECT type,rating,rd,volatility,games FROM ratings WHERE account_id=? AND type=?",
        )
        .get(account, type) ?? { ...initial, type, games: 0 }
    );
  }
  changes(id: string) {
    return this.db
      .query<
        { username: string; type: GameType; before: number; after: number },
        [string]
      >(`SELECT a.username,c.type,c.before,c.after FROM rating_changes c
      JOIN accounts a ON a.id=c.account_id WHERE game_id=? ORDER BY a.username`)
      .all(id);
  }
  profile(account: string) {
    return {
      ratings: [this.pool(account, "spades"), this.pool(account, "dominoes")],
      games: this.db
        .query<
          {
            id: string;
            type: GameType;
            rated: number;
            finished_at: number;
            outcome_json: string;
          },
          [string]
        >(`SELECT g.id,g.type,g.rated,g.finished_at,g.outcome_json FROM games g
        JOIN game_seats s ON s.game_id=g.id WHERE s.account_id=? AND g.status='finished'
        ORDER BY g.finished_at DESC,g.id LIMIT 20`)
        .all(account)
        .map(({ outcome_json, rated, ...game }) => ({
          ...game,
          rated: !!rated,
          outcome: JSON.parse(outcome_json),
        })),
    };
  }
  leaderboard(type: GameType) {
    return this.db
      .query<
        { username: string; rating: number; rd: number; games: number },
        [string]
      >(`SELECT a.username,r.rating,r.rd,r.games FROM ratings r JOIN accounts a ON a.id=r.account_id
      WHERE r.type=? AND r.rd<150 ORDER BY r.rating DESC,r.games DESC,a.username ASC LIMIT 50`)
      .all(type);
  }
}
