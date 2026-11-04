import { expect, test } from "bun:test";
import { GuestSessions } from "../../src/server/http/sessions";
import { Store } from "../../src/server/store";
import { scratch } from "./helpers";

for (const insecure of [false, true])
  test(`canonical cookie wins over legacy cookie in either order (${insecure})`, () => {
    const temp = scratch(),
      store = new Store(temp.db);
    try {
      const sessions = new GuestSessions(store, insecure),
        other = new GuestSessions(store, !insecure);
      const active = sessions.guest(),
        legacy = other.guest();
      const canonical = active.cookie.split(";")[0] as string,
        old = legacy.cookie.split(";")[0] as string;
      for (const cookie of [`${canonical}; ${old}`, `${old}; ${canonical}`])
        expect(
          sessions.resolve(
            new Request("https://test", { headers: { cookie } }),
          ),
        ).toEqual(active.session);
      const headers = sessions.headers(active.cookie).getSetCookie();
      expect(headers).toHaveLength(2);
      expect(headers[0]).toBe(active.cookie);
      expect(headers[1]).toStartWith(`${insecure ? "__Host-fd" : "fd"}=;`);
      expect(headers[1]).toContain("Max-Age=0");
      const name = insecure ? "fd" : "__Host-fd";
      expect(
        sessions.resolve(
          new Request("https://test", {
            headers: { cookie: `${canonical}; ${name}=invalid` },
          }),
        ),
      ).toEqual(active.session);
      expect(
        sessions.resolve(
          new Request("https://test", {
            headers: { cookie: `${name}=invalid; ${canonical}` },
          }),
        ),
      ).toBe(null);
    } finally {
      store.close();
      temp.clean();
    }
  });
