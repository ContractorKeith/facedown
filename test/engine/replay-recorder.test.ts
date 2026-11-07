import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("replay recorder formats its output and prints usage for bad seeds", () => {
  const dir = mkdtempSync(join(tmpdir(), "facedown-recorder-"));
  const script = resolve("scripts/replay-record.ts");
  try {
    const bad = Bun.spawnSync(["bun", script, "dominoes", "bad"], { cwd: dir });
    expect(bad.exitCode).toBe(1);
    expect(bad.stderr.toString()).toStartWith("Usage:");
    expect(bad.stderr.toString()).not.toContain("at ");
    const seed = "ab".repeat(32);
    const recorded = Bun.spawnSync(["bun", script, "dominoes", seed], {
      cwd: dir,
    });
    expect(recorded.exitCode).toBe(0);
    const file = join(dir, `test/replays/dominoes-${seed}.json`);
    expect(JSON.parse(readFileSync(file, "utf8")).seed).toBe(seed);
    const check = Bun.spawnSync(
      [
        resolve("node_modules/.bin/biome"),
        "format",
        "--stdin-file-path",
        "test/replays/recorded.json",
      ],
      { stdin: readFileSync(file) },
    );
    expect(check.stdout.toString()).toBe(readFileSync(file, "utf8"));
    expect(check.exitCode).toBe(0);
  } finally {
    rmSync(dir, { recursive: true });
  }
}, 15000);
