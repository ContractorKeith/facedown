export function at<T>(items: readonly T[], index: number): T {
  if (!Number.isInteger(index) || index < 0 || index >= items.length)
    throw new RangeError(`Index ${index} outside 0..${items.length - 1}`);
  return items[index] as T;
}
