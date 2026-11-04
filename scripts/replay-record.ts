import { mkdirSync, writeFileSync } from "node:fs";
import { sha256 } from "../src/engine/core/sha256";
import { canonical } from "../test/engine/canonical";
import { playout } from "../test/engine/harness";
import { type Replay, replayEntry, verifyReplay } from "../test/engine/replay";

const [type, seed] = Bun.argv.slice(2);
if (!type || !seed || !/^[0-9a-f]{64}$/.test(seed)) {
  throw new Error(
    "Usage: bun run replay:record <type> <64-char lowercase hex seed>",
  );
}
const entry = replayEntry(type);
const { state, moves } = playout(entry, seed);
const outcome = entry.outcome(state);
if (!outcome) throw new Error("Game did not finish");
const replay: Replay = {
  type,
  ruleset: entry.ruleset,
  seed,
  moves,
  expectedOutcome: outcome,
  expectedFinalStateHash: sha256(canonical(state)),
};
verifyReplay(replay);
mkdirSync("test/replays", { recursive: true });
const path = `test/replays/${type}-${seed}.json`;
// Keep each move readable without expanding every field onto a separate line.
const { moves: recordedMoves, ...metadata } = replay;
const header = JSON.stringify(metadata, null, 2).slice(0, -2);
const envelopes = recordedMoves
  .map((move) => `    ${JSON.stringify(move)}`)
  .join(",\n");
writeFileSync(path, `${header},\n  "moves": [\n${envelopes}\n  ]\n}\n`, {
  flag: "wx",
});
console.log(path);
