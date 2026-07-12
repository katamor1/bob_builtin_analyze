const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")
const YAML = require("yaml")

const { parseHumanTriageMessage } = require("../out/webview/consistencyHumanTriageMessage")
const { renderConsistencyHumanTriageHtml } = require("../out/webview/consistencyHumanTriageHtml")
const { replaceTriageFilesAtomically } = require("../out/triage/triageFileTransaction")
const { generateHumanTriage } = require("../out/triage/humanTriageHelper")
const {
  loadHumanTriageWorkspace,
  saveHumanTriageDecisions
} = require("../out/triage/humanTriageWorkspace")

test("parseHumanTriageMessage accepts trusted actions and validates save tokens", () => {
  assert.deepEqual(parseHumanTriageMessage({
    type: "consistencyHumanTriage.action",
    action: "generateTriage"
  }), {
    type: "consistencyHumanTriage.action",
    action: "generateTriage"
  })

  const save = parseHumanTriageMessage({
    type: "consistencyHumanTriage.action",
    action: "saveDecisions",
    sourceSha256: "abc123",
    decisionRevision: 2,
    items: [{ source_id: "PRE-001", decision: "rejected", reason: "not applicable" }]
  })
  assert.equal(save.sourceSha256, "abc123")
  assert.equal(save.decisionRevision, 2)
  assert.equal(save.items.length, 1)

  for (const invalid of [
    null,
    {},
    { type: "wrong", action: "generateTriage" },
    { type: "consistencyHumanTriage.action", action: "unknown" },
    { type: "consistencyHumanTriage.action", action: "saveDecisions", decisionRevision: 0, items: [] },
    { type: "consistencyHumanTriage.action", action: "saveDecisions", sourceSha256: "abc", decisionRevision: -1, items: [] },
    { type: "consistencyHumanTriage.action", action: "saveDecisions", sourceSha256: "abc", decisionRevision: 0, items: {} },
    {
      type: "consistencyHumanTriage.action",
      action: "saveDecisions",
      sourceSha256: "abc",
      decisionRevision: 0,
      items: [{ source_id: "PRE-001" }, { source_id: "PRE-001" }]
    }
  ]) {
    assert.equal(parseHumanTriageMessage(invalid), undefined)
  }
})

test("replaceTriageFilesAtomically validates staged YAML before replacing current files", async () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "bob-triage-transaction-"))
  const currentPath = path.join(outDir, "triage-result.yaml")
  fs.writeFileSync(currentPath, "schema_version: 1\nreview_id: original\n")

  await assert.rejects(
    replaceTriageFilesAtomically(outDir, {
      "triage-result.yaml": "schema_version: [broken\n",
      "accepted-findings.md": "# should not be installed\n"
    }),
    /flow sequence|unexpected end|YAML/i
  )

  assert.equal(fs.readFileSync(currentPath, "utf8"), "schema_version: 1\nreview_id: original\n")
  assert.equal(fs.existsSync(path.join(outDir, "accepted-findings.md")), false)
  assert.equal(fs.readdirSync(outDir).some((name) => name.startsWith(".triage-stage-")), false)
})

test("human triage HTML keeps suggested owner in source context instead of decision input", () => {
  const html = renderConsistencyHumanTriageHtml({
    cspSource: "vscode-resource:",
    nonce: "nonce-boundary",
    model: {
      outDir: ".bob-review/human-triage",
      bobOutputPath: ".bob-review/bob-output/bob-output.yaml",
      sourceSha256: "abc123",
      decisionRevision: 0,
      items: [{
        source_id: "Q-001",
        source_type: "question",
        summary: "Who owns this decision?",
        suggested_owner: "design-owner",
        evidence: []
      }],
      issues: []
    }
  })

  assert.match(html, /suggested owner:<\/strong> design-owner/)
  assert.match(html, /data-field="owner" value=""/)
  assert.doesNotMatch(html, /data-field="owner" value="design-owner"/)
})

test("saving untouched rows does not create human decision records", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bob-triage-blank-save-"))
  const bobOutputPath = path.join(workspaceRoot, ".bob-review", "bob-output", "bob-output.yaml")
  fs.mkdirSync(path.dirname(bobOutputPath), { recursive: true })
  fs.writeFileSync(bobOutputPath, YAML.stringify({
    schema_version: 1,
    review_summary: {
      review_id: "blank-save-review",
      target_range: "base..head",
      result_type: "pre_review",
      final_approval: "not_performed",
      scope_statement: "fixture"
    },
    findings: [],
    questions: [{
      id: "Q-001",
      category: "owner-decision",
      summary: "Who owns this?",
      reason: "The source suggests an owner.",
      evidence: [],
      suggested_owner: "design-owner"
    }],
    coverage_notes: [],
    rejected_or_uncertain: []
  }))

  const outDir = ".bob-review/human-triage"
  const generated = await generateHumanTriage({
    workspaceRoot,
    packageDir: path.join(workspaceRoot, ".bob-review", "review-package"),
    bobOutputPath,
    outDir
  })
  assert.equal(generated.status, "ok")
  const current = await loadHumanTriageWorkspace({ workspaceRoot, outDir })

  await saveHumanTriageDecisions({
    workspaceRoot,
    outDir,
    expectedSourceSha256: current.sourceSha256,
    expectedDecisionRevision: current.decisionRevision,
    items: [{
      source_id: "Q-001",
      decision: "",
      final_severity: "",
      owner: "",
      reason: "",
      review_comment: "",
      suggested_recipient: "",
      follow_up: { required: false, action: "", due: "" }
    }]
  })

  const decisions = YAML.parse(fs.readFileSync(path.join(workspaceRoot, outDir, "triage-decisions.yaml"), "utf8"))
  assert.deepEqual(decisions.items, {})
})
