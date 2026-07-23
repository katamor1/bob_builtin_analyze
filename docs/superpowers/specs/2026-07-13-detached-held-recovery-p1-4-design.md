Replaced: `workflowRegister.openOperationHub` and `workflowRegister.openWorkflowBuilder` are the current workflow operator routes; the legacy held-run UI references below are retained only as historical P1-4 design evidence.

# Detached Held Run Recovery Assistant P1-4 Design

## Goal

`run.json`は`held`だが、VS Code再起動などでBob task／manual-step handleを失ったrunに対し、次に行うべき安全なprimary actionを1つだけ提示し、`run.json`の手動編集なしで復旧できるようにする。

## Problem

現在の通常resume経路はheld runへ`completeHeldStep: true`を渡す。Live handleがないdetached runでも、利用者が復旧内容を確認しないままheld stepを完了扱いにして先へ進め得る。

Operation Hubもheld runへ一律に`手順を開く`と`次へ`を表示しており、live handleがない状態を区別していない。

## Classification

Pure classifierを追加する。

```ts
classifyHeldRunRecovery(input): HeldRunRecoveryAssessment
```

入力:

- persisted `WorkflowRunState`
- loaded workflow definitionの有無とdefinition compatibility
- live Bob task／active manual stepの有無
- current step definition
- artifact manifestの有無
- current runのtask snapshot summary
- required state keyの不足

分類:

1. `connected`
   - runはheld
   - current held stepが存在
   - live taskまたはactive manual step handleがある
   - primary action: `手動ステップを完了`
2. `detached-resumable`
   - handleはない
   - definitionとstep orderがcompatible
   - current held stepを明示完了して次へ進められる
   - primary action: `保存済み状態から再開`
3. `detached-artifact-recoverable`
   - direct resumeはblocked
   - compatible artifact manifestまたはcurrent-step snapshotがある
   - primary action: `成果物を確認して途中再開`
4. `blocked`
   - definition missing／mismatch
   - current step missing
   - required state不足
   - usable artifact／snapshotなし
   - primary action: `診断を開く`

Runがheldでない場合は`not-held`を返し、recovery actionを表示しない。

## Core model

```ts
export type HeldRunRecoveryKind =
  | "not-held"
  | "connected"
  | "detached-resumable"
  | "detached-artifact-recoverable"
  | "blocked"

export interface HeldRunRecoveryAssessment {
  kind: HeldRunRecoveryKind
  runId: string
  stepId?: string
  title: string
  explanation: string
  primaryAction: HeldRunRecoveryAction
  blockers: string[]
  evidence: {
    liveTaskAvailable: boolean
    activeManualStepAvailable: boolean
    workflowLoaded: boolean
    definitionCompatible: boolean
    artifactManifestAvailable: boolean
    taskSnapshotAvailable: boolean
    missingRequiredStateKeys: string[]
  }
}
```

Classifierはrunを変更せず、optional evidenceの破損ではblockedへ倒す。

## Operation Hub

`OperationHubRunInput`へruntime-only recovery evidenceを追加し、providerが次を収集する。

- `reviewTaskRegistry.taskForRun(root, runId)`
- `activeSteps()`とcurrent run／stepの一致
- `FileTaskSnapshotStore.listSnapshots(runId)`

Modelはheld runにprimary actionを1つだけ表示する。

- connected: `openManualStepPanel`
- detached-resumable: `recoverDetachedHeldRun`
- detached-artifact-recoverable:
  - manifestがある場合: `startFromArtifacts`
  - snapshotのみの場合: `importArtifactsFromTaskSnapshots`
- blocked: `inspectRunControl`

`次へ`はheld runから削除する。Recovery explanationとblockerはrun cardに表示する。

## Recovery command

新しいcommand:

```text
workflowRegister.recoverDetachedHeldRun
```

手順:

1. Workspace TrustとOperation Hub mutation target revisionを確認する。
2. 最新runとworkflowをreloadする。
3. classifierを再実行する。
4. `detached-resumable`以外なら書き込みせず、現在のprimary actionへ誘導する。
5. Markdown previewへrun ID、step ID、現在status、完了扱いにするstep、次に開始するstep、保持state key名を表示する。
6. Modal confirmationで明示承認を得る。
7. review gate＋cross-process execution lease内でrun revisionを再確認する。
8. `engine.resumeRun(..., { completeHeldStep: true, executionMode: "singleStep" })`を実行する。
9. recovery provenanceをrun stateへ保存する。

通常の`resumeRun`はdetached heldを直接完了しない。Held runではclassifierを呼び、connectedならManual Step Panel、detachedなら専用recovery commandへ誘導する。

## Provenance

Recovery成功時:

```json
{
  "schemaVersion": "workflow-register/held-recovery/v1",
  "kind": "saved-state",
  "runId": "...",
  "stepId": "...",
  "nextStepId": "...",
  "recoveredAt": "...",
  "source": "operation-hub"
}
```

State key:

```text
workflow.heldRecovery
```

本文、form値、secret state値は記録しない。

## Failure behavior

- stale revision: refresh required; no mutation
- classification changed after preview: abort and refresh
- definition changed: blocked; open diagnostics
- run lock busy: preserve held state
- engine failure: existing transaction／event log preserves evidence
- no live handle on connected path: reclassify before action

## Compatibility

- Run-state schema versionを変更しない。
- Existing held runは読み込み可能。
- Existing connected manual completion behaviorを維持する。
- Direct engine APIの`completeHeldStep`は維持するが、UI commandはclassifier gateを必須とする。

## Acceptance tests

- connected heldはManual Step Panelだけをprimary actionにする。
- detached resumableはpreview＋confirmationなしにstepを完了しない。
- detached artifact recoverableはmanifest／snapshot導線を選ぶ。
- blockedはdiagnosticsだけをprimary actionにする。
- normal resume commandがdetached heldを黙って完了しない。
- recovery成功時にbody値を含まないprovenanceを保存する。
- stale／changed classificationでmutationしない。
- Operation Hubはheld runへprimary actionを1つだけ表示する。
