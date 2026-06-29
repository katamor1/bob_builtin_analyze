const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")
const YAML = require("yaml")

const { preprocessReview } = require("../out/core/pipeline")
const { validateBobOutput } = require("../out/core/bobOutputValidator")
const { captureBobOutput } = require("../out/core/bobOutputCapture")
const { generateHumanTriage } = require("../out/triage/humanTriageHelper")

const extensionRoot = path.resolve(__dirname, "..")
const repoRoot = path.resolve(extensionRoot, "..", "..")
const sampleRoot = path.join(repoRoot, "docs", "workflows", "code-consistency-review")
const reviewInputPath = path.join(sampleRoot, "examples", "simple-timeout-bugfix", "review-input.yaml")
const diffFixturePath = path.join(sampleRoot, "scaffold", "tests", "fixtures", "diff-summary.valid.json")
const bobOutputFixturePath = path.join(sampleRoot, "scaffold", "tests", "fixtures", "bob-output.valid.yaml")
const aiMatrixRoot = path.join(sampleRoot, "examples", "ai-verification-matrix")
const aiMatrixExpectedOutputPath = path.join(aiMatrixRoot, "bob-output.expected.sample.yaml")

test("preprocessReview builds a review package with document and code evidence", async () => {
  const outDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "bob-review-package-")), "review-package")
  const result = await preprocessReview({ workspaceRoot: repoRoot, inputPath: reviewInputPath, outDir, diffFixturePath })

  for (const file of [
    "manifest.yaml",
    "input-normalized.json",
    "changed-files.json",
    "changed-symbols.json",
    "change-summary.md",
    "diff-context.md",
    "document-index.json",
    "document-excerpts.md",
    "traceability-map.md",
    "deterministic-checks.md",
    "evidence-index.json",
    "bob-input.md"
  ]) {
    assert.ok(fs.existsSync(path.join(outDir, file)), `${file} should exist`)
  }

  const changedSymbols = JSON.parse(fs.readFileSync(path.join(outDir, "changed-symbols.json"), "utf8"))
  const evidenceIndex = JSON.parse(fs.readFileSync(path.join(outDir, "evidence-index.json"), "utf8"))
  const bobInput = fs.readFileSync(path.join(outDir, "bob-input.md"), "utf8")

  assert.equal(result.status, "ok")
  assert.match(JSON.stringify(changedSymbols), /Foo_HandleTimeout/)
  assert.match(JSON.stringify(changedSymbols), /ERR_TIMEOUT|ERR_OK/)
  assert.ok(evidenceIndex.evidence.some((item) => item.evidence_id.startsWith("REQ-")))
  assert.ok(evidenceIndex.evidence.some((item) => item.evidence_id.startsWith("SRC-")))
  assert.doesNotMatch(bobInput, /TODO: Extract document text here|MVP scaffold: not executed yet/)
})

test("preprocessReview builds the AI verification matrix package from a real git diff", async () => {
  const workspace = createAiVerificationMatrixWorkspace()
  const outDir = path.join(workspace, ".bob-review", "review-package")
  const result = await preprocessReview({ workspaceRoot: workspace, inputPath: path.join(workspace, "review-input.yaml"), outDir })

  const changedFiles = JSON.parse(fs.readFileSync(path.join(outDir, "changed-files.json"), "utf8"))
  const changedSymbols = JSON.parse(fs.readFileSync(path.join(outDir, "changed-symbols.json"), "utf8"))
  const evidenceIndex = JSON.parse(fs.readFileSync(path.join(outDir, "evidence-index.json"), "utf8"))
  const bobInput = fs.readFileSync(path.join(outDir, "bob-input.md"), "utf8")
  const expectedOutcomes = fs.readFileSync(path.join(aiMatrixRoot, "expected-outcomes.yaml"), "utf8")

  assert.equal(result.status, "ok")
  assert.ok(changedFiles.files.some((file) => file.path === "src/payment_status.c"))
  assert.match(JSON.stringify(changedSymbols), /Payment_CalculateLimit/)
  assert.match(JSON.stringify(changedSymbols), /Payment_HandleTimeout/)
  assert.match(JSON.stringify(changedSymbols), /Payment_AssessFraudScore/)
  assert.match(JSON.stringify(changedSymbols), /Payment_UpdateRealtimeCache/)
  assert.match(JSON.stringify(changedSymbols), /printf/)
  assert.ok(evidenceIndex.evidence.some((item) => item.evidence_id === "REQ-0001" && item.ref === "REQ-OK-001"))
  assert.ok(evidenceIndex.evidence.some((item) => item.evidence_id === "SRC-0004" && item.location.includes("Payment_UpdateRealtimeCache")))
  assert.match(bobInput, /REQ-OK-001/)
  assert.match(bobInput, /REQ-NG-001/)
  assert.match(bobInput, /REQ-FRAUD-030/)
  assert.match(bobInput, /performance measurement and dashboard UI labels/)
  assert.match(expectedOutcomes, /outcome: ok/)
  assert.match(expectedOutcomes, /outcome: ng/)
  assert.match(expectedOutcomes, /outcome: n\/a/)
  assert.match(expectedOutcomes, /outcome: question/)
})

test("AI verification matrix expected Bob output validates and generates triage", async () => {
  const workspace = createAiVerificationMatrixWorkspace()
  const packageDir = path.join(workspace, ".bob-review", "review-package")
  await preprocessReview({ workspaceRoot: workspace, inputPath: path.join(workspace, "review-input.yaml"), outDir: packageDir })

  const report = await validateBobOutput({ packageDir, bobOutputPath: aiMatrixExpectedOutputPath })
  assert.deepEqual(report.errors, [])

  const triageDir = path.join(workspace, ".bob-review", "human-triage")
  const triage = await generateHumanTriage({ packageDir, bobOutputPath: aiMatrixExpectedOutputPath, outDir: triageDir })
  assert.equal(triage.status, "ok")
  assert.ok(triage.itemCount >= 4)
  assert.match(fs.readFileSync(path.join(triageDir, "accepted-findings.md"), "utf8"), /PRE-001/)
  assert.match(fs.readFileSync(path.join(triageDir, "questions-to-author.md"), "utf8"), /Q-001/)
})

test("validateBobOutput rejects missing evidence ids and accepts package evidence", async () => {
  const outDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "bob-review-validate-")), "review-package")
  await preprocessReview({ workspaceRoot: repoRoot, inputPath: reviewInputPath, outDir, diffFixturePath })

  const validReport = await validateBobOutput({ packageDir: outDir, bobOutputPath: bobOutputFixturePath })
  assert.deepEqual(validReport.errors, [])

  const invalidPath = path.join(path.dirname(outDir), "invalid-output.yaml")
  const parsed = YAML.parse(fs.readFileSync(bobOutputFixturePath, "utf8"))
  parsed.findings[0].evidence[0].evidence_id = "MISSING-9999"
  fs.writeFileSync(invalidPath, YAML.stringify(parsed))

  const invalidReport = await validateBobOutput({ packageDir: outDir, bobOutputPath: invalidPath })
  assert.ok(invalidReport.errors.some((error) => error.includes("MISSING-9999")))
})

test("captureBobOutput and generateHumanTriage create review artifacts", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bob-review-capture-"))
  const outputPath = path.join(root, ".bob-review", "bob-output", "bob-output.yaml")
  const output = YAML.parse(fs.readFileSync(bobOutputFixturePath, "utf8"))
  output.questions.push({
    id: "Q-001",
    category: "specification-clarification",
    summary: "timeout condition needs author confirmation",
    reason: "The fixture question checks question triage output.",
    suggested_action: "Ask the author whether timeout is in scope."
  })
  const capture = await captureBobOutput({
    workspaceRoot: root,
    text: `Here is the result.\n\n\`\`\`yaml\n${YAML.stringify(output)}\n\`\`\`\n`,
    bobOutputPath: outputPath
  })
  assert.equal(capture.status, "ok")
  assert.ok(fs.existsSync(outputPath))

  const triageDir = path.join(root, ".bob-review", "human-triage")
  await generateHumanTriage({ packageDir: path.join(root, ".bob-review", "review-package"), bobOutputPath: outputPath, outDir: triageDir })

  assert.ok(fs.existsSync(path.join(triageDir, "triage-result.yaml")))
  assert.match(fs.readFileSync(path.join(triageDir, "accepted-findings.md"), "utf8"), /PRE-/)
  assert.match(fs.readFileSync(path.join(triageDir, "questions-to-author.md"), "utf8"), /Q-/)
  assert.ok(fs.existsSync(path.join(triageDir, "rejected-findings.md")))
  assert.ok(fs.existsSync(path.join(triageDir, "follow-up-actions.md")))
})

function createAiVerificationMatrixWorkspace() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "bob-ai-matrix-"))
  copyFixtureTree(path.join(aiMatrixRoot, "fixtures", "workspace-common"), workspace)
  copyFixtureTree(path.join(aiMatrixRoot, "fixtures", "baseline"), workspace)
  git(workspace, "init", "-b", "main")
  git(workspace, "config", "user.email", "bob-fixture@example.local")
  git(workspace, "config", "user.name", "Bob Fixture")
  git(workspace, "add", ".")
  git(workspace, "commit", "-m", "baseline")
  git(workspace, "switch", "-c", "feature/ai-verification-matrix")
  copyFixtureTree(path.join(aiMatrixRoot, "fixtures", "head"), workspace)
  git(workspace, "add", ".")
  git(workspace, "commit", "-m", "ai verification matrix head")
  return workspace
}

function copyFixtureTree(source, target) {
  fs.cpSync(source, target, { recursive: true })
}

function git(cwd, ...args) {
  const result = require("node:child_process").spawnSync("git", args, { cwd, encoding: "utf8" })
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`)
  }
}
