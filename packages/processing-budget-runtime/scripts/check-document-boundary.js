"use strict"
const fs = require("node:fs"), path = require("node:path"), ts = require("typescript")
const packageRoot = path.resolve(__dirname, "..")
const extensions = ["bob-bazaar-review", "bob-code-consistency-review"]
const parserOwners = new Map([
  ["bob-bazaar-review/ruleAuthoring/extraction/docxExtractor.ts", { method: "convertToHtml", parameter: "documentBuffer", functionName: "extractDocx", modules: ["mammoth", "cheerio"] }],
  ["bob-bazaar-review/ruleAuthoring/extraction/xlsxExtractor.ts", { method: "default", parameter: "workbookBuffer", functionName: "extractXlsx", modules: ["read-excel-file/node"] }],
  ["bob-code-consistency-review/analyzers/documentDocxExtractor.ts", { method: "convertToHtml", parameter: "documentBuffer", functionName: "extractDocxChunks", modules: ["mammoth", "cheerio"] }],
  ["bob-code-consistency-review/analyzers/documentXlsxExtractor.ts", { method: "default", parameter: "workbookBuffer", functionName: "extractXlsxChunks", modules: ["read-excel-file/node"] }],
  ["bob-code-consistency-review/core/reviewInputDiscovery.ts", { method: "default", parameter: "parserInput", functionName: "discoverXlsxCandidate", modules: ["read-excel-file/node"] }]
])
const callerOwners = new Map([
  ["extractDocx", "bob-bazaar-review/ruleAuthoring/extraction/documentExtractor.ts"],
  ["extractXlsx", "bob-bazaar-review/ruleAuthoring/extraction/documentExtractor.ts"],
  ["extractDocxChunks", "bob-code-consistency-review/analyzers/documentExtractor.ts"],
  ["extractXlsxChunks", "bob-code-consistency-review/analyzers/documentExtractor.ts"]
])
const engineOwners = new Map([
  ["bob-bazaar-review/ruleAuthoring/extraction/documentExtractor.ts", "withRuleOoxmlParserInput"],
  ["bob-bazaar-review/ruleAuthoring/extraction/ooxmlArchive.ts", "withValidatedOoxmlParserInput"],
  ["bob-code-consistency-review/analyzers/documentExtractor.ts", "withValidatedOoxmlParserInput"],
  ["bob-code-consistency-review/core/reviewInputDiscovery.ts", "withValidatedOoxmlParserInput"]
])
function fail(reason) { throw new Error("document boundary: " + reason) }
function identifier(node, name) { return node && ts.isIdentifier(node) && node.text === name }
function nearest(node, predicate) { for (let current = node.parent; current; current = current.parent) if (predicate(current)) return current }
function namedFunction(node) { return nearest(node, n => ts.isFunctionDeclaration(n)) }
function consumed(node) {
  let parent = node.parent
  while (parent && ts.isParenthesizedExpression(parent)) { node = parent; parent = parent.parent }
  return Boolean(parent && (ts.isAwaitExpression(parent) || ts.isReturnStatement(parent) || (ts.isArrowFunction(parent) && parent.body === node)))
}
function callbackBinding(arrow) {
  const binding = arrow.parameters[0]?.name
  return binding && ts.isObjectBindingPattern(binding) && binding.elements.some(item => identifier(item.name, "parserInput") && (!item.propertyName || identifier(item.propertyName, "parserInput")))
}
function verifiedCallback(node) {
  const arrow = nearest(node, n => ts.isArrowFunction(n))
  if (!arrow || !callbackBinding(arrow) || !arrow.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword)) return false
  const call = arrow.parent
  if (!ts.isCallExpression(call) || !ts.isIdentifier(call.expression)) return false
  const index = call.expression.text === "withRuleOoxmlParserInput" ? 4 : call.expression.text === "withValidatedOoxmlParserInput" ? 1 : -1
  return index >= 0 && call.arguments[index] === arrow && consumed(call)
}
function walkSource(directory, relative = "") {
  if (fs.lstatSync(directory).isSymbolicLink()) fail("source alias")
  const result = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) {
    if (entry.isSymbolicLink()) fail("source alias")
    const name = relative + entry.name, file = path.join(directory, entry.name)
    if (entry.isDirectory()) result.push(...walkSource(file, name + "/"))
    else if (entry.isFile() && entry.name.endsWith(".ts")) result.push({ name, file })
  }
  return result
}
function checkDocumentBoundaries(repositoryRoot) {
  if (typeof repositoryRoot !== "string" || !path.isAbsolute(repositoryRoot)) fail("absolute repository root required")
  if (JSON.parse(fs.readFileSync(path.join(packageRoot, "node_modules/typescript/package.json"))).version !== "5.9.3") fail("TypeScript 5.9.3 required")
  const parsers = new Map(), callers = new Map(), engines = new Map()
  for (const extension of extensions) for (const { name, file } of walkSource(path.join(repositoryRoot, "extensions", extension, "src"))) {
    const key = extension + "/" + name, facade = name === "sharedProcessingBudgetRuntime.ts", owner = parserOwners.get(key)
    const tree = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true)
    if (tree.parseDiagnostics.length) fail("invalid TypeScript syntax")
    function moduleAccess(value, typeOnly, kind) {
      if (!value || !ts.isStringLiteral(value)) fail("computed module access")
      const specifier = value.text
      if (/^(?:mammoth|cheerio|read-excel-file)(?:\/|$)/.test(specifier)) {
        if (!owner?.modules.includes(specifier) || (kind !== "import" && !typeOnly)) fail("unlisted parser import: " + key)
      }
      if (specifier === "fflate" && !facade) fail("codec outside facade")
      if (specifier.includes("processing-budget-runtime") || specifier.includes("shared-processing-budget-runtime")) {
        const allowedType = typeOnly && ["../../../packages/processing-budget-runtime/out", "../../../packages/processing-budget-runtime/out/validatedOoxml"].includes(specifier)
        const allowedRuntime = !typeOnly && kind === "require" && ["./shared-processing-budget-runtime", "./shared-processing-budget-runtime/validatedOoxml"].includes(specifier)
        if (!facade || (!allowedType && !allowedRuntime)) fail("deep import or source fallback")
      }
    }
    function visit(node) {
      if (ts.isImportDeclaration(node)) moduleAccess(node.moduleSpecifier, Boolean(node.importClause?.isTypeOnly), "import")
      if (ts.isExportDeclaration(node) && node.moduleSpecifier) moduleAccess(node.moduleSpecifier, Boolean(node.isTypeOnly), "export")
      if (ts.isImportTypeNode(node)) moduleAccess(ts.isLiteralTypeNode(node.argument) ? node.argument.literal : undefined, true, "type")
      if (ts.isIdentifier(node) && ["prepareOoxmlParserInput", "preflightOoxmlArchive", "decodeEntry", "inflateRawSync"].includes(node.text)) fail("legacy low-level owner")
      if (ts.isElementAccessExpression(node) && (identifier(node.expression, "mammoth") || identifier(node.expression, "readExcelFile"))) fail("computed parser access")
      if (ts.isPropertyAccessExpression(node) && (node.name.text === "convertToHtml" || identifier(node.expression, "readExcelFile"))) {
        const call = node.parent
        if (!ts.isCallExpression(call) || call.expression !== node) fail("parser alias")
        if (!owner || node.name.text !== owner.method || !identifier(node.expression, owner.method === "convertToHtml" ? "mammoth" : "readExcelFile")) fail("unlisted parser call")
        let argument = call.arguments[0]
        if (owner.method === "convertToHtml") {
          if (!argument || !ts.isObjectLiteralExpression(argument) || argument.properties.length !== 1) fail("path parser input")
          const property = argument.properties[0]
          if (!ts.isPropertyAssignment(property) || !identifier(property.name, "buffer")) fail("path parser input")
          argument = property.initializer
        }
        if (!identifier(argument, owner.parameter)) fail("unverified parser Buffer")
        const parentFunction = namedFunction(call)
        if (parentFunction?.name?.text !== owner.functionName) fail("parser outside approved function")
        if (owner.parameter === "parserInput") {
          if (!verifiedCallback(call)) fail("parser outside awaited callback")
        } else {
          const parameter = parentFunction.parameters[0]
          if (!identifier(parameter.name, owner.parameter) || !parameter.type || parameter.type.getText(tree) !== "Buffer") fail("parser parameter must be Buffer")
        }
        parsers.set(key, (parsers.get(key) || 0) + 1)
      }
      if (ts.isCallExpression(node)) {
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword) moduleAccess(node.arguments[0], false, "import")
        if (identifier(node.expression, "require")) moduleAccess(node.arguments[0], false, "require")
        if (ts.isIdentifier(node.expression) && callerOwners.has(node.expression.text)) {
          const name = node.expression.text
          if (callerOwners.get(name) !== key || !identifier(node.arguments[0], "parserInput") || !verifiedCallback(node)) fail("extractor outside verified callback")
          callers.set(name, (callers.get(name) || 0) + 1)
        }
        if (ts.isIdentifier(node.expression) && ["withRuleOoxmlParserInput", "withValidatedOoxmlParserInput"].includes(node.expression.text)) {
          const name = node.expression.text
          if (engineOwners.get(key) !== name || !consumed(node)) fail("unawaited callback Promise")
          const callback = node.arguments[name === "withRuleOoxmlParserInput" ? 4 : 1]
          if (key.endsWith("/ooxmlArchive.ts")) {
            if (!identifier(callback, "parse") || namedFunction(node)?.name?.text !== "withRuleOoxmlParserInput") fail("adapter callback bypass")
          } else if (!callback || !ts.isArrowFunction(callback) || !callbackBinding(callback) || !callback.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword)) fail("missing verified callback")
          engines.set(key, (engines.get(key) || 0) + 1)
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(tree)
  }
  for (const key of parserOwners.keys()) if (parsers.get(key) !== 1) fail("parser call inventory")
  for (const name of callerOwners.keys()) if (callers.get(name) !== 1) fail("extractor caller inventory")
  for (const key of engineOwners.keys()) if (engines.get(key) !== 1) fail("callback inventory")
}
if (require.main === module) {
  try { if (process.argv.length !== 2) fail("unexpected arguments"); checkDocumentBoundaries(path.resolve(packageRoot, "../..")); console.log(JSON.stringify({ state: "passed", parserCalls: 5 })) }
  catch (error) { console.error(error.message); process.exitCode = 1 }
}
module.exports = { checkDocumentBoundaries }
