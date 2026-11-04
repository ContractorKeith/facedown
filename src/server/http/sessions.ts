import { commitment } from "../../engine/core/random";

export const randomHex = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
export type Session = { id: string; name: string };
export interface SessionResolver {
  resolve(request: Request): Session | null;
  guest(): { session: Session; cookie: string };
}
// Guest bearer tokens identify only themselves; no account privileges are inferred.
// Hashes, never bearer tokens, are stored with seats so reclaim survives a restart.
export class GuestSessions implements SessionResolver {
  constructor(
    private insecure = process.env.FACEDOWN_INSECURE_COOKIE === "1",
  ) {}
  private identity(token: string): Session {
    return {
      id: commitment(token),
      name: `guest-${commitment(token).slice(0, 4)}`,
    };
  }
  resolve(request: Request): Session | null {
    const name = this.insecure ? "fd" : "__Host-fd";
    const token = (request.headers.get("cookie") ?? "")
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(`${name}=`))
      ?.slice(name.length + 1);
    return token && /^[0-9a-f]{64}$/.test(token) ? this.identity(token) : null;
  }
  guest() {
    const token = randomHex();
    return {
      session: this.identity(token),
      cookie: `${this.insecure ? "fd" : "__Host-fd"}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${this.insecure ? "" : "; Secure"}`,
    };
  }
}
