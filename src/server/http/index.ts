import type { Server } from "bun";
import type { Store } from "../store";
import type { Tables } from "../tables";
import { Fault } from "../tables/types";
import type { SocketData } from "../ws";
import { Auth, identity } from "./auth";
import type { SessionResolver } from "./sessions";

const json = (value: unknown, status = 200, headers?: HeadersInit) =>
  Response.json(value, { status, headers });
export function handler(
  store: Store,
  tables: Tables,
  sessions: SessionResolver,
  origin?: string,
) {
  const auth = new Auth(store, sessions);
  return async (
    request: Request,
    server: Server<SocketData>,
  ): Promise<Response | undefined> => {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (
        request.method !== "GET" &&
        request.headers.get("origin") !== (origin || url.origin)
      )
        throw new Fault("forbidden");
      if (path === "/healthz" && request.method === "GET")
        return new Response("ok");
      if (path === "/api/guest" && request.method === "POST") {
        const guest = sessions.guest();
        return json({ name: guest.session.name, guest: true }, 200, {
          "set-cookie": guest.cookie,
        });
      }
      const authenticated = await auth.handle(path, request, server);
      if (authenticated) return authenticated;
      const session = sessions.resolve(request);
      if (
        !session &&
        (path.startsWith("/api/") || path === "/ws") &&
        /(?:^|;)\s*(?:fd|__Host-fd)=/.test(request.headers.get("cookie") ?? "")
      )
        throw new Fault("unauthorized");
      if (path === "/ws" && request.method === "GET") {
        if (request.headers.get("origin") !== (origin || url.origin))
          throw new Fault("forbidden");
        if (!session) throw new Fault("unauthorized");
        if (server.upgrade(request, { data: { session } })) return;
        throw new Fault("bad_request");
      }
      if (path === "/api/me" && request.method === "GET") {
        if (!session) throw new Fault("unauthorized");
        return json(identity(session));
      }
      if (path === "/api/logout" && request.method === "POST") {
        if (!session || !sessions.logout) throw new Fault("unauthorized");
        return new Response(null, {
          status: 204,
          headers: { "set-cookie": sessions.logout(session) },
        });
      }
      const player = /^\/api\/players\/([a-zA-Z0-9_]{3,20})$/.exec(path);
      if (player && request.method === "GET") {
        const account = store.accounts.find(
          (player[1] as string).toLowerCase(),
        );
        if (!account) throw new Fault("not_found");
        return json({
          username: account.username,
          ...store.ratings.profile(account.id),
        });
      }
      const leaderboard = /^\/api\/leaderboard\/(spades|dominoes)$/.exec(path);
      if (leaderboard && request.method === "GET")
        return json(
          store.ratings.leaderboard(leaderboard[1] as "spades" | "dominoes"),
        );
      if (path === "/api/tables") {
        if (request.method === "GET") return json(tables.list());
        if (request.method === "POST") {
          if (!session) throw new Fault("unauthorized");
          const table = await tables.createFromJSON(session, () =>
            request.json(),
          );
          return json({ id: table.id, inviteUrl: `/tables/${table.id}` }, 201);
        }
      }
      const mutation = /^\/api\/tables\/([a-z2-7]{10})\/(bots|start)$/.exec(
        path,
      );
      if (mutation && request.method === "POST") {
        if (!session) throw new Fault("unauthorized");
        const id = mutation[1] as string;
        if (mutation[2] === "bots") tables.fill(id, session);
        else tables.start(id, session);
        return json({ ok: true });
      }
      const replay = /^\/api\/games\/([a-z2-7]{10})$/.exec(path);
      if (replay && request.method === "GET") {
        const id = replay[1] as string;
        if (store.gameStatus(id) !== "finished") throw new Fault("not_found");
        const record = store.loadGame(id);
        if (record?.status !== "finished") throw new Fault("not_found");
        return json({
          rated: record.rated,
          rating_changes: store.ratings.changes(id),
          type: record.type,
          ruleset: record.ruleset,
          seats: record.seats.map((s) => ({
            seat: s.seat,
            name: s.name,
            guest_name: s.accountId ? null : s.name,
            bot_at_start: s.bot,
            leaver: s.leaver,
          })),
          commitment: record.commitment,
          seed: record.seed,
          moves: record.moves,
          outcome: record.outcome,
        });
      }
      if (
        request.method === "GET" &&
        !path.startsWith("/api/") &&
        path !== "/ws"
      )
        return new Response(
          "<!doctype html><title>facedown</title><h1>facedown</h1><p>The table is being set.</p>",
          { headers: { "content-type": "text/html; charset=utf-8" } },
        );
      throw new Fault("not_found");
    } catch (error) {
      const code = error instanceof Fault ? error.code : "bad_request";
      return json(
        { code, message: code },
        (
          {
            forbidden: 403,
            unauthorized: 401,
            not_found: 404,
            conflict: 409,
            rate_limited: 429,
            unavailable: 503,
          } as Record<string, number>
        )[code] ?? 400,
      );
    }
  };
}
