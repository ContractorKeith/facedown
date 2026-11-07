import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { sha256 } from "../src/engine/core/sha256";
import { canonical } from "../test/engine/canonical";
import { playout } from "../test/engine/harness";
import { type Replay, replayEntry, verifyReplay } from "../test/engine/replay";

const [type, seed] = Bun.argv.slice(2);
if (
  !type ||
  !["spades", "dominoes"].includes(type) ||
  !seed ||
  !/^[0-9a-f]{64}$/.test(seed)
) {
  console.error(
    "Usage: bun run replay:record <type> <64-char lowercase hex seed>",
  );
  process.exit(1);
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
const root = resolve(import.meta.dir, "..");
const formatted = Bun.spawnSync(
  [
    resolve(root, "node_modules/.bin/biome"),
    "format",
    "--stdin-file-path",
    path,
    "--config-path",
    root,
  ],
  { stdin: Buffer.from(JSON.stringify(replay)) },
);
if (formatted.exitCode !== 0) {
  process.stderr.write(formatted.stderr);
  process.exit(1);
}
writeFileSync(path, formatted.stdout, { flag: "wx" });
console.log(path);
