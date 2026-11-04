import { expect, test } from "bun:test";
import { type ReplayRecord, verifyReplay } from "../../client/src/replay";
import { commitment } from "../../src/engine/core/random";
import { registry } from "../../src/engine/registry";

for (const type of ["spades", "dominoes"] as const) {
  const game = registry.get(type);
  if (!game) throw new Error("Missing game");
  const seed = "ab".repeat(32);
  const record: ReplayRecord = {
    type,
    seed,
    ruleset: game.ruleset,
    commitment: commitment(seed),
    moves: [],
    outcome: { scores: [0, 0], winner: 0 },
    seats: [],
    rated: false,
    rating_changes: [],
  };
  let state = game.init(seed, game.ruleset);
  while (game.toAct(state) !== null) {
    const seat = game.toAct(state);
    if (seat === null) break;
    const envelope = { seat, timeout: true as const };
    const result = game.apply(state, envelope);
    if (!result.ok) throw new Error(result.error.message);
    record.moves.push(envelope);
    state = result.state;
  }
  const outcome = game.outcome(state);
  if (!outcome) throw new Error("Game did not finish");
  record.outcome = outcome;
  test(`${type}: replay verifies the complete log and exposes every hand`, () => {
    const result = verifyReplay(record);
    expect(result.failures).toEqual([]);
    expect(result.frames).toHaveLength(record.moves.length + 1);
    expect(result.frames[0]?.hands.map((hand) => hand.length)).toEqual(
      type === "spades" ? [13, 13, 13, 13] : [5, 5, 5, 5],
    );
  });
  test(`${type}: invalid moves never expose partial playback`, () => {
    const moves = [...record.moves];
    moves[1] = { seat: record.moves[1]?.seat ?? 0, move: { play: "tampered" } };
    const result = verifyReplay({ ...record, moves });
    expect(result.failures.join()).toContain("Move 2 failed to fold");
    expect(result.frames).toEqual([]);
  });
  test(`${type}: commitment and outcome checks fail independently`, () => {
    expect(verifyReplay({ ...record, commitment: "wrong" }).failures).toEqual([
      "Seed commitment check failed",
    ]);
    expect(
      verifyReplay({
        ...record,
        outcome: { ...record.outcome, scores: [1, 2] },
      }).failures,
    ).toEqual(["Stored outcome check failed"]);
    expect(
      verifyReplay({ ...record, moves: record.moves.slice(0, -1) }).failures,
    ).toEqual(["Stored outcome check failed"]);
  });
}
