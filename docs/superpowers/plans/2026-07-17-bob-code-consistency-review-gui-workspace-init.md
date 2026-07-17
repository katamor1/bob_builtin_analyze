# Bob Code Consistency Review GUI Workspace Initialization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consistency Review Wizard に、canonical workflow が未配置の場合だけ表示される `.bob` 初期化カードを追加し、既存 initializer command を安全に一度だけ実行して正式なコード整合プレレビュー準備へ進めるようにする。

**Architecture:** `workspaceInitializer.ts` が read-only の初期化状態 contract を提供し、Wizard controller がその状態を model に投影する。Webview は model だけから条件付きカードを描画し、host controller は allowlist 済み action、既存 command、controller-local single-flight、実行後の filesystem 再読込を組み合わせる。書き込み契約は既存 `bobCodeConsistency.initializeWorkspace` に集約したままにする。

**Tech Stack:** TypeScript 5.x、VS Code Extension API 1.106、Node.js `fs/promises`、Node built-in test runner、CommonJS test harness、既存 CSP-safe Webview renderer。

## Global Constraints

- Approved design `docs/superpowers/specs/2026-07-17-bob-code-consistency-review-gui-workspace-init-design.md` を実装の正本とする。
- Canonical workflow path は `.bob/workflows/code-consistency-review/WORKFLOW.md` のまま変更しない。
- 初期化済み判定は canonical workflow が通常ファイルとして存在することだけに限定する。`review-input.yaml` の有無や template 内容の一致は表示条件に含めない。
- 状態取得処理は read-only とし、directory、file、backup、placeholder、`.gitignore` を作成・更新しない。
- GUI 専用の書き込み処理を追加せず、`bobCodeConsistency.initializeWorkspace` を `{ workspaceRoot }` 付きで再利用する。
- 既存 workflow backup/update、`review-input.yaml` non-overwrite、placeholder、generated-artifact `.gitignore` の契約を変更しない。
- 初期化成功の正本は command result ではなく、command 完了後に再取得した filesystem status とする。
- Webview は CSP nonce、`data-action` event delegation、host-side action allowlist、inline handler 禁止を維持する。
- 同じ Wizard controller からの初期化は host-side single-flight により同時に1回だけ実行する。process-wide coordinator は追加しない。
- `bob-bazaar-review`、`workflow-register`、command ID、configuration key、workflow schema、review-input schema を変更しない。
- 新しい runtime または development dependency を追加しない。
- Production code の変更前に focused regression を追加し、RED を確認してから最小実装を行う。
- Base revision で確認済みの `externalProcessRunner.test.js` timing flake は本変更の範囲外とし、focused tests、逐次 full suite、policy、package gate を合否の根拠にする。

---

### Task 1: Read-only workspace initialization status contract

**Files:**

- Modify: `extensions/bob-code-consistency-review/src/workspaceInitializer.ts`
- Create: `extensions/bob-code-consistency-review/test/workspaceInitializationStatus.test.js`

**Interfaces:**

- Export: `CODE_CONSISTENCY_WORKFLOW_RELATIVE_PATH`。
- Export: `CodeConsistencyWorkspaceInitializationStatus`。
- Export: `getCodeConsistencyWorkspaceInitializationStatus(workspaceRoot: string): Promise<CodeConsistencyWorkspaceInitializationStatus>`。
- Preserve: `initializeCodeConsistencyWorkspace(options)` and `InitializeCodeConsistencyWorkspaceResult` without shape or behavior changes。

- [ ] **Step 1: Add the failing status regression**

`workspaceInitializationStatus.test.js` は `privacyArtifacts.test.js` と同じ `Module._load` pattern で `vscode` を空 object に差し替え、temporary workspace を test ごとに削除する。次の3状態を同じ canonical path に対して固定する。

```js
const missing = await getCodeConsistencyWorkspaceInitializationStatus(workspaceRoot)
assert.equal(missing.initialized, false)
assert.equal(missing.workflowPath, path.join(workspaceRoot, ".bob", "workflows", "code-consistency-review", "WORKFLOW.md"))
assert.deepEqual(missing.missing, [".bob/workflows/code-consistency-review/WORKFLOW.md"])
assert.equal(fs.existsSync(path.join(workspaceRoot, ".bob")), false, "status lookup must not initialize the workspace")

fs.mkdirSync(missing.workflowPath, { recursive: true })
const directory = await getCodeConsistencyWorkspaceInitializationStatus(workspaceRoot)
assert.equal(directory.initialized, false, "a directory at the canonical file path is not initialized")

fs.rmSync(missing.workflowPath, { recursive: true })
fs.writeFileSync(missing.workflowPath, "# workflow\n", "utf8")
const present = await getCodeConsistencyWorkspaceInitializationStatus(workspaceRoot)
assert.equal(present.initialized, true)
assert.deepEqual(present.missing, [])
```

- [ ] **Step 2: Verify RED**

Run:

```bash
cd extensions/bob-code-consistency-review
npm run compile
node --test test/workspaceInitializationStatus.test.js
```

Expected: compile succeeds and the focused test fails because `getCodeConsistencyWorkspaceInitializationStatus` is not exported.

- [ ] **Step 3: Implement the shared path and read-only status helper**

Rename the private workflow path constant and use the exported value in the existing initializer:

```ts
export const CODE_CONSISTENCY_WORKFLOW_RELATIVE_PATH = path.join(
  ".bob",
  "workflows",
  "code-consistency-review",
  "WORKFLOW.md"
)

export interface CodeConsistencyWorkspaceInitializationStatus {
  initialized: boolean
  workflowPath: string
  missing: string[]
}
```

Implement status lookup with `fs.lstat()` so a symlink or directory does not count as a normal workflow file. Any lookup failure is represented as uninitialized rather than mutating the workspace or aborting Wizard startup.

```ts
export async function getCodeConsistencyWorkspaceInitializationStatus(
  workspaceRoot: string
): Promise<CodeConsistencyWorkspaceInitializationStatus> {
  const workflowPath = path.join(workspaceRoot, CODE_CONSISTENCY_WORKFLOW_RELATIVE_PATH)
  let initialized = false
  try {
    initialized = (await fs.lstat(workflowPath)).isFile()
  } catch {
    initialized = false
  }
  return {
    initialized,
    workflowPath,
    missing: initialized
      ? []
      : [path.relative(workspaceRoot, workflowPath).replace(/\\/g, "/")]
  }
}
```

Change only the existing initializer's path construction:

```ts
const workflowPath = path.join(options.workspaceRoot, CODE_CONSISTENCY_WORKFLOW_RELATIVE_PATH)
```

- [ ] **Step 4: Verify GREEN and initializer compatibility**

Run:

```bash
npm run compile
node --test test/workspaceInitializationStatus.test.js test/privacyArtifacts.test.js
```

Expected: all focused tests pass; privacy initializer coverage still proves `.gitignore` behavior is unchanged.

- [ ] **Step 5: Commit**

```bash
git add extensions/bob-code-consistency-review/src/workspaceInitializer.ts \
  extensions/bob-code-consistency-review/test/workspaceInitializationStatus.test.js
git commit -m "feat: expose code consistency workspace status"
```

### Task 2: Model-backed conditional initialization card

**Files:**

- Modify: `extensions/bob-code-consistency-review/src/webview/consistencyReviewWizardHtml.ts`
- Modify: `extensions/bob-code-consistency-review/src/webview/consistencyReviewWizard.ts`
- Modify: `extensions/bob-code-consistency-review/test/guiFirstSurfaces.test.js`

**Interfaces:**

- Add: `ConsistencyWizardInitializationStatus` with `initialized`, `workflowPath`, and `missing`.
- Add: `ConsistencyWizardStatusNotice` with tone union `"muted" | "warning" | "ok"` and a message.
- Require: `ConsistencyReviewWizardModel.initialization` and `ConsistencyReviewWizardModel.status`.
- Consume: Task 1 `getCodeConsistencyWorkspaceInitializationStatus()` during every model build.

- [ ] **Step 1: Add failing HTML contracts**

Extend the existing Wizard fixture in `guiFirstSurfaces.test.js` with an uninitialized state and neutral status:

```js
initialization: {
  initialized: false,
  workflowPath: "C:\\repo\\.bob\\workflows\\code-consistency-review\\WORKFLOW.md",
  missing: [".bob/workflows/code-consistency-review/WORKFLOW.md"]
},
status: { tone: "muted", message: "未実行" }
```

Add assertions to the existing render test:

```js
assert.match(html, /\.bob ワークフロー初期化: 未完了/)
assert.match(html, /data-action="initializeWorkspace"/)
assert.match(html, /\.bob\/workflows\/code-consistency-review\/WORKFLOW\.md/)
assert.doesNotMatch(html, /onclick=/)
```

Add a second render test with `initialized: true`, `missing: []`, and an OK status. It must prove both the card heading and action are absent, while model-backed success survives the render:

```js
assert.doesNotMatch(html, /\.bob ワークフロー初期化: 未完了/)
assert.doesNotMatch(html, /data-action="initializeWorkspace"/)
assert.match(html, /初期化が完了しました/)
assert.match(html, /class="status ok"/)
```

- [ ] **Step 2: Verify RED**

Run:

```bash
npm run compile
node --test test/guiFirstSurfaces.test.js
```

Expected: the uninitialized render assertions fail because the initialization card is absent.

- [ ] **Step 3: Extend the Wizard model and initial status derivation**

Add these contracts in `consistencyReviewWizardHtml.ts`:

```ts
export interface ConsistencyWizardInitializationStatus {
  initialized: boolean
  workflowPath: string
  missing: string[]
}

export interface ConsistencyWizardStatusNotice {
  tone: "muted" | "warning" | "ok"
  message: string
}
```

Add both required fields to `ConsistencyReviewWizardModel`:

```ts
initialization: ConsistencyWizardInitializationStatus
status: ConsistencyWizardStatusNotice
```

In `consistencyReviewWizard.ts`, import `getCodeConsistencyWorkspaceInitializationStatus`. Inside `buildModel`, compute `warnings` once, retrieve initialization status, and return a model with an explicit initial notice:

```ts
const warnings = [...discovery.warnings, ...extraWarnings]
const initialization = await getCodeConsistencyWorkspaceInitializationStatus(this.workspaceRoot)
return {
  workspaceRoot: this.workspaceRoot,
  base: "HEAD~1",
  head: "HEAD",
  vcs: "git",
  changeType: "maintenance",
  focus: ["requirement-code-consistency", "design-code-consistency", "test-gap"],
  documents: this.documents,
  traceability,
  packagePreview: await listPackagePreview(
    this.workspaceRoot,
    config.get<string>("reviewPackagePath", ".bob-review/review-package")
  ),
  initialization,
  warnings,
  status: {
    tone: warnings.length > 0 ? "warning" : "muted",
    message: warnings.join("\n") || "未実行"
  }
}
```

Do not infer initialization from `review-input.yaml`, discovery warnings, or command output.

- [ ] **Step 4: Render the card before VCS / Revision**

Immediately after `<h1>Consistency Review Wizard</h1>`, render a pure helper result:

```ts
${renderWorkspaceInitialization(model.initialization)}
```

The helper returns `""` when initialized and otherwise returns this CSP-safe section:

```ts
function renderWorkspaceInitialization(status: ConsistencyWizardInitializationStatus): string {
  if (status.initialized) return ""
  return `<section class="card">
    <h2 class="warning">.bob ワークフロー初期化: 未完了</h2>
    <div>コード整合プレレビュー用ワークフローを workspace に配置してください。</div>
    <ul>${status.missing.map((item) => `<li><code>${escapeHtml(item)}</code></li>`).join("")}</ul>
    <div class="actions"><button type="button" data-action="initializeWorkspace">.bob を初期化</button></div>
  </section>`
}
```

Replace the Status div's warning-derived class and text with the model-backed notice:

```ts
<div id="status" class="status ${escapeHtml(model.status.tone)}">${escapeHtml(model.status.message)}</div>
```

Keep the existing `button[data-action]` listener and 1200 ms client-side disable unchanged; it is a responsiveness aid, not the single-flight guarantee.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
npm run compile
node --test test/guiFirstSurfaces.test.js test/workspaceInitializationStatus.test.js
```

Expected: both conditional render cases pass and no inline `onclick` is present.

- [ ] **Step 6: Commit**

```bash
git add extensions/bob-code-consistency-review/src/webview/consistencyReviewWizardHtml.ts \
  extensions/bob-code-consistency-review/src/webview/consistencyReviewWizard.ts \
  extensions/bob-code-consistency-review/test/guiFirstSurfaces.test.js
git commit -m "feat: show code consistency initialization card"
```

### Task 3: Existing initializer command routing and host-side single-flight

**Files:**

- Modify: `extensions/bob-code-consistency-review/src/webview/consistencyReviewWizard.ts`
- Create: `extensions/bob-code-consistency-review/test/consistencyReviewWizardInitialization.test.js`

**Interfaces:**

- Extend: `ConsistencyWizardAction` with `"initializeWorkspace"`.
- Extend: `isConsistencyWizardAction()` allowlist with exactly the same action.
- Execute: `vscode.commands.executeCommand("bobCodeConsistency.initializeWorkspace", { workspaceRoot })`.
- Add: controller-local `initializingWorkspace: boolean` guard.
- Add: pure `initializationSuccessMessage(result: unknown): string` formatter for command result text and optional workflow backup path.

- [ ] **Step 1: Build a focused Webview controller harness**

Create `consistencyReviewWizardInitialization.test.js` using `Module._load` isolation. The harness must replace these imports before loading `../out/webview/consistencyReviewWizard`:

```js
if (request === "vscode") return harness.vscode
if (request === "../core/reviewInputDiscovery") return {
  discoverReviewInputCandidates: async () => ({ documents: [], warnings: [] })
}
if (request === "../core/reviewInputBuilder") return {
  CHANGE_TYPE_VALUES: ["maintenance"],
  REVIEW_FOCUS_VALUES: ["requirement-code-consistency", "design-code-consistency", "test-gap"],
  VCS_VALUES: ["git"],
  writeReviewInputFromDraft: async () => ({ status: "error", errors: ["not used"] })
}
if (request === "../core/traceabilityCatalogStore") return {
  DEFAULT_TRACEABILITY_CATALOG_PATH: ".bob-trace/traceability-catalog.json",
  DEFAULT_TRACEABILITY_GATE_REPORT_PATH: ".bob-trace/gate-report.md",
  readTraceabilityCatalog: async () => ({ status: "error", errors: [] }),
  validateAndWriteTraceabilityGateReport: async () => ({ status: "error", errors: [] })
}
if (request === "../workspaceResolver") return {
  resolveBobWorkspaceRoot: async () => harness.workspaceRoot
}
if (request === "../workspaceInitializer") return {
  getCodeConsistencyWorkspaceInitializationStatus: harness.getInitializationStatus
}
if (request === "./consistencyReviewWizardHtml") return {
  renderConsistencyReviewWizardHtml: ({ model }) => {
    harness.models.push(model)
    return "<html>consistency wizard</html>"
  }
}
```

The fake panel captures `onDidReceiveMessage`, HTML writes, posted messages, rendered models, and `commands.executeCommand` calls. `workspace.getConfiguration().get()` returns each supplied default. Opening the GUI waits until the first HTML write before sending actions.

- [ ] **Step 2: Add failing command and reload tests**

Return `initialized: false` for the first status lookup and `initialized: true` after command execution. Send the exact allowlisted message:

```js
await harness.send({
  type: "consistencyWizard.action",
  action: "initializeWorkspace"
})

assert.deepEqual(harness.commandCalls, [{
  command: "bobCodeConsistency.initializeWorkspace",
  args: [{ workspaceRoot: "C:\\workspace" }]
}])
assert.equal(harness.models.at(-1).initialization.initialized, true)
assert.equal(harness.models.at(-1).status.tone, "ok")
assert.match(harness.models.at(-1).status.message, /workflow を作成しました/)
assert.match(harness.models.at(-1).status.message, /workflow backup:/)
```

The command fixture returns:

```js
{
  message: "コード整合プレレビュー workflow を作成しました",
  backupPath: "C:\\workspace\\.bob\\workflows\\code-consistency-review\\WORKFLOW.md.bak-20260717T000000Z"
}
```

Also send `{ type: "consistencyWizard.action", action: "unknown" }` and assert no command runs and the posted message is `不正な画面操作を拒否しました。`.

- [ ] **Step 3: Add failing concurrent duplicate test**

Use a deferred command result. Start the first action, wait until `executeCommand` begins, then send the second action before resolving the first:

```js
const first = harness.send(initializeMessage)
await harness.commandStarted
await harness.send(initializeMessage)
assert.equal(harness.commandCalls.length, 1)
assert.ok(harness.posts.some((message) => message.message === "初期化を実行中です。"))
commandResult.resolve({ message: "初期化が完了しました" })
await first
```

The final model must be initialized and rendered once after the command completes.

- [ ] **Step 4: Add failing failure-and-retry test**

Make the first `executeCommand` call reject with `new Error("INITIALIZE_FAILED")`. Assert the existing model stays uninitialized, the card state is not replaced, and an error post contains `INITIALIZE_FAILED`. Send the same action again with a successful command and a status response of `initialized: true`; assert command call count is 2 and the final status tone is `ok`. This proves `finally` releases the guard on failure.

- [ ] **Step 5: Verify RED**

Run:

```bash
npm run compile
node --test test/consistencyReviewWizardInitialization.test.js
```

Expected: initialization actions are rejected by the current allowlist and no initializer command call is captured.

- [ ] **Step 6: Implement action routing and single-flight**

Add the field:

```ts
private initializingWorkspace = false
```

Route initialization before the existing action chain and return so the generic `操作を実行しました。` post cannot overwrite the detailed model-backed result:

```ts
if (message.action === "initializeWorkspace") {
  await this.initializeWorkspace()
  return
}
```

Implement the controller method:

```ts
private async initializeWorkspace(): Promise<void> {
  if (this.initializingWorkspace) {
    this.post({ message: "初期化を実行中です。" })
    return
  }
  this.initializingWorkspace = true
  try {
    const result = await vscode.commands.executeCommand(
      "bobCodeConsistency.initializeWorkspace",
      { workspaceRoot: this.workspaceRoot }
    )
    const nextModel = await this.buildModel([])
    nextModel.status = nextModel.initialization.initialized
      ? { tone: "ok", message: initializationSuccessMessage(result) }
      : {
          tone: "warning",
          message: "初期化コマンド完了後もコード整合プレレビュー workflow を確認できませんでした。"
        }
    this.model = nextModel
    this.render()
  } finally {
    this.initializingWorkspace = false
  }
}
```

Leave error reporting in the existing `handleMessage` catch so the current HTML and initialization card remain visible after failure.

Add the formatter outside the controller:

```ts
function initializationSuccessMessage(result: unknown): string {
  const fallback = ".bob ワークフローの初期化が完了しました。"
  if (!result || typeof result !== "object") return fallback
  const candidate = result as { message?: unknown; backupPath?: unknown }
  const lines: string[] = []
  if (typeof candidate.message === "string" && candidate.message.trim()) {
    lines.push(candidate.message.trim())
  }
  if (typeof candidate.backupPath === "string" && candidate.backupPath.trim()) {
    lines.push(`workflow backup: ${candidate.backupPath.trim()}`)
  }
  return lines.join("\n") || fallback
}
```

Add `initializeWorkspace` to `ConsistencyWizardAction` and `isConsistencyWizardAction()` only; do not broaden parsing to arbitrary strings.

- [ ] **Step 7: Verify GREEN**

Run:

```bash
npm run compile
node --test \
  test/consistencyReviewWizardInitialization.test.js \
  test/guiFirstSurfaces.test.js \
  test/workspaceInitializationStatus.test.js \
  test/privacyArtifacts.test.js
```

Expected: command arguments, re-read, conditional disappearance contract, unknown-action rejection, failure retry, and concurrent single-flight all pass.

- [ ] **Step 8: Commit**

```bash
git add extensions/bob-code-consistency-review/src/webview/consistencyReviewWizard.ts \
  extensions/bob-code-consistency-review/test/consistencyReviewWizardInitialization.test.js
git commit -m "feat: initialize code consistency workspace from wizard"
```

### Task 4: Operator documentation and repository verification

**Files:**

- Modify: `extensions/bob-code-consistency-review/README.md`

**Interfaces:**

- Document: conditional `.bob` initialization card in Consistency Review Wizard.
- Preserve: Command Palette initialization as an explicit update/recovery path.
- Record: no package manifest, command ID, schema, or dependency change.

- [ ] **Step 1: Update the representative workflow**

Replace the current step 2 with the GUI-first path:

```text
2. `Bob Code Consistency Review: Review Wizard を開く` を実行する。コード整合プレレビュー workflow が未配置の場合は、画面上部の `.bob を初期化` を選び、`.bob/workflows/code-consistency-review/WORKFLOW.md` と `review-input.yaml` の雛形を作成する。
```

Renumber the remaining flow without changing its meaning.

- [ ] **Step 2: Clarify the workspace initialization section**

Add the following contract before the generated-file tree:

```text
Consistency Review Wizard は `.bob/workflows/code-consistency-review/WORKFLOW.md` がない場合だけ初期化カードを表示します。ボタンは既存の `bobCodeConsistency.initializeWorkspace` を現在の workspace に対して実行します。初期化済み workspace で workflow を同梱 template へ更新する場合や復旧する場合は、従来どおり Command Palette から同じ command を実行できます。
```

Keep the existing backup, non-overwrite, placeholder, and `.gitignore` explanations intact.

- [ ] **Step 3: Commit documentation**

```bash
git add extensions/bob-code-consistency-review/README.md
git commit -m "docs: document wizard workspace initialization"
```

- [ ] **Step 4: Run focused verification**

```bash
cd extensions/bob-code-consistency-review
npm run compile
node --test \
  test/workspaceInitializationStatus.test.js \
  test/guiFirstSurfaces.test.js \
  test/consistencyReviewWizardInitialization.test.js \
  test/privacyArtifacts.test.js
```

Expected: compile succeeds and every focused test passes.

- [ ] **Step 5: Run the full suite and distinguish the known baseline flake**

First run the repository-default command:

```bash
npm test
```

If the known `externalProcessRunner.test.js` timing assertion fails while all new focused tests pass, capture the exact failing test name, rerun that exact test file alone, then run the suite serially:

```bash
node --test test/externalProcessRunner.test.js
node --test --test-concurrency=1 test/*.test.js
```

Acceptance requires the isolated timing test and serial full suite to pass. Any other failing test is a blocker and must be diagnosed before publication.

- [ ] **Step 6: Run policy, dependency, audit, and package gates**

```bash
npm run dependency:policy
npm run architecture:policy
npm run source:policy
npm run unused:report
npm run audit:prod
npm run package
npm run package:policy
```

Expected: every command exits 0, no import cycle or export-star violation is introduced, the production audit remains within the existing threshold, and the VSIX stays below policy size.

- [ ] **Step 7: Review the final diff and repository state**

```bash
cd ../..
git diff --check origin/main...HEAD
git diff --stat origin/main...HEAD
git status --short --branch
```

Confirm the final diff is limited to the approved spec and plan plus:

```text
extensions/bob-code-consistency-review/README.md
extensions/bob-code-consistency-review/src/workspaceInitializer.ts
extensions/bob-code-consistency-review/src/webview/consistencyReviewWizard.ts
extensions/bob-code-consistency-review/src/webview/consistencyReviewWizardHtml.ts
extensions/bob-code-consistency-review/test/workspaceInitializationStatus.test.js
extensions/bob-code-consistency-review/test/consistencyReviewWizardInitialization.test.js
extensions/bob-code-consistency-review/test/guiFirstSurfaces.test.js
```

The worktree must be clean except for an ignored/generated VSIX artifact. Do not commit `node_modules`, coverage output, or VSIX files.

### Task 5: Publish the verified branch and open formal review

**Files:**

- No source changes.
- Remote branch: `agent/code-consistency-init-button`.
- Target branch: `main`.

- [ ] **Step 1: Publish the exact verified tree through the connected GitHub app**

Resolve the current remote head first. Create blobs for every changed file, create one tree based on the remote branch tree, create a commit whose parent is the current remote head, and update `refs/heads/agent/code-consistency-init-button` without force. If the remote head moved, stop, fetch, integrate, rerun affected verification, and publish against the new head.

- [ ] **Step 2: Verify remote parity**

Fetch the remote branch and compare exact trees:

```bash
git fetch origin refs/heads/agent/code-consistency-init-button
git diff --exit-code HEAD FETCH_HEAD
git rev-parse HEAD^{tree}
git rev-parse FETCH_HEAD^{tree}
```

Expected: no diff and identical tree IDs.

- [ ] **Step 3: Open a Draft PR through the connected GitHub app**

Use title:

```text
feat: initialize code consistency workspace from Review Wizard
```

The PR body must include:

- the conditional display rule and canonical workflow path;
- reuse of `bobCodeConsistency.initializeWorkspace`;
- host-side single-flight and filesystem re-read behavior;
- focused, serial full-suite, policy, audit, and package results;
- the known baseline parallel timing flake only if it reproduced, clearly separated from new-code results;
- a note that `bob-bazaar-review`, schemas, command IDs, and dependencies are unchanged.

- [ ] **Step 4: Confirm handoff state**

Verify the Draft PR points to the exact published branch head, has `main` as base, and is not marked ready for merge until repository checks and formal human review complete.
