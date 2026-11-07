import { expect, test } from "bun:test";
import { fixture } from "./helpers";

for (const method of ["register", "login"] as const)
  test(`${method} transfers open and live guest seats before revocation`, async () => {
    const f = fixture();
    try {
      if (method === "login")
        await f.request("/api/register", "", {
          username: "transfer_user",
          password: "correct horse",
        });
      const guest = await f.guest();
      const ids: string[] = [];
      for (let i = 0; i < 2; i++) {
        const { id } = await (
          await f.request("/api/tables", guest, { type: "spades" })
        ).json();
        ids.push(id);
        await f.connect(guest, { seat: 0 }, id);
      }
      const live = ids[1] as string;
      await f.request(`/api/tables/${live}/bots`, guest, {});
      await f.request(`/api/tables/${live}/start`, guest, {});
      const response = await f.request(`/api/${method}`, guest, {
        username: "transfer_user",
        password: "correct horse",
      });
      expect(response.status).toBe(method === "login" ? 200 : 201);
      const cookie = response.headers
        .get("set-cookie")
        ?.split(";")[0] as string;
      for (const id of ids) {
        const client = await f.connect(cookie, { seat: 0 }, id);
        expect(client.messages.at(-1)?.you).toBe(0);
        expect(f.app.tables.get(id).seats[0]?.accountId).toBeTruthy();
      }
      f.clock.advance(30000);
      expect(f.app.tables.get(live).seats[0]?.bot).toBe(false);
      expect(f.app.store.loadGame(live)?.seats[0]?.accountId).toBeTruthy();
      expect(f.app.store.loadGame(live)?.rated).toBe(false);
      expect((await f.request("/api/me", guest)).status).toBe(401);
    } finally {
      await f.stop();
    }
  });

test("open socket drop holds the host and leaves the invite joinable", async () => {
  const f = fixture();
  try {
    const cookie = await f.guest();
    const { id } = await (
      await f.request("/api/tables", cookie, { type: "dominoes" })
    ).json();
    const host = await f.connect(cookie, { seat: 0 }, id);
    await host.close();
    f.clock.advance(2000);
    expect(
      (await f.connect(cookie, { seat: 0 }, id)).messages.at(-1)?.host,
    ).toBe(true);
    expect(
      (await f.connect(await f.guest(), { seat: 1 }, id)).messages.at(-1)?.you,
    ).toBe(1);
  } finally {
    await f.stop();
  }
});
