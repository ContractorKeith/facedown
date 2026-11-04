import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../../src/server";

const dir = mkdtempSync(join(tmpdir(), "facedown-browser-"));
const app = startServer({
  port: 0,
  hostname: "127.0.0.1",
  db: join(dir, "fd.db"),
  insecureCookie: true,
  timing: { turn: 10000, hold: 15000, bot: 80 },
});
console.log(`http://127.0.0.1:${app.server.port}`);
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, async () => {
    await app.stop();
    rmSync(dir, { recursive: true });
    process.exit(0);
  });
