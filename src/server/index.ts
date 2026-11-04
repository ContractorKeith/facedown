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
  leaseClock?: Clock;
  exit?: (code: number) => void;
};
export function startServer(options: ServerOptions = {}) {
  const store = new Store(options.db);
  let tables: Tables;
  let failed = false;
  let exitTimer: ReturnType<typeof setTimeout> | undefined;
  const demote = () => {
    failed = true;
    // Queue initialization failures too; the server and socket hub exist by then.
    queueMicrotask(() => {
      sockets.closeAll();
      // Allow the 1012 frames to flush before terminating this fenced process.
      exitTimer = setTimeout(() => (options.exit ?? process.exit)(1), 100);
    });
  };
  try {
    tables = new Tables(
      store,
      options.clock,
      options.timing ?? timing(),
      options.openTTL,
      { clock: options.leaseClock, lost: demote },
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
  let stopPromise: Promise<void> | undefined;
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
        if (
          failed ||
          (stopping && new URL(request.url).pathname !== "/healthz")
        )
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
    stop() {
      if (stopPromise) return stopPromise;
      stopping = true;
      tables.lifecycle.closed = true;
      stopPromise = (async () => {
        await Promise.allSettled([...pending]);
        sockets.closeAll();
        tables.stop();
        await server.stop(true);
        // Closing sockets can invoke disconnect handlers; cancel their holds too.
        tables.stop();
        clearTimeout(exitTimer);
        store.close();
      })();
      return stopPromise;
    },
  };
}
