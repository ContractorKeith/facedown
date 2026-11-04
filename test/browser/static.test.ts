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

test("NUL paths return 404 instead of rejecting", async () => {
  for (const path of ["/%00", "/index.html%00.js"])
    expect((await staticFile(path, root)).status).toBe(404);
});
test("symlinks cannot expose files outside the client root", async () => {
  const { symlinkSync, mkdirSync } = await import("node:fs");
  const outside = mkdtempSync(join(tmpdir(), "facedown-outside-"));
  try {
    await Bun.write(join(outside, "secret.html"), "private");
    symlinkSync(join(outside, "secret.html"), join(root, "leak.html"));
    expect((await staticFile("/leak.html", root)).status).toBe(404);
    symlinkSync(join(outside, "secret.html"), join(root, "assets/leak.js"));
    expect((await staticFile("/assets/leak.js", root)).status).toBe(404);
    symlinkSync(outside, join(root, "linked"));
    expect((await staticFile("/linked/secret.html", root)).status).toBe(404);
    // The SPA fallback must validate index.html too.
    const fallback = join(root, "fallback");
    mkdirSync(fallback);
    symlinkSync(join(outside, "secret.html"), join(fallback, "index.html"));
    expect((await staticFile("/unknown", fallback)).status).toBe(404);
  } finally {
    rmSync(outside, { recursive: true });
  }
});
