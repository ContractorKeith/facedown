import { dirname, resolve, sep } from "node:path";

const forbidden = new Set([
  "Bun",
  "process",
  "Date",
  "crypto",
  "setTimeout",
  "setInterval",
  "fetch",
  "window",
  "document",
  "require",
]);
const tokenPattern =
  /\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|[A-Za-z_$][\w$]*|[^\s]/g;

// Keep strings as tokens but discard comments; whitespace cannot hide forbidden access.
export function purityViolations(
  source: string,
  file: string,
  root: string,
): string[] {
  const problems: string[] = [];
  const tokens = (source.match(tokenPattern) ?? []).filter(
    (token) => !token.startsWith("//") && !token.startsWith("/*"),
  );
  const isString = (token: string) =>
    token.startsWith('"') || token.startsWith("'");
  const text = (token: string) => token.slice(1, -1);
  const checkImport = (token: string | undefined) => {
    if (!token || !isString(token)) {
      problems.push("Nonliteral import");
      return;
    }
    const path = text(token);
    const target = resolve(dirname(file), path);
    if (!path.startsWith(".") || !target.startsWith(`${resolve(root)}${sep}`))
      problems.push(`Import outside engine: ${path}`);
  };
  for (const [i, token] of tokens.entries()) {
    if (forbidden.has(token)) problems.push(`Forbidden identifier: ${token}`);
    if (token === "Math" && tokens[i + 1] === "." && tokens[i + 2] === "random")
      problems.push("Forbidden Math.random");
    if (token === "[" && tokens[i + 1] && isString(tokens[i + 1] ?? "")) {
      const name = text(tokens[i + 1] ?? "");
      if (
        forbidden.has(name) ||
        (name === "random" && tokens[i - 1] === "Math")
      )
        problems.push(`Forbidden computed access: ${name}`);
    }
    if (token === "from" && isString(tokens[i + 1] ?? ""))
      checkImport(tokens[i + 1]);
    if (token === "import") {
      if (tokens[i + 1] === "(") checkImport(tokens[i + 2]);
      else if (isString(tokens[i + 1] ?? "")) checkImport(tokens[i + 1]);
    }
  }
  return problems;
}
