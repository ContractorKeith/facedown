import type { Session } from "../http/sessions";
import type { Lifecycle } from "./lifecycle";
import { Fault, type Table } from "./types";

export class Retention {
  private creates = new Map<string, number[]>();
  constructor(
    private tables: Map<string, Table>,
    private lifecycle: Lifecycle,
    private ttl: number,
  ) {}
  attempt(host: Session): void {
    const now = this.lifecycle.clock.now();
    for (const [id, times] of this.creates) {
      const recent = times.filter((t) => now - t < 600000);
      if (recent.length) this.creates.set(id, recent);
      else this.creates.delete(id);
    }
    const recent = this.creates.get(host.id) ?? [];
    if (recent.length >= 10) throw new Fault("rate_limited");
    this.creates.set(host.id, [...recent, now]);
  }
  checkOpen(host: Session): void {
    if (
      [...this.tables.values()].filter(
        (t) => t.host === host.id && t.status === "open",
      ).length >= 3
    )
      throw new Fault("conflict");
  }
  changed(table: Table): void {
    if (this.lifecycle.closed || !this.tables.has(table.id)) return;
    if (table.status === "live") {
      table.cancelExpiry?.();
      table.cancelExpiry = undefined;
      return;
    }
    if (table.status === "open") {
      if (table.seats.some((s) => s?.session && s.sockets.size)) {
        table.cancelExpiry?.();
        table.cancelExpiry = undefined;
      } else if (!table.cancelExpiry)
        table.cancelExpiry = this.lifecycle.after(table, this.ttl, () =>
          this.remove(table),
        );
    } else {
      if (!table.viewers.size) this.remove(table);
      else if (table.status === "finished" && !table.cancelExpiry)
        table.cancelExpiry = this.lifecycle.after(table, 600000, () =>
          this.remove(table),
        );
    }
  }
  remove(table: Table): void {
    this.lifecycle.stop(table);
    this.tables.delete(table.id);
    for (const peer of table.viewers.keys())
      peer.send({ t: "error", code: "not_found", message: "Table closed" });
    table.viewers.clear();
    table.overSent.clear();
  }
}
