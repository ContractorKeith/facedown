import { expect, test } from "bun:test";
import { fixture } from "./helpers";

for (const method of ["login", "register"] as const)
  test(`${method} replaces the incoming account session and closes its playing sockets`, async () => {
    const f = fixture();
    try {
      const registered = await f.request("/api/register", "", {
        username: "first_account",
        password: "correct horse",
      });
      const old = registered.headers.get("set-cookie")?.split(";")[0] as string;
      const { id } = await (
        await f.request("/api/tables", old, { type: "spades" })
      ).json();
      const first = await f.connect(old, { seat: 0 }, id);
      await f.request(`/api/tables/${id}/bots`, old, {});
      await f.request(`/api/tables/${id}/start`, old, {});
      const closed = new Promise<CloseEvent>((resolve) =>
        first.ws.addEventListener("close", resolve, { once: true }),
      );
      const replacement = await f.request(`/api/${method}`, old, {
        username: method === "login" ? "first_account" : "second_account",
        password: "correct horse",
      });
      expect(replacement.status).toBe(method === "login" ? 200 : 201);
      expect((await closed).code).toBe(1008);
      expect((await f.request("/api/me", old)).status).toBe(401);
      expect(f.app.tables.get(id).seats[0]?.sockets.size).toBe(0);
      const fresh = replacement.headers
        .get("set-cookie")
        ?.split(";")[0] as string;
      expect((await f.request("/api/me", fresh)).status).toBe(200);
      const seq = f.app.tables.get(id).seq;
      expect((await f.request("/api/logout", fresh, {})).status).toBe(204);
      expect((await f.request("/api/me", fresh)).status).toBe(401);
      expect(first.ws.readyState).toBe(WebSocket.CLOSED);
      expect(f.app.tables.get(id).seq).toBe(seq);
    } finally {
      await f.stop();
    }
  });
