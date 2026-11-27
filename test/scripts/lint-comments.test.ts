import { expect, test } from "bun:test";
import { commentsIn } from "../../scripts/lint-comments";

test("finds TS comments but not comment-like strings, templates or regexes", () => {
  const src = [
    'const url = "http://x"; // trailing',
    "const t = `a // $" + "{b /* inner */} c`;",
    "const r = /\\/\\/[^/]*/g;",
    "/* block",
    "   two */",
    "const s = '/* not */';",
  ].join("\n");
  expect(commentsIn("a.ts", src).map((c) => [c.line, c.ownLines])).toEqual([
    [1, 0],
    [2, 0],
    [4, 2],
  ]);
});

test("finds Svelte, CSS and shell comments, skipping shebangs", () => {
  const svelte =
    "<script>\n// s\n</script>\n<!-- m -->\n<style>\n/* c */\n</style>";
  expect(commentsIn("A.svelte", svelte).map((c) => c.text)).toEqual([
    "// s",
    "<!-- m -->",
    "/* c */",
  ]);
  expect(
    commentsIn("x.sh", '#!/bin/sh\n# real\necho "#no" # tail').map(
      (c) => c.line,
    ),
  ).toEqual([2, 3]);
});
