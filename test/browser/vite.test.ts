import { expect, test } from "bun:test";
import { loadConfigFromFile } from "vite";

test("the API dev proxy preserves the browser Host for same-origin mutations", async () => {
  const loaded = await loadConfigFromFile({
    command: "serve",
    mode: "development",
  });
  const proxy = loaded?.config.server?.proxy?.["/api"];
  expect(typeof proxy).toBe("object");
  expect(proxy).toMatchObject({ target: "http://localhost:8080" });
  expect(typeof proxy === "object" && proxy.changeOrigin).not.toBe(true);
});
