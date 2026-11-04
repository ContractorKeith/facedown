import type { ServerWebSocket } from "bun";
import type { Session, SessionResolver } from "../http/sessions";
import type { Tables } from "../tables";
import { Fault, type Peer, seatNumber } from "../tables/types";
import { Budget } from "./budget";
import type { SessionSockets } from "./sessions";

export type SocketData = { session: Session; peer?: Peer; budget?: Budget };
export function websocket(
  tables: Tables,
  sessions: SessionResolver,
  sockets: SessionSockets,
) {
  return {
    maxPayloadLength: 4096,
    open(ws: ServerWebSocket<SocketData>) {
      if (!sessions.active(ws.data.session)) {
        ws.close(1008, "Session expired");
        return;
      }
      sockets.add(ws);
      ws.data.budget = new Budget();
      ws.data.peer = {
        session: ws.data.session,
        send: (message) => {
          if (sessions.active(ws.data.session))
            ws.send(JSON.stringify(message));
        },
      };
    },
    message(ws: ServerWebSocket<SocketData>, raw: string | Buffer) {
      if (Buffer.byteLength(raw) > 4096) {
        ws.close(1009, "Message too large");
        return;
      }
      const peer = ws.data.peer;
      if (!peer) return;
      if (!sessions.active(peer.session)) {
        ws.close(1008, "Session expired");
        return;
      }
      const now = tables.lifecycle.clock.now();
      const budget = ws.data.budget as Budget;
      const reject = (result: string) => {
        peer.send({
          t: "error",
          code: "rate_limited",
          message: "rate_limited",
        });
        if (result === "close") ws.close(1008, "Sustained flooding");
      };
      // Charge every message before parsing, including invalid JSON.
      const total = budget.accept(now);
      if (total !== "ok") {
        reject(total);
        return;
      }
      try {
        const message: unknown = JSON.parse(
          typeof raw === "string" ? raw : raw.toString(),
        );
        if (!message || typeof message !== "object" || Array.isArray(message))
          throw new Fault("bad_request");
        const m = message as Record<string, unknown>;
        if (typeof m.table !== "string" || typeof m.t !== "string")
          throw new Fault("bad_request");
        const fields: Record<string, string[]> = {
          join: ["seat"],
          spectate: [],
          move: ["seq", "move"],
          react: ["id"],
          leave: [],
        };
        const extra = fields[m.t];
        if (
          !Object.hasOwn(fields, m.t) ||
          !extra ||
          Object.keys(m).some((k) => !["t", "table", ...extra].includes(k))
        )
          throw new Fault("bad_request");
        switch (m.t) {
          case "join":
            if (!seatNumber(m.seat)) throw new Fault("bad_request");
            tables.join(m.table, m.seat, peer);
            break;
          case "spectate":
            tables.spectate(m.table, peer);
            break;
          case "leave":
            tables.leave(m.table, peer);
            break;
          case "react":
            if (typeof m.id !== "string") throw new Fault("bad_request");
            tables.react(m.table, m.id, peer);
            break;
          case "move": {
            const result = budget.acceptMove(now);
            if (result !== "ok") {
              reject(result);
              return;
            }
            if (
              !Number.isSafeInteger(m.seq) ||
              Number(m.seq) < 0 ||
              !Object.hasOwn(m, "move")
            )
              throw new Fault("bad_request");
            tables.move(m.table, Number(m.seq), m.move, peer);
            break;
          }
        }
      } catch (error) {
        if (!(error instanceof Fault) && !(error instanceof SyntaxError)) {
          console.error("WebSocket operation failed", error);
        }
        const code = error instanceof Fault ? error.code : "bad_request";
        peer.send({ t: "error", code, message: code });
      }
    },
    close(ws: ServerWebSocket<SocketData>) {
      sockets.remove(ws);
      if (ws.data.peer) tables.disconnect(ws.data.peer);
    },
  };
}
