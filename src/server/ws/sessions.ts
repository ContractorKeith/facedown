import type { ServerWebSocket } from "bun";
import type { Tables } from "../tables";
import type { SocketData } from ".";
export class SessionSockets {
  private sessions = new Map<string, Set<ServerWebSocket<SocketData>>>();
  constructor(private tables: Tables) {}
  add(ws: ServerWebSocket<SocketData>): boolean {
    const sockets = this.sessions.get(ws.data.session.id) ?? new Set();
    if (sockets.size >= 8) return false;
    let account = 0,
      ip = 0;
    for (const group of this.sessions.values())
      for (const existing of group) {
        if (
          ws.data.session.accountId &&
          existing.data.session.accountId === ws.data.session.accountId
        )
          account++;
        if (ws.data.ip && existing.data.ip === ws.data.ip) ip++;
      }
    if (account >= 16 || ip >= 32) return false;
    sockets.add(ws);
    this.sessions.set(ws.data.session.id, sockets);
    return true;
  }
  remove(ws: ServerWebSocket<SocketData>): void {
    const sockets = this.sessions.get(ws.data.session.id);
    sockets?.delete(ws);
    if (!sockets?.size) this.sessions.delete(ws.data.session.id);
  }
  ping(): void {
    for (const sockets of this.sessions.values())
      for (const ws of sockets) ws.data.peer?.send({ t: "ping" });
  }
  closeAll(): void {
    for (const sockets of this.sessions.values())
      for (const ws of sockets) ws.close(1012, "Service restart");
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
