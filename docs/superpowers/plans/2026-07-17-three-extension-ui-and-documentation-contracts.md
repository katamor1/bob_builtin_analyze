# Three Extension UI and Documentation Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate the three extensions into one Operation Hub, one three-mode Builder, and one primary review GUI per review extension; expose exactly five public commands; and enforce matching manifest/runtime/document/Extension Host contracts.

**Architecture:** Work from the inside out in eight reviewable changes. First collapse workflow run and authoring surfaces, then make each review GUI own its stage router, then lock the public command contract, documentation facts, and cross-platform Extension Host evidence. Existing engines, services, stores, validators, and safe-write primitives remain behind the new routes.

**Tech Stack:** TypeScript, VS Code Extension/Webview API, Node.js built-in test runner, existing extension package scripts, GitHub Actions, Markdown.

## Global Constraints

- Compatibility is level C: delete obsolete duplicate Command IDs, View IDs, and screens; do not add aliases for duplicate public entry points.
- Exactly five Command Palette entries are always visible, with the exact labels in Task 5.
- The five labels are exactly `Bob: 操作ハブを開く`, `Bob Workflow: ワークフローを作成・編集`, `Bob Bazaar Review: レビューを開始`, `Bob Bazaar Review: 資料からプロジェクト規約を作成`, and `Bob Code Consistency Review: 整合プレレビューを開始`.
- Workflow-invoked commands remain registered but hidden with `when: "false"`.
- `OperationHubProvider` is panel-only; `workflowRegister.runs`, `WorkflowRunControlView`, and the duplicate run status bar are deleted.
- Builder has exactly three modes: empty workflow, standard template, and existing workflow edit.
- Bazaar and Code Consistency each publish one primary review GUI; capture/triage/results/traceability route inside it.
- Optional extensions stay soft dependencies. Missing optional extensions cannot break activation.
- Preserve preview, explicit confirmation, backup, transactional/conflict-checked save behavior.
- Preserve engine/provider/artifact and `run.json` contracts.
- Production changes require a focused failing regression test first.
- Use the actual scripts from each extension `package.json`; do not invent a root npm script.
- Each task ends with focused verification, `git diff --check`, and a commit.

---

## Task 1: Consolidate Operation Hub and Runs/status-bar surfaces

**Files:**

- Modify: `extensions/workflow-register/package.json`
- Modify: `extensions/workflow-register/src/extension.ts`
- Modify: `extensions/workflow-register/src/extensionWithAuthoring.ts`
- Modify: `extensions/workflow-register/src/gui/operationHubProvider.ts`
- Modify: `extensions/workflow-register/src/gui/operationHubModel.ts`
- Modify: `extensions/workflow-register/src/gui/operationHubHtml.ts`
- Delete: `extensions/workflow-register/src/commands/runControlView.ts`
- Delete: `extensions/workflow-register/test/runControlViewReuseProvenance.test.js`
- Delete: `extensions/workflow-register/test/workflowRunStateReadOnlyView.test.js`
- Modify: `extensions/workflow-register/test/operationHub.test.js`
- Modify: `extensions/workflow-register/test/operationHubAutoRefresh.test.js`
- Modify: `extensions/workflow-register/test/workflowRegister.test.js`

**Interfaces:**

- `workflowRegister.openOperationHub(input?)` creates/reveals the one `Bob 操作ハブ` panel.
- `OperationHubProvider` remains the owner of run file watchers, model refresh, mutation serialization, and panel lifecycle, but no longer implements `WebviewViewProvider`.
- `OperationHubExtensionStatus` gains a reason usable by disabled integration actions:

```ts
interface OperationHubExtensionStatus {
  id: string
  label: string
  available: boolean
  unavailableReason?: string
}
```

**Run-contract boundary:** Run engine/provider/artifact/`run.json` contracts are out of scope; this task changes only UI projection and routing.

- [ ] **Step 1: RED-test the panel-only contribution**

Change `operationHub.test.js` to require:

```js
assert.equal(packageJson.contributes.views?.explorer?.length ?? 0, 0)
assert.equal(packageJson.activationEvents.includes("onView:workflowRegister.operationHub"), false)
assert.equal(packageJson.activationEvents.includes("onView:workflowRegister.runs"), false)
assert.doesNotMatch(core, /registerWebviewViewProvider/)
assert.doesNotMatch(core, /workflowRegister\.openOperationHubPanel/)
assert.match(core, /registerCommand\("workflowRegister\.openOperationHub"[\s\S]*operationHub\.open/)
```

Assert the panel view type/title are `workflowRegisterOperationHub` and `Bob 操作ハブ`, and HTML contains `実行状況` rather than the retired English run heading.

- [ ] **Step 2: RED-test duplicate removal and unavailable reasons**

Assert package/source contain neither the removed Runs view nor `refreshRunsView`, `createStatusBarItem`, or `WorkflowRunControlView`. Move retained run provenance/read-only assertions to `operationHub.test.js`.

Build a model with unavailable Bazaar/Consistency extensions and assert their actions are disabled with exact nonempty reasons, while ordinary workflow actions remain enabled.

Run:

```bash
cd extensions/workflow-register
npm run compile
node --test test/operationHub.test.js test/operationHubAutoRefresh.test.js test/workflowRegister.test.js
```

Expected: FAIL on current Explorer/dual-panel/Runs/status-bar behavior.

- [ ] **Step 3: Make `OperationHubProvider` panel-only**

Remove view fields/methods and compact layout. Keep one retained panel and implement:

```ts
async open(input?: unknown): Promise<void> {
  this.applyOpenInput(input)
  const panel = this.ensurePanel()
  panel.reveal(vscode.ViewColumn.One)
  await this.refreshPanel()
}
```

`refreshFromCommand()` refreshes the existing panel or calls `open()`. Remove the `openOperationHubPanel` action/message/button and rename all user-facing headings to the approved Japanese terms.

- [ ] **Step 4: Delete Runs/status wiring and guard optional actions**

Remove package activation/view/menu entries, wrapper construction/registration, the two obsolete view test files, and `runControlView.ts`. Keep run command handlers used by Operation Hub/workflows.

Resolve optional extension status through `vscode.extensions.getExtension()`. Build disabled integration actions with `unavailableReason`; reject disabled-action messages host-side instead of invoking a missing command.

- [ ] **Step 5: Verify and commit**

```bash
cd extensions/workflow-register
npm run compile
node --test test/operationHub*.test.js test/workflowRegister.test.js test/registrationWiring.test.js
npm run architecture:policy
npm run source:policy
git diff --check
git add package.json src test
git commit -m "refactor: consolidate workflow run surfaces"
```

Expected: focused tests/policies PASS; no Runs view/status bar; hub run actions/artifacts remain covered.

## Task 2: Consolidate Builder and Template Studio into the three-mode panel

**Files:**

- Modify: `extensions/workflow-register/package.json`
- Modify: `extensions/workflow-register/src/extensionWithAuthoring.ts`
- Modify: `extensions/workflow-register/src/commands/openWorkflowBuilder.ts`
- Modify: `extensions/workflow-register/src/commands/editWorkflowInBuilder.ts`
- Modify: `extensions/workflow-register/src/webview/workflowBuilderPanel.ts`
- Modify: `extensions/workflow-register/src/webview/workflowBuilderHtml.ts`
- Modify the Builder client/style modules returned by:

```bash
rg --files extensions/workflow-register/src/webview | rg 'workflowBuilder'
```

- Reuse unchanged where possible: `extensions/workflow-register/src/template/templateGenerator.ts`, `templateValidation.ts`, `templateReadiness.ts`, `templateStudioModel.ts`
- Delete: `extensions/workflow-register/src/commands/openTemplateCustomizationStudio.ts`
- Delete: `extensions/workflow-register/src/webview/templateCustomizationStudioPanel.ts`
- Delete standalone Template Studio HTML/client/style files after logic is routed through Builder.
- Modify: `extensions/workflow-register/test/templateCustomizationStudio.test.js`
- Modify: `extensions/workflow-register/test/workflowBuilderTransactionalSave.test.js`
- Modify: `extensions/workflow-register/test/workflowBuilderWebviewModules.test.js`
- Modify: `extensions/workflow-register/test/workflowRegister.test.js`

**Interfaces:**

```ts
type WorkflowBuilderMode = "empty" | "standard-template" | "edit"

interface WorkflowBuilderPanelOptions {
  extensionUri: vscode.Uri
  workflowRoot: string
  sourceId: string
  mode: WorkflowBuilderMode
  // existing edit/session fields remain
}
```

**Run-contract boundary:** Run engine/provider/artifact/`run.json` contracts are out of scope; standard-template mode changes authoring routes only.

- [x] **Step 1: RED-test exactly three modes and one panel**

Assert Builder renders selectors labeled `空のワークフロー`, `標準テンプレートから作成`, and `既存ワークフローを編集`; no fourth mode exists. Assert all modes reuse view type `workflowRegisterBuilder` and title `ワークフロー作成・編集`.

Assert package/source no longer contributes/registers `bobTemplate.openCustomizationStudio`, and no code creates `bobTemplateCustomizationStudio`.

- [x] **Step 2: RED-test safety parity**

Extend transactional tests so standard-template output:

- validates before save;
- previews/diffs through Builder;
- requires explicit overwrite confirmation;
- creates an exclusive backup before replacement;
- cancels with no target change; and
- stays inside the existing per-target save queue/stale-session guard.

Run:

```bash
cd extensions/workflow-register
npm run compile
node --test test/templateCustomizationStudio.test.js test/workflowBuilderTransactionalSave.test.js test/workflowBuilderWebviewModules.test.js
```

Expected: FAIL because Template Studio is independent and Builder has only create/edit semantics.

- [x] **Step 3: Add the mode router and integrate template logic**

`openWorkflowBuilder()` opens the retained panel at its mode chooser. `editWorkflowInBuilder()` routes the same panel to `edit`. Move Template Studio host message handling into Builder and call existing template model/generator/validator/readiness functions. Template generation updates the active in-memory authoring session; it never writes directly.

- [x] **Step 4: Remove the standalone panel/command**

Delete its activation/contribution/registration and panel assets. Keep non-GUI `bobTemplate.validate*`, `generateWorkflow`, and `checkReadiness` commands registered because workflows may invoke them; Task 5 hides them.

- [x] **Step 5: Verify and commit**

```bash
cd extensions/workflow-register
npm run compile
node --test test/template*.test.js test/workflowBuilder*.test.js test/workflowAuthoring*.test.js test/workflowRegister.test.js
npm run schema:policy
git diff --check
git add package.json src test
git commit -m "refactor: unify workflow authoring panels"
```

Expected: exactly three modes, one panel, and all preview/backup/transaction regressions PASS.

## Task 3: Consolidate Bazaar primary GUI routes and review-results terminology

**Files:**

- Modify: `extensions/bob-bazaar-review/package.json`
- Modify: `extensions/bob-bazaar-review/src/extension.ts`
- Modify: `extensions/bob-bazaar-review/src/ui/reviewGui.ts`
- Modify: `extensions/bob-bazaar-review/src/ui/reviewGuiHtml.ts`
- Modify: `extensions/bob-bazaar-review/src/ui/reviewGuiHtmlAssets.ts`
- Refactor for embedded stages: `src/ui/resultCaptureGui.ts`, `humanTriageGui.ts`, `campaignDashboardGui.ts` and their HTML renderers
- Modify: `extensions/bob-bazaar-review/test/guiFirstSurfaces.test.js`
- Modify: `extensions/bob-bazaar-review/test/reviewGuiHtml.test.js`
- Modify: `extensions/bob-bazaar-review/test/campaignDashboardGui.test.js`
- Modify: `extensions/bob-bazaar-review/test/reviewRunV3Acceptance.test.js`

**Interfaces:**

```ts
type BazaarReviewStage =
  | "review"
  | "review-result-capture"
  | "triage"
  | "review-results"
```

The retained controller owns one panel, active Review Run identity, stage model, and `showStage(stage)`.

**Run-contract boundary:** Run engine/provider/artifact/`run.json` contracts are out of scope; Review Run services/schemas remain unchanged.

- [x] **Step 1: RED-test a single stage-routed panel**

Assert `openReviewGui`, capture, triage, and results all render under view type `bobBazaarReviewGui`; only `openBazaarReviewGui()` calls `createWebviewPanel`. Assert stage labels are `レビュー結果取り込み`, `指摘確認・振り分け`, and `レビュー実績`.

Assert the package no longer contributes/activates/registers standalone dashboard/capture/triage GUI commands.

- [x] **Step 2: Run RED**

```bash
cd extensions/bob-bazaar-review
npm run compile
node --test test/guiFirstSurfaces.test.js test/reviewGuiHtml.test.js test/campaignDashboardGui.test.js test/reviewRunV3Acceptance.test.js
```

Expected: FAIL because four panel factories/public routes exist.

- [x] **Step 3: Move stage ownership into the review controller**

Extract the existing standalone controllers into stage services/renderers that accept active panel/context. Replace `executeCommand()` hops with `showStage()`. Preserve Review Run validation, exact review ID, capture validation, triage decisions/metrics/finalization, dashboard aggregation/export, and message allowlists.

- [x] **Step 4: Delete duplicate public routes and migrate terminology**

Remove standalone command registrations/contributions only after all callers route to `showStage()`. Replace user-facing Campaign Dashboard/Result Capture/Human Triage strings with approved terms. Keep internal data/module names where technically useful.

- [x] **Step 5: Verify and commit**

```bash
cd extensions/bob-bazaar-review
npm run compile
node --test test/guiFirstSurfaces.test.js test/reviewGui*.test.js test/resultCaptureCore.test.js test/reviewTriageDecision.test.js test/campaignDashboard*.test.js test/reviewRun*.test.js
npm run architecture:policy
npm run source:policy
git diff --check
git add package.json src test
git commit -m "refactor: route Bazaar review stages through one GUI"
```

## Task 4: Consolidate Code Consistency GUI routes and initialization

**Files:**

- Modify: `extensions/bob-code-consistency-review/package.json`
- Modify: `extensions/bob-code-consistency-review/src/extension.ts`
- Modify: `extensions/bob-code-consistency-review/src/webview/consistencyReviewWizard.ts`
- Modify: `extensions/bob-code-consistency-review/src/webview/consistencyReviewWizardHtml.ts`
- Refactor for embedded stages: `consistencyResultCapture.ts`, `consistencyHumanTriage.ts`, `traceabilityPrepWebview.ts` and related render/assets modules
- Reuse: `extensions/bob-code-consistency-review/src/workspaceInitializer.ts`
- Reuse: `extensions/bob-code-consistency-review/src/commands/workspaceCommands.ts`
- Modify: `extensions/bob-code-consistency-review/test/guiFirstSurfaces.test.js`
- Modify: `extensions/bob-code-consistency-review/test/traceabilityPrepWebview.test.js`
- Modify: `extensions/bob-code-consistency-review/test/humanTriageWebviewLifecycle.test.js`
- Modify: `extensions/bob-code-consistency-review/test/notificationBehavior.test.js`

**Interfaces:**

```ts
type ConsistencyReviewStage =
  | "review"
  | "traceability"
  | "review-result-capture"
  | "triage"
```

**Run-contract boundary:** Run engine/provider/artifact/`run.json` contracts are out of scope; preprocessing, triage, traceability, and initialization persistence contracts remain unchanged.

- [x] **Step 1: RED-test the single primary GUI and init button**

Assert only `openConsistencyReviewWizard()` creates a panel; all stages share view type `bobCodeConsistencyReviewWizard`. Assert approved stage labels and an `initializeWorkspace` action/button exist.

Assert standalone capture/triage commands are absent. Assert `bobCodeConsistency.initializeWorkspace` remains registered for workflows but is not expected as a public palette entry.

- [x] **Step 2: RED-test exact initialization writes**

Keep/add regressions proving:

```js
assert.equal(existingReviewInputAfter, existingReviewInputBefore)
assert.equal(reviewInputResult.status, "unchanged")
assert.ok(reviewInputResult.backupPath)
assert.equal(updatedWorkflow, bundledWorkflow)
assert.ok(workflowResult.backupPath)
```

Run:

```bash
cd extensions/bob-code-consistency-review
npm run compile
node --test test/guiFirstSurfaces.test.js test/traceabilityPrepWebview.test.js test/humanTriageWebviewLifecycle.test.js test/notificationBehavior.test.js
```

Expected: FAIL on independent panels and missing primary-GUI initialization route.

- [x] **Step 3: Add primary-panel stage routing**

Move capture/triage/traceability controllers to stage renderers owned by the primary controller. Preserve triage source hash/revision checks, Webview disposal guards, traceability original/restore/save semantics, output validation, and CSP/message validation.

- [x] **Step 4: Route initialization from the GUI**

The button invokes the existing initialization service with selected workspace. Report workflow backup and review-input backup separately. Keep `initializeWorkspace` registered for workflows; Task 5 hides it.

- [x] **Step 5: Verify and commit**

```bash
cd extensions/bob-code-consistency-review
npm run compile
node --test test/guiFirstSurfaces.test.js test/traceability*.test.js test/humanTriage*.test.js test/reviewOutputTriage.test.js test/notificationBehavior.test.js
npm run architecture:policy
npm run source:policy
git diff --check
git add package.json src test
git commit -m "refactor: route consistency review through one GUI"
```

## Task 5: Enforce exactly five visible commands and remove obsolete live IDs/views

**Files:**

- Modify all three extension `package.json` files
- Modify all three composition roots and the affected hub/workflow templates/tests reported by the exact live-reference contract in Step 2. The contract prints the path, line, and exact obsolete identifier for each migration; do not use a prefix search to build this file list.
- Modify: each extension's `test/commandPalettePolicy.test.js`
- Create: `scripts/three-extension-command-surface.test.js`

**Run-contract boundary:** Run engine/provider/artifact/`run.json` contracts are out of scope; this task changes contributions/registrations/references only.

- [ ] **Step 1: Write the cross-extension RED contract**

Assert visible entries (`when !== "false"`) equal exactly:

```js
[
  ["workflowRegister.openOperationHub", "Bob", "操作ハブを開く"],
  ["workflowRegister.openWorkflowBuilder", "Bob Workflow", "ワークフローを作成・編集"],
  ["bobBazaar.openReviewGui", "Bob Bazaar Review", "レビューを開始"],
  ["bobBazaar.authorProjectRulesFromDocuments", "Bob Bazaar Review", "資料からプロジェクト規約を作成"],
  ["bobCodeConsistency.openReviewWizard", "Bob Code Consistency Review", "整合プレレビューを開始"]
]
```

For every other contributed command require `{ command, when: "false" }`, and prove representative bundled-workflow commands still have activation/contribution/runtime registration.

- [ ] **Step 2: RED-test obsolete references**

Build the exact obsolete identifiers from string fragments inside the test (so the policy test does not itself create a live match) and classify them by kind:

```js
const obsolete = {
  viewIds: [
    ["workflowRegister", "operationHub"].join("."),
    ["workflowRegister", "runs"].join(".")
  ],
  generatedViewCommands: [
    ["workflowRegister", "operationHub", "focus"].join("."),
    ["workflowRegister", "runs", "focus"].join(".")
  ],
  panelTypes: [["workflowRegister", "operationHubPanel"].join(".")],
  commandIds: [
    ["workflowRegister", "openOperationHubPanel"].join("."),
    ["workflowRegister", "refreshRunsView"].join("."),
    ["bobTemplate", "openCustomizationStudio"].join("."),
    ["bobBazaar", "openCampaignDashboard"].join("."),
    ["bobBazaar", "openResultCaptureGui"].join("."),
    ["bobBazaar", "openHumanTriageGui"].join("."),
    ["bobCodeConsistency", "openResultCaptureGui"].join("."),
    ["bobCodeConsistency", "openHumanTriageGui"].join(".")
  ]
}
```

Parse manifest command/view/activation fields structurally and compare extracted IDs by equality. For source, tests, workflow templates, scripts, and workflow YAML, compare complete string-literal or context-expression tokens, with both `.` and `-` treated as identifier characters. Never treat an obsolete ID as a substring prefix. Scan live files only: the three manifests, `src/`, current `test/`, `docs/workflows/`, `scripts/`, and `.github/workflows/`; documentation history is owned by Task 6.

Add positive regressions for every exact obsolete ID and negative regressions proving these retained configuration references do not match:

```js
const obsoleteRunsView = ["workflowRegister", "runs"].join(".")
assert.equal(findObsoleteId(obsoleteRunsView), obsoleteRunsView)
assert.equal(findObsoleteId(`view == ${obsoleteRunsView}`), obsoleteRunsView)
assert.equal(findObsoleteId("workflowRegister.runs.retention.enabled"), undefined)
assert.equal(findObsoleteId('getConfiguration("workflowRegister.runs.retention")'), undefined)
```

Run:

```bash
node --test scripts/three-extension-command-surface.test.js
```

Expected: FAIL because current manifests expose many commands and obsolete IDs remain.

- [ ] **Step 3: Rewrite palettes and migrate live callers**

Set exact category/title pairs for the five public commands. Add `when: "false"` menu entries for registered workflow commands. Delete fully duplicate contributions/activation events/registrations and migrate hub/templates/tests to canonical routes.

- [ ] **Step 4: Verify and commit**

```bash
node --test scripts/three-extension-command-surface.test.js
for extension in workflow-register bob-bazaar-review bob-code-consistency-review; do
  (cd "extensions/$extension" && npm run compile && node --test test/commandPalettePolicy.test.js)
done
git diff --check
git add extensions scripts/three-extension-command-surface.test.js docs/workflows
git commit -m "feat: define five public extension commands"
```

## Task 6: Synchronize current documents and add the documentation contract

**Files:**

- Modify every current Markdown document reported by the recursive classification contract, including `extensions/README.md`, the three extension READMEs, all three extension-local `docs/` trees, and repository-level `docs/`.
- Modify historical documents reported by that same contract only to add an explicit superseded/replaced notice when they retain an obsolete reference.
- Create: `scripts/three-extension-documentation-contract.json`
- Create: `scripts/three-extension-documentation-contract.test.js`

**Run-contract boundary:** Run engine/provider/artifact/`run.json` contracts are out of scope; documents describe preserved behavior without changing it.

- [ ] **Step 1: Define one recursive current/history classification**

Create repository-maintained metadata with this shape:

```json
{
  "schemaVersion": 1,
  "roots": [
    "extensions/README.md",
    "extensions/workflow-register/README.md",
    "extensions/workflow-register/docs",
    "extensions/bob-bazaar-review/README.md",
    "extensions/bob-bazaar-review/docs",
    "extensions/bob-code-consistency-review/README.md",
    "extensions/bob-code-consistency-review/docs",
    "docs"
  ],
  "historicalDocuments": []
}
```

Recursively discover every `*.md` file below directory roots and include exact file roots. An exact, repository-relative entry in `historicalDocuments` classifies that file as historical; every other discovered file is current. Reject duplicate roots/history entries, missing history entries, paths outside a configured root, symlink escapes, and discovered files that receive anything other than exactly one resulting class. This metadata and test are the only documentation classification source used by this task and Task 8; adding a future historical document requires an explicit metadata entry, so an unlisted new document defaults safely to current.

Review every discovered document and populate `historicalDocuments` rather than relying on filename dates. Lock the review-sensitive examples explicitly:

```js
assert.equal(classification.get("extensions/bob-code-consistency-review/docs/triage-integrity-ibm-bob-uat-runbook-ja.md"), "current")
assert.equal(classification.get("extensions/bob-bazaar-review/docs/review-run-v3-iteration1-ja.md"), "historical")
assert.equal(classification.get("extensions/bob-bazaar-review/docs/review-run-v3-iteration2-ja.md"), "historical")
assert.equal(classification.get("extensions/bob-bazaar-review/docs/review-run-v3-iteration3-dashboard-ja.md"), "historical")
```

- [ ] **Step 2: Write the RED manifest/runtime/document test**

Read all three manifests, composition roots, current docs, Bazaar template refresh/MCP modules, and Code Consistency initializer. Assert the exact documentation table from the approved design, including:

- `./out/extensionWithAuthoring.js` vs `./out/extension.js` mains;
- no required `extensionDependencies` and soft IBM Bob/workflow-register language;
- Bazaar diff preview -> confirmation -> backup -> update, cancel/no-change;
- Code Consistency different-workflow backup/update;
- existing `review-input.yaml` unchanged with backup only;
- Bazaar operations read-only, only opted-in `project_rules_init` write;
- `BOB_BAZAAR_ENABLE_WRITE_TOOLS=1` plus allowed root; and
- `.bob/mcp.json` VS Code configuration update distinct from an MCP tool write.

- [ ] **Step 3: RED-test the classification-aware reference policy**

Use the exact obsolete View-ID/command matcher from Task 5 semantics: structured equality where fields are structured, otherwise a complete identifier token with `.` and `-` counted as identifier characters. Add the same retained-settings negative fixtures, so `workflowRegister.runs.retention.*` and `getConfiguration("workflowRegister.runs.retention")` remain valid and never require a configuration rename. Match obsolete user-facing labels as complete configured phrases, not generic words such as `runs`, `capture`, or `triage`.

Apply one policy to the recursive classification from Step 1:

- current documents must contain zero exact obsolete identifiers or obsolete user-facing phrases; and
- historical documents may retain them only when a top-level `Superseded:` or `Replaced:` notice names the canonical replacement route for every obsolete reference class present in that file.

Do not maintain a second hand-selected document list and do not exclude plans/specs/evidence from classification. Replacement tables in approved plans count only when the document is explicitly classified historical and has the required top-level notice.

- [ ] **Step 4: Run RED**

```bash
node --test scripts/three-extension-documentation-contract.test.js
```

Expected: FAIL on current drift, including the obsolete Code Consistency UAT runbook labels, and on missing notices in the three Bazaar iteration documents and any other classified history with obsolete references.

- [ ] **Step 5: Synchronize current documents and mark history**

Update every current file reported by the contract, including extension-local runbooks/design notes outside the four canonical specs. Use the approved terminology and exact facts; do not claim UAT not run. Add concise notices to historical files rather than rewriting historical evidence. Make unit specs name automated contract cases and real-machine specs name Linux/Windows panel/command/manual visual gates.

- [ ] **Step 6: Verify and commit**

```bash
node --test scripts/three-extension-command-surface.test.js scripts/three-extension-documentation-contract.test.js
git diff --check
git add extensions/README.md extensions/*/README.md extensions/*/docs scripts/three-extension-documentation-contract.json scripts/three-extension-documentation-contract.test.js docs
git commit -m "docs: synchronize extension surface contracts"
```

## Task 7: Extend Linux/Windows Extension Host contract and smoke coverage

**Files:**

- Modify: `scripts/extension-host-smoke.test.js`
- Modify: `scripts/extension-host-smoke-contract.test.js`
- Create: `scripts/three-extension-surface-extension-host.test.js`
- Create fixture README files under each extension's `test/fixtures/gui-surface-workspace/` when no existing smoke workspace is suitable.
- Modify: `.github/workflows/extensions-quality.yml`

**Run-contract boundary:** Run engine/provider/artifact/`run.json` contracts are out of scope; smoke invokes registrations/panel opens, not execution semantics.

- [ ] **Step 1: RED-test Linux/Windows wiring**

Require Ubuntu jobs and Windows matrix entries to provide public-command, hidden-command, primary-panel, and workspace expectations. Assert the same extra test file runs on both platforms.

Run:

```bash
node --test scripts/extension-host-smoke-contract.test.js
```

Expected: FAIL because the consolidated-surface extra test and Linux/Windows environment wiring do not exist.

- [ ] **Step 2: Implement Extension Host surface assertions**

After activation, query `vscode.commands.getCommands(true)` and assert all five public IDs exist across the matrix and representative hidden workflow commands exist in their owning extension. Invoke each extension's primary-panel command and wait for exact view types/titles:

```js
[
  ["workflowRegister.openOperationHub", "workflowRegisterOperationHub", "Bob 操作ハブ"],
  ["workflowRegister.openWorkflowBuilder", "workflowRegisterBuilder", "ワークフロー作成・編集"],
  ["bobBazaar.openReviewGui", "bobBazaarReviewGui", "Bazaar レビュー"],
  ["bobCodeConsistency.openReviewWizard", "bobCodeConsistencyReviewWizard", "整合プレレビュー"]
]
```

Close opened tabs and assert no unhandled rejection. Verify the document-backed Bazaar authoring command is registered without forcing an interactive file picker.

- [ ] **Step 3: Verify local contract and commit**

```bash
node --test scripts/extension-host-smoke-contract.test.js
git diff --check
git add .github/workflows/extensions-quality.yml scripts extensions/*/test/fixtures/gui-surface-workspace
git commit -m "test: cover consolidated extension surfaces"
```

Hosted acceptance: all three Ubuntu extension jobs and every Windows matrix entry pass at the same SHA.

## Task 8: Run cross-extension and repository acceptance gates

**Files:**

- No product changes. Record failures and return to the owning task; do not patch during this gate without a new RED test.

**Run-contract boundary:** Run engine/provider/artifact/`run.json` contracts are out of scope; failures there are investigated as regressions, not accepted route changes.

- [ ] **Step 1: Run repository contracts**

```bash
node --test \
  scripts/three-extension-command-surface.test.js \
  scripts/three-extension-documentation-contract.test.js \
  scripts/extension-host-smoke-contract.test.js
```

- [ ] **Step 2: Run each extension's compile/policy/unit gates**

```bash
for extension in workflow-register bob-bazaar-review bob-code-consistency-review; do
  (
    cd "extensions/$extension"
    npm run compile
    npm run dependency:policy
    npm run architecture:policy
    npm run source:policy
    npm test
  )
done
```

Then run extension-specific policies actually present:

```bash
(cd extensions/workflow-register && npm run schema:policy && npm run unused:report && npm run audit:prod)
(cd extensions/bob-bazaar-review && npm run unused:report && npm run unused:policy && npm run artifact:policy && npm run audit:prod)
(cd extensions/bob-code-consistency-review && npm run unused:report && npm run audit:prod)
```

- [ ] **Step 3: Package and enforce package policy**

```bash
for extension in workflow-register bob-bazaar-review bob-code-consistency-review; do
  (cd "extensions/$extension" && npm run package && npm run package:policy)
done
(cd extensions/bob-bazaar-review && npm run package:smoke && npm run package:metrics)
```

- [ ] **Step 4: Run whole-repository acceptance scans**

```bash
node scripts/check-github-actions-pins.js
node --test scripts/three-extension-command-surface.test.js scripts/three-extension-documentation-contract.test.js
git diff --check
git status --short
```

Expected: SHA scan PASS; the command-surface contract reports zero exact obsolete identifiers in live code without flagging retained settings; the documentation contract reports zero obsolete references in current documents and accepts historical occurrences only with explicit replacement notices; diff check exits 0; status contains only intended changes/generated VSIX files already ignored by policy.

- [ ] **Step 5: Confirm hosted Extension Host and commit evidence**

Require same-head Linux/Windows `extensions-quality` success covering activation, five public commands, primary panels, hidden commands, unit/package/package-policy. If evidence documentation is added, commit it separately:

```bash
git add docs/release-evidence
git commit -m "docs: record consolidated extension quality gates"
```

## Final acceptance checklist

- [ ] Exactly five visible labels match the approved list byte-for-byte.
- [ ] Hub/Builder each have one panel; no duplicate Explorer view/status bar exists.
- [ ] Bazaar/Consistency each own one primary review GUI and internal stages.
- [ ] Optional extensions remain soft and unavailable actions explain why.
- [ ] No obsolete live reference remains; historical references carry notices.
- [ ] Documentation and immutable-SHA contracts pass.
- [ ] All compile/policy/unit/package/package-policy commands pass.
- [ ] Linux/Windows Extension Host gates pass at the same head.
