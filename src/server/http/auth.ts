import type { Server } from "bun";
import type { Store } from "../store";
import { Fault } from "../tables/types";
import type { SocketData } from "../ws";
import { AuthLimits } from "./auth-limits";
import { randomHex, type Session, type SessionResolver } from "./sessions";

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
// A fixed hash uses the same cost as real accounts for unknown usernames.
const dummyHash =
  "$argon2id$v=19$m=19456,t=2,p=1$fXeJfJOjW02UaAsc2i9SS14StxPbveT8RF+Ezc+BX2g$px3D/odeLzb0hdIQXaT/wyf5TfpsELhO2GP4FJ1wX3g";
export class Auth {
  private limits = new AuthLimits();
  constructor(
    private store: Store,
    private sessions: SessionResolver,
    private retireSession: (session: Session) => void = () => {},
    private now = () => Date.now(),
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
      now = this.now();
    if (path === "/api/register") this.limits.register(ip, now);
    const previous = this.sessions.resolve(request);
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
      path === "/api/register" &&
      (["bot", "bots", "spectator", "system", "admin"].includes(username) ||
        username.startsWith("guest"))
    )
      throw new Fault("reserved");
    if (
      !/^[a-z0-9_]{3,20}$/.test(username) ||
      (path === "/api/register" && password.length < 8) ||
      password.length > 200
    )
      throw new Fault("bad_request");
    let account = this.store.accounts.find(username);
    if (path === "/api/register") {
      if (account) throw new Fault("conflict");
      const hash = await Bun.password.hash(password, {
        algorithm: "argon2id",
        memoryCost: 19456,
        timeCost: 2,
      });
      if (!this.store.accounts.create(randomHex(), username, hash, now))
        throw new Fault("conflict");
      account = this.store.accounts.find(username);
    } else {
      const settle = this.limits.login(ip, username, now);
      let success = false;
      try {
        const verified = await Bun.password.verify(
          password,
          account?.password_hash ?? dummyHash,
        );
        success = !!account && verified;
      } finally {
        settle(success);
      }
      if (!success) throw new Fault("unauthorized");
    }
    if (!account || !this.sessions.account) throw new Fault("unavailable");
    const issued = this.sessions.account(account.id);
    if (previous && this.sessions.logout) {
      this.sessions.logout(previous);
      this.retireSession(previous);
    }
    return Response.json(identity(issued.session), {
      status: path === "/api/register" ? 201 : 200,
      headers: this.sessions.headers?.(issued.cookie) ?? {
        "set-cookie": issued.cookie,
      },
    });
  }
}
