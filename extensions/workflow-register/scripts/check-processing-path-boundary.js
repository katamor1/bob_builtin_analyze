"use strict"
const fs = require("node:fs"), path = require("node:path"), ts = require("typescript")
const extensionRoot = path.resolve(__dirname, "..")
function fail(reason) { throw new Error("processing path boundary: " + reason) }
function files(directory) {
  if (fs.lstatSync(directory).isSymbolicLink()) fail("source alias")
  const found = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name)
    if (entry.isSymbolicLink()) fail("source alias")
    if (entry.isDirectory()) found.push(...files(file))
    else if (entry.isFile() && entry.name.endsWith(".ts")) found.push(file)
  }
  return found
}
function isPathLoad(call) {
  const join = call.arguments[0]
  return call.arguments.length === 1 && ts.isCallExpression(join)
    && ts.isPropertyAccessExpression(join.expression) && join.expression.expression.getText() === "path"
    && join.expression.name.text === "join" && join.arguments.length === 2
    && ts.isIdentifier(join.arguments[0]) && join.arguments[0].text === "directory"
    && ts.isStringLiteral(join.arguments[1]) && join.arguments[1].text === "pathPolicy.js"
}
function checkProcessingPathBoundary(root = extensionRoot) {
  const src = path.join(root, "src"), facade = path.join(src, "sharedProcessingBudgetRuntime.ts")
  if (!fs.existsSync(facade)) fail("path-only facade missing")
  for (const file of files(src)) {
    const tree = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true)
    const isFacade = file === facade
    let loads = 0
    function visit(node) {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const name = node.moduleSpecifier.text
        if (/processing-budget-runtime|shared-processing-budget-runtime/u.test(name)
          && !(isFacade && ts.isImportDeclaration(node) && node.importClause?.isTypeOnly
            && name === "../../../packages/processing-budget-runtime/out/pathPolicy")) fail("broad or direct shared runtime import")
      }
      if (ts.isCallExpression(node)) {
        if (ts.isIdentifier(node.expression) && node.expression.text === "require") {
          if (isFacade) {
            if (!isPathLoad(node)) fail("facade may load only its verified path module")
            loads++
          } else if (node.arguments.some(arg => ts.isStringLiteral(arg) && /processing-budget-runtime|shared-processing-budget-runtime/u.test(arg.text))) fail("direct shared runtime require")
        }
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments.some(arg => ts.isStringLiteral(arg) && /processing-budget-runtime|shared-processing-budget-runtime/u.test(arg.text))) fail("dynamic shared runtime import")
      }
      ts.forEachChild(node, visit)
    }
    visit(tree)
    if (isFacade && loads !== 1) fail("one verified path load required")
  }
  const canonical = path.resolve(root, "../../packages/processing-budget-runtime/src/pathPolicy.ts")
  if (!fs.existsSync(canonical) || fs.lstatSync(canonical).isSymbolicLink()) fail("canonical path source required")
  const tree = ts.createSourceFile(canonical, fs.readFileSync(canonical, "utf8"), ts.ScriptTarget.Latest, true)
  function visitCanonical(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      if (!ts.isStringLiteral(node.moduleSpecifier) || !["node:fs", "node:path"].includes(node.moduleSpecifier.text)) fail("canonical path dependency is not isolated")
    }
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === "require"))) fail("canonical dynamic runtime dependency")
      let parent = node.parent, insideFunction = false
      while (parent) { if (ts.isFunctionLike(parent)) { insideFunction = true; break } parent = parent.parent }
      if (!insideFunction) fail("canonical path import-time effect")
    }
    ts.forEachChild(node, visitCanonical)
  }
  visitCanonical(tree)
  return { state: "passed", profile: "path-only" }
}
if (require.main === module) {
  try {
    if (process.argv.length !== 2) fail("unexpected arguments")
    console.log(JSON.stringify(checkProcessingPathBoundary()))
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
module.exports = { checkProcessingPathBoundary }
