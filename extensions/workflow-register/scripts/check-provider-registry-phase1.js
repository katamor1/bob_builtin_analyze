"use strict"

const fs = require("node:fs")
const path = require("node:path")
const { execFileSync } = require("node:child_process")
const ts = require("typescript")

const extensionRoot = path.resolve(__dirname, "..")
const repositoryRoot = path.resolve(extensionRoot, "..", "..")
const PHASE1_RECOVERY_BASE = "8793804f2f99fd1d545cb496064bcbdc7df4bf40"

function git(...args) {
  return execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim()
}

function read(relativePath) {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8")
}

function manifestOwner(relativePath) {
  const manifest = JSON.parse(read(relativePath))
  return `${manifest.owner.id}@${manifest.owner.version}`
}

function sourceFiles(directory) {
  const files = []
  const pending = [directory]
  while (pending.length > 0) {
    const current = pending.pop()
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name)
      if (entry.isDirectory()) pending.push(entryPath)
      else if (entry.isFile() && entry.name.endsWith(".ts")) files.push(entryPath)
    }
  }
  return files.sort()
}

const LEGACY_PER_KIND_NAMES = new Set([
  "registerActionProvider",
  "registerAgentProvider",
  "registerResultSink"
])

function parseSource(source) {
  return ts.createSourceFile("phase1-evidence.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
}

function findLegacyPerKindReferences(source) {
  const findings = []
  const sourceFile = parseSource(source)
  const visit = (node) => {
    const value = ts.isIdentifier(node) || ts.isStringLiteralLike(node) ? node.text : undefined
    if (value && LEGACY_PER_KIND_NAMES.has(value)) {
      findings.push({
        name: value,
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
      })
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return findings
}

function calledMemberName(expression) {
  if (ts.isIdentifier(expression)) return expression.text
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text
  if (
    ts.isElementAccessExpression(expression) &&
    expression.argumentExpression &&
    ts.isStringLiteralLike(expression.argumentExpression)
  ) {
    return expression.argumentExpression.text
  }
  return undefined
}

function hasExecutableRegistrationCall(source, name = "registerContributionSet") {
  let found = false
  const visit = (node) => {
    if (found) return
    if (ts.isCallExpression(node) && calledMemberName(node.expression) === name) {
      found = true
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(parseSource(source))
  return found
}

function hasInterfaceMember(source, interfaceName, memberName) {
  let found = false
  const visit = (node) => {
    if (
      ts.isInterfaceDeclaration(node) &&
      node.name.text === interfaceName &&
      node.members.some((member) => member.name && propertyName(member.name) === memberName)
    ) {
      found = true
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(parseSource(source))
  return found
}

function hasObjectLiteralMember(source, memberName) {
  let found = false
  const visit = (node) => {
    if (
      ts.isObjectLiteralExpression(node) &&
      node.properties.some((property) => property.name && propertyName(property.name) === memberName)
    ) {
      found = true
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(parseSource(source))
  return found
}

function propertyName(node) {
  return ts.isIdentifier(node) || ts.isStringLiteralLike(node) ? node.text : undefined
}

function readPolicyFromSource(source) {
  let policy
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "LEGACY_CONTRIBUTION_ADAPTER_POLICY" &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      node.initializer.arguments.length === 1 &&
      ts.isObjectLiteralExpression(node.initializer.arguments[0])
    ) {
      const values = {}
      for (const property of node.initializer.arguments[0].properties) {
        if (!ts.isPropertyAssignment(property) || !property.name) continue
        const name = propertyName(property.name)
        if (!name) continue
        if (ts.isStringLiteralLike(property.initializer)) values[name] = property.initializer.text
        else if (
          ts.isIdentifier(property.initializer) &&
          property.initializer.text === "PROVIDER_REGISTRY_API_VERSION"
        ) values[name] = "provider-registry/v1"
      }
      policy = values
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(parseSource(source))
  if (!policy) throw new Error("Legacy contribution adapter source policy is missing.")
  return policy
}

function legacyPerKindCalls() {
  const findings = []
  for (const extensionName of [
    "workflow-register",
    "bob-bazaar-review",
    "bob-code-consistency-review"
  ]) {
    const srcRoot = path.join(repositoryRoot, "extensions", extensionName, "src")
    for (const file of sourceFiles(srcRoot)) {
      const text = fs.readFileSync(file, "utf8")
      for (const finding of findLegacyPerKindReferences(text)) {
        findings.push(`${path.relative(repositoryRoot, file).split(path.sep).join("/")}:${finding.line}:${finding.name}`)
      }
    }
  }
  return findings
}

function assertNativeConsumer(relativePath, label) {
  if (!hasExecutableRegistrationCall(read(relativePath))) {
    throw new Error(`${label} does not use registerContributionSet.`)
  }
  return label
}

function buildReport(options = {}) {
  const head = git("rev-parse", "HEAD")
  const reconstructedBase = git("rev-list", "--max-parents=0", "HEAD").split(/\s+/)[0]
  const reconstructedBaseTree = git("rev-parse", `${reconstructedBase}^{tree}`)
  const worktreeClean = git("status", "--porcelain=v1", "--untracked-files=all") === ""
  if (!worktreeClean && !options.allowDirty) {
    throw new Error("Phase 1 commit evidence requires a clean worktree.")
  }
  const adapterModule = path.join(extensionRoot, "out", "api", "legacyContributionAdapter.js")
  if (!fs.existsSync(adapterModule)) {
    throw new Error("Compile workflow-register before collecting Phase 1 evidence.")
  }
  delete require.cache[adapterModule]
  const { LEGACY_CONTRIBUTION_ADAPTER_POLICY: compiledAdapterPolicy } = require(adapterModule)
  const adapterPolicy = readPolicyFromSource(read("extensions/workflow-register/src/api/legacyContributionAdapter.ts"))
  if (
    adapterPolicy.deprecatedIn !== compiledAdapterPolicy.deprecatedIn ||
    adapterPolicy.removeIn !== compiledAdapterPolicy.removeIn ||
    adapterPolicy.replacement !== compiledAdapterPolicy.replacement
  ) {
    throw new Error("Compiled legacy adapter policy does not match its source.")
  }
  const productionLegacyPerKindCalls = legacyPerKindCalls()
  if (productionLegacyPerKindCalls.length > 0) {
    throw new Error(`Production legacy per-kind calls remain: ${productionLegacyPerKindCalls.join(", ")}`)
  }

  const extensionSource = read("extensions/workflow-register/src/extension.ts")
  const atomicLegacyAdapterPublished =
    hasInterfaceMember(extensionSource, "WorkflowRegisterApi", "registerLegacyContributionSet") &&
    hasObjectLiteralMember(extensionSource, "registerLegacyContributionSet") &&
    hasExecutableRegistrationCall(extensionSource, "registerLegacyContributionSet") &&
    findLegacyPerKindReferences(extensionSource).length === 0
  if (!atomicLegacyAdapterPublished) {
    throw new Error("The public API does not expose only the atomic legacy contribution adapter.")
  }

  return {
    schemaVersion: "provider-registry-phase1-evidence/v1",
    head,
    recoveryBase: PHASE1_RECOVERY_BASE,
    reconstructedBase,
    reconstructedBaseTree,
    reviewMode: "full-snapshot-plus-incremental-range",
    worktreeClean,
    evidenceSource: worktreeClean ? "commit" : "working-tree",
    fullSnapshotCommit: worktreeClean ? head : null,
    incrementalReviewRange: worktreeClean ? `${reconstructedBase}..${head}` : null,
    adapterPolicy: {
      deprecatedIn: adapterPolicy.deprecatedIn,
      removeIn: adapterPolicy.removeIn,
      replacement: adapterPolicy.replacement
    },
    manifestOwners: [
      manifestOwner("extensions/bob-bazaar-review/contracts/workflow-contributions.json"),
      manifestOwner("extensions/bob-code-consistency-review/contracts/workflow-contributions.json"),
      manifestOwner("extensions/workflow-register/contracts/workflow-contributions.json")
    ].sort(),
    nativeContributionConsumers: [
      assertNativeConsumer(
        "extensions/bob-bazaar-review/src/workflow/workflowRegisterBridge.ts",
        "bob-bazaar-review"
      ),
      assertNativeConsumer(
        "extensions/bob-code-consistency-review/src/workflowProviderRegistration.ts",
        "bob-code-consistency-review"
      ),
      assertNativeConsumer(
        "extensions/workflow-register/src/builtInContributions.ts",
        "workflow-register"
      )
    ].sort(),
    productionLegacyPerKindCalls,
    atomicLegacyAdapterPublished
  }
}

function main() {
  const allowDirty = process.argv.includes("--allow-dirty")
  const report = buildReport({ allowDirty })
  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify(report)}\n`)
    return
  }
  process.stdout.write([
    worktreeCleanLabel(report),
    `HEAD: ${report.head}`,
    `Recovery base: ${report.recoveryBase}`,
    `Full snapshot: ${report.fullSnapshotCommit ?? "uncommitted working tree"}`,
    `Incremental review range: ${report.incrementalReviewRange ?? "uncommitted working tree"}`,
    `Adapter removal: ${report.adapterPolicy.removeIn}`,
    `Manifest owners: ${report.manifestOwners.join(", ")}`,
    `Native consumers: ${report.nativeContributionConsumers.join(", ")}`
  ].join("\n") + "\n")
}

function worktreeCleanLabel(report) {
  return report.worktreeClean
    ? "Provider registry Phase 1 commit evidence: PASS"
    : "Provider registry Phase 1 working-tree inspection: PASS (not commit evidence)"
}

if (require.main === module) main()

module.exports = {
  buildReport,
  findLegacyPerKindReferences,
  hasExecutableRegistrationCall
}
