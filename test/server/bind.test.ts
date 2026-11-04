import { expect, test } from "bun:test";
import { startServer } from "../../src/server";
import { scratch } from "./helpers";

test("server defaults to loopback and HOST overrides it", async () => {
  const temp = scratch(),
    old = process.env.HOST;
  delete process.env.HOST;
  let app = startServer({ port: 0, db: temp.db });
  try {
    expect(app.server.hostname).toBe("127.0.0.1");
    await app.stop();
    process.env.HOST = "0.0.0.0";
    app = startServer({ port: 0, db: temp.db });
    expect(app.server.hostname).toBe("0.0.0.0");
  } finally {
    await app.stop();
    temp.clean();
    if (old === undefined) delete process.env.HOST;
    else process.env.HOST = old;
  }
});

test("main exits 1 with one clear line when its loopback port is occupied", async () => {
  const temp = scratch();
  const blocker = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response("other"),
  });
  try {
    const child = Bun.spawn(["bun", "src/server/main.ts"], {
      env: {
        ...process.env,
        HOST: "127.0.0.1",
        PORT: String(blocker.port),
        FACEDOWN_DB: temp.db,
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(await child.exited).toBe(1);
    expect((await new Response(child.stderr).text()).trim()).toBe(
      `Port ${blocker.port} is already in use`,
    );
    expect(await new Response(child.stdout).text()).toBe("");
  } finally {
    await blocker.stop(true);
    temp.clean();
  }
});
