import { expect, test } from "bun:test";
import { serverError } from "../../src/server";
import { fixture } from "../e2e/helpers";

test("encoded NUL URLs never return Bun's error page", async () => {
  const f = fixture();
  try {
    for (const path of ["/%00", "/index.html%00.js"]) {
      const response = await f.request(path);
      expect(response.status).toBe(404);
      const body = await response.text();
      expect(body).not.toContain("src/server");
      expect(body.length).toBeLessThan(100);
    }
  } finally {
    await f.stop();
  }
});
test("the top-level error handler hides exception details", async () => {
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch() {
      throw new Error("secret source path");
    },
    error: serverError,
  });
  try {
    const response = await fetch(`http://127.0.0.1:${server.port}/`);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      code: "internal_error",
      message: "Internal server error",
    });
  } finally {
    await server.stop(true);
  }
});
test("host identity follows the receiving session across tabs and spectator views", async () => {
  const f = fixture();
  try {
    const host = await f.guest();
    const { id } = await (
      await f.request("/api/tables", host, { type: "spades" })
    ).json();
    const first = await f.connect(host, { seat: 0 }, id);
    const second = await f.connect(host, { seat: 0 }, id);
    const other = await f.connect(await f.guest(), { spectator: true }, id);
    expect((await first.view(0)).host).toBe(true);
    expect((await second.view(0)).host).toBe(true);
    expect((await other.view(0)).host).toBe(false);
  } finally {
    await f.stop();
  }
});
