import { expect, test } from "bun:test";
import { fixture } from "./helpers";

test("direct table lookup survives lobby eviction, finish, and abandonment without secrets", async () => {
  const f = fixture();
  try {
    const cookie = await f.guest();
    const { id } = await (
      await f.request("/api/tables", cookie, { type: "dominoes" })
    ).json();
    for (let i = 0; i < 51; i++)
      f.app.tables.create("spades", { id: `h${i}`, name: `guest-${i}` });
    expect(
      (await (await f.request("/api/tables")).json()).some(
        (t: { id: string }) => t.id === id,
      ),
    ).toBe(false);
    const read = async () => {
      const response = await f.request(`/api/tables/${id}`, cookie);
      expect(response.status).toBe(200);
      const summary = await response.json();
      expect(Object.keys(summary).sort()).toEqual(
        ["id", "type", "status", "rated", "seats", "host"].sort(),
      );
      expect(summary).toMatchObject({
        id,
        type: "dominoes",
        rated: false,
        host: true,
      });
      return summary;
    };
    expect((await read()).status).toBe("open");
    await f.request(`/api/tables/${id}/bots`, cookie, {});
    await f.request(`/api/tables/${id}/start`, cookie, {});
    expect((await read()).status).toBe("live");
    f.clock.advance(40000);
    expect((await read()).status).toBe("finished");
    f.app.store.abandon(id);
    expect((await read()).status).toBe("abandoned");
    expect(
      (await f.request("/api/tables/aaaaaaaaaa", "fd=invalid")).status,
    ).toBe(404);
    expect((await f.request(`/api/tables/${id}`, "fd=invalid")).status).toBe(
      200,
    );
  } finally {
    await f.stop();
  }
});
