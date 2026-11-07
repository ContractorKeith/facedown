import { expect, test } from "bun:test";
import { checkChain } from "../../client/src/chain";
import { canonicalJSON } from "../../src/engine/core/log-hash";
import { sha256 } from "../../src/engine/core/sha256";

const commitment = sha256("seed");
const lastMove = { seat: 0, timeout: true };
const hash = sha256(`${commitment}:${canonicalJSON(lastMove)}`);
const start = { seq: 0, commitment, logHash: commitment, lastMove: null };
test("a continuous chain verifies each step and preserves duplicate views", () => {
  const zero = checkChain(undefined, start);
  const one = checkChain(zero, { ...start, seq: 1, logHash: hash, lastMove });
  expect(one).toMatchObject({
    seq: 1,
    logHash: hash,
    unbroken: true,
    tampered: false,
  });
  expect(
    checkChain(one, { ...start, seq: 1, logHash: hash, lastMove }),
  ).toEqual(one);
});
test("a changed hash, commitment or same-seq update is sticky tampering", () => {
  const zero = checkChain(undefined, start);
  for (const change of [
    { seq: 1, lastMove, logHash: commitment },
    { seq: 0, logHash: hash },
    { seq: 1, lastMove, logHash: hash, commitment: hash },
  ]) {
    const bad = checkChain(zero, { ...start, ...change });
    expect(bad.tampered).toBe(true);
    expect(
      checkChain(bad, { ...start, seq: 2, logHash: hash, lastMove }).tampered,
    ).toBe(true);
  }
});
test("gaps, reloads and missing envelopes cannot earn Verified", () => {
  const zero = checkChain(undefined, start);
  expect(
    checkChain(undefined, { ...start, lastMove: undefined }).unbroken,
  ).toBe(false);
  expect(
    checkChain(zero, { ...start, seq: 2, logHash: hash, lastMove }).unbroken,
  ).toBe(false);
  expect(
    checkChain(undefined, { ...start, seq: 1, logHash: hash, lastMove })
      .unbroken,
  ).toBe(false);
  expect(
    checkChain(zero, { ...start, seq: 1, logHash: hash, lastMove: undefined })
      .unbroken,
  ).toBe(false);
});

test("a reload cannot replace an anchor at the same sequence with a different hash", () => {
  const saved = checkChain(undefined, start);
  expect(checkChain(undefined, start, saved).unbroken).toBe(false);
  expect(
    checkChain(undefined, { ...start, logHash: hash }, saved).tampered,
  ).toBe(true);
  const one = checkChain(saved, { ...start, seq: 1, logHash: hash, lastMove });
  expect(
    checkChain(undefined, { ...start, seq: 1, logHash: hash, lastMove }, one)
      .unbroken,
  ).toBe(false);
});

test("identical earlier frames leave the latest verified chain intact", () => {
  const zero = checkChain(undefined, start);
  const one = checkChain(zero, { ...start, seq: 1, logHash: hash, lastMove });
  expect(checkChain(one, start)).toEqual(one);
});

test("rewritten earlier frames are tampered without lowering the anchor", () => {
  const zero = checkChain(undefined, start);
  const one = checkChain(zero, { ...start, seq: 1, logHash: hash, lastMove });
  const bad = checkChain(one, { ...start, logHash: hash });
  expect(bad.tampered).toBe(true);
  expect(bad.seq).toBe(1);
  expect(bad.logHash).toBe(hash);
});
