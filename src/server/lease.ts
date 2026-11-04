import { type Clock, clock } from "./clock";
import type { Store } from "./store";
import { Fault } from "./tables/types";

export type LeaseGuard = <T>(action: () => T) => T;
// A unique token fences even a resumed process after its heartbeat expires.
export class TableLease {
  private holder = crypto.randomUUID();
  private active = false;
  private loaded = false;
  private stopped = false;
  private cancelPoll?: () => void;
  private cancelHeartbeat?: () => void;
  constructor(
    private store: Store,
    acquired: (guard: LeaseGuard) => void | Promise<void>,
    private lost: () => void,
    private time: Clock = clock,
  ) {
    const beat = () => {
      if (this.stopped) return;
      try {
        if (!store.leases.heartbeat(this.holder, time.now())) {
          this.demote();
          return;
        }
      } catch (error) {
        console.error("Lease heartbeat failed; retrying", error);
        this.cancelHeartbeat = time.after(250, beat);
        return;
      }
      this.cancelHeartbeat = time.after(5000, beat);
    };
    const complete = () => {
      if (!this.stopped && this.owns()) this.loaded = true;
    };
    const failed = (error: unknown) => {
      if (this.stopped) return;
      console.error("Table rebuild failed", error);
      this.demote();
    };
    const attempt = () => {
      if (this.stopped) return;
      let claimed = false;
      try {
        claimed = store.leases.claim(this.holder, time.now());
      } catch (error) {
        console.error("Lease acquisition failed; retrying", error);
      }
      if (!claimed) {
        this.cancelPoll = time.after(250, attempt);
        return;
      }
      this.active = true;
      this.cancelHeartbeat = time.after(5000, beat);
      try {
        // Replay never holds the lease transaction; only its writes are fenced.
        const result = acquired((action) => this.run(action));
        if (result) void result.then(complete).catch(failed);
        else complete();
      } catch (error) {
        failed(error);
      }
    };
    attempt();
  }
  private owns(): boolean {
    if (!this.active || this.stopped) return false;
    try {
      if (this.store.leases.owns(this.holder, this.time.now())) return true;
      this.demote();
    } catch (error) {
      console.error("Lease check failed", error);
    }
    return false;
  }
  get ready() {
    return this.loaded && this.owns();
  }
  run<T>(action: () => T): T {
    if (!this.owns()) throw new Fault("unavailable");
    return this.store.leases.run(this.holder, action, this.time.now());
  }
  private demote() {
    if (this.stopped) return;
    this.stop();
    this.lost();
  }
  stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.cancelPoll?.();
    this.cancelHeartbeat?.();
    if (this.active) {
      try {
        this.store.leases.release(this.holder);
      } catch (error) {
        console.error("Lease release failed", error);
      }
    }
    this.active = false;
  }
}
