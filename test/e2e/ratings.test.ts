import { afterEach, expect, test } from "bun:test";
import { commitment } from "../../src/engine/core/random";
import type { Seat } from "../../src/engine/core/types";
import { type Client, fixture } from "./helpers";

let f: ReturnType<typeof fixture>;
afterEach(async () => {
  if (f) await f.stop();
});
async function setup(casual = false, guest = false) {
  f = fixture();
  const cookies: string[] = [];
  for (let i = 0; i < 4; i++) {
    const response = await f.request("/api/register", "", {
      username: `player_${i}`,
      password: "correct horse",
    });
    cookies.push(response.headers.get("set-cookie")?.split(";")[0] as string);
  }
  if (guest) cookies[3] = await f.guest();
  const host = cookies[0] as string;
  const response = await f.request("/api/tables", host, {
    type: "spades",
    casual,
  });
  const { id } = (await response.json()) as { id: string };
  const players: Client[] = [];
  for (const seat of [0, 1, 2, 3] as const)
    players.push(await f.connect(cookies[seat] as string, { seat }, id));
  expect((await f.request(`/api/tables/${id}/start`, host, {})).status).toBe(
    200,
  );
  expect((await f.request(`/api/games/${id}`)).status).toBe(404);
  return { id, host, cookies, players };
}
async function profile(i: number) {
  return (await (await f.request(`/api/players/player_${i}`)).json()) as {
    ratings: { type: string; rating: number; rd: number; games: number }[];
    games: { id: string; rated: boolean }[];
  };
}
for (const mode of ["rated", "casual", "guest"] as const)
  test(`${mode} Spades updates only the correct pool; replay and profiles`, async () => {
    const g = await setup(mode === "casual", mode === "guest");
    await f.play(g.id, g.players);
    const replay = (await (await f.request(`/api/games/${g.id}`)).json()) as {
      rated: boolean;
      seed: string;
      commitment: string;
      seats: { name: string }[];
      rating_changes: unknown[];
    };
    expect(replay.rated).toBe(mode === "rated");
    expect(g.players[0]?.messages.findLast((m) => m.t === "view")?.rated).toBe(
      mode === "rated",
    );
    expect(commitment(replay.seed)).toBe(replay.commitment);
    expect(replay.seats[0]?.name).toBe("player_0");
    expect(replay.rating_changes).toHaveLength(mode === "rated" ? 4 : 0);
    for (let i = 0; i < 4; i++) {
      const p = await profile(i);
      expect(p.ratings.find((r) => r.type === "spades")?.games).toBe(
        mode === "rated" ? 1 : 0,
      );
      expect(p.ratings.find((r) => r.type === "dominoes")?.games).toBe(0);
    }
    expect((await profile(0)).games[0]).toMatchObject({
      id: g.id,
      rated: mode === "rated",
    });
    expect(await (await f.request("/api/leaderboard/spades")).json()).toEqual(
      [],
    );
    expect((await f.request("/api/players/missing")).status).toBe(404);
  }, 30000);
for (const reclaim of [false, true])
  test(`winning account bot-held at finish scores ${reclaim ? "normally after reclaim" : "a loss"}`, async () => {
    const g = await setup();
    // Find the terminal move through normal client play, stopping immediately before it.
    await f.play(g.id, g.players, () => {
      const t = f.app.tables.get(g.id),
        seat = t.game.toAct(t.state);
      if (seat === null) return true;
      const move = t.game.bot(
        t.game.view(t.state, { seat }),
        t.game.legalMoves(t.state, seat),
      );
      const result = t.game.apply(t.state, { seat, move });
      return result.ok && t.game.outcome(result.state) !== null;
    });
    const t = f.app.tables.get(g.id),
      acting = t.game.toAct(t.state) as Seat;
    const result = t.game.apply(t.state, {
      seat: acting,
      move: t.game.bot(
        t.game.view(t.state, { seat: acting }),
        t.game.legalMoves(t.state, acting),
      ),
    });
    if (!result.ok) throw new Error("Illegal terminal move");
    const winner = t.game.outcome(result.state)?.winner as number;
    const leaver = [winner, winner + 2].find((s) => s !== acting) as Seat;
    const observer = g.players[acting] as Client;
    await (g.players[leaver] as Client).close();
    await observer.next(
      (m) =>
        m.t === "view" &&
        (m.seats as { connected: boolean }[])[leaver]?.connected === false,
    );
    // Delay the next turn while the disconnect hold expires.
    f.app.tables.lifecycle.timing.turn = 100000;
    f.app.tables.lifecycle.timing.bot = 100000;
    f.app.tables.lifecycle.schedule(t);
    f.clock.advance(30000);
    expect(t.seats[leaver]?.bot).toBe(true);
    if (reclaim) {
      const login = await f.request("/api/login", "", {
        username: `player_${leaver}`,
        password: "correct horse",
      });
      expect(login.status).toBe(200);
      const fresh = login.headers.get("set-cookie")?.split(";")[0] as string;
      expect(fresh).not.toBe(g.cookies[leaver]);
      g.players[leaver] = await f.connect(fresh, { seat: leaver }, g.id);
    }
    const seq = t.seq;
    observer.send({
      t: "move",
      table: g.id,
      seq,
      move: t.game.bot(
        t.game.view(t.state, { seat: acting }),
        t.game.legalMoves(t.state, acting),
      ),
    });
    await observer.view(seq + 1);
    const rating = (await profile(leaver)).ratings.find(
      (r) => r.type === "spades",
    )?.rating as number;
    if (reclaim) expect(rating).toBeGreaterThan(1500);
    else expect(rating).toBeLessThan(1500);
    expect(f.app.store.loadGame(g.id)?.seats[leaver]?.leaver).toBe(!reclaim);
  }, 30000);
