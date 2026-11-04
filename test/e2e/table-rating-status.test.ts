import { expect, test } from "bun:test";
import { fixture } from "./helpers";

test("open table views compute rated eligibility and live views retain the start decision", async () => {
  const f = fixture();
  try {
    const cookies: string[] = [];
    for (let i = 0; i < 4; i++) {
      const response = await f.request("/api/register", "", {
        username: `player_${i}`,
        password: "correct horse",
      });
      cookies.push(response.headers.get("set-cookie")?.split(";")[0] as string);
    }
    const host = cookies[0] as string;
    const { id } = (await (
      await f.request("/api/tables", host, { type: "spades" })
    ).json()) as { id: string };
    const clients = [];
    for (const seat of [0, 1, 2, 3] as const)
      clients.push(await f.connect(cookies[seat] as string, { seat }, id));
    const first = clients[0];
    if (!first) throw new Error("Missing host");
    expect(first.messages[0]?.rated).toBe(false);
    const open = await first.next(
      (m) => m.t === "view" && m.status === "open" && m.rated === true,
    );
    expect(open.rated).toBe(true);
    await f.request(`/api/tables/${id}/start`, host, {});
    const live = await first.next((m) => m.t === "view" && m.status === "live");
    expect(live.rated).toBe(true);
    await f.request("/api/logout", cookies[1], {});
    f.clock.advance(30000);
    const t = f.app.tables.get(id);
    expect(t.seats[1]?.bot).toBe(true);
    expect(t.rated).toBe(true);
    expect(
      (
        await first.next(
          (m) =>
            m.t === "view" && (m.seats as { bot: boolean }[])[1]?.bot === true,
        )
      ).rated,
    ).toBe(true);
  } finally {
    await f.stop();
  }
});
