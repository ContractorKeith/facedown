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
    const saved = liveRecord(id);
    if (saved) {
      const keep =
        (saved.seq ?? -1) > (record.seq ?? -1) ||
        (saved.unbroken &&
          !record.unbroken &&
          (saved.seq ?? -1) >= (record.seq ?? -1));
      if (keep)
        record = { ...saved, tampered: saved.tampered || record.tampered };
      else if (saved.tampered)
        record = { ...record, tampered: true, unbroken: false };
    }
    const { commitment, seq, logHash, unbroken, tampered } = record;
    localStorage.setItem(
      key(id),
      JSON.stringify({ commitment, seq, logHash, unbroken, tampered }),
    );
  } catch {}
}
