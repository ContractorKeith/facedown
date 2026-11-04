import { fold } from "../../engine/core/fold";
import { registry } from "../../engine/registry";
import type { Store } from "../store";
import type { Table } from "./types";

export function rebuild(store: Store, tables: Map<string, Table>): void {
  for (const id of store.listLiveIds()) {
    try {
      const record = store.loadGame(id);
      if (!record) throw new Error("Missing live game");
      const game = registry.get(record.type);
      if (
        !game ||
        JSON.stringify(game.ruleset) !== JSON.stringify(record.ruleset)
      )
        throw new Error("Unsupported saved ruleset");
      const rebuilt = fold(game, record.seed, record.moves);
      if (!rebuilt.ok) throw new Error(`Corrupt move log: ${record.id}`);
      const table: Table = {
        id: record.id,
        type: record.type,
        host: record.host,
        casual: record.casual,
        rated: record.rated,
        overSent: new Set(),
        game,
        seed: record.seed,
        commitment: record.commitment,
        state: rebuilt.state,
        seq: record.moves.length,
        status: "live",
        deadline: null,
        viewers: new Map(),
        seats: record.seats.map((s) => ({
          session: s.session,
          accountId: s.accountId,
          name: s.name ?? "bot",
          bot: s.bot,
          sockets: new Set(),
        })),
      };
      tables.set(table.id, table);
    } catch {
      store.abandon(id);
      console.warn(`Abandoned corrupt game: ${id}`);
    }
  }
}
