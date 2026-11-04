import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { purityViolations } from "./purity";

const root = resolve(import.meta.dir, "../../src/engine");
function filesAt(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    return entry.isDirectory() ? filesAt(file) : [file];
  });
}
test("engine sources import only the engine and use no forbidden globals", () => {
  const files = filesAt(root);
  expect(files.length).toBeGreaterThan(0);
  for (const file of files)
    expect(purityViolations(readFileSync(file, "utf8"), file, root)).toEqual(
      [],
    );
});
test("purity checker catches forbidden fixture syntax", () => {
  const file = join(root, "fixture.ts");
  const check = (source: string) => purityViolations(source, file, root);
  expect(
    check(
      'import { sha256 } from "./core/sha256"; export const x = sha256("abc");',
    ),
  ).toEqual([]);
  expect(check('import { Database } from "bun:sqlite";')).toContain(
    "Import outside engine: bun:sqlite",
  );
  expect(check("Date.now()")).toContain("Forbidden identifier: Date");
  for (const source of [
    'export * from "../server/store";',
    'import("bun:sqlite")',
    'type T = import("bun:sqlite").Database',
    "const r = Math.random;",
    'globalThis["Date"].now()',
    'Math["random"]()',
    'require("./core/types")',
  ])
    expect(check(source).length).toBeGreaterThan(0);
  expect(check('// Date.now()\nconst text = "Bun";')).toEqual([]);
});
