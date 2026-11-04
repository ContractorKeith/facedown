export type LiveRecord = { commitment: string; logHash?: string };
const key = (id: string) => `fd:game:${id}`;
// Storage can be disabled or full; a browser without saved anchors gets Consistent only.
export function liveRecord(id: string): LiveRecord | undefined {
  try {
    const value = JSON.parse(localStorage.getItem(key(id)) ?? "null");
    if (
      value &&
      /^[a-f0-9]{64}$/.test(value.commitment) &&
      (value.logHash === undefined || /^[a-f0-9]{64}$/.test(value.logHash))
    )
      return value;
  } catch {}
}
export function rememberGame(
  id: string,
  commitment: string,
  logHash?: string,
): void {
  try {
    const saved = liveRecord(id);
    localStorage.setItem(
      key(id),
      JSON.stringify({
        commitment: saved?.commitment ?? commitment,
        logHash: saved?.logHash ?? logHash,
      }),
    );
  } catch {}
}
