import { expect, test } from "bun:test";
import { moveLogHash } from "../../src/engine/core/log-hash";
import { fixture } from "./helpers";

test("every view binds its sequence; restart, final over and replay use the same chain", async () => {
  const f = fixture();
  try {
    const g = await f.game("dominoes");
    await f.play(g.id, g.players, () => f.app.tables.get(g.id).seq >= 10);
    const record = f.app.store.loadGame(g.id);
    if (!record) throw new Error("Missing record");
    const hash = moveLogHash(record.commitment, record.moves);
    expect((await g.spectator.view(10)).logHash).toBe(hash);
    await f.restart();
    for (const seat of [0, 1, 2, 3] as const)
      g.players[seat] = await f.connect(
        g.cookies[seat] as string,
        { seat },
        g.id,
      );
    const first = g.players[0];
    if (!first) throw new Error("Missing client");
    expect((await first.view(10)).logHash).toBe(hash);
    await f.play(g.id, g.players);
    const replay = await (await f.request(`/api/games/${g.id}`)).json();
    expect(replay.logHash).toBe(moveLogHash(replay.commitment, replay.moves));
    for (const client of g.players) {
      const over = await client.next((m) => m.t === "over");
      expect(over.logHash).toBe(replay.logHash);
      for (const message of client.messages.filter((m) => m.t === "view"))
        expect(message.logHash).toBe(
          moveLogHash(replay.commitment, replay.moves.slice(0, message.seq)),
        );
    }
  } finally {
    await f.stop();
  }
}, 30000);
