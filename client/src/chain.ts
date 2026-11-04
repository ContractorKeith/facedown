import { canonicalJSON } from "../../src/engine/core/log-hash";
import { sha256 } from "../../src/engine/core/sha256";
import type { LiveRecord } from "./game-records";

export type Chain = LiveRecord & {
  seq: number;
  logHash: string;
  tampered: boolean;
};
type Update = {
  seq: number;
  commitment: string;
  logHash: string;
  lastMove?: unknown;
};
// Only an in-memory chain can establish continuity; saved anchors detect changes.
export function checkChain(
  previous: Chain | undefined,
  next: Update,
  saved?: LiveRecord,
): Chain {
  const anchor = previous ?? saved;
  let tampered =
    !!anchor?.tampered || !!(anchor && anchor.commitment !== next.commitment);
  if (!previous && saved?.seq === next.seq && saved.logHash)
    tampered ||= saved.logHash !== next.logHash;
  let unbroken =
    (previous?.unbroken ?? (next.seq === 0 && !saved)) &&
    next.lastMove !== undefined;
  if (previous) {
    if (next.seq === previous.seq) {
      tampered ||= next.logHash !== previous.logHash;
    } else if (next.seq === previous.seq + 1 && next.lastMove != null) {
      tampered ||=
        next.logHash !==
        sha256(`${previous.logHash}:${canonicalJSON(next.lastMove)}`);
    } else unbroken = false;
  } else if (next.seq === 0) {
    tampered ||= next.logHash !== next.commitment;
  }
  return {
    seq: next.seq,
    commitment: anchor?.commitment ?? next.commitment,
    logHash: tampered ? (anchor?.logHash ?? next.logHash) : next.logHash,
    unbroken: unbroken && !tampered,
    tampered,
  };
}
