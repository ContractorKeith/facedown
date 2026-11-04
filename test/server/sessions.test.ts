import { expect, test } from "bun:test";
import { GuestSessions } from "../../src/server/http/sessions";

test("secure guest cookies expose no bearer token in identity and resolve across restarts", () => {
  const sessions = new GuestSessions(false),
    guest = sessions.guest();
  expect(guest.cookie).toMatch(/^__Host-fd=[a-f0-9]{64};/);
  for (const flag of ["Secure", "HttpOnly", "SameSite=Strict", "Path=/"])
    expect(guest.cookie).toContain(flag);
  const cookie = guest.cookie.split(";")[0] as string;
  const request = new Request("https://example.test/api/me", {
    headers: { cookie },
  });
  expect(new GuestSessions(false).resolve(request)).toEqual(guest.session);
  expect(cookie).not.toContain(guest.session.id);
  expect(
    sessions.resolve(
      new Request("https://example.test", { headers: { cookie: "fd=bad" } }),
    ),
  ).toBe(null);
  const dev = new GuestSessions(true).guest();
  expect(dev.cookie).toMatch(/^fd=/);
  expect(dev.cookie).not.toContain("Secure");
});
