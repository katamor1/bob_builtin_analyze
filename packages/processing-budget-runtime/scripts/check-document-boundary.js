"use strict"
const fs = require("node:fs"), path = require("node:path"), ts = require("typescript")
const packageRoot = path.resolve(__dirname, "..")
const extensions = ["bob-bazaar-review", "bob-code-consistency-review"]
const bazaar = "bob-bazaar-review/ruleAuthoring/extraction/", consistency = "bob-code-consistency-review/"
const parserOwners = new Map([
  [bazaar + "docxExtractor.ts", { method: "convertToHtml", parameter: "documentBuffer", functionName: "extractDocx", signal: "context.signal", modules: ["mammoth", "cheerio"] }],
  [bazaar + "xlsxExtractor.ts", { method: "default", parameter: "workbookBuffer", functionName: "extractXlsx", signal: "context.signal", inspection: "context.workbookInspection", modules: ["read-excel-file/node"] }],
  [consistency + "analyzers/documentDocxExtractor.ts", { method: "convertToHtml", parameter: "documentBuffer", functionName: "extractDocxChunks", signal: "options?.signal", modules: ["mammoth", "cheerio"] }],
  [consistency + "analyzers/documentXlsxExtractor.ts", { method: "default", parameter: "workbookBuffer", functionName: "extractXlsxChunks", signal: "options?.signal", inspection: "options?.workbookInspection", modules: ["read-excel-file/node"] }],
  [consistency + "core/reviewInputDiscovery.ts", { method: "default", parameter: "parserInput", functionName: "discoverXlsxCandidate", modules: ["read-excel-file/node"] }]
])
const callerOwners = new Map([
  ["extractDocx", bazaar + "documentExtractor.ts"], ["extractXlsx", bazaar + "documentExtractor.ts"],
  ["extractDocxChunks", consistency + "analyzers/documentExtractor.ts"], ["extractXlsxChunks", consistency + "analyzers/documentExtractor.ts"]
])
const engineOwners = new Map([
  [bazaar + "documentExtractor.ts", { normal: "withRuleOoxmlParserInput", normalCount: 1, operationCount: 0 }],
  [bazaar + "ooxmlArchive.ts", { normal: "withValidatedOoxmlParserInput", normalCount: 1, operationCount: 1 }],
  [consistency + "analyzers/documentExtractor.ts", { normalCount: 0, operationCount: 1 }],
  [consistency + "core/reviewInputDiscovery.ts", { normal: "withValidatedOoxmlParserInput", normalCount: 1, operationCount: 0 }]
])
const normalEngines = new Set(["withRuleOoxmlParserInput", "withValidatedOoxmlParserInput"])
const selectionMethods = new Set(["readSelection", "fingerprintSelection", "verifyAfterExternalRead"])
function fail(reason) { throw new Error("document boundary: " + reason) }
function unwrap(node) { while (node && (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isParenthesizedExpression(node) || ts.isNonNullExpression(node) || ts.isSatisfiesExpression(node))) node = node.expression; return node }
function identifier(node, name) { return node && ts.isIdentifier(node) && node.text === name }
function nearest(node, predicate) { for (let current = node.parent; current; current = current.parent) if (predicate(current)) return current }
function namedFunction(node) { return nearest(node, n => ts.isFunctionDeclaration(n)) }
function text(node) { return node?.getText().replace(/\s+/g, "") }
function consumed(node) { let parent = node.parent; while (parent && ts.isParenthesizedExpression(parent)) { node = parent; parent = parent.parent } return Boolean(parent && (ts.isAwaitExpression(parent) || ts.isReturnStatement(parent) || (ts.isArrowFunction(parent) && parent.body === node))) }
function callbackBinding(arrow) { const binding = arrow.parameters[0]?.name; return binding && ts.isObjectBindingPattern(binding) && binding.elements.some(item => identifier(item.name, "parserInput") && (!item.propertyName || identifier(item.propertyName, "parserInput"))) }
function callbackIndex(call) { return ts.isIdentifier(call.expression) ? (call.expression.text === "withRuleOoxmlParserInput" ? 4 : call.expression.text === "withValidatedOoxmlParserInput" ? 1 : -1) : ts.isPropertyAccessExpression(call.expression) && call.expression.name.text === "withValidatedOoxml" ? 2 : -1 }
function verifiedCallback(node) { const arrow = nearest(node, n => ts.isArrowFunction(n)); if (!arrow || !callbackBinding(arrow) || !arrow.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword)) return undefined; const call = arrow.parent; return ts.isCallExpression(call) && call.arguments[callbackIndex(call)] === arrow && consumed(call) ? arrow : undefined }
function walkSource(directory, relative = "") { if (fs.lstatSync(directory).isSymbolicLink()) fail("source alias"); const result = []; for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) { if (entry.isSymbolicLink()) fail("source alias"); const name = relative + entry.name, file = path.join(directory, entry.name); if (entry.isDirectory()) result.push(...walkSource(file, name + "/")); else if (entry.isFile() && entry.name.endsWith(".ts")) result.push({ name, file }) } return result }
function forEach(node, predicate) { const result = []; function visit(current) { if (predicate(current)) result.push(current); ts.forEachChild(current, visit) } visit(node); return result }
function assertSignalStatement(statement, signal) { if (!statement || !ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression) || !identifier(statement.expression.expression, "assertDocumentNotCancelled") || statement.expression.arguments.length !== 1 || text(statement.expression.arguments[0]) !== signal) fail("missing cancellation adoption guard") }
function parserAdoption(call, owner) {
  const fn = namedFunction(call), statement = nearest(call, ts.isStatement), statements = fn.body?.statements
  if (!statements || !statements.includes(statement)) fail("parser must be in its owner body")
  assertSignalStatement(statements[0], owner.signal)
  const position = statements.indexOf(statement)
  const precedingAwait = statements.slice(0, position).findLastIndex(node => forEach(node, ts.isAwaitExpression).length > 0)
  if (precedingAwait < 0) fail("missing lazy module await")
  assertSignalStatement(statements[precedingAwait + 1], owner.signal)
  assertSignalStatement(statements[position + 1], owner.signal)
  if (owner.inspection) {
    const check = statements[position + 2]
    if (!check || !ts.isIfStatement(check) || text(check.expression) !== owner.inspection || !ts.isExpressionStatement(check.thenStatement)) fail("missing workbook materialization check")
    const invoke = check.thenStatement.expression
    if (!ts.isCallExpression(invoke) || !identifier(invoke.expression, "assertParsedXlsxWorkbookWithinBudget") || invoke.arguments.length !== 2 || !identifier(invoke.arguments[0], "workbook") || text(invoke.arguments[1]) !== owner.inspection.replace("?.", ".")) fail("unverified workbook inspection")
    const declaration = statement.declarationList?.declarations
    if (declaration?.length !== 1 || !identifier(declaration[0].name, "workbook")) fail("unverified materialized workbook")
  }
}
function inspectionArgument(call, name, arrow) {
  const binding = arrow.parameters[0].name
  if (!binding.elements.some(item => identifier(item.name, "prepared") && item.dotDotDotToken)) fail("inspection is not owner result")
  const options = call.arguments[name === "extractXlsx" ? 1 : 6]
  if (!options || !ts.isObjectLiteralExpression(options)) fail("missing extractor inspection options")
  const names = new Set(); let found = false
  for (const property of options.properties) {
    if (!(ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) || !ts.isIdentifier(property.name) || names.has(property.name.text)) fail("unlisted extractor option")
    names.add(property.name.text)
    if (property.name.text === "workbookInspection") { if (!ts.isPropertyAssignment(property) || text(property.initializer) !== "prepared.workbookInspection") fail("forged workbook inspection"); found = true }
  }
  if (!found) fail("missing extractor inspection")
}
function headerPolicy(node, expected) { const headers = forEach(node, n => ts.isPropertyAssignment(n) && identifier(n.name, "headerRows")); if (headers.length !== 1 || !ts.isNumericLiteral(unwrap(headers[0].initializer)) || unwrap(headers[0].initializer).text !== String(expected)) fail("unlisted workbook header policy") }
function checkDocumentBoundaries(repositoryRoot) {
  if (typeof repositoryRoot !== "string" || !path.isAbsolute(repositoryRoot)) fail("absolute repository root required")
  if (JSON.parse(fs.readFileSync(path.join(packageRoot, "node_modules/typescript/package.json"))).version !== "5.9.3") fail("TypeScript 5.9.3 required")
  const parsers = new Map(), callers = new Map(), engines = new Map()
  for (const extension of extensions) for (const { name, file } of walkSource(path.join(repositoryRoot, "extensions", extension, "src"))) {
    const key = extension + "/" + name, facade = name === "sharedProcessingBudgetRuntime.ts", owner = parserOwners.get(key), engine = engineOwners.get(key)
    const tree = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true)
    if (tree.parseDiagnostics.length) fail("invalid TypeScript syntax")
    function moduleAccess(value, typeOnly, kind, namespace = false) {
      if (!value || !ts.isStringLiteral(value)) fail("computed module access")
      const specifier = value.text
      if (/^(?:mammoth|cheerio|read-excel-file)(?:\/|$)/.test(specifier) && (!owner?.modules.includes(specifier) || (!typeOnly && kind !== "dynamic"))) fail("unlisted parser import: " + key)
      if (specifier === "fflate" && !facade) fail("codec outside facade")
      if (specifier.endsWith("sharedProcessingBudgetRuntime") && namespace && !typeOnly) fail("namespace runtime facade")
      if (specifier.includes("processing-budget-runtime") || specifier.includes("shared-processing-budget-runtime")) {
        const allowedType = typeOnly && ["../../../packages/processing-budget-runtime/out", "../../../packages/processing-budget-runtime/out/validatedOoxml"].includes(specifier)
        const allowedRuntime = !typeOnly && kind === "require" && ["./shared-processing-budget-runtime", "./shared-processing-budget-runtime/validatedOoxml"].includes(specifier)
        if (!facade || (!allowedType && !allowedRuntime)) fail("deep import or source fallback")
      }
    }
    function recordEngine(node, operation) {
      if (!engine || !consumed(node)) fail("unawaited callback Promise")
      const callback = node.arguments[callbackIndex(node)]
      if (key === bazaar + "ooxmlArchive.ts") {
        if (!identifier(unwrap(callback), "parse") || namedFunction(node)?.name?.text !== "withRuleOoxmlParserInput") fail("adapter callback bypass")
        if (operation) {
          if (text(node.expression.expression) !== "context.operation" || text(node.arguments[0]) !== "context.admission" || !identifier(node.arguments[1], "options")) fail("unlisted admitted adapter")
          const options = forEach(namedFunction(node), n => ts.isVariableDeclaration(n) && identifier(n.name, "options"))
          if (options.length !== 1) fail("missing workbook options")
          headerPolicy(options[0].initializer, 0)
        }
      } else {
        if (!callback || !ts.isArrowFunction(callback) || !callbackBinding(callback) || !callback.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword)) fail("missing verified callback")
        if (operation && (key !== consistency + "analyzers/documentExtractor.ts" || !identifier(node.expression.expression, "operation") || namedFunction(node)?.name?.text !== "extractFileChunks")) fail("unlisted operation callback")
        if (operation) headerPolicy(node.arguments[1], 1)
      }
      const count = engines.get(key) || { normal: 0, operation: 0 }; count[operation ? "operation" : "normal"]++; engines.set(key, count)
    }
    function visit(node) {
      if (ts.isImportDeclaration(node)) moduleAccess(node.moduleSpecifier, Boolean(node.importClause?.isTypeOnly), "static", node.importClause?.namedBindings && ts.isNamespaceImport(node.importClause.namedBindings))
      if (ts.isExportDeclaration(node) && node.moduleSpecifier) moduleAccess(node.moduleSpecifier, Boolean(node.isTypeOnly), "export", !node.exportClause || ts.isNamespaceExport(node.exportClause))
      if (ts.isImportTypeNode(node)) moduleAccess(ts.isLiteralTypeNode(node.argument) ? node.argument.literal : undefined, true, "type")
      if (ts.isIdentifier(node) && ["prepareOoxmlParserInput", "preflightOoxmlArchive", "decodeEntry", "inflateRawSync"].includes(node.text)) fail("legacy low-level owner")
      if (!facade && ts.isIdentifier(node) && normalEngines.has(node.text) && !((ts.isCallExpression(node.parent) && node.parent.expression === node) || ts.isImportSpecifier(node.parent) || (ts.isFunctionDeclaration(node.parent) && node.parent.name === node))) fail("callback engine alias")
      if (ts.isElementAccessExpression(node) && (identifier(node.expression, "mammoth") || identifier(node.expression, "readExcelFile") || text(node.expression) === "operation" || text(node.expression) === "context.operation")) fail("computed parser or operation access")
      if (!facade && ts.isPropertyAccessExpression(node) && (node.name.text === "withValidatedOoxml" || selectionMethods.has(node.name.text))) {
        const call = node.parent
        if (!ts.isCallExpression(call) || call.expression !== node) fail("operation method alias")
        if (node.name.text === "withValidatedOoxml") recordEngine(call, true)
        else if (![bazaar + "documentExtractor.ts", consistency + "analyzers/documentExtractor.ts"].includes(key) || !["operation", "context.operation"].includes(text(node.expression)) || !consumed(call)) fail("unawaited selection operation")
      }
      if (ts.isPropertyAccessExpression(node) && (node.name.text === "convertToHtml" || identifier(node.expression, "readExcelFile"))) {
        const call = node.parent
        if (!ts.isCallExpression(call) || call.expression !== node) fail("parser alias")
        if (!owner || node.name.text !== owner.method || !identifier(node.expression, owner.method === "convertToHtml" ? "mammoth" : "readExcelFile")) fail("unlisted parser call")
        let argument = call.arguments[0]
        if (owner.method === "convertToHtml") { if (!argument || !ts.isObjectLiteralExpression(argument) || argument.properties.length !== 1) fail("path parser input"); const property = argument.properties[0]; if (!ts.isPropertyAssignment(property) || !identifier(property.name, "buffer")) fail("path parser input"); argument = property.initializer }
        if (!identifier(argument, owner.parameter)) fail("unverified parser Buffer")
        const parentFunction = namedFunction(call)
        if (parentFunction?.name?.text !== owner.functionName) fail("parser outside approved function")
        if (owner.parameter === "parserInput") { if (!verifiedCallback(call)) fail("parser outside awaited callback") }
        else { const parameter = parentFunction.parameters[0]; if (!identifier(parameter.name, owner.parameter) || parameter.type?.getText(tree) !== "Buffer") fail("parser parameter must be Buffer"); parserAdoption(call, owner) }
        parsers.set(key, (parsers.get(key) || 0) + 1)
      }
      if (ts.isCallExpression(node)) {
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword) moduleAccess(node.arguments[0], false, "dynamic")
        if (identifier(node.expression, "require")) moduleAccess(node.arguments[0], false, "require")
        if (ts.isIdentifier(node.expression) && callerOwners.has(node.expression.text)) { const name = node.expression.text, arrow = verifiedCallback(node); if (callerOwners.get(name) !== key || !identifier(node.arguments[0], "parserInput") || !arrow) fail("extractor outside verified callback"); if (name === "extractXlsx" || name === "extractXlsxChunks") inspectionArgument(node, name, arrow); callers.set(name, (callers.get(name) || 0) + 1) }
        if (ts.isIdentifier(node.expression) && normalEngines.has(node.expression.text)) { if (engine?.normal !== node.expression.text) fail("unlisted normal callback"); recordEngine(node, false) }
      }
      ts.forEachChild(node, visit)
    }
    visit(tree)
  }
  for (const key of parserOwners.keys()) if (parsers.get(key) !== 1) fail("parser call inventory")
  for (const name of callerOwners.keys()) if (callers.get(name) !== 1) fail("extractor caller inventory")
  for (const [key, expected] of engineOwners) { const actual = engines.get(key); if (!actual || actual.normal !== expected.normalCount || actual.operation !== expected.operationCount) fail("callback inventory") }
}
if (require.main === module) { try { if (process.argv.length !== 2) fail("unexpected arguments"); checkDocumentBoundaries(path.resolve(packageRoot, "../..")); console.log(JSON.stringify({ state: "passed", parserCalls: 5 })) } catch (error) { console.error(error.message); process.exitCode = 1 } }
module.exports = { checkDocumentBoundaries }
