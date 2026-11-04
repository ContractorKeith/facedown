import { expect, test } from "bun:test";
import { Client } from "../e2e/helpers";
import { requireDocker } from "./guard";

const enabled = process.env.FACEDOWN_CONTAINER === "1";
requireDocker(enabled);
const docker = async (...args: string[]) => {
  const child = Bun.spawn(["docker", ...args], {
    stdout: "pipe",
    stderr: "inherit",
  });
  const output = await new Response(child.stdout).text();
  if (await child.exited) throw new Error(`docker ${args[0]} failed`);
  return output.trim();
};
const Socket = WebSocket as unknown as new (
  url: string,
  options: Bun.WebSocketOptions,
) => WebSocket;
test.skipIf(!enabled)(
  "container SIGTERM hands the persisted game to a healthy standby",
  async () => {
    const prefix = `facedown-test-${crypto.randomUUID()}`;
    const volume = `${prefix}-data`,
      a = `${prefix}-a`,
      b = `${prefix}-b`;
    const clients: Client[] = [];
    const request = (
      origin: string,
      path: string,
      cookie = "",
      body?: unknown,
    ) =>
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
      const client = new Client(ws, { spectator: true });
      clients.push(client);
      await new Promise<void>((resolve, reject) => {
        ws.addEventListener("open", () => resolve(), { once: true });
        ws.addEventListener("error", reject, { once: true });
      });
      client.send(
        seat === undefined
          ? { t: "spectate", table }
          : { t: "join", table, seat },
      );
      return client;
    };
    const run = async (name: string) => {
      await docker(
        "run",
        "-d",
        "--name",
        name,
        "-p",
        "127.0.0.1::8080",
        "-v",
        `${volume}:/data`,
        "-e",
        "FACEDOWN_INSECURE_COOKIE=1",
        "-e",
        "FACEDOWN_TURN_MS=100000",
        "-e",
        "FACEDOWN_HOLD_MS=10000",
        "-e",
        "FACEDOWN_BOT_MS=1",
        "facedown-test-image:latest",
      );
      const binding = await docker("port", name, "8080/tcp");
      const origin = `http://${binding}`;
      for (let i = 0; i < 100; i++) {
        try {
          if ((await request(origin, "/healthz")).ok) return origin;
        } catch {}
        await Bun.sleep(50);
      }
      throw new Error("Container did not become healthy");
    };
    try {
      await docker("build", "-t", "facedown-test-image:latest", ".");
      const size = Number(
        await docker(
          "image",
          "inspect",
          "facedown-test-image:latest",
          "--format",
          "{{.Size}}",
        ),
      );
      console.log(`container image: ${size} bytes`);
      expect(size).toBeLessThan(200000000);
      await docker("volume", "create", volume);
      const originA = await run(a);
      const cookies: string[] = [];
      for (let i = 0; i < 4; i++) {
        const response = await request(originA, "/api/guest", "", {});
        cookies.push(
          response.headers.get("set-cookie")?.split(";")[0] as string,
        );
      }
      const host = cookies[0] as string;
      const { id } = (await (
        await request(originA, "/api/tables", host, { type: "spades" })
      ).json()) as { id: string };
      const players: Client[] = [];
      for (let seat = 0; seat < 4; seat++) {
        const c = await connect(originA, cookies[seat] as string, id, seat);
        await c.view(0);
        players.push(c);
      }
      expect(
        (await request(originA, `/api/tables/${id}/start`, host, {})).status,
      ).toBe(200);
      await players[1]?.view(0, true);
      players[1]?.send({
        t: "move",
        table: id,
        seq: 0,
        move: { bid: 1 },
      });
      const before = await (players[0] as Client).view(1, true);
      const originB = await run(b);
      expect((await request(originB, "/api/tables", host)).status).toBe(503);
      expect((await request(originB, "/ws", host)).status).toBe(503);
      let health = "";
      for (let i = 0; i < 100 && health !== "healthy"; i++) {
        health = await docker(
          "inspect",
          b,
          "--format",
          "{{.State.Health.Status}}",
        );
        if (health !== "healthy") await Bun.sleep(100);
      }
      expect(health).toBe("healthy");
      const closed = new Promise<number>((resolve) =>
        players[0]?.ws.addEventListener(
          "close",
          (event) => resolve(event.code),
          { once: true },
        ),
      );
      await docker("stop", "--time", "10", a);
      expect(await closed).toBe(1012);
      expect(
        await docker("inspect", a, "--format", "{{.State.ExitCode}}"),
      ).toBe("0");
      for (
        let i = 0;
        i < 100 && (await request(originB, "/api/tables", host)).status === 503;
        i++
      )
        await Bun.sleep(25);
      const resumed: Client[] = [];
      for (let seat = 0; seat < 4; seat++)
        resumed.push(await connect(originB, cookies[seat] as string, id, seat));
      const after = await (resumed[0] as Client).view(1, true);
      expect(after.view).toEqual(before.view);
      expect(after.commitment).toBe(before.commitment);
      const spectator = await connect(originB, host, id);
      await spectator.view(1, true);
      for (const c of resumed) await c.close();
      for (let i = 0; i < 600; i++) {
        if (spectator.messages.some((m) => m.t === "over")) break;
        await Bun.sleep(100);
      }
      expect(spectator.messages.some((m) => m.t === "over")).toBe(true);
      expect((await request(originB, `/api/games/${id}`, host)).status).toBe(
        200,
      );
    } finally {
      for (const c of clients)
        if (c.ws.readyState === WebSocket.OPEN) await c.close();
      for (const name of [a, b]) await docker("rm", "-f", name).catch(() => {});
      await docker("volume", "rm", volume).catch(() => {});
    }
  },
  300000,
);
