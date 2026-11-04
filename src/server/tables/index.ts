import { fold } from "../../engine/core/fold";
import { commitment } from "../../engine/core/random";
import type { GameType, Seat } from "../../engine/core/types";
import { registry } from "../../engine/registry";
import { type Clock, clock, type Timing, timing } from "../clock";
import { randomHex, type Session } from "../http/sessions";
import type { Store } from "../store";
import { Lifecycle } from "./lifecycle";
import { Membership } from "./membership";
import { Fault, type Peer, publicSeats, type Table } from "./types";

export class Tables {
  private tables = new Map<string, Table>();
  readonly lifecycle: Lifecycle;
  private membership: Membership;
  constructor(store: Store, time: Clock = clock, delays: Timing = timing()) {
    this.lifecycle = new Lifecycle(store, time, delays);
    this.membership = new Membership(
      this.lifecycle,
      (id) => this.get(id),
      () => this.tables.values(),
    );
    for (const record of store.listLive()) {
      const game = registry.get(record.type);
      if (
        !game ||
        JSON.stringify(game.ruleset) !== JSON.stringify(record.ruleset)
      )
        throw new Error("Unsupported saved ruleset");
      const rebuilt = fold(game, record.seed, record.moves);
      if (!rebuilt.ok) throw new Error(`Corrupt move log: ${record.id}`);
      const table: Table = {
        id: record.id,
        type: record.type,
        host: record.host,
        game,
        seed: record.seed,
        commitment: record.commitment,
        state: rebuilt.state,
        seq: record.moves.length,
        status: "live",
        deadline: null,
        viewers: new Map(),
        seats: record.seats.map((s) => ({
          session: s.session,
          name: s.name ?? "bot",
          bot: s.bot,
          sockets: new Set(),
        })),
      };
      this.tables.set(table.id, table);
    }
    for (const table of this.tables.values()) {
      this.lifecycle.schedule(table);
      table.seats.forEach((_, seat) => {
        this.lifecycle.hold(table, seat);
      });
    }
  }
  get(id: string): Table {
    const table = this.tables.get(id);
    if (!table) throw new Fault("not_found");
    return table;
  }
  list() {
    return [...this.tables.values()]
      .filter((t) => t.status !== "finished")
      .map((t) => ({
        id: t.id,
        type: t.type,
        status: t.status,
        seats: publicSeats(t),
      }));
  }
  create(type: GameType, host: Session): Table {
    const game = registry.get(type);
    if (!game) throw new Fault("bad_request");
    const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
    let id: string;
    do {
      id = Array.from(
        crypto.getRandomValues(new Uint8Array(10)),
        (b) => alphabet[b % 32],
      ).join("");
    } while (this.tables.has(id) || this.lifecycle.store.loadGame(id));
    const seed = randomHex();
    const table: Table = {
      id,
      type,
      host: host.id,
      game,
      seed,
      commitment: commitment(seed),
      state: game.init(seed, game.ruleset),
      seq: 0,
      status: "open",
      deadline: null,
      viewers: new Map(),
      seats: [
        { session: host.id, name: host.name, bot: false, sockets: new Set() },
        null,
        null,
        null,
      ],
    };
    this.tables.set(id, table);
    return table;
  }
  private hosted(id: string, session: Session): Table {
    const table = this.get(id);
    if (table.host !== session.id) throw new Fault("forbidden");
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
    this.lifecycle.store.createGame({
      id: table.id,
      type: table.type,
      ruleset: table.game.ruleset,
      seed: table.seed,
      commitment: table.commitment,
      host: table.host,
      created: this.lifecycle.clock.now(),
      seats: table.seats.map((s, seat) => ({
        seat: seat as Seat,
        session: s?.session ?? null,
        name: s?.name ?? null,
        bot: !!s?.bot,
        leaver: false,
      })),
    });
    table.status = "live";
    this.lifecycle.schedule(table);
    table.seats.forEach((_, seat) => {
      this.lifecycle.hold(table, seat);
    });
    this.lifecycle.broadcast(table);
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
    for (const table of this.tables.values()) this.lifecycle.stop(table);
  }
}
