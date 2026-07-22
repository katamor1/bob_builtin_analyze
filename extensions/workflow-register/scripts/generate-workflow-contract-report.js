"use strict"

const { execFileSync } = require("node:child_process")
const crypto = require("node:crypto")
const fs = require("node:fs")
const path = require("node:path")
const { TextDecoder } = require("node:util")
const Ajv = require("ajv")

const { buildWorkflowContributionCatalog } = require("../out/core/contributionCatalog")
const { validateWorkflowTemplateMirrors } = require("../out/core/templateMirrorValidator")
const { compileWorkflowContractDocumentWithTrace } = require("../out/core/workflowCompiler")
const { serializeWorkflowContractReport, validateWorkflowContractReport, WORKFLOW_CONTRACT_REPORT_LIMITS } = require("../out/core/workflowContractReport")
const { validatePackagedContribution } = require("./validate-contribution-assets")
const { classifyWorkflowInventory } = require("./discover-tracked-workflows")

const CHECKS = ["command", "discovery", "mirror", "strict-compile", "vsix"]
const MAX_REPORT_BYTES = WORKFLOW_CONTRACT_REPORT_LIMITS.reportBytes
const MAX_SOURCE_BYTES = 8 * 1024 * 1024
const MAX_ARCHIVE_BYTES = 256 * 1024 * 1024
const MAX_TREE_ENTRIES = 100_000
const OWNER_PATTERN = /^[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/
const schemaPath = path.join(__dirname, "..", "schema", "workflow-contract-report.v1.schema.json")
const schemaRepositoryPath = "extensions/workflow-register/schema/workflow-contract-report.v1.schema.json"

function runWorkflowContractGate(input) {
  const options = snapshotGateOptions(input)
  const repositoryRoot = resolveRepositoryRoot(options.repositoryRoot)
  const firstState = snapshotGitState(options.readGitState(), "initial")
  assertExpectedGitState(firstState, options.expectedCommitSha, options.expectedTreeSha, "initial")
  const repositorySnapshot = options.defaultCollector
    ? createGitTreeSnapshot(repositoryRoot, options.expectedCommitSha, options.expectedTreeSha)
    : undefined
  const evidence = options.collectEvidence({ repositorySnapshot, archives: options.archives })
  const secondState = snapshotGitState(options.readGitState(), "final")
  assertExpectedGitState(secondState, options.expectedCommitSha, options.expectedTreeSha, "final")
  if (secondState.commitSha !== firstState.commitSha || secondState.treeSha !== firstState.treeSha) {
    throw new Error("repository HEAD advanced while workflow contract evidence was collected")
  }
  const evidenceRecord = ownRecord(evidence, "collected evidence")
  const report = {
    schema_version: "workflow-contract-report/v1",
    commit_sha: options.expectedCommitSha,
    tree_sha: options.expectedTreeSha,
    worktree_clean: true,
    manifests: ownData(evidenceRecord, "manifests", "collected evidence.manifests"),
    workflows: ownData(evidenceRecord, "workflows", "collected evidence.workflows"),
    resolutions: ownData(evidenceRecord, "resolutions", "collected evidence.resolutions"),
    vsix: ownData(evidenceRecord, "vsix", "collected evidence.vsix"),
    checks: ownData(evidenceRecord, "checks", "collected evidence.checks"),
    warnings: ownData(evidenceRecord, "warnings", "collected evidence.warnings")
  }
  const expectedWorkflowPaths = ownData(evidenceRecord, "expectedWorkflowPaths", "collected evidence.expectedWorkflowPaths")
  const semantic = validateWorkflowContractReport(report, {
    expectedCommitSha: options.expectedCommitSha,
    expectedTreeSha: options.expectedTreeSha,
    expectedWorkflowPaths
  })
  if (!semantic.ok) throw new Error(`workflow contract report semantic validation failed: ${semantic.diagnostics.join("; ")}`)
  const bytes = serializeWorkflowContractReport(semantic.report)
  assertSchema(bytes, repositorySnapshot?.readFile(schemaRepositoryPath, MAX_SOURCE_BYTES))
  atomicWrite(options.outputPath, bytes)
  return { outputPath: options.outputPath, report: semantic.report }
}

function runWorkflowContractValidation(input) {
  const options = snapshotGateOptions(input)
  const repositoryRoot = resolveRepositoryRoot(options.repositoryRoot)
  const firstState = snapshotGitState(options.readGitState(), "initial validation")
  assertExpectedGitState(firstState, options.expectedCommitSha, options.expectedTreeSha, "initial validation")
  const repositorySnapshot = options.defaultCollector
    ? createGitTreeSnapshot(repositoryRoot, options.expectedCommitSha, options.expectedTreeSha)
    : undefined
  const immutableSchema = repositorySnapshot?.readFile(schemaRepositoryPath, MAX_SOURCE_BYTES)
  const actual = validateReportFile(options.outputPath, {
    expectedCommitSha: options.expectedCommitSha,
    expectedTreeSha: options.expectedTreeSha
  }, immutableSchema)
  const evidence = options.collectEvidence({ repositorySnapshot, archives: options.archives })
  const secondState = snapshotGitState(options.readGitState(), "final validation")
  assertExpectedGitState(secondState, options.expectedCommitSha, options.expectedTreeSha, "final validation")
  if (secondState.commitSha !== firstState.commitSha || secondState.treeSha !== firstState.treeSha) {
    throw new Error("repository HEAD advanced while workflow contract evidence was validated")
  }
  const expectedReport = reportFromEvidence(evidence, options.expectedCommitSha, options.expectedTreeSha)
  const expectedWorkflowPaths = ownData(ownRecord(evidence, "collected evidence"), "expectedWorkflowPaths", "collected evidence.expectedWorkflowPaths")
  const semantic = validateWorkflowContractReport(expectedReport, {
    expectedCommitSha: options.expectedCommitSha,
    expectedTreeSha: options.expectedTreeSha,
    expectedWorkflowPaths
  })
  if (!semantic.ok || !semantic.report) throw new Error(`recollected workflow contract evidence is invalid: ${semantic.diagnostics.join("; ")}`)
  const expectedBytes = serializeWorkflowContractReport(semantic.report)
  assertSchema(expectedBytes, immutableSchema)
  const actualBytes = serializeWorkflowContractReport(actual)
  if (!actualBytes.equals(expectedBytes)) throw new Error("workflow contract report does not exactly match authoritative recollected evidence")
  return actual
}

function reportFromEvidence(evidence, commitSha, treeSha) {
  const evidenceRecord = ownRecord(evidence, "collected evidence")
  return {
    schema_version: "workflow-contract-report/v1",
    commit_sha: commitSha,
    tree_sha: treeSha,
    worktree_clean: true,
    manifests: ownData(evidenceRecord, "manifests", "collected evidence.manifests"),
    workflows: ownData(evidenceRecord, "workflows", "collected evidence.workflows"),
    resolutions: ownData(evidenceRecord, "resolutions", "collected evidence.resolutions"),
    vsix: ownData(evidenceRecord, "vsix", "collected evidence.vsix"),
    checks: ownData(evidenceRecord, "checks", "collected evidence.checks"),
    warnings: ownData(evidenceRecord, "warnings", "collected evidence.warnings")
  }
}

function collectRepositoryEvidence({ repositoryRoot, archives, repositorySnapshot }) {
  if (!repositorySnapshot) throw new Error("immutable repository snapshot is required")
  const manifestPaths = repositorySnapshot.paths.filter((entry) => entry.endsWith("/contracts/workflow-contributions.json"))
  const discovered = manifestPaths.map((manifestPath) => ({
    path: manifestPath,
    manifest: parseJson(repositorySnapshot.readFile(manifestPath, MAX_SOURCE_BYTES), manifestPath)
  }))
  if (discovered.length !== 3) throw new Error(`expected exactly three contribution manifests, found ${discovered.length}`)
  const inputs = discovered.map(({ path: manifestPath }) => catalogInput(repositorySnapshot, manifestPath))
  const catalog = buildWorkflowContributionCatalog(inputs)
  const workflowPaths = repositorySnapshot.paths.filter((entry) => entry === "WORKFLOW.md" || entry.endsWith("/WORKFLOW.md"))
  const inventory = classifyWorkflowInventory(workflowPaths, discovered)
  const mirror = validateWorkflowTemplateMirrors(inputs.map((input) => ({
    manifestPath: input.manifestPath,
    manifestContent: Buffer.from(input.manifestContent),
    context: input.context,
    readContent: (repositoryPath) => repositorySnapshot.readFile(repositoryPath, MAX_SOURCE_BYTES)
  })))
  if (!mirror.ok) throw new Error(`template mirror check failed: ${formatAssetDiagnostics(mirror.diagnostics)}`)

  const resolutions = []
  for (const workflow of inventory) {
    if (workflow.kind !== "claim") continue
    const result = compileWorkflowContractDocumentWithTrace({
      sourceId: workflow.owner,
      filePath: workflow.path,
      filePathSyntax: "canonical-repository",
      text: decodeWorkflowText(repositorySnapshot.readFile(workflow.path, MAX_SOURCE_BYTES)),
      contributionCatalog: catalog
    })
    if (!result.ok) {
      throw new Error(`strict workflow compile failed for ${boundedText(workflow.path)}: ${boundedText(result.diagnostics.map((item) => item.message).join("; "), 4096)}`)
    }
    resolutions.push(...result.resolutions)
  }
  resolutions.sort(resolutionCompare)

  const archiveMap = snapshotArchives(archives)
  const vsix = []
  for (const owner of catalog.owners) {
    const archivePath = archiveMap.get(owner.id)
    if (!archivePath) throw new Error(`missing VSIX archive for manifest owner ${owner.id}`)
    const ownerDirectory = path.posix.dirname(path.posix.dirname(owner.manifest_path))
    const archiveContent = readArchiveArtifact(repositoryRoot, archivePath)
    const expectedCatalog = createPackageExpectationFromSnapshot(repositorySnapshot, catalog, owner, ownerDirectory)
    const validation = validatePackagedContribution({ archiveContent, expectedCatalog, ownerId: owner.id })
    if (!validation.ok) throw new Error(`VSIX package contract failed for ${owner.id}: ${formatAssetDiagnostics(validation.diagnostics)}`)
    vsix.push({ owner: owner.id, archive_path: archivePath, sha256: sha256(archiveContent), status: "passed" })
  }
  if (archiveMap.size !== catalog.owners.length) throw new Error("VSIX archive owner set does not match manifest owners")
  vsix.sort((left, right) => compareText(left.owner, right.owner))

  return {
    expectedWorkflowPaths: inventory.map((entry) => entry.path),
    manifests: catalog.owners.map((owner) => ({
      owner: owner.id,
      version: owner.version,
      path: owner.manifest_path,
      sha256: owner.manifest_sha256,
      schemas: catalog.schemas.filter((schema) => schema.owner === owner.id).map((schema) => ({ path: schema.path, sha256: schema.sha256 }))
        .sort((left, right) => compareText(left.path, right.path))
    })).sort((left, right) => compareText(left.owner, right.owner) || compareText(left.path, right.path)),
    workflows: inventory.map((entry) => entry.kind === "claim"
      ? { path: entry.path, owner: entry.owner, classification: "claim", role: entry.role }
      : { path: entry.path, owner: entry.owner, classification: "exclusion", reason: entry.reason }),
    resolutions,
    vsix,
    checks: CHECKS.map((name) => ({ name, status: "passed" })),
    warnings: []
  }
}

function catalogInput(repositorySnapshot, manifestPath) {
  const ownerDirectory = path.posix.dirname(path.posix.dirname(manifestPath))
  const packageJson = parseJson(repositorySnapshot.readFile(`${ownerDirectory}/package.json`, MAX_SOURCE_BYTES), `${ownerDirectory}/package.json`)
  return {
    manifestPath,
    manifestContent: repositorySnapshot.readFile(manifestPath, MAX_SOURCE_BYTES),
    context: {
      expectedOwner: { id: `${packageJson.publisher}.${packageJson.name}`, version: packageJson.version },
      ownerDirectory
    },
    readContent: (repositoryPath) => repositorySnapshot.readFile(repositoryPath, MAX_SOURCE_BYTES)
  }
}

function defaultGitState(repositoryRoot) {
  const commitSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).trim()
  const treeSha = execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: repositoryRoot, encoding: "utf8" }).trim()
  const status = execFileSync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], { cwd: repositoryRoot, encoding: null, maxBuffer: 16 * 1024 * 1024 })
  return { commitSha, treeSha, clean: status.length === 0 }
}

function createGitTreeSnapshot(repositoryRoot, commitSha, expectedTreeSha) {
  const root = resolveRepositoryRoot(repositoryRoot)
  if (!/^[0-9a-f]{40}$/.test(commitSha) || !/^[0-9a-f]{40}$/.test(expectedTreeSha)) throw new Error("immutable snapshot commit and tree must be exact lowercase Git object IDs")
  try { execFileSync("git", ["cat-file", "-e", `${commitSha}^{commit}`], { cwd: root, stdio: ["ignore", "ignore", "ignore"] }) } catch {
    throw new Error("immutable snapshot commit is unavailable")
  }
  let actualTreeSha
  try { actualTreeSha = execFileSync("git", ["rev-parse", `${commitSha}^{tree}`], { cwd: root, encoding: "utf8" }).trim() } catch {
    throw new Error("immutable snapshot commit tree is unavailable")
  }
  if (actualTreeSha !== expectedTreeSha) throw new Error("immutable snapshot commit does not match the expected tree")
  let output
  try {
    output = execFileSync("git", ["ls-tree", "-rz", "--full-tree", "-r", commitSha], {
      cwd: root,
      encoding: null,
      maxBuffer: 32 * 1024 * 1024
    })
  } catch { throw new Error("immutable Git tree could not be listed") }
  const entries = new Map()
  const decoder = new TextDecoder("utf-8", { fatal: true })
  let offset = 0
  for (let index = 0; index < output.length; index += 1) {
    if (output[index] !== 0) continue
    if (entries.size >= MAX_TREE_ENTRIES) throw new Error("immutable Git tree exceeds its entry limit")
    const record = output.subarray(offset, index)
    offset = index + 1
    const tab = record.indexOf(9)
    if (tab <= 0) throw new Error("immutable Git tree entry is malformed")
    const metadata = record.subarray(0, tab).toString("ascii").split(" ")
    if (metadata.length !== 3 || !/^[0-7]{6}$/.test(metadata[0]) || !/^[0-9a-f]{40}$/.test(metadata[2])) throw new Error("immutable Git tree entry metadata is malformed")
    let repositoryPath
    try { repositoryPath = canonicalPath(decoder.decode(record.subarray(tab + 1))) } catch { throw new Error("immutable Git tree path is invalid UTF-8 or noncanonical") }
    if (entries.has(repositoryPath)) throw new Error("immutable Git tree contains a duplicate path")
    entries.set(repositoryPath, Object.freeze({ mode: metadata[0], type: metadata[1], oid: metadata[2] }))
  }
  if (offset !== output.length) throw new Error("immutable Git tree output is not NUL-terminated")
  const paths = Object.freeze([...entries.keys()].sort(compareText))
  return Object.freeze({
    commitSha,
    paths,
    readFile(repositoryPath, maximumBytes = MAX_SOURCE_BYTES) {
      const normalized = canonicalPath(repositoryPath)
      if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 0 || maximumBytes > MAX_ARCHIVE_BYTES) throw new Error("immutable blob byte limit is invalid")
      const entry = entries.get(normalized)
      if (!entry) throw new Error("immutable Git tree path is unavailable")
      if (entry.mode === "120000") throw new Error("immutable Git tree path is a symlink, not a regular blob")
      if ((entry.mode !== "100644" && entry.mode !== "100755") || entry.type !== "blob") throw new Error("immutable Git tree path is not a regular blob")
      let size
      try { size = Number(execFileSync("git", ["cat-file", "-s", entry.oid], { cwd: root, encoding: "utf8" }).trim()) } catch {
        throw new Error("immutable Git blob size is unavailable")
      }
      if (!Number.isSafeInteger(size) || size < 0 || size > maximumBytes) throw new Error("immutable Git blob exceeds its byte limit")
      let content
      try { content = execFileSync("git", ["cat-file", "blob", entry.oid], { cwd: root, encoding: null, maxBuffer: maximumBytes + 1 }) } catch {
        throw new Error("immutable Git blob is unavailable")
      }
      if (content.length !== size) throw new Error("immutable Git blob size changed while reading")
      return Buffer.from(content)
    }
  })
}

function readArchiveArtifact(repositoryRoot, repositoryPath) {
  const root = resolveRepositoryRoot(repositoryRoot)
  const normalized = canonicalPath(repositoryPath)
  const absolute = path.join(root, ...normalized.split("/"))
  const namedBefore = namedArchiveIdentity(root, absolute)
  const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0)
  let descriptor
  try { descriptor = fs.openSync(absolute, flags) } catch { throw new Error("VSIX archive is unavailable or symlinked") }
  try {
    const before = fs.fstatSync(descriptor, { bigint: true })
    if (!before.isFile()) throw new Error("VSIX archive is not a regular file")
    assertSameFileIdentity(namedBefore.stat, before, "VSIX archive changed before reading")
    const size = Number(before.size)
    if (!Number.isSafeInteger(size) || size < 0 || size > MAX_ARCHIVE_BYTES) throw new Error("VSIX archive exceeds its byte limit")
    const openedPath = openedDescriptorPath(descriptor)
    if (openedPath && openedPath !== namedBefore.realPath) throw new Error("VSIX archive descriptor does not match its named path")
    const content = Buffer.allocUnsafe(size)
    let offset = 0
    while (offset < size) {
      const read = fs.readSync(descriptor, content, offset, size - offset, offset)
      if (read === 0) throw new Error("VSIX archive ended while reading")
      offset += read
    }
    const after = fs.fstatSync(descriptor, { bigint: true })
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeNs !== after.mtimeNs) {
      throw new Error("VSIX archive changed while reading")
    }
    const namedAfter = namedArchiveIdentity(root, absolute)
    if (namedAfter.realPath !== namedBefore.realPath) throw new Error("VSIX archive named path changed while reading")
    assertSameFileIdentity(namedAfter.stat, after, "VSIX archive named path changed while reading")
    return content
  } finally {
    fs.closeSync(descriptor)
  }
}

function namedArchiveIdentity(root, absolute) {
  let realPath
  let stat
  try {
    realPath = fs.realpathSync(absolute)
    const relative = path.relative(root, realPath)
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("escape")
    stat = fs.statSync(realPath, { bigint: true })
  } catch { throw new Error("VSIX archive is unavailable, symlinked outside, or escapes the repository root") }
  if (!stat.isFile()) throw new Error("VSIX archive is not a regular file")
  return { realPath, stat }
}

function assertSameFileIdentity(named, opened, message) {
  if (named.dev !== opened.dev || named.ino !== opened.ino || named.size !== opened.size || named.mtimeNs !== opened.mtimeNs) throw new Error(message)
}

function openedDescriptorPath(descriptor) {
  for (const candidate of [`/proc/self/fd/${descriptor}`, `/dev/fd/${descriptor}`]) {
    try {
      const resolved = fs.realpathSync(candidate)
      if (!isDescriptorPseudoPath(resolved)) return resolved
    } catch {}
  }
  return undefined
}

function isDescriptorPseudoPath(value) {
  const normalized = path.resolve(value)
  return /^\/proc\/(?:self|[0-9]+)\/fd(?:\/|$)/.test(normalized) || /^\/dev\/fd(?:\/|$)/.test(normalized)
}

function createPackageExpectationFromSnapshot(repositorySnapshot, catalog, owner, ownerDirectory) {
  const packagePath = `${ownerDirectory}/package.json`
  const packageBytes = repositorySnapshot.readFile(packagePath, MAX_SOURCE_BYTES)
  const assets = [
    ...catalog.schemas.filter((asset) => asset.owner === owner.id).map((asset) => ({ kind: "schema", id: asset.id, path: asset.path, sha256: asset.sha256 })),
    ...catalog.workflow_templates.filter((asset) => asset.owner === owner.id).map((asset) => ({ kind: "template", id: asset.id, path: asset.path, sha256: asset.sha256 }))
  ].sort((left, right) => compareText(left.path, right.path) || compareText(left.kind, right.kind) || compareText(left.id, right.id))
  return {
    schema_version: "workflow-package-expectation/v1",
    owner: {
      id: owner.id,
      version: owner.version,
      owner_directory: ownerDirectory,
      manifest_path: owner.manifest_path,
      manifest_sha256: owner.manifest_sha256,
      package_path: packagePath,
      package_sha256: sha256(packageBytes)
    },
    assets
  }
}

function snapshotGateOptions(input) {
  const record = closedOwnDataRecord(input, [
    "repositoryRoot", "outputPath", "expectedCommitSha", "expectedTreeSha", "archives", "readGitState", "collectEvidence"
  ], ["archives", "readGitState", "collectEvidence"], "gate options")
  const repositoryRoot = ownData(record, "repositoryRoot", "gate options.repositoryRoot")
  const outputPath = ownData(record, "outputPath", "gate options.outputPath")
  const expectedCommitSha = ownData(record, "expectedCommitSha", "gate options.expectedCommitSha")
  const expectedTreeSha = ownData(record, "expectedTreeSha", "gate options.expectedTreeSha")
  const readGitStateValue = Object.hasOwn(record, "readGitState") ? ownData(record, "readGitState", "gate options.readGitState") : undefined
  const collectEvidenceValue = Object.hasOwn(record, "collectEvidence") ? ownData(record, "collectEvidence", "gate options.collectEvidence") : undefined
  const archives = snapshotArchiveRecords(Object.hasOwn(record, "archives") ? ownData(record, "archives", "gate options.archives") : [])
  if (typeof repositoryRoot !== "string" || repositoryRoot.length === 0) throw new Error("repositoryRoot must be a non-empty string")
  if (typeof outputPath !== "string" || outputPath.length === 0) throw new Error("outputPath must be a non-empty string")
  if (!/^[0-9a-f]{40}$/.test(expectedCommitSha) || !/^[0-9a-f]{40}$/.test(expectedTreeSha)) throw new Error("expected commit and tree SHAs must be exact lowercase Git object IDs")
  if (readGitStateValue !== undefined && typeof readGitStateValue !== "function") throw new Error("readGitState must be a function")
  if (collectEvidenceValue !== undefined && typeof collectEvidenceValue !== "function") throw new Error("collectEvidence must be a function")
  const defaultCollector = collectEvidenceValue === undefined
  return {
    repositoryRoot,
    outputPath: path.resolve(outputPath),
    expectedCommitSha,
    expectedTreeSha,
    archives,
    defaultCollector,
    readGitState: readGitStateValue ?? (() => defaultGitState(resolveRepositoryRoot(repositoryRoot))),
    collectEvidence: collectEvidenceValue ?? ((context) => collectRepositoryEvidence({
      repositoryRoot: resolveRepositoryRoot(repositoryRoot),
      archives: context.archives,
      repositorySnapshot: context.repositorySnapshot
    }))
  }
}

function snapshotArchiveRecords(value) {
  try { if (!Array.isArray(value)) throw new Error("invalid") } catch { throw new Error("gate options.archives must be a dense array") }
  const length = ownData(value, "length", "gate options.archives.length")
  if (!Number.isSafeInteger(length) || length < 0 || length > WORKFLOW_CONTRACT_REPORT_LIMITS.vsix) throw new Error("gate options.archives exceeds its item limit")
  const output = []
  for (let index = 0; index < length; index += 1) {
    const entry = ownData(value, String(index), `gate options.archives[${index}]`)
    const record = closedOwnDataRecord(entry, ["owner", "path"], [], `archive record ${index}`)
    const owner = ownData(record, "owner", `archive record ${index}.owner`)
    const archivePath = ownData(record, "path", `archive record ${index}.path`)
    if (
      typeof owner !== "string"
      || [...owner].length > WORKFLOW_CONTRACT_REPORT_LIMITS.ownerCodePoints
      || !OWNER_PATTERN.test(owner)
      || typeof archivePath !== "string"
    ) throw new Error("archive record owner/path is invalid")
    output.push(Object.freeze({ owner, path: canonicalPath(archivePath) }))
  }
  return Object.freeze(output)
}

function resolveRepositoryRoot(repositoryRoot) {
  try { return fs.realpathSync(repositoryRoot) } catch { throw new Error("repository root is unavailable") }
}

function snapshotGitState(value, label) {
  const record = ownRecord(value, `${label} Git state`)
  const commitSha = ownData(record, "commitSha", `${label} Git state.commitSha`)
  const treeSha = ownData(record, "treeSha", `${label} Git state.treeSha`)
  const clean = ownData(record, "clean", `${label} Git state.clean`)
  if (!/^[0-9a-f]{40}$/.test(commitSha) || !/^[0-9a-f]{40}$/.test(treeSha) || typeof clean !== "boolean") throw new Error(`${label} Git state is invalid`)
  return { commitSha, treeSha, clean }
}

function assertExpectedGitState(state, expectedCommitSha, expectedTreeSha, label) {
  if (!state.clean) throw new Error(`${label} repository worktree is dirty; evidence requires a clean worktree`)
  if (state.commitSha !== expectedCommitSha) throw new Error(`${label} repository commit does not match expected commit`)
  if (state.treeSha !== expectedTreeSha) throw new Error(`${label} repository tree does not match expected tree`)
}

function validateReportFile(reportPath, expectations = {}, schemaContent) {
  const bytes = readBoundedRegularFile(reportPath, MAX_REPORT_BYTES, "workflow contract report")
  const report = parseJson(bytes, "workflow contract report")
  assertSchema(bytes, schemaContent)
  const semantic = validateWorkflowContractReport(report, {
    expectedCommitSha: expectations.expectedCommitSha,
    expectedTreeSha: expectations.expectedTreeSha,
    expectedWorkflowPaths: expectations.expectedWorkflowPaths
  })
  if (!semantic.ok) throw new Error(`workflow contract report is invalid: ${semantic.diagnostics.join("; ")}`)
  const canonical = serializeWorkflowContractReport(semantic.report)
  if (!canonical.equals(bytes)) throw new Error("workflow contract report bytes are not canonical")
  return semantic.report
}

function readBoundedRegularFile(filePath, maximumBytes, label) {
  const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0)
  let descriptor
  try { descriptor = fs.openSync(filePath, flags) } catch { throw new Error(`${label} is unavailable or symlinked`) }
  try {
    const before = fs.fstatSync(descriptor, { bigint: true })
    if (!before.isFile()) throw new Error(`${label} is not a regular file`)
    const size = Number(before.size)
    if (!Number.isSafeInteger(size) || size < 0 || size > maximumBytes) throw new Error(`${label} exceeds its byte limit`)
    const bytes = Buffer.allocUnsafe(size)
    let offset = 0
    while (offset < size) {
      const read = fs.readSync(descriptor, bytes, offset, size - offset, offset)
      if (read === 0) throw new Error(`${label} ended while reading`)
      offset += read
    }
    const after = fs.fstatSync(descriptor, { bigint: true })
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeNs !== after.mtimeNs) throw new Error(`${label} changed while reading`)
    return bytes
  } finally {
    fs.closeSync(descriptor)
  }
}

function assertSchema(bytes, schemaContent) {
  const schema = JSON.parse(schemaContent === undefined ? fs.readFileSync(schemaPath, "utf8") : new TextDecoder("utf-8", { fatal: true }).decode(schemaContent))
  const validate = new Ajv({ allErrors: true, strict: true }).compile(schema)
  const report = parseJson(bytes, "workflow contract report")
  if (!validate(report)) throw new Error(`workflow contract report schema validation failed: ${JSON.stringify(validate.errors)}`)
}

function atomicWrite(outputPath, bytes) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  const temporary = `${outputPath}.${process.pid}.${crypto.randomBytes(8).toString("hex")}.tmp`
  try {
    fs.writeFileSync(temporary, bytes, { flag: "wx", mode: 0o600 })
    fs.renameSync(temporary, outputPath)
  } catch (error) {
    try { fs.unlinkSync(temporary) } catch {}
    throw error
  }
}

function snapshotArchives(value) {
  if (!Array.isArray(value)) throw new Error("archives must be an array")
  const length = ownData(value, "length", "archives.length")
  if (!Number.isSafeInteger(length) || length < 0 || length > 256) throw new Error("archives exceed their item limit")
  const map = new Map()
  for (let index = 0; index < length; index += 1) {
    const entry = ownData(value, String(index), `archives[${index}]`)
    const record = ownRecord(entry, "archive record")
    const owner = ownData(record, "owner", "archive record.owner")
    const archivePath = ownData(record, "path", "archive record.path")
    if (typeof owner !== "string" || typeof archivePath !== "string" || map.has(owner)) throw new Error("archive records must have unique string owner/path fields")
    map.set(owner, canonicalPath(archivePath))
  }
  return map
}

function readRepositoryFile(repositoryRoot, repositoryPath) {
  const normalized = canonicalPath(repositoryPath)
  let realRoot
  try { realRoot = fs.realpathSync(repositoryRoot) } catch { throw new Error("repository root is unavailable") }
  let current = realRoot
  try {
    for (const segment of normalized.split("/")) {
      current = path.join(current, segment)
      if (fs.lstatSync(current).isSymbolicLink()) throw new Error("symlink")
    }
    const relative = path.relative(realRoot, current)
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("escape")
    const stat = fs.statSync(current)
    if (!stat.isFile()) throw new Error("not-file")
    const realFile = fs.realpathSync(current)
    const realRelative = path.relative(realRoot, realFile)
    if (realRelative === ".." || realRelative.startsWith(`..${path.sep}`) || path.isAbsolute(realRelative)) throw new Error("escape")
    return fs.readFileSync(realFile)
  } catch {
    throw new Error("repository path is unavailable, symlinked, or escapes the repository root")
  }
}

function readWorkflowText(repositoryRoot, repositoryPath) {
  try { return decodeWorkflowText(readRepositoryFile(repositoryRoot, repositoryPath)) } catch (error) {
    if (error instanceof TypeError) throw new Error("tracked workflow content must be valid UTF-8")
    throw error
  }
}

function decodeWorkflowText(content) {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(content) } catch { throw new TypeError("tracked workflow content must be valid UTF-8") }
}

function canonicalPath(value) {
  if (typeof value !== "string" || !value || value.length > 2048 || /[\u0000-\u001f\u007f-\u009f]/.test(value) || value.startsWith("/") || value.includes("\\") || /^[A-Za-z]:/.test(value) || value.split("/").some((segment) => !segment || segment === "." || segment === "..")) throw new Error("repository path must be canonical")
  return value
}

function parseJson(bytes, label) {
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) } catch { throw new Error(`${label} must be valid UTF-8 JSON`) }
}
function ownRecord(value, label) {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid")
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) throw new Error("invalid")
    return value
  } catch { throw new Error(`${label} must be a plain object`) }
}
function ownData(record, key, label) { let descriptor; try { descriptor = Object.getOwnPropertyDescriptor(record, key) } catch { throw new Error(`${label} could not be snapshotted`) }; if (!descriptor || !("value" in descriptor)) throw new Error(`${label} must be an own data property`); return descriptor.value }
function closedOwnDataRecord(value, allowedKeys, optionalKeys, label) {
  const record = ownRecord(value, label)
  let actual
  try { actual = Reflect.ownKeys(record) } catch { throw new Error(`${label} could not be snapshotted`) }
  if (actual.some((key) => typeof key !== "string") || actual.some((key) => !allowedKeys.includes(key))) throw new Error(`${label} has unknown properties`)
  for (const key of allowedKeys) {
    if (!optionalKeys.includes(key) && !actual.includes(key)) throw new Error(`${label} has missing properties`)
  }
  const output = Object.create(null)
  for (const key of actual) output[key] = ownData(record, key, `${label}.${key}`)
  return output
}
function sha256(content) { return crypto.createHash("sha256").update(content).digest("hex") }
function compareText(left, right) { return left < right ? -1 : left > right ? 1 : 0 }
function resolutionCompare(left, right) { return compareText(left.workflow_path, right.workflow_path) || compareText(left.kind, right.kind) || compareText(left.location, right.location) || compareText(left.id, right.id) || compareText(left.owner, right.owner) }
function boundedText(value, maxBytes = 256) { const safe = String(value).replace(/[\u0000-\u001f\u007f-\u009f]/g, "�"); let output = ""; for (const character of safe) { if (Buffer.byteLength(output + character, "utf8") > maxBytes) break; output += character } return output }
function formatAssetDiagnostics(diagnostics) { return boundedText(diagnostics.slice(0, 20).map((item) => `${boundedText(item.code)}: ${boundedText(item.path)}`).join("; "), 4096) }

function parseArguments(argv) {
  const command = argv[0]
  const values = new Map()
  const archives = []
  for (let index = 1; index < argv.length; index += 2) {
    const flag = argv[index]
    const value = argv[index + 1]
    if (!flag?.startsWith("--") || value === undefined) throw new Error("invalid command arguments")
    if (flag === "--archive") {
      const separator = value.indexOf("=")
      if (separator <= 0) throw new Error("--archive must be owner=repository/path.vsix")
      archives.push({ owner: value.slice(0, separator), path: value.slice(separator + 1) })
    } else {
      if (values.has(flag)) throw new Error(`duplicate argument ${flag}`)
      values.set(flag, value)
    }
  }
  return { command, values, archives }
}

function main(argv) {
  const args = parseArguments(argv)
  if (args.command === "validate") {
    const reportPath = args.values.get("--report")
    const repositoryRoot = args.values.get("--repository-root")
    const expectedCommitSha = args.values.get("--expected-commit")
    const expectedTreeSha = args.values.get("--expected-tree")
    if (!reportPath || !repositoryRoot || !expectedCommitSha || !expectedTreeSha) throw new Error("validate requires --report, --repository-root, --expected-commit, and --expected-tree")
    runWorkflowContractValidation({
      repositoryRoot,
      outputPath: reportPath,
      expectedCommitSha,
      expectedTreeSha,
      archives: args.archives
    })
    process.stdout.write("workflow contract report validation passed\n")
    return
  }
  if (args.command !== "generate") throw new Error("expected generate or validate command")
  const repositoryRoot = args.values.get("--repository-root")
  const outputPath = args.values.get("--output")
  const expectedCommitSha = args.values.get("--expected-commit")
  const expectedTreeSha = args.values.get("--expected-tree")
  const result = runWorkflowContractGate({ repositoryRoot, outputPath, expectedCommitSha, expectedTreeSha, archives: args.archives })
  process.stdout.write(`${result.outputPath}\n`)
}

if (require.main === module) {
  try { main(process.argv.slice(2)) } catch (error) { process.stderr.write(`${boundedText(error instanceof Error ? error.message : "workflow contract gate failed", 4096)}\n`); process.exitCode = 1 }
}

module.exports = {
  collectRepositoryEvidence,
  createGitTreeSnapshot,
  defaultGitState,
  readRepositoryFile,
  readArchiveArtifactForTest: readArchiveArtifact,
  readWorkflowText,
  runWorkflowContractGate,
  runWorkflowContractValidation,
  snapshotGateOptionsForTest: snapshotGateOptions,
  validateReportFile
}
