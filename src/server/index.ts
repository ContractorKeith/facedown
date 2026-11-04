import { type Clock, type Timing, timing } from "./clock";
import { handler } from "./http";
import { GuestSessions, type SessionResolver } from "./http/sessions";
import { Store } from "./store";
import { Tables } from "./tables";
import { type SocketData, websocket } from "./ws";

export type ServerOptions = {
  port?: number;
  hostname?: string;
  db?: string;
  clock?: Clock;
  timing?: Timing;
  sessions?: SessionResolver;
};
export function startServer(options: ServerOptions = {}) {
  const store = new Store(options.db);
  let tables: Tables;
  try {
    tables = new Tables(store, options.clock, options.timing ?? timing());
  } catch (error) {
    store.close();
    throw error;
  }
  let server: ReturnType<typeof Bun.serve<SocketData>>;
  try {
    server = Bun.serve<SocketData>({
      port: options.port ?? Number(process.env.PORT ?? 8080),
      hostname: options.hostname ?? "0.0.0.0",
      maxRequestBodySize: 4096,
      fetch: handler(store, tables, options.sessions ?? new GuestSessions()),
      websocket: websocket(tables),
    });
  } catch (error) {
    tables.stop();
    store.close();
    throw error;
  }
  return {
    server,
    store,
    tables,
    async stop() {
      tables.stop();
      await server.stop(true);
      // Closing sockets can invoke disconnect handlers; cancel their holds too.
      tables.stop();
      store.close();
    },
  };
}
