const assert = require("node:assert/strict")
const { createHash } = require("node:crypto")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

function ledgerApi() {
  return require("../out/evidenceScope/artifactLedger")
}

const HASH_A = `sha256:${"a".repeat(64)}`
const HASH_B = `sha256:${"b".repeat(64)}`
const HASH_C = `sha256:${"c".repeat(64)}`
const REV_A = "1".repeat(40)
const REV_B = "2".repeat(40)

function observation(overrides = {}) {
  return {
    id: "repository-symbol-index:repo",
    kind: "repository-symbol-index",
    producer: "producer-v1",
    path: ".bob/evidence-scope/repository-symbol-index.json",
    content_hash: HASH_A,
    input_hash: HASH_A,
    source_revision: REV_A,
    depends_on: [],
    ...overrides
  }
}

function previousLedger() {
  return {
    schema_version: 1,
    ledger_id: "bob-evidence-scope",
    source_revision: REV_A,
    artifacts: [
      {
        ...observation(),
        status: "fresh",
        stale_reasons: []
      },
      {
        ...observation({
          id: "review-package:REVIEW-001",
          kind: "review-package",
          producer: "bob-code-consistency-review@0.1.0",
          path: ".bob-review/review-package",
          content_hash: HASH_B,
          input_hash: HASH_C,
          source_revision: `${REV_A}..${REV_A}`,
          depends_on: ["repository-symbol-index:repo"]
        }),
        status: "fresh",
        stale_reasons: []
      }
    ]
  }
}

test("changed upstream marks an unobserved review package stale", () => {
  const { reconcileArtifactLedger } = ledgerApi()
  const result = reconcileArtifactLedger(previousLedger(), {
    sourceRevision: REV_A,
    observations: [observation({ content_hash: HASH_C })],
    completeKinds: ["repository-symbol-index"]
  })

  const index = result.artifacts.find((item) => item.id === "repository-symbol-index:repo")
  const packageRecord = result.artifacts.find((item) => item.id === "review-package:REVIEW-001")
  assert.equal(index.status, "fresh")
  assert.equal(packageRecord.status, "stale")
  assert.deepEqual(packageRecord.stale_reasons, ["upstream-changed:repository-symbol-index:repo"])
})

test("a rebuilt dependent observed with current upstream is fresh", () => {
  const { reconcileArtifactLedger } = ledgerApi()
  const result = reconcileArtifactLedger(previousLedger(), {
    sourceRevision: REV_A,
    observations: [
      observation({ content_hash: HASH_C }),
      observation({
        id: "review-package:REVIEW-001",
        kind: "review-package",
        producer: "bob-code-consistency-review@0.1.0",
        path: ".bob-review/review-package",
        content_hash: HASH_C,
        input_hash: HASH_B,
        source_revision: `${REV_A}..${REV_A}`,
        depends_on: ["repository-symbol-index:repo"]
      })
    ],
    completeKinds: ["repository-symbol-index", "review-package"]
  })

  const packageRecord = result.artifacts.find((item) => item.id === "review-package:REVIEW-001")
  assert.equal(packageRecord.status, "fresh")
  assert.deepEqual(packageRecord.stale_reasons, [])
})

test("missing upstream is recorded and propagates to dependents", () => {
  const { reconcileArtifactLedger } = ledgerApi()
  const result = reconcileArtifactLedger(previousLedger(), {
    sourceRevision: REV_A,
    observations: [],
    completeKinds: ["repository-symbol-index"]
  })

  const index = result.artifacts.find((item) => item.id === "repository-symbol-index:repo")
  const packageRecord = result.artifacts.find((item) => item.id === "review-package:REVIEW-001")
  assert.equal(index.status, "missing")
  assert.deepEqual(index.stale_reasons, ["artifact-missing"])
  assert.equal(packageRecord.status, "stale")
  assert.deepEqual(packageRecord.stale_reasons, ["dependency-missing:repository-symbol-index:repo"])
})

test("source revision changes stale unobserved artifacts", () => {
  const { reconcileArtifactLedger } = ledgerApi()
  const result = reconcileArtifactLedger(previousLedger(), {
    sourceRevision: REV_B,
    observations: [],
    completeKinds: []
  })

  for (const record of result.artifacts) {
    assert.notEqual(record.status, "fresh")
    assert.ok(record.stale_reasons.includes("source-revision-changed"))
  }
})

test("ledger ordering and normalization are deterministic and source-free", () => {
  const { reconcileArtifactLedger } = ledgerApi()
  const packageObservation = observation({
    id: "review-package:Z",
    kind: "review-package",
    path: ".bob-review/z",
    content_hash: HASH_B,
    input_hash: HASH_C,
    source_revision: `${REV_A}..${REV_A}`,
    depends_on: ["project-rule-pack:rules", "repository-symbol-index:repo", "project-rule-pack:rules"],
    raw_body: "RAW-LEDGER-SENTINEL"
  })
  const ruleObservation = observation({
    id: "project-rule-pack:rules",
    kind: "project-rule-pack",
    path: ".bob/evidence-scope/rules.yaml",
    content_hash: HASH_C,
    depends_on: []
  })

  const left = reconcileArtifactLedger(undefined, {
    sourceRevision: REV_A,
    observations: [packageObservation, observation(), ruleObservation],
    completeKinds: ["review-package", "repository-symbol-index", "project-rule-pack"]
  })
  const right = reconcileArtifactLedger(undefined, {
    sourceRevision: REV_A,
    observations: [ruleObservation, observation(), packageObservation],
    completeKinds: ["project-rule-pack", "repository-symbol-index", "review-package"]
  })

  assert.deepEqual(left, right)
  assert.deepEqual(left.artifacts.map((item) => item.id), [
    "project-rule-pack:rules",
    "repository-symbol-index:repo",
    "review-package:Z"
  ])
  assert.deepEqual(left.artifacts[2].depends_on, [
    "project-rule-pack:rules",
    "repository-symbol-index:repo"
  ])
  assert.doesNotMatch(JSON.stringify(left), /RAW-LEDGER-SENTINEL/)
})

test("duplicate observations and self dependencies are rejected", () => {
  const { reconcileArtifactLedger } = ledgerApi()
  assert.throws(
    () => reconcileArtifactLedger(undefined, {
      sourceRevision: REV_A,
      observations: [observation(), observation()],
      completeKinds: []
    }),
    /duplicate artifact observation id/
  )
  assert.throws(
    () => reconcileArtifactLedger(undefined, {
      sourceRevision: REV_A,
      observations: [observation({ depends_on: ["repository-symbol-index:repo"] })],
      completeKinds: []
    }),
    /must not depend on itself/
  )
})

test("manifest and ledger share the deterministic review-package input hash", async () => {
  const {
    buildReviewPackage,
    computeReviewPackageInputHash
  } = require("../out/core/reviewPackageBuilder")
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "bob-ledger-input-hash-"))
  const outDir = path.join(workspace, ".bob-review", "review-package")
  const reviewInput = minimalReviewInput()
  const diff = minimalDiff(workspace)
  const contextBudgetArtifact = {
    rule_pack: {
      schema_version: 1,
      id: "rules",
      version: "1",
      source_path: ".bob/evidence-scope/rules.yaml",
      content_hash: HASH_A
    },
    symbol_index: {
      schema_version: 1,
      id: "repo",
      source_revision: REV_A,
      source_path: ".bob/evidence-scope/repository-symbol-index.json",
      content_hash: HASH_B,
      symbol_count: 1,
      edge_count: 0
    }
  }

  await buildReviewPackage({
    workspaceRoot: workspace,
    outDir,
    reviewInput,
    diff,
    documents: { documents: [], excerptsMarkdown: "", evidence: [], warnings: [] },
    codeAnalysis: emptyCodeAnalysis(),
    traceability: { rows: [], warnings: [], markdown: "" },
    contextBudgetArtifact
  })

  const expected = computeReviewPackageInputHash(reviewInput, diff, contextBudgetArtifact)
  const manifest = fs.readFileSync(path.join(outDir, "manifest.yaml"), "utf8")
  const match = manifest.match(/^  input_hash: (sha256:[0-9a-f]{64})$/m)
  assert.ok(match)
  assert.equal(match[1], expected)
})

test("managed package content hashing is canonical and excludes user files", async () => {
  const { computeManagedReviewPackageContentHash } = require("../out/core/reviewPackageBuilder")
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "bob-ledger-content-hash-"))
  fs.mkdirSync(path.join(outDir, "prompts"), { recursive: true })
  fs.writeFileSync(path.join(outDir, "prompts", "b.md"), "bravo", "utf8")
  fs.writeFileSync(path.join(outDir, "prompts", "a.md"), "alpha", "utf8")
  fs.writeFileSync(path.join(outDir, "user-note.md"), "not managed", "utf8")

  const first = await computeManagedReviewPackageContentHash(outDir)
  const expected = canonicalManagedHash([
    ["prompts/a.md", Buffer.from("alpha")],
    ["prompts/b.md", Buffer.from("bravo")]
  ])
  assert.equal(first, expected)

  fs.writeFileSync(path.join(outDir, "user-note.md"), "changed user data", "utf8")
  assert.equal(await computeManagedReviewPackageContentHash(outDir), first)
  fs.writeFileSync(path.join(outDir, "prompts", "a.md"), "changed", "utf8")
  assert.notEqual(await computeManagedReviewPackageContentHash(outDir), first)
})

function minimalReviewInput() {
  return {
    schema_version: 1,
    review: {
      id: "REVIEW-LEDGER-HASH",
      title: "Ledger hashing",
      change_type: "maintenance",
      purpose: "share package hashes",
      base: REV_A,
      head: REV_B,
      vcs: "git"
    },
    artifacts: {},
    review_focus: ["requirement-code-consistency"]
  }
}

function minimalDiff(workspace) {
  return {
    vcs: "git",
    vcsRoot: workspace,
    base: REV_A,
    head: REV_B,
    files: [],
    unifiedDiff: "",
    warnings: []
  }
}

function emptyCodeAnalysis() {
  return {
    changedSymbols: [],
    functions: [],
    defines: [],
    globals: [],
    callGraph: [],
    rtForbiddenCandidates: [],
    codeSlices: [],
    evidence: [],
    summaryMarkdown: "",
    warnings: []
  }
}

function canonicalManagedHash(entries) {
  const hash = createHash("sha256")
  for (const [relativePath, bytes] of entries.sort((left, right) => left[0].localeCompare(right[0]))) {
    hash.update(relativePath)
    hash.update("\0")
    hash.update(String(bytes.length))
    hash.update("\0")
    hash.update(bytes)
    hash.update("\0")
  }
  return `sha256:${hash.digest("hex")}`
}
