#!/usr/bin/env node
"use strict"
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto')
const { types } = require('node:util'), ts = require('typescript')
const isProxy = types.isProxy, descriptors = Object.getOwnPropertyDescriptors, ownKeys = Reflect.ownKeys, hasOwn = Object.hasOwn
const frozenOwners = Object.freeze({
  'src/workflowContractV2Product.ts': '595ad8ef36b41109f668a095aaa18532227b327573555bdd8d51a62b786220dd',
  'src/workflowContractV2Entrypoint.ts': '4f9bdc0b94393fbcbbcb32c7ff0d41d1454b745645b15d5f6edd3741ae72520b',
  'src/workflowContractV2ProviderLifecycle.ts': '0e9df7de9431e63f9723df189019e7ae5c21f5b6596f0dc93a4c9e11f0d3d76d',
  'src/workflowRuntimeFactory.ts': '799a3aaebf2f8b83a0bf55cbac249ad1b0f2e49c7055f4a271e113dd68b06c71',
  'src/workflowRegisterService.ts': 'de76f03cb2186bb3b84811823d0fae6e25c1bde41417b6dd83e7c12aa00587c3',
  'src/extension.ts': 'f91806cf03e77346aeaff80554acab37074a97886760173e8e95ac94df0ee2a0',
  'src/core/contractV2/planStore.ts': '15077c3f15b27f63d13336b5eb12dd35d42845b530fd7628744fb1620e464644'
})
const roots = Object.freeze(['src/extension.ts', 'src/extensionWithAuthoring.ts', 'src/workflowRuntimeFactory.ts',
  'src/workflowRegisterService.ts', 'src/commands/validateWorkflow.ts', 'src/gui/operationHubProvider.ts', 'src/core/contractV2/index.ts'])
const privateNames = new Set(['runPlanLeaseContext', 'runPlanState', 'runLeaseExecutionCoordinator',
  'workflowContractV2LeasedRunStateStore', 'workflowContractV2RuntimeBoundary', 'providerEnvelopeSnapshot', 'providerAttemptStaging', 'providerInvocation', 'artifactTransaction', 'workflowContractV2Executor', 'workflowContractV2BobRuntime'])
const forbiddenSymbols = new Set(['acquireWorkflowContractV2RunLease', 'executeWorkflowContractV2RuntimeBoundary',
  'coordinateWorkflowContractV2LeasedRunExecution', 'createRunFromPlanLease', 'createWorkflowPlanLease',
  'invokeBoundWorkflowProviderDispatch', 'invokeCompiledWorkflowProvider', 'createWorkflowAttemptStaging', 'beginWorkflowAttemptInvocation',
  'assertWorkflowAttemptStagingAuthority', 'readWorkflowAttemptStagedArtifacts', 'rejectWorkflowAttemptBeforeDispatch', 'snapshotBoundedWorkflowProviderEnvelope'])
const acquisitionMembers = new Set(['acquire', 'acquireCurrent', 'acquireCurrentWorkflowPackage', 'acquireWorkflowPlan'])
const fail = message => { throw new TypeError('Contract v2 reachability: ' + message) }
function dataArray(value) {
  if (isProxy(value) || !Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) fail('ordinary data array required')
  const fields = descriptors(value), length = fields.length?.value
  if (!Number.isSafeInteger(length) || length < 0 || length > 4096 || ownKeys(fields).length !== length + 1) fail('array bounds or sparse data')
  const result = []
  for (let i = 0; i < length; i++) { const d = fields[i]; if (!d || !hasOwn(d, 'value') || d.enumerable !== true) fail('accessor or sparse array'); result.push(d.value) }
  return result
}
function rowData(value) {
  if (isProxy(value) || !value || typeof value !== 'object' || Array.isArray(value)) fail('ordinary source data required')
  const proto = Object.getPrototypeOf(value); if (proto !== Object.prototype && proto !== null) fail('ordinary source prototype required')
  const d = descriptors(value); if (ownKeys(d).length !== 2 || !d.path || !d.text || !hasOwn(d.path, 'value') || !hasOwn(d.text, 'value') || d.path.enumerable !== true || d.text.enumerable !== true) fail('source exact data fields required')
  if (typeof d.text.value !== 'string' || Buffer.byteLength(d.text.value) > 2 * 1024 * 1024) fail('source text bounds')
  return { path: sourcePath(d.path.value), text: d.text.value }
}
function sourcePath(value) {
  if (typeof value !== 'string' || !/^src\/[A-Za-z0-9_./-]+\.(?:ts|js)$/.test(value) || value.split('/').some(p => !p || p === '.' || p === '..')) fail('source path is invalid')
  return value
}
function isPrivate(value) { return value.split('/').some(part => privateNames.has(part.replace(/\.(?:ts|js)$/, ''))) }
function symbolName(expression) {
  if (ts.isIdentifier(expression)) return expression.text
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text
  if (ts.isElementAccessExpression(expression) && expression.argumentExpression && ts.isStringLiteral(expression.argumentExpression)) return expression.argumentExpression.text
  return undefined
}
function enclosingFunction(node) { for (let p = node.parent; p; p = p.parent) if (ts.isFunctionDeclaration(p)) return p.name?.text; return undefined }
function guardFixtureCall(file, node, name) {
  return file === 'src/workflowContractV2ExecutionGuard.ts' && name === 'acquireCurrent'
    && enclosingFunction(node) === 'acquireWorkflowContractV2RunLease'
    && ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'input'
}
// The new bridge has one value-import owner. Normal named F6 APIs stay public.
function assertR2BridgeOwnership(rows) {
  const bridge = 'invokeBoundWorkflowProviderDispatch'
  for (const row of rows) {
    const tree = ts.createSourceFile(row.path, row.text, ts.ScriptTarget.Latest, true)
    if (tree.parseDiagnostics.length) fail('source syntax is invalid: ' + row.path)
    function inspect(node) {
      let moduleName, typeOnly = false, selected
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        moduleName = node.moduleSpecifier.text
        const clause = node.importClause
        typeOnly = node.isTypeOnly || clause?.isTypeOnly
        const binding = ts.isImportDeclaration(node) ? clause?.namedBindings : node.exportClause
        if (binding && (ts.isNamedImports(binding) || ts.isNamedExports(binding))) selected = binding.elements.filter(e => !e.isTypeOnly).map(e => (e.propertyName ?? e.name).text)
        if (clause?.name || (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings))) selected = undefined
        // A side-effect-only import does not hand out a module namespace.
        if (ts.isImportDeclaration(node) && !clause) selected = []
      } else if (ts.isImportEqualsDeclaration(node)) {
        typeOnly = node.isTypeOnly
        const reference = node.moduleReference
        if (ts.isExternalModuleReference(reference) && reference.expression && ts.isStringLiteral(reference.expression)) moduleName = reference.expression.text
      } else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require')) && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])) {
        moduleName = node.arguments[0].text
        const declaration = node.parent
        if (ts.isIdentifier(node.expression) && ts.isVariableDeclaration(declaration) && ts.isObjectBindingPattern(declaration.name)) {
          selected = []
          for (const element of declaration.name.elements) {
            if (element.dotDotDotToken || element.initializer || !ts.isIdentifier(element.name)) { selected = undefined; break }
            const key = element.propertyName ?? element.name
            if (ts.isIdentifier(key) || ts.isStringLiteral(key)) selected.push(key.text)
            else if (ts.isComputedPropertyName(key) && ts.isStringLiteral(key.expression)) selected.push(key.expression.text)
            else { selected = undefined; break }
          }
        }
      }
      if (moduleName?.startsWith('.') && !typeOnly) {
        const target = path.posix.normalize(path.posix.join(path.posix.dirname(row.path), moduleName)).replace(/\.(?:ts|js)$/, '')
        if (target === 'src/core/contractV2/providerRegistry') {
          if (!selected) fail('private bridge namespace authority: ' + row.path)
          if (selected.includes(bridge) && !(row.path === 'src/core/contractV2/providerInvocation.ts' && ts.isImportDeclaration(node))) fail('private bridge value owner: ' + row.path)
        }
      }
      ts.forEachChild(node, inspect)
    }
    inspect(tree)
  }
}

function validateContractV2ProductReachability(sources, rootPaths) {
  const rows = dataArray(sources).map(rowData), requested = dataArray(rootPaths).map(sourcePath), all = new Map(), folded = new Set()
  for (const row of rows) {
    if (folded.has(row.path.toLowerCase())) fail('duplicate or case alias source path')
    folded.add(row.path.toLowerCase()); all.set(row.path, row)
    if (frozenOwners[row.path] && crypto.createHash('sha256').update(row.text.replaceAll('\r\n', '\n')).digest('hex') !== frozenOwners[row.path]) fail('frozen P6/P5 owner changed: ' + row.path)
  }
  assertR2BridgeOwnership(rows)
  if (new Set(requested).size !== requested.length) fail('duplicate product root')
  const visited = new Set()
  function visit(file) {
    if (visited.has(file)) return
    if (isPrivate(file)) fail('private or conditional runtime reached: ' + file)
    const row = all.get(file); if (!row) fail('missing reachable source: ' + file)
    visited.add(file)
    const tree = ts.createSourceFile(file, row.text, ts.ScriptTarget.Latest, true)
    if (tree.parseDiagnostics.length) fail('source syntax is invalid: ' + file)
    const resolveImport = name => {
      if (!name.startsWith('.')) return undefined
      const p = path.posix.normalize(path.posix.join(path.posix.dirname(file), name))
      if (!p.startsWith('src/') || p.includes(':') || p.includes('\\')) fail('module path escapes source domain')
      if (isPrivate(p)) fail('private or conditional runtime import: ' + p)
      for (const candidate of [p, p + '.ts', p + '.js', p + '/index.ts', p + '/index.js']) if (all.has(candidate)) return candidate
      fail('missing imported source: ' + p)
    }
    function checkImport(name, node) {
      const clause = ts.isImportDeclaration(node) ? node.importClause : undefined
      const elements = clause?.namedBindings && ts.isNamedImports(clause.namedBindings) ? clause.namedBindings.elements : undefined
      const target = resolveImport(name)
      if (file === 'src/core/contractV2/index.ts' && target?.endsWith('/runPlanProvenance.ts')) fail('provenance public barrel must be type-only')
      if (target?.endsWith('/workflowContractV2ExecutionGuard.ts') && (!elements || elements.some(e => (e.propertyName ?? e.name).text === 'acquireWorkflowContractV2RunLease'))) fail('fixture lease helper cannot be a product import/export authority')
      if (elements) for (const e of elements) {
        const original = (e.propertyName ?? e.name).text
        if (forbiddenSymbols.has(original) && !(file === 'src/core/contractV2/planStore.ts' && original === 'createWorkflowPlanLease')) fail('runtime import symbol: ' + original)
      }
      if (target) visit(target)
    }
    function walk(node) {
      if (ts.isImportEqualsDeclaration(node) && !node.isTypeOnly) {
        const reference = node.moduleReference
        if (!ts.isExternalModuleReference(reference) || !reference.expression || !ts.isStringLiteral(reference.expression)) fail('dynamic import-equals authority')
        checkImport(reference.expression.text, node)
      }
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const clause = node.importClause
        const typeOnly = node.isTypeOnly || clause?.isTypeOnly || (clause && !clause.name && clause.namedBindings && ts.isNamedImports(clause.namedBindings) && clause.namedBindings.elements.every(e => e.isTypeOnly))
        if (!typeOnly) checkImport(node.moduleSpecifier.text, node)
      }
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
        if (node.arguments.length !== 1 || !ts.isStringLiteral(node.arguments[0])) fail('dynamic module authority')
        checkImport(node.arguments[0].text, node)
      }
      if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
        const name = symbolName(node)
        if (name && acquisitionMembers.has(name) && !frozenOwners[file] && !guardFixtureCall(file, node, name)) fail('new product acquisition member: ' + name)
        if (name && forbiddenSymbols.has(name)) fail('private runtime member: ' + name)
      }
      if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
        const name = symbolName(node.expression)
        if (name && forbiddenSymbols.has(name) && !(file === 'src/core/contractV2/planStore.ts' && name === 'createWorkflowPlanLease')) fail('private runtime invocation: ' + name)
        if (name === 'WorkflowPlanStore' && file !== 'src/workflowRuntimeFactory.ts') fail('alternate plan cache owner')
      }
      ts.forEachChild(node, walk)
    }
    walk(tree)
  }
  for (const file of requested) visit(file)
}
function assertContractV2ProductRuntimeUnreachable() {
  const extensionRoot = path.resolve(__dirname, '..'), rows = []
  const walk = dir => {
    const stat = fs.lstatSync(dir); if (stat.isSymbolicLink()) fail('source directory alias')
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isSymbolicLink()) fail('source path alias')
      if (entry.isDirectory()) walk(full)
      else if (/\.(?:ts|js)$/.test(entry.name)) { const s = fs.lstatSync(full); if (!s.isFile() || s.nlink !== 1) fail('linked or nonregular source'); rows.push({ path: path.relative(extensionRoot, full).replaceAll('\\', '/'), text: fs.readFileSync(full, 'utf8') }) }
    }
  }
  walk(path.join(extensionRoot, 'src'))
  validateContractV2ProductReachability(rows, roots)
}
module.exports = { validateContractV2ProductReachability, assertContractV2ProductRuntimeUnreachable }
if (require.main === module) {
  try { if (process.argv.length !== 2) fail('CLI accepts no arguments'); assertContractV2ProductRuntimeUnreachable(); console.log('Contract v2 product runtime reachability OK') } catch (error) { console.error(error.message); process.exitCode = 1 }
}
