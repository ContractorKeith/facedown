import { Fault } from "../tables/types";

type Entry = { failures: number; pending: number; until: number };
export class AuthLimits {
  private entries = new Map<string, Entry>();
  private entry(
    key: string,
    limit: number,
    window: number,
    now: number,
  ): Entry {
    for (const [name, value] of this.entries)
      if (value.until <= now && value.pending === 0) this.entries.delete(name);
    let entry = this.entries.get(key);
    if (!entry || (entry.until <= now && entry.pending === 0)) {
      entry = { failures: 0, pending: 0, until: now + window };
      this.entries.set(key, entry);
    }
    if (entry.failures + entry.pending >= limit)
      throw new Fault("rate_limited");
    return entry;
  }
  guest(ip: string, now: number): void {
    this.entry(`guest:${ip}`, 30, 3600000, now).failures++;
  }
  register(ip: string, now: number): void {
    this.entry(`register:${ip}`, 5, 3600000, now).failures++;
  }
  login(ip: string, username: string, now: number): (success: boolean) => void {
    const userKey = `login:${ip}|${username}`;
    const user = this.entry(userKey, 5, 900000, now);
    const address = this.entry(`ip:${ip}`, 20, 900000, now);
    user.pending++;
    address.pending++;
    return (success) => {
      user.pending--;
      address.pending--;
      if (success) {
        user.failures = 0;
        if (user.pending === 0) this.entries.delete(userKey);
        if (address.pending === 0 && address.failures === 0)
          this.entries.delete(`ip:${ip}`);
      } else {
        user.failures++;
        address.failures++;
      }
    };
  }
}
