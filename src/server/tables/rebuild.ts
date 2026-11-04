import { canonicalJSON, moveLogHash } from "../../engine/core/log-hash";
import { registry } from "../../engine/registry";
import type { LeaseGuard } from "../lease";
import type { Store } from "../store";
import type { Table } from "./types";

// Small logs finish synchronously; large replays yield so heartbeats and health run.
export function rebuild(
  store: Store,
  tables: Map<string, Table>,
  guard: LeaseGuard,
): void | Promise<void> {
  const steps = rebuildSteps(store, tables, guard);
  if (steps.next().done) return;
  return (async () => {
    do {
      await Bun.sleep(0);
    } while (!steps.next().done);
  })();
}
function* rebuildSteps(
  store: Store,
  tables: Map<string, Table>,
  guard: LeaseGuard,
) {
  let yieldedAt = performance.now();
  for (const id of store.listLiveIds()) {
    guard(() => {});
    try {
      const record = store.loadGame(id);
      if (!record) throw new Error("Missing live game");
      const game = registry.get(record.type);
      if (
        !game ||
        canonicalJSON(game.ruleset) !== canonicalJSON(record.ruleset)
      )
        throw new Error("Unsupported saved ruleset");
      let state = game.init(record.seed, game.ruleset);
      for (const envelope of record.moves) {
        const result = game.apply(state, envelope);
        if (!result.ok) throw new Error(`Corrupt move log: ${record.id}`);
        state = result.state;
        if (performance.now() - yieldedAt >= 50) {
          yield;
          guard(() => {});
          yieldedAt = performance.now();
        }
      }
      const table: Table = {
        id: record.id,
        created: record.created,
        type: record.type,
        host: record.host,
        casual: record.casual,
        rated: record.rated,
        overSent: new Set(),
        game,
        seed: record.seed,
        commitment: record.commitment,
        logHash: moveLogHash(record.commitment, record.moves),
        lastMove: record.moves.at(-1) ?? null,
        state,
        seq: record.moves.length,
        status: "live",
        deadline: null,
        viewers: new Map(),
        seats: record.seats.map((s) => ({
          session: s.session,
          accountId: s.accountId,
          name: s.name ?? "bot",
          bot: s.botNow ?? s.bot,
          sockets: new Set(),
        })),
      };
      tables.set(table.id, table);
      if (performance.now() - yieldedAt >= 50) {
        yield;
        yieldedAt = performance.now();
      }
    } catch {
      guard(() => store.abandon(id));
      console.warn(`Abandoned corrupt game: ${id}`);
    }
  }
}
