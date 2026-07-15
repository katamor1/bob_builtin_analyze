const assert = require("node:assert/strict")
const path = require("node:path")
const { test } = require("node:test")

const {
  getRuleAuthoringGenerationPaths,
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
    generationsDirectory: path.join(runDirectory, "generations"),
    backupsDirectory: path.join(authoringDirectory, "backups"),
    transactionsDirectory: path.join(authoringDirectory, "transactions")
  })

  for (const artifactPath of Object.values(paths)) {
    const relative = path.relative(workspaceRoot, artifactPath)
    assert.equal(path.isAbsolute(artifactPath), true)
    assert.equal(relative === ".." || relative.startsWith(`..${path.sep}`), false)
  }

  const generation = getRuleAuthoringGenerationPaths(paths, `gen-${"a".repeat(32)}`)
  assert.equal(generation.sourceManifestPath, path.join(paths.generationsDirectory, generation.generationId, "source-manifest.json"))
  assert.equal(generation.documentChunksPath, path.join(paths.generationsDirectory, generation.generationId, "document-chunks.jsonl"))
  assert.equal(generation.sourceScopePath, path.join(paths.generationsDirectory, generation.generationId, "source-scope.json"))
  assert.equal(generation.sourceIndexPath, path.join(paths.generationsDirectory, generation.generationId, "source-index.json"))
  assert.equal(Object.hasOwn(paths, "sourceIndexPath"), false)
})

test("rule authoring IDs accept stable run and source identifiers", () => {
  assert.equal(validateRuleAuthoringId("run-20260714-001", "runId"), "run-20260714-001")
  assert.equal(validateRuleAuthoringId("src-0123456789ab", "sourceId"), "src-0123456789ab")
  assert.equal(validateRuleAuthoringId("a".repeat(255), "runId"), "a".repeat(255))
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
    "COM¹",
    "LPT².txt",
    "a".repeat(256),
    "é".repeat(128),
    " name",
    "name.",
    "name ",
    "a\u0000b",
    "a\u007fb",
    "run\u0080private",
    "run\u0085private",
    "run\u009fprivate"
  ]) {
    assert.throws(() => validateRuleAuthoringId(value, "runId"), /runId/)
  }

  assert.throws(() => getRuleAuthoringPaths("/workspace", "../escape"), /runId/)
})
