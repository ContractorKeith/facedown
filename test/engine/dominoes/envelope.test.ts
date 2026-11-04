import { expect, test } from "bun:test";
import { dominoes } from "../../../src/engine/dominoes";
import { initial, setup } from "./helpers";

const state = initial();
const seat = state.leader;
const legal = dominoes.legalMoves(state, seat)[0];
if (!legal) throw new Error("Missing opening move");
const malformed: [string, unknown][] = [
  ["null", null],
  ["undefined", undefined],
  ["primitive", false],
  ["array", []],
  ["missing seat", { move: legal }],
  ["invalid seat", { seat: 4, move: legal }],
  ["string seat", { seat: String(seat), move: legal }],
  ["missing move", { seat }],
  ["null move", { seat, move: null }],
  ["undefined move", { seat, move: undefined }],
  ...[false, null, "no", 0, undefined].map((timeout): [string, unknown] => [
    `timeout ${String(timeout)}`,
    { seat, timeout },
  ]),
  ["timeout plus move", { seat, timeout: true, move: legal }],
  ["extra envelope key", { seat, move: legal, extra: 1 }],
  ["extra timeout key", { seat, timeout: true, extra: 1 }],
  ["symbol envelope key", { seat, move: legal, [Symbol("extra")]: 1 }],
  ["extra play key", { seat, move: { ...legal, extra: 1 } }],
  ["symbol play key", { seat, move: { ...legal, [Symbol("extra")]: 1 } }],
  [
    "nonenumerable play key",
    { seat, move: Object.defineProperty({ ...legal }, "extra", { value: 1 }) },
  ],
  [
    "nonplain move",
    { seat, move: Object.assign(Object.create({ inherited: true }), legal) },
  ],
  ["string move", { seat, move: "play" }],
  ["array move", { seat, move: [] }],
  ["missing end", { seat, move: "play" in legal ? { play: legal.play } : {} }],
  ["wrong end", { seat, move: { ...legal, end: null } }],
];

test.each(malformed)(
  "malformed %s rejects without throwing or mutating state",
  (_name, envelope) => {
    const before = structuredClone(state);
    let result: ReturnType<typeof dominoes.apply> | undefined;
    expect(() => {
      result = dominoes.apply(state, envelope as never);
    }).not.toThrow();
    expect(result).toMatchObject({
      ok: false,
      error: { code: "illegal_move" },
    });
    expect(state).toEqual(before);
  },
);

test("envelope validation precedes finished-game and seat checks", () => {
  for (const current of [state, { ...state, turn: null }])
    expect(dominoes.apply(current, null as never)).toMatchObject({
      ok: false,
      error: { code: "illegal_move" },
    });
});
test("draw and pass require exactly one key with value true", () => {
  const stuck = setup({
    hands: [["0-0"], ["1-1"], ["4-4"], ["5-5"]],
    boneyard: ["0-1"],
  });
  for (const current of [stuck, { ...stuck, boneyard: [] }]) {
    const kind = current.boneyard.length ? "draw" : "pass";
    const before = structuredClone(current);
    for (const move of [
      { [kind]: false },
      { [kind]: null },
      { [kind]: "true" },
      { [kind]: true, extra: 1 },
      { [kind]: true, [Symbol("extra")]: 1 },
      { draw: true, pass: true },
    ]) {
      let result: ReturnType<typeof dominoes.apply> | undefined;
      expect(() => {
        result = dominoes.apply(current, { seat: 0, move } as never);
      }).not.toThrow();
      expect(result).toMatchObject({
        ok: false,
        error: { code: "illegal_move" },
      });
    }
    expect(
      dominoes.apply(current, { seat: 0, move: { [kind]: true } } as never).ok,
    ).toBe(true);
    expect(current).toEqual(before);
  }
});
test("exact play and timeout envelopes remain accepted and deterministic", () => {
  expect(dominoes.apply(state, { seat, move: legal }).ok).toBe(true);
  expect(dominoes.apply(state, { seat, timeout: true })).toEqual(
    dominoes.apply(state, { seat, move: legal }),
  );
});
