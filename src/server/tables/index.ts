import { commitment } from "../../engine/core/random";
import type { GameType, Seat } from "../../engine/core/types";
import { type Clock, clock, openTTL, type Timing, timing } from "../clock";
import { randomHex, type Session } from "../http/sessions";
import { TableLease } from "../lease";
import type { Store } from "../store";
import { Creation } from "./creation";
import { Lifecycle } from "./lifecycle";
import { Membership } from "./membership";
import { rebuild } from "./rebuild";
import { Retention } from "./retention";
import {
  Fault,
  owns,
  type Peer,
  publicSeats,
  ratedIfStarted,
  type Table,
} from "./types";

export class Tables {
  private tables = new Map<string, Table>();
  readonly lifecycle: Lifecycle;
  private membership: Membership;
  private creation: Creation;
  readonly retention: Retention;
  constructor(
    store: Store,
    time: Clock = clock,
    delays: Timing = timing(),
    ttl = openTTL(),
    leaseOptions: { clock?: Clock; lost?: () => void } = {},
  ) {
    this.lifecycle = new Lifecycle(store, time, delays, (table) =>
      this.retention.changed(table),
    );
    this.retention = new Retention(this.tables, this.lifecycle, ttl);
    this.creation = new Creation(this.tables, this.lifecycle, this.retention);
    this.membership = new Membership(
      this.lifecycle,
      (id) => this.get(id),
      () => this.tables.values(),
      (table) => {
        if (table.status === "open" && !table.seats.some((s) => s?.session))
          this.retention.remove(table);
        else this.retention.changed(table);
      },
    );
    this.lease = new TableLease(
      store,
      (guard) => {
        const schedule = () => {
          if (this.lifecycle.closed) return;
          for (const table of this.tables.values()) {
            this.lifecycle.schedule(table);
            table.seats.forEach((_, seat) => {
              this.lifecycle.hold(table, seat);
            });
          }
        };
        const rebuilding = rebuild(store, this.tables, guard);
        if (rebuilding) return rebuilding.then(schedule);
        schedule();
      },
      () => {
        this.stop();
        leaseOptions.lost?.();
      },
      leaseOptions.clock,
    );
    this.lifecycle.guard = (action) => this.lease.run(action);
  }
  readonly lease: TableLease;
  get ready() {
    return !this.lifecycle.closed && this.lease.ready;
  }
  private available() {
    if (!this.ready) throw new Fault("unavailable");
  }

  get(id: string): Table {
    this.available();
    const table = this.tables.get(id);
    if (!table) throw new Fault("not_found");
    if (table.status === "unavailable") throw new Fault("unavailable");
    return table;
  }
  list() {
    this.available();
    const recent = [...this.tables.values()]
      .reverse()
      .sort((a, b) => b.created - a.created);
    return [
      ...recent.filter((t) => t.status === "open").slice(0, 50),
      ...recent.filter((t) => t.status === "live").slice(0, 50),
    ].map((t) => ({
      id: t.id,
      type: t.type,
      status: t.status,
      seats: publicSeats(t),
    }));
  }
  create(type: GameType, host: Session, casual = false): Table {
    this.available();
    return this.creation.create(type, host, casual);
  }
  createFromJSON(host: Session, read: () => Promise<unknown>): Promise<Table> {
    this.available();
    return this.creation.fromJSON(host, async () => {
      const body = await read();
      this.available();
      return body;
    });
  }
  private hosted(id: string, session: Session): Table {
    const table = this.get(id);
    if (
      table.host !== session.id &&
      !table.seats.some((s) => s?.session === table.host && owns(s, session))
    )
      throw new Fault("forbidden");
    if (table.status !== "open") throw new Fault("bad_request");
    return table;
  }
  fill(id: string, host: Session): void {
    const table = this.hosted(id, host);
    table.seats = table.seats.map(
      (s) => s ?? { session: null, name: "bot", bot: true, sockets: new Set() },
    );
    this.lifecycle.broadcast(table);
  }
  start(id: string, host: Session): void {
    const table = this.hosted(id, host);
    if (table.seats.some((s) => !s)) throw new Fault("bad_request");
    const rated = ratedIfStarted(table);
    const seed = randomHex();
    const committed = commitment(seed);
    const state = table.game.init(seed, table.game.ruleset);
    this.lease.run(() =>
      this.lifecycle.store.createGame({
        rated,
        id: table.id,
        type: table.type,
        ruleset: table.game.ruleset,
        seed,
        commitment: committed,
        host: table.host,
        casual: table.casual,
        created: table.created,
        seats: table.seats.map((s, seat) => ({
          seat: seat as Seat,
          session: s?.session ?? null,
          accountId: s?.accountId ?? null,
          name: s?.name ?? null,
          bot: !!s?.bot,
          leaver: false,
        })),
      }),
    );
    table.seed = seed;
    table.commitment = committed;
    table.logHash = committed;
    table.state = state;
    table.rated = rated;
    table.status = "live";
    this.retention.changed(table);
    this.lifecycle.schedule(table);
    table.seats.forEach((_, seat) => {
      this.lifecycle.hold(table, seat);
    });
    this.lifecycle.broadcast(table);
  }
  releaseGuest(session: Session): void {
    this.membership.releaseGuest(session);
  }
  join(id: string, seat: Seat, peer: Peer) {
    this.membership.join(id, seat, peer);
  }
  spectate(id: string, peer: Peer) {
    this.membership.spectate(id, peer);
  }
  leave(id: string, peer: Peer) {
    this.membership.leave(id, peer);
  }
  disconnect(peer: Peer) {
    this.membership.disconnect(peer);
  }
  move(id: string, seq: number, move: unknown, peer: Peer) {
    this.membership.move(id, seq, move, peer);
  }
  react(id: string, reaction: string, peer: Peer) {
    this.membership.react(id, reaction, peer);
  }
  stop(): void {
    this.lifecycle.closed = true;
    this.lease?.stop();
    for (const table of this.tables.values()) this.lifecycle.stop(table);
  }
}
