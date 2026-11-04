import { type Clock, clock, type Timing, timing } from "./clock";
import { handler } from "./http";
import { GuestSessions, type SessionResolver } from "./http/sessions";
import { Store } from "./store";
import { Tables } from "./tables";
import { type SocketData, websocket } from "./ws";
import { SessionSockets } from "./ws/sessions";

export const serverError = () =>
  Response.json(
    { code: "internal_error", message: "Internal server error" },
    { status: 500 },
  );

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
  const sockets = new SessionSockets(tables);
  let stopping = false;
  const pending = new Set<Promise<unknown>>();
  const serve = handler(
    store,
    tables,
    sessions,
    options.origin ?? process.env.FACEDOWN_ORIGIN,
    sockets,
  );
  let server: ReturnType<typeof Bun.serve<SocketData>>;
  try {
    server = Bun.serve<SocketData>({
      port: options.port ?? Number(process.env.PORT ?? 8080),
      hostname: options.hostname ?? "0.0.0.0",
      maxRequestBodySize: 4096,
      error: serverError,
      fetch(request, server) {
        if (stopping && new URL(request.url).pathname !== "/healthz")
          return Response.json(
            { code: "unavailable", message: "unavailable" },
            { status: 503 },
          );
        const response = serve(request, server);
        pending.add(response);
        void response.finally(() => pending.delete(response));
        return response;
      },
      websocket: websocket(tables, sessions, sockets),
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
      if (stopping) return;
      stopping = true;
      tables.lifecycle.closed = true;
      await Promise.allSettled([...pending]);
      sockets.closeAll();
      tables.stop();
      await server.stop(true);
      // Closing sockets can invoke disconnect handlers; cancel their holds too.
      tables.stop();
      store.close();
    },
  };
}
