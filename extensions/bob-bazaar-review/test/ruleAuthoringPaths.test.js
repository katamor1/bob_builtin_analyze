const assert = require("node:assert/strict")
const path = require("node:path")
const { test } = require("node:test")

const {
  getRuleAuthoringPaths,
  validateRuleAuthoringId
} = require("../out/ruleAuthoring/ruleAuthoringPaths")
const { RULE_AUTHORING_SCHEMA_VERSION } = require("../out/ruleAuthoring/ruleAuthoringTypes")

test("rule authoring paths are absolute and contained by the workspace", () => {
  const workspaceRoot = path.resolve("tmp", "rule-authoring-workspace")
  const reviewDirectory = path.join(workspaceRoot, ".bob", "review")
  const authoringDirectory = path.join(reviewDirectory, "rule-authoring")
  const runsDirectory = path.join(authoringDirectory, "runs")
  const runDirectory = path.join(runsDirectory, "run-20260714-001")

  const paths = getRuleAuthoringPaths(workspaceRoot, "run-20260714-001")

  assert.deepEqual(paths, {
    reviewDirectory,
    authoringDirectory,
    sourceLocationsPath: path.join(authoringDirectory, "source-locations.local.json"),
    runsDirectory,
    runDirectory,
    authoringRunPath: path.join(runDirectory, "authoring-run.json"),
    sourceManifestPath: path.join(runDirectory, "source-manifest.json"),
    documentChunksPath: path.join(runDirectory, "document-chunks.jsonl"),
    sourceIndexPath: path.join(runDirectory, "source-index.json"),
    evidenceSelectionPath: path.join(runDirectory, "evidence-selection.json"),
    selectedEvidencePath: path.join(runDirectory, "selected-evidence.md"),
    ruleProposalRawPath: path.join(runDirectory, "rule-proposal.raw.txt"),
    ruleProposalPath: path.join(runDirectory, "rule-proposal.json"),
    proposalValidationPath: path.join(runDirectory, "proposal-validation.json"),
    proposalDecisionsPath: path.join(runDirectory, "proposal-decisions.json"),
    applyPreviewPath: path.join(runDirectory, "apply-preview.json"),
    applyManifestPath: path.join(runDirectory, "apply-manifest.json"),
    backupsDirectory: path.join(authoringDirectory, "backups"),
    transactionsDirectory: path.join(authoringDirectory, "transactions")
  })

  for (const artifactPath of Object.values(paths)) {
    const relative = path.relative(workspaceRoot, artifactPath)
    assert.equal(path.isAbsolute(artifactPath), true)
    assert.equal(relative === ".." || relative.startsWith(`..${path.sep}`), false)
  }
})

test("rule authoring IDs accept stable run and source identifiers", () => {
  assert.equal(validateRuleAuthoringId("run-20260714-001", "runId"), "run-20260714-001")
  assert.equal(validateRuleAuthoringId("src-0123456789ab", "sourceId"), "src-0123456789ab")
  assert.equal(RULE_AUTHORING_SCHEMA_VERSION, "bob-bazaar-review/rule-authoring-run/v1")
})

test("rule authoring IDs reject traversal and unsafe cross-platform path segments", () => {
  for (const value of [
    "",
    " ",
    ".",
    "..",
    "../escape",
    "a/b",
    "a\\b",
    "a:b",
    "a?b",
    "a*b",
    "a|b",
    "a<b",
    "a>b",
    "a\"b",
    "CON",
    "con.txt",
    " name",
    "name.",
    "name ",
    "a\u0000b",
    "a\u007fb"
  ]) {
    assert.throws(() => validateRuleAuthoringId(value, "runId"), /runId/)
  }

  assert.throws(() => getRuleAuthoringPaths("/workspace", "../escape"), /runId/)
})
