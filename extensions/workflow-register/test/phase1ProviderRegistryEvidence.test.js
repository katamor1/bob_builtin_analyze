"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { spawnSync } = require("node:child_process")
const { test } = require("node:test")
const { extensionRoot } = require("./helpers/sourceReader")
const {
  findLegacyPerKindReferences,
  hasExecutableRegistrationCall
} = require("../scripts/check-provider-registry-phase1")

test("Phase 1 evidence helper reports the exact rollout boundary and no production legacy callers", () => {
  const script = path.join(extensionRoot, "scripts", "check-provider-registry-phase1.js")
  const result = spawnSync(process.execPath, [script, "--json", "--allow-dirty"], {
    cwd: extensionRoot,
    encoding: "utf8"
  })

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  const report = JSON.parse(result.stdout)
  assert.equal(report.schemaVersion, "provider-registry-phase1-evidence/v1")
  assert.match(report.head, /^[0-9a-f]{40}$/)
  assert.equal(report.recoveryBase, "8793804f2f99fd1d545cb496064bcbdc7df4bf40")
  assert.match(report.reconstructedBase, /^[0-9a-f]{40}$/)
  assert.match(report.reconstructedBaseTree, /^[0-9a-f]{40}$/)
  assert.equal(report.reviewMode, "full-snapshot-plus-incremental-range")
  assert.equal(typeof report.worktreeClean, "boolean")
  assert.equal(
    report.evidenceSource,
    report.worktreeClean ? "commit" : "working-tree"
  )
  assert.equal(
    report.fullSnapshotCommit,
    report.worktreeClean ? report.head : null
  )
  assert.equal(
    report.incrementalReviewRange,
    report.worktreeClean ? `${report.reconstructedBase}..${report.head}` : null
  )
  assert.deepEqual(report.adapterPolicy, {
    deprecatedIn: "0.1.0",
    removeIn: "0.2.0",
    replacement: "provider-registry/v1"
  })
  assert.deepEqual(report.manifestOwners, [
    "local.bob-bazaar-review@0.3.0",
    "local.bob-code-consistency-review@0.1.0",
    "local.workflow-register@0.1.0"
  ])
  assert.deepEqual(report.nativeContributionConsumers, [
    "bob-bazaar-review",
    "bob-code-consistency-review",
    "workflow-register"
  ])
  assert.deepEqual(report.productionLegacyPerKindCalls, [])
  assert.equal(report.atomicLegacyAdapterPublished, true)
})

test("Phase 1 commit evidence rejects a dirty worktree by default", () => {
  const script = path.join(extensionRoot, "scripts", "check-provider-registry-phase1.js")
  const sentinel = path.join(extensionRoot, `.phase1-evidence-dirty-${process.pid}-${Date.now()}`)
  fs.writeFileSync(sentinel, "test-only dirty sentinel\n", "utf8")
  try {
    const result = spawnSync(process.execPath, [script, "--json"], {
      cwd: extensionRoot,
      encoding: "utf8"
    })

    assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`)
    assert.match(result.stderr, /Phase 1 commit evidence requires a clean worktree\./)
  } finally {
    fs.unlinkSync(sentinel)
  }
})

test("evidence scanner rejects every legacy per-kind reference form", () => {
  const source = [
    "api.registerActionProvider(value)",
    "api['registerAgentProvider'](value)",
    "const { registerResultSink } = api",
    "registerResultSink(value)",
    "type Legacy = { registerActionProvider: unknown }"
  ].join("\n")

  assert.deepEqual(
    findLegacyPerKindReferences(source).map((finding) => finding.name),
    [
      "registerActionProvider",
      "registerAgentProvider",
      "registerResultSink",
      "registerResultSink",
      "registerActionProvider"
    ]
  )
})

test("native consumer evidence requires an executable registration call", () => {
  assert.equal(hasExecutableRegistrationCall("// registerContributionSet(manifest)"), false)
  assert.equal(hasExecutableRegistrationCall("type Api = { registerContributionSet: unknown }"), false)
  assert.equal(hasExecutableRegistrationCall("api.registerContributionSet(manifest, provenance, handlers)"), true)
  assert.equal(hasExecutableRegistrationCall("api['registerContributionSet'](manifest, provenance, handlers)"), true)
  assert.equal(hasExecutableRegistrationCall("registerContributionSet(manifest, provenance, handlers)"), true)
})
