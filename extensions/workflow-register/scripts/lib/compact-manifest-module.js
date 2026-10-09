"use strict"
const ts = require("typescript")

// Only remove trivia. The parsed token/tree signature must remain identical;
// ASI-sensitive input falls back to its original bytes.
function parse(source) {
  const file = ts.createSourceFile("manifest.js", source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS)
  if (file.parseDiagnostics.length) throw new Error("Cannot compact malformed manifest JavaScript")
  return file
}
function signature(node, file) {
  const children = node.getChildren(file)
  return [node.kind, children.length ? children.map(child => signature(child, file)) : node.getText(file)]
}
function compactManifestModule(source) {
  if (typeof source !== "string") throw new TypeError("Manifest JavaScript must be text")
  const file = parse(source), tokens = []
  function collect(node) {
    const children = node.getChildren(file)
    if (children.length) children.forEach(collect)
    else if (node.kind !== ts.SyntaxKind.EndOfFileToken && node.getText(file)) tokens.push(node)
  }
  collect(file)
  let compact = "", previous
  const mergedOperators = new Set(["++", "--", "//", "/*", "&&", "||", "??", "?.", "<<", ">>", "**", "=>", "==", "!=", "+=", "-=", "*=", "/=", "%=", "<=", ">=", "&=", "|=", "^=", ".."])
  for (const token of tokens) {
    const text = token.getText(file), first = text[0], last = compact[compact.length - 1]
    if (previous && ((/[\w$]/.test(last) && /[\w$]/.test(first)) ||
      (previous.kind === ts.SyntaxKind.NumericLiteral && first === ".") ||
      (previous.kind === ts.SyntaxKind.RegularExpressionLiteral && /[\w$]/.test(first)) ||
      mergedOperators.has(last + first))) compact += " "
    compact += text
    previous = token
  }
  try {
    const compactFile = parse(compact)
    if (JSON.stringify(signature(compactFile, compactFile)) !== JSON.stringify(signature(file, file))) return source
  } catch { return source }
  return compact.length < source.length ? compact : source
}
module.exports = { compactManifestModule }