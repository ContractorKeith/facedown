import type { Page, WebSocketRoute } from "@playwright/test";
import { moveLogHash } from "../../src/engine/core/log-hash";
import { registry } from "../../src/engine/registry";
import { replayFixture } from "./replay-fixture";

// Drive real client subscriptions with deterministic protocol frames.
export async function tableFixture(
  page: Page,
  type: "spades" | "dominoes" = "spades",
) {
  const record = replayFixture(type);
  const found = registry.get(type);
  if (!found) throw new Error("Missing game");
  const game = found;
  const id = "abcdefghij";
  await page.route("**/api/me", (route) =>
    route.fulfill({ json: { name: "same_name", guest: true } }),
  );
  const seats = [0, 1, 2, 3].map(() => ({
    name: "same_name",
    bot: false,
    connected: true,
  }));
  const table = { id, type, status: "open", seats, host: true, rated: false };
  await page.route(`**/api/tables/${id}`, (route) =>
    route.fulfill({ json: table }),
  );
  await page.route("**/api/tables", (route) =>
    route.fulfill({ json: [table] }),
  );
  await page.route(`**/api/games/${id}`, (route) =>
    route.fulfill({ json: record }),
  );
  let socket: WebSocketRoute | undefined;
  let seq = 0;
  let open = true;
  let you = 0;
  let rewrite = false;
  const sent: Record<string, unknown>[] = [];
  function frame() {
    let state = game.init(record.seed, game.ruleset);
    for (const move of record.moves.slice(0, seq)) {
      const result = game.apply(state, move);
      if (!result.ok) throw new Error(result.error.message);
      state = result.state;
    }
    return {
      t: "view",
      table: id,
      seq,
      seats,
      you,
      host: true,
      rated: false,
      status: open ? "open" : seq === record.moves.length ? "finished" : "live",
      view: open ? null : game.view(state, { seat: you as 0 | 1 | 2 | 3 }),
      toAct: open ? null : game.toAct(state),
      deadline: null,
      commitment: open ? null : record.commitment,
      logHash: open
        ? null
        : rewrite
          ? "00".repeat(32)
          : moveLogHash(record.commitment, record.moves.slice(0, seq)),
      lastMove: seq ? record.moves[seq - 1] : null,
    };
  }
  await page.routeWebSocket("**/ws", (route) => {
    socket = route;
    route.onMessage((data) => {
      const message = JSON.parse(String(data));
      sent.push(message);
      if (message.t === "join" || message.t === "spectate")
        route.send(JSON.stringify(frame()));
      if (message.t === "move") {
        seq++;
        route.send(JSON.stringify(frame()));
      }
    });
  });
  return {
    id,
    record,
    sent,
    send(
      next: number,
      options: { open?: boolean; you?: number; rewrite?: boolean } = {},
    ) {
      seq = next;
      open = options.open ?? false;
      you = options.you ?? you;
      rewrite = options.rewrite ?? false;
      if (!socket) throw new Error("Client did not subscribe");
      socket.send(JSON.stringify(frame()));
    },
  };
}
