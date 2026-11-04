import { expect, test } from "bun:test";
import { createConnection, type Socket } from "node:net";
import { Store } from "../../src/server/store";
import { Client, fixture } from "../e2e/helpers";
import { scratch } from "./helpers";

const SocketClient = WebSocket as unknown as new (
  url: string,
  options: Bun.WebSocketOptions,
) => WebSocket;

test("reentrant stop callers await the same drain promise", async () => {
  const f = fixture();
  try {
    const first = f.app.stop();
    const second = f.app.stop();
    expect(second).toBe(first);
    await Promise.all([first, second]);
  } finally {
    await f.stop();
  }
});

test("two SIGTERMs 100ms apart wait for in-flight HTTP, close 1012 and release the lease", async () => {
  const temp = scratch();
  const child = Bun.spawn([process.execPath, "src/server/main.ts"], {
    env: {
      ...process.env,
      PORT: "0",
      FACEDOWN_DB: temp.db,
      FACEDOWN_INSECURE_COOKIE: "1",
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  let raw: Socket | undefined;
  let client: Client | undefined;
  const stderr = new Response(child.stderr).text();
  try {
    const reader = child.stdout.getReader();
    const first = await reader.read();
    const port = Number(
      /listening on (\d+)/.exec(new TextDecoder().decode(first.value))?.[1],
    );
    reader.releaseLock();
    expect(port).toBeGreaterThan(0);
    const origin = `http://127.0.0.1:${port}`;
    const guest = await fetch(`${origin}/api/guest`, {
      method: "POST",
      headers: { origin },
    });
    const cookie = guest.headers.get("set-cookie")?.split(";")[0] as string;
    const response = await fetch(`${origin}/api/tables`, {
      method: "POST",
      headers: { origin, cookie, "content-type": "application/json" },
      body: JSON.stringify({ type: "spades" }),
    });
    const { id } = (await response.json()) as { id: string };
    const ws = new SocketClient(`${origin.replace("http:", "ws:")}/ws`, {
      headers: { origin, cookie },
    });
    client = new Client(ws, { seat: 0 });
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener("open", () => resolve(), { once: true });
      ws.addEventListener("error", reject, { once: true });
    });
    client.send({ t: "join", table: id, seat: 0 });
    await client.view(0);
    const closed = new Promise<number>((resolve) =>
      ws.addEventListener("close", (event) => resolve(event.code), {
        once: true,
      }),
    );
    const body = JSON.stringify({ type: "spades" });
    raw = createConnection({ host: "127.0.0.1", port });
    await new Promise<void>((resolve, reject) => {
      raw?.once("connect", resolve);
      raw?.once("error", reject);
    });
    raw.on("data", () => {});
    raw.write(
      `POST /api/tables HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nOrigin: ${origin}\r\nCookie: ${cookie}\r\nContent-Type: application/json\r\nContent-Length: ${body.length}\r\n\r\n${body.slice(0, 1)}`,
    );
    await Bun.sleep(50);
    child.kill("SIGTERM");
    await Bun.sleep(100);
    child.kill("SIGTERM");
    await Bun.sleep(100);
    expect(child.exitCode).toBe(null); // The second signal must not bypass the drain.
    raw.write(body.slice(1));
    expect(await closed).toBe(1012);
    expect(await child.exited).toBe(0);
    const store = new Store(temp.db);
    try {
      expect(store.leases.claim("replacement")).toBe(true);
    } finally {
      store.close();
    }
  } finally {
    raw?.destroy();
    if (child.exitCode === null) child.kill("SIGKILL");
    await child.exited;
    if (client?.ws.readyState === WebSocket.OPEN) await client.close();
    await stderr;
    temp.clean();
  }
}, 15000);
