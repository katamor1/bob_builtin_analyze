# Reused / Skipped Workflow Provenance

## 目的

成果物から途中再開したrunでは、前段stepが実際に再実行されず、検証済みartifactからstateを復元したうえで完了扱いになります。

P1-3では、通常実行で完了したstepと、artifact reuseによってskipされたstepを明確に区別します。表示の正本は常に`run.json`です。Bob Todoは外部UIへのprojectionであり、workflowの完了状態やreuse provenanceの正本ではありません。

## 参照する永続情報

新しいschemaは追加しません。次の既存state recordから表示専用projectionを導出します。

- `workflow.artifactReuse`
  - source run
  - start step
  - reused step IDs
  - hydrated state key IDs
- `workflow.artifactHydration`
  - artifact ID
  - producing step
  - state key
  - source run
  - checksum／byte検証済みであること
- `workflow.taskSnapshotImport`
  - imported artifact ID
  - producing step
  - import日時
- `workflow.definitionMismatch`
  - definition mismatchを許容して継続したこと
- `bobTaskSync`
  - Bob Todo projectionの同期状態
  - live task handleの有無

Artifact本文、hydrated state値、snapshot本文、diff、checksum値は表示projectionへ含めません。

## 表示

### Bob 操作ハブ

Run cardではstepごとに次を表示します。

```text
collect · Collect              Reused
Skipped by artifact reuse · from source-run · Artifact verified
artifacts context-artifact · hydrated context
```

通常completedは`Completed`、artifact reuse完了は`Reused`として表示します。

Bob 操作ハブは画面の肥大化を避けるため8 stepまでを表示します。残りがある場合は、

```text
7 more step(s); see Run Diagnostics
```

のように省略件数を示します。

### Bob 操作ハブの実行状況

run cardのcompact summaryは`reused N`を維持し、詳細表示に次を含めます。

- reused step IDs
- source run
- reuse start step
- hydrated state key IDs
- verified artifact IDs
- task snapshot import件数
- definition mismatch allowed

### Run Diagnostics

`Workflow provenance:` sectionにrun-level summaryとstep-level completion sourceを表示します。

```text
Workflow provenance:
- reused from run: source-run
- start step: analyze
- reused steps: collect
- hydrated state keys: context
- verified artifacts: context-artifact
- definition mismatch allowed: no
- step completion sources:
  - collect: completed; completionSource=reused; skippedByArtifactReuse=yes; artifacts=context-artifact; hydratedKeys=context
  - analyze: pending; completionSource=not-completed; skippedByArtifactReuse=no
```

### Bob chat control block

Bobのcontrol messageには、source run、reused step IDs、verified artifact IDs、hydrated state key IDs、task snapshot import件数を表示します。

各ID一覧は最大20件です。超過分は`(+N more)`で示します。Control block全体へ渡すprovenance lineも最大12行です。

## Bob Todo sync

Bob Todoへ`reused`や`skipped`という新しいstatusは書き込みません。既存のcompleted projectionを維持し、reuseの意味は`run.json`由来のprovenanceとして表示します。

`bobTaskSync.drift.status`が`synced`でも、`liveTaskAvailable`がfalseの場合は、Bob 操作ハブで次のwarningを表示します。

```text
Bob Todo: saved projection only; live task unavailable
```

これは保存済みprojectionと、現在操作可能なlive Bob taskを混同しないためです。

## Malformed provenance

Optional provenance recordが次に該当する場合、そのrecordまたはtokenだけを無視し、run一覧全体は継続して表示します。

- JSONとして読めない
- objectでない
- 必須IDがない
- ASCII control characterを含む
- 256文字を超えるmetadata token

Unknown step IDはrun-level summaryには残せますが、存在しないstepの表示行は生成しません。

## 互換性

- `WorkflowRunState` schemaは変更しません。
- `RunStepState.status`へ`reused`／`skipped`を追加しません。
- `workflow.artifactReuse/v1`、`workflow.artifactHydration/v1`、`workflow.taskSnapshotImport/v1`を維持します。
- Standalone実行でもBob 操作ハブとRun Diagnosticsから同じprovenanceを確認できます。

## トラブルシューティング

### Reused表示がない

1. `run.json`のstate keysに`workflow.artifactReuse`があるか確認します。
2. `reusedStepIds`が現在のrunのstep IDと一致するか確認します。
3. Run Diagnosticsでmalformed recordが無視されていないか確認します。

### Artifact verifiedがない

`Artifact verified`は、manifestのbyte数とSHA-256を検証して`workflow.artifactHydration`へ記録されたartifactだけに表示されます。単にartifact fileが存在するだけでは表示しません。

### Bob Todoがwarningになる

保存済みTodo projectionは一致していますが、現在のExtension Hostにlive Bob task handleがありません。`run.json`の状態は失われていません。Bob 操作ハブまたはRun Diagnosticsを正本として確認してください。
