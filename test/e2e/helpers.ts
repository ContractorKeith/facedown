import { expect } from "bun:test";
import type { GameType, Seat, Viewer } from "../../src/engine/core/types";
import { type ServerOptions, startServer } from "../../src/server";
import { FakeClock, scratch } from "../server/helpers";
import { legalMovesFromView } from "./client-moves";

export type Message = Record<string, unknown> & {
  t: string;
  seq?: number;
  view?: unknown;
  code?: string;
};
export class Client {
  readonly messages: Message[] = [];
  private waiters = new Set<() => void>();
  private cursor = 0;
  constructor(
    readonly ws: WebSocket,
    readonly viewer: Viewer,
  ) {
    ws.addEventListener("message", (event) => {
      this.messages.push(JSON.parse(String(event.data)));
      for (const wake of this.waiters) wake();
    });
  }
  send(value: unknown) {
    this.ws.send(JSON.stringify(value));
  }
  async next(predicate: (message: Message) => boolean): Promise<Message> {
    const find = () => {
      const index = this.messages.findIndex(
        (m, i) => i >= this.cursor && predicate(m),
      );
      if (index < 0) return;
      this.cursor = index + 1;
      return this.messages[index];
    };
    const ready = find();
    if (ready) return ready;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.waiters.delete(wake);
        reject(new Error("WebSocket message timed out"));
      }, 3000);
      const wake = () => {
        const m = find();
        if (m) {
          clearTimeout(timeout);
          this.waiters.delete(wake);
          resolve(m);
        }
      };
      this.waiters.add(wake);
    });
  }
  view(seq: number) {
    const message = this.messages.findLast(
      (m) => m.t === "view" && m.seq === seq,
    );
    return message
      ? Promise.resolve(message)
      : this.next((m) => m.t === "view" && m.seq === seq);
  }
  error(code: string) {
    return this.next((m) => m.t === "error" && m.code === code);
  }
  async close() {
    if (this.ws.readyState === WebSocket.CLOSED) return;
    await new Promise<void>((resolve) => {
      this.ws.addEventListener("close", () => resolve(), { once: true });
      this.ws.close();
    });
  }
}
export function fixture(overrides: Partial<ServerOptions> = {}) {
  const temp = scratch(),
    clock = new FakeClock();
  const options = {
    port: 0,
    hostname: "127.0.0.1",
    db: temp.db,
    clock,
    timing: { turn: 10000, hold: 30000, bot: 1 },
    insecureCookie: true,
    ...overrides,
  };
  let app = startServer(options);
  const clients: Client[] = [];
  const origin = () => `http://127.0.0.1:${app.server.port}`;
  const request = (
    path: string,
    cookie = "",
    body?: unknown,
    customOrigin = origin(),
  ) =>
    fetch(`${origin()}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        cookie,
        origin: customOrigin,
        "content-type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  async function guest() {
    const response = await request("/api/guest", "", {});
    expect(response.status).toBe(200);
    return response.headers.get("set-cookie")?.split(";")[0] as string;
  }
  async function connect(
    cookie: string,
    viewer: Viewer,
    table: string,
    wsOrigin = origin(),
  ) {
    // DOM typings omit Bun’s authenticated-client options.
    const Socket = WebSocket as unknown as new (
      url: string,
      options: Bun.WebSocketOptions,
    ) => WebSocket;
    const ws = new Socket(`${origin().replace("http:", "ws:")}/ws`, {
      headers: { cookie, origin: wsOrigin },
    });
    const client = new Client(ws, viewer);
    clients.push(client);
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener("open", () => resolve(), { once: true });
      ws.addEventListener("error", reject, { once: true });
    });
    client.send(
      "seat" in viewer
        ? { t: "join", table, seat: viewer.seat }
        : { t: "spectate", table },
    );
    await client.next((m) => m.t === "view");
    return client;
  }
  async function game(type: GameType) {
    const cookies = await Promise.all([guest(), guest(), guest(), guest()]);
    const host = cookies[0] as string;
    const response = await request("/api/tables", host, { type });
    expect(response.status).toBe(201);
    const { id } = (await response.json()) as { id: string };
    expect(id).toMatch(/^[a-z2-7]{10}$/);
    const players: Client[] = [];
    for (const seat of [0, 1, 2, 3] as const)
      players.push(await connect(cookies[seat] as string, { seat }, id));
    const spectator = await connect(await guest(), { spectator: true }, id);
    expect((await request(`/api/tables/${id}/start`, host, {})).status).toBe(
      200,
    );
    await spectator.view(0);
    return { id, host, cookies, players, spectator };
  }
  async function play(
    id: string,
    players: Client[],
    until: () => boolean = () => app.tables.get(id).status === "finished",
  ) {
    for (let count = 0; !until(); count++) {
      if (count > 15000) throw new Error("Game did not finish");
      const table = app.tables.get(id);
      const current = await (players[0] as Client).view(table.seq);
      const seat = current.toAct as Seat;
      const client = players[seat] as Client;
      const message = await client.view(table.seq);
      const move = table.game.bot(
        message.view,
        legalMovesFromView(table.type, message.view),
      );
      clock.advance(201); // Keep real per-connection rate limits enabled.
      client.send({ t: "move", table: id, seq: table.seq, move });
      await client.view(table.seq + 1);
    }
  }
  return {
    get app() {
      return app;
    },
    db: temp.db,
    clock,
    clients,
    request,
    guest,
    connect,
    game,
    play,
    async restart() {
      for (const c of clients) await c.close();
      await app.stop();
      app = startServer(options);
    },
    async stop() {
      for (const c of clients) await c.close();
      await app.stop();
      temp.clean();
    },
  };
}
