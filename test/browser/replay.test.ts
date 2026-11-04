import { expect, test } from "bun:test";
import { type ReplayRecord, verifyReplay } from "../../client/src/replay";
import { moveLogHash } from "../../src/engine/core/log-hash";
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
    logHash: commitment(seed),
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
  record.logHash = moveLogHash(record.commitment, record.moves);
  test(`${type}: replay verifies the complete log and exposes every hand`, () => {
    const result = verifyReplay(record);
    expect(result.failures).toEqual([]);
    expect(result.frames).toHaveLength(record.moves.length + 1);
    expect(result.frames[0]?.hands.map((hand) => hand.length)).toEqual(
      type === "spades" ? [13, 13, 13, 13] : [5, 5, 5, 5],
    );
  });
  test(`${type}: local records distinguish Verified from Consistent and reject a swapped response`, () => {
    expect(verifyReplay(record).verified).toBe(false);
    expect(
      verifyReplay(record, {
        commitment: record.commitment,
        logHash: record.logHash,
        unbroken: true,
      }).verified,
    ).toBe(true);
    for (const unbroken of [false, undefined])
      expect(
        verifyReplay(record, {
          commitment: record.commitment,
          logHash: record.logHash,
          unbroken,
        }).verified,
      ).toBe(false);
    expect(
      verifyReplay(record, {
        commitment: record.commitment,
        logHash: record.logHash,
        unbroken: true,
        tampered: true,
      }).failures,
    ).toContain("Live move log changed unexpectedly");
    expect(
      verifyReplay(record, {
        commitment: "00".repeat(32),
        logHash: record.logHash,
        unbroken: true,
      }).failures,
    ).toContain("Saved commitment check failed");
    expect(
      verifyReplay(record, {
        commitment: record.commitment,
        logHash: "00".repeat(32),
      }).failures,
    ).toContain("Saved move log hash check failed");
  });
  test(`${type}: malformed records fail before playback`, () => {
    for (const outcome of [
      { scores: [...record.outcome.scores, 999], winner: 0 },
      { scores: [1, "2"], winner: 0 },
      { scores: [1, 2], winner: 2 },
      null,
    ])
      expect(() => verifyReplay({ ...record, outcome })).toThrow(
        "Malformed replay record",
      );
    expect(() => verifyReplay({ ...record, moves: null })).toThrow(
      "Malformed replay record",
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
    expect(
      verifyReplay({ ...record, commitment: "00".repeat(32) }).failures,
    ).toContain("Seed commitment check failed");
    expect(
      verifyReplay({
        ...record,
        outcome: { ...record.outcome, scores: [1, 2] },
      }).failures,
    ).toEqual(["Stored outcome check failed"]);
    expect(
      verifyReplay({ ...record, moves: record.moves.slice(0, -1) }).failures,
    ).toContain("Stored outcome check failed");
  });
}

test("a nonstandard Spades ruleset cannot pass replay verification", () => {
  const game = registry.get("spades");
  if (!game) throw new Error("Missing game");
  const seed = "ab".repeat(32);
  const ruleset = { ...(game.ruleset as object), target: 100 };
  let state = game.init(seed, ruleset);
  const moves: ReplayRecord["moves"] = [];
  while (game.toAct(state) !== null) {
    const seat = game.toAct(state);
    if (seat === null) break;
    const envelope = { seat, timeout: true as const };
    const result = game.apply(state, envelope);
    if (!result.ok) throw new Error(result.error.message);
    moves.push(envelope);
    state = result.state;
  }
  const result = verifyReplay({
    type: "spades",
    ruleset,
    seed,
    commitment: commitment(seed),
    moves,
    logHash: moveLogHash(commitment(seed), moves),
    outcome: game.outcome(state),
    rated: false,
    seats: [],
    rating_changes: [],
  });
  expect(result.failures.join()).toContain("Ruleset");
});
