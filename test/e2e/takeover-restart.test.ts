import { expect, test } from "bun:test";
import { scratch } from "../server/helpers";
import { Client } from "./helpers";

const Socket = WebSocket as unknown as new (
  url: string,
  options: Bun.WebSocketOptions,
) => WebSocket;

test("SIGTERM preserves a bot takeover through restart with a long hold and records leaver", async () => {
  const temp = scratch();
  const children: ReturnType<typeof Bun.spawn>[] = [];
  const clients: Client[] = [];
  const launch = async (hold: number) => {
    const child = Bun.spawn(["bun", "src/server/main.ts"], {
      env: {
        ...process.env,
        PORT: "0",
        HOST: "127.0.0.1",
        FACEDOWN_DB: temp.db,
        FACEDOWN_INSECURE_COOKIE: "1",
        FACEDOWN_HOLD_MS: String(hold),
        FACEDOWN_BOT_MS: hold === 50 ? "10" : "1",
        FACEDOWN_TURN_MS: "100000",
      },
      stdout: "pipe",
      stderr: "inherit",
    });
    children.push(child);
    const reader = child.stdout.getReader();
    let text = "";
    while (!/listening on (\d+)/.test(text)) {
      const chunk = await reader.read();
      if (chunk.done) throw new Error("Server exited before listening");
      text += new TextDecoder().decode(chunk.value);
    }
    reader.releaseLock();
    return {
      child,
      origin: `http://127.0.0.1:${/listening on (\d+)/.exec(text)?.[1]}`,
    };
  };
  const request = (origin: string, path: string, cookie = "", body?: unknown) =>
    fetch(`${origin}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { origin, cookie, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const connect = async (
    origin: string,
    cookie: string,
    table: string,
    seat?: number,
  ) => {
    const ws = new Socket(`${origin.replace("http:", "ws:")}/ws`, {
      headers: { origin, cookie },
    });
    const c = new Client(ws, { spectator: true });
    clients.push(c);
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener("open", () => resolve(), { once: true });
      ws.addEventListener("error", reject, { once: true });
    });
    c.send(
      seat === undefined
        ? { t: "spectate", table }
        : { t: "join", table, seat },
    );
    await c.view(0);
    return c;
  };
  try {
    const a = await launch(50);
    const response = await request(a.origin, "/api/guest", "", {});
    const cookie = response.headers.get("set-cookie")?.split(";")[0] as string;
    const { id } = await (
      await request(a.origin, "/api/tables", cookie, { type: "dominoes" })
    ).json();
    const human = await connect(a.origin, cookie, id, 0);
    const watcher = await connect(a.origin, cookie, id);
    await request(a.origin, `/api/tables/${id}/bots`, cookie, {});
    await request(a.origin, `/api/tables/${id}/start`, cookie, {});
    await human.close();
    await watcher.next(
      (m) => m.t === "view" && (m.seats as { bot: boolean }[])[0]?.bot === true,
    );
    a.child.kill("SIGTERM");
    expect(await a.child.exited).toBe(0);
    const b = await launch(600000);
    const ws = new Socket(`${b.origin.replace("http:", "ws:")}/ws`, {
      headers: { origin: b.origin, cookie },
    });
    const resumed = new Client(ws, { spectator: true });
    clients.push(resumed);
    await new Promise<void>((resolve) =>
      ws.addEventListener("open", () => resolve(), { once: true }),
    );
    resumed.send({ t: "spectate", table: id });
    const first = await resumed.next((m) => m.t === "view");
    expect((first.seats as { bot: boolean }[])[0]?.bot).toBe(true);
    await resumed.next((m) => m.t === "over");
    const replay = await (await request(b.origin, `/api/games/${id}`)).json();
    expect(replay.seats[0]).toMatchObject({
      bot_at_start: false,
      leaver: true,
    });
  } finally {
    for (const c of clients) await c.close();
    for (const child of children) {
      child.kill("SIGTERM");
      await child.exited;
    }
    temp.clean();
  }
}, 30000);
