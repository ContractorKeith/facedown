import { type Clock, clock, type Timing, timing } from "./clock";
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
  insecureCookie?: boolean;
  origin?: string;
  openTTL?: number;
};
export function startServer(options: ServerOptions = {}) {
  const store = new Store(options.db);
  let tables: Tables;
  try {
    tables = new Tables(
      store,
      options.clock,
      options.timing ?? timing(),
      options.openTTL,
    );
  } catch (error) {
    store.close();
    throw error;
  }
  const sessions =
    options.sessions ??
    new GuestSessions(store, options.insecureCookie, () =>
      (options.clock ?? clock).now(),
    );
  let server: ReturnType<typeof Bun.serve<SocketData>>;
  try {
    server = Bun.serve<SocketData>({
      port: options.port ?? Number(process.env.PORT ?? 8080),
      hostname: options.hostname ?? "0.0.0.0",
      maxRequestBodySize: 4096,
      fetch: handler(
        store,
        tables,
        sessions,
        options.origin ?? process.env.FACEDOWN_ORIGIN,
      ),
      websocket: websocket(tables, sessions),
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
    sessions,
    async stop() {
      tables.stop();
      await server.stop(true);
      // Closing sockets can invoke disconnect handlers; cancel their holds too.
      tables.stop();
      store.close();
    },
  };
}
