import { expect } from "bun:test";
import { fold } from "../../src/engine/core/fold";
import { hashMove } from "../../src/engine/core/log-hash";
import { commitment } from "../../src/engine/core/random";
import type { Game, Viewer } from "../../src/engine/core/types";
import {
  type State as DominoesState,
  dominoes,
  locate as locateDominoes,
} from "../../src/engine/dominoes";
import { registry } from "../../src/engine/registry";
import {
  locate as locateSpades,
  type State as SpadesState,
} from "../../src/engine/spades";
import type { GameRecord } from "../../src/server/store";
import { checkView } from "../engine/view-check";
import type { Client } from "./helpers";

// Compare each captured view with the canonical fold at its own sequence.
export function checkWire(record: GameRecord, clients: Client[]) {
  const game = registry.get(record.type) as Game<
    unknown,
    unknown,
    unknown,
    unknown
  >;
  const hashes = [record.commitment];
  const states: unknown[] = [game.init(record.seed, game.ruleset)];
  for (const envelope of record.moves) {
    const result = game.apply(states.at(-1), envelope);
    if (!result.ok) throw new Error("Invalid stored log");
    states.push(result.state);
    hashes.push(hashMove(hashes.at(-1) as string, envelope));
  }
  for (const client of clients) {
    let lastSeq = 0;
    for (const message of client.messages.filter(
      (m) => m.table === record.id || m.t === "error",
    )) {
      if (message.t === "over") {
        expect(message.logHash).toBe(hashes.at(-1));
        expect(message.seed).toBe(record.seed);
        expect(message.outcome).toEqual(record.outcome);
        expect(lastSeq).toBe(record.moves.length);
      } else {
        expect(JSON.stringify(message)).not.toContain(record.seed);
        expect(hasSeed(message)).toBe(false);
      }
      if (message.t === "view" && message.status === "open") {
        expect(message.view).toBeNull();
        expect(message.commitment).toBeNull();
        expect(message.logHash).toBeNull();
        expect(message.lastMove).toBeNull();
        expect(message.toAct).toBeNull();
        continue;
      }
      if (message.t === "view") {
        lastSeq = message.seq as number;
        const state = states[lastSeq];
        expect(message.view).toEqual(game.view(state, client.viewer));
        const locations =
          record.type === dominoes.type
            ? locateDominoes(state as DominoesState)
            : locateSpades(state as SpadesState);
        // lastMove is an exact public action; at a Deal boundary its piece
        // may already be in a newly shuffled private Hand. Check it separately.
        const { lastMove: _lastMove, ...current } = message;
        checkView(current, client.viewer as Viewer, locations);
        expect(message.you).toBe(
          "seat" in client.viewer ? client.viewer.seat : null,
        );
        expect(message.lastMove).toEqual(
          lastSeq ? record.moves[lastSeq - 1] : null,
        );
        expect(message.logHash).toBe(hashes[lastSeq]);
        expect(message.commitment).toBe(record.commitment);
        expect(typeof message.host).toBe("boolean");
        expect(Object.keys(message).sort()).toEqual(
          [
            "you",
            "lastMove",
            "status",
            "rated",
            "t",
            "table",
            "seq",
            "view",
            "toAct",
            "deadline",
            "seats",
            "commitment",
            "logHash",
            "host",
          ].sort(),
        );
      } else {
        expect(["error", "reaction", "over"]).toContain(message.t);
        const fields =
          message.t === "over"
            ? ["t", "table", "outcome", "seed", "logHash"]
            : message.t === "reaction"
              ? ["t", "table", "seat", "id"]
              : ["t", "code", "message"];
        expect(Object.keys(message).sort()).toEqual(fields.sort());
        const state = states[lastSeq];
        checkView(
          message,
          client.viewer,
          record.type === "spades"
            ? locateSpades(state as SpadesState)
            : locateDominoes(state as DominoesState),
        );
      }
    }
  }
  const rebuilt = fold(game, record.seed, record.moves);
  expect(rebuilt.ok && game.outcome(rebuilt.state)).toEqual(record.outcome);
  expect(commitment(record.seed)).toBe(record.commitment);
}
function hasSeed(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, v]) => key === "seed" || hasSeed(v));
}
