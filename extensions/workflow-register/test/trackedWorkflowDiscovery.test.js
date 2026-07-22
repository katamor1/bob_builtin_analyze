"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { execFileSync } = require("node:child_process")
const { test } = require("node:test")

const {
  classifyTrackedWorkflows,
  discoverContributionManifests,
  discoverTrackedWorkflowPaths,
  normalizeWorkflowPath,
  validateTrackedWorkflowPath
} = require("../scripts/discover-tracked-workflows")

function git(repository, args) {
  return execFileSync("git", args, { cwd: repository, encoding: "utf8" })
}

function writeFile(repository, relativePath, contents = "# workflow\n") {
  const filePath = path.join(repository, ...relativePath.split("/"))
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, contents)
}

function manifest({ owner = "local.fixture", claims = [], exclusions = [] } = {}) {
  return JSON.stringify({
    owner: owner ? { id: owner, version: "1.0.0" } : undefined,
    workflow_claims: claims.map((workflowPath) => ({ path: workflowPath, role: "sample" })),
    workflow_exclusions: exclusions
  })
}

function createFixtureRepository() {
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), "tracked-workflow-discovery-"))
  git(repository, ["init", "--quiet"])
  git(repository, ["config", "user.email", "fixture@example.test"])
  git(repository, ["config", "user.name", "Fixture"])

  const rootWorkflow = "WORKFLOW.md"
  const nestedWorkflow = "nested/deep/WORKFLOW.md"
  const strictFixture = "extensions/fixture/test/fixtures/strict-compile/WORKFLOW.md"
  const nulSafeWorkflow = "nul\nname/WORKFLOW.md"
  const untrackedWorkflow = "untracked/WORKFLOW.md"
  const manifestPath = "extensions/fixture/contracts/workflow-contributions.json"
  for (const workflowPath of [rootWorkflow, nestedWorkflow, strictFixture, nulSafeWorkflow, untrackedWorkflow]) {
    writeFile(repository, workflowPath)
  }
  writeFile(repository, manifestPath, manifest({
    claims: [rootWorkflow, nestedWorkflow, nulSafeWorkflow],
    exclusions: [{ path: strictFixture, reason: "strict compile fixture" }]
  }))
  git(repository, ["add", rootWorkflow, nestedWorkflow, strictFixture, nulSafeWorkflow, manifestPath])
  git(repository, ["commit", "--quiet", "-m", "fixture"])
  return { repository, rootWorkflow, nestedWorkflow, strictFixture, nulSafeWorkflow, untrackedWorkflow, manifestPath }
}

test("discovers root, nested, strict-fixture, and NUL-safe tracked workflows without untracked files", (t) => {
  const fixture = createFixtureRepository()
  t.after(() => fs.rmSync(fixture.repository, { recursive: true, force: true }))

  const paths = discoverTrackedWorkflowPaths(fixture.repository)
  assert.deepEqual(paths, [
    fixture.rootWorkflow,
    fixture.nestedWorkflow,
    fixture.strictFixture,
    fixture.nulSafeWorkflow
  ].sort())
  assert.equal(paths.includes(fixture.untrackedWorkflow), false)

  const manifests = discoverContributionManifests(fixture.repository)
  const inventory = classifyTrackedWorkflows(fixture.repository, paths, manifests)
  assert.deepEqual(inventory, [
    { path: fixture.rootWorkflow, kind: "claim", role: "sample", owner: "local.fixture" },
    { path: fixture.nestedWorkflow, kind: "claim", role: "sample", owner: "local.fixture" },
    { path: fixture.strictFixture, kind: "exclusion", reason: "strict compile fixture", owner: "local.fixture" },
    { path: fixture.nulSafeWorkflow, kind: "claim", role: "sample", owner: "local.fixture" }
  ].sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0))
})

test("rejects paths with ambiguous, unsafe, ownerless, or reasonless classifications", (t) => {
  const fixture = createFixtureRepository()
  t.after(() => fs.rmSync(fixture.repository, { recursive: true, force: true }))
  const paths = discoverTrackedWorkflowPaths(fixture.repository)
  const base = discoverContributionManifests(fixture.repository)

  assert.throws(
    () => classifyTrackedWorkflows(fixture.repository, paths, [...base, {
      path: "extensions/other/contracts/workflow-contributions.json",
      manifest: JSON.parse(manifest({ owner: "local.other", claims: [fixture.rootWorkflow] }))
    }]),
    /classified more than once/
  )
  assert.throws(
    () => classifyTrackedWorkflows(fixture.repository, paths, [{
      path: base[0].path,
      manifest: JSON.parse(manifest({ claims: [fixture.rootWorkflow] }))
    }]),
    /is unclassified/
  )
  assert.throws(
    () => classifyTrackedWorkflows(fixture.repository, paths, [{ path: base[0].path, manifest: JSON.parse(manifest({ owner: "", exclusions: [{ path: fixture.strictFixture, reason: "fixture" }] })) }]),
    /owner id/
  )
  assert.throws(
    () => classifyTrackedWorkflows(fixture.repository, paths, [{ path: base[0].path, manifest: JSON.parse(manifest({ exclusions: [{ path: fixture.strictFixture, reason: "  " }] })) }]),
    /meaningful reason/
  )
  assert.throws(() => normalizeWorkflowPath("../outside/WORKFLOW.md"), /normalized repository-relative/)
  assert.throws(
    () => classifyTrackedWorkflows(fixture.repository, paths, [{
      path: base[0].path,
      manifest: JSON.parse(manifest({ claims: ["../outside/WORKFLOW.md"] }))
    }]),
    /normalized repository-relative/
  )
})

test("the checked-in inventory exactly records the workflows tracked in this checkout", () => {
  const repository = path.resolve(__dirname, "..", "..", "..")
  const expected = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "tracked-workflow-discovery", "real-repository-inventory.json"), "utf8"))
  assert.deepEqual({
    workflows: classifyTrackedWorkflows(
      repository,
      discoverTrackedWorkflowPaths(repository),
      discoverContributionManifests(repository)
    )
  }, expected)
})

test("rejects a tracked manifest when a committed intermediate directory is replaced by an outside symlink", (t) => {
  const fixture = createFixtureRepository()
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "tracked-workflow-manifest-outside-"))
  t.after(() => fs.rmSync(fixture.repository, { recursive: true, force: true }))
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }))

  writeFile(outside, "workflow-contributions.json", manifest({ owner: "local.attacker", claims: [fixture.rootWorkflow] }))
  const contractsDirectory = path.join(fixture.repository, "extensions", "fixture", "contracts")
  fs.rmSync(contractsDirectory, { recursive: true, force: true })
  fs.symlinkSync(outside, contractsDirectory, "dir")

  assert.throws(() => discoverContributionManifests(fixture.repository), /manifest path .*symlinked|escapes repository/)
})

test("preserves literal POSIX backslashes in raw Git paths but rejects them in manifest rules", (t) => {
  if (path.sep === "\\") {
    t.skip("Windows does not permit a literal backslash in a path component")
    return
  }
  const fixture = createFixtureRepository()
  t.after(() => fs.rmSync(fixture.repository, { recursive: true, force: true }))
  const literalBackslashWorkflow = "literal\\backslash/WORKFLOW.md"
  writeFile(fixture.repository, literalBackslashWorkflow)
  const fixtureManifest = JSON.parse(fs.readFileSync(path.join(fixture.repository, ...fixture.manifestPath.split("/")), "utf8"))
  fixtureManifest.workflow_claims.push({ path: literalBackslashWorkflow, role: "sample" })
  writeFile(fixture.repository, fixture.manifestPath, JSON.stringify(fixtureManifest))
  git(fixture.repository, ["add", literalBackslashWorkflow, fixture.manifestPath])
  git(fixture.repository, ["commit", "--quiet", "-m", "literal-backslash"])

  assert.equal(normalizeWorkflowPath(literalBackslashWorkflow), literalBackslashWorkflow)
  assert.equal(normalizeWorkflowPath("nested\\deep\\WORKFLOW.md", { pathSeparator: "\\" }), fixture.nestedWorkflow)
  const paths = discoverTrackedWorkflowPaths(fixture.repository)
  assert.ok(paths.includes(literalBackslashWorkflow))
  assert.throws(
    () => classifyTrackedWorkflows(fixture.repository, paths, discoverContributionManifests(fixture.repository)),
    /must be normalized with POSIX separators/
  )
})

test("normalizes platform separators and rejects symlinked or escaping workflow paths", (t) => {
  const fixture = createFixtureRepository()
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "tracked-workflow-outside-"))
  t.after(() => fs.rmSync(fixture.repository, { recursive: true, force: true }))
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }))

  assert.equal(normalizeWorkflowPath("nested\\deep\\WORKFLOW.md", { pathSeparator: "\\" }), fixture.nestedWorkflow)

  const symlinkPath = path.join(fixture.repository, "linked", "WORKFLOW.md")
  fs.mkdirSync(path.dirname(symlinkPath), { recursive: true })
  fs.symlinkSync(path.join(fixture.repository, fixture.rootWorkflow), symlinkPath)
  assert.throws(() => validateTrackedWorkflowPath(fixture.repository, "linked/WORKFLOW.md"), /symlinked/)

  writeFile(outside, "WORKFLOW.md")
  fs.symlinkSync(outside, path.join(fixture.repository, "escape"), "dir")
  assert.throws(() => validateTrackedWorkflowPath(fixture.repository, "escape/WORKFLOW.md"), /symlinked|escapes/)
})
