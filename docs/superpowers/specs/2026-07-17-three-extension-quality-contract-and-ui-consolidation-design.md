# Three Extension Quality Contract and UI Consolidation Design

- Status: approved for implementation
- Date: 2026-07-17
- Repository: `katamor1/bob_builtin_analyze`
- Components: `extensions/workflow-register`, `extensions/bob-bazaar-review`, `extensions/bob-code-consistency-review`, and repository GitHub Actions policy
- Compatibility level: **C**

> **Supersession notice:** This design replaces the mixed Operation Hub / Runs / Builder / Template Studio / Result Capture / Human Triage / Campaign Dashboard public-surface model. Old terms and IDs appear here only to identify what is replaced or deleted.

## 1. Summary

The three extensions already contain the required run engine, review pipelines, provider integrations, artifact stores, and safe update primitives. The remaining problem is contract drift: the same job is exposed through duplicate views or panels, nearly every registered command is visible in Command Palette, current documents disagree with manifests/runtime, and GitHub Actions pinning is correct only by convention.

This change establishes two enforceable contracts:

1. a consolidated operator surface with exactly five always-visible Command Palette entries; and
2. a dependency-free, fail-closed policy that permits external GitHub Actions only at immutable lowercase 40-character commit SHAs.

This is a route and contract consolidation. It does not redesign workflow execution, providers, artifacts, review schemas, or `run.json`.

## 2. Compatibility decision

Compatibility level is **C**. This product is unreleased, so obsolete Command IDs, View IDs, and redundant screens may be deleted. Duplicate user-facing entry points do not receive compatibility aliases.

The migration rule is:

- choose one canonical public entry point for each operator job;
- keep workflow-invoked commands registered when workflows still require them;
- hide those workflow commands from Command Palette;
- delete fully duplicate commands and views;
- migrate every live source, workflow, test, manifest, and current-document reference in the same change set; and
- allow a historical document to retain an old ID/name only with an explicit superseded/replaced notice.

## 3. Goals and non-goals

Goals:

1. Make `Bob 操作ハブ` the only workflow run-state UI.
2. Make `ワークフロー作成・編集` the only workflow authoring panel, with exactly three modes.
3. Make Bazaar Review and Code Consistency Review each expose one primary review GUI whose later stages stay inside it.
4. Expose exactly five stable Command Palette entries.
5. Preserve soft-dependency activation and show reasoned unavailable states in the hub.
6. Synchronize manifests, runtime wiring, current documents, and Extension Host gates.
7. Enforce immutable Action SHAs with fail-closed YAML auditing.

Non-goals:

- changing the workflow engine, provider/result-sink APIs, artifact contracts, or review record schemas;
- changing `run.json`, migration, locking, retention, or durability behavior;
- weakening preview, explicit confirmation, backup, or transactional save behavior;
- adding hard extension dependencies; or
- updating any existing Action SHA (none is expected).

## 4. Canonical public surface

Exactly these five labels are always visible in Command Palette:

1. `Bob: 操作ハブを開く`
2. `Bob Workflow: ワークフローを作成・編集`
3. `Bob Bazaar Review: レビューを開始`
4. `Bob Bazaar Review: 資料からプロジェクト規約を作成`
5. `Bob Code Consistency Review: 整合プレレビューを開始`

| Visible label | Canonical command ID | Result |
| --- | --- | --- |
| `Bob: 操作ハブを開く` | `workflowRegister.openOperationHub` | Reveal the single wide-panel `Bob 操作ハブ`. |
| `Bob Workflow: ワークフローを作成・編集` | `workflowRegister.openWorkflowBuilder` | Reveal the single three-mode Builder. |
| `Bob Bazaar Review: レビューを開始` | `bobBazaar.openReviewGui` | Reveal the Bazaar primary review GUI. |
| `Bob Bazaar Review: 資料からプロジェクト規約を作成` | `bobBazaar.authorProjectRulesFromDocuments` | Start document-backed rule authoring. |
| `Bob Code Consistency Review: 整合プレレビューを開始` | `bobCodeConsistency.openReviewWizard` | Reveal the Code Consistency primary review GUI. |

Commands used by bundled workflows remain contributed, activated, and registered, but their `menus.commandPalette` entries use `when: "false"`. A command is not retained merely because it used to be visible.

## 5. Workflow Register information architecture

### 5.1 `Bob 操作ハブ`

The Explorer and wide-panel Operation Hub variants become one wide-panel **`Bob 操作ハブ`**.

`OperationHubProvider` becomes panel-only:

- remove its `WebviewViewProvider` implementation and compact rendering;
- remove the Explorer contribution `workflowRegister.operationHub`;
- make `workflowRegister.openOperationHub` create or reveal the retained panel;
- delete the duplicate `workflowRegister.openOperationHubPanel` command; and
- retain refresh, action serialization, file watching, run revision checks, and focused-run routing.

The panel is the operational home for setup, workflow catalog, execution status, resume, approval, abort, diagnostics, and artifact inspection.

### 5.2 Run-state consolidation

Delete the Runs Explorer/status duplicates:

- delete the `workflowRegister.runs` view and activation event;
- delete `WorkflowRunControlView`;
- remove its status-bar item and polling timer;
- delete `workflowRegister.refreshRunsView` and its view menus; and
- migrate useful projection/provenance assertions to Operation Hub tests.

Run list, status, resume, approval, abort, held-step recovery, retention entry points, diagnostics, and artifact inspection stay available through the hub. Internal commands remain registered when used by the hub/workflows, but stay hidden from Command Palette.

### 5.3 Optional integrations

IBM Bob, Bazaar Review, and Code Consistency Review are optional integrations. Missing optional extensions must not prevent activation. The hub computes availability before showing an integration action; unavailable actions are disabled with a reason such as “extension not installed” or “extension not active.” It must not use a “command not found” exception as availability UX.

## 6. Workflow authoring consolidation

Workflow Builder becomes one panel named **`ワークフロー作成・編集`** with exactly three modes:

1. empty workflow;
2. standard template (`標準テンプレートから作成`); and
3. existing workflow edit.

Empty/edit modes keep the current authoring model, loader, serializer, validator, diff preview, stale-session guard, exclusive backup, and save queue. Standard-template mode reuses Template Studio library loading, profile/customization model, generation, validation, readiness, and diff logic.

The independent Template Studio panel and `bobTemplate.openCustomizationStudio` public command are deleted. Workflow-facing `bobTemplate.*` validation/generation commands remain registered and hidden when workflows still invoke them. Template generation produces an in-memory Builder model and does not bypass Builder Preview / Diff / explicit confirmation / backup / transactional save.

## 7. Bazaar Review consolidation

Bazaar Review publishes one primary review GUI. Its controller owns stage routing and the active Review Run context. Stages are:

- review target and run preparation;
- `レビュー結果取り込み`;
- `指摘確認・振り分け`; and
- `レビュー実績`.

Result capture and human triage no longer open standalone public panels. Campaign Dashboard moves into the Bazaar review GUI as `レビュー実績`. Existing capture validation, Review Run identity checks, triage validation, metrics/finalization, aggregation, and export services remain reusable host modules.

Standalone public commands/panel factories for Result Capture, Human Triage, and Campaign Dashboard are deleted after live routes migrate. Non-GUI workflow commands for capture, validation, records, triage, and summaries remain registered and hidden. Document-backed project-rule authoring remains a separate intentional public job because it is one of the five approved entries.

## 8. Code Consistency Review consolidation

Code Consistency Review publishes one primary GUI, **`整合プレレビュー`**. Stages include input/evidence selection, `トレーサビリティ整理`, preprocessing/package preview, `レビュー結果取り込み`, and `指摘確認・振り分け`.

Result Capture, Human Triage, and Traceability Prep route inside the retained panel. Their pure models, validators, stores, conflict tokens, and transactional writes remain separate modules; only Webview ownership/routing is consolidated.

Workspace initialization moves to a button in the primary GUI. `bobCodeConsistency.initializeWorkspace` may remain registered for workflows but is hidden. Initialization keeps these contracts:

- when the bundled Code Consistency workflow differs, back up the existing workflow and then update it;
- an existing `review-input.yaml` is never overwritten; initialization creates a backup only; and
- generated-artifact ignore updates keep their current bounded workspace behavior.

Standalone Result Capture and Human Triage commands/panels are deleted after route migration. Internal workflow commands remain registered and hidden when required.

## 9. Preserved internal contracts

These are invariant across all UI tasks:

- workflow run engine behavior;
- provider registration/ownership;
- artifact definitions, manifests, and hydration;
- result sink contracts;
- persisted `run.json` and migration behavior;
- Review Run identity and record schemas;
- preview-before-write;
- explicit replacement confirmation;
- backup-before-replacement; and
- transactional/conflict-checked saves.

A route may pass an existing workspace/run identity into a consolidated panel, but may not change its meaning or persistence contract.

## 10. Documentation contract

The current README, basic design, detailed design, unit-test specification, and real-machine test specification for all three extensions must agree with source/manifests. The extension-index README at `extensions/README.md` must not contradict them.

| Subject | Authoritative contract |
| --- | --- |
| workflow-register main | `./out/extensionWithAuthoring.js` |
| Bazaar and Code Consistency main | `./out/extension.js` |
| Cross-extension dependency | no required `extensionDependencies`; IBM Bob and workflow-register are soft dependencies |
| Bazaar template update | diff preview -> explicit confirmation -> backup -> update; cancel means no change |
| Code Consistency workflow update | when different, backup then update to bundled workflow |
| Existing `review-input.yaml` | never overwrite; create backup only |
| Bazaar MCP | Bazaar operations are always read-only; only `project_rules_init` can write when explicitly opted in |
| MCP write enablement | require `BOB_BAZAAR_ENABLE_WRITE_TOOLS=1` and an allowed root |
| `.bob/mcp.json` update | a VS Code configuration update, distinct from an MCP tool write |

A repository documentation-contract test reads manifests, composition roots, current documents, template-update implementations, and MCP registration together. It fails if any layer drifts.

Current source, bundled workflows, tests, and current documents have zero obsolete live references. Historical plans/specs/evidence may retain an old ID only when the file has an explicit superseded/replaced notice naming the new route.

## 11. GitHub Actions immutable-SHA policy

### 11.1 Baseline and rule

The current baseline contains **18 external `uses:` references across 3 workflow files**. Every reference is pinned to a lowercase 40-character commit SHA. Preserve all 18 references and comments such as `# v4`; no upstream update is expected.

A dependency-free Node.js scanner recursively examines `.github/workflows` and future `.github/actions` YAML. Repository-local `uses: ./...` is allowed. Every external `uses:` must use a lowercase 40-character SHA.

Reject tags (`@v4`), branches (`@main`), abbreviated/uppercase SHAs, expressions/dynamic refs, missing refs, and external values without an immutable repository/ref form.

### 11.2 Fail-closed YAML audit

The scanner uses a tokenizer/state machine, not a line-only regex. It supports normal block style, quoted keys/values, flow maps/sequences, compact mappings, and quoted-key escapes (`\\x`, `\\u`, `\\U`).

It rejects multiline/ambiguous `uses` forms, explicit/indirect keys, mapping-key indirection, anchors, aliases, named tags, and bare `!` when they prevent direct audit. Comments and ordinary scalar values containing similar characters remain allowed.

CLI violations report file, line, rule code, and bounded sanitized context only, and exit nonzero. Unrelated file content is never printed.

### 11.3 CI contract

The permanent `extensions-quality` workflow runs scanner tests and the real scan before dependency installation. Push and pull-request paths cover scanner source/tests, `.github/workflows/**`, and `.github/actions/**`.

Contract tests mutation-test both push and pull-request path coverage and gate ordering. Deleting either trigger path, removing the gate dependency, or moving installation ahead of the gate must fail.

## 12. Terminology

| Old/current mixed term | User-facing term |
| --- | --- |
| Operation Hub | Bob 操作ハブ |
| Runs / Run Monitor | 実行状況 |
| Builder | ワークフロー作成・編集 |
| Template Studio | 標準テンプレートから作成 |
| Result Capture | レビュー結果取り込み |
| Human Triage | 指摘確認・振り分け |
| Campaign Dashboard | レビュー実績 |
| Traceability Prep | トレーサビリティ整理 |

Brand names, internal Command IDs still in use, and JSON fields may remain English where technically required. User-facing headings/buttons/notifications/current docs use the terms above.

## 13. Verification and acceptance

Focused tests cover panel-only hub lifecycle, Runs/status removal, hub run actions/artifacts, Builder's exact three modes, single-panel stage routing, update/backup/cancel behavior, exactly five visible labels, hidden workflow commands, zero obsolete live references, documentation agreement, the SHA syntax matrix, real baseline, and CI mutations.

Linux and Windows Extension Host gates cover activation of all three soft-dependent extensions, registration of the five public commands, opening the hub/Builder/two primary review panels, and availability of representative hidden workflow commands.

Acceptance criteria:

1. Exactly five Command Palette entries are always visible, with the exact labels in section 4.
2. No duplicate Explorer view remains; the hub and Builder each have one panel.
3. The hub is the only run-state UI and retains list/status/resume/approval/abort/artifact operations.
4. Builder has exactly three modes and no independent Template Studio panel/public command.
5. Bazaar and Code Consistency each have one primary review GUI with internal later stages.
6. Missing optional extensions do not break activation; the hub gives a reasoned unavailable state.
7. No obsolete live references remain; history-only occurrences carry replacement notices.
8. Documentation-contract and Action SHA policy tests pass.
9. The scanner accepts all 18 baseline pins and rejects mutable/ambiguous references.
10. All three extensions compile, pass policies/unit tests, package, and pass package policy.
11. Linux/Windows Extension Host gates cover activation, five public commands, primary panels, and hidden workflow commands.
