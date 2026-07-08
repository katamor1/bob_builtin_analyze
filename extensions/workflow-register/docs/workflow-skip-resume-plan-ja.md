# workflow-register skip 再開 Phase 1 設計

## 目的

複数 step の workflow で、既存 run の成果物を再利用し、途中 step から安全に開始できるようにする。

Phase 1 では、途中開始コマンド本体までは実装しない。先に「再利用できる成果物とは何か」を workflow 定義と実行結果に残せるようにし、後続 Phase の state hydration / startFromStep の土台を作る。

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

## Bob task export との関係

Bob task export / task snapshot は Phase 1 では manifest の正本にしない。

理由は、snapshot は診断と handoff 救済の補助証跡であり、最大サイズ制限や redaction により `lastAssistantText` / `taskExport` が省略される可能性があるためである。

後続 Phase では、artifact が存在しない古い run だけを対象に、task snapshot から候補 text を取り出し、ユーザー確認後に artifact file と manifest を生成する fallback を追加する。

## 後続 Phase への接続

Phase 2 以降では、manifest を使って次を実装する。

1. reuse 元 run / manifest を選ぶ。
2. `workflowId`、`workflowDefinitionHash`、`inputsHash`、artifact checksum を検証する。
3. 開始 step より前に必要な artifact を読み、`run.state` を seed する。
4. seed 済み step を `completed` とし、reuse provenance を run state に残す。
5. `currentStep` を開始 step にして通常の `WorkflowEngine` で続行する。
