# 照合済みremote branchの安全な削除計画

> **Execution:** `superpowers:executing-plans` または `superpowers:subagent-driven-development` を使う。先行計画 `docs/superpowers/plans/2026-07-16-superseded-change-group-reconciliation.md` のevidenceが`main`へmergeされ、`ready_for_deletion: true`になった後だけ実行する。

**Date:** 2026-07-16  
**Repository:** `katamor1/bob_builtin_analyze`  
**Execution branch:** `integration/retire-superseded-branches-20260716`  
**Goal:** retirement manifestで削除許可されたexact remote headだけを、open PR、protected branch、head movement、main movementを再検証したうえでatomicに削除する。削除前後のref、SHA、PR mapping、main SHAをdurable evidenceとして`main`へ残し、旧branchへの依存を解消する。

**Architecture:** 削除対象はpatternやprefixで選ばず、先行計画が生成したmachine-readable allowlistだけを使う。pure deletion policy、read-only dry-run、atomic Git push adapterを分離する。apply時は各refへ`--force-with-lease=<expected SHA>`を指定し、複数削除を`git push --atomic`で1 transactionとして実行する。atomic pushが使えない場合はsequential deleteへfallbackせず停止する。

---

## 1. 前提条件

次が全て満たされない限り実行しない。

1. `docs/release-evidence/branch-retirement-reconciliation-2026-07-16.json` が`main`に存在する。
2. 同JSONの`schemaVersion`が`bob-builtin-analyze/branch-retirement-audit/v1`である。
3. `ready_for_deletion`が`true`である。
4. `blockedBranches`が空配列である。
5. 先行計画のwhole-diff reviewがCritical 0 / Important 0である。
6. 先行計画のLinux / Windows hosted gatesが成功している。
7. repository default branchが`main`である。
8. `main`がprotectedであり、削除allowlistに含まれていない。
9. execution branch以外にopen PRがない。またはopen PRがある場合、そのhead/baseはtarget allowlistから除外される。
10. 作業者がrepository admin権限を持つ。
11. local checkoutがcleanで、remoteが`katamor1/bob_builtin_analyze`を指す。

---

## 2. 固定削除候補と順序

実際にremote refが存在し、fresh manifestで`deletable: true`になったentryだけを削除する。順序はevidence上の表示順であり、Git pushは全refをatomic batchとして送る。

### Diagnostic / verification first

1. `diagnostic/p1-1-windows-flake-20260712`
2. `diagnostic/phase4-windows-20260712`
3. `agent/workflow-automatic-pause-ci-verification-20260712`

### Temporary automation

4. `automation/fix-pr97-windows-portable-tests-20260716`

### Superseded RED / precursor / checkpoint branches

5. `agent/repository-symbol-index-producer-contracts-red-20260712`
6. `agent/workflow-recovery-ux-p1-builder-readiness-20260712`
7. `agent/workflow-reproducible-runtime-phase4-20260712`
8. `agent/bob-evidence-scope-phase5-20260712`
9. `codex/evidence-scope-phase5-checkpoint-20260712`
10. `agent/bob-bazaar-review-review-run-v3-dashboard`

### Merged source branches

11. `agent/workflow-run-retention-p1-6-20260713`
12. `codex/bazaar-ai-project-rule-authoring`
13. `codex/execute-shared-plan-6a53743e`
14. `integration/bazaar-campaign-dashboard-20260716`

### Plan / execution branch cleanup

15. `plan/retire-intentionally-unintegrated-20260716` — この2計画を運ぶPRがmergeされたあと、通常のmerged-head cleanupとして削除する。
16. `integration/retire-superseded-branches-20260716` — deletion evidence PRがmergeされたあと、最後に削除する。

15と16はmain retirement batchへ混ぜない。各PRのmerged stateとexact head SHAを確認し、PR merge後に個別`--force-with-lease`で削除する。

---

## 3. 実装するファイル

- Create: `tools/branch-retirement/deletionPolicy.mjs`
- Create: `tools/branch-retirement/delete-retired-branches.mjs`
- Create: `tools/branch-retirement/test/deletionPolicy.test.mjs`
- Create: `tools/branch-retirement/test/delete-retired-branches.test.mjs`
- Create: `docs/release-evidence/branch-retirement-execution-2026-07-16.json`
- Create: `docs/release-evidence/branch-retirement-execution-2026-07-16.md`
- Reuse: `tools/branch-retirement/branch-retirement-map.json`
- Reuse: `tools/branch-retirement/audit-branch-retirement.mjs`
- Reuse: `docs/release-evidence/branch-retirement-reconciliation-2026-07-16.json`

GitHub Actions workflowは追加しない。one-shot workflow branchを新たなcleanup対象にしないため、認証済みlocal checkoutまたはCodex execution environmentから`git` / `gh`を実行する。

---

## Task 1: Pure deletion policyをTDDで実装する

**Files:**

- Create: `tools/branch-retirement/deletionPolicy.mjs`
- Create: `tools/branch-retirement/test/deletionPolicy.test.mjs`

### Step 1: RED — unsafe deletion planを拒否する

次のtestを先に書く。

1. top-level `ready_for_deletion !== true`を拒否
2. `blockedBranches`が空でないmanifestを拒否
3. `main`、default branch、protected branchを拒否
4. manifestにないbranchを拒否
5. `deletable !== true` entryを拒否
6. 40桁hexでないexpected SHAを拒否
7. open PR head/baseを拒否
8. execution branch自身をmain batchへ含める入力を拒否
9. duplicate branchを拒否
10. audit時SHAとfresh remote SHAの不一致を拒否
11. audit時mainがfresh mainのancestorでない状態を拒否
12. unknown remote branchを自動追加しない
13. already-absent entryをdelete refspecへ含めない
14. 0件batchは成功扱いだがpush commandを生成しない
15. `git push --atomic`と全refの`--force-with-lease`が揃わないcommandを拒否

Expected API:

```js
import {
  validateDeletionInputs,
  buildAtomicDeletionPlan,
  summarizeDeletionResult
} from "../deletionPolicy.mjs"
```

Run:

```bash
node --test tools/branch-retirement/test/deletionPolicy.test.mjs
```

Expected: FAIL because module does not exist.

### Step 2: GREEN — deletion planを純粋関数として実装する

`buildAtomicDeletionPlan()`は次を返す。

```js
{
  repository: "katamor1/bob_builtin_analyze",
  remote: "origin",
  auditedMainSha,
  currentMainSha,
  branches: [
    { branch, expectedSha, disposition, replacementPullRequests }
  ],
  alreadyAbsent: [],
  command: [
    "git", "push", "--atomic",
    "--force-with-lease=refs/heads/<branch>:<sha>",
    "origin",
    ":refs/heads/<branch>"
  ]
}
```

`command`は文字列shellへ連結せずargv配列として扱う。branch名をshell展開しない。

### Step 3: Verify and commit

```bash
node --test tools/branch-retirement/test/deletionPolicy.test.mjs
git diff --check
```

Commit:

```text
feat: define guarded branch deletion policy
```

---

## Task 2: Dry-run / apply CLIを実装する

**Files:**

- Create: `tools/branch-retirement/delete-retired-branches.mjs`
- Create: `tools/branch-retirement/test/delete-retired-branches.test.mjs`

### Step 1: RED — CLI safety contractを書く

fake command runnerで次を検証する。

- default modeはdry-run
- `--apply`だけでは削除しない
- `--apply --confirm-repository katamor1/bob_builtin_analyze`の両方が必要
- repository URL mismatchで拒否
- dirty worktreeで拒否
- current branchが`integration/retire-superseded-branches-20260716`以外ならapply拒否
- main fetch後にancestor checkが失敗したら拒否
- open PR query失敗で拒否
- protected branch query失敗で拒否
- preflight中に1件でもhead movedならpushを呼ばない
- atomic push failureをsequential retryしない
- push成功後のverification failureを隠さない
- JSON / Markdown evidenceをatomic writeする
- stdoutへraw token、credential、remote URL userinfoを出さない

Run:

```bash
node --test tools/branch-retirement/test/delete-retired-branches.test.mjs
```

Expected: FAIL because CLI does not exist.

### Step 2: CLI interfaceを実装する

Dry-run:

```bash
node tools/branch-retirement/delete-retired-branches.mjs \
  --repository katamor1/bob_builtin_analyze \
  --remote origin \
  --manifest docs/release-evidence/branch-retirement-reconciliation-2026-07-16.json \
  --execution-json docs/release-evidence/branch-retirement-execution-2026-07-16.json \
  --execution-markdown docs/release-evidence/branch-retirement-execution-2026-07-16.md \
  --dry-run
```

Apply:

```bash
node tools/branch-retirement/delete-retired-branches.mjs \
  --repository katamor1/bob_builtin_analyze \
  --remote origin \
  --manifest docs/release-evidence/branch-retirement-reconciliation-2026-07-16.json \
  --execution-json docs/release-evidence/branch-retirement-execution-2026-07-16.json \
  --execution-markdown docs/release-evidence/branch-retirement-execution-2026-07-16.md \
  --apply \
  --confirm-repository katamor1/bob_builtin_analyze
```

Preflight probes:

```bash
git status --porcelain=v1
git branch --show-current
git remote get-url origin
git fetch --no-tags origin main
git rev-parse refs/remotes/origin/main
git merge-base --is-ancestor <audited-main-sha> refs/remotes/origin/main
git ls-remote --heads origin
gh api repos/katamor1/bob_builtin_analyze
gh api --paginate repos/katamor1/bob_builtin_analyze/pulls?state=open\&per_page=100
gh api --paginate repos/katamor1/bob_builtin_analyze/branches?per_page=100
```

Atomic delete argvは次の形にする。

```bash
git push --atomic \
  --force-with-lease=refs/heads/diagnostic/p1-1-windows-flake-20260712:<expected-sha> \
  --force-with-lease=refs/heads/diagnostic/phase4-windows-20260712:<expected-sha> \
  origin \
  :refs/heads/diagnostic/p1-1-windows-flake-20260712 \
  :refs/heads/diagnostic/phase4-windows-20260712
```

実装はmanifestから全refを生成し、shell文字列を組み立てない。

### Step 3: Post-delete verificationを実装する

Push後に次をfreshに取得する。

- `git ls-remote --heads origin`
- open PR head/base
- repository default branch
- current main SHA
- target branch absence
- non-target branch list

Targetが1件でも残る、main SHAが削除中に変化する、open PR refが消える、default branchが変わる場合はexecution evidenceを`status: verification_failed`とし、成功を主張しない。

### Step 4: Verify and commit

```bash
node --test \
  tools/branch-retirement/test/deletionPolicy.test.mjs \
  tools/branch-retirement/test/delete-retired-branches.test.mjs
git diff --check
```

Commit:

```text
feat: add atomic retired branch cleanup
```

---

## Task 3: 最新mainからexecution branchを作り、fresh auditを固定する

### Step 1: Branchを作る

```bash
git fetch origin main
git switch --create integration/retire-superseded-branches-20260716 origin/main
```

### Step 2: 先行計画のauditをfreshに再実行する

```bash
node tools/branch-retirement/audit-branch-retirement.mjs \
  --repository katamor1/bob_builtin_analyze \
  --remote origin \
  --base main \
  --map tools/branch-retirement/branch-retirement-map.json \
  --json docs/release-evidence/branch-retirement-reconciliation-2026-07-16.json \
  --markdown docs/release-evidence/branch-retirement-reconciliation-2026-07-16.md
```

Fresh resultが`ready_for_deletion: true`でなければ、この計画を停止する。既存manifestを手編集してtrueへ変えない。

### Step 3: Draft PRを開く

```bash
git add tools/branch-retirement docs/release-evidence
git commit -m "feat: prepare atomic retired branch cleanup"
git push -u origin integration/retire-superseded-branches-20260716
gh pr create \
  --repo katamor1/bob_builtin_analyze \
  --base main \
  --head integration/retire-superseded-branches-20260716 \
  --draft \
  --title "chore: retire superseded remote branches" \
  --body-file docs/release-evidence/branch-retirement-reconciliation-2026-07-16.md
```

PRを作る理由は、削除前のtool、allowlist、expected SHA、replacement mappingをreview可能にするためである。PR merge前にbranch deletionを実行するが、execution branch自身は除外する。

---

## Task 4: Dry-run evidenceを作り、削除許可をreviewする

### Step 1: Dry-runを実行する

```bash
node tools/branch-retirement/delete-retired-branches.mjs \
  --repository katamor1/bob_builtin_analyze \
  --remote origin \
  --manifest docs/release-evidence/branch-retirement-reconciliation-2026-07-16.json \
  --execution-json docs/release-evidence/branch-retirement-execution-2026-07-16.json \
  --execution-markdown docs/release-evidence/branch-retirement-execution-2026-07-16.md \
  --dry-run
```

Dry-run outputは次を含む。

- current main SHA
- audit main SHA
- target exact SHA
- expected disposition
- replacement PRs
- open PR references
- protected flag
- already absent refs
- exact atomic push argvのredacted representation
- `would_delete` count
- `blocked` count

### Step 2: Dry-run evidenceをcommitする

```bash
git add docs/release-evidence/branch-retirement-execution-2026-07-16.*
git commit -m "docs: record branch retirement dry run"
git push
```

### Step 3: Independent reviewを行う

Reviewerは次を確認する。

1. 14候補以外が含まれていない
2. `main`、protected branch、open PR branchが含まれていない
3. expected SHAがPR/evidenceのsource headと一致する
4. #81は#82に置換済み
5. #84 duplicateは#83/#97/#118に置換済み
6. Evidence Scopeは#72に置換済み
7. Phase 4は#77に置換済み
8. Automatic Pause verificationは#75/#92に置換済み
9. #93/#97/#118 sourceはmerged済み
10. temporary automation branchのfixが#97へ到達済み
11. atomic pushとforce-with-leaseが全refに付いている
12. non-atomic fallbackがない

Record in PR:

```text
Critical: 0
Important: 0
Deletion authorization: GO
```

GOがない状態ではapplyしない。

---

## Task 5: Closed predecessor PRへretirement noticeを残す

削除前に、branch lineageを人間が追えるよう、次のclosed PRへコメントする。

| PR | branch role | replacement |
| --- | --- | --- |
| #81 | P1-1 predecessor | #82 |
| #87 | P1-1 diagnostic | #82 |
| #84 | duplicate Dashboard | #83/#97/#118 |
| #89 | Evidence Scope checkpoint | #72 |
| #80 | Automatic Pause verification | #75/#92 |
| #78 | Phase 4 diagnostic | #77 |
| #112 | PR #97 temporary automation | #97 |

Comment format:

```text
This branch is scheduled for retirement under
`docs/release-evidence/branch-retirement-reconciliation-2026-07-16.md`.
Its durable replacement is PR #<replacement>. No unique product change is being discarded.
Exact retired head: `<sha>`.
```

`<replacement>`と`<sha>`はmanifestから生成し、手入力しない。PR commentの失敗はbranch deletionを止める。リンク証跡がない状態でrefを消さない。

No-PR branchesはMarkdown/JSON evidenceがlineage recordになる。

---

## Task 6: Exact refsをatomic deleteする

### Step 1: Apply直前にfetchとdry-runを再実行する

```bash
git fetch --prune origin
node tools/branch-retirement/delete-retired-branches.mjs \
  --repository katamor1/bob_builtin_analyze \
  --remote origin \
  --manifest docs/release-evidence/branch-retirement-reconciliation-2026-07-16.json \
  --execution-json docs/release-evidence/branch-retirement-execution-2026-07-16.json \
  --execution-markdown docs/release-evidence/branch-retirement-execution-2026-07-16.md \
  --dry-run
```

Dry-run commit以降にmainまたはtarget SHAが変化していたら、manifestを再生成してreviewをやり直す。

### Step 2: Atomic applyを実行する

```bash
node tools/branch-retirement/delete-retired-branches.mjs \
  --repository katamor1/bob_builtin_analyze \
  --remote origin \
  --manifest docs/release-evidence/branch-retirement-reconciliation-2026-07-16.json \
  --execution-json docs/release-evidence/branch-retirement-execution-2026-07-16.json \
  --execution-markdown docs/release-evidence/branch-retirement-execution-2026-07-16.md \
  --apply \
  --confirm-repository katamor1/bob_builtin_analyze
```

CLIが生成した`git push --atomic`以外のdelete commandを手で追加しない。

### Step 3: Partial successを許容しない

- Atomic push成功: 全targetをpost-verifyする
- Atomic push失敗: 0件削除を確認し、reasonをevidenceへ記録する
- Serverがatomic pushをunsupportedとして拒否: 停止する
- Lease mismatch: moved branchを`blocked`へ戻し、auditからやり直す
- Permission failure: admin権限を直して同じmanifestを再評価する

Sequential `git push origin --delete`やGitHub DELETE APIへfallbackしない。

---

## Task 7: Post-delete evidenceをcommitし、execution PRをmergeする

### Step 1: Verification commandsを実行する

```bash
git ls-remote --heads origin
gh pr list --repo katamor1/bob_builtin_analyze --state open --json number,headRefName,baseRefName
gh api repos/katamor1/bob_builtin_analyze --jq '.default_branch'
git fetch origin main
git rev-parse refs/remotes/origin/main
node --test tools/branch-retirement/test/*.test.mjs
git diff --check
```

Target 14branchが0件、execution PR headだけが必要に応じて残ることを確認する。

### Step 2: Execution evidenceを完成する

JSON schema:

```json
{
  "schemaVersion": "bob-builtin-analyze/branch-retirement-execution/v1",
  "repository": "katamor1/bob_builtin_analyze",
  "status": "success",
  "mainShaBefore": "recorded-by-cli",
  "mainShaAfter": "recorded-by-cli",
  "atomic": true,
  "deleted": [],
  "alreadyAbsent": [],
  "blocked": [],
  "remainingOpenPullRequests": [],
  "verification": {
    "targetsAbsent": true,
    "defaultBranchIsMain": true,
    "mainUnchangedDuringDeletion": true
  }
}
```

`mainShaBefore`と`mainShaAfter`はCLIが取得した40桁SHAを出力し、literal `recorded-by-cli`を保存しない。

Markdownには次を含める。

- deleted branchとexact head SHA
- already absent branch
- replacement PRs
- atomic push result
- post-delete branch list summary
- open PR summary
- main SHA before/after
- tool/test commit SHA
- reviewer authorization
- residual branchesとその保持理由

### Step 3: Commit and merge

```bash
git add docs/release-evidence/branch-retirement-execution-2026-07-16.*
git commit -m "docs: record retired remote branches"
git push
gh pr ready --repo katamor1/bob_builtin_analyze
gh pr merge --repo katamor1/bob_builtin_analyze --squash
```

Required PR checks:

- branch-retirement tool tests
- `git diff --check`
- docs/source policy applicable to repository
- independent review GO

---

## Task 8: Plan branchとexecution branchを最後に削除する

### Step 1: Plan PR mergeを確認する

```bash
gh pr list \
  --repo katamor1/bob_builtin_analyze \
  --state merged \
  --head plan/retire-intentionally-unintegrated-20260716 \
  --json number,mergedAt,headRefOid
```

Plan branchが残っている場合、returned `headRefOid`をexpected SHAに使う。

```bash
git push \
  --force-with-lease=refs/heads/plan/retire-intentionally-unintegrated-20260716:<plan-head-sha> \
  origin \
  :refs/heads/plan/retire-intentionally-unintegrated-20260716
```

### Step 2: Execution PR mergeを確認する

```bash
gh pr list \
  --repo katamor1/bob_builtin_analyze \
  --state merged \
  --head integration/retire-superseded-branches-20260716 \
  --json number,mergedAt,headRefOid
```

Execution branchが残っている場合、returned `headRefOid`をexpected SHAに使う。

```bash
git push \
  --force-with-lease=refs/heads/integration/retire-superseded-branches-20260716:<execution-head-sha> \
  origin \
  :refs/heads/integration/retire-superseded-branches-20260716
```

`<plan-head-sha>`と`<execution-head-sha>`は上の`gh pr list`出力をshell変数へ入れて使用し、literal文字列では実行しない。

### Step 3: Final inventoryを確認する

```bash
git ls-remote --heads origin
gh pr list --repo katamor1/bob_builtin_analyze --state open
```

Final expected state:

- default branch: `main`
- target 14branch: absent
- plan branch: absent
- execution branch: absent
- open PR: 0、または本作業と無関係で明示的に保持されたPRのみ
- protected branches: unchanged

---

## Acceptance Criteria

1. 削除対象はfresh reconciliation manifestのallowlistだけから生成される。
2. branch prefix、glob、`merged=false`だけを根拠に削除しない。
3. exact expected SHAを全refへ指定する。
4. deletionは`git push --atomic`でall-or-nothingに行われる。
5. non-atomic fallbackが存在しない。
6. `main`、protected branch、open PR head/base、execution branchはmain batchへ含まれない。
7. moved branchが1件でもあれば0件削除で停止する。
8. closed predecessor PRへreplacementとretired SHAのcommentを残す。
9. No-PR branchはdurable JSON/Markdown evidenceへreplacement mappingを残す。
10. target 14branchの全てがdeletedまたはalready absentになる。
11. main SHAは削除中に変化しない。
12. default branchは`main`のままである。
13. post-delete verificationがtarget absenceを確認する。
14. execution evidenceが`main`へmergeされる。
15. plan branchとexecution branchもmerge確認後にforce-with-leaseで削除される。
16. 最終inventoryで本作業由来のremote branchが0件になる。
