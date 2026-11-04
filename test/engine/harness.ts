import { deepStrictEqual, ok } from "node:assert";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fold } from "../../src/engine/core/fold";
import type { Envelope, Viewer } from "../../src/engine/core/types";
import { seats } from "../../src/engine/core/types";
import { canonical } from "./canonical";
import type { GameEntry } from "./invariants";
import { checkView } from "./view-check";

export const REFOLD_INTERVAL = 64;
const viewers: Viewer[] = [
  ...seats.map((seat) => ({ seat })),
  { spectator: true },
];
export class PlayoutError extends Error {
  constructor(
    message: string,
    readonly replayPath: string,
    cause: unknown,
  ) {
    super(message, { cause });
  }
}
export function playout<S, M, V, R, K extends string>(
  entry: GameEntry<S, M, V, R, K>,
  seed: string,
  replayDir = ".tmp",
) {
  const moves: Envelope<M>[] = [];
  let state: S;
  try {
    state = entry.init(seed, entry.ruleset);
    const pieces = [...entry.pieces].sort();
    ok(
      new Set(pieces).size === pieces.length,
      "conservation: duplicate declared piece",
    );
    // These sanity checks constrain locate; its classifications are otherwise trusted.
    const initial = entry.locate(state);
    for (const seat of seats)
      ok(
        [...initial.values()].some((places) =>
          places.some((place) => "seat" in place && place.seat === seat),
        ),
        `locate: seat ${seat} must hold a piece at init`,
      );
    const check = () => {
      const locations = entry.locate(state);
      deepStrictEqual(
        [...locations.keys()].sort(),
        pieces,
        "conservation: piece set changed",
      );
      for (const places of locations.values())
        ok(places.length === 1, "conservation: duplicate or missing piece");
      for (const viewer of viewers)
        checkView(entry.view(state, viewer), viewer, locations);
      if (moves.length % REFOLD_INTERVAL === 0 || entry.toAct(state) === null) {
        const replay = fold(entry, seed, moves);
        ok(replay.ok, "determinism: replay rejected a move");
        deepStrictEqual(replay.state, state, "determinism: refold differs");
      }
    };
    check();
    while (entry.toAct(state) !== null) {
      ok(moves.length < entry.maxMoves, "termination: move bound exceeded");
      const seat = entry.toAct(state);
      ok(seat !== null);
      // Engine states are JSON data; round-trip cloning keeps long playouts cheap.
      const before = JSON.parse(JSON.stringify(state)) as S;
      const legal = entry.legalMoves(state, seat);
      const move = entry.bot(entry.view(state, { seat }), legal);
      ok(
        legal.some((candidate) => canonical(candidate) === canonical(move)),
        "legality: bot chose illegal move",
      );
      const rejected = entry.apply(state, {
        seat,
        move: entry.illegalMove(state, seat),
      });
      ok(!rejected.ok, "legality: illegal move accepted");
      deepStrictEqual(state, before, "legality: rejection mutated input");
      const envelope: Envelope<M> =
        moves.length % 7 === 0 ? { seat, timeout: true } : { seat, move };
      const result = entry.apply(state, envelope);
      ok(result.ok, "legality: legal move rejected");
      deepStrictEqual(state, before, "apply mutated input");
      moves.push(envelope);
      state = result.state;
      check();
    }
    ok(entry.outcome(state), "termination: missing outcome");
    entry.checkOutcome(state);
    return { state, moves };
  } catch (cause) {
    mkdirSync(replayDir, { recursive: true });
    const path = join(mkdtempSync(join(replayDir, "playout-")), "replay.json");
    writeFileSync(
      path,
      JSON.stringify(
        { type: entry.type, ruleset: entry.ruleset, seed, moves },
        null,
        2,
      ),
    );
    throw new PlayoutError(
      `seed=${seed} moves=${moves.length} replay=${path}: ${String(cause)}`,
      path,
      cause,
    );
  }
}
