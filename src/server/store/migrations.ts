export const migrations = [
  `CREATE TABLE games (
    id TEXT PRIMARY KEY, type TEXT NOT NULL, ruleset_json TEXT NOT NULL,
    seed TEXT NOT NULL, commitment TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('live','finished','abandoned')),
    rated INTEGER NOT NULL DEFAULT 0, casual INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL,
    finished_at INTEGER, outcome_json TEXT, host_session TEXT NOT NULL
  );
  CREATE TABLE guest_sessions (
    token_hash TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
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
  `CREATE TABLE accounts (
    id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), expires_at INTEGER NOT NULL
  );
  CREATE TABLE ratings (
    account_id TEXT NOT NULL REFERENCES accounts(id), type TEXT NOT NULL,
    rating REAL NOT NULL, rd REAL NOT NULL, volatility REAL NOT NULL, games INTEGER NOT NULL,
    PRIMARY KEY(account_id,type)
  );
  CREATE TABLE rating_changes (
    game_id TEXT NOT NULL REFERENCES games(id), account_id TEXT NOT NULL REFERENCES accounts(id),
    type TEXT NOT NULL, before REAL NOT NULL, after REAL NOT NULL,
    PRIMARY KEY(game_id,account_id)
  );
  CREATE INDEX sessions_expiry ON sessions(expires_at);
  CREATE INDEX player_games ON game_seats(account_id,game_id);`,
  `CREATE TABLE leases (name TEXT PRIMARY KEY, holder TEXT NOT NULL, heartbeat_at INTEGER NOT NULL);`,
] as const;
