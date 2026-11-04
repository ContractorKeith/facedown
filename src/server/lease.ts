import type { Store } from "./store";
import { Fault } from "./tables/types";

// A unique token fences even a resumed process after its heartbeat expires.
export class TableLease {
  private holder = crypto.randomUUID();
  private active = false;
  private stopped = false;
  private poll?: ReturnType<typeof setInterval>;
  private heartbeat?: ReturnType<typeof setInterval>;
  constructor(
    private store: Store,
    acquired: () => void,
    lost: () => void,
  ) {
    const attempt = () => {
      if (this.stopped || !store.leases.claim(this.holder)) return;
      this.active = true;
      if (this.poll) clearInterval(this.poll);
      try {
        this.run(acquired);
        this.heartbeat = setInterval(() => {
          try {
            if (!store.leases.heartbeat(this.holder)) lost();
          } catch {
            lost();
          }
        }, 5000);
        this.heartbeat.unref();
      } catch (error) {
        this.stop();
        throw error;
      }
    };
    attempt();
    if (!this.active) {
      this.poll = setInterval(() => {
        try {
          attempt();
        } catch (error) {
          console.error("Lease acquisition failed", error);
          lost();
        }
      }, 250);
      this.poll.unref();
    }
  }
  get ready() {
    return this.active && !this.stopped && this.store.leases.owns(this.holder);
  }
  run<T>(action: () => T): T {
    if (!this.active || this.stopped) throw new Fault("unavailable");
    return this.store.leases.run(this.holder, action);
  }
  stop() {
    this.stopped = true;
    clearInterval(this.poll);
    clearInterval(this.heartbeat);
    if (this.active) this.store.leases.release(this.holder);
    this.active = false;
  }
}
