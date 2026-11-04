import { expect, test } from "bun:test";
import { GuestSessions } from "../../src/server/http/sessions";
import { Store } from "../../src/server/store";
import { scratch } from "./helpers";

test("secure guest cookies expose no bearer token in identity and resolve across restarts", () => {
  const temp = scratch(),
    store = new Store(temp.db);
  try {
    const sessions = new GuestSessions(store, false),
      guest = sessions.guest();
    expect(guest.cookie).toMatch(/^__Host-fd=[a-f0-9]{64};/);
    for (const flag of ["Secure", "HttpOnly", "SameSite=Strict", "Path=/"])
      expect(guest.cookie).toContain(flag);
    const cookie = guest.cookie.split(";")[0] as string;
    const request = new Request("https://example.test/api/me", {
      headers: { cookie },
    });
    expect(new GuestSessions(store, false).resolve(request)).toEqual(
      guest.session,
    );
    expect(cookie).not.toContain(guest.session.id);
    expect(
      sessions.resolve(
        new Request("https://example.test", { headers: { cookie: "fd=bad" } }),
      ),
    ).toBe(null);
    const dev = new GuestSessions(store, true).guest();
    expect(dev.cookie).toMatch(/^fd=/);
    expect(dev.cookie).not.toContain("Secure");
  } finally {
    store.close();
    temp.clean();
  }
});

test("issued guest names are random base32 and unique among live sessions; expiry is thirty days", () => {
  const temp = scratch(),
    store = new Store(temp.db);
  let now = 0;
  const sessions = new GuestSessions(store, true, () => now),
    names = new Set<string>();
  try {
    const issued = Array.from({ length: 200 }, () => sessions.guest());
    for (const guest of issued) {
      expect(guest.session.name).toMatch(/^guest-[a-z2-7]{5}$/);
      expect(names.has(guest.session.name)).toBe(false);
      names.add(guest.session.name);
    }
    const first = issued[0];
    if (!first) throw new Error("No guest");
    expect(
      store.guests.issue(
        "different-token",
        first.session.name,
        now,
        30 * 86400000,
      ),
    ).toBe(false);
    const request = new Request("http://localhost/api/me", {
      headers: { cookie: first.cookie.split(";")[0] as string },
    });
    now = 30 * 86400000 - 1;
    expect(sessions.resolve(request)).toEqual(first.session);
    now++;
    expect(sessions.resolve(request)).toBe(null);
    expect(sessions.active(first.session)).toBe(false);
  } finally {
    store.close();
    temp.clean();
  }
});
