# workflow-register 成果物再利用・途中開始 設計

## 1. 目的

複数stepのworkflowで、既存runの検証済みartifactを再利用し、安全に指定stepから新しいrunを開始できるようにする。

現在の実装は次を提供する。

1. workflow定義上のfile-bound artifact契約
2. artifact manifest
3. checksum / bytes / identityを検証したstate hydration
4. artifactからの途中開始
5. reused completion provenance
6. task snapshotからのselective artifact import
7. `Bob 操作ハブ`での単一operator route

`run.json`が実行状態の正本である。Bob Todoや画面表示へ`reused` / `skipped`という新しいrun statusは追加せず、既存completed statusと別のprovenanceとして表現する。

## 2. operator route

通常operatorは`Bob: 操作ハブを開く`から対象runを選ぶ。

- manifestを持つrun: `成果物から開始`
- task snapshotだけを持つrun: `Task Snapshotから成果物を取り込む`
- reused run: stepごとの`Reused` badgeとsource runを表示
- 詳細なhash / state key / warning: run diagnosticsで確認

内部command IDはworkflow、API、テスト連携のため維持するが、Command Paletteへ常時表示しない。

```text
workflowRegister.startFromStepWithArtifacts
workflowRegister.importArtifactsFromTaskSnapshots
```

## 3. opt-in metadata

既存workflowのstrict validationを壊さないため、file-bound artifact reuseを使うworkflowだけ明示opt-inする。

```yaml
x-skipResume:
  fileBound: true
```

`x-`prefixはworkflow-register v1 schemaの拡張領域である。Builder round-tripでもunknown top-level fieldとして保持する。

## 4. file-bound workflow規約

再利用したいstep outputを、`resultKey`と同名の`artifacts[].id`へ結び付ける。

```yaml
x-skipResume:
  fileBound: true

steps:
  - id: collect-context
    title: Collect context
    type: agent
    prompt: Collect reusable context.
    resultKey: collectContext

artifacts:
  - id: collectContext
    producedBy: collect-context
    path: ".bob/workflows/runs/{{run.id}}/artifacts/collect-context/collectContext.md"
    schema: text/markdown
```

validatorは次を検査する。

- producerの`resultKey` / manual result keyに対応するartifactがある。
- `producedBy`が実在stepと一致する。
- artifact IDとstate keyが一致する。
- pathに`{{run.id}}`または`{{runId}}`を含む。
- pathがworkspace内のrun artifact領域へ解決される。

workspace strict validationではfile-bound warningをerrorへ昇格する。

## 5. artifact manifest

実際にartifactを書いた場合、同じrunのartifact directoryへmanifestを保存する。

```text
.bob/workflows/runs/<runId>/artifacts/manifest.json
```

```json
{
  "schemaVersion": "workflow-register/artifact-manifest/v1",
  "workflowId": "workflow-register.example",
  "logicalWorkflowId": "example",
  "workflowDefinitionHash": "sha256:...",
  "workflowFile": ".bob/workflows/example/WORKFLOW.md",
  "runId": "20260708T...",
  "inputsHash": "sha256:...",
  "createdAt": "2026-07-08T00:00:00.000Z",
  "updatedAt": "2026-07-08T00:00:00.000Z",
  "artifacts": [
    {
      "id": "collectContext",
      "stateKey": "collectContext",
      "producedBy": "collect-context",
      "path": ".bob/workflows/runs/20260708T.../artifacts/collect-context/collectContext.md",
      "schema": "text/markdown",
      "sha256": "...",
      "bytes": 12345,
      "source": "workflow-artifact",
      "updatedAt": "2026-07-08T00:00:00.000Z"
    }
  ]
}
```

同じ内容のbounded projectionを`run.state["workflow.artifactManifest"]`にも保存する。artifact本文はrun stateへ埋め込まない。

## 6. state hydration

hydration前に次を検証する。

- manifest schema version
- workflow ID / logical ID
- workflow definition hash
- inputs hash
- artifact ID / state key / producing step
- workspace-relative safe path
- direct regular file
- symlink / junction / alias不在
- byte size
- SHA-256

呼出側がdefinition / inputs mismatchを明示許可した場合は、理由とmismatch provenanceを保存する。暗黙許可しない。

復元後は`run.state["workflow.artifactHydration"]`へ、artifact ID、state key、source run、検証済みchecksum metadataだけを保存する。

## 7. artifactからの途中開始

`workflowRegister.startFromStepWithArtifacts`は次を行う。

1. target workflow、start step、inputs、source runを決める。
2. source manifestを再読込する。
3. target workflow / inputsとの互換性を検証する。
4. start stepより前に必要なstate keyをhydrateする。
5. 新しいrunを作成する。
6. start stepより前の再利用対象stepをcompletedとしてseedする。
7. `workflow.artifactReuse` provenanceを保存する。
8. engine execution leaseを取得してstart stepから実行する。

既存runを書き換えて途中へ巻き戻さず、新しいrunを作る。

## 8. reuse provenance

```json
{
  "schemaVersion": "workflow-register/artifact-reuse/v1",
  "sourceRunId": "source-run",
  "startStepId": "analyze",
  "reusedStepIds": ["collect-context"],
  "hydratedStateKeys": ["collectContext"],
  "reusedAt": "2026-07-08T00:00:00.000Z"
}
```

`Bob 操作ハブ`は通常completedとreused completedを区別して表示する。表示はmetadataだけを使い、artifact本文やhydrated state値を含めない。

Bob Todoへ独自statusは書かない。live task handleがない場合、保存済みprojectionと現在操作可能なBob taskを混同しないwarningを表示する。

## 9. task snapshot import

古いrunやartifact未生成runでは、task snapshotの`lastAssistantText`またはbounded `taskExport`からartifact候補を作れる。

`workflowRegister.importArtifactsFromTaskSnapshots`は次を行う。

1. runとworkflow definitionを読み込む。
2. `artifacts[].producedBy`とproducer result keyの対応を確認する。
3. stepに対応する最新snapshotを選ぶ。
4. candidate text、source field、timestamp、truncated / redacted warningを抽出する。
5. target path、既存file hash、candidate hashをpreviewする。
6. operatorがimport対象を選択する。
7. 既存file変更を含む場合はdiff確認とmodal confirmationを要求する。
8. preview digestを再計算する。
9. selected artifact、manifest、run state、provenanceを1つのtransactionで適用する。

### default selection

次は初期選択しない。

- `truncated: true`
- `[REDACTED]`を含む
- 既存fileと内容が異なる
- target state keyに既存値がある

Core APIでselected artifact IDを省略した場合もdefault-safe candidateだけをimportする。

## 10. preview digest

previewは次からdigestを作る。

- run identity / revision
- workflow definition hash
- snapshot identity
- target path
- candidate content hash
- existing file hash

applyは同じplannerを再実行し、digest不一致なら書込み前に停止する。snapshot、workflow、run、target fileが変わった場合は新しいpreviewを取得する。

## 11. transaction

selected artifactだけを次のtransactionへ入れる。

```text
artifact files
+ artifacts/manifest.json
+ run.state result keys
+ workflow.artifactManifest
+ workflow.taskSnapshotImport provenance
```

workspace file transactionとrun-state rollbackを使い、途中失敗で一部だけ更新されたmanifestやstateを残さない。

## 12. security / privacy

- snapshot本文を一覧・diagnostics・notificationへ出さない。
- previewはmetadata、size、hash、warning、bounded diffだけを表示する。
- secret / redaction markerをsafe candidateとして自動選択しない。
- source runとtarget runを同じresolved workspace root内へ限定する。
- same run IDを持つmulti-rootを混同しない。
- symlink / junction / hard-link / alias / identity changeをfail closedで拒否する。
- import後もsnapshot自体を正本にせず、artifact fileとmanifestを正本にする。

## 13. verification

- artifact manifest parse / serialize / validation
- state hydration
- mismatch opt-in
- start-from-artifacts
- reused provenance projection
- task snapshot candidate planning
- default-safe selection
- preview digest mismatch
- transactional rollback
- workspace / identity / symlink boundaries
- `Bob 操作ハブ`のbutton、badge、auto refresh
- Linux / Windows Extension Host smoke
