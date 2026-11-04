import type { Seat } from "../../engine/core/types";
import type { Lifecycle } from "./lifecycle";
import { Fault, type Peer, type Table } from "./types";

export class Membership {
  constructor(
    readonly lifecycle: Lifecycle,
    private getTable: (id: string) => Table,
    private all: () => Iterable<Table>,
    private changed: (table: Table) => void,
  ) {}
  join(id: string, seat: Seat, peer: Peer): void {
    const table = this.getTable(id);
    const occupant = table.seats[seat];
    if (
      occupant?.session !== peer.session.id &&
      (occupant || table.status !== "open")
    )
      throw new Fault("forbidden");
    if (
      table.seats.some(
        (s, index) => index !== seat && s?.session === peer.session.id,
      )
    )
      throw new Fault("forbidden");
    const previous = table.viewers.get(peer);
    if (previous && "seat" in previous && previous.seat !== seat)
      throw new Fault("forbidden");
    const next = occupant ?? {
      session: peer.session.id,
      name: peer.session.name,
      bot: false,
      sockets: new Set<Peer>(),
    };
    if (table.status === "finished" && next.bot) throw new Fault("forbidden");
    next.cancelHold?.();
    next.sockets.add(peer);
    const wasBot = next.bot;
    next.bot = false;
    table.seats[seat] = next;
    table.viewers.set(peer, { seat });
    if (wasBot && table.game.toAct(table.state) === seat)
      this.lifecycle.schedule(table);
    this.lifecycle.broadcast(table);
    this.changed(table);
  }
  spectate(id: string, peer: Peer): void {
    const table = this.getTable(id);
    this.lifecycle.leave(table, peer);
    table.viewers.set(peer, { spectator: true });
    this.lifecycle.send(table, peer);
    this.changed(table);
  }
  leave(id: string, peer: Peer): void {
    const table = this.getTable(id);
    this.lifecycle.leave(table, peer);
    this.lifecycle.broadcast(table);
    this.changed(table);
  }
  disconnect(peer: Peer): void {
    for (const table of this.all()) {
      table.overSent.delete(peer);
      if (!table.viewers.has(peer)) continue;
      this.lifecycle.leave(table, peer);
      if (table.status !== "unavailable") this.lifecycle.broadcast(table);
      this.changed(table);
    }
  }
  move(id: string, seq: number, move: unknown, peer: Peer): void {
    const table = this.getTable(id);
    const viewer = table.viewers.get(peer);
    if (!viewer || !("seat" in viewer)) throw new Fault("forbidden");
    if (seq !== table.seq) {
      this.lifecycle.send(table, peer);
      throw new Fault("stale_seq");
    }
    this.lifecycle.apply(table, { seat: viewer.seat, move });
  }
  react(id: string, reaction: string, peer: Peer): void {
    const table = this.getTable(id);
    const viewer = table.viewers.get(peer);
    if (!viewer || !("seat" in viewer)) throw new Fault("forbidden");
    if (!["nice", "oops", "gg", "hurry", "thanks", "wow"].includes(reaction))
      throw new Fault("bad_request");
    const occupant = table.seats[viewer.seat];
    if (!occupant) throw new Fault("forbidden");
    const now = this.lifecycle.clock.now();
    if (occupant.reactionAt !== undefined && now - occupant.reactionAt < 3000)
      throw new Fault("rate_limited");
    occupant.reactionAt = now;
    for (const client of table.viewers.keys())
      client.send({
        t: "reaction",
        table: id,
        seat: viewer.seat,
        id: reaction,
      });
  }
}
