import { at } from "./at";
import { sha256 } from "./sha256";

export type Rng = () => number;
export function rngFromDigest(digest: string): Rng {
  if (!/^[0-9a-f]{64}$/i.test(digest))
    throw new Error("Expected a 256-bit hex digest");
  const words = Array.from({ length: 8 }, (_, i) =>
    Number.parseInt(digest.slice(i * 8, i * 8 + 8), 16),
  );
  let a = at(words, 0) ^ at(words, 4);
  let b = at(words, 1) ^ at(words, 5);
  let c = at(words, 2) ^ at(words, 6);
  let d = at(words, 3) ^ at(words, 7);
  const next = () => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  };
  for (let i = 0; i < 20; i++) next();
  return next;
}

export function below(bound: number, rng: Rng): number {
  if (!Number.isInteger(bound) || bound < 1 || bound > 0x100000000)
    throw new Error("Invalid random bound");
  const limit = 0x100000000 - (0x100000000 % bound);
  let word: number;
  do {
    word = rng();
  } while (word >= limit);
  return word % bound;
}
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = below(i + 1, rng);
    [result[i], result[j]] = [at(result, j), at(result, i)];
  }
  return result;
}
export const dealRng = (seed: string, n: number): Rng =>
  rngFromDigest(sha256(`${seed}:${n}`));
export const commitment = (seed: string): string => sha256(seed);
