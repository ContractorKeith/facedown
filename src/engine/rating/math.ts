// Range reduction and the atanh series keep logarithms within the engine's
// arithmetic-only Math allowlist: ln(x) = k*ln(2) + 2*(z + z^3/3 + ...).
export function log(value: number): number {
  if (!(value > 0) || !Number.isFinite(value))
    throw new Error("Logarithm requires a finite positive value");
  let x = value,
    k = 0;
  while (x < 1) {
    x *= 2;
    k--;
  }
  while (x >= 2) {
    x /= 2;
    k++;
  }
  const z = (x - 1) / (x + 1),
    square = z * z;
  let term = z,
    sum = z;
  for (let denominator = 3; denominator <= 81; denominator += 2) {
    term *= square;
    sum += term / denominator;
  }
  // biome-ignore lint/suspicious/noApproximativeNumericConstant: Math.LN2 is outside the engine allowlist.
  return k * 0.6931471805599453 + 2 * sum;
}
// biome-ignore lint/suspicious/noApproximativeNumericConstant: Math.E is outside the engine allowlist.
export const exp = (value: number): number => 2.718281828459045 ** value;
export const sqrt = (value: number): number => value ** 0.5;
// biome-ignore lint/suspicious/noApproximativeNumericConstant: Math.PI is outside the engine allowlist.
export const pi = 3.141592653589793;
