import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { staticFile } from "../../src/server/http";

const root = mkdtempSync(join(tmpdir(), "facedown-static-"));
await Bun.write(
  join(root, "index.html"),
  "<!doctype html><title>facedown</title>",
);
await Bun.write(join(root, "assets/app-12345678.js"), "console.log('client')");
afterAll(() => rmSync(root, { recursive: true }));
test("SPA deep links and index are never cached", async () => {
  for (const path of ["/", "/index.html", "/tables/abcdefghij"]) {
    const response = await staticFile(path, root);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toContain("facedown");
  }
});
test("hashed assets cache; missing assets and traversal fail closed", async () => {
  const response = await staticFile("/assets/app-12345678.js", root);
  expect(response.headers.get("cache-control")).toContain("immutable");
  expect(response.headers.get("content-type")).toContain("javascript");
  for (const path of [
    "/assets/missing.js",
    "/missing.svg",
    "/%2e%2e/package.json",
    "/%xx",
  ])
    expect((await staticFile(path, root)).status).toBe(404);
});

test("an unbuilt client returns an uncached HTML service-unavailable page", async () => {
  const response = await staticFile("/", join(root, "not-built"));
  expect(response.status).toBe(503);
  expect(response.headers.get("content-type")).toContain("text/html");
  expect(response.headers.get("cache-control")).toBe("no-store");
});
