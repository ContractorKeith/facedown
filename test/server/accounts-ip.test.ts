import { expect, test } from "bun:test";
import type { Server } from "bun";
import { clientIP } from "../../src/server/http/auth";
import type { SocketData } from "../../src/server/ws";

test("login IP uses socket unless explicitly trusting the last proxy hop", () => {
  const original = process.env.FACEDOWN_TRUST_PROXY;
  const server = {
    requestIP: () => ({ address: "socket-ip" }),
  } as unknown as Server<SocketData>;
  const request = new Request("https://example.test/api/login", {
    headers: { "x-forwarded-for": "spoofed, client-ip, proxy-hop" },
  });
  try {
    delete process.env.FACEDOWN_TRUST_PROXY;
    expect(clientIP(request, server)).toBe("socket-ip");
    process.env.FACEDOWN_TRUST_PROXY = "1";
    expect(clientIP(request, server)).toBe("proxy-hop");
    expect(clientIP(new Request("https://example.test"), server)).toBe(
      "socket-ip",
    );
  } finally {
    if (original === undefined) delete process.env.FACEDOWN_TRUST_PROXY;
    else process.env.FACEDOWN_TRUST_PROXY = original;
  }
});
