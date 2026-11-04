import type { Envelope } from "../../engine/core/types";
import type { Clock, Timing } from "../clock";
import type { Store } from "../store";
import {
  Fault,
  type Peer,
  publicSeats,
  ratedIfStarted,
  type Table,
} from "./types";

export class Lifecycle {
  closed = false;
  constructor(
    readonly store: Store,
    readonly clock: Clock,
    readonly timing: Timing,
    readonly changed: (table: Table) => void = () => {},
  ) {}
  // Every scheduled callback isolates failure to its table.
  after(table: Table, ms: number, callback: () => void): () => void {
    return this.clock.after(ms, () => {
      if (this.closed || table.status === "unavailable") return;
      try {
        callback();
      } catch (error) {
        this.freeze(table, error);
      }
    });
  }
  freeze(table: Table, error: unknown): void {
    if (table.status === "unavailable") return;
    this.stop(table);
    table.status = "unavailable";
    console.warn(`Table unavailable: ${table.id}`, error);
    for (const peer of table.viewers.keys()) {
      try {
        peer.send({
          t: "error",
          code: "unavailable",
          message: "Table unavailable",
        });
      } catch {}
    }
    this.changed(table);
  }
  send(table: Table, peer: Peer): void {
    const viewer = table.viewers.get(peer);
    if (!viewer) return;
    peer.send({
      t: "view",
      status: table.status,
      rated:
        table.status === "open"
          ? ratedIfStarted(table)
          : (table.rated ?? false),
      table: table.id,
      seq: table.seq,
      host: table.host === peer.session.id,
      view: table.game.view(table.state, viewer),
      toAct: table.status === "open" ? null : table.game.toAct(table.state),
      deadline: table.deadline,
      seats: publicSeats(table),
      commitment: table.commitment,
    });
    if (table.status === "finished" && !table.overSent.has(peer)) {
      table.overSent.add(peer);
      peer.send({
        t: "over",
        table: table.id,
        outcome: table.game.outcome(table.state),
        seed: table.seed,
      });
    }
  }
  broadcast(table: Table): void {
    for (const peer of table.viewers.keys()) this.send(table, peer);
  }
  schedule(table: Table): void {
    table.cancelTurn?.();
    table.deadline = null;
    if (this.closed || table.status !== "live") return;
    const seat = table.game.toAct(table.state);
    if (seat === null) return;
    const bot = table.seats[seat]?.bot;
    const delay = bot ? this.timing.bot : this.timing.turn;
    table.deadline = this.clock.now() + delay;
    table.cancelTurn = this.after(table, delay, () => {
      const envelope: Envelope<unknown> = bot
        ? {
            seat,
            move: table.game.bot(
              table.game.view(table.state, { seat }),
              table.game.legalMoves(table.state, seat),
            ),
          }
        : { seat, timeout: true };
      this.apply(table, envelope);
    });
  }
  apply(table: Table, envelope: Envelope<unknown>): void {
    if (table.status !== "live") throw new Fault("bad_request");
    const result = table.game.apply(table.state, envelope);
    if (!result.ok)
      throw new Fault(
        result.error.code === "game_over" ? "bad_request" : result.error.code,
      );
    const outcome = table.game.outcome(result.state);
    this.store.appendMove(
      table.id,
      table.seq + 1,
      envelope,
      this.clock.now(),
      outcome
        ? {
            outcome,
            leavers: table.seats.map((s) => !!s?.session && s.bot),
          }
        : undefined,
    );
    table.state = result.state;
    table.seq++;
    if (outcome) {
      table.status = "finished";
      for (const occupant of table.seats) occupant?.cancelHold?.();
    }
    this.schedule(table);
    this.broadcast(table);
    this.changed(table);
  }
  hold(table: Table, seat: number): void {
    const occupant = table.seats[seat];
    if (
      this.closed ||
      !occupant ||
      occupant.bot ||
      occupant.sockets.size ||
      table.status !== "live"
    )
      return;
    occupant.cancelHold?.();
    occupant.cancelHold = this.after(table, this.timing.hold, () => {
      occupant.bot = true;
      if (table.game.toAct(table.state) === seat) this.schedule(table);
      this.broadcast(table);
    });
  }
  leave(table: Table, peer: Peer): void {
    const viewer = table.viewers.get(peer);
    table.viewers.delete(peer);
    if (viewer && "seat" in viewer) {
      const occupant = table.seats[viewer.seat];
      occupant?.sockets.delete(peer);
      if (table.status === "open" && occupant && !occupant.sockets.size) {
        this.releaseOpen(table, viewer.seat);
      } else this.hold(table, viewer.seat);
    }
  }
  releaseOpen(table: Table, seat: number): void {
    const occupant = table.seats[seat];
    if (table.status !== "open" || !occupant) return;
    table.seats[seat] = null;
    if (table.host !== occupant.session) return;
    table.host = "";
    for (let offset = 1; offset <= 4; offset++) {
      const next = table.seats[(seat + offset) % 4]?.session;
      if (next) {
        table.host = next;
        break;
      }
    }
  }
  stop(table: Table): void {
    table.cancelTurn?.();
    table.cancelExpiry?.();
    table.deadline = null;
    for (const seat of table.seats) seat?.cancelHold?.();
  }
}
