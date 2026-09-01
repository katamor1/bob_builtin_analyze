# Wave 0A Risk-Tiered Approval and Evidence Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wave 0A の利用者承認を、provider transcript、terminal LF、commit/blob/SHA-256 の転記、各commit単位の外部receiptから切り離し、read-only の Tier A、限定local作業の Tier B、外部・保護・破壊的操作の Tier C へ置き換える。同時に、既存の20-slice順序、exact-head CI、archive/attachment/recovery integrity、path identity、lease、TOCTOU防御は維持する。

**Architecture:** 人の同意とdirect-user provenanceは現在のCodex task hostだけが扱う。repository内には、それを認証したりmutation authorityを発行したりしないA/B/C classification・proposal lifecycle modelだけを置く。`featureIntegrationProgramPolicy.mjs`は製品・統合順序だけを保持し、`featureIntegrationCampaignPolicy.mjs`は機械検証可能な証跡だけを保持する。local generatorはread-onlyの固定入力`--check`とstdout専用`--print`へ縮小し、旧provider/transcript/LF経路とgenerator自身による既存file overwriteを削除する。main、remote、PR、既存branch/worktree、既存データ、外部serviceを変更するexecutorは本計画では新設しない。

**Tech Stack:** Node.js ESM、`node:test`、`node:crypto`、`node:zlib`、既存canonical JSON validator、Git。repository rootに`package.json`はないため、検証は直接`node --test`と`git diff --check`で行う。

**Spec:** `docs/superpowers/specs/2026-08-31-wave0a-risk-tiered-approval-and-evidence-design.md`

## Global Constraints

- 実装worktreeは`C:/Users/stell/source/repos/bob_builtin_analyze/.worktrees/feature-integration-selection-design`、branchは`codex/feature-integration-selection-design`とする。計画作成時の基準HEADは`a4ffcb1aac6556f5b2a501c1b60c0900b78e165d`である。
- 実装開始時に一度だけ、同じtask内で次のTier B範囲を自然文で承認する。含むものは本計画のsource/test/docs編集、local test、deterministic generated JSON更新、local review、local commit。network/credential effectは`none`とし、public endpoint分類はin-memory testだけで検証する。含まないものはmain、remote、PR、既存branch/worktree削除、既存archive/保全データ、credential使用、publish、外部書込みである。同一scopeの各test・修正・commitごとに再承認しない。
- Tier C操作は本計画の実装範囲外である。将来実行する場合は、実対象、source、effect、rollback、直前preflightを提示して新しい自然文確認を得る。計画やcommitをTier C承認へ読み替えない。
- `tools/main-consolidation/test/featureIntegrationCampaignPolicy.test.mjs`の未stage +290行、SHA-256 `17234f43c7c264ff4d0c2abf04158c666fd81a0c434f88fcf6c5d3e11e1b877d`は利用者所有の既知Phase 2B草案である。reset、checkout、stash、再生成、部分破棄をしない。Task 4がsourceを実装して全体をGREENにした後だけ、同じcommitへ明示的にstageする。
- 旧設計・計画・commitはforward historyとして保持する。amend、rebase、squash、drop、旧外部approval/claim/progress artifactの作成・修復・import・削除は行わない。
- `C:/Users/stell/source/repos/bob_builtin_analyze/.integration-xlsx-on-prereq`、main、origin/main、remote refs、PR、live campaign、外部archiveはread-onlyとする。テスト用のfresh temporary rootは、作成したexact root内だけを後片付けできる。
- 人の同意を表す本文、provider path、message ID、ordinal、timestamp、terminal LF、commit/blob/SHA-256、nonceを新しいpolicy stateへ保存しない。machine correlation、artifact digest、ref lease、file identityは、人に入力させない機械証跡としてのみ保持できる。
- command名だけでrisk tierを決めない。同じtest/build/packageでもcredential、外部書込み、課金、非公開データ送信、既存データ変更を伴えばTier Cへ昇格する。
- 各taskはREDを確認してから最小実装でGREENにし、対象pathだけをstageする。作業途中で既知RED以外の新しい失敗が出た場合は原因を特定してから続行する。
- 本計画はmutation executor、汎用authorization service、raw transcript parser、Markdown bootstrap、外部approval rootを新設しない。
- repository JavaScriptからCodex taskのdirect-user turnを認証できる既存APIはない。新しいproposal modelはnon-authorizing contractであり、任意caller eventを実行許可へ変換しない。将来executorを追加する場合は、実在するhost capabilityとmachine preflight portを名指しした別設計・Tier C確認が必要である。

## Known Baseline Before Implementation

以下を新規回帰と混同しない。

| Command | Baseline |
| --- | --- |
| `node --test tools/main-consolidation/test/featureIntegrationProgramPolicy.test.mjs` | 20/20 pass |
| `node --test tools/main-consolidation/test/create-feature-integration-program-index.test.mjs` | 4 failures。旧authority document pinがforward docs commit後のbytesと一致しない |
| `node --test tools/main-consolidation/test/featureIntegrationCampaignPolicy.test.mjs` | 531 tests中189 pass / 342 fail。既知草案が未実装exportを要求している |
| `node --test scripts/three-extension-documentation-contract.test.js` | 11/11 pass |

実装完了時は上記をすべてGREENにし、既知REDの履歴を「最初から成功していた」と書き換えない。

## File and Ownership Map

| File | Role | Planned ownership |
| --- | --- | --- |
| `tools/main-consolidation/featureIntegrationRiskPolicy.mjs` | non-authorizing A/B/C classification・proposal model | Task 1で新規作成 |
| `tools/main-consolidation/test/featureIntegrationRiskPolicy.test.mjs` | classification、proposal、state machine | Task 1で新規作成 |
| `tools/main-consolidation/featureIntegrationProgramPolicy.mjs` | 20-slice製品・統合policy | Task 2 |
| `tools/main-consolidation/test/featureIntegrationProgramPolicy.test.mjs` | v2 index closed-schema oracle | Task 2 |
| `tools/main-consolidation/create-feature-integration-program-index.mjs` | 固定出力generator | Task 3 |
| `tools/main-consolidation/test/create-feature-integration-program-index.test.mjs` | generator CLI/I/O boundary | Task 3 |
| `tools/main-consolidation/feature-integration-program-index.json` | deterministic v2 generated artifact | Task 3 |
| `tools/main-consolidation/featureIntegrationCampaignPolicy.mjs` | artifact/recovery integrity | Task 4 |
| `tools/main-consolidation/test/featureIntegrationCampaignPolicy.test.mjs` | 利用者所有Phase 2B草案とcampaign回帰 | Task 4 |
| `tools/main-consolidation/test/featureIntegrationLegacyApprovalPolicy.test.mjs` | 旧authority拒否 | Task 4で新規作成 |
| `scripts/three-extension-documentation-contract.json` | current/historical分類 | Task 5 |
| `scripts/three-extension-documentation-contract.test.js` | 文書分類contract | Task 5 |

---

## Task 1: Non-authorizing risk-tier proposal modelを追加する

**Files:**

- Create: `tools/main-consolidation/featureIntegrationRiskPolicy.mjs`
- Create: `tools/main-consolidation/test/featureIntegrationRiskPolicy.test.mjs`

**Interfaces:**

```js
export function classifyRisk(scope) // "A" | "B" | "C"
export function createTaskProposalModel({ taskId })

// returned in-memory model; it never grants execution authority
model.open(scope)
model.recordDecision({ taskId, proposalId, decision })
model.beginOperation(immediatePreflight)
model.recordOutcome({ operationId, idempotencyKey, outcome })
model.recordReconciliation({ operationId, idempotencyKey, outcome })
model.completeScope()
model.invalidate(reason)
model.snapshot()
```

`recordDecision()`、`beginOperation()`、`recordOutcome()`はhost/executorが観測したeventを状態へ反映するだけであり、eventの真正性を認証しない。返り値はdefensive snapshotだけとし、`authorize`、`permit`、`canExecute`、credential、command runnerを公開しない。このmoduleをimportしただけではmutationを開始できない。現Codex taskではagent/hostがdirect responseとpreflightを保持し、repository modelは分類・遷移の回帰oracleとして使う。将来の実行統合は、caller-supplied callbackや`approved: true`ではなく、実在するhost capability portを別途実装するまで未実装とする。

`recordDecision()`のdecisionは`approved`または`declined`だけで、本文・hash・provider metadataを持たない。`approved`はmodel stateを進めるだけ、`declined`はproposalを`invalidated`にする。`recordOutcome()`は`applied | confirmed_no_mutation | unknown`、`recordReconciliation()`は`applied | confirmed_no_mutation | indeterminate`だけを受け、いずれもauthority tokenやexecution permitを返さない。

`scope`は次のclosed shapeとする。

```js
{
  purpose,
  repository,
  worktree,
  branch,
  allowedActions,
  allowedPaths,
  outputRoots,
  freshResources: {
    branches,
    worktrees,       // { canonicalPath, branch }[]
    fixtureRoots,    // canonical absolute roots[]
    requireAbsent,
    requireIsolated
  },
  allowedPublicEndpoints,
  effects: {
    repository: "none" | "scoped_worktree" | "main_or_history",
    filesystem: "none" | "fresh_output" | "existing_external_write" | "existing_external_delete" | "existing_worktree_delete",
    network: "none" | "public_read" | "external_write",
    credentials: "none" | "use_secret",
    publication: "none" | "publish",
    cost: "none" | "may_incur",
    nonPublicData: "none" | "send"
  },
  exclusions,
  source,          // Tier C closed SourceBinding; otherwise null
  targetSet,       // Tier C closed TargetSetBinding; otherwise null
  impact,          // Tier C closed ImpactBinding; otherwise null
  rollback         // Tier C closed RollbackBinding; otherwise null
}
```

Tier Cの4 fieldはfree-form stringにせず、次のclosed armとする。完全digest/versionはmodel scope/snapshotではなくhostのmachine preflight/evidence recordに保持し、`displayFingerprint`/`displayExpectedVersions`だけを利用者向け提示に使う。利用者にfingerprintを入力させない。

```js
source: {
  kind: "git_revision" | "artifact" | "filesystem_identity" | "external_version",
  canonicalId,
  displayFingerprint,
  verification: "verified"
},
targetSet: {
  kind: "git_refs" | "pull_request" | "filesystem_paths" | "external_resources",
  canonicalIds,
  displayExpectedVersions,
  targetCount
},
impact: {
  operations,
  primaryDiffSummary,
  primaryDiffFingerprint,
  affectedCount,
  totalBytes, // decimal string or null
  byteCap,    // decimal string or null
  irreversible
},
rollback: {
  mode: "direct" | "compensating" | "recreate" | "none",
  summary
}
```

`canonicalIds`と`displayExpectedVersions`は同数・重複なし、`targetCount`と`affectedCount`は配列・diffの実数へ一致、bytesがある場合は`totalBytes <= byteCap`を必須とする。`rollback.mode: "none"`は`impact.irreversible: true`の場合だけ許可する。full source/target version、digest、file/ref identityはhost側のimmutable machine recordに置き、modelへ渡さない。task/process restartでin-memory modelを失った場合はproposalを復元せず、scopeを再提示する。

`create_local_branch`/`create_local_worktree`/`create_fresh_fixture`を含むTier B scopeでは`freshResources`へexact branch/path/rootを列挙し、`requireAbsent: true`と`requireIsolated: true`を必須にする。fixture rootは承認済みtemporary/output parent内、current/protected worktreeと既存利用者データの外側に限定する。fresh作成targetが既存、current worktree、scope外parentなら、そのcreate proposalはfail closedとする。承認済みcurrent worktree内の通常編集は引き続きTier Bだが、既存branch/worktreeの移動・削除は別actionとしてTier Cに分類する。`public_dependency_read`ではcredentialを使わないcanonical HTTPS endpointを`allowedPublicEndpoints`へ列挙し、redirect後のfinal originも同じallowlistへ一致させる。空の包括wildcard、任意host、private endpointは受理しない。

最低tierを決めるaction集合は次のexact setとする。

```text
A: inspect, review, dry_run, render_in_chat
B: edit_scoped_files, run_local_test, build_local_package, local_commit,
   write_generated_output, create_fresh_fixture, create_local_branch,
   create_local_worktree, public_dependency_read
C: update_main, rewrite_history, push_remote, create_or_update_pr, merge_pr,
   delete_branch, delete_worktree, overwrite_existing_data,
   delete_existing_data, write_external_service, publish, sign,
   use_credentials, incur_cost, send_nonpublic_data
```

effectのいずれかがactionの最低tierより高ければ、effect側を採用する。unknown action/effectはfail closedとする。

- [ ] **Step 1: classificationとstate modelの失敗テストを書く。** A/B/Cの全action、effect昇格、unknown拒否、Tier C追加field、同時active proposal一件、別task event拒否、scope drift、restart後に復元APIがないことをtable-driven testで固定する。Tier Bではfresh branch/worktree/fixtureのexact absent/isolated targetとpublic endpoint allowlistを固定する。Tier Cではsource verification、canonical target set、display expected version、operation set、diff fingerprint、count、bytes/cap、irreversibility、rollbackの欠落・不整合を個別にrejectする。snapshotにhuman text、provider metadata、full digestが現れず、moduleにauthority/permit/executor exportがないことも確認する。

```js
assert.equal(classifyRisk(scope({ allowedActions: ['inspect'] })), 'A')
assert.equal(classifyRisk(scope({ allowedActions: ['run_local_test'] })), 'B')
assert.equal(classifyRisk(scope({
  allowedActions: ['run_local_test'],
  effects: { ...NO_EFFECTS, credentials: 'use_secret' }
})), 'C')
assert.throws(() => classifyRisk(scope({ allowedActions: ['unknown'] })), TypeError)
```

- [ ] **Step 2: REDを確認する。** 実行:

```text
node --test tools/main-consolidation/test/featureIntegrationRiskPolicy.test.mjs
```

Expected: module未作成またはexport未作成でfailする。

- [ ] **Step 3: closed classificationを実装する。** inputをcloneして検証し、配列の重複、空purpose、non-canonical repository/worktree/branch/path、Tier Cで欠けたsource/target set/impact/rollbackを拒否する。Tier Aはproposalを必要としないため`model.open()`へ渡した場合は拒否する。

- [ ] **Step 4: Tier別のin-memory状態遷移を実装する。** closure内部に一件のactive proposalだけを保持する。Tier Bは同一scope内の複数operationを一回のdecisionで継続でき、Tier Cは一回の適用で消費される。

```text
Tier B:
pending -> approved -> executing -> approved       (applied | confirmed_no_mutation)
executing -> reconciling -> approved                (applied | confirmed_no_mutation)
reconciling -> blocked                              (indeterminate)
approved -> consumed                                (completeScope)

Tier C:
pending -> approved -> executing -> consumed        (applied)
executing -> approved                               (confirmed_no_mutation)
executing -> reconciling -> consumed                (applied)
reconciling -> approved                             (confirmed_no_mutation)
reconciling -> blocked                              (indeterminate)

pending|approved -> invalidated                     (cancelled | scope drift)
```

`snapshot()`は表示用proposal scope、machine-generated proposal id、tier、state、invalidated reasonだけのdefensive copyを返す。human text、provider metadata、approval timestamp/hash、full source/target version/digest、callback、deserialize/hydrate APIを公開しない。Tier Bの`completeScope()`は最後のlocal operation後に一度だけ呼び、途中のtest/commitごとに新decisionを要求しない。

terminal state後に新proposalを作る場合は新しいproposal id/bindingと新しいdirect decisionを必須にする。`pending`、`approved`、`executing`、`reconciling`の間は二件目を拒否し、処理済みdecisionを次のproposalへ再利用しない。

- [ ] **Step 5: preflight eventのclosed validationを実装する。** `beginOperation()`は次のclosed inputだけを受理し、表示済みscopeと構造的にexact比較する。このvalidationはmachine observationの真正性を主張せず、host/executorがfull identityを検証した後のevent contractだけを検査する。

```js
{
  proposalId,
  taskId,
  operationId,
  idempotencyKey, // string or null
  action,
  repository,
  worktree,
  branch,
  paths,
  outputRoots,
  freshResources,
  finalPublicEndpoints,
  observedSource,
  observedTargetSet,
  observedImpact,
  observedRollback,
  checks: {
    scopeContained: "verified" | "not_applicable",
    targetAbsent: "verified" | "not_applicable",
    isolatedTarget: "verified" | "not_applicable",
    endpointAllowed: "verified" | "not_applicable",
    credentialsAbsent: "verified" | "not_applicable",
    identityStable: "verified" | "not_applicable",
    parentBoundaryStable: "verified" | "not_applicable",
    leaseSatisfied: "verified" | "not_applicable",
    provenanceSatisfied: "verified" | "not_applicable"
  }
}
```

module内のstatic action/effect mapがrequired checkを導出する。event callerはrequired listやrequired性を選べない。fresh branch作成は`targetAbsent`/`isolatedTarget`/`leaseSatisfied`、fresh worktree/fixture作成は`targetAbsent`/`isolatedTarget`/`parentBoundaryStable`、fresh output作成は`targetAbsent`/`parentBoundaryStable`、public readは`endpointAllowed`/`credentialsAbsent`、既存外部filesystem mutationは`identityStable`/`parentBoundaryStable`、Git ref更新は`leaseSatisfied`、CI/artifact消費は`provenanceSatisfied`を必須にする。`create_fresh_fixture`はexact fixture rootのapproved parent containmentも`scopeContained`で検証する。required checkのmissing/`not_applicable`、non-required checkの不正な`verified`、unknown/extra keyをrejectする。表示scope crossing、target count/byte cap mismatchはmodelを`invalidated`にする。outcome/reconciliationは同じoperation id/idempotency keyだけを受理し、`unknown`後は別operation eventを拒否する。実世界のidentity、lease、provenance、outcome read-backはhost側責務であり、このmodelのstateをauthorityにして省略しない。

- [ ] **Step 6: GREENとexport surfaceを確認する。** 実行:

```text
node --test tools/main-consolidation/test/featureIntegrationRiskPolicy.test.mjs
```

Expected: all pass。module exportは`classifyRisk`と`createTaskProposalModel`だけで、mutation authorityを返さない。

- [ ] **Step 7: exact filesだけをcommitする。** Commit:

```text
feat: add feature integration risk model
```

---

## Task 2: Program indexを製品policyだけのv2へ移行する

**Files:**

- Modify: `tools/main-consolidation/featureIntegrationProgramPolicy.mjs`
- Modify: `tools/main-consolidation/test/featureIntegrationProgramPolicy.test.mjs`

**Interfaces:**

```js
export function canonicalJson(value)
export function buildProgramIndex()
export function validateProgramIndex(index)
```

`buildProgramIndex()`からdocument identity引数を除く。schemaは`bob-builtin-analyze/feature-integration-program-index/v2`とし、旧`authorityDocuments`の位置へ次のclosed governanceを置く。

```js
governance: {
  designSpecPath: 'docs/superpowers/specs/2026-08-31-wave0a-risk-tiered-approval-and-evidence-design.md',
  riskModelSchemaVersion: 'bob-builtin-analyze/feature-integration-risk-model/v1',
  legacyAuthorization: 'historical_only',
  localMutationTier: 'B',
  protectedMutationTier: 'C'
}
```

- [ ] **Step 1: v2 oracleを先に書く。** 20件の`programAtomicSlices`、predecessor edge、owned scope、product safety gates、archive/trust/carrier identityを現在値のまま固定する。各mutation sliceは`minimumRiskTier: 'B'`と`effectBasedEscalation: true`を持ち、旧`planRequirement`を持たない。final validationのexternal/publish/UAT操作は実効果によりTier Cへ上がることをgovernance testで固定する。

- [ ] **Step 2: active indexから旧authorization fieldを拒否するREDを書く。** 次のexact key/tokenが再導入されればfailするrecursive assertionを追加する。

```text
authorityDocuments
requiredApprovals
requiredApprovalsWhenPresent
PLAN_AUTHORING_REQUEST_HASH_APPROVAL_PER_SLICE
IMPLEMENTATION_REQUEST_HASH_APPROVAL_PER_SLICE
requiresSeparateCampaignApproval
separate_plan_implementation_campaign
campaignAuthoritySchemaVersion
externalCampaignRoot
operatorHandoffSchemaVersion
verifiedHandoffSchemaVersion
```

`ONE_ACTIVE_SLICE`、`ONE_CONTINUOUS_SLICE_WORKSPACE`、exact-head CI、main-only cleanupはauthorization tokenではないため保持する。

- [ ] **Step 3: REDを確認する。** 実行:

```text
node --test tools/main-consolidation/test/featureIntegrationProgramPolicy.test.mjs
```

Expected: v1 shapeと旧approval fieldによりfailする。

- [ ] **Step 4: v2 policyを実装する。** `authorityDocuments`と`dynamicEvidencePolicy`を削除する。downstream `planAuthoring`/`implementation` schema、final policyのapproval arrays、sliceの`planRequirement`を削除する。deferred capabilityは既存のconditional/disposition/dependency/required specだけを保持し、capability名だけでTier Cへ固定しない。実装・検証が限定local作業ならTier B、activationがremote/publish/credential/destructive effectを持つ場合は同じcatalog rowでもTask 1によりTier Cへ昇格するtestを追加する。rejected capabilityはそのまま保持する。

- [ ] **Step 5: graphとcanonical behaviorを再検証する。** 20件のordinal、immediate predecessor、acyclic dependency、deep independent copies、NFC canonical JSON、一行LF終端、closed schemaがすべてpassすることを確認する。

- [ ] **Step 6: GREENを確認する。** 実行:

```text
node --test tools/main-consolidation/test/featureIntegrationProgramPolicy.test.mjs
```

Expected: all pass。

- [ ] **Step 7: exact filesだけをcommitする。** Commit:

```text
refactor: retire legacy approval authority from program index
```

---

## Task 3: Program index generatorを固定ローカルgeneratorへ縮小する

**Files:**

- Modify: `tools/main-consolidation/create-feature-integration-program-index.mjs`
- Modify: `tools/main-consolidation/test/create-feature-integration-program-index.test.mjs`
- Modify: `tools/main-consolidation/feature-integration-program-index.json`

**Interfaces:**

```js
export function parseArguments(argv) // { mode: "check" | "print" }
export function renderProgramIndex() // canonical Buffer
export async function runGenerator(argv, {
  readFile,
  writeStdout
})
```

- [ ] **Step 1: 新しいCLI contractをREDで固定する。** exactly oneの`--check`または`--print`だけを許可する。no args、両方、duplicate、positional output、`--write`、旧`--approval-instruction`、transcript/provider/private-path関係flagはI/O開始前にrejectする。

- [ ] **Step 2: no-process/no-provider/no-overwrite testを書く。** module exportが上記3件だけであること、`node:child_process`、Git、native bridge、filesystem write API、environment approval pathを使わないことをsource contractとinjected I/O spyで固定する。`--check`はmodule隣の固定JSONをread-onlyで比較し、`--print`はcanonical bytesをstdoutへ一度だけ渡す。

- [ ] **Step 3: REDを確認する。** 実行:

```text
node --test tools/main-consolidation/test/create-feature-integration-program-index.test.mjs
```

Expected: 旧approval pin/CLI contractによりfailする。

- [ ] **Step 4: generatorを最小化する。** check targetはmodule隣の`feature-integration-program-index.json`へ固定する。`renderProgramIndex()`は`validateProgramIndex(buildProgramIndex())`のcanonical bytesだけを返す。`--check`はexact byte比較し、driftならnonzero。`--print`は同じbytesをstdoutへ返し、fileを変更しない。`renderAuthenticated`と`collectExitedProcess`を削除する。

- [ ] **Step 5: checked-in JSONをapply_patchで更新する。** `renderProgramIndex()`の出力を取得し、`tools/main-consolidation/feature-integration-program-index.json`の旧一行だけを`apply_patch`で置換する。generatorへoverwrite機能を追加せず、更新前にこのfileが既知の未stage利用者変更でないことを`git status --short`とdiffで確認する。更新後に実行:

```text
node tools/main-consolidation/create-feature-integration-program-index.mjs --print
node tools/main-consolidation/create-feature-integration-program-index.mjs --check
```

Expected: printはv2 canonical one-line LF bytesをstdoutへ出し、checkは成功する。generator自身はfilesystemを変更しない。

- [ ] **Step 6: generatorとprogram policyをGREENにする。** 実行:

```text
node --test tools/main-consolidation/test/featureIntegrationProgramPolicy.test.mjs tools/main-consolidation/test/create-feature-integration-program-index.test.mjs
```

Expected: all pass。旧4 failuresは解消する。

- [ ] **Step 7: exact filesだけをcommitする。** Commit:

```text
refactor: simplify program index generation
```

---

## Task 4: Phase 2B草案をevidence-onlyへ移行してtechnical integrityを完成する

**Files:**

- Modify: `tools/main-consolidation/featureIntegrationCampaignPolicy.mjs`
- Preserve then complete: `tools/main-consolidation/test/featureIntegrationCampaignPolicy.test.mjs`
- Create: `tools/main-consolidation/test/featureIntegrationLegacyApprovalPolicy.test.mjs`
- Read: `tools/main-consolidation/featureIntegrationRiskPolicy.mjs`

**Required exports:**

```js
getAttachmentSchemaRegistry
validateAttachmentByteSize
validateAttachmentPayload
parseAttachmentBytes
buildAttachmentFixture
validateRawCandidateByteSize
validateRawCandidatePayload
buildFullArchivePreflightFixture
validateFullArchivePreflightFixture
decodeArchiveFixtureLiteral
```

registryは草案が独立oracleとして持つ次の42行をexactに実装する。

```text
feature-integration-archive-preflight|1C|4194304
protected-clone-baseline|5B|16777216
slice-topology-evidence|5B|4194304
slice-topology-recovery-observation|5B|4194304
wave0a-local-gates|6C|16777216
wave0a-generated-paths|6D|4194304
wave0a-generated-deletion-plan|6D|134217728
wave0a-generated-cleanup|6D|4194304
wave0a-cleanup-progress|6D|4096
root-materialization-plan|6G|16777216
worktree-removal-plan|6G|16777216
worktree-removal-observation|6G|4194304
wave0a-dispatch-run-observation|6G|1048576
feature-integration-independent-review|6F|1048576
exact-head-run-set-snapshot|4A|1048576
exact-head-run-discovery|4A|4194304
exact-head-run-discovery-failure|4A|4194304
exact-head-ci-evidence|4B|4194304
pull-request-mergeability|5B|4194304
merge-commit-plan|6F|1048576
merge-commit-preparation|6G|1048576
main-integration-reconciliation|5B|4194304
main-integration-settlement|5B|4194304
github-atomic-pr-lifecycle-acceptance|github-lifecycle|1048576
github-atomic-pr-lifecycle-validation|github-lifecycle|1048576
wave0a-capacity-observation|6A|1048576
remote-branch-deletion|6G|1048576
feature-integration-failure|6F|1048576
feature-integration-recovery-checkpoint|6F|1048576
pull-request-observation|5B|1048576
remote-ref-observation|5B|1048576
partial-run-evidence|4B|1048576
candidate-preservation-manifest|6F|4194304
wave0a-mutation-request|6G|1048576
wave0a-mutation-intent|6G|1048576
wave0a-operation-claim|6G|1048576
wave0a-process-result|6G|1048576
wave0a-job-termination-proof|6G|1048576
wave0a-mutation-receipt|6G|1048576
wave0a-operation-inspection|6B|1048576
wave0a-supervised-operation-result|6E|1048576
wave0a-historical-precheckpoint-validation|historical-recovery|1048576
```

- [ ] **Step 1: 草案identityとdiffを再確認する。** `git status --short`、`git diff -- tools/main-consolidation/test/featureIntegrationCampaignPolicy.test.mjs`、SHA-256を記録する。一致しない場合は上書きせず、利用者変更として再評価する。

- [ ] **Step 2: 既知REDを再確認する。** 実行:

```text
node --test tools/main-consolidation/test/featureIntegrationCampaignPolicy.test.mjs
```

Expected: 531 tests中189 pass / 342 failを基準とする。異なる場合は最初の差を調べる。

- [ ] **Step 3: 旧human authorizationのpositive fixtureを先にevidence-onlyへ移行する。** production validatorを追加する前に、既存testと+290行草案からtrusted transcript、terminal-LF、approval text/request hash、approval identity、provisioning/campaign approval chainをpositive fixtureとして使う箇所を除去する。`github-atomic-pr-lifecycle-acceptance`はcanonical repository identity、source/target refs、expected old SHA、operation set、before/after observation、command packet、expiry、直接検証したGit/GitHub executable identityだけをmachine evidenceとして保持する。`classifyRisk()`でこのoperation descriptorがTier Cになることは検証するが、proposal modelを実行authorityとして使わない。

- [ ] **Step 4: legacy拒否testをREDで追加する。** 次のactive primitive/schemaが`validateCampaignPrimitive()`または`validateAttachmentPayload()`でunknownとしてrejectされ、current execution authorityへ変換できないことを`featureIntegrationLegacyApprovalPolicy.test.mjs`へ書く。

```text
ApprovalIdentity
TrustedTranscriptMessageIdentity
TrustedApprovalTranscript
ApprovalInstructionIdentity
CampaignAuthority
PreCampaignToolBundlePlan
InstalledPreCampaignToolBundleIdentity
ExpectedAbsentControlAuthorityPaths
ExternalToolAuthority
Wave0aBoundControlAuthority
Wave0aControlAuthorityProvisioningRequest
Wave0aControlAuthorityProvisioningApproval
Wave0aControlAuthorityProvisioningConsumptionClaim
Wave0aControlAuthorityProvisioningResult
Wave0aCampaignExecutionApprovalRequest
Wave0aCampaignExecutionApproval
github-lifecycle-acceptance-approval-request/v2
github-lifecycle-acceptance-approval/v3
```

primitive名は`validateCampaignPrimitive()`で、旧GitHub lifecycle schemaは`validateAttachmentPayload()`でrejectする。旧payloadのread-only migration parserは作らず、Git履歴とhistorical docsだけを参照点とする。

- [ ] **Step 5: production sourceから旧authorityを除去する。** `normalizeApprovalMessage` export、message/transcript validators、`PINNED_APPROVAL_FINGERPRINT`、`PINNED_PLAN`、approval text/hash/time/maxUses、`campaignExecutionApprovalIdentity`、`campaignExecutionRequestSha256`、`githubLifecycleAcceptanceApprovalIdentity`、`approvalRecordSha256`、`campaign_quarantine_approval` roleを削除する。存在しない`create-wave0a-proposal.mjs`、`verify-github-atomic-pr-lifecycle.mjs`、`wave0a-bootstrap.ps1`、`wave0a-stage-minus-one.ps1`をactive bundleとして要求する型もregistryから除去する。

- [ ] **Step 6: technical provenanceを非承認名へ移す。** `Wave0aApprovedLocalRepositoryScope`を`Wave0aLocalRepositoryScope`へrenameする。`approvedPlanIdentity`が単なるbytes provenanceとして本当に必要な箇所だけ`implementationPlanIdentity`へrenameし、不要なら削除する。`SourceOrigin.new_design`は`designSpecIdentity`を保持し、`approvedSpecIdentity`と`designApprovalId`を除去する。`admissionNonce`と`dispatchNonce`はmachine correlationであり、利用者承認tokenへ使わない。

- [ ] **Step 7: recovery integrityを承認recordなしで閉じる。** quarantine/publication recoveryはreservation、intent、owner termination proof、exact damaged tree、prior index head、publication identityを要求する。`approvalRecordSha256`を削除しても、foreign owner、missing proof、index drift、path crossing、duplicate memberをrejectする。

- [ ] **Step 8: Phase 2Aの旧export-absence assertionを移行する。** 草案開始前にある`validateAttachmentPayload`等が存在しないことを要求するassertionを、Task 4のrequired exportsがexactに存在し、旧stub/authority exportは存在しないことを要求するclosed export-surface assertionへ置換する。このhunkは元の+290行草案外であるため、review時に「既存assertionの意図した移行」として別に示す。

- [ ] **Step 9: attachment registryとbounded canonical parserを実装する。** schema/producer/capをclosed mapへ保持し、null-prototype map、fatal UTF-8、BOM/leading whitespace/CRLF/trailing byte拒否、raw byteSize/SHA-256一致、parse後canonical bytes一致を要求する。fixture builderはtest-owned literalと同じclosed payloadを返し、filesystem/network/live commandを観測したと主張しない。

- [ ] **Step 10: semantic validatorsを実装する。** 草案の全object-key deletion/unknown-key、topology、exact-head run、CI job、merge bytes、recovery、path containment、claim/receipt、worktree removal、diagnostic redaction mutationをrejectする。既存root/removal/no-follow/cap契約を弱めない。

- [ ] **Step 11: raw candidateとarchive fixtureをboundedに実装する。** raw candidateは16 MiB inclusive、path traversal、diagnostic secret/free text、binary patch traversal、size/hash mismatchをrejectする。zlib fixture decodeは`inflateSync`の`maxOutputLength: 16_777_216`、入力format、展開上限、index rangeを検証する。full archive preflightは17 source files、5 bundle observations、8 required objects、carrier patch一覧、実際のbytes/hashを閉じる。

- [ ] **Step 12: program index v2 bytesへfixture identityだけを更新する。** Task 3のchecked-in canonical v2 bytesを独立にhashし、草案の`programIndexBlobSha256`と期待digestをその実値へ一度だけ更新する。coverage、archive member、source bytesを削除してGREENにしない。

- [ ] **Step 13: active source禁止語scanを追加する。** historical docs/test rejection literalを除くproduction sourceで、次が残らないことをexplicit testにする。

```text
codex_trusted_transcript_v1
terminal LF
approvalText
requestSha256=
approvalRecordSha256
campaignExecutionApprovalIdentity
provisioningApprovalIdentity
```

- [ ] **Step 14: campaign/model/legacy suitesを一度だけ最終形でGREENにする。** 旧approval chainを一時実装してGREENにする中間段階を作らない。実行:

```text
node --test tools/main-consolidation/test/featureIntegrationRiskPolicy.test.mjs tools/main-consolidation/test/featureIntegrationCampaignPolicy.test.mjs tools/main-consolidation/test/featureIntegrationLegacyApprovalPolicy.test.mjs
```

Expected: all pass。+290行草案のtechnical integrity test caseはすべて保持し、旧authorization positive testだけを専用legacy rejectionへ置換するため、最終test総数そのものは固定しない。

- [ ] **Step 15: source、保全・移行した草案、legacy testだけをcommitする。** stage前にoriginal +290-line technical intentが残っていること、Step 3のlifecycle hunkとStep 8の既存assertionが意図したmigrationであることをdiff reviewする。

```text
feat: complete evidence-only campaign validation
```

---

## Task 5: Historical/current文書分類と統合gateを同期する

**Files:**

- Modify: `scripts/three-extension-documentation-contract.json`
- Modify: `scripts/three-extension-documentation-contract.test.js`
- Modify only for supersession notice/status when required:
  - `docs/superpowers/specs/2026-08-23-feature-selection-and-sequential-main-integration-design.md`
  - `docs/superpowers/specs/2026-08-27-wave0a-root-path-contract-addendum-design.md`
  - `docs/superpowers/specs/2026-08-27-wave0a-removal-cap-and-mutable-directory-identity-design.md`

- [ ] **Step 1: classification testを先に更新する。** 新しい2026-08-31 specと本planをcurrentとする。2026-08-23 executable plan、2026-08-27 executable plans、2026-08-29 terminal-LF design/planをhistoricalとする。2026-08-23 product designと2026-08-27 technical addendum specsは技術要件のcurrent referenceとして残すが、top-level noteで承認方式だけが2026-08-31 specに置換されたことを明示する。

- [ ] **Step 2: historical inventoryとtop-level noticeを同期する。** binary classificationへ追加する文書はすべてreplacement noticeを持たせる。旧本文やhashを削除せず、実行禁止と新canonical routeを先頭で示す。

- [ ] **Step 3: documentation contractをGREENにする。** 実行:

```text
node --test scripts/three-extension-documentation-contract.test.js
```

Expected: 11/11以上すべてpassし、new spec/planのclassification assertionが含まれる。

- [ ] **Step 4: 全focused suiteを順に実行する。** 実行:

```text
node --test tools/main-consolidation/test/featureIntegrationRiskPolicy.test.mjs
node --test tools/main-consolidation/test/featureIntegrationProgramPolicy.test.mjs
node --test tools/main-consolidation/test/create-feature-integration-program-index.test.mjs
node --test tools/main-consolidation/test/featureIntegrationCampaignPolicy.test.mjs
node --test tools/main-consolidation/test/featureIntegrationLegacyApprovalPolicy.test.mjs
node --test scripts/three-extension-documentation-contract.test.js
node tools/main-consolidation/create-feature-integration-program-index.mjs --check
git diff --check
```

Expected: all pass。compile/npm/package gateはrepository rootに対応manifestがないため捏造して追加しない。

- [ ] **Step 5: independent reviewを行う。** review観点は次の6点とする。

1. Tier A/B/Cがactual effectsで分類され、低いtierをcallerが選べない。
2. human approval text/hash/provider/LFがactive runtime・program index・campaign payloadへ残らない。
3. exact-head CI、archive/attachment/recovery、path identity、lease、TOCTOU防御が弱まっていない。
4. 利用者所有Phase 2B草案のtechnical testsが全て残り、既知REDがGREENになっている。
5. main/remote/PR/既存branch/worktree/外部データを変更するコードや実行が追加されていない。
6. repository内modelがCodex direct-user provenanceを認証した、またはexecution permitを発行したと主張していない。

Critical/Important findingがあれば同じTier B scope内で修正・再testし、findingごとの新承認を求めない。

- [ ] **Step 6: documentation metadataだけをcommitする。** Commit:

```text
docs: align Wave 0A approval migration metadata
```

---

## Final Local Candidate Gate

- [ ] `git status --short --branch`で想定外の未stage/staged fileがないことを確認する。
- [ ] `git log --oneline origin/main..HEAD`で本計画のtask commit順を確認する。
- [ ] `git diff --name-only origin/main...HEAD`をreviewし、main/remote/PR/external artifact mutationがないことを確認する。
- [ ] 全focused test、generator `--check`、`git diff --check`をfresh processで再実行する。
- [ ] local candidateの結果、残る差分、既知の非目標を利用者へ報告する。

この時点で完了するのはlocal candidateまでである。push、PR作成、merge、main更新、remote branch削除、local branch/worktree整理は、それぞれ観測済みの実対象を示したTier C proposalとして別に確認する。
