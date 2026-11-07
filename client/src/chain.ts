import { canonicalJSON } from "../../src/engine/core/log-hash";
import { sha256 } from "../../src/engine/core/sha256";
import type { ViewMessage } from "./api";
import { type LiveRecord, liveRecord, rememberGame } from "./game-records";

export type Chain = LiveRecord & {
  seq: number;
  logHash: string;
  tampered: boolean;
  hashes?: Record<number, string>;
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
  const hashes = { ...previous?.hashes };
  if (previous) hashes[previous.seq] = previous.logHash;
  const known =
    hashes[next.seq] ?? (saved?.seq === next.seq ? saved.logHash : undefined);
  if (previous && next.seq < previous.seq) {
    const tampered =
      previous.tampered ||
      previous.commitment !== next.commitment ||
      (known !== undefined && known !== next.logHash);
    return { ...previous, tampered, unbroken: previous.unbroken && !tampered };
  }
  let tampered =
    !!anchor?.tampered ||
    !!(anchor && anchor.commitment !== next.commitment) ||
    (known !== undefined && known !== next.logHash);
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
  if (!tampered) hashes[next.seq] = next.logHash;
  return {
    hashes,
    seq: next.seq,
    commitment: anchor?.commitment ?? next.commitment,
    logHash: tampered ? (anchor?.logHash ?? next.logHash) : next.logHash,
    unbroken: unbroken && !tampered,
    tampered,
  };
}

// Keep live validation and its persistent replay anchor together.
export function rememberFrame(
  id: string,
  previous: Chain | undefined,
  frame: ViewMessage,
) {
  if (!frame.commitment || !frame.logHash) return previous;
  const chain = checkChain(
    previous,
    { ...frame, commitment: frame.commitment, logHash: frame.logHash },
    liveRecord(id),
  );
  rememberGame(id, chain);
  return chain;
}
