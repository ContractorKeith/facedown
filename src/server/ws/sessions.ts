import type { ServerWebSocket } from "bun";
import type { Tables } from "../tables";
import type { SocketData } from ".";
export class SessionSockets {
  private sessions = new Map<string, Set<ServerWebSocket<SocketData>>>();
  constructor(private tables: Tables) {}
  add(ws: ServerWebSocket<SocketData>): void {
    const sockets = this.sessions.get(ws.data.session.id) ?? new Set();
    sockets.add(ws);
    this.sessions.set(ws.data.session.id, sockets);
  }
  remove(ws: ServerWebSocket<SocketData>): void {
    const sockets = this.sessions.get(ws.data.session.id);
    sockets?.delete(ws);
    if (!sockets?.size) this.sessions.delete(ws.data.session.id);
  }
  revoke(id: string): void {
    const sockets = this.sessions.get(id);
    this.sessions.delete(id);
    for (const ws of sockets ?? []) {
      const peer = ws.data.peer;
      ws.data.peer = undefined;
      if (peer) this.tables.disconnect(peer);
      ws.close(1008, "Session revoked");
    }
  }
}
