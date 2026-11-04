import type { ReplayRecord } from "../../client/src/records";
import { moveLogHash } from "../../src/engine/core/log-hash";
import { commitment } from "../../src/engine/core/random";
import type { Envelope } from "../../src/engine/core/types";
import { registry } from "../../src/engine/registry";

export function replayFixture(
  type: ReplayRecord["type"] = "dominoes",
  seed = "ab".repeat(32),
): ReplayRecord {
  const game = registry.get(type);
  if (!game) throw new Error("Missing game");
  let state = game.init(seed, game.ruleset);
  const moves: Envelope<unknown>[] = [];
  while (game.toAct(state) !== null) {
    const seat = game.toAct(state);
    if (seat === null) break;
    const move = game.bot(
      game.view(state, { seat }),
      game.legalMoves(state, seat),
    );
    const envelope = { seat, move };
    const result = game.apply(state, envelope);
    if (!result.ok) throw new Error(result.error.message);
    moves.push(envelope);
    state = result.state;
  }
  const outcome = game.outcome(state);
  if (!outcome) throw new Error("Missing outcome");
  return {
    type,
    ruleset: game.ruleset,
    seed,
    commitment: commitment(seed),
    logHash: moveLogHash(commitment(seed), moves),
    moves,
    outcome,
    rated: false,
    seats: [0, 1, 2, 3].map((seat) => ({
      seat: seat as 0 | 1 | 2 | 3,
      name: `Player ${seat + 1}`,
    })),
    rating_changes: [],
  };
}
// Find a changed legal move whose suffix still folds to the exact same outcome.
export function legalTamper(record: ReplayRecord): ReplayRecord {
  const game = registry.get(record.type);
  if (!game) throw new Error("Missing game");
  let state = game.init(record.seed, game.ruleset);
  for (const [index, envelope] of record.moves.entries()) {
    for (const alternative of game.legalMoves(state, envelope.seat)) {
      if (
        JSON.stringify(alternative) ===
        JSON.stringify("move" in envelope ? envelope.move : null)
      )
        continue;
      const moves = [...record.moves];
      moves[index] = { seat: envelope.seat, move: alternative };
      let candidate = state;
      let valid = true;
      for (const move of moves.slice(index)) {
        const next = game.apply(candidate, move);
        if (!next.ok) {
          valid = false;
          break;
        }
        candidate = next.state;
      }
      if (
        valid &&
        JSON.stringify(game.outcome(candidate)) ===
          JSON.stringify(record.outcome)
      )
        return { ...record, moves };
    }
    const next = game.apply(state, envelope);
    if (!next.ok) throw new Error("Invalid fixture");
    state = next.state;
  }
  throw new Error("Fixture has no equivalent legal move");
}
