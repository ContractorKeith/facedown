export type LiveRecord = {
  commitment: string;
  seq?: number;
  logHash?: string;
  unbroken?: boolean;
  tampered?: boolean;
};
const key = (id: string) => `fd:game:${id}`;
// Storage can be disabled or full; a browser without saved anchors gets Consistent only.
export function liveRecord(id: string): LiveRecord | undefined {
  try {
    const value = JSON.parse(localStorage.getItem(key(id)) ?? "null");
    if (
      value &&
      /^[a-f0-9]{64}$/.test(value.commitment) &&
      (value.logHash === undefined || /^[a-f0-9]{64}$/.test(value.logHash)) &&
      (value.seq === undefined ||
        (Number.isSafeInteger(value.seq) && value.seq >= 0))
    )
      return value;
  } catch {}
}
export function rememberGame(id: string, record: LiveRecord): void {
  try {
    localStorage.setItem(key(id), JSON.stringify(record));
  } catch {}
}
