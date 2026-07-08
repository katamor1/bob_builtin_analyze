# workflow-register skip 再開 Phase 1/2/3/4 設計

## 目的

複数 step の workflow で、既存 run の成果物を再利用し、途中 step から安全に開始できるようにする。

Phase 1 では、途中開始コマンド本体までは実装しない。先に「再利用できる成果物とは何か」を workflow 定義と実行結果に残せるようにし、後続 Phase の state hydration / startFromStep の土台を作る。

Phase 2 では、Phase 1 の manifest を core API として切り出し、artifact file から `run.state` を復元する state hydration 部品を追加する。

Phase 3 では、manifest / hydration を実際の command 導線へ接続し、既存 run の成果物から新しい run を seed して指定 step から開始できるようにする。

Phase 4 では、Phase 3 の command を Operation Hub / Runs View から見つけやすくし、再利用済み run と再利用可能 artifact manifest を UI で確認できるようにする。

## Phase 1 の範囲

Phase 1 で実施することは次の 3 点である。

1. skip 再開対象 workflow の opt-in metadata を定義する。
2. opt-in した workflow に対し、resultKey と artifact の対応を validator で確認する。
3. 実行時に `artifacts` から書き出した成果物を manifest に記録する。

Phase 1 では次はまだ実施しない。

- 既存 run / manifest を選択して新 run を seed する UI。
- artifact file から `run.state` を復元する state hydration。
- Bob task export から artifact を自動生成する fallback。
- Bob Todo UI 上で skipped / reused を表示する専用状態。

## Phase 2 の範囲

Phase 2 で実施することは次の 3 点である。

1. artifact manifest の型、parse、serialize、互換性検証を `src/core/artifacts/artifactManifest.ts` に切り出す。
2. `src/core/artifacts/stateHydration.ts` に artifact file から `run.state` を復元する helper を追加する。
3. checksum、byte size、workspace-relative path、`workflowId`、`workflowDefinitionHash`、`inputsHash` を hydration 前に検証する。

Phase 2 では次はまだ実施しない。

- Command Palette / Operation Hub からの `startFromStep` UI。
- hydrate 済み step を `completed` として seed run を作る command。
- Bob Todo UI の projection repair。

## Phase 3 の範囲

Phase 3 で実施することは次の 4 点である。

1. `workflowRegister.startFromStepWithArtifacts` command を追加する。
2. workflow / start step / reuse 元 run を QuickPick で選び、target inputs と互換性のある manifest だけを候補にする。
3. 開始 step より前に生成される state key を artifact file から hydrate し、前段 step を `completed` として新 run を seed する。
4. seed 済み run を通常の `WorkflowEngine.resumeRun()` に渡し、開始 step から続行する。

Phase 3 では次はまだ実施しない。

- Operation Hub の専用ボタン表示。
- Bob Todo UI で reused/skipped を専用表示する projection。
- task snapshot から artifact を生成する fallback import。

## Phase 4 の範囲

Phase 4 で実施することは次の 4 点である。

1. Operation Hub の run card に artifact manifest の有無を badge 表示する。
2. artifact manifest を持つ run に「成果物から開始」ボタンを表示し、`workflowRegister.startFromStepWithArtifacts` を `workflowId + sourceRunId` で呼ぶ。
3. `workflow.artifactReuse` を持つ run を Operation Hub と Explorer の Runs View で reused run として表示する。
4. Operation Hub の auto refresh 対象に `artifacts/manifest.json` を追加し、manifest 生成後に画面へ反映する。

Phase 4 では次はまだ実施しない。

- task snapshot から artifact を生成する fallback import。
- Builder で file-bound skip resume artifact 定義を自動生成する。
- Bob Todo UI 内の todo item 表示そのものに reused/skipped marker を埋め込む。

## Opt-in metadata

既存 workflow の strict validation を壊さないため、Phase 1 は `x-skipResume.fileBound: true` を付けた workflow だけを対象にする。

```yaml
x-skipResume:
  fileBound: true
```

`x-` prefix は workflow-register v1 schema の拡張領域として扱う。GUI round-trip で未知 top-level field として保持しやすく、既存 workflow には影響しない。

## File-bound workflow 規約

`x-skipResume.fileBound: true` の workflow では、再利用したい step output を必ず `resultKey` と同名の `artifacts[].id` に結び付ける。

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

Validator は opt-in workflow に対して次を警告する。workspace strict validation では警告が error に昇格する。

- `resultKey` / manual form resultKey / manual approval resultKey に、同じ `id` かつ同じ `producedBy` の artifact がない。
- agent step に `resultKey` がない。
- result step に file sink がない。
- artifact に `producedBy` がない。
- artifact が producing step の resultKey と対応していない。
- artifact path に `{{run.id}}` または `{{runId}}` がない。

## Artifact manifest

`writeProducedArtifacts()` は、`artifacts` から実際にファイルを書いた場合、同じ run の artifact ディレクトリに manifest を書く。

```text
.bob/workflows/runs/<runId>/artifacts/manifest.json
```

形式は次の通り。

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

同じ内容は `run.state["workflow.artifactManifest"]` にも JSON 文字列として保存する。これにより、`run.json` だけを見ても、どの artifact がどの resultKey から生成されたか確認できる。

## State hydration

Phase 2 では、manifest から対象 state key を選び、artifact file を読み込んで `run.state` に復元する。

```ts
await hydrateWorkflowStateFromArtifacts({
  workflow,
  run,
  manifest,
  stateKeys: stateKeysRequiredByStep(workflow, "analyze"),
  readFile: (relativePath) => fs.readFile(path.join(workflowRoot, relativePath), "utf8")
})
```

Hydration は次を検証してから state を更新する。

- manifest の `workflowId` が対象 workflow と一致する。
- `workflowDefinitionHash` が一致する。ただし caller が明示的に mismatch を許可した場合は進められる。
- `inputsHash` が target run inputs と一致する。ただし caller が明示的に mismatch を許可した場合は進められる。
- artifact path が workspace-relative safe path である。
- artifact file の byte size と sha256 が manifest と一致する。

復元後は `run.state["workflow.artifactHydration"]` に provenance を保存する。

```json
{
  "schemaVersion": "workflow-register/artifact-hydration/v1",
  "sourceRunId": "20260708T...",
  "sourceWorkflowId": "workflow-register.example",
  "sourceWorkflowDefinitionHash": "sha256:...",
  "hydratedAt": "2026-07-08T00:00:00.000Z",
  "hydrated": [
    {
      "stateKey": "collectContext",
      "artifactId": "collectContext",
      "producedBy": "collect-context",
      "path": ".bob/workflows/runs/20260708T.../artifacts/collect-context/collectContext.md",
      "sha256": "...",
      "bytes": 12345,
      "sourceRunId": "20260708T..."
    }
  ]
}
```

## Start from artifacts command

Phase 3 の command は次の ID で公開する。

```text
workflowRegister.startFromStepWithArtifacts
```

引数を渡さない場合、次を順に選択する。

1. workflow
2. start step
3. workflow inputs
4. reuse 元 run

引数で呼ぶ場合は次の形を想定する。

```ts
vscode.commands.executeCommand(
  "workflowRegister.startFromStepWithArtifacts",
  workflowId,
  stepId,
  sourceRunId,
  inputs
)
```

実行時の流れは次の通り。

1. target workflow と inputs を決める。
2. 同じ workspace root の run 一覧から artifact manifest を持つ run を探す。
3. manifest の `workflowId` / `workflowDefinitionHash` / `inputsHash` が target workflow と inputs に一致する run だけを候補にする。
4. 開始 step より前に生成される state key を artifact file から hydrate する。
5. 新規 run を作成し、開始 step より前の step を `completed` にする。
6. `run.state["workflow.artifactReuse"]` に reuse provenance を保存する。
7. `WorkflowEngine.resumeRun()` に渡し、開始 step から通常実行する。

`workflow.artifactReuse` は次の形式で保存する。

```json
{
  "schemaVersion": "workflow-register/artifact-reuse/v1",
  "sourceRunId": "20260708T...",
  "sourceWorkflowId": "workflow-register.example",
  "sourceWorkflowDefinitionHash": "sha256:...",
  "startStepId": "analyze",
  "reusedStepIds": ["collect-context"],
  "hydratedKeys": ["collectContext"],
  "createdAt": "2026-07-08T00:00:00.000Z"
}
```

## Operation Hub / Runs View

Phase 4 では Operation Hub の run card に次を表示する。

- `Reusable artifacts: N`: artifact manifest がある run。
- `Artifacts reused: N step(s), M state key(s)`: artifact reuse で作られた run。
- `成果物から開始`: artifact manifest がある run から新しい start-from-artifacts run を作る action。

Explorer の `Bob Workflow Runs` view でも、artifact manifest がある run は `artifacts`、reuse 済み run は `reused N` と表示し、tooltip に source run と start step を出す。

## Bob task export との関係

Bob task export / task snapshot は Phase 1/2/3/4 では manifest の正本にしない。

理由は、snapshot は診断と handoff 救済の補助証跡であり、最大サイズ制限や redaction により `lastAssistantText` / `taskExport` が省略される可能性があるためである。

後続 Phase では、artifact が存在しない古い run だけを対象に、task snapshot から候補 text を取り出し、ユーザー確認後に artifact file と manifest を生成する fallback を追加する。

## 後続 Phase への接続

Phase 5 以降では、Phase 4 の UI 導線をさらに使いやすくするために次を追加する。

1. task snapshot から artifact を生成する fallback import を追加する。
2. Builder で file-bound skip resume に必要な artifact 定義を自動生成する。
3. Bob Todo UI 内の todo item 表示そのものに reused/skipped marker を埋め込む。
