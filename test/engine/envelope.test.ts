import { expect, test } from "bun:test";
import { checkEnvelope } from "../../src/engine/core/envelope";
import { spades } from "../../src/engine/spades";

const malformed: unknown[] = [
  null,
  undefined,
  false,
  0,
  "move",
  [],
  new Date(),
  {},
  { seat: 0 },
  { move: { bid: 1 } },
  { seat: -1, move: {} },
  { seat: 4, move: {} },
  { seat: 0.5, move: {} },
  { seat: "0", move: {} },
  { seat: 0, move: null },
  { seat: 0, move: undefined },
  ...[false, null, "no", 0, undefined].map((timeout) => ({ seat: 1, timeout })),
  { seat: 1, timeout: true, move: { bid: 1 } },
  { seat: 1, timeout: true, extra: 0 },
  { seat: 1, move: { bid: 1 }, extra: 0 },
  { seat: 1, move: { bid: 1 }, [Symbol("extra")]: 0 },
];
test.each(malformed.map((value, index) => [index, value] as const))(
  "malformed envelope %i returns an error without throwing or mutating state",
  (_index, envelope) => {
    const state = spades.init("0".repeat(64), spades.ruleset);
    const before = structuredClone(state);
    expect(checkEnvelope(envelope)?.code).toBe("illegal_move");
    expect(spades.apply(state, envelope as never)).toMatchObject({
      ok: false,
      error: { code: "illegal_move" },
    });
    expect(state).toEqual(before);
  },
);
test("generic validator accepts only the two exact envelope shapes", () => {
  for (const seat of [0, 1, 2, 3]) {
    expect(checkEnvelope({ seat, move: { gameSpecific: 1 } })).toBeNull();
    expect(checkEnvelope({ seat, timeout: true })).toBeNull();
  }
});
test("extra, symbolic, non-object and wrong-phase move fields are rejected", () => {
  const state = spades.init("0".repeat(64), spades.ruleset);
  for (const move of [
    { bid: 1, extra: 0 },
    { bid: 1, [Symbol("extra")]: 0 },
    [],
    "bid",
    1,
    { play: "AC" },
  ])
    expect(spades.apply(state, { seat: 1, move } as never).ok).toBe(false);
  let playing = state;
  for (let i = 0; i < 4; i++) {
    const result = spades.apply(playing, {
      seat: playing.turn ?? 0,
      move: { bid: 1 },
    });
    if (!result.ok) throw new Error(result.error.message);
    playing = result.state;
  }
  const legal = spades.legalMoves(playing, playing.turn ?? 0)[0];
  expect(
    spades.apply(playing, {
      seat: playing.turn ?? 0,
      move: { ...legal, extra: 0 },
    } as never).ok,
  ).toBe(false);
});
