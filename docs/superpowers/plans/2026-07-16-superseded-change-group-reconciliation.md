# 意図的に未統合だった変更群の照合・統合計画

> **Execution:** `superpowers:executing-plans` または `superpowers:subagent-driven-development` を使い、各TaskをTDDで実行する。リモートブランチ削除はこの計画では行わず、後続の `2026-07-16-retire-superseded-remote-branches.md` だけが削除を担当する。

**Date:** 2026-07-16  
**Repository:** `katamor1/bob_builtin_analyze`  
**Baseline main:** `d0258d1b2e8844b948e8b8ed8ce10623e6116427`  
**Goal:** 意図的にmergeしなかった旧実装、RED contract、checkpoint、診断、CI確認、temporary automationの各ブランチについて、現在の`main`または後継PRへ内容が到達していることを機械的・人間可読の両方で証明し、欠落がある場合だけ最新`main`起点で統合する。最終成果物は、後続の削除計画がexact branch SHA単位で消してよいと判断できるretirement manifestである。

**Architecture:** Gitの祖先関係だけではsquash mergeや再実装を判定できないため、(1) PR/merge evidence、(2) required path、(3) behavior contract、(4) focused test、(5) forbidden temporary path、(6) exact remote head SHAを組み合わせる。判定ロジックは純粋関数へ分離し、Git/GitHub照会はCLI adapterに閉じ込める。旧ブランチをそのままmergeまたはcherry-pickせず、現在の`main`を正本として差分を再構成する。

---

## 0. 重要な状態訂正

旧PR #81 `Add preview-first Skip Resume Readiness to Workflow Builder` はRED contractのままcloseされたが、機能自体は後継PR #82 `Add Skip Resume Readiness setup to Workflow Builder` で完成し、`main`へmerge済みである。

現在の`main`には次が存在する。

- `WorkflowAuthoringModel.skipResume`
- `x-skipResume.fileBound`のloader / serializer round-trip
- pure readiness planner
- preview / applyの共通strict validation境界
- Artifacts tabのpreview-first Webview
- stale response / unsafe path / Windows予約名 / unknown nested fieldの防御
- focused test、full suite、Linux / Windows package・VSIX・Extension Host evidence

したがって、`agent/workflow-recovery-ux-p1-builder-readiness-20260712` は未実装feature branchではなく、後継実装に置換された旧系統である。本計画では旧コードをmergeせず、#81 → #82のsupersession evidenceを作成して削除可能にする。

---

## 1. 判定語彙

各remote branchは次のいずれか1つに分類する。

| disposition | 意味 | この計画での処理 |
| --- | --- | --- |
| `merged-source` | branch由来の完成変更がmerged PRとして`main`へ到達済み | exact head、merge PR、main merge SHA、required pathsを記録する |
| `superseded` | 同じ要求が後継実装またはより新しい実装で`main`へ到達済み | requirement-to-main mappingとfocused testを記録する |
| `diagnostic-only` | workflow、ログ抽出、RED観測だけでproduct payloadを持たない | related production PRのmergeとevidence保存を確認する |
| `temporary-automation` | 別branchへfixをpushするためだけに作られた | fix commitがdestination branch経由で`main`へ到達したことを確認する |
| `blocked-unique` | 現行`main`に存在しない有効な変更が見つかった | retirementを停止し、最新`main`起点の専用integration PRを作る |
| `already-absent` | audit時点でremote refが存在しない | 再削除せず、既に不在であることをmanifestへ記録する |

`blocked-unique` は削除許可ではない。1件でも発生した場合、retirement manifest全体の`ready_for_deletion`を`false`にする。

---

## 2. 固定対象と期待される置換先

2026-07-15のPR #96棚卸し、およびその後にmergeしたPR #97/#118を基準に、次を固定対象とする。audit時にrefが存在しなければ`already-absent`とする。

| branch | 元の役割 | replacement / integration evidence | expected disposition |
| --- | --- | --- | --- |
| `agent/workflow-recovery-ux-p1-builder-readiness-20260712` | P1-1 RED / early implementation | PR #82、current Builder readiness implementation | `superseded` |
| `diagnostic/p1-1-windows-flake-20260712` | PR #82 Windows failure extraction | PR #82 final green evidence | `diagnostic-only` |
| `agent/bob-bazaar-review-review-run-v3-dashboard` | duplicate Iteration 3 Dashboard | PR #83、PR #97、plan record PR #118 | `superseded` |
| `agent/bob-evidence-scope-phase5-20260712` | Phase 5 partial implementation | PR #72 final producer/cache/ledger | `superseded` |
| `agent/repository-symbol-index-producer-contracts-red-20260712` | repository-index producer RED contracts | PR #72 implementationとcurrent tests | `superseded` |
| `codex/evidence-scope-phase5-checkpoint-20260712` | Phase 5 checkpoint / diagnostic workflow | PR #72 final integration | `superseded` |
| `codex/execute-shared-plan-6a53743e` | Evidence Scope final source branch | PR #72 | `merged-source` |
| `agent/workflow-reproducible-runtime-phase4-20260712` | Phase 4 hardening precursor | PR #77とcurrent runtime evidence | `superseded` |
| `diagnostic/phase4-windows-20260712` | Phase 4 Windows diagnosis | PR #77 final green evidence | `diagnostic-only` |
| `agent/workflow-automatic-pause-ci-verification-20260712` | PR #75 verification-only branch | PR #75、latest-main reverification PR #92 | `diagnostic-only` |
| `agent/workflow-run-retention-p1-6-20260713` | P1-6 implementation source | PR #93 | `merged-source` |
| `codex/bazaar-ai-project-rule-authoring` | AI project-rule authoring source | PR #97 | `merged-source` |
| `automation/fix-pr97-windows-portable-tests-20260716` | PR #97 fix-forward automation | PR #112 success → PR #97 source → PR #97 merge | `temporary-automation` |
| `integration/bazaar-campaign-dashboard-20260716` | missing completed plan record | PR #118 | `merged-source` |

次は本計画の削除対象外である。

- `main`
- protected branch
- open PRのheadまたはbase
- この計画を運ぶ `plan/retire-intentionally-unintegrated-20260716`
- audit後に新規作成されたbranch

---

## 3. 実装するファイル

### Repository-level audit tool

- Create: `tools/branch-retirement/branch-retirement-map.json`
- Create: `tools/branch-retirement/retirementPolicy.mjs`
- Create: `tools/branch-retirement/audit-branch-retirement.mjs`
- Create: `tools/branch-retirement/test/retirementPolicy.test.mjs`
- Create: `tools/branch-retirement/test/audit-branch-retirement.test.mjs`

### Durable evidence

- Create: `docs/release-evidence/branch-retirement-reconciliation-2026-07-16.json`
- Create: `docs/release-evidence/branch-retirement-reconciliation-2026-07-16.md`
- Create: `docs/release-evidence/workflow-builder-skip-resume-readiness-supersession-2026-07-16.md`
- Modify: `docs/release-evidence/workflow-reproducible-runtime-phase4-2026-07-12.md`

### Existing implementation and tests used as evidence

- `extensions/workflow-register/src/core/authoring/workflowAuthoringModel.ts`
- `extensions/workflow-register/src/core/authoring/workflowAuthoringLoader.ts`
- `extensions/workflow-register/src/core/authoring/workflowAuthoringSerializer.ts`
- `extensions/workflow-register/src/core/authoring/workflowSkipResumeReadiness.ts`
- `extensions/workflow-register/src/core/authoring/workflowSkipResumeReadinessPreview.ts`
- `extensions/workflow-register/src/webview/workflowBuilderPanel.ts`
- `extensions/workflow-register/src/webview/workflowBuilderSkipResumeReadinessScript.ts`
- `extensions/workflow-register/test/workflowSkipResumeReadiness.test.js`
- `extensions/workflow-register/test/workflowSkipResumeReadinessPreview.test.js`
- `extensions/workflow-register/test/workflowBuilderSkipResumeReadinessWebview.test.js`
- `extensions/workflow-register/test/workflowBuilderSkipResumeReadinessClient.test.js`
- `extensions/bob-code-consistency-review/test/repositorySymbolIndexProducer.test.js`
- `extensions/bob-code-consistency-review/test/artifactLedger.test.js`
- `extensions/workflow-register/test/workflowRunJournal.test.js`
- `extensions/workflow-register/test/workflowRunStateMigration.test.js`
- `extensions/bob-bazaar-review/test/campaignDashboardCore.test.js`
- `extensions/bob-bazaar-review/test/campaignDashboard.test.js`
- `extensions/bob-bazaar-review/test/campaignDashboardExport.test.js`
- `extensions/bob-bazaar-review/test/campaignDashboardGui.test.js`

---

## Task 1: 固定replacement mapとschema validationを追加する

**Files:**

- Create: `tools/branch-retirement/branch-retirement-map.json`
- Create: `tools/branch-retirement/retirementPolicy.mjs`
- Create: `tools/branch-retirement/test/retirementPolicy.test.mjs`

### Step 1: RED — malformed mapを拒否するtestを書く

`retirementPolicy.test.mjs`で次を失敗させる。

1. duplicate branch名
2. `main`をtargetに含めるentry
3. unknown disposition
4. replacement PRが空の`merged-source` / `superseded`
5. `diagnostic-only`なのにrelated production PRがないentry
6. required main pathとforbidden main pathの重複
7. branch head SHAが40桁hexでないresolved entry
8. `blocked-unique`を`deletable: true`へ変換しようとする入力

期待API:

```js
import {
  validateRetirementMap,
  evaluateRetirementEntry,
  summarizeRetirementAudit
} from "../retirementPolicy.mjs"
```

Run:

```bash
node --test tools/branch-retirement/test/retirementPolicy.test.mjs
```

Expected: FAIL because module and map do not exist.

### Step 2: GREEN — pure policyを実装する

`branch-retirement-map.json`は次のtop-level contractを使う。

```json
{
  "schemaVersion": "bob-builtin-analyze/branch-retirement-map/v1",
  "repository": "katamor1/bob_builtin_analyze",
  "baselineMain": "d0258d1b2e8844b948e8b8ed8ce10623e6116427",
  "entries": []
}
```

各entryは次を必須にする。

```json
{
  "branch": "agent/workflow-recovery-ux-p1-builder-readiness-20260712",
  "expectedDisposition": "superseded",
  "replacementPullRequests": [82],
  "requiredMainPaths": [
    "docs/superpowers/plans/2026-07-12-workflow-builder-skip-resume-readiness.md",
    "extensions/workflow-register/src/core/authoring/workflowSkipResumeReadiness.ts"
  ],
  "forbiddenMainPaths": [
    ".github/workflows/p1-1-windows-flake.yml"
  ],
  "evidenceChecks": [
    "skip-resume-authoring-model",
    "skip-resume-preview-apply",
    "skip-resume-webview",
    "skip-resume-linux-windows-gates"
  ]
}
```

`evaluateRetirementEntry()`は次が全てtrueの場合だけ`deletable: true`を返す。

- remote refが存在し、head SHAがaudit開始後に変化していない、またはrefが既に不在
- expected dispositionとobserved evidenceが一致
- replacement PRがmerged、またはdiagnostic target PRがclosedかつproduction replacementがmerged
- required main pathが全て存在
- forbidden main pathが全て不在
- open PRのhead/baseではない
- protected branchではない
- behavior evidence checkが全てpass
- unique unintegrated path / contractが0件

### Step 3: GREENを確認する

```bash
node --test tools/branch-retirement/test/retirementPolicy.test.mjs
git diff --check
```

Commit:

```text
feat: define branch retirement policy
```

---

## Task 2: read-only audit CLIを実装する

**Files:**

- Create: `tools/branch-retirement/audit-branch-retirement.mjs`
- Create: `tools/branch-retirement/test/audit-branch-retirement.test.mjs`

### Step 1: RED — Git/GitHub adapterのfailure contractを書く

fake command runnerを注入し、次を検証する。

- `git ls-remote --heads origin`が失敗したらmanifestを書かない
- `gh api repos/katamor1/bob_builtin_analyze/pulls?state=open`が失敗したらdeletableにしない
- branch fetch後にremote SHAが変わったら`head_moved`
- unknown remote branchを自動削除候補へ加えない
- branchが既に不在なら`already-absent`
- JSONとMarkdownの内容が同じentry orderを持つ
- outputはtemporary fileからatomic renameする
- audit commandは`git push`、DELETE API、branch updateを一度も呼ばない

Run:

```bash
node --test tools/branch-retirement/test/audit-branch-retirement.test.mjs
```

Expected: FAIL because CLI does not exist.

### Step 2: CLI contractを実装する

CLI:

```bash
node tools/branch-retirement/audit-branch-retirement.mjs \
  --repository katamor1/bob_builtin_analyze \
  --remote origin \
  --base main \
  --map tools/branch-retirement/branch-retirement-map.json \
  --json docs/release-evidence/branch-retirement-reconciliation-2026-07-16.json \
  --markdown docs/release-evidence/branch-retirement-reconciliation-2026-07-16.md
```

Read-only probes:

```bash
git rev-parse --verify main
git ls-remote --heads origin
git fetch --no-tags origin \
  +refs/heads/main:refs/remotes/retirement-audit/main \
  +refs/heads/<target>:refs/remotes/retirement-audit/<target>
git merge-base refs/remotes/retirement-audit/main refs/remotes/retirement-audit/<target>
git rev-list --left-right --count refs/remotes/retirement-audit/main...refs/remotes/retirement-audit/<target>
git diff --name-status refs/remotes/retirement-audit/main...refs/remotes/retirement-audit/<target>
git log --format=%H%x09%s refs/remotes/retirement-audit/main..refs/remotes/retirement-audit/<target>
gh api --paginate repos/katamor1/bob_builtin_analyze/pulls?state=open\&per_page=100
gh api --paginate repos/katamor1/bob_builtin_analyze/branches?per_page=100
```

Output entryは最低限次を持つ。

```json
{
  "branch": "agent/workflow-recovery-ux-p1-builder-readiness-20260712",
  "remoteHeadSha": "81e19775f9ce17242a39c7868085c50bc8eb9240",
  "observedDisposition": "superseded",
  "replacementPullRequests": [82],
  "requiredMainPaths": { "passed": true, "missing": [] },
  "forbiddenMainPaths": { "passed": true, "present": [] },
  "behaviorChecks": { "passed": true, "checks": [] },
  "openPullRequestReference": false,
  "protected": false,
  "uniqueUnintegratedFiles": [],
  "deletable": true,
  "reasons": []
}
```

### Step 3: Audit CLI testsをGREENにする

```bash
node --test \
  tools/branch-retirement/test/retirementPolicy.test.mjs \
  tools/branch-retirement/test/audit-branch-retirement.test.mjs
git diff --check
```

Commit:

```text
feat: audit superseded remote branches
```

---

## Task 3: P1-1旧branchを後継PR #82へ照合する

**Files:**

- Create: `docs/release-evidence/workflow-builder-skip-resume-readiness-supersession-2026-07-16.md`
- Update: `tools/branch-retirement/branch-retirement-map.json`
- Existing tests listed in Section 3

### Step 1: Requirement matrixを書く

旧PR #81のdesign/planを、current `main`の次へ1対1で対応付ける。

| #81 requirement | current main evidence |
| --- | --- |
| explicit `skipResume.fileBound` model | `workflowAuthoringModel.ts` |
| loader / serializer round-trip | `workflowAuthoringLoader.ts`, `workflowAuthoringSerializer.ts` |
| deterministic candidate planning | `workflowSkipResumeReadiness.ts` |
| existing artifact non-overwrite | planner conflict/existing tests |
| agent missing `resultKey` blocker | planner tests |
| result step missing file sink blocker | planner tests |
| strict preview / apply parity | `workflowSkipResumeReadinessPreview.ts` and tests |
| Artifacts tab selection and before/after preview | Builder Webview script/tests |
| stale response invalidation | Builder client tests and PR #82 evidence |
| Linux / Windows package and Extension Host | PR #82 final Actions evidence |

旧branchだけに存在する一時workflowやRED-only fixtureはreplacement対象にしない。

### Step 2: Focused verificationを実行する

```bash
cd extensions/workflow-register
npm ci
npm run compile
node --test \
  test/workflowAuthoringLoader.test.js \
  test/workflowAuthoringSerializer.test.js \
  test/workflowSkipResumeReadiness.test.js \
  test/workflowSkipResumeReadinessPreview.test.js \
  test/workflowBuilderSkipResumeReadinessWebview.test.js \
  test/workflowBuilderSkipResumeReadinessClient.test.js
npm run dependency:policy
npm run architecture:policy
npm run source:policy
npm run schema:policy
npm run package
npm run package:policy
```

### Step 3: Supersession evidenceを完成する

Evidenceに次を記録する。

- old branch exact head SHA
- PR #81 state and NO-GO reason
- replacement PR #82 merge information
- current main SHA
- requirement matrix
- focused test count and exit status
- old-only paths and whyportしないか
- disposition: `superseded`
- deletion gate: `GO`または具体的blocker

PR #81へevidence linkをコメントする。PR本文を再オープンせず、closed predecessorであることを維持する。

### Step 4: Verify and commit

```bash
node tools/branch-retirement/audit-branch-retirement.mjs \
  --repository katamor1/bob_builtin_analyze \
  --remote origin \
  --base main \
  --map tools/branch-retirement/branch-retirement-map.json \
  --json /tmp/branch-retirement.json \
  --markdown /tmp/branch-retirement.md
node --test tools/branch-retirement/test/*.test.mjs
git diff --check
```

Commit:

```text
docs: prove p1-1 predecessor supersession
```

---

## Task 4: Evidence Scope Phase 5の3系統をPR #72へ照合する

**Branches:**

- `agent/bob-evidence-scope-phase5-20260712`
- `agent/repository-symbol-index-producer-contracts-red-20260712`
- `codex/evidence-scope-phase5-checkpoint-20260712`
- `codex/execute-shared-plan-6a53743e`

**Replacement:** PR #72 `feat: complete bob evidence scope and artifact stale ledger`

### Step 1: Contract coverageを比較する

次の現行pathを必須とする。

```text
extensions/bob-code-consistency-review/src/evidenceScope/repositorySourceExtractor.ts
extensions/bob-code-consistency-review/src/evidenceScope/repositoryIndexCache.ts
extensions/bob-code-consistency-review/src/evidenceScope/repositorySymbolIndexProducer.ts
extensions/bob-code-consistency-review/src/evidenceScope/artifactLedger.ts
extensions/bob-code-consistency-review/test/repositorySymbolIndexProducer.test.js
extensions/bob-code-consistency-review/test/artifactLedger.test.js
docs/superpowers/plans/2026-07-12-bob-evidence-scope-phase5.md
docs/superpowers/specs/2026-07-12-bob-evidence-scope-phase5-design.md
```

RED contract branchのtest名を抽出し、current testに同じbehavior contractが存在することを表へ記録する。行単位コピーではなく、assertionの意味を比較する。

### Step 2: Focused verificationを実行する

```bash
cd extensions/bob-code-consistency-review
npm ci
npm run compile
node --test \
  test/repositorySymbolIndexProducer.test.js \
  test/artifactLedger.test.js
npm run dependency:policy
npm run architecture:policy
npm run source:policy
npm run package
npm run package:policy
```

### Step 3: Temporary/diagnostic pathsを拒否する

次のようなcheckpoint-only workflow、export payload、raw logがcurrent mainに残っていないことをaudit mapの`forbiddenMainPaths`で検証する。

```text
.github/workflows/phase5-checkpoint-diagnostic.yml
.github/workflows/export-evidence-scope-current.yml
docs/implementation/diagnostics/phase5-windows-full.log
docs/implementation/diagnostics/workflow-register-windows.log
```

### Step 4: Dispositionを確定する

- final source branch `codex/execute-shared-plan-6a53743e`: `merged-source`
- partial implementation / RED / checkpoint branches: `superseded`
- unique behaviorが見つかった場合: 全4branchを`blocked-unique`にして削除計画へ進めない

Commit:

```text
docs: reconcile evidence scope checkpoint branches
```

---

## Task 5: Reproducible Runtime Phase 4とAutomatic Pauseのverification系統を照合する

**Files:**

- Modify: `docs/release-evidence/workflow-reproducible-runtime-phase4-2026-07-12.md`
- Update: `tools/branch-retirement/branch-retirement-map.json`

### Step 1: Phase 4 evidenceのhistorical記述を保ったままfinal statusを追記する

既存証跡の当時のNO-GO節は削除しない。文末へ`Final reconciliation and retirement status`を追加し、次を記録する。

- precursor branch: `agent/workflow-reproducible-runtime-phase4-20260712`
- final hardening PR: #77
- #77 merge SHA
- current mainのruntime / test / operator document path
- Linux / Windows final gate
- diagnostic PR #78の役割
- precursor/diagnostic branchをmergeしない理由
- deletion disposition

### Step 2: Focused verificationを実行する

```bash
cd extensions/workflow-register
npm ci
npm run compile
node --test \
  test/workflowRunJournal.test.js \
  test/workflowRunStateMigration.test.js \
  test/workflowRunLockHeartbeatContention.test.js
node --test test/workflowAutomaticPause*.test.js test/workflowRunLockHeartbeatContention.test.js
npm run dependency:policy
npm run architecture:policy
npm run source:policy
npm run schema:policy
npm run package
npm run package:policy
```

### Step 3: Automatic Pause mappingを記録する

- `agent/workflow-automatic-pause-ci-verification-20260712`はPR #80のverification-only branch
- production integrationはPR #75
- latest-main re-verificationはPR #92
- branch固有のproduction codeが0であること
- verification workflowがcurrent mainに残っていないこと

### Step 4: Diagnostic branch mappingを記録する

`diagnostic/phase4-windows-20260712`はPR #78のlog capture専用であり、#77のproduct diffへ持ち込まない。current mainのrelease evidenceとPR commentに必要な結果が残ることを確認する。

Commit:

```text
docs: finalize runtime verification branch reconciliation
```

---

## Task 6: Bazaar、retention、AI authoringの旧source/duplicate/automation branchを照合する

**Branches:**

- `agent/bob-bazaar-review-review-run-v3-dashboard`
- `agent/workflow-run-retention-p1-6-20260713`
- `codex/bazaar-ai-project-rule-authoring`
- `automation/fix-pr97-windows-portable-tests-20260716`
- `integration/bazaar-campaign-dashboard-20260716`

### Step 1: Campaign Dashboard duplicateをcurrent mainへ照合する

旧PR #84の要求を、merged PR #83、current mainのnewer Dashboard、PR #97、完了計画record PR #118へ対応付ける。

Current main required paths:

```text
extensions/bob-bazaar-review/src/dashboard/campaignDashboardCore.ts
extensions/bob-bazaar-review/src/dashboard/campaignDashboard.ts
extensions/bob-bazaar-review/src/dashboard/campaignDashboardExport.ts
extensions/bob-bazaar-review/src/ui/campaignDashboardGui.ts
extensions/bob-bazaar-review/test/campaignDashboardCore.test.js
extensions/bob-bazaar-review/test/campaignDashboard.test.js
extensions/bob-bazaar-review/test/campaignDashboardExport.test.js
extensions/bob-bazaar-review/test/campaignDashboardGui.test.js
docs/superpowers/plans/2026-07-13-bob-bazaar-review-review-run-v3-iteration3-dashboard.md
```

旧branchの`package.json`や旧Dashboard modelを適用すると現行契約を巻き戻すことをevidenceへ記録し、`superseded`とする。

### Step 2: Dashboard focused testsを実行する

```bash
cd extensions/bob-bazaar-review
npm ci
npm run compile
node --test \
  test/campaignDashboardCore.test.js \
  test/campaignDashboard.test.js \
  test/campaignDashboardExport.test.js \
  test/campaignDashboardGui.test.js
```

### Step 3: Merged source branchesを確認する

- P1-6 source → PR #93
- AI rule authoring source → PR #97
- Campaign plan integration source → PR #118

Squash mergeにより`git merge-base --is-ancestor`がfalseでも、PR merge SHA、required main paths、focused/full testsで`merged-source`を判定する。

### Step 4: Temporary automation branchを確認する

`automation/fix-pr97-windows-portable-tests-20260716`について次を記録する。

- PR #112はtemporary automation PR
- workflow runがGREEN
- fix commitは`codex/bazaar-ai-project-rule-authoring`へpushされた
- destination branchはPR #97でmerge済み
- automation workflow自体はcurrent mainに存在しない

Commit:

```text
docs: reconcile bazaar and retention source branches
```

---

## Task 7: Full repository gateとretirement manifestを完成する

**Files:**

- Create/refresh: `docs/release-evidence/branch-retirement-reconciliation-2026-07-16.json`
- Create/refresh: `docs/release-evidence/branch-retirement-reconciliation-2026-07-16.md`

### Step 1: 全auditをfreshに再実行する

```bash
node tools/branch-retirement/audit-branch-retirement.mjs \
  --repository katamor1/bob_builtin_analyze \
  --remote origin \
  --base main \
  --map tools/branch-retirement/branch-retirement-map.json \
  --json docs/release-evidence/branch-retirement-reconciliation-2026-07-16.json \
  --markdown docs/release-evidence/branch-retirement-reconciliation-2026-07-16.md
```

### Step 2: Repository testsを実行する

```bash
node --test tools/branch-retirement/test/*.test.mjs

cd extensions/workflow-register
npm test
npm run dependency:policy
npm run architecture:policy
npm run source:policy
npm run schema:policy
npm run audit:prod
npm run package
npm run package:policy

cd ../bob-code-consistency-review
npm test
npm run dependency:policy
npm run architecture:policy
npm run source:policy
npm run audit:prod
npm run package
npm run package:policy

cd ../bob-bazaar-review
npm test
npm run dependency:policy
npm run architecture:policy
npm run source:policy
npm run audit:prod
npm run package
npm run package:policy

cd ../..
git diff --check
```

### Step 3: Hosted gatesを実行する

Execution branch上で次を明示dispatchする。

```bash
gh workflow run extensions-quality.yml --ref <execution-branch>
gh workflow run workflow-contracts.yml --ref <execution-branch>
gh workflow run code-consistency-review-scaffold.yml --ref <execution-branch>
```

完了後、run ID、job ID、Linux / Windows unit/package/VSIX/Extension Host結果をevidenceへ記録する。

### Step 4: Whole-diff reviewを行う

Review scope:

- deletion対象を増やしていないか
- `main`やprotected branchをallowlistへ入れていないか
- replacement PR mappingが正しいか
- old branchのunique product behaviorを見落としていないか
- temporary workflow/log/raw sourceをportしていないか
- audit toolがread-onlyか
- JSON/Markdown evidenceが一致するか

Record:

```text
Critical: 0
Important: 0
```

1件でもopenなら`ready_for_deletion: false`を維持する。

### Step 5: Final manifest gate

Top-level JSONは次を満たす。

```json
{
  "schemaVersion": "bob-builtin-analyze/branch-retirement-audit/v1",
  "repository": "katamor1/bob_builtin_analyze",
  "auditedMainSha": "<fresh-main-sha>",
  "ready_for_deletion": true,
  "blockedBranches": [],
  "entries": []
}
```

`<fresh-main-sha>`は実行時にCLIが書く値であり、手入力しない。

### Step 6: Commit and PR

```text
docs: record superseded branch reconciliation
```

PR title:

```text
docs: reconcile intentionally unintegrated change groups
```

PR本文へ次を記載する。

- 14 target branches
- each disposition
- replacement PRs
- tests and Actions IDs
- `blocked-unique` count
- next plan link
- このPRではremote branchを削除しないこと

---

## Acceptance Criteria

1. 固定対象14branchの全てが`merged-source`、`superseded`、`diagnostic-only`、`temporary-automation`、`already-absent`のいずれかになる。
2. `blocked-unique`が0件である。
3. PR #81のP1-1要求がPR #82/current mainへ1対1で対応付けられる。
4. Evidence Scope RED/checkpoint branchのcontractがPR #72/current testsに包含される。
5. Phase 4 precursorとWindows diagnosticがPR #77へ対応付けられる。
6. Automatic Pause verification branchがPR #75/#92へ対応付けられる。
7. Campaign Dashboard duplicateが現行Dashboardより古いことが記録される。
8. PR #93/#97/#118のsource branchがsquash-equivalent evidenceで確認される。
9. temporary diagnostic/automation workflow、raw log、payloadがcurrent mainへ追加されない。
10. audit toolはread-onlyであり、削除APIやpushを呼ばない。
11. JSONとMarkdown evidenceが同じbranch order、SHA、disposition、blockerを持つ。
12. full local gatesとLinux/Windows hosted gatesが成功する。
13. whole-diff reviewがCritical 0 / Important 0である。
14. reconciliation evidenceが`main`へmergeされるまで、後続削除計画を実行しない。
