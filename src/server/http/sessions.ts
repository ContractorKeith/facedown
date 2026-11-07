import { commitment } from "../../engine/core/random";
import type { Store } from "../store";

export const randomHex = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
export const randomId = (length: number) =>
  Array.from(
    crypto.getRandomValues(new Uint8Array(length)),
    (b) => "abcdefghijklmnopqrstuvwxyz234567"[b % 32],
  ).join("");
export type Session = {
  id: string;
  name: string;
  accountId?: string | null;
  ip?: string;
};
export interface SessionResolver {
  resolve(request: Request): Session | null;
  active(session: Session): boolean;
  account?(accountId: string): {
    session: Session;
    cookie: string;
    revoked?: string[];
  };
  logout?(session: Session): string;
  headers?(cookie: string): Headers;
  guest(): { session: Session; cookie: string };
}
const lifetime = 30 * 86400000;
export class GuestSessions implements SessionResolver {
  constructor(
    private store: Store,
    private insecure = process.env.FACEDOWN_INSECURE_COOKIE === "1",
    private now = () => Date.now(),
  ) {}
  resolve(request: Request): Session | null {
    // Accept only the configured name, and only its first occurrence.
    const name = this.insecure ? "fd" : "__Host-fd";
    const token = (request.headers.get("cookie") ?? "")
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(`${name}=`))
      ?.slice(name.length + 1);
    return token && /^[0-9a-f]{64}$/.test(token)
      ? (this.store.accounts.resolve(commitment(token), this.now()) ??
          this.store.guests.find(commitment(token), this.now()))
      : null;
  }
  active(session: Session): boolean {
    return !!(
      this.store.accounts.resolve(session.id, this.now()) ??
      this.store.guests.find(session.id, this.now())
    );
  }
  private cookie(token: string, age: number): string {
    return `${this.insecure ? "fd" : "__Host-fd"}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${this.insecure ? "" : "; Secure"}`;
  }
  headers(cookie: string): Headers {
    const headers = new Headers();
    headers.append("set-cookie", cookie);
    const other = this.insecure ? "__Host-fd" : "fd";
    headers.append(
      "set-cookie",
      `${other}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${other === "__Host-fd" ? "; Secure" : ""}`,
    );
    return headers;
  }
  account(accountId: string) {
    const token = randomHex(),
      now = this.now(),
      age = 7 * 86400;
    const revoked = this.store.accounts.issue(
      commitment(token),
      accountId,
      now + age * 1000,
      now,
    );
    const session = this.store.accounts.resolve(commitment(token), now);
    if (!session) throw new Error("Missing issued session");
    return { session, cookie: this.cookie(token, age), revoked };
  }
  logout(session: Session): string {
    this.store.accounts.revoke(session.id);
    return this.cookie("", 0);
  }
  guest() {
    for (;;) {
      const token = randomHex(),
        session = { id: commitment(token), name: `guest-${randomId(5)}` };
      const now = this.now();
      if (
        !this.store.guests.issue(session.id, session.name, now, now + lifetime)
      )
        continue;
      return {
        session,
        cookie: this.cookie(token, lifetime / 1000),
      };
    }
  }
}
