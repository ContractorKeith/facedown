import { spawn } from "node:child_process";
import { test as base } from "@playwright/test";

export { expect } from "@playwright/test";
export const test = base.extend<Record<never, never>, { origin: string }>({
  origin: [
    async ({ browserName }, use) => {
      if (browserName !== "chromium")
        throw new Error("The smoke uses Chromium");
      const server = spawn("bun", ["test/browser/server.ts"], {
        stdio: ["ignore", "pipe", "inherit"],
      });
      try {
        const origin = await new Promise<string>((resolve, reject) => {
          server.once("error", reject);
          server.once("exit", (code) =>
            reject(new Error(`Server exited: ${code}`)),
          );
          server.stdout?.once("data", (chunk) => resolve(String(chunk).trim()));
        });
        await use(origin);
      } finally {
        if (server.exitCode === null && server.signalCode === null)
          await new Promise<void>((resolve) => {
            server.once("exit", () => resolve());
            server.kill("SIGTERM");
          });
      }
    },
    { scope: "worker" },
  ],
});
