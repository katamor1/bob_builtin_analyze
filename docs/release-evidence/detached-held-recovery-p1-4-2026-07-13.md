Replaced: `workflowRegister.openOperationHub` and `workflowRegister.openWorkflowBuilder` are the current workflow operator routes; the legacy held-run UI references below are retained only as historical P1-4 release evidence.

# Detached Held Run Recovery P1-4 Release Evidence

## 1. Scope

- Repository: `katamor1/bob_builtin_analyze`
- Component: `extensions/workflow-register`
- Pull request: #91
- Branch: `agent/detached-held-recovery-p1-4-20260713`
- Final user-authored evidence head: `529fc98886a83f8c9eeaddc25220114ecad7c37e`
- Date: 2026-07-13

Recovery UX P1-4として、永続runが`held`だがlive Bob task／manual-step handleを失った場合に、現在の証拠を分類し、安全なprimary actionを1つだけ提示します。

## 2. Delivered behavior

- `run.json`を正本とするpure classifier。
- `not-held`、`connected`、`detached-resumable`、`detached-artifact-recoverable`、`blocked`の分類。
- Operation Hubのheld runからgeneric `runNextStep`を除き、分類別primary actionを1つだけ表示。
- live Bob gateを持つ既存command／guardrail held flowはsingle-step resumeを維持。
- connected manual stepは既存Manual Step Panelを維持。
- live gateもactive handleもないdetached heldは通常resumeで黙って完了しない。
- 専用`workflowRegister.recoverDetachedHeldRun` command。
- preview → modal confirmation → mutation gate → guarded engine resume → fresh reclassification → provenance保存。
- Operation Hub mutation targetによるworkspace root／run ID／revision検証とsingle-flight直列化。
- artifact manifestは既存互換validatorでerrorがない場合だけ復旧証拠に採用。
- task snapshotはstep、workflow ID、存在する場合はdefinition hashが一致する場合だけ採用。
- current／next stepのrequired stateとpersisted manual form／approval resultを検証。
- metadata-only `workflow-register/held-recovery/v1` provenance。
- Run Diagnosticsと共通provenance projection。

## 3. Safety invariants

- handle消失だけを理由にheld stepを完了しない。
- previewとapplyはfresh runから再分類する。
- preview後のrevision変化を拒否する。
- execution中のrunへ復旧mutationを重ねない。
- state値、form値、snapshot本文、artifact本文をpreview／provenance／diagnosticsへ保存しない。
- malformed、control-character入り、schema不一致、run ID不一致のprovenanceを無視する。
- existing connected manual-step flow、live command gate、paused／checkpoint契約を維持する。

## 4. Regression history

### Classifier and Operation Hub

- not-held、connected、detached-resumable、artifact/snapshot recoverable、blockedを固定。
- definition欠落／不一致、current step欠落、required state不足を固定。
- manual form必須field、manual approval decision、next-step required stateを固定。
- Operation Hubがexactly one primary actionを表示することを固定。

### Dedicated command

- preview → confirmation → gate → `resumeRunGuarded` → before-resume reclassification → after-resume provenanceの順序を固定。
- `completeHeldStep: true`と`executionMode: "singleStep"`を固定。
- ordinary resumeのdetached guardを固定。

### Compatibility finding closed during finalization

初期guardは`gateRegistry.pendingForRun()`より先にdetached判定を行い、live Bob gateを持つcommand-step held flowまで拒否しました。

- failing full suite: `bobGateLifecycle.test.js` — `live held resume executes only the Bob-visible owner step`
- expected: `running`
- actual: ordinary resume returned a warning string

修正後はlive gateを先に確定します。

- active manual handle: Manual Step Panel
- live command／guardrail gate: 従来のsingle-step resume
- live gateなし: dedicated detached recoveryへ誘導

## 5. Verification checkpoints

### Diagnostic checkpoint

- `extensions-quality` run `29221985015`
- compile: success
- P1-4 focused tests: success
- full suite: 879 / 880 passed、1 failure
- failureを上記live held gate互換性へ特定

### Verified compatibility checkpoint

- `extensions-quality` run `29222356852`: success
- focused suite、complete workflow-register suite、dependency／architecture／source／schema policy、package、VSIX policy: success
- standard `extensions-quality.yml`を復元し、一時diagnostic workflowを削除

### Final contract checkpoint

- `extensions-quality` run `29222580341`: success
- dedicated recoveryをOperation Hub mutation queueへ追加
- task snapshot workflow／definition compatibilityを追加
- 回帰test追加後、focused／full suite、policy、package、VSIX policy: success

## 6. Final hosted matrix

Final evidence head `529fc98886a83f8c9eeaddc25220114ecad7c37e`:

- `workflow-contracts` run `29222982305`: **success**
- `extensions-quality` run `29222982300`:
  - Linux `workflow-register`: **success** through unit、policy、package、VSIX policy、Extension Host smoke
  - Windows `workflow-register`: initial unit attempt failed; isolated job retry **success** through package、VSIX policy、Extension Host smoke
  - Linux／Windows `bob-bazaar-review`: **success**
  - Linux `bob-code-consistency-review`: **success**
  - source metrics: **success**
  - Windows `bob-code-consistency-review`: unit、package、VSIX policyはsuccess。Extension Host smokeのみfailure。個別retryでも同じ外部activation stepだけがfailure
- `code-consistency-review-scaffold`: workflow-register-only差分のためpath対象外。main統合済みscaffold codeは変更していない。

Windows `bob-code-consistency-review`のfailureはPR #91の変更対象外であり、対象componentのsource、unit、package、VSIX、Extension Host gatesはLinux／Windowsともgreenです。同じmain lineでは直前のauthoritative matrixでWindows `bob-code-consistency-review` Extension Host smokeが成功しており、P1-4のmerge判定から分離します。

## 7. Review decision

- P1-4 code behavior: **GO**
- Target Linux／Windows CI、package、VSIX、Extension Host: **GO**
- Whole-diff review: Critical 0 / Important 0
- Main merge: **GO**
- Product release: **NO-GO** until IBM Bob／multi-root／distribution UAT

## 8. External UAT

- real IBM Bob connected held/manual completion。
- VS Code restart後のdetached-resumable recovery。
- artifact／task snapshot recovery切替。
- same run IDを含むmulti-root分離。
- diagnosticsとprovenanceのprivacy確認。
