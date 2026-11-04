import { expect, test } from "bun:test";
import {
  canonicalJSON,
  hashMove,
  moveLogHash,
} from "../../src/engine/core/log-hash";
import { sha256 } from "../../src/engine/core/sha256";

test("canonical JSON sorts nested keys and preserves arrays and scalar types", () => {
  expect(canonicalJSON({ seat: 1, move: { play: "1-2", end: "left" } })).toBe(
    '{"move":{"end":"left","play":"1-2"},"seat":1}',
  );
  expect(
    canonicalJSON({ z: [true, null, 3, "3"], a: { z: 0, a: false } }),
  ).toBe('{"a":{"a":false,"z":0},"z":[true,null,3,"3"]}');
  for (const value of [
    undefined,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    { a: undefined },
  ])
    expect(() => canonicalJSON(value)).toThrow();
});
test("the chain starts at the commitment, ignores key order, and binds every move", () => {
  const commitment = sha256("seed");
  const a = { seat: 1 as const, move: { end: "left", play: "1-2" } };
  const b = { move: { play: "1-2", end: "left" }, seat: 1 as const };
  expect(moveLogHash(commitment, [])).toBe(commitment);
  expect(hashMove(commitment, a)).toBe(
    sha256(`${commitment}:{"move":{"end":"left","play":"1-2"},"seat":1}`),
  );
  expect(hashMove(commitment, a)).toBe(hashMove(commitment, b));
  expect(hashMove(commitment, a)).not.toBe(
    hashMove(commitment, { ...a, move: { ...a.move, end: "right" } }),
  );
  expect(moveLogHash(commitment, [a, { seat: 2, timeout: true }])).not.toBe(
    moveLogHash(commitment, [{ seat: 2, timeout: true }, a]),
  );
});
