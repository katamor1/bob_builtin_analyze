const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")
const YAML = require("yaml")

const { generateHumanTriage } = require("../out/triage/humanTriageHelper")
const {
  loadHumanTriageWorkspace,
  saveHumanTriageDecisions
} = require("../out/triage/humanTriageWorkspace")

function createWorkspace() {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bob-triage-integrity-"))
  const bobOutputPath = path.join(workspaceRoot, ".bob-review", "bob-output", "bob-output.yaml")
  fs.mkdirSync(path.dirname(bobOutputPath), { recursive: true })
  fs.writeFileSync(bobOutputPath, YAML.stringify({
    schema_version: 1,
    review_summary: {
      review_id: "review-1",
      package_id: "package-1",
      target_range: "base..head",
      result_type: "pre_review",
      final_approval: "not_performed",
      scope_statement: "fixture scope"
    },
    findings: [
      {
        id: "PRE-001",
        category: "risk",
        severity: "high",
        confidence: "medium",
        summary: "timeout behavior may be inconsistent",
        evidence: [
          { evidence_id: "SRC-0001", type: "code", ref: "src/a.ts:1-5" }
        ],
        reason: "changed behavior differs from the expected flow",
        impact: "the caller may receive the wrong result",
        recommended_action: "confirm and correct the timeout branch",
        human_check: "review the requirement with the design owner"
      }
    ],
    questions: [
      {
        id: "Q-001",
        category: "owner-decision",
        summary: "confirm whether timeout is in scope",
        reason: "the ticket is ambiguous",
        evidence: [
          { evidence_id: "TICKET-0001", type: "ticket", ref: "ISSUE-1" }
        ],
        suggested_owner: "design-owner",
        suggested_action: "ask the design owner"
      }
    ],
    coverage_notes: [],
    rejected_or_uncertain: []
  }))
  return {
    workspaceRoot,
    bobOutputPath,
    packageDir: path.join(workspaceRoot, ".bob-review", "review-package"),
    outDir: ".bob-review/human-triage",
    triageDir: path.join(workspaceRoot, ".bob-review", "human-triage")
  }
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8")
}

function readYaml(filePath) {
  return YAML.parse(readText(filePath))
}

async function generateFixture(workspace) {
  const result = await generateHumanTriage({
    workspaceRoot: workspace.workspaceRoot,
    packageDir: workspace.packageDir,
    bobOutputPath: workspace.bobOutputPath,
    outDir: workspace.outDir
  })
  assert.equal(result.status, "ok")
  return result
}

test("generateHumanTriage creates immutable source and empty decision projections", async () => {
  const workspace = createWorkspace()
  await generateFixture(workspace)

  const sourcePath = path.join(workspace.triageDir, "triage-source.yaml")
  const decisionsPath = path.join(workspace.triageDir, "triage-decisions.yaml")
  const resultPath = path.join(workspace.triageDir, "triage-result.yaml")
  assert.equal(fs.existsSync(sourcePath), true)
  assert.equal(fs.existsSync(decisionsPath), true)
  assert.equal(fs.existsSync(resultPath), true)

  const source = readYaml(sourcePath)
  assert.equal(source.schema_version, "triage-source/v1")
  assert.equal(source.review_id, "review-1")
  assert.equal(source.package_id, "package-1")
  assert.match(source.bob_output_sha256, /^[a-f0-9]{64}$/)
  assert.equal(source.items.length, 2)
  const finding = source.items.find((item) => item.source_id === "PRE-001")
  assert.equal(finding.source_type, "finding")
  assert.equal(finding.summary, "timeout behavior may be inconsistent")
  assert.equal(finding.recommended_action, "confirm and correct the timeout branch")
  assert.equal(finding.evidence[0].evidence_id, "SRC-0001")

  const decisions = readYaml(decisionsPath)
  assert.equal(decisions.schema_version, "triage-decisions/v1")
  assert.equal(decisions.review_id, "review-1")
  assert.equal(decisions.decision_revision, 0)
  assert.match(decisions.source_sha256, /^[a-f0-9]{64}$/)
  assert.deepEqual(decisions.items, {})

  assert.doesNotMatch(readText(path.join(workspace.triageDir, "accepted-findings.md")), /PRE-001/)
  assert.doesNotMatch(readText(path.join(workspace.triageDir, "rejected-findings.md")), /PRE-001/)
  assert.match(readText(path.join(workspace.triageDir, "questions-to-author.md")), /Q-001/)
})

test("saveHumanTriageDecisions preserves unknown fields and projects by decision", async () => {
  const workspace = createWorkspace()
  await generateFixture(workspace)

  const decisionsPath = path.join(workspace.triageDir, "triage-decisions.yaml")
  const seeded = readYaml(decisionsPath)
  seeded.items["PRE-001"] = {
    custom_audit_flag: "keep-me",
    follow_up: {
      custom_ticket: "KEEP-1"
    }
  }
  fs.writeFileSync(decisionsPath, YAML.stringify(seeded))

  const current = await loadHumanTriageWorkspace({
    workspaceRoot: workspace.workspaceRoot,
    outDir: workspace.outDir
  })
  const saved = await saveHumanTriageDecisions({
    workspaceRoot: workspace.workspaceRoot,
    outDir: workspace.outDir,
    expectedSourceSha256: current.sourceSha256,
    expectedDecisionRevision: current.decisionRevision,
    items: [
      {
        source_id: "Q-001",
        decision: "question",
        owner: "design-owner",
        reason: "ask before approval",
        suggested_recipient: "design-owner"
      },
      {
        source_id: "PRE-001",
        decision: "accepted",
        final_severity: "high",
        owner: "owner-a",
        reason: "confirmed mismatch",
        review_comment: "send to formal review",
        follow_up: {
          required: true,
          action: "fix implementation",
          due: "2026-07-20"
        }
      }
    ],
    now: new Date("2026-07-12T06:00:00.000Z")
  })

  assert.equal(saved.decisionRevision, 1)
  const decisions = readYaml(decisionsPath)
  assert.equal(decisions.items["PRE-001"].custom_audit_flag, "keep-me")
  assert.equal(decisions.items["PRE-001"].follow_up.custom_ticket, "KEEP-1")
  assert.equal(decisions.items["PRE-001"].follow_up.required, true)
  assert.equal(decisions.items["PRE-001"].owner, "owner-a")
  assert.equal(decisions.items["Q-001"].decision, "question")

  const accepted = readText(path.join(workspace.triageDir, "accepted-findings.md"))
  assert.match(accepted, /PRE-001/)
  assert.match(accepted, /owner-a/)
  assert.doesNotMatch(readText(path.join(workspace.triageDir, "rejected-findings.md")), /PRE-001/)
  const followUps = readText(path.join(workspace.triageDir, "follow-up-actions.md"))
  assert.match(followUps, /PRE-001/)
  assert.match(followUps, /fix implementation/)
})

test("saveHumanTriageDecisions rejects stale source and decision revisions", async () => {
  const workspace = createWorkspace()
  await generateFixture(workspace)
  const current = await loadHumanTriageWorkspace({ workspaceRoot: workspace.workspaceRoot, outDir: workspace.outDir })

  await assert.rejects(
    saveHumanTriageDecisions({
      workspaceRoot: workspace.workspaceRoot,
      outDir: workspace.outDir,
      expectedSourceSha256: "stale",
      expectedDecisionRevision: current.decisionRevision,
      items: []
    }),
    /TRIAGE_SOURCE_CHANGED/
  )

  await assert.rejects(
    saveHumanTriageDecisions({
      workspaceRoot: workspace.workspaceRoot,
      outDir: workspace.outDir,
      expectedSourceSha256: current.sourceSha256,
      expectedDecisionRevision: 99,
      items: []
    }),
    /TRIAGE_REVISION_CONFLICT/
  )
})

test("saveHumanTriageDecisions validates decision-specific required fields", async () => {
  const cases = [
    [{ source_id: "PRE-001", decision: "accepted" }, /accepted requires reason, owner, and final_severity/],
    [{ source_id: "PRE-001", decision: "rejected" }, /rejected requires reason/],
    [{ source_id: "PRE-001", decision: "needs_investigation", reason: "check" }, /needs_investigation requires owner or follow_up action/],
    [{ source_id: "PRE-001", decision: "deferred", reason: "later", follow_up: {} }, /deferred requires follow_up due/],
    [{ source_id: "Q-001", decision: "question", reason: "ask" }, /question requires owner or suggested_recipient/],
    [{ source_id: "PRE-001", decision: "maybe", reason: "invalid" }, /unknown decision/],
    [{ source_id: "MISSING-1", decision: "rejected", reason: "no source" }, /unknown source_id/]
  ]

  for (const [patch, expected] of cases) {
    const workspace = createWorkspace()
    await generateFixture(workspace)
    const current = await loadHumanTriageWorkspace({ workspaceRoot: workspace.workspaceRoot, outDir: workspace.outDir })
    await assert.rejects(
      saveHumanTriageDecisions({
        workspaceRoot: workspace.workspaceRoot,
        outDir: workspace.outDir,
        expectedSourceSha256: current.sourceSha256,
        expectedDecisionRevision: current.decisionRevision,
        items: [patch]
      }),
      expected
    )
  }
})

test("generateHumanTriage migrates keyed decisions from legacy triage-result.yaml", async () => {
  const workspace = createWorkspace()
  fs.mkdirSync(workspace.triageDir, { recursive: true })
  fs.writeFileSync(path.join(workspace.triageDir, "triage-result.yaml"), YAML.stringify({
    schema_version: 1,
    review_id: "review-1",
    triaged_by: "legacy-reviewer",
    triaged_at: "2026-07-10T00:00:00.000Z",
    items: [
      {
        source_id: "PRE-001",
        source_type: "finding",
        decision: "accepted",
        final_severity: "high",
        owner: "legacy-owner",
        reason: "legacy reason",
        review_comment: "legacy comment",
        follow_up: { required: true, action: "legacy action", due: "2026-07-25" }
      },
      {
        source_id: "LEGACY-999",
        source_type: "finding",
        decision: "rejected",
        reason: "no longer present"
      }
    ]
  }))

  await generateFixture(workspace)

  const decisions = readYaml(path.join(workspace.triageDir, "triage-decisions.yaml"))
  assert.equal(decisions.decision_revision, 1)
  assert.equal(decisions.triaged_by, "legacy-reviewer")
  assert.equal(decisions.items["PRE-001"].decision, "accepted")
  assert.equal(decisions.items["PRE-001"].follow_up.action, "legacy action")
  assert.equal(decisions.items["LEGACY-999"], undefined)
  assert.match(readText(path.join(workspace.triageDir, "migration-report.md")), /LEGACY-999/)
  assert.ok(fs.readdirSync(workspace.triageDir).some((name) => name.startsWith("triage-result.yaml.bak-")))
  assert.match(readText(path.join(workspace.triageDir, "accepted-findings.md")), /PRE-001/)
})
