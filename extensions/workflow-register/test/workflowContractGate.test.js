"use strict"

const assert = require("node:assert/strict")
const { execFileSync, spawnSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const gateScript = path.join(__dirname, "..", "scripts", "generate-workflow-contract-report.js")
const schemaPath = path.join(__dirname, "..", "schema", "workflow-contract-report.v1.schema.json")

function loadGate() {
  return require("../scripts/generate-workflow-contract-report")
}

function collectedEvidence() {
  return {
    expectedWorkflowPaths: ["WORKFLOW.md"],
    manifests: [{ owner: "local.fixture", version: "1.0.0", path: "extensions/fixture/contracts/workflow-contributions.json", sha256: "a".repeat(64), schemas: [] }],
    workflows: [{ path: "WORKFLOW.md", owner: "local.fixture", classification: "claim", role: "production" }],
    resolutions: [],
    vsix: [{ owner: "local.fixture", archive_path: "artifacts/fixture.vsix", sha256: "b".repeat(64), status: "passed" }],
    checks: ["command", "discovery", "mirror", "strict-compile", "vsix"].map((name) => ({ name, status: "passed" })),
    warnings: []
  }
}

function gateOptions(directory, states) {
  let index = 0
  return {
    repositoryRoot: directory,
    outputPath: path.join(directory, "workflow-contract-report.json"),
    expectedCommitSha: "1".repeat(40),
    expectedTreeSha: "2".repeat(40),
    readGitState: () => states[Math.min(index++, states.length - 1)],
    collectEvidence: () => collectedEvidence()
  }
}

function git(repository, args) {
  return execFileSync("git", args, { cwd: repository, encoding: "utf8" }).trim()
}

function createGitRepository() {
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-contract-cli-"))
  git(repository, ["init", "--quiet"])
  git(repository, ["config", "user.email", "fixture@example.test"])
  git(repository, ["config", "user.name", "Fixture"])
  fs.writeFileSync(path.join(repository, "README.md"), "first\n")
  const fixtureSchema = path.join(repository, "extensions", "workflow-register", "schema", "workflow-contract-report.v1.schema.json")
  fs.mkdirSync(path.dirname(fixtureSchema), { recursive: true })
  fs.copyFileSync(schemaPath, fixtureSchema)
  git(repository, ["add", "README.md", "extensions/workflow-register/schema/workflow-contract-report.v1.schema.json"])
  git(repository, ["commit", "--quiet", "-m", "first"])
  return repository
}

function cli(repository, expectedCommit, expectedTree, output) {
  return spawnSync(process.execPath, [gateScript, "generate", "--repository-root", repository, "--expected-commit", expectedCommit, "--expected-tree", expectedTree, "--output", output], { encoding: "utf8" })
}

test("gate refuses a dirty repository and leaves no partial report", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-contract-gate-"))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const output = path.join(directory, "workflow-contract-report.json")
  const { runWorkflowContractGate } = loadGate()
  assert.throws(
    () => runWorkflowContractGate(gateOptions(directory, [{ commitSha: "1".repeat(40), treeSha: "2".repeat(40), clean: false }])),
    /dirty|clean/i
  )
  assert.equal(fs.existsSync(output), false)
})

test("gate refuses HEAD advancing after expected SHA selection", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-contract-gate-"))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const first = { commitSha: "1".repeat(40), treeSha: "2".repeat(40), clean: true }
  const advanced = { commitSha: "3".repeat(40), treeSha: "4".repeat(40), clean: true }
  const { runWorkflowContractGate } = loadGate()
  assert.throws(() => runWorkflowContractGate(gateOptions(directory, [first, advanced])), /advanced|commit|tree/i)
  assert.equal(fs.existsSync(path.join(directory, "workflow-contract-report.json")), false)
})

test("gate writes one validated deterministic report atomically", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-contract-gate-"))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const state = { commitSha: "1".repeat(40), treeSha: "2".repeat(40), clean: true }
  const { runWorkflowContractGate } = loadGate()
  const first = runWorkflowContractGate(gateOptions(directory, [state, state]))
  const firstBytes = fs.readFileSync(first.outputPath)
  const second = runWorkflowContractGate(gateOptions(directory, [state, state]))
  assert.deepEqual(fs.readFileSync(second.outputPath), firstBytes)
  assert.equal(fs.readdirSync(directory).some((name) => name.includes(".tmp")), false)
})

test("gate rejects evidence that omits a discovered tracked workflow", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-contract-gate-"))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const state = { commitSha: "1".repeat(40), treeSha: "2".repeat(40), clean: true }
  const options = gateOptions(directory, [state, state])
  options.collectEvidence = () => ({ ...collectedEvidence(), expectedWorkflowPaths: ["MISSING/WORKFLOW.md"] })
  const { runWorkflowContractGate } = loadGate()
  assert.throws(() => runWorkflowContractGate(options), /expected workflow|workflow records/i)
  assert.equal(fs.existsSync(path.join(directory, "workflow-contract-report.json")), false)
})

test("real CLI rejects a dirty Git repository before evidence collection", (t) => {
  const repository = createGitRepository()
  t.after(() => fs.rmSync(repository, { recursive: true, force: true }))
  const commit = git(repository, ["rev-parse", "HEAD"])
  const tree = git(repository, ["rev-parse", "HEAD^{tree}"])
  fs.writeFileSync(path.join(repository, "dirty.txt"), "dirty\n")
  const output = path.join(repository, "workflow-contract-report.json")
  const result = cli(repository, commit, tree, output)
  assert.notEqual(result.status, 0)
  assert.match(`${result.stdout}\n${result.stderr}`, /dirty|worktree.*clean/i)
  assert.equal(fs.existsSync(output), false)
})

test("real CLI rejects expected commit A after repository advances to B", (t) => {
  const repository = createGitRepository()
  t.after(() => fs.rmSync(repository, { recursive: true, force: true }))
  const expectedCommit = git(repository, ["rev-parse", "HEAD"])
  const expectedTree = git(repository, ["rev-parse", "HEAD^{tree}"])
  fs.writeFileSync(path.join(repository, "README.md"), "second\n")
  git(repository, ["add", "README.md"])
  git(repository, ["commit", "--quiet", "-m", "second"])
  const output = path.join(repository, "workflow-contract-report.json")
  const result = cli(repository, expectedCommit, expectedTree, output)
  assert.notEqual(result.status, 0)
  assert.match(`${result.stdout}\n${result.stderr}`, /expected commit|advanced|commit.*match/i)
  assert.equal(fs.existsSync(output), false)
})

test("report validation CLI rejects structurally valid but non-authoritative evidence", (t) => {
  const repository = createGitRepository()
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-contract-validate-"))
  t.after(() => fs.rmSync(repository, { recursive: true, force: true }))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const reportPath = path.join(directory, "report.json")
  const commit = git(repository, ["rev-parse", "HEAD"])
  const tree = git(repository, ["rev-parse", "HEAD^{tree}"])
  const report = {
    schema_version: "workflow-contract-report/v1",
    commit_sha: commit, tree_sha: tree, worktree_clean: true,
    manifests: [{ owner: "local.fixture", version: "1.0.0", path: "extensions/fixture/contracts/workflow-contributions.json", sha256: "a".repeat(64), schemas: [] }],
    workflows: [{ path: "WORKFLOW.md", owner: "local.fixture", classification: "claim", role: "production" }],
    resolutions: [],
    vsix: [{ owner: "local.fixture", archive_path: "artifacts/fixture.vsix", sha256: "b".repeat(64), status: "passed" }],
    checks: ["command", "discovery", "mirror", "strict-compile", "vsix"].map((name) => ({ name, status: "passed" })), warnings: []
  }
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
  const validationArguments = [gateScript, "validate", "--report", reportPath, "--repository-root", repository, "--expected-commit", commit, "--expected-tree", tree]
  const valid = spawnSync(process.execPath, validationArguments, { encoding: "utf8" })
  assert.notEqual(valid.status, 0)
  assert.match(`${valid.stdout}\n${valid.stderr}`, /exactly three contribution manifests|authoritative|evidence/i)
  report.warnings.push("mutated")
  fs.writeFileSync(reportPath, JSON.stringify(report))
  const invalid = spawnSync(process.execPath, validationArguments, { encoding: "utf8" })
  assert.notEqual(invalid.status, 0)
  assert.match(`${invalid.stdout}\n${invalid.stderr}`, /warning|invalid/i)
})

test("authoritative validation replays every evidence row and digest exactly", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-contract-replay-"))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const outputPath = path.join(directory, "report.json")
  const state = { commitSha: "1".repeat(40), treeSha: "2".repeat(40), clean: true }
  const evidence = collectedEvidence()
  evidence.manifests[0].schemas = [{ path: "extensions/fixture/schema/sample.json", sha256: "c".repeat(64) }]
  evidence.workflows = [
    { path: "EXCLUDED/WORKFLOW.md", owner: "local.fixture", classification: "exclusion", reason: "fixture" },
    ...evidence.workflows,
    { path: "ZERO/WORKFLOW.md", owner: "local.fixture", classification: "claim", role: "zero-resolution" }
  ]
  evidence.expectedWorkflowPaths = evidence.workflows.map((entry) => entry.path)
  evidence.resolutions = [{
    workflow_path: "WORKFLOW.md", kind: "action_provider", location: "steps/sample/action/provider",
    id: "fixture.action", owner: "local.fixture", contract_version: "fixture.action/v1"
  }]
  const { runWorkflowContractGate, runWorkflowContractValidation } = loadGate()
  const options = {
    repositoryRoot: directory,
    outputPath,
    expectedCommitSha: state.commitSha,
    expectedTreeSha: state.treeSha,
    archives: [],
    readGitState: () => state,
    collectEvidence: () => structuredClone(evidence)
  }
  runWorkflowContractGate(options)
  assert.doesNotThrow(() => runWorkflowContractValidation(options))
  const original = JSON.parse(fs.readFileSync(outputPath, "utf8"))
  const mutations = [
    (report) => { report.workflows = report.workflows.filter((entry) => entry.path !== "WORKFLOW.md") },
    (report) => { report.workflows = report.workflows.filter((entry) => entry.path !== "ZERO/WORKFLOW.md") },
    (report) => { report.workflows = report.workflows.filter((entry) => entry.classification !== "exclusion") },
    (report) => { report.resolutions = [] },
    (report) => { report.manifests[0].schemas = [] },
    (report) => { report.manifests[0].schemas[0].sha256 = "d".repeat(64) },
    (report) => { report.manifests[0].sha256 = "e".repeat(64) },
    (report) => { report.vsix[0].sha256 = "f".repeat(64) }
  ]
  for (const mutate of mutations) {
    const changed = structuredClone(original)
    mutate(changed)
    fs.writeFileSync(outputPath, `${JSON.stringify(changed, null, 2)}\n`)
    assert.throws(() => runWorkflowContractValidation(options), /invalid|authoritative|exactly match|claimed workflow/i)
  }
})

test("report validation CLI rejects a canonical report bound to a different valid commit SHA", (t) => {
  const repository = createGitRepository()
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-contract-stale-report-"))
  t.after(() => fs.rmSync(repository, { recursive: true, force: true }))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const commit = git(repository, ["rev-parse", "HEAD"])
  const tree = git(repository, ["rev-parse", "HEAD^{tree}"])
  const reportPath = path.join(directory, "report.json")
  const report = {
    schema_version: "workflow-contract-report/v1", commit_sha: "f".repeat(40), tree_sha: tree, worktree_clean: true,
    manifests: [{ owner: "local.fixture", version: "1.0.0", path: "extensions/fixture/contracts/workflow-contributions.json", sha256: "a".repeat(64), schemas: [] }],
    workflows: [{ path: "WORKFLOW.md", owner: "local.fixture", classification: "claim", role: "production" }], resolutions: [],
    vsix: [{ owner: "local.fixture", archive_path: "artifacts/fixture.vsix", sha256: "b".repeat(64), status: "passed" }],
    checks: ["command", "discovery", "mirror", "strict-compile", "vsix"].map((name) => ({ name, status: "passed" })), warnings: []
  }
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
  const result = spawnSync(process.execPath, [gateScript, "validate", "--report", reportPath, "--repository-root", repository, "--expected-commit", commit, "--expected-tree", tree], { encoding: "utf8" })
  assert.notEqual(result.status, 0)
  assert.match(`${result.stdout}\n${result.stderr}`, /commit.*expected|does not match.*commit/i)
})

test("repository evidence reads reject a symlinked parent and fatal-decode workflow UTF-8", (t) => {
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-contract-path-"))
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-contract-outside-"))
  t.after(() => fs.rmSync(repository, { recursive: true, force: true }))
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }))
  fs.writeFileSync(path.join(outside, "schema.json"), "{}")
  fs.symlinkSync(outside, path.join(repository, "linked"), "dir")
  fs.mkdirSync(path.join(repository, "workflows"))
  fs.writeFileSync(path.join(repository, "workflows", "WORKFLOW.md"), Buffer.from([0xc3, 0x28]))
  const { readRepositoryFile, readWorkflowText } = loadGate()
  assert.equal(typeof readRepositoryFile, "function")
  assert.equal(typeof readWorkflowText, "function")
  assert.throws(() => readRepositoryFile(repository, "linked/schema.json"), /symlink|escape/i)
  assert.throws(() => readWorkflowText(repository, "workflows/WORKFLOW.md"), /UTF-8/i)
})

test("gate options are closed, inertly snapshotted, dense, bounded, and detached from caller mutation", () => {
  const { snapshotGateOptionsForTest } = loadGate()
  assert.equal(typeof snapshotGateOptionsForTest, "function")
  const base = {
    repositoryRoot: "/tmp/repository",
    outputPath: "/tmp/report.json",
    expectedCommitSha: "1".repeat(40),
    expectedTreeSha: "2".repeat(40),
    archives: [{ owner: "local.fixture", path: "fixture.vsix" }],
    readGitState() {},
    collectEvidence() {}
  }
  assert.throws(() => snapshotGateOptionsForTest({ ...base, unknown: true }), /unknown|gate options/i)
  let reads = 0
  const accessor = { ...base }
  Object.defineProperty(accessor, "archives", { enumerable: true, get() { reads += 1; return [] } })
  assert.throws(() => snapshotGateOptionsForTest(accessor), /own data|snapshot/i)
  assert.equal(reads, 0)
  const hostile = new Proxy(base, { getOwnPropertyDescriptor(_target, key) { if (key === "readGitState") throw new Error("HOSTILE_SECRET"); return Reflect.getOwnPropertyDescriptor(base, key) } })
  assert.throws(() => snapshotGateOptionsForTest(hostile), (error) => !String(error).includes("HOSTILE_SECRET"))
  const revoked = Proxy.revocable(base, {})
  revoked.revoke()
  assert.throws(() => snapshotGateOptionsForTest(revoked.proxy), (error) => !String(error).includes("revoked"))
  const sparse = { ...base, archives: new Array(1) }
  assert.throws(() => snapshotGateOptionsForTest(sparse), /archives|dense|own data/i)
  assert.throws(() => snapshotGateOptionsForTest({ ...base, archives: [[{ owner: "local.fixture", path: "fixture.vsix" }]] }), /archive record|object/i)
  assert.throws(() => snapshotGateOptionsForTest({ ...base, archives: [{ owner: "local.fixture", path: "fixture.vsix", unknown: true }] }), /unknown|archive record/i)
  assert.throws(() => snapshotGateOptionsForTest({ ...base, archives: [{ owner: `${"a".repeat(100)}.${"b".repeat(101)}`, path: "fixture.vsix" }] }), /archive record|invalid/i)
  const revokedArchives = Proxy.revocable([], {})
  revokedArchives.revoke()
  assert.throws(() => snapshotGateOptionsForTest({ ...base, archives: revokedArchives.proxy }), (error) => !String(error).includes("revoked"))
  const snapshot = snapshotGateOptionsForTest(base)
  base.archives[0].path = "mutated.vsix"
  assert.equal(snapshot.archives[0].path, "fixture.vsix")
})

test("immutable Git tree snapshot ignores worktree byte mutation and rejects symlink blobs", (t) => {
  const repository = createGitRepository()
  t.after(() => fs.rmSync(repository, { recursive: true, force: true }))
  fs.writeFileSync(path.join(repository, "tracked.json"), "committed\n")
  fs.symlinkSync("tracked.json", path.join(repository, "linked.json"))
  git(repository, ["add", "tracked.json", "linked.json"])
  git(repository, ["commit", "--quiet", "-m", "tree-inputs"])
  const commit = git(repository, ["rev-parse", "HEAD"])
  const tree = git(repository, ["rev-parse", "HEAD^{tree}"])
  const { createGitTreeSnapshot } = loadGate()
  assert.equal(typeof createGitTreeSnapshot, "function")
  assert.throws(() => createGitTreeSnapshot(repository, commit, "f".repeat(40)), /expected tree|does not match/i)
  const snapshot = createGitTreeSnapshot(repository, commit, tree)
  fs.writeFileSync(path.join(repository, "tracked.json"), "mutated\n")
  assert.equal(snapshot.readFile("tracked.json").toString("utf8"), "committed\n")
  assert.throws(() => snapshot.readFile("linked.json"), /symlink|regular blob/i)
})

test("oversized report validation rejects by stat before reading bytes", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-contract-oversize-"))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const reportPath = path.join(directory, "oversized.json")
  const fd = fs.openSync(reportPath, "w")
  fs.ftruncateSync(fd, 64 * 1024 * 1024 + 1)
  fs.closeSync(fd)
  const original = fs.readSync
  let reads = 0
  fs.readSync = function (...args) { reads += 1; return original.apply(this, args) }
  try {
    const { validateReportFile } = loadGate()
    assert.throws(() => validateReportFile(reportPath), /byte limit|too large/i)
    assert.equal(reads, 0)
  } finally {
    fs.readSync = original
  }
})

test("archive reads use one bounded regular-file descriptor and reject symlink paths", (t) => {
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-contract-archive-"))
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-contract-archive-outside-"))
  t.after(() => fs.rmSync(repository, { recursive: true, force: true }))
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }))
  fs.writeFileSync(path.join(repository, "valid.vsix"), "archive")
  fs.writeFileSync(path.join(outside, "outside.vsix"), "outside")
  fs.symlinkSync(path.join(outside, "outside.vsix"), path.join(repository, "linked.vsix"))
  fs.symlinkSync(outside, path.join(repository, "linked-parent"), "dir")
  const { readArchiveArtifactForTest } = loadGate()
  const originalRealpath = fs.realpathSync
  fs.realpathSync = function (candidate, ...rest) {
    if (String(candidate).startsWith("/proc/self/fd/") || String(candidate).startsWith("/dev/fd/")) throw new Error("descriptor pseudo-path unavailable")
    return originalRealpath.call(this, candidate, ...rest)
  }
  try {
    assert.equal(readArchiveArtifactForTest(repository, "valid.vsix").toString(), "archive")
  } finally {
    fs.realpathSync = originalRealpath
  }
  assert.throws(() => readArchiveArtifactForTest(repository, "linked.vsix"), /symlink|unavailable|escape/i)
  assert.throws(() => readArchiveArtifactForTest(repository, "linked-parent/outside.vsix"), /escape|repository root/i)
})

test("archive identity treats unresolved BSD fdescfs self-paths as unavailable hints", (t) => {
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-contract-fdescfs-"))
  t.after(() => fs.rmSync(repository, { recursive: true, force: true }))
  fs.writeFileSync(path.join(repository, "valid.vsix"), "archive")
  const { readArchiveArtifactForTest } = loadGate()
  const originalRealpath = fs.realpathSync
  fs.realpathSync = function (candidate, ...rest) {
    const value = String(candidate)
    if (value.startsWith("/proc/self/fd/")) throw new Error("procfs unavailable")
    if (value.startsWith("/dev/fd/")) return value
    return originalRealpath.call(this, candidate, ...rest)
  }
  try {
    assert.equal(readArchiveArtifactForTest(repository, "valid.vsix").toString(), "archive")
  } finally {
    fs.realpathSync = originalRealpath
  }
})

test("named archive identity remains authoritative when O_NOFOLLOW is unavailable", (t) => {
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-contract-no-nofollow-"))
  t.after(() => fs.rmSync(repository, { recursive: true, force: true }))
  fs.writeFileSync(path.join(repository, "valid.vsix"), "archive")
  fs.symlinkSync("valid.vsix", path.join(repository, "alias.vsix"))
  const { readArchiveArtifactForTest } = loadGate()
  const originalOpen = fs.openSync
  const originalRealpath = fs.realpathSync
  fs.openSync = function (candidate, flags, ...rest) {
    return originalOpen.call(this, candidate, flags & ~fs.constants.O_NOFOLLOW, ...rest)
  }
  fs.realpathSync = function (candidate, ...rest) {
    const value = String(candidate)
    if (value.startsWith("/proc/self/fd/") || value.startsWith("/dev/fd/")) throw new Error("descriptor pseudo-path unavailable")
    return originalRealpath.call(this, candidate, ...rest)
  }
  try {
    assert.equal(readArchiveArtifactForTest(repository, "alias.vsix").toString(), "archive")
  } finally {
    fs.openSync = originalOpen
    fs.realpathSync = originalRealpath
  }
})
