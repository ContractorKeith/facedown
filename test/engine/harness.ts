import { deepStrictEqual, ok } from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
import { fold } from "../../src/engine/core/fold";
import type { Envelope, Viewer } from "../../src/engine/core/types";
import { seats } from "../../src/engine/core/types";
import type { GameEntry, Place } from "../../src/engine/registry";
import { canonical } from "./canonical";

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object")
    return Object.entries(value).flatMap(([key, item]) => [
      key,
      ...strings(item),
    ]);
  return [];
}
function visible(places: readonly Place[], viewer: Viewer): boolean {
  return places.some(
    (place) =>
      "public" in place ||
      ("seat" in place && "seat" in viewer && place.seat === viewer.seat),
  );
}
const viewers: Viewer[] = [
  ...seats.map((seat) => ({ seat })),
  { spectator: true },
];

export function playout<S, M, V, R, K extends string>(
  entry: GameEntry<S, M, V, R, K>,
  seed: string,
) {
  const game = entry;
  const moves: Envelope<M>[] = [];
  let state = game.init(seed, game.ruleset);
  const pieces = [...entry.locate(state).keys()].sort();
  const check = () => {
    const locations = entry.locate(state);
    deepStrictEqual(
      [...locations.keys()].sort(),
      pieces,
      "conservation: piece set changed",
    );
    for (const places of locations.values())
      ok(places.length === 1, "conservation: duplicate or missing piece");
    for (const viewer of viewers) {
      for (const id of strings(game.view(state, viewer))) {
        const places = locations.get(id);
        if (places) ok(visible(places, viewer), `no leak: ${id}`);
      }
    }
    const replay = fold(game, seed, moves);
    ok(replay.ok, "determinism: replay rejected a move");
    deepStrictEqual(replay.state, state, "determinism: refold differs");
  };
  try {
    check();
    while (game.toAct(state) !== null) {
      ok(moves.length < entry.maxMoves, "termination: move bound exceeded");
      const seat = game.toAct(state);
      ok(seat !== null);
      const before = structuredClone(state);
      const legal = game.legalMoves(state, seat);
      const move = game.bot(game.view(state, { seat }), legal);
      ok(
        legal.some((candidate) => canonical(candidate) === canonical(move)),
        "legality: bot chose illegal move",
      );
      const rejected = game.apply(state, {
        seat,
        move: entry.illegalMove(state, seat),
      });
      ok(!rejected.ok, "legality: illegal move accepted");
      deepStrictEqual(state, before, "legality: rejection mutated input");
      // Include timeout envelopes so replay verifies deterministic timeout resolution too.
      const envelope: Envelope<M> =
        moves.length % 7 === 0 ? { seat, timeout: true } : { seat, move };
      const result = game.apply(state, envelope);
      ok(result.ok, "legality: legal move rejected");
      deepStrictEqual(state, before, "apply mutated input");
      moves.push(envelope);
      state = result.state;
      check();
    }
    ok(game.outcome(state), "termination: missing outcome");
    entry.checkOutcome(state);
    return { state, moves };
  } catch (cause) {
    mkdirSync(".tmp", { recursive: true });
    const path = `.tmp/playout-${game.type}-${seed}.json`;
    writeFileSync(
      path,
      JSON.stringify(
        { type: game.type, ruleset: game.ruleset, seed, moves },
        null,
        2,
      ),
    );
    throw new Error(
      `seed=${seed} moves=${moves.length} replay=${path}: ${String(cause)}`,
      { cause },
    );
  }
}
