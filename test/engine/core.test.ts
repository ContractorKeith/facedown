/** biome-ignore-all lint/style/noNonNullAssertion: Fixed vectors and bounded test loops guarantee these fixture entries. */
import { expect, test } from "bun:test";
import { fold } from "../../src/engine/core/fold";
import {
  below,
  commitment,
  dealRng,
  rngFromDigest,
  shuffle,
} from "../../src/engine/core/random";
import { sha256 } from "../../src/engine/core/sha256";
import {
  nextSeat,
  partnerOf,
  seats,
  teamOf,
} from "../../src/engine/core/types";
import { highcard } from "./highcard";

test("seats, partners and clockwise turns", () => {
  expect(seats.map(teamOf)).toEqual([0, 1, 0, 1]);
  expect(seats.map(partnerOf)).toEqual([2, 3, 0, 1]);
  expect(seats.map(nextSeat)).toEqual([1, 2, 3, 0]);
});
test("fold initializes an empty log and reports the first rejected index", () => {
  const seed = sha256("fold");
  const state = highcard.init(seed, highcard.ruleset);
  expect(fold(highcard, seed, [])).toEqual({ ok: true, state });
  const first = { seat: 1 as const, timeout: true as const };
  const result = fold(highcard, seed, [
    first,
    { seat: 1, move: { card: "invalid" } },
  ]);
  expect(result).toMatchObject({ ok: false, index: 1 });
});
test("SHA-256 NIST vectors", () => {
  for (const [input, expected] of [
    ["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
    ["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
    [
      "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq",
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    ],
  ])
    expect(sha256(input!)).toBe(expected!);
});
test("SHA-256 agrees with Bun on 200 randomized UTF-16 strings", () => {
  const rng = dealRng("hash verification", 0);
  const samples = ["é😀中文", "\ud800", "\udfff", "a".repeat(10000)];
  for (let i = 0; i < 200; i++)
    samples.push(
      Array.from({ length: below(500, rng) }, () =>
        String.fromCharCode(below(65536, rng)),
      ).join(""),
    );
  for (const input of samples)
    expect(sha256(input)).toBe(
      new Bun.CryptoHasher("sha256").update(input).digest("hex"),
    );
});
test("deal randomness and commitment are reproducible", () => {
  const items = Array.from({ length: 52 }, (_, i) => i);
  const order = shuffle(items, dealRng("seed", 0));
  expect(shuffle(items, dealRng("seed", 0))).toEqual(order);
  expect(shuffle(items, dealRng("seed", 1))).not.toEqual(order);
  expect(items).toEqual(Array.from({ length: 52 }, (_, i) => i));
  expect(commitment("seed")).toBe(sha256("seed"));
  expect(() => rngFromDigest("bad")).toThrow();
});
test("shuffle positions are roughly uniform over 4000 seeded shuffles", () => {
  const counts = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
  for (let i = 0; i < 4000; i++) {
    shuffle([0, 1, 2, 3], dealRng("uniformity", i)).forEach(
      (item, position) => {
        counts[item]![position]!++;
      },
    );
  }
  let chiSquare = 0;
  for (const row of counts)
    for (const count of row) {
      expect(count).toBeGreaterThan(800);
      expect(count).toBeLessThan(1200);
      chiSquare += (count - 1000) ** 2 / 1000;
    }
  expect(chiSquare).toBeLessThan(80);
});
test("bounded randomness rejects the biased tail", () => {
  const words = [0xffffffff, 5];
  expect(below(3, () => words.shift()!)).toBe(2);
  expect(words).toEqual([]);
  expect(() => below(0, () => 0)).toThrow();
});
