import { readFileSync, writeFileSync } from "node:fs";

export type Comment = {
  file: string;
  line: number;
  endLine: number;
  text: string;
  ownLines: number;
};

const BASELINE = "scripts/comment-baseline.json";
const DIRECTIVE = /^#\s*syntax=/;

function lineOf(src: string, i: number): number {
  let n = 1;
  for (let k = 0; k < i; k++) if (src.charCodeAt(k) === 10) n++;
  return n;
}

function scanJs(
  src: string,
  base = 0,
  out: [number, number][] = [],
): [number, number][] {
  const templ: number[] = [];
  let depth = 0;
  let prev = "";
  let i = 0;
  while (i < src.length) {
    const c = src.charAt(i);
    const n = src.charAt(i + 1);
    if (c === "/" && n === "/") {
      const e = src.indexOf("\n", i);
      const end = e < 0 ? src.length : e;
      out.push([base + i, base + end]);
      i = end;
      continue;
    }
    if (c === "/" && n === "*") {
      const e = src.indexOf("*/", i + 2);
      const end = e < 0 ? src.length : e + 2;
      out.push([base + i, base + end]);
      i = end;
      continue;
    }
    if (c === '"' || c === "'") {
      i++;
      while (i < src.length && src.charAt(i) !== c && src.charAt(i) !== "\n")
        i += src.charAt(i) === "\\" ? 2 : 1;
      i++;
      prev = "a";
      continue;
    }
    if (
      c === "`" ||
      (c === "}" && templ.length && templ[templ.length - 1] === depth)
    ) {
      if (c === "}") templ.pop();
      i++;
      while (i < src.length && src.charAt(i) !== "`") {
        if (src.charAt(i) === "\\") i += 2;
        else if (src.charAt(i) === "$" && src.charAt(i + 1) === "{") {
          templ.push(depth);
          i += 2;
          break;
        } else i++;
      }
      if (src.charAt(i) === "`") i++;
      prev = "a";
      continue;
    }
    if (c === "/" && /^$|[(,=:[!&|?{};+\-*%<>~^]$/.test(prev)) {
      i++;
      let cls = false;
      while (i < src.length && src.charAt(i) !== "\n") {
        if (src.charAt(i) === "\\") i++;
        else if (src.charAt(i) === "[") cls = true;
        else if (src.charAt(i) === "]") cls = false;
        else if (src.charAt(i) === "/" && !cls) break;
        i++;
      }
      i++;
      prev = "a";
      continue;
    }
    if (c === "{") depth++;
    if (c === "}") depth--;
    if (!/\s/.test(c)) {
      const word = /[A-Za-z_$]/.test(c)
        ? (/^[A-Za-z_$][\w$]*/.exec(src.slice(i, i + 32))?.[0] ?? c)
        : c;
      prev =
        /^(return|typeof|case|in|of|delete|void|throw|new|else|do|yield|await)$/.test(
          word,
        )
          ? "("
          : word;
      i += word.length;
      continue;
    }
    i++;
  }
  return out;
}

function scanCss(
  src: string,
  base = 0,
  out: [number, number][] = [],
): [number, number][] {
  let i = 0;
  while (i < src.length) {
    const c = src.charAt(i);
    if (c === '"' || c === "'") {
      i++;
      while (i < src.length && src.charAt(i) !== c)
        i += src.charAt(i) === "\\" ? 2 : 1;
      i++;
    } else if (c === "/" && src.charAt(i + 1) === "*") {
      const e = src.indexOf("*/", i + 2);
      const end = e < 0 ? src.length : e + 2;
      out.push([base + i, base + end]);
      i = end;
    } else i++;
  }
  return out;
}

function scanMarkup(src: string): [number, number][] {
  const out: [number, number][] = [];
  const block = /<(script|style)\b[^>]*>([\s\S]*?)<\/\1>|<!--[\s\S]*?-->/g;
  for (const m of src.matchAll(block)) {
    const at = m.index ?? 0;
    if (m[0].startsWith("<!--")) out.push([at, at + m[0].length]);
    else {
      const bodyAt = at + m[0].indexOf(">") + 1;
      (m[1] === "script" ? scanJs : scanCss)(m[2] ?? "", bodyAt, out);
    }
  }
  return out;
}

function scanHash(src: string): [number, number][] {
  const out: [number, number][] = [];
  let off = 0;
  for (const line of src.split("\n")) {
    let q = "";
    for (let k = 0; k < line.length; k++) {
      const c = line.charAt(k);
      if (q) {
        if (c === "\\") k++;
        else if (c === q) q = "";
      } else if (c === '"' || c === "'") q = c;
      else if (
        c === "#" &&
        (k === 0 || /\s/.test(line.charAt(k - 1))) &&
        !(off === 0 && line.startsWith("#!"))
      ) {
        out.push([off + k, off + line.length]);
        break;
      }
    }
    off += line.length + 1;
  }
  return out;
}

function scanner(
  file: string,
): ((src: string) => [number, number][]) | undefined {
  if (/\.(ts|js|mjs)$/.test(file)) return (s) => scanJs(s);
  if (/\.(svelte|html)$/.test(file)) return scanMarkup;
  if (/\.css$/.test(file)) return (s) => scanCss(s);
  if (
    /\.(sh|ya?ml)$|(^|\/)Dockerfile$|(^|\/)\.(gitignore|dockerignore)$/.test(
      file,
    )
  )
    return scanHash;
  return undefined;
}

export function commentsIn(file: string, src: string): Comment[] {
  const scan = scanner(file);
  if (!scan) return [];
  return scan(src)
    .map(([a, b]) => {
      const text = src.slice(a, b);
      const line = lineOf(src, a);
      const endLine = line + (text.match(/\n/g)?.length ?? 0);
      const before = src.slice(src.lastIndexOf("\n", a - 1) + 1, a).trim();
      const eol = src.indexOf("\n", b);
      const after = src.slice(b, eol < 0 ? src.length : eol).trim();
      const ownLines =
        endLine -
        line +
        1 -
        (before ? 1 : 0) -
        (after && endLine > line ? 1 : 0) -
        (after && endLine === line && !before ? 1 : 0);
      return { file, line, endLine, text, ownLines: Math.max(0, ownLines) };
    })
    .filter((c) => !DIRECTIVE.test(c.text.trim()));
}

function trackedFiles(): string[] {
  const out = Bun.spawnSync(["git", "ls-files"])
    .stdout.toString()
    .trim()
    .split("\n");
  return out.filter((f) => scanner(f));
}

function main() {
  const args = new Set(process.argv.slice(2));
  const all = trackedFiles().flatMap((f) =>
    commentsIn(f, readFileSync(f, "utf8")),
  );
  if (args.has("--list")) {
    console.log(JSON.stringify(all, null, 1));
    return;
  }
  const counts: Record<string, number> = {};
  for (const c of all) counts[c.file] = (counts[c.file] ?? 0) + 1;
  const baseline: Record<string, number> = JSON.parse(
    readFileSync(BASELINE, "utf8"),
  );
  const over = Object.entries(counts).filter(
    ([f, n]) => n > (baseline[f] ?? 0),
  );
  if (args.has("--update")) {
    const next: Record<string, number> = {};
    for (const f of Object.keys(baseline).sort()) {
      const n = Math.min(baseline[f] ?? 0, counts[f] ?? 0);
      if (n > 0) next[f] = n;
    }
    writeFileSync(BASELINE, `${JSON.stringify(next, null, 2)}\n`);
  }
  if (over.length) {
    for (const [f, n] of over) {
      console.error(`${f}: ${n} comments, baseline allows ${baseline[f] ?? 0}`);
      for (const c of all.filter((x) => x.file === f))
        console.error(`  ${f}:${c.line} ${c.text.split("\n")[0]}`);
    }
    console.error(
      "No new comments: record decisions in docs/adr/, file an issue for a workaround.",
    );
    process.exit(1);
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const stale = Object.keys(baseline).filter(
    (f) => (counts[f] ?? 0) < (baseline[f] ?? 0),
  );
  if (stale.length && !args.has("--update")) {
    console.error(
      `comments: baseline is loose for ${stale.join(", ")}; run bun scripts/lint-comments.ts --update`,
    );
    process.exit(1);
  }
  console.log(`comments: ${total} remaining (ratchet ok)`);
}

if (import.meta.main) main();
