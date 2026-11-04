import type { Server } from "bun";
import type { Store } from "../store";
import { Fault } from "../tables/types";
import type { SocketData } from "../ws";
import { randomHex, type SessionResolver } from "./sessions";

export const identity = (session: {
  name: string;
  accountId?: string | null;
}) =>
  session.accountId
    ? { username: session.name, name: session.name, guest: false }
    : { name: session.name, guest: true };
export function clientIP(request: Request, server: Server<SocketData>): string {
  const forwarded =
    process.env.FACEDOWN_TRUST_PROXY === "1"
      ? request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim()
      : undefined;
  return forwarded || server.requestIP(request)?.address || "unknown";
}
export class Auth {
  private failures = new Map<string, { count: number; until: number }>();
  constructor(
    private store: Store,
    private sessions: SessionResolver,
  ) {}
  async handle(
    path: string,
    request: Request,
    server: Server<SocketData>,
  ): Promise<Response | null> {
    if (
      request.method !== "POST" ||
      !["/api/register", "/api/login"].includes(path)
    )
      return null;
    const ip = clientIP(request, server),
      now = Date.now();
    for (const [key, value] of this.failures)
      if (value.until <= now) this.failures.delete(key);
    if (path === "/api/login" && (this.failures.get(ip)?.count ?? 0) >= 5)
      throw new Fault("rate_limited");
    const body = await request.json();
    if (
      !body ||
      typeof body !== "object" ||
      typeof body.username !== "string" ||
      typeof body.password !== "string"
    )
      throw new Fault("bad_request");
    const username = body.username.toLowerCase(),
      password = body.password;
    if (
      !/^[a-z0-9_]{3,20}$/.test(username) ||
      (path === "/api/register" && password.length < 8) ||
      password.length > 200
    )
      throw new Fault("bad_request");
    let account = this.store.accounts.find(username);
    if (path === "/api/register") {
      if (account) throw new Fault("conflict");
      const hash = await Bun.password.hash(password, { algorithm: "argon2id" });
      if (!this.store.accounts.create(randomHex(), username, hash, now))
        throw new Fault("conflict");
      account = this.store.accounts.find(username);
    } else {
      // Reserve a failure before awaiting verification so parallel attempts cannot bypass the limit.
      const failure = this.failures.get(ip) ?? {
        count: 0,
        until: now + 15 * 60000,
      };
      failure.count++;
      this.failures.set(ip, failure);
      if (
        !account ||
        !(await Bun.password.verify(password, account.password_hash))
      )
        throw new Fault("unauthorized");
      this.failures.delete(ip);
    }
    if (!account || !this.sessions.account) throw new Fault("unavailable");
    const issued = this.sessions.account(account.id);
    return Response.json(identity(issued.session), {
      status: path === "/api/register" ? 201 : 200,
      headers: { "set-cookie": issued.cookie },
    });
  }
}
