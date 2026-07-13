# Detached Held Run Recovery P1-4 Whole-Diff Review

## Scope

- pure held-run classifier
- runtime evidence gathering
- Operation Hub model、HTML、actions
- dedicated recovery command
- guarded engine resume
- ordinary resume compatibility
- run provenance and diagnostics
- tests、operator guide、release evidence

## Review method

1. `run.json`を正本とし、live runtime evidenceを永続stateへ混入させていないか確認した。
2. classificationとprimary actionの対応を確認した。
3. previewとapplyの間でrun、definition、evidenceを再検証することを確認した。
4. Operation Hub mutationがworkspace root、run ID、revision、single-flight queueを通ることを確認した。
5. live manual step、live command gate、detached runを区別することを確認した。
6. artifact manifestとtask snapshotの互換性境界を確認した。
7. manual form／approval resultとnext-step required stateを確認した。
8. provenance、preview、diagnosticsへstate値や本文が入らないことを確認した。
9. Linux／Windows、package、VSIX、Extension Hostの最終matrixを確認する。

## Findings fixed

### Important — live held command gate was mistaken for detached state

ordinary resume guardがlive gate取得より前に実行され、Bob-visible command-stepのheld gateまでdedicated recoveryへ送っていました。

修正:

- `gateRegistry.pendingForRun()`をguardより先に取得。
- connected manual handleはManual Step Panelへ維持。
- live command／guardrail gateは従来のsingle-step engine resumeを維持。
- live gateなしのheld runだけdedicated recoveryへ誘導。
- `bobGateLifecycle.test.js`を含むfull suiteで回帰確認。

### Important — Operation Hub dedicated recovery bypassed the mutation target

`recoverDetachedHeldRun`がread-like actionとしてdispatchされると、workspace rootと表示時revisionがcommandへ渡らず、同一run IDのmulti-root環境で曖昧になり得ました。

修正:

- `recoverDetachedHeldRun`を`MUTATING_RUN_ACTIONS`へ追加。
- canonical workspace root、run identity、expected revisionを検証。
-同一run mutation queueで直列化。
- source contract testを追加。

### Important — task snapshot evidence was not definition-bound in command reclassification

Operation Hub側はworkflow ID／definition hashを確認していましたが、dedicated commandのfresh reclassificationはstep IDだけを確認していました。

修正:

- current step一致。
- workflow ID一致。
- snapshotにdefinition hashがある場合はcurrent workflow hash一致。
- source contract testを追加。

### Important — persisted manual completion evidence was under-specified

required state keyだけでは、manual formの必須fieldやapproval decisionが保存済みか判断できませんでした。

修正:

- manual form result objectの存在。
- required fieldの非空値。
- approval resultの`approved`／`rejected` decision。
- next stepのrequired state。
- focused classifier testsを追加。

## Invariants

- handle消失だけではheld stepを完了しない。
- current classificationごとにprimary actionは1つ。
- previewは副作用なし。
- confirmation後、execution lease内で再分類する。
- successful recoveryだけがprovenanceを保存する。
- live gate flowとpaused／checkpoint flowを壊さない。
- incompatible manifest／snapshotをrecovery evidenceとして採用しない。
- state values、form values、artifact text、snapshot textを表示・保存しない。

## Verification

- P1-4 focused suite: success
- complete workflow-register suite: 880 / 880 passed after compatibility fix
- dependency／architecture／source／schema policy: success
- package／VSIX policy: success
- temporary mutation／diagnostic workflows: removed
- final standard Ubuntu／Windows matrix: pending evidence head

## Current review result

| Severity | Open findings |
| --- | ---: |
| Critical | 0 |
| Important | 0 |

Code review gate is GO. Main merge remains conditional on the final standard hosted matrix and PR metadata update.
