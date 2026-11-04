/** biome-ignore-all lint/style/noNonNullAssertion: Digest validation and shuffle loop bounds guarantee the indexed entries. */
import { sha256 } from "./sha256";

// sfc32: four 32-bit words; output is an unsigned 32-bit integer.
export type Rng = () => number;
export function rngFromDigest(digest: string): Rng {
  if (!/^[0-9a-f]{64}$/i.test(digest))
    throw new Error("Expected a 256-bit hex digest");
  // Fold all eight digest words into the four-word state.
  const words = Array.from({ length: 8 }, (_, i) =>
    Number.parseInt(digest.slice(i * 8, i * 8 + 8), 16),
  );
  let a = words[0]! ^ words[4]!;
  let b = words[1]! ^ words[5]!;
  let c = words[2]! ^ words[6]!;
  let d = words[3]! ^ words[7]!;
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

// Rejection sampling avoids bias when the bound does not divide 2^32.
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
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}
export const dealRng = (seed: string, n: number): Rng =>
  rngFromDigest(sha256(`${seed}:${n}`));
export const commitment = (seed: string): string => sha256(seed);
