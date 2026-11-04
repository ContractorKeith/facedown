import type { Server } from "bun";
import type { GameType } from "../../engine/core/types";
import type { Store } from "../store";
import type { Tables } from "../tables";
import { Fault } from "../tables/types";
import type { SocketData } from "../ws";
import type { SessionResolver } from "./sessions";

const json = (value: unknown, status = 200, headers?: HeadersInit) =>
  Response.json(value, { status, headers });
export function handler(
  store: Store,
  tables: Tables,
  sessions: SessionResolver,
  origin?: string,
) {
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
        return json({ name: session.name, guest: true });
      }
      if (path === "/api/tables") {
        if (request.method === "GET") return json(tables.list());
        if (request.method === "POST") {
          if (!session) throw new Fault("unauthorized");
          const body: unknown = await request.json();
          if (!body || typeof body !== "object" || Array.isArray(body))
            throw new Fault("bad_request");
          const b = body as Record<string, unknown>;
          if (
            !["spades", "dominoes"].includes(String(b.type)) ||
            Object.keys(b).some((k) => !["type", "casual"].includes(k)) ||
            (b.casual !== undefined && typeof b.casual !== "boolean")
          )
            throw new Fault("bad_request");
          const table = tables.create(
            b.type as GameType,
            session,
            b.casual as boolean | undefined,
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
          type: record.type,
          ruleset: record.ruleset,
          seats: record.seats.map((s) => ({
            seat: s.seat,
            guest_name: s.name,
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
