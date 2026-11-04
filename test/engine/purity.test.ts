import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { purityViolations } from "./purity";

const root = resolve(import.meta.dir, "../../src/engine");
const check = (source: string) =>
  purityViolations(source, join(root, "fixture.ts"), root);
function filesAt(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    return entry.isDirectory() ? filesAt(file) : [file];
  });
}
test("engine sources import only the engine and use no forbidden globals", async () => {
  const files = filesAt(root);
  expect(files.length).toBeGreaterThan(0);
  for (const file of files)
    expect(
      await purityViolations(readFileSync(file, "utf8"), file, root),
    ).toEqual([]);
});
test.each([
  'import { Database } from "bun:sqlite";',
  'export * from "../../server/x";',
  'export { x } from "./core/../../../server/x";',
  'export * from "..\\x2fserver/x";',
  'import("bun:sqlite")',
  "import(`bun:sqlite`)",
  "import(target)",
  'type T = import("bun:sqlite").Database',
  "Date.now()",
  "const {random} = Math;",
  "Math?.random()",
  "const r = Math.random;",
  'Math["floor"](1)',
  'globalThis["Bun"]',
  "performance.now()",
  'eval("1")',
  'new Function("return 1")',
  'require("./core/types")',
  'self.fetch("/")',
  "setImmediate(() => 1)",
  "clearTimeout(1)",
  "clearInterval(1)",
  "queueMicrotask(() => 1)",
  // biome-ignore lint/suspicious/noTemplateCurlyInString: This is source text for the parser fixture.
  "const x = `safe ${Date.now()}`;",
])("purity rejects %s", async (source) => {
  expect((await check(source)).length).toBeGreaterThan(0);
});
test.each([
  'import { sha256 } from "./core/sha256"; export const x = sha256("abc");',
  "const text = `Bun Date fetch`;",
  '// Date.now()\nconst text = "Bun";',
  "const object = { Date: 1, Bun: 2, fetch() { return 1; } }; object.Date;",
  "const { Date: safe } = object;",
  "Math.floor(1.2); Math?.ceil(1.2); Math.imul(2,3)",
  "Math.sqrt(4); Math.PI",
])("purity accepts %s", async (source) => {
  expect(await check(source)).toEqual([]);
});

for (const member of ["exp", "log"])
  test(`Math.${member} is restricted to the rating directory`, async () => {
    const source = `Math.${member}(1)`;
    expect(await check(source)).not.toEqual([]);
    expect(
      await purityViolations(source, join(root, "rating", "glicko.ts"), root),
    ).toEqual([]);
    expect(
      await purityViolations(
        source,
        join(root, "rating-other", "game.ts"),
        root,
      ),
    ).not.toEqual([]);
  });
