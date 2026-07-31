Replaced: `workflowRegister.openOperationHub` and `workflowRegister.openWorkflowBuilder` are the current workflow operator routes; the legacy workflow run projections below are retained only as historical P1-3 design evidence.

# Workflow Reused / Skipped Provenance P1-3 Design

## Goal

Artifact reuse、artifact hydration、task snapshot importで完了扱いになったstepを、通常実行で完了したstepと区別し、Operation Hub、Bob Workflow Runs、Run Diagnostics、Bob chat control messageで同じprovenanceを表示する。

## Current facts

`run.json`には既に次の正本情報がある。

- `workflow.artifactReuse/v1`: source run、start step、reused step IDs、hydrated state keys
- `workflow.artifactHydration/v1`: state key、artifact ID、producedBy、path、SHA-256、bytes、source run
- `workflow.taskSnapshotImport/v1`: imported artifact、producedBy、path、checksum、snapshot日時
- `workflow.definitionMismatch`: run hashとcurrent hash
- `bobTaskSync/v1`: Todo projectionとlive task availability

新しい永続schemaは追加しない。表示は毎回`run.json`から導出し、Bob Todoを正本にしない。

## Architecture

### Pure projection boundary

`src/core/runProvenance.ts`に副作用のないprojectorを追加する。

```ts
export interface WorkflowStepProvenanceProjection {
  stepId: string
  title: string
  runStatus: RunStepState["status"]
  completion: "normal" | "reused" | "not-completed"
  skippedByArtifactReuse: boolean
  sourceRunId?: string
  artifactIds: string[]
  hydratedStateKeys: string[]
  artifactVerified: boolean
  importedFromTaskSnapshot: boolean
}

export interface WorkflowRunProvenanceProjection {
  sourceRunId?: string
  startStepId?: string
  reusedStepIds: string[]
  hydratedStateKeys: string[]
  artifactIds: string[]
  definitionMismatchAllowed: boolean
  taskSnapshotImportCount: number
  taskSnapshotImportedAt?: string
  steps: WorkflowStepProvenanceProjection[]
}

export function projectWorkflowRunProvenance(run: WorkflowRunState): WorkflowRunProvenanceProjection
```

Parserは不正JSONや未知shapeをthrowせず、該当情報だけを無視する。文字列本文やartifact本文はprojectionへ含めない。

`artifactVerified`は、checksum／byte validation通過後にだけ生成される`workflow.artifactHydration` entryがstepへ紐づく場合にtrueとする。

### Operation Hub

Run cardにcompactなstep provenance listを追加する。

- normal completed: `Completed`
- reused completed: `Reused · skipped by artifact reuse`
- verified hydration: `Artifact verified`
- source: `from <runId>`
- hydrated keys: key名だけ

既存のrun-level artifact reuse badgeは維持する。Bob Todo badgeは`drift.status === synced`でも`liveTaskAvailable === false`なら`Saved projection only; live Bob task unavailable`をwarning表示し、誤ってlive syncedと表示しない。

### Runs View

Tree itemのdescriptionは`reused N`を維持し、tooltipへ次を追加する。

- reused step IDs
- source run
- hydrated state keys
- verified artifact IDs
- task snapshot import件数
- definition mismatch allowed

### Run Diagnostics

`Workflow provenance:` sectionを追加し、run summaryとstepごとのcompletion sourceを表示する。

```text
Workflow provenance:
- reused from run: source-run
- start step: analyze
- reused steps: collect
- hydrated state keys: context
- artifact verified: context
- definition mismatch allowed: no
Steps:
- collect: completed; completionSource=reused; skippedByArtifactReuse=yes; artifacts=context; hydratedKeys=context
```

### Bob chat control / progress message

`buildWorkflowControlBlock()`へoptionalな`provenanceLines`を渡し、Bob runnerが同じprojectorから生成したID／件数だけをcontrol blockへ追加する。Snapshot本文、artifact本文、diffは含めない。

### Bob Todo projection

Todo APIのstatus種類は増やさない。既存の`setStepComplete()`でcompleted projectionを維持し、reuse／skipの意味はrun provenanceとして表示する。live handleがない場合はOperation Hubとcontrol messageが保存済みprojectionであることを明示する。

## Error handling

- malformed provenance JSON: ignore that record and continue displaying the run
- unknown step IDs: preserve run-level summary; omit step projection for the unknown ID
- duplicate IDs／keys: deterministic de-duplication preserving first appearance
- source run missing: display `unknown` only when a reuse record exists
- sync drift: never let artifact reuse overwrite the Bob Todo drift warning

## Compatibility

- `run.json` schemaは変更しない。
- `RunStepState.status`へ`reused`や`skipped`を追加しない。
- existing `workflow.artifactReuse/v1`、`artifact-hydration/v1`、`task-snapshot-import/v1`を維持する。
- standalone executionでもOperation Hub、Runs View、Run Diagnosticsから同じprojectionを確認できる。

## Acceptance tests

- reused stepが通常completedと異なるprojectionになる。
- source run、artifact ID、hydrated state keyをstepまで追跡できる。
- hydration entryがあるstepだけ`artifactVerified`になる。
- malformed state recordでrun一覧全体が壊れない。
- Bob Todoのlive handleがないとき、Operation Hubは`synced`をok表示しない。
- Operation Hub、Runs View、Diagnostics、Bob control messageが同じsource run／step IDs／keysを表示する。
- Snapshot本文やartifact本文をUI projectionへ含めない。
