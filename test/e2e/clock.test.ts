import { expect, test } from "bun:test";
import { startServer } from "../../src/server";
import { scratch } from "../server/helpers";
import { Client } from "./helpers";
import { checkWire } from "./wire";

test("real clock schedules turn timeout and disconnected-seat takeover", async () => {
  const temp = scratch();
  const app = startServer({
    db: temp.db,
    port: 0,
    hostname: "127.0.0.1",
    insecureCookie: true,
    timing: { turn: 10, hold: 1, bot: 2 },
  });
  const sessions = app.sessions;
  let client: Client | undefined;
  try {
    const host = sessions.guest().session;
    const table = app.tables.create("spades", host);
    app.tables.fill(table.id, host);
    const hostPeer = { session: host, send: () => {} };
    app.tables.join(table.id, 0, hostPeer);
    const spectator = sessions.guest(),
      origin = `http://127.0.0.1:${app.server.port}`;
    const Socket = WebSocket as unknown as new (
      url: string,
      options: Bun.WebSocketOptions,
    ) => WebSocket;
    const ws = new Socket(`${origin.replace("http:", "ws:")}/ws`, {
      headers: { origin, cookie: spectator.cookie.split(";")[0] as string },
    });
    client = new Client(ws, { spectator: true });
    await new Promise<void>((resolve) =>
      ws.addEventListener("open", () => resolve(), { once: true }),
    );
    client.send({ t: "spectate", table: table.id });
    await client.view(0);
    app.tables.start(table.id, host);
    await client.next((m) => m.t === "view" && Number(m.seq) >= 4);
    expect(app.store.loadGame(table.id)?.moves).toContainEqual({
      seat: 0,
      timeout: true,
    });
    app.tables.disconnect(hostPeer);
    await client.next(
      (m) => m.t === "view" && (m.seats as { bot: boolean }[])[0]?.bot === true,
    );
    expect(table.seats[0]?.bot).toBe(true);
    const record = app.store.loadGame(table.id);
    if (!record) throw new Error("Missing record");
    checkWire(record, [client]);
  } finally {
    await client?.close();
    await app.stop();
    temp.clean();
  }
});
