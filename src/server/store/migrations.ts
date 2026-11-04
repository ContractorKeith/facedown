export const migrations = [
  `CREATE TABLE games (
    id TEXT PRIMARY KEY, type TEXT NOT NULL, ruleset_json TEXT NOT NULL,
    seed TEXT NOT NULL, commitment TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('live','finished')),
    rated INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL,
    finished_at INTEGER, outcome_json TEXT, host_session TEXT NOT NULL
  );
  CREATE TABLE game_seats (
    game_id TEXT NOT NULL REFERENCES games(id), seat INTEGER NOT NULL CHECK(seat BETWEEN 0 AND 3),
    account_id TEXT, guest_name TEXT, bot_at_start INTEGER NOT NULL,
    leaver INTEGER NOT NULL DEFAULT 0, session_hash TEXT,
    PRIMARY KEY(game_id, seat)
  );
  CREATE TABLE moves (
    game_id TEXT NOT NULL REFERENCES games(id), seq INTEGER NOT NULL CHECK(seq > 0),
    envelope_json TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY(game_id, seq)
  );
  CREATE TRIGGER dense_moves BEFORE INSERT ON moves BEGIN
    SELECT CASE WHEN NEW.seq <> (SELECT COALESCE(MAX(seq),0)+1 FROM moves WHERE game_id=NEW.game_id)
      THEN RAISE(ABORT, 'move sequence must be dense') END;
    SELECT CASE WHEN (SELECT status FROM games WHERE id=NEW.game_id) <> 'live'
      THEN RAISE(ABORT, 'game is finished') END;
  END;`,
] as const;
