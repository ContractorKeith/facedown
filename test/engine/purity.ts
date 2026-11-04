import { dirname, resolve, sep } from "node:path";
import * as ts from "typescript/unstable/ast";
import { parseSource } from "./parse-source";

const forbidden = new Set([
  "Bun",
  "process",
  "Date",
  "crypto",
  "performance",
  "eval",
  "Function",
  "globalThis",
  "window",
  "document",
  "self",
  "require",
  "fetch",
  "setTimeout",
  "setInterval",
  "setImmediate",
  "clearTimeout",
  "clearInterval",
  "queueMicrotask",
  "Math",
]);
const mathMembers = new Set([
  "floor",
  "ceil",
  "min",
  "max",
  "abs",
  "trunc",
  "sign",
  "imul",
  "pow",
  "round",
]);
function propertyName(node: ts.Identifier, parent: ts.Node): boolean {
  if (ts.isPropertyAccessExpression(parent)) return parent.name === node;
  if (
    ts.isPropertyAssignment(parent) ||
    ts.isPropertyDeclaration(parent) ||
    ts.isPropertySignatureDeclaration(parent) ||
    ts.isMethodDeclaration(parent) ||
    ts.isMethodSignatureDeclaration(parent) ||
    ts.isGetAccessorDeclaration(parent) ||
    ts.isSetAccessorDeclaration(parent)
  )
    return parent.name === node;
  if (ts.isQualifiedName(parent)) return parent.right === node;
  if (ts.isBindingElement(parent)) return parent.propertyName === node;
  return false;
}
export async function purityViolations(
  source: string,
  file: string,
  root: string,
): Promise<string[]> {
  const problems: string[] = [];
  const tree = await parseSource(source);
  const checkImport = (node: ts.Node | undefined) => {
    if (
      !node ||
      !(ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    ) {
      problems.push("Nonliteral import");
      return;
    }
    const path = node.text;
    const target = resolve(dirname(file), path);
    if (!path.startsWith(".") || !target.startsWith(`${resolve(root)}${sep}`))
      problems.push(`Import outside engine: ${path}`);
  };
  const visit = (node: ts.Node, parent: ts.Node) => {
    if (
      ts.isIdentifier(node) &&
      forbidden.has(node.text) &&
      !propertyName(node, parent)
    ) {
      const allowedMath =
        node.text === "Math" &&
        ts.isPropertyAccessExpression(parent) &&
        parent.expression === node &&
        mathMembers.has(parent.name.text);
      if (!allowedMath) problems.push(`Forbidden identifier: ${node.text}`);
    }
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier
    )
      checkImport(node.moduleSpecifier);
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument))
      checkImport(node.argument.literal);
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    )
      checkImport(node.arguments[0]);
    node.forEachChild((child) => {
      visit(child, node);
    });
  };
  visit(tree, tree);
  return problems;
}
