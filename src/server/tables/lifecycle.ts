import type { Envelope } from "../../engine/core/types";
import type { Clock, Timing } from "../clock";
import type { Store } from "../store";
import { Fault, type Peer, publicSeats, type Table } from "./types";

export class Lifecycle {
  closed = false;
  constructor(
    readonly store: Store,
    readonly clock: Clock,
    readonly timing: Timing,
  ) {}
  send(table: Table, peer: Peer): void {
    const viewer = table.viewers.get(peer);
    if (!viewer) return;
    peer.send({
      t: "view",
      table: table.id,
      seq: table.seq,
      view: table.game.view(table.state, viewer),
      toAct: table.status === "open" ? null : table.game.toAct(table.state),
      deadline: table.deadline,
      seats: publicSeats(table),
      commitment: table.commitment,
    });
    if (table.status === "finished")
      peer.send({
        t: "over",
        table: table.id,
        outcome: table.game.outcome(table.state),
        seed: table.seed,
      });
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
    table.cancelTurn = this.clock.after(delay, () => {
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
    occupant.cancelHold = this.clock.after(this.timing.hold, () => {
      occupant.bot = true;
      if (table.game.toAct(table.state) === seat) this.schedule(table);
      this.broadcast(table);
    });
  }
  leave(table: Table, peer: Peer): void {
    const viewer = table.viewers.get(peer);
    table.viewers.delete(peer);
    if (viewer && "seat" in viewer) {
      table.seats[viewer.seat]?.sockets.delete(peer);
      this.hold(table, viewer.seat);
    }
  }
  stop(table: Table): void {
    table.cancelTurn?.();
    for (const seat of table.seats) seat?.cancelHold?.();
  }
}
