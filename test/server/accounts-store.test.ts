import { expect, test } from "bun:test";
import { commitment } from "../../src/engine/core/random";
import { GuestSessions } from "../../src/server/http/sessions";
import { Store } from "../../src/server/store";
import {
  seedRating,
  sessionHashes,
  versionOne,
} from "../../src/server/store/testing";
import { scratch } from "./helpers";

test("migration two preserves version-one live, finished, abandoned games and guests", () => {
  const temp = scratch();
  versionOne(temp.db);
  const store = new Store(temp.db);
  try {
    for (const status of ["live", "finished", "abandoned"] as const) {
      const game = store.loadGame(status);
      expect(game?.status).toBe(status);
      expect(game?.rated).toBe(false);
      expect(game?.seats[0]).toMatchObject({
        name: "guest-old",
        session: "guest-token",
        accountId: null,
      });
    }
    expect(store.loadGame("live")?.moves).toEqual([{ seat: 0, timeout: true }]);
    expect(store.guests.find("guest-token", 1)?.name).toBe("guest-old");
    expect(store.accounts.create("account", "keith", "hash", 0)).toBe(true);
  } finally {
    store.close();
    temp.clean();
  }
});
test("account tokens are hashed at rest and secure cookies expire after seven days", () => {
  const temp = scratch(),
    store = new Store(temp.db);
  try {
    store.accounts.create("account", "keith", "hash", 0);
    const sessions = new GuestSessions(store, false, () => 0),
      issued = sessions.account("account");
    const token = issued.cookie.split(";")[0]?.split("=")[1] as string;
    expect(issued.cookie).toContain("__Host-fd=");
    expect(issued.cookie).toContain("Secure");
    expect(issued.cookie).toContain(
      "HttpOnly; SameSite=Strict; Path=/; Max-Age=604800",
    );
    expect(sessionHashes(temp.db)).toEqual([commitment(token)]);
    expect(store.accounts.resolve(commitment(token), 604800000)).toBe(null);
    sessions.logout(issued.session);
    expect(sessions.active(issued.session)).toBe(false);
  } finally {
    store.close();
    temp.clean();
  }
});
test("leaderboard filters provisional players, sorts ties, and caps at fifty", () => {
  const temp = scratch(),
    store = new Store(temp.db);
  try {
    for (let i = 0; i < 55; i++) {
      const id = String(i).padStart(2, "0");
      store.accounts.create(id, `player_${id}`, "hash", 0);
      seedRating(temp.db, id, 1600, i === 0 ? 150 : 100, i === 1 ? 20 : 10);
    }
    const board = store.ratings.leaderboard("spades");
    expect(board).toHaveLength(50);
    expect(board[0]).toEqual({
      username: "player_01",
      rating: 1600,
      rd: 100,
      games: 20,
    });
    expect(board[1]?.username).toBe("player_02");
    expect(board.some((p) => p.username === "player_00")).toBe(false);
    expect(store.ratings.leaderboard("dominoes")).toEqual([]);
  } finally {
    store.close();
    temp.clean();
  }
});
test("rating failure rolls back terminal move and outcome; finished games cannot rate twice", () => {
  const temp = scratch(),
    store = new Store(temp.db);
  try {
    store.createGame({
      id: "broken",
      type: "spades",
      seed: "0".repeat(64),
      commitment: "hash",
      ruleset: {},
      host: "host",
      casual: false,
      rated: true,
      created: 0,
      seats: [],
    });
    expect(() =>
      store.appendMove("broken", 1, { seat: 0, timeout: true }, 1, {
        outcome: { winner: 0, scores: [500, 0] },
        leavers: [false, false, false, false],
      }),
    ).toThrow();
    expect(store.loadGame("broken")).toMatchObject({
      status: "live",
      moves: [],
      outcome: null,
    });
    store.createGame({
      id: "valid",
      type: "spades",
      seed: "0".repeat(64),
      commitment: "hash",
      ruleset: {},
      host: "host",
      casual: false,
      rated: true,
      created: 0,
      seats: [0, 1, 2, 3].map((i) => {
        store.accounts.create(`a${i}`, `player_${i}`, "hash", 0);
        return {
          seat: i as 0 | 1 | 2 | 3,
          accountId: `a${i}`,
          session: `s${i}`,
          name: `player_${i}`,
          bot: false,
          leaver: false,
        };
      }),
    });
    store.finishGame(
      "valid",
      { winner: 0, scores: [500, 0] },
      [false, false, false, false],
      1,
    );
    expect(() =>
      store.finishGame(
        "valid",
        { winner: 0, scores: [500, 0] },
        [false, false, false, false],
        1,
      ),
    ).toThrow();
    expect(store.ratings.pool("a0", "spades").games).toBe(1);
    expect(store.ratings.changes("valid")).toHaveLength(4);
  } finally {
    store.close();
    temp.clean();
  }
});

test("profile includes only the last twenty finished games in newest-first order", () => {
  const temp = scratch(),
    store = new Store(temp.db);
  try {
    store.accounts.create("account", "keith", "hash", 0);
    for (let i = 0; i < 23; i++) {
      const id = `game-${i}`;
      store.createGame({
        id,
        type: "spades",
        seed: "0".repeat(64),
        commitment: "hash",
        ruleset: {},
        host: "host",
        casual: true,
        created: i,
        seats: [
          {
            seat: 0,
            accountId: "account",
            session: "session",
            name: "keith",
            bot: false,
            leaver: false,
          },
        ],
      });
      if (i < 22)
        store.finishGame(id, { winner: 0, scores: [500, 0] }, [false], i);
    }
    const profile = store.ratings.profile("account");
    expect(profile.games).toHaveLength(20);
    expect(profile.games[0]?.id).toBe("game-21");
    expect(profile.games.at(-1)?.id).toBe("game-2");
    expect(profile.ratings.every((r) => r.games === 0)).toBe(true);
    expect(store.loadGame("game-21")?.seats[0]?.name).toBe("keith");
  } finally {
    store.close();
    temp.clean();
  }
});
