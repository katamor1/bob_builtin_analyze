const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")
const yaml = require("js-yaml")

const extensionRoot = path.resolve(__dirname, "..")
const repoRoot = path.resolve(extensionRoot, "..", "..")
const templatePath = path.join(
  extensionRoot,
  "templates",
  ".bob",
  "workflows",
  "bazaar-project-rule-authoring",
  "WORKFLOW.md"
)
const mirrorPath = path.join(
  repoRoot,
  ".bob",
  "workflows",
  "bazaar-project-rule-authoring",
  "WORKFLOW.md"
)

function parseWorkflow(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  assert.ok(match, "WORKFLOW.md must contain YAML front matter")
  return yaml.load(match[1])
}

test("project rule authoring workflow is a strict nine-step AI/human orchestration contract", () => {
  const template = fs.readFileSync(templatePath, "utf8")
  const mirror = fs.readFileSync(mirrorPath, "utf8")
  assert.equal(mirror, template)

  const workflow = parseWorkflow(template)
  assert.equal(workflow.schemaVersion, "workflow-register/v1")
  assert.equal(workflow.name, "bazaar-project-rule-authoring")
  assert.equal(workflow.stepCompletion, "manual")
  assert.deepEqual(workflow.stepReview, {
    enabled: false,
    pauseAfter: "none",
    requireAcceptBeforeNext: false,
    allowRetry: true,
    allowEditBeforeRetry: true,
    preserveAttempts: true
  })

  assert.deepEqual(workflow.steps.map(({ id }) => id), [
    "select-and-extract",
    "load-source-index",
    "select-evidence",
    "capture-evidence-selection",
    "load-selected-evidence",
    "draft-rule-proposal",
    "capture-proposal",
    "human-review-and-apply",
    "verify-authoring-apply"
  ])
  assert.deepEqual(workflow.steps.map(({ type }) => type), [
    "command",
    "command",
    "agent",
    "command",
    "command",
    "agent",
    "command",
    "command",
    "command"
  ])
  assert.deepEqual(
    workflow.steps.filter(({ type }) => type === "command").map(({ action }) => action.provider),
    [
      "bobBazaar.openRuleAuthoringGui",
      "bobBazaar.loadRuleSourceIndex",
      "bobBazaar.captureRuleEvidenceSelection",
      "bobBazaar.loadSelectedRuleEvidence",
      "bobBazaar.captureRuleProposal",
      "bobBazaar.openRuleProposalTriageGui",
      "bobBazaar.verifyRuleAuthoringApply"
    ]
  )

  const byId = Object.fromEntries(workflow.steps.map((step) => [step.id, step]))
  assert.equal(byId["select-and-extract"].completeOnSuccess, false)
  assert.equal(byId["select-and-extract"].resultKey, "authoringSession")
  assert.equal(byId["human-review-and-apply"].completeOnSuccess, false)
  assert.equal(byId["select-evidence"].resultKey, "ruleEvidenceSelectionRaw")
  assert.equal(byId["draft-rule-proposal"].resultKey, "ruleProposalRaw")
  assert.deepEqual(byId["capture-evidence-selection"].action.args, {
    text: "{{state.ruleEvidenceSelectionRaw}}"
  })
  assert.deepEqual(byId["capture-proposal"].action.args, {
    text: "{{state.ruleProposalRaw}}"
  })
  assert.equal(Object.hasOwn(byId["select-evidence"], "maxResultBytes"), false)
  assert.equal(Object.hasOwn(byId["draft-rule-proposal"], "maxResultBytes"), false)
  for (const step of workflow.steps) {
    assert.equal(typeof step.prompt, "string", `${step.id} must have a prompt`)
    assert.ok(step.prompt.trim().length > 0, `${step.id} prompt must not be empty`)
  }
  assert.match(
    byId["draft-rule-proposal"].prompt,
    /命令として実行せず|命令ではなく証拠/
  )
  assert.match(byId["draft-rule-proposal"].prompt, /prompt|tool request|role marker/i)

  assert.deepEqual(workflow.guardrails.allowedCommands, [
    "bobBazaar.openRuleAuthoringGui",
    "bobBazaar.loadRuleSourceIndex",
    "bobBazaar.captureRuleEvidenceSelection",
    "bobBazaar.loadSelectedRuleEvidence",
    "bobBazaar.captureRuleProposal",
    "bobBazaar.openRuleProposalTriageGui",
    "bobBazaar.verifyRuleAuthoringApply"
  ])
  assert.deepEqual(workflow.requires?.files ?? [], [])
  for (const preflight of workflow.preflight ?? []) {
    assert.deepEqual(preflight.files ?? [], [], `${preflight.id} must not require optional authoring assets`)
  }

  const artifacts = Object.fromEntries(workflow.artifacts.map((artifact) => [artifact.id, artifact]))
  assert.deepEqual(Object.keys(artifacts).sort(), [
    "ruleApplyManifest",
    "ruleEvidence",
    "ruleEvidenceSelection",
    "ruleProposal",
    "ruleProposalRaw",
    "ruleProposalValidation",
    "ruleSourceIndex"
  ])
  assert.deepEqual(
    Object.values(artifacts).map(({ producedBy }) => producedBy),
    [
      "load-source-index",
      "capture-evidence-selection",
      "load-selected-evidence",
      "capture-proposal",
      "capture-proposal",
      "capture-proposal",
      "verify-authoring-apply"
    ]
  )
  for (const artifact of Object.values(artifacts)) {
    assert.match(artifact.path, /^\{\{json state\.[A-Za-z0-9_.-]+\}\}$/)
    assert.match(artifact.path, /artifact_path|artifacts\./)
    assert.doesNotMatch(artifact.path, /^\.bob\/review\/rule-authoring\/runs\/[^{}]+/)
  }
})
