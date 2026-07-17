const assert = require("node:assert/strict")
const { createHash } = require("node:crypto")
const fs = require("node:fs/promises")
const Module = require("node:module")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const GUI_MODULE = path.join(__dirname, "..", "out", "ui", "ruleProposalTriageGui.js")
const RUN_ID = "authoring-run-triage"
const WORKSPACE_ROOT = path.resolve("/workspace/acme")
const SOURCE_ID = `src-${"a".repeat(12)}`
const CHUNK_ID = `chunk-${"b".repeat(64)}`
const PRIVATE_PATH = "/private/rules/engineering-policy.docx"
const RAW_PROPOSAL = "RAW AI RESPONSE including /private/rules/engineering-policy.docx and secret-token"
const REVIEWED_AT = "2026-07-15T03:04:05.000Z"
const HOST_TARGETS = Object.freeze([
  ["checklist", ".bob/review/checklist.json"],
  ["project_context", ".bob/review/project-context.md"],
  ["prompt_addendum", ".bob/review/review-prompt-addendum.md"],
  ["rule_sources", ".bob/review/rule-sources.json"],
  ["rule_provenance", ".bob/review/rule-provenance.json"]
])

function proposalFixture() {
  const rule = (title) => ({
    category: "security",
    title,
    description: "Validate <untrusted> input & retain evidence.",
    severity_on_fail: "error",
    applies_when: ["changed_file_matches:**/*.ts"],
    evidence_required: true,
    review_hint: "Inspect validation boundaries."
  })
  return {
    schema_version: "bob-bazaar-review/rule-proposal/v1",
    run_id: RUN_ID,
    base: {
      checklist_sha256: "1".repeat(64),
      project_context_sha256: "2".repeat(64),
      prompt_addendum_sha256: "3".repeat(64)
    },
    operations: [
      {
        candidate_id: "candidate-add",
        operation: "add",
        target_rule_id: null,
        rule: rule("AI <script>alert(1)</script> & add"),
        source_refs: [{ source_id: SOURCE_ID, chunk_id: CHUNK_ID }],
        confidence: "high",
        rationale: "AI rationale <unsafe>",
        conflict_ids: ["conflict-blocking"]
      },
      {
        candidate_id: "candidate-update",
        operation: "update",
        target_rule_id: "PRJ-0001",
        rule: rule("Update an existing rule"),
        source_refs: [{ source_id: SOURCE_ID, chunk_id: CHUNK_ID }],
        confidence: "medium",
        rationale: "Update rationale",
        conflict_ids: []
      },
      {
        candidate_id: "candidate-retire",
        operation: "retire",
        target_rule_id: "PRJ-0002",
        rule: null,
        source_refs: [{ source_id: SOURCE_ID, chunk_id: CHUNK_ID }],
        confidence: "low",
        rationale: "Retire rationale",
        conflict_ids: []
      }
    ],
    conflicts: [{
      conflict_id: "conflict-blocking",
      summary: "Blocking <conflict>",
      blocking: true,
      source_refs: [{ source_id: SOURCE_ID, chunk_id: CHUNK_ID }],
      affected_candidate_ids: ["candidate-add"],
      alternatives: [{
        alternative_id: "alternative-a",
        description: "Prefer documented behavior",
        source_refs: [{ source_id: SOURCE_ID, chunk_id: CHUNK_ID }]
      }]
    }],
    project_context_operations: [{
      candidate_id: "candidate-context",
      operation: "add",
      target_section_id: null,
      heading: "Service <context>",
      markdown: "Approved context proposal.",
      source_refs: [{ source_id: SOURCE_ID, chunk_id: CHUNK_ID }],
      confidence: "high",
      rationale: "Context rationale",
      conflict_ids: []
    }],
    prompt_addendum_operations: [{
      candidate_id: "candidate-prompt",
      operation: "add",
      target_section_id: null,
      heading: "Prompt checks",
      markdown: "Review authentication changes.",
      source_refs: [{ source_id: SOURCE_ID, chunk_id: CHUNK_ID }],
      confidence: "high",
      rationale: "Prompt rationale",
      conflict_ids: []
    }]
  }
}

function emptyOverlay() {
  return {
    schema_version: "bob-bazaar-review/proposal-decisions/v1",
    run_id: RUN_ID,
    decisions: {}
  }
}

function completeHostOverlay() {
  return {
    schema_version: "bob-bazaar-review/proposal-decisions/v1",
    run_id: RUN_ID,
    decisions: Object.fromEntries([
      "candidate-add", "candidate-update", "candidate-retire", "candidate-context", "candidate-prompt"
    ].map((candidateId) => [candidateId, {
      decision: candidateId === "candidate-add" ? "reject" : "accept",
      reviewed_at: REVIEWED_AT
    }]))
  }
}

function triageState() {
  const proposal = proposalFixture()
  return {
    run: {
      workspaceRoot: WORKSPACE_ROOT,
      runId: RUN_ID,
      updatedAt: "2026-07-15T03:00:00.000Z"
    },
    proposal,
    validationContext: {
      runId: RUN_ID,
      base: {
        checklistSha256: proposal.base.checklist_sha256,
        projectContextSha256: proposal.base.project_context_sha256,
        promptAddendumSha256: proposal.base.prompt_addendum_sha256
      },
      existingRuleIds: ["PRJ-0001", "PRJ-0002"],
      existingProjectContextSectionIds: [],
      existingPromptAddendumSectionIds: [],
      selectedEvidence: [{ source_id: SOURCE_ID, chunk_id: CHUNK_ID }]
    },
    decisions: emptyOverlay(),
    bundle: {},
    evidence: {
      sourceManifest: {
        schema_version: "bob-bazaar-review/rule-sources/v1",
        generated_at: "2026-07-15T02:00:00.000Z",
        sources: [{ source_id: SOURCE_ID, logical_name: "engineering-policy.docx" }]
      },
      selection: {
        schema_version: "bob-bazaar-review/rule-evidence-selection/v1",
        selected_chunks: [{ source_id: SOURCE_ID, chunk_id: CHUNK_ID, text_sha256: "c".repeat(64) }]
      },
      chunks: [{
        source_id: SOURCE_ID,
        chunk_id: CHUNK_ID,
        locator: { heading_path: ["Security"], block_index: 7 },
        text: "PRIVATE DOCUMENT BODY",
        text_sha256: "c".repeat(64)
      }]
    }
  }
}

function renderModel(overrides = {}) {
  return {
    cspSource: "vscode-resource:",
    runId: RUN_ID,
    groups: [
      {
        asset: "rule",
        label: "Checklist rules",
        operations: [
          {
            candidateId: "candidate-add",
            operation: "add",
            targetId: null,
            title: "AI <script>alert(1)</script> & add",
            severity: "error",
            confidence: "high",
            rationale: "AI rationale <unsafe>",
            sourceCount: 1,
            sourceLocators: ["engineering-policy.docx · heading Security · block 7"],
            blockingConflictIds: ["conflict-blocking"],
            decision: "pending",
            rejectReason: ""
          },
          {
            candidateId: "candidate-update",
            operation: "update",
            targetId: "PRJ-0001",
            title: "Update an existing rule",
            severity: "error",
            confidence: "medium",
            rationale: "Update rationale",
            sourceCount: 1,
            sourceLocators: ["engineering-policy.docx · heading Security · block 7"],
            blockingConflictIds: [],
            decision: "accept",
            rejectReason: "",
            existingSummary: "Existing approved <rule>",
            proposedSummary: "Proposed replacement <rule>",
            existingSummaryTruncated: false,
            proposedSummaryTruncated: false,
            comparisonAvailable: true,
            editRule: {
              category: "human-security",
              title: "Human <edited> title",
              description: "Human </textarea><script>alert('edit')</script> /project/settings.json",
              severityOnFail: "warning",
              appliesWhen: ["changed_file_matches:**/*.tsx", "diff_contains:auth"],
              evidenceRequired: true,
              reviewHint: "Review <carefully>"
            }
          },
          {
            candidateId: "candidate-retire",
            operation: "retire",
            targetId: "PRJ-0002",
            title: "PRJ-0002",
            severity: "",
            confidence: "low",
            rationale: "Retire rationale",
            sourceCount: 1,
            sourceLocators: ["engineering-policy.docx · heading Security · block 7"],
            blockingConflictIds: [],
            decision: "reject",
            rejectReason: "Superseded"
          }
        ]
      },
      { asset: "project_context", label: "Project context", operations: [] },
      { asset: "prompt_addendum", label: "Review prompt addendum", operations: [] }
    ],
    conflicts: [{
      conflictId: "conflict-blocking",
      summary: "Blocking <conflict>",
      blocking: true,
      alternatives: [{ alternativeId: "alternative-a", description: "Prefer documented behavior" }]
    }],
    decisionsComplete: false,
    canPreview: false,
    canApply: false,
    staleWarning: "",
    status: "A decision is required for every candidate.",
    recovery: [],
    preview: undefined,
    transaction: undefined,
    absolutePath: PRIVATE_PATH,
    rawProposal: RAW_PROPOSAL,
    ...overrides
  }
}

function createFakeVscode(options = {}) {
  const panels = []
  const warningCalls = []
  const informationCalls = []
  const errorCalls = []
  const openedDocuments = []
  const warningResponses = [...(options.warningResponses ?? [])]
  const vscode = {
    ViewColumn: { One: 1 },
    window: {
      createWebviewPanel(viewType, title, column, panelOptions) {
        const messageListeners = []
        const disposeListeners = []
        const posts = []
        const htmlHistory = []
        const webview = {
          cspSource: "vscode-resource:",
          postMessage: async (value) => { posts.push(structuredClone(value)); return true },
          onDidReceiveMessage(listener) { messageListeners.push(listener); return { dispose() {} } }
        }
        Object.defineProperty(webview, "html", {
          get: () => htmlHistory.at(-1) ?? "",
          set: (value) => htmlHistory.push(String(value))
        })
        const panel = {
          viewType,
          title,
          column,
          panelOptions,
          webview,
          posts,
          htmlHistory,
          onDidDispose(listener) { disposeListeners.push(listener); return { dispose() {} } },
          async emitMessage(message) {
            for (const listener of messageListeners) await Promise.resolve(listener(structuredClone(message)))
            await turn()
          },
          dispose() {
            if (this.disposed) return
            this.disposed = true
            for (const listener of disposeListeners) listener()
          }
        }
        panels.push(panel)
        return panel
      },
      showWarningMessage: async (message, modalOptions, ...items) => {
        warningCalls.push({ message: String(message), options: structuredClone(modalOptions), items })
        await options.onWarningMessage?.({ message: String(message), modalOptions, items })
        return warningResponses.shift()
      },
      showInformationMessage: async (message) => { informationCalls.push(String(message)) },
      showErrorMessage: async (message) => { errorCalls.push(String(message)) },
      showTextDocument: async (document) => { openedDocuments.push(document); return {} }
    },
    workspace: {
      workspaceFolders: [{ uri: { fsPath: WORKSPACE_ROOT }, name: "acme", index: 0 }],
      openTextDocument: async (options) => ({ ...structuredClone(options), uri: { scheme: "untitled" } })
    }
  }
  return { vscode, panels, warningCalls, informationCalls, errorCalls, openedDocuments }
}

function loadGui(vscode) {
  const originalLoad = Module._load
  delete require.cache[GUI_MODULE]
  Module._load = function load(request, parent, isMain) {
    if (request === "vscode") return vscode
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    return require(GUI_MODULE)
  } finally {
    Module._load = originalLoad
  }
}

function hostDependencies(overrides = {}) {
  const state = triageState()
  const calls = []
  const renderedModels = []
  let planGeneration = 0
  return {
    state,
    calls,
    renderedModels,
    dependencies: {
      createNonce: () => "triage-nonce",
      now: () => REVIEWED_AT,
      newTransactionId: () => "txn-triage-1",
      renderRuleProposalTriageGuiHtml: (model, nonce) => {
        renderedModels.push({ model: structuredClone(model), nonce })
        return "<!doctype html><html><body>triage</body></html>"
      },
      findIncompleteRuleApplyTransactions: async () => {
        calls.push(["findIncomplete"])
        return []
      },
      withRuleApplyWorkspaceLock: async (_workspaceRoot, _operationId, action) => {
        calls.push(["workspaceLock"])
        return action({ testLock: true })
      },
      recoverCommittedRuleAuthoringApply: async () => {
        calls.push(["recoverCommitted"])
        return undefined
      },
      loadRuleProposalTriageState: async () => {
        calls.push(["loadState"])
        return structuredClone(state)
      },
      persistRuleProposalDecisions: async (_state, decisions) => {
        calls.push(["persistDecisions", structuredClone(decisions)])
        state.decisions = structuredClone(decisions)
        return structuredClone(state)
      },
      buildRuleApplyPlan: (_bundle, _proposal, decisions) => {
        planGeneration += 1
        calls.push(["buildPlan", structuredClone(decisions), planGeneration])
        return {
          schema_version: "bob-bazaar-review/rule-apply-plan/v1",
          run_id: RUN_ID,
          targets: HOST_TARGETS.map(([asset, targetPath]) => ({
            asset,
            path: targetPath,
            expected_pre_image: { state: "missing" },
            post_image_sha256: "d".repeat(64),
            bytes: Buffer.alloc(0)
          })),
          decisions: [],
          retirements: [],
          generation: planGeneration
        }
      },
      persistRuleApplyPreview: async (_state, decisions, plan) => {
        calls.push(["persistPreview", structuredClone(decisions), plan.generation])
        return structuredClone(state)
      },
      validateDisplayedRuleApplyPreview: async (_state, plan) => {
        calls.push(["validateDisplayedPreview", plan.generation])
      },
      executeRuleApplyTransaction: async (plan, options) => {
        calls.push(["execute", plan.generation, structuredClone(options)])
        return {
          schema_version: "bob-bazaar-review/apply-manifest/v1",
          transaction_id: options.transactionId,
          run_id: RUN_ID,
          status: "committed",
          committed_at: options.now,
          backup_directory: ".bob/review/rule-authoring/backups/txn-triage-1",
          targets: plan.targets.map((target) => ({
            asset: target.asset,
            path: target.path,
            expected_pre_image: target.expected_pre_image,
            post_image_sha256: target.post_image_sha256,
            state: "replaced"
          })),
          decisions: [],
          retirements: []
        }
      },
      persistRuleApplyCompletion: async (_state, _decisions, _plan, manifest) => {
        calls.push(["persistCompletion", structuredClone(manifest)])
        return { ...state.run, currentPhase: "completed" }
      },
      recoverRuleApplyTransaction: async (_root, transactionId, request) => {
        calls.push(["recover", transactionId, structuredClone(request)])
        return { status: "rolled_back" }
      },
      ...overrides
    }
  }
}

async function startHost(fake, fixture) {
  const gui = loadGui(fake.vscode)
  const host = gui.createRuleProposalTriageGuiHost(fixture.dependencies)
  const promise = host.openRuleProposalTriageGui({ subscriptions: [] }, {
    workspaceRoot: WORKSPACE_ROOT,
    runId: RUN_ID
  })
  await turn()
  return { gui, promise, panel: fake.panels.at(-1) }
}

async function turn() {
  await new Promise((resolve) => setImmediate(resolve))
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex")
}

async function temporaryWorkspace(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "bob-rule-triage-store-"))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  return root
}

test("renders grouped add/update/retire operations, safe locators, required decisions, and blocking conflicts", () => {
  const { renderRuleProposalTriageGuiHtml } = require("../out/ui/ruleProposalTriageGuiHtml")
  const html = renderRuleProposalTriageGuiHtml(renderModel(), "nonce-<triage>")

  assert.match(html, /Content-Security-Policy/)
  assert.match(html, /default-src 'none'/)
  assert.match(html, /script-src 'nonce-nonce-&lt;triage&gt;'/)
  for (const tag of html.match(/<script\b[^>]*>/gi) ?? []) assert.match(tag, /nonce="nonce-&lt;triage&gt;"/)
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i)

  assert.match(html, /チェックリスト規約/)
  assert.match(html, />追加</)
  assert.match(html, />更新</)
  assert.match(html, />廃止</)
  assert.match(html, /PRJ-0001/)
  assert.match(html, /PRJ-0002/)
  assert.match(html, /1件の根拠/)
  assert.match(html, /engineering-policy\.docx · heading Security · block 7/)
  assert.match(html, /解決が必要な競合|解決必須/)
  assert.match(html, /conflict-blocking/)
  assert.match(html, /Existing approved &lt;rule&gt;/)
  assert.match(html, /Proposed replacement &lt;rule&gt;/)
  assert.match(html, /data-comparison-document="full"/)
  assert.match(html, /data-edit-field="category" value="human-security"/)
  assert.match(html, /data-edit-field="title" value="Human &lt;edited&gt; title"/)
  assert.match(html, /data-edit-field="description">Human &lt;\/textarea&gt;&lt;script&gt;alert\(&#39;edit&#39;\)&lt;\/script&gt; \/project\/settings\.json<\/textarea>/)
  assert.match(html, /<option value="warning" selected>警告<\/option>/)
  assert.match(html, /data-edit-field="appliesWhen">changed_file_matches:\*\*\/\*\.tsx\ndiff_contains:auth<\/textarea>/)
  assert.match(html, /data-edit-field="evidenceRequired" checked/)
  assert.match(html, /data-edit-field="reviewHint">Review &lt;carefully&gt;<\/textarea>/)
  assert.doesNotMatch(html, /<script>alert\('edit'\)<\/script>/)
  assert.match(html, /判定[^<]*(?:必須|未判定)|(?:必須|未判定)[^<]*判定/)
  assert.match(html, /data-action="previewApply"[^>]*disabled/)
  assert.match(html, /data-action="applyApproved"[^>]*disabled/)

  assert.match(html, /AI &lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; add/)
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/)
  assert.doesNotMatch(html, /\/private\/rules/)
  assert.doesNotMatch(html, /RAW AI RESPONSE/)
  assert.doesNotMatch(html, /secret-token/)

  const longMarkdown = [
    "Start </textarea><script>alert('markdown')</script>",
    "x".repeat(9_000),
    "END-OF-EDITABLE-MARKDOWN"
  ].join("\n")
  const longEditModel = renderModel()
  longEditModel.groups[1].operations = [{
    candidateId: "candidate-context-long",
    operation: "add",
    targetId: null,
    title: "Long context",
    severity: "",
    confidence: "high",
    rationale: "Long editable body",
    sourceCount: 1,
    sourceLocators: ["engineering-policy.docx · heading Context"],
    blockingConflictIds: [],
    decision: "edit",
    rejectReason: "",
    editHeading: "Human <context>",
    editMarkdown: longMarkdown
  }]
  const longEditHtml = renderRuleProposalTriageGuiHtml(longEditModel, "nonce-long-edit")
  assert.match(longEditHtml, /data-edit-field="heading" value="Human &lt;context&gt;"/)
  assert.match(longEditHtml, /Start &lt;\/textarea&gt;&lt;script&gt;alert\(&#39;markdown&#39;\)&lt;\/script&gt;/)
  assert.match(longEditHtml, /END-OF-EDITABLE-MARKDOWN/)
  assert.doesNotMatch(longEditHtml, /<script>alert\('markdown'\)<\/script>/)

  const hostileCsp = renderRuleProposalTriageGuiHtml(renderModel({
    cspSource: "vscode-resource:; img-src https://attacker.invalid"
  }), "nonce-csp")
  assert.doesNotMatch(hostileCsp, /attacker\.invalid/)
  assert.match(hostileCsp, /style-src vscode-resource: 'unsafe-inline'/)
})

test("shows all seven rule fields and marks truncated Markdown with a host-controlled full comparison", () => {
  const { renderRuleProposalTriageGuiHtml } = require("../out/ui/ruleProposalTriageGuiHtml")
  const model = renderModel()
  model.groups[0].operations[1].existingSummary = [
    "category: security",
    "title: Existing title",
    "description: Existing description",
    "severity_on_fail: warning",
    "applies_when: diff_contains:auth",
    "evidence_required: true",
    "review_hint: Inspect auth"
  ].join("\n")
  model.groups[1].operations = [{
    candidateId: "candidate-context-long",
    operation: "update",
    targetId: "CTX-0001",
    title: "Long context",
    severity: "",
    confidence: "high",
    rationale: "Compare the full managed section",
    sourceCount: 1,
    sourceLocators: ["policy.docx · heading Context"],
    blockingConflictIds: [],
    decision: "accept",
    rejectReason: "",
    existingSummary: "x".repeat(8_000) + "…",
    proposedSummary: "y".repeat(8_000) + "…",
    existingSummaryTruncated: true,
    proposedSummaryTruncated: true,
    comparisonAvailable: true,
    editHeading: "Long context",
    editMarkdown: "Full body"
  }]

  const html = renderRuleProposalTriageGuiHtml(model, "comparison-nonce")
  for (const field of [
    "category", "title", "description", "severity_on_fail",
    "applies_when", "evidence_required", "review_hint"
  ]) assert.match(html, new RegExp(field))
  assert.match(html, /一部省略/)
  assert.match(html, /全文比較を開く/)
  assert.match(html, /data-action="openEvidence"[^>]*data-comparison-document="full"/)
})

test("uses UTF-8 byte limits for editable fields and throws instead of silently emptying invalid values", () => {
  const { renderRuleProposalTriageGuiHtml } = require("../out/ui/ruleProposalTriageGuiHtml")
  const validTitle = "😀".repeat(128)
  const valid = renderModel()
  valid.groups[0].operations[1].editRule.title = validTitle
  const html = renderRuleProposalTriageGuiHtml(valid, "unicode-nonce")
  assert.match(html, new RegExp(`value="${validTitle}"`))

  const invalid = renderModel()
  invalid.groups[0].operations[1].editRule.title = `${validTitle}😀`
  assert.throws(
    () => renderRuleProposalTriageGuiHtml(invalid, "invalid-unicode-nonce"),
    /editable.*invalid|invalid.*editable/i
  )
})

test("renders a durable-manifest recovery as complete-commit instead of rollback", () => {
  const { renderRuleProposalTriageGuiHtml } = require("../out/ui/ruleProposalTriageGuiHtml")
  const model = renderModel()
  model.recovery = [{
    transactionId: "txn-durable-manifest",
    status: "applying",
    recoveryAction: "resume"
  }]
  const html = renderRuleProposalTriageGuiHtml(model, "recovery-nonce")
  assert.match(html, /data-recovery-action="resume"/)
  assert.match(html, />反映処理を完了<\/button>/)
  assert.doesNotMatch(html, /until every incomplete transaction is rolled back/i)
})

test("reports invalid editable Unicode input instead of silently ignoring it", async () => {
  const fake = createFakeVscode()
  const fixture = hostDependencies()
  const { promise, panel } = await startHost(fake, fixture)
  await panel.emitMessage({
    type: "editRule",
    candidateId: "candidate-update",
    rule: { ...proposalFixture().operations[1].rule, title: "😀".repeat(129) }
  })
  assert.equal(fixture.calls.filter(([name]) => name === "persistDecisions").length, 0)
  assert.equal(fake.errorCalls.length, 1)
  assert.match(fake.errorCalls[0], /editable.*invalid|invalid.*editable/i)
  await panel.emitMessage({ type: "close" })
  assert.deepEqual(await promise, { status: "closed", runId: RUN_ID })
})

test("accepts only exact operation-ID Webview messages and never accepts a path or command ID", () => {
  const fake = createFakeVscode()
  const { RULE_PROPOSAL_TRIAGE_MESSAGE_TYPES, parseRuleProposalTriageMessage } = loadGui(fake.vscode)
  assert.deepEqual([...RULE_PROPOSAL_TRIAGE_MESSAGE_TYPES], [
    "setDecision",
    "editRule",
    "resolveConflict",
    "openEvidence",
    "previewApply",
    "applyApproved",
    "recoverTransaction",
    "close"
  ])

  const editedRule = proposalFixture().operations[0].rule
  const accepted = [
    { type: "setDecision", candidateId: "candidate-add", decision: "accept" },
    { type: "setDecision", candidateId: "candidate-update", decision: "reject", rejectReason: "duplicate" },
    { type: "editRule", candidateId: "candidate-add", rule: editedRule },
    { type: "editRule", candidateId: "candidate-context", markdown: { heading: "Context", markdown: "Body" } },
    { type: "resolveConflict", candidateId: "candidate-add", conflictId: "conflict-blocking", alternativeId: "alternative-a" },
    { type: "openEvidence", candidateId: "candidate-add", sourceRefIndex: 0 },
    { type: "openEvidence", candidateId: "candidate-update", comparisonDocument: "full" },
    { type: "previewApply" },
    { type: "applyApproved" },
    { type: "recoverTransaction", transactionId: "txn-triage-1", action: "rollback" },
    { type: "close" }
  ]
  for (const message of accepted) assert.deepEqual(parseRuleProposalTriageMessage(message), message)

  for (const rejected of [
    { type: "previewApply", targetPath: ".bob/review/checklist.json" },
    { type: "applyApproved", command: "workbench.action.terminal.new" },
    { type: "setDecision", candidateId: PRIVATE_PATH, decision: "accept" },
    { type: "setDecision", candidateId: "candidate-add", decision: "maybe" },
    { type: "editRule", candidateId: "candidate-add", rule: { ...editedRule, targetPath: PRIVATE_PATH } },
    { type: "openEvidence", candidateId: "candidate-add", sourceRefIndex: -1 },
    { type: "openEvidence", candidateId: "candidate-update", comparisonDocument: "full", targetPath: PRIVATE_PATH },
    { type: "recoverTransaction", transactionId: "../txn", action: "rollback" },
    { type: "recoverTransaction", transactionId: "txn-triage-1", action: "resume", targetPath: PRIVATE_PATH },
    { type: "close", extra: true }
  ]) assert.equal(parseRuleProposalTriageMessage(rejected), undefined)

  const unicodeRule = { ...editedRule, title: "😀".repeat(128) }
  assert.deepEqual(
    parseRuleProposalTriageMessage({ type: "editRule", candidateId: "candidate-add", rule: unicodeRule }),
    { type: "editRule", candidateId: "candidate-add", rule: unicodeRule }
  )
  assert.equal(parseRuleProposalTriageMessage({
    type: "editRule",
    candidateId: "candidate-add",
    rule: { ...editedRule, title: "😀".repeat(129) }
  }), undefined)

  const exactRejectReason = "😀".repeat(2_048)
  assert.equal(parseRuleProposalTriageMessage({
    type: "setDecision",
    candidateId: "candidate-update",
    decision: "reject",
    rejectReason: exactRejectReason
  }).rejectReason, exactRejectReason)
  assert.equal(parseRuleProposalTriageMessage({
    type: "setDecision",
    candidateId: "candidate-update",
    decision: "reject",
    rejectReason: `${exactRejectReason}😀`
  }), undefined)
  for (const rejectReason of ["line one\nline two", "tab\tseparated"]) {
    assert.equal(parseRuleProposalTriageMessage({
      type: "setDecision",
      candidateId: "candidate-update",
      decision: "reject",
      rejectReason
    }), undefined)
  }
})

test("rejects an over-budget multibyte reason before persistence and shows a safe error", async () => {
  const fake = createFakeVscode()
  const fixture = hostDependencies()
  const { promise, panel } = await startHost(fake, fixture)

  await panel.emitMessage({
    type: "setDecision",
    candidateId: "candidate-update",
    decision: "reject",
    rejectReason: "😀".repeat(2_049)
  })

  assert.equal(fixture.calls.filter(([name]) => name === "persistDecisions").length, 0)
  assert.equal(fake.errorCalls.length, 1)
  assert.match(fake.errorCalls[0], /reject|decision|8,?192|byte|invalid/i)
  await panel.emitMessage({ type: "close" })
  assert.deepEqual(await promise, { status: "closed", runId: RUN_ID })
})

test("counts document chunk records before parsing any excessive JSONL body", () => {
  const { parseDocumentChunks } = require("../out/ui/ruleProposalTriageGui")
  const originalParse = JSON.parse
  let recordParses = 0
  JSON.parse = (value, ...args) => {
    if (value === '{"record":true}') recordParses += 1
    return originalParse(value, ...args)
  }
  try {
    assert.throws(
      () => parseDocumentChunks(Array(8_193).fill('{"record":true}').join("\n")),
      /chunk count.*limit/i
    )
    assert.equal(recordParses, 0)
  } finally {
    JSON.parse = originalParse
  }
})

test("recursively rejects unknown proposal-validation context keys", () => {
  const { parseAndValidateRuleProposal } = require("../out/ruleAuthoring/ruleProposalValidation")
  const state = triageState()
  for (const context of [
    { ...structuredClone(state.validationContext), unknown: true },
    {
      ...structuredClone(state.validationContext),
      base: { ...state.validationContext.base, unknown: true }
    },
    {
      ...structuredClone(state.validationContext),
      selectedEvidence: [{ ...state.validationContext.selectedEvidence[0], unknown: true }]
    }
  ]) {
    assert.throws(
      () => parseAndValidateRuleProposal(JSON.stringify(state.proposal), context),
      /validation context is invalid/i
    )
  }
})

test("re-parses a stored validated proposal and persists decisions in a separate immutable generation", async (t) => {
  const root = await temporaryWorkspace(t)
  const { buildDocumentChunkId } = require("../out/ruleAuthoring/documentChunk")
  const { resolveRuleAuthoringArtifactPath } = require("../out/ruleAuthoring/ruleAuthoringArtifactStore")
  const {
    commitRuleAuthoringArtifactGeneration,
    createRuleAuthoringRun
  } = require("../out/ruleAuthoring/ruleAuthoringRunStore")
  const gui = require("../out/ui/ruleProposalTriageGui")
  const sourceSha = "a".repeat(64)
  const sourceId = `src-${sourceSha.slice(0, 12)}`
  const locator = { page: 2 }
  const chunkId = buildDocumentChunkId(sourceId, "pdf", "page", locator)
  const text = "Stored private evidence body"
  const textSha = sha256(text)
  const storedProposal = proposalFixture()
  storedProposal.run_id = RUN_ID
  for (const operation of [
    ...storedProposal.operations,
    ...storedProposal.project_context_operations,
    ...storedProposal.prompt_addendum_operations
  ]) operation.source_refs = [{ source_id: sourceId, chunk_id: chunkId }]
  for (const conflict of storedProposal.conflicts) {
    conflict.source_refs = [{ source_id: sourceId, chunk_id: chunkId }]
    for (const alternative of conflict.alternatives) {
      alternative.source_refs = [{ source_id: sourceId, chunk_id: chunkId }]
    }
  }
  const rawText = `${RAW_PROPOSAL}\n${JSON.stringify(storedProposal)}`
  const initial = await createRuleAuthoringRun({
    workspaceRoot: root,
    runId: RUN_ID,
    now: "2026-07-15T02:00:00.000Z"
  })
  const sourceManifest = {
    schema_version: "bob-bazaar-review/rule-sources/v1",
    generated_at: "2026-07-15T02:00:01.000Z",
    sources: [{
      source_id: sourceId,
      logical_name: "policy.pdf",
      media_type: "pdf",
      sha256: sourceSha,
      byte_size: 42,
      extraction_status: "success",
      extractor: { id: "fixture", version: "1" },
      warnings: []
    }]
  }
  const chunk = {
    schema_version: "bob-bazaar-review/document-chunk/v1",
    chunk_id: chunkId,
    source_id: sourceId,
    kind: "page",
    locator,
    title: "Policy",
    text,
    text_sha256: textSha,
    flags: []
  }
  const selection = {
    schema_version: "bob-bazaar-review/rule-evidence-selection/v1",
    selected_chunks: [{ source_id: sourceId, chunk_id: chunkId, text_sha256: textSha }]
  }
  const validationContext = {
    runId: RUN_ID,
    base: {
      checklistSha256: storedProposal.base.checklist_sha256,
      projectContextSha256: storedProposal.base.project_context_sha256,
      promptAddendumSha256: storedProposal.base.prompt_addendum_sha256
    },
    existingRuleIds: ["PRJ-0001", "PRJ-0002"],
    existingProjectContextSectionIds: [],
    existingPromptAddendumSectionIds: [],
    selectedEvidence: [{ source_id: sourceId, chunk_id: chunkId }]
  }
  const evidenceRun = await commitRuleAuthoringArtifactGeneration({
    workspaceRoot: root,
    runId: RUN_ID,
    expectedUpdatedAt: initial.updatedAt,
    files: {
      sourceManifest: `${JSON.stringify(sourceManifest)}\n`,
      documentChunks: `${JSON.stringify(chunk)}\n`,
      evidenceSelection: `${JSON.stringify(selection)}\n`
    },
    buildNextRun: (run, artifacts) => ({
      ...run,
      artifacts,
      updatedAt: "2026-07-15T02:00:01.000Z"
    })
  })
  const proposalValidation = gui.createRuleProposalValidationArtifact(
    storedProposal,
    validationContext,
    "2026-07-15T02:00:02.000Z",
    {
      run: evidenceRun,
      evidence: { sourceManifest, chunks: [chunk], selection }
    }
  )
  const seeded = await commitRuleAuthoringArtifactGeneration({
    workspaceRoot: root,
    runId: RUN_ID,
    expectedUpdatedAt: evidenceRun.updatedAt,
    files: {
      ruleProposalRaw: rawText,
      ruleProposal: `${JSON.stringify(storedProposal)}\n`,
      proposalValidation: `${JSON.stringify(proposalValidation)}\n`
    },
    buildNextRun: (run, artifacts) => ({
      ...run,
      currentPhase: "human_review",
      phases: Object.fromEntries(Object.keys(run.phases).map((phase) => [phase,
        ["sources", "extraction", "evidence_selection", "proposal"].includes(phase)
          ? { status: "completed", startedAt: run.createdAt, completedAt: "2026-07-15T02:00:02.000Z" }
          : phase === "human_review"
            ? { status: "in_progress", startedAt: "2026-07-15T02:00:02.000Z" }
            : { status: "not_started" }
      ])),
      artifacts,
      updatedAt: "2026-07-15T02:00:02.000Z"
    })
  })

  const loaded = await gui.loadRuleProposalTriageState({ workspaceRoot: root, runId: RUN_ID })
  const staleWindow = await gui.loadRuleProposalTriageState({ workspaceRoot: root, runId: RUN_ID })
  assert.deepEqual(loaded.proposal, storedProposal)
  const rawPointer = seeded.artifacts.ruleProposalRaw
  const proposalPointer = seeded.artifacts.ruleProposal
  const rawPath = resolveRuleAuthoringArtifactPath(seeded, "ruleProposalRaw")
  const proposalPath = resolveRuleAuthoringArtifactPath(seeded, "ruleProposal")
  const rawBefore = await fs.readFile(rawPath)
  const proposalBefore = await fs.readFile(proposalPath)

  const next = await gui.persistRuleProposalDecisions(loaded, {
    schema_version: "bob-bazaar-review/proposal-decisions/v1",
    run_id: RUN_ID,
    decisions: {
      "candidate-retire": {
        decision: "reject",
        reject_reason: "Keep this rule",
        reviewed_at: REVIEWED_AT
      }
    }
  })

  assert.equal(next.run.artifacts.ruleProposalRaw, rawPointer)
  assert.equal(next.run.artifacts.ruleProposal, proposalPointer)
  assert.notEqual(next.run.artifacts.proposalDecisions, proposalPointer)
  assert.notEqual(path.dirname(resolveRuleAuthoringArtifactPath(next.run, "proposalDecisions")), path.dirname(proposalPath))
  assert.deepEqual(await fs.readFile(rawPath), rawBefore)
  assert.deepEqual(await fs.readFile(proposalPath), proposalBefore)

  await assert.rejects(
    gui.persistRuleProposalDecisions(staleWindow, {
      schema_version: "bob-bazaar-review/proposal-decisions/v1",
      run_id: RUN_ID,
      decisions: {
        "candidate-retire": {
          decision: "accept",
          reviewed_at: "2026-07-15T03:04:06.000Z"
        }
      }
    }),
    /changed since it was loaded|while Human Triage was open/i
  )
  const afterStaleDecision = await gui.loadRuleProposalTriageState({ workspaceRoot: root, runId: RUN_ID })
  assert.equal(afterStaleDecision.decisions.decisions["candidate-retire"].decision, "reject")

  const completeOverlay = {
    schema_version: "bob-bazaar-review/proposal-decisions/v1",
    run_id: RUN_ID,
    decisions: Object.fromEntries([
      "candidate-add",
      "candidate-update",
      "candidate-retire",
      "candidate-context",
      "candidate-prompt"
    ].map((candidateId) => [candidateId, {
      decision: candidateId === "candidate-retire" ? "reject" : "accept",
      reviewed_at: "2026-07-15T03:04:07.000Z",
      ...(candidateId === "candidate-add"
        ? { conflict_resolutions: { "conflict-blocking": "alternative-a" } }
        : {})
    }]))
  }
  const decisionState = await gui.persistRuleProposalDecisions(afterStaleDecision, completeOverlay)
  const previewWindowA = await gui.loadRuleProposalTriageState({ workspaceRoot: root, runId: RUN_ID })
  const previewWindowB = await gui.loadRuleProposalTriageState({ workspaceRoot: root, runId: RUN_ID })
  const targetSpecs = [
    ["checklist", ".bob/review/checklist.json"],
    ["project_context", ".bob/review/project-context.md"],
    ["prompt_addendum", ".bob/review/review-prompt-addendum.md"],
    ["rule_sources", ".bob/review/rule-sources.json"],
    ["rule_provenance", ".bob/review/rule-provenance.json"]
  ]
  const previewPlan = {
    schema_version: "bob-bazaar-review/rule-apply-plan/v1",
    run_id: RUN_ID,
    targets: targetSpecs.map(([asset, targetPath]) => ({
      asset,
      path: targetPath,
      expected_pre_image: { state: "missing" },
      post_image_sha256: "d".repeat(64),
      bytes: Buffer.alloc(0)
    })),
    decisions: [],
    retirements: []
  }
  const previewA = await gui.persistRuleApplyPreview(previewWindowA, completeOverlay, previewPlan)
  assert.equal(previewA.run.currentPhase, "apply")
  assert.equal(previewA.run.phases.human_review.status, "completed")
  assert.equal(previewA.run.phases.apply.status, "in_progress")
  await assert.rejects(
    gui.persistRuleApplyPreview(previewWindowB, completeOverlay, previewPlan),
    /changed since it was loaded|while Human Triage was open/i
  )
  const afterStalePreview = await gui.loadRuleProposalTriageState({ workspaceRoot: root, runId: RUN_ID })
  assert.equal(afterStalePreview.run.artifacts.applyPreview, previewA.run.artifacts.applyPreview)
  assert.equal(afterStalePreview.run.artifacts.proposalDecisions, decisionState.run.artifacts.proposalDecisions)
  const invalidatedRun = await gui.invalidateRuleApplyPreview({ workspaceRoot: root, runId: RUN_ID })
  assert.equal(invalidatedRun.currentPhase, "apply")
  assert.equal(invalidatedRun.phases.apply.status, "in_progress")
  assert.equal(invalidatedRun.artifacts.applyPreview, undefined)
  const afterInvalidation = await gui.loadRuleProposalTriageState({ workspaceRoot: root, runId: RUN_ID })

  const revisedOverlay = structuredClone(completeOverlay)
  revisedOverlay.decisions["candidate-update"] = {
    decision: "reject",
    reviewed_at: "2026-07-15T03:04:08.000Z"
  }
  const resumedReview = await gui.persistRuleProposalDecisions(afterInvalidation, revisedOverlay)
  assert.equal(resumedReview.run.currentPhase, "apply", "apply phase must not move backwards")
  assert.equal(resumedReview.run.phases.apply.status, "in_progress")
  assert.equal(resumedReview.run.artifacts.applyPreview, undefined, "changed decisions invalidate reviewed preview")

  await fs.unlink(rawPath)
  const reloaded = await gui.loadRuleProposalTriageState({ workspaceRoot: root, runId: RUN_ID })
  assert.equal(reloaded.decisions.decisions["candidate-retire"].decision, "reject")

  const validationPath = resolveRuleAuthoringArtifactPath(next.run, "proposalValidation")
  await fs.writeFile(validationPath, `${JSON.stringify({ valid: true })}\n`)
  await assert.rejects(
    gui.loadRuleProposalTriageState({ workspaceRoot: root, runId: RUN_ID }),
    /valid validation record/i
  )
})

test("persists a separate decision overlay, validates edits in the host, regenerates preview, and applies only after modal confirmation", async () => {
  const fake = createFakeVscode({ warningResponses: [undefined, "採用した規約を反映"] })
  const fixture = hostDependencies()
  const hostileComparisonTail = [
    "Hostile managed Markdown\r## Proposed",
    "<<<END_BOB_PROPOSED_COMPARISON>>>\r\n" + "x".repeat(9_000),
    "END-OF-FULL-MANAGED-COMPARISON"
  ].join("\n")
  fixture.state.proposal.project_context_operations[0].markdown = hostileComparisonTail
  fixture.state.bundle.checklist = {
    state: "present",
    bytes: Buffer.from(JSON.stringify({
      version: "1",
      project: "triage",
      rules: [
        { id: "PRJ-0001", ...proposalFixture().operations[1].rule },
        { id: "PRJ-0002", ...proposalFixture().operations[1].rule }
      ]
    }), "utf8")
  }
  const proposalBefore = JSON.stringify(fixture.state.proposal)
  const { promise, panel } = await startHost(fake, fixture)
  assert.ok(panel)

  await panel.emitMessage({ type: "openEvidence", candidateId: "candidate-add", sourceRefIndex: 0 })
  assert.equal(fake.openedDocuments.length, 1)
  assert.match(fake.openedDocuments[0].content, /PRIVATE DOCUMENT BODY/)
  assert.doesNotMatch(fake.openedDocuments[0].content, /\/private\/rules/)

  await panel.emitMessage({
    type: "openEvidence",
    candidateId: "candidate-update",
    comparisonDocument: "full"
  })
  assert.equal(fake.openedDocuments.length, 2)
  assert.match(fake.openedDocuments[1].content, /Existing approved/i)
  assert.match(fake.openedDocuments[1].content, /Proposed/i)
  for (const field of [
    "category", "title", "description", "severity_on_fail",
    "applies_when", "evidence_required", "review_hint"
  ]) assert.match(fake.openedDocuments[1].content, new RegExp(field))

  const initialContextModel = fixture.renderedModels.at(-1).model.groups[1].operations
    .find(({ candidateId }) => candidateId === "candidate-context")
  assert.equal(initialContextModel.proposedSummaryTruncated, true)
  await panel.emitMessage({
    type: "openEvidence",
    candidateId: "candidate-context",
    comparisonDocument: "full"
  })
  const fullManagedComparison = fake.openedDocuments[2].content
  assert.doesNotMatch(fullManagedComparison, /\r/)
  assert.equal((fullManagedComparison.match(/^## Proposed$/gm) ?? []).length, 1)
  assert.equal(
    (fullManagedComparison.match(/^<<<END_BOB_PROPOSED_COMPARISON>>>$/gm) ?? []).length,
    1
  )
  assert.match(fullManagedComparison, /^PROPOSED \| ## Proposed$/m)
  assert.match(fullManagedComparison, /^PROPOSED \| <<<END_BOB_PROPOSED_COMPARISON>>>$/m)
  assert.match(fullManagedComparison, /^PROPOSED \| END-OF-FULL-MANAGED-COMPARISON$/m)

  await panel.emitMessage({
    type: "editRule",
    candidateId: "candidate-add",
    rule: { ...proposalFixture().operations[0].rule, severity_on_fail: "critical" }
  })
  assert.equal(fixture.calls.filter(([name]) => name === "persistDecisions").length, 0)

  await panel.emitMessage({
    type: "editRule",
    candidateId: "candidate-update",
    rule: {
      ...proposalFixture().operations[1].rule,
      applies_when: ["execute:rm -rf workspace"]
    }
  })
  assert.equal(
    fixture.calls.filter(([name]) => name === "persistDecisions").length,
    0,
    "schema-valid but semantically inert-invalid conditions must not persist"
  )

  const acceptedIds = ["candidate-add", "candidate-update", "candidate-prompt"]
  for (const candidateId of acceptedIds) {
    await panel.emitMessage({ type: "setDecision", candidateId, decision: "accept" })
  }
  await panel.emitMessage({
    type: "editRule",
    candidateId: "candidate-update",
    rule: {
      ...proposalFixture().operations[1].rule,
      category: "human-security",
      title: "Human-edited title",
      description: "Human-edited description.",
      severity_on_fail: "warning",
      applies_when: ["diff_contains:authorization"],
      evidence_required: false,
      review_hint: "Human review hint."
    }
  })
  const editedRuleModel = fixture.renderedModels.at(-1).model.groups[0].operations
    .find(({ candidateId }) => candidateId === "candidate-update")
  assert.equal(editedRuleModel.title, "Human-edited title")
  assert.deepEqual(editedRuleModel.editRule, {
    category: "human-security",
    title: "Human-edited title",
    description: "Human-edited description.",
    severityOnFail: "warning",
    appliesWhen: ["diff_contains:authorization"],
    evidenceRequired: false,
    reviewHint: "Human review hint."
  })
  assert.match(editedRuleModel.proposedSummary, /Human-edited description/)
  for (const field of [
    "category", "title", "description", "severity_on_fail",
    "applies_when", "evidence_required", "review_hint"
  ]) {
    assert.match(editedRuleModel.existingSummary, new RegExp(field))
    assert.match(editedRuleModel.proposedSummary, new RegExp(field))
  }
  await panel.emitMessage({
    type: "setDecision",
    candidateId: "candidate-retire",
    decision: "reject",
    rejectReason: "Still required"
  })
  await panel.emitMessage({
    type: "editRule",
    candidateId: "candidate-context",
    markdown: { heading: "Human context", markdown: "Human-approved context body." }
  })
  const editedMarkdownModel = fixture.renderedModels.at(-1).model.groups[1].operations
    .find(({ candidateId }) => candidateId === "candidate-context")
  assert.equal(editedMarkdownModel.title, "Human context")
  assert.equal(editedMarkdownModel.editHeading, "Human context")
  assert.equal(editedMarkdownModel.editMarkdown, "Human-approved context body.")
  assert.match(editedMarkdownModel.proposedSummary, /Human-approved context body/)

  assert.equal(fixture.renderedModels.at(-1).model.decisionsComplete, false)
  assert.equal(fixture.renderedModels.at(-1).model.canPreview, false)
  await panel.emitMessage({
    type: "resolveConflict",
    candidateId: "candidate-add",
    conflictId: "conflict-blocking",
    alternativeId: "alternative-a"
  })
  assert.equal(fixture.renderedModels.at(-1).model.decisionsComplete, true)
  assert.equal(fixture.renderedModels.at(-1).model.canPreview, true)
  assert.equal(fixture.renderedModels.at(-1).model.canApply, false)

  await panel.emitMessage({ type: "previewApply" })
  assert.equal(fixture.renderedModels.at(-1).model.canApply, true)
  const firstPlan = fixture.calls.find(([name]) => name === "buildPlan")
  assert.ok(firstPlan)
  assert.equal(firstPlan[1].decisions["candidate-add"].decision, "accept")
  assert.equal(firstPlan[1].decisions["candidate-add"].conflict_resolutions["conflict-blocking"], "alternative-a")
  assert.equal(firstPlan[1].decisions["candidate-update"].decision, "edit")
  assert.equal(firstPlan[1].decisions["candidate-update"].edited_rule.title, "Human-edited title")
  assert.equal(firstPlan[1].decisions["candidate-context"].decision, "edit")
  assert.equal(firstPlan[1].decisions["candidate-context"].edited_markdown.heading, "Human context")
  assert.equal(firstPlan[1].decisions["candidate-retire"].decision, "reject")
  assert.equal(firstPlan[1].decisions["candidate-retire"].reject_reason, "Still required")

  await panel.emitMessage({ type: "applyApproved" })
  assert.equal(fixture.calls.filter(([name]) => name === "execute").length, 0, "dismissed modal must not apply")
  await panel.emitMessage({ type: "applyApproved" })

  const builds = fixture.calls.filter(([name]) => name === "buildPlan")
  assert.equal(builds.length, 4, "apply must revalidate before confirmation and immediately before execution")
  assert.equal(fixture.calls.filter(([name]) => name === "execute").length, 1)
  assert.equal(fixture.calls.find(([name]) => name === "execute")[1], 4)
  assert.deepEqual(fake.warningCalls.map(({ options }) => options), [{ modal: true }, { modal: true }])
  assert.equal(JSON.stringify(fixture.state.proposal), proposalBefore, "raw validated proposal must remain immutable")

  const result = await promise
  assert.deepEqual(result, { status: "applied", runId: RUN_ID, transactionId: "txn-triage-1" })
  const finalModel = fixture.renderedModels.at(-1).model
  assert.equal(finalModel.transaction.status, "committed")
  assert.equal(finalModel.transaction.transactionId, "txn-triage-1")
  assert.doesNotMatch(JSON.stringify(fixture.renderedModels), /PRIVATE DOCUMENT BODY|RAW AI RESPONSE|\/private\/rules/)

  const reopened = await startHost(fake, fixture)
  const reopenedRule = fixture.renderedModels.at(-1).model.groups[0].operations
    .find(({ candidateId }) => candidateId === "candidate-update")
  const reopenedMarkdown = fixture.renderedModels.at(-1).model.groups[1].operations
    .find(({ candidateId }) => candidateId === "candidate-context")
  assert.equal(reopenedRule.editRule.title, "Human-edited title")
  assert.equal(reopenedRule.editRule.description, "Human-edited description.")
  assert.equal(reopenedMarkdown.editHeading, "Human context")
  assert.equal(reopenedMarkdown.editMarkdown, "Human-approved context body.")
  await reopened.panel.emitMessage({ type: "close" })
  assert.deepEqual(await reopened.promise, { status: "closed", runId: RUN_ID })
})

test("requires a displayed preview and never executes a freshly changed unseen plan", async () => {
  const fake = createFakeVscode({ warningResponses: ["採用した規約を反映"] })
  let generation = 0
  const fixture = hostDependencies({
    buildRuleApplyPlan: (_bundle, _proposal, decisions) => {
      generation += 1
      const postImage = generation === 1 ? "a".repeat(64) : "b".repeat(64)
      fixture.calls.push(["buildPlan", structuredClone(decisions), generation])
      return {
        schema_version: "bob-bazaar-review/rule-apply-plan/v1",
        run_id: RUN_ID,
        targets: HOST_TARGETS.map(([asset, targetPath]) => ({
          asset,
          path: targetPath,
          expected_pre_image: { state: "missing" },
          post_image_sha256: postImage,
          bytes: Buffer.alloc(0)
        })),
        decisions: [],
        retirements: [],
        generation
      }
    }
  })
  fixture.state.decisions = {
    schema_version: "bob-bazaar-review/proposal-decisions/v1",
    run_id: RUN_ID,
    decisions: Object.fromEntries([
      "candidate-add", "candidate-update", "candidate-retire", "candidate-context", "candidate-prompt"
    ].map((candidateId) => [candidateId, {
      decision: candidateId === "candidate-add" ? "reject" : "accept",
      reviewed_at: REVIEWED_AT
    }]))
  }
  const { promise, panel } = await startHost(fake, fixture)

  assert.equal(fixture.renderedModels.at(-1).model.canApply, false)
  await panel.emitMessage({ type: "applyApproved" })
  assert.equal(fake.warningCalls.length, 0)
  assert.equal(fixture.calls.filter(([name]) => name === "execute").length, 0)

  await panel.emitMessage({ type: "previewApply" })
  assert.equal(fixture.renderedModels.at(-1).model.canApply, true)
  const displayedDigest = fixture.renderedModels.at(-1).model.preview.planDigest
  assert.match(displayedDigest, /^[a-f0-9]{64}$/)
  await panel.emitMessage({ type: "applyApproved" })
  assert.equal(fake.warningCalls.length, 0, "changed plan must be displayed before confirmation")
  assert.equal(fixture.calls.filter(([name]) => name === "execute").length, 0)
  assert.match(fixture.renderedModels.at(-1).model.status, /変更|プレビューを確認/)
  assert.notEqual(fixture.renderedModels.at(-1).model.preview.planDigest, displayedDigest)

  await panel.emitMessage({ type: "applyApproved" })
  assert.equal(fake.warningCalls.length, 1)
  assert.equal(fixture.calls.filter(([name]) => name === "execute").length, 1)
  assert.equal(fixture.calls.find(([name]) => name === "execute")[1], 4)
  assert.deepEqual(
    fixture.calls.filter(([name]) => name === "validateDisplayedPreview"),
    [["validateDisplayedPreview", 3], ["validateDisplayedPreview", 4]],
    "the stable displayed plan is rebound before confirmation and immediately before execution"
  )
  assert.ok(
    fixture.calls.findIndex(([name]) => name === "validateDisplayedPreview") <
      fixture.calls.findIndex(([name]) => name === "execute")
  )
  assert.deepEqual(await promise, { status: "applied", runId: RUN_ID, transactionId: "txn-triage-1" })
})

test("the controller passes one workspace-lock token through final recovery, validation, execute, and completion", async () => {
  const fake = createFakeVscode({ warningResponses: ["採用した規約を反映"] })
  const fixture = hostDependencies()
  fixture.state.decisions = completeHostOverlay()
  const observed = {
    recover: [],
    validate: [],
    execute: [],
    complete: []
  }
  const originalRecover = fixture.dependencies.recoverCommittedRuleAuthoringApply
  fixture.dependencies.recoverCommittedRuleAuthoringApply = async (...args) => {
    observed.recover.push(args[1])
    return originalRecover(...args)
  }
  const originalValidate = fixture.dependencies.validateDisplayedRuleApplyPreview
  fixture.dependencies.validateDisplayedRuleApplyPreview = async (...args) => {
    observed.validate.push(args[2])
    return originalValidate(...args)
  }
  const originalExecute = fixture.dependencies.executeRuleApplyTransaction
  fixture.dependencies.executeRuleApplyTransaction = async (...args) => {
    observed.execute.push(args[1].workspaceLockToken)
    return originalExecute(...args)
  }
  const originalComplete = fixture.dependencies.persistRuleApplyCompletion
  fixture.dependencies.persistRuleApplyCompletion = async (...args) => {
    observed.complete.push(args[4])
    return originalComplete(...args)
  }

  const { promise, panel } = await startHost(fake, fixture)
  await panel.emitMessage({ type: "previewApply" })
  await panel.emitMessage({ type: "applyApproved" })
  assert.equal((await promise).status, "applied")

  const finalToken = observed.execute.at(-1)
  assert.ok(finalToken)
  assert.equal(observed.recover.at(-1), finalToken)
  assert.equal(observed.validate.at(-1), finalToken)
  assert.equal(observed.complete.at(-1), finalToken)
})

test("requires another explicit apply when the authoritative bundle changes inside the modal", async () => {
  let postImage = "a".repeat(64)
  const fake = createFakeVscode({
    warningResponses: ["採用した規約を反映"],
    onWarningMessage: () => { postImage = "b".repeat(64) }
  })
  let generation = 0
  const fixture = hostDependencies({
    buildRuleApplyPlan: (_bundle, _proposal, decisions) => {
      generation += 1
      fixture.calls.push(["buildPlan", structuredClone(decisions), generation])
      return {
        schema_version: "bob-bazaar-review/rule-apply-plan/v1",
        run_id: RUN_ID,
        targets: HOST_TARGETS.map(([asset, targetPath]) => ({
          asset,
          path: targetPath,
          expected_pre_image: { state: "missing" },
          post_image_sha256: postImage,
          bytes: Buffer.alloc(0)
        })),
        decisions: [],
        retirements: [],
        generation
      }
    }
  })
  fixture.state.decisions = {
    schema_version: "bob-bazaar-review/proposal-decisions/v1",
    run_id: RUN_ID,
    decisions: Object.fromEntries([
      "candidate-add", "candidate-update", "candidate-retire", "candidate-context", "candidate-prompt"
    ].map((candidateId) => [candidateId, {
      decision: candidateId === "candidate-add" ? "reject" : "accept",
      reviewed_at: REVIEWED_AT
    }]))
  }
  const { promise, panel } = await startHost(fake, fixture)

  await panel.emitMessage({ type: "previewApply" })
  const displayedDigest = fixture.renderedModels.at(-1).model.preview.planDigest
  await panel.emitMessage({ type: "applyApproved" })

  assert.equal(fake.warningCalls.length, 1, "the first two plan reads are stable through the modal")
  assert.equal(fixture.calls.filter(([name]) => name === "execute").length, 0)
  assert.notEqual(fixture.renderedModels.at(-1).model.preview.planDigest, displayedDigest)
  assert.match(fixture.renderedModels.at(-1).model.status, /確認中.*変更|プレビューを確認/)
  assert.equal(fixture.renderedModels.at(-1).model.canApply, true)

  await panel.emitMessage({ type: "close" })
  assert.deepEqual(await promise, { status: "closed", runId: RUN_ID })
})

test("a rolled-back apply invalidates the preview before normal triage resumes", async () => {
  const fake = createFakeVscode({ warningResponses: ["採用した規約を反映"] })
  const transactionError = Object.assign(new Error("rolled back safely"), {
    code: "filesystem_failure",
    status: "rolled_back"
  })
  const fixture = hostDependencies({
    executeRuleApplyTransaction: async () => {
      fixture.calls.push(["execute"])
      throw transactionError
    },
    invalidateRuleApplyPreview: async (input) => {
      fixture.calls.push(["invalidatePreview", structuredClone(input)])
      return fixture.state.run
    }
  })
  fixture.state.decisions = completeHostOverlay()
  const { promise, panel } = await startHost(fake, fixture)

  await panel.emitMessage({ type: "previewApply" })
  assert.equal(fixture.renderedModels.at(-1).model.canApply, true)
  await panel.emitMessage({ type: "applyApproved" })

  assert.equal(fixture.calls.filter(([name]) => name === "execute").length, 1)
  assert.equal(fixture.calls.filter(([name]) => name === "invalidatePreview").length, 1)
  assert.equal(fixture.renderedModels.at(-1).model.canApply, false)
  assert.equal(fixture.renderedModels.at(-1).model.recovery.length, 0)
  await panel.emitMessage({ type: "close" })
  assert.deepEqual(await promise, { status: "closed", runId: RUN_ID })
})

test("a rollback-failed apply stays open in recovery-only state", async () => {
  const fake = createFakeVscode({ warningResponses: ["採用した規約を反映"] })
  let incomplete = []
  const transactionError = Object.assign(new Error("rollback requires recovery"), {
    code: "rollback_failed",
    status: "rollback_failed"
  })
  const fixture = hostDependencies({
    findIncompleteRuleApplyTransactions: async () => {
      fixture.calls.push(["findIncomplete"])
      return structuredClone(incomplete)
    },
    executeRuleApplyTransaction: async () => {
      fixture.calls.push(["execute"])
      incomplete = [{
        transaction_id: "txn-triage-1",
        run_id: RUN_ID,
        status: "rollback_failed",
        recovery_action: "rollback"
      }]
      throw transactionError
    }
  })
  fixture.state.decisions = completeHostOverlay()
  const { promise, panel } = await startHost(fake, fixture)

  await panel.emitMessage({ type: "previewApply" })
  await panel.emitMessage({ type: "applyApproved" })

  const model = fixture.renderedModels.at(-1).model
  assert.equal(fixture.calls.filter(([name]) => name === "execute").length, 1)
  assert.equal(model.groups.length, 0)
  assert.deepEqual(model.recovery, [{
    transactionId: "txn-triage-1",
    status: "rollback_failed",
    recoveryAction: "rollback"
  }])
  assert.equal(model.canApply, false)
  await panel.emitMessage({ type: "close" })
  assert.deepEqual(await promise, { status: "closed", runId: RUN_ID })
})

test("maps a stale current bundle to a safe warning and never starts a transaction", async () => {
  const fake = createFakeVscode()
  const fixture = hostDependencies({
    buildRuleApplyPlan: () => {
      throw new Error(`stale_pre_image: ${PRIVATE_PATH} ${RAW_PROPOSAL}`)
    }
  })
  const { promise, panel } = await startHost(fake, fixture)
  for (const candidateId of [
    "candidate-add",
    "candidate-update",
    "candidate-retire",
    "candidate-context",
    "candidate-prompt"
  ]) {
    await panel.emitMessage({
      type: "setDecision",
      candidateId,
      decision: candidateId === "candidate-add" ? "reject" : "accept"
    })
  }
  await panel.emitMessage({ type: "previewApply" })

  const model = fixture.renderedModels.at(-1).model
  assert.match(model.staleWarning, /approved rule bundle changed/i)
  assert.equal(fixture.calls.filter(([name]) => name === "execute").length, 0)
  assert.doesNotMatch(JSON.stringify(model), /\/private\/rules|RAW AI RESPONSE|secret-token/)

  await panel.emitMessage({ type: "close" })
  assert.deepEqual(await promise, { status: "closed", runId: RUN_ID })
})

test("does not expose unpersisted decision, edit, or conflict state after persistence failure", async (t) => {
  await t.test("decision", async () => {
    const fake = createFakeVscode()
    const fixture = hostDependencies({
      persistRuleProposalDecisions: async () => { throw new Error("Rule authoring run changed since it was loaded") }
    })
    const { promise, panel } = await startHost(fake, fixture)
    await panel.emitMessage({ type: "setDecision", candidateId: "candidate-add", decision: "accept" })
    const operation = fixture.renderedModels.at(-1).model.groups[0].operations
      .find(({ candidateId }) => candidateId === "candidate-add")
    assert.equal(operation.decision, "pending")
    await panel.emitMessage({ type: "close" })
    assert.deepEqual(await promise, { status: "closed", runId: RUN_ID })
  })

  await t.test("edit", async () => {
    const fake = createFakeVscode()
    const fixture = hostDependencies({
      persistRuleProposalDecisions: async () => { throw new Error("Rule authoring run changed since it was loaded") }
    })
    const { promise, panel } = await startHost(fake, fixture)
    await panel.emitMessage({
      type: "editRule",
      candidateId: "candidate-update",
      rule: { ...proposalFixture().operations[1].rule, title: "Unpersisted title" }
    })
    const operation = fixture.renderedModels.at(-1).model.groups[0].operations
      .find(({ candidateId }) => candidateId === "candidate-update")
    assert.equal(operation.decision, "pending")
    assert.equal(operation.title, "Update an existing rule")
    await panel.emitMessage({ type: "close" })
    assert.deepEqual(await promise, { status: "closed", runId: RUN_ID })
  })

  await t.test("conflict", async () => {
    const fake = createFakeVscode()
    const fixture = hostDependencies({
      persistRuleProposalDecisions: async () => { throw new Error("Rule authoring run changed since it was loaded") }
    })
    fixture.state.decisions = {
      schema_version: "bob-bazaar-review/proposal-decisions/v1",
      run_id: RUN_ID,
      decisions: Object.fromEntries([
        "candidate-add",
        "candidate-update",
        "candidate-retire",
        "candidate-context",
        "candidate-prompt"
      ].map((candidateId) => [candidateId, {
        decision: "accept",
        reviewed_at: REVIEWED_AT
      }]))
    }
    const { promise, panel } = await startHost(fake, fixture)
    assert.equal(fixture.renderedModels.at(-1).model.decisionsComplete, false)
    await panel.emitMessage({
      type: "resolveConflict",
      candidateId: "candidate-add",
      conflictId: "conflict-blocking",
      alternativeId: "alternative-a"
    })
    assert.equal(fixture.renderedModels.at(-1).model.decisionsComplete, false)
    await panel.emitMessage({ type: "close" })
    assert.deepEqual(await promise, { status: "closed", runId: RUN_ID })
  })
})

test("blocks normal resume until an incomplete transaction is rolled back", async () => {
  const transactionRunId = "authoring-run-from-another-panel"
  let incomplete = [{
    transaction_id: "txn-incomplete",
    run_id: transactionRunId,
    status: "rollback_failed",
    recovery_action: "rollback"
  }]
  const fake = createFakeVscode()
  const fixture = hostDependencies({
    findIncompleteRuleApplyTransactions: async () => {
      fixture.calls.push(["findIncomplete"])
      return structuredClone(incomplete)
    },
    recoverRuleApplyTransaction: async (_root, transactionId, request) => {
      fixture.calls.push(["recover", transactionId, structuredClone(request)])
      incomplete = []
      return { status: "rolled_back" }
    },
    invalidateRuleApplyPreview: async (input) => {
      fixture.calls.push(["invalidatePreview", structuredClone(input)])
      delete fixture.state.run.artifacts?.applyPreview
    }
  })
  const { promise, panel } = await startHost(fake, fixture)

  assert.ok(panel)
  assert.deepEqual(fixture.calls.map(([name]) => name), ["workspaceLock", "findIncomplete"])
  assert.equal(fixture.renderedModels.at(-1).model.recovery.length, 1)
  await panel.emitMessage({
    type: "recoverTransaction",
    transactionId: "txn-incomplete",
    action: "rollback"
  })

  assert.deepEqual(fixture.calls.map(([name]) => name), [
    "workspaceLock",
    "findIncomplete",
    "workspaceLock",
    "recover",
    "invalidatePreview",
    "workspaceLock",
    "findIncomplete",
    "recoverCommitted",
    "loadState"
  ])
  assert.equal(fixture.renderedModels.at(-1).model.groups[0].operations.length, 3)
  assert.equal(fixture.renderedModels.at(-1).model.canApply, false)
  assert.deepEqual(
    fixture.calls.find(([name]) => name === "invalidatePreview")[1],
    { workspaceRoot: WORKSPACE_ROOT, runId: transactionRunId },
    "rollback must invalidate the transaction run rather than the currently open panel run"
  )

  await panel.emitMessage({ type: "close" })
  assert.deepEqual(await promise, { status: "closed", runId: RUN_ID })
})

test("only the advertised resume action can complete a durable manifest recovery", async () => {
  let incomplete = [{
    transaction_id: "txn-durable-manifest",
    run_id: RUN_ID,
    status: "applying",
    recovery_action: "resume"
  }]
  const fake = createFakeVscode()
  const fixture = hostDependencies({
    findIncompleteRuleApplyTransactions: async () => structuredClone(incomplete),
    recoverRuleApplyTransaction: async (_root, transactionId, request) => {
      fixture.calls.push(["recover", transactionId, structuredClone(request)])
      incomplete = []
      return { status: "committed", targets: [] }
    },
    recoverCommittedRuleAuthoringApply: async () => ({
      status: "recovered",
      runId: RUN_ID,
      transactionId: "txn-durable-manifest"
    })
  })
  const { promise, panel } = await startHost(fake, fixture)

  await panel.emitMessage({
    type: "recoverTransaction",
    transactionId: "txn-durable-manifest",
    action: "rollback"
  })
  assert.equal(fixture.calls.filter(([name]) => name === "recover").length, 0)

  await panel.emitMessage({
    type: "recoverTransaction",
    transactionId: "txn-durable-manifest",
    action: "resume"
  })
  assert.equal(fixture.calls.filter(([name]) => name === "recover").length, 1)
  assert.equal(fixture.calls.filter(([name]) => name === "invalidatePreview").length, 0)
  assert.deepEqual(await promise, {
    status: "applied",
    runId: RUN_ID,
    transactionId: "txn-durable-manifest"
  })
})

test("completes the owning run before a cross-run durable recovery disappears", async () => {
  const transactionRunId = "authoring-run-durable-owner"
  let incomplete = [{
    transaction_id: "txn-cross-run-durable",
    run_id: transactionRunId,
    status: "applying",
    recovery_action: "resume"
  }]
  let transactionToken
  let completionToken
  const completionInputs = []
  const fake = createFakeVscode()
  const fixture = hostDependencies({
    findIncompleteRuleApplyTransactions: async () => structuredClone(incomplete),
    recoverRuleApplyTransaction: async (_root, _transactionId, request) => {
      transactionToken = request.workspaceLockToken
      incomplete = []
      return { status: "committed", targets: [] }
    },
    recoverCommittedRuleAuthoringApply: async (input, workspaceLockToken) => {
      completionInputs.push(structuredClone(input))
      if (input.runId !== transactionRunId) return undefined
      completionToken = workspaceLockToken
      return {
        status: "recovered",
        runId: transactionRunId,
        transactionId: "txn-cross-run-durable"
      }
    }
  })
  const { promise, panel } = await startHost(fake, fixture)

  await panel.emitMessage({
    type: "recoverTransaction",
    transactionId: "txn-cross-run-durable",
    action: "resume"
  })

  assert.deepEqual(completionInputs, [
    { workspaceRoot: WORKSPACE_ROOT, runId: transactionRunId },
    { workspaceRoot: WORKSPACE_ROOT, runId: RUN_ID }
  ])
  assert.equal(completionToken, transactionToken)
  assert.equal(fixture.calls.filter(([name]) => name === "loadState").length, 1)

  await panel.emitMessage({ type: "close" })
  assert.deepEqual(await promise, { status: "closed", runId: RUN_ID })
})

test("a recovered GUI result is not observable until the real workspace lock is released", async (t) => {
  const root = await temporaryWorkspace(t)
  const fake = createFakeVscode()
  const fixture = hostDependencies({
    withRuleApplyWorkspaceLock: require("../out/ruleAuthoring/ruleApplyTransaction")
      .withRuleApplyWorkspaceLock,
    recoverCommittedRuleAuthoringApply: async () => ({
      status: "recovered",
      runId: RUN_ID,
      transactionId: "txn-recovered-before-result"
    })
  })
  const gui = loadGui(fake.vscode)
  const host = gui.createRuleProposalTriageGuiHost(fixture.dependencies)
  const result = await host.openRuleProposalTriageGui({ subscriptions: [] }, {
    workspaceRoot: root,
    runId: RUN_ID
  })

  assert.equal(result.status, "applied")
  assert.equal(await require("../out/ruleAuthoring/ruleApplyTransaction")
    .withRuleApplyWorkspaceLock(root, "post-recovery-probe", async () => "released"), "released")
})
