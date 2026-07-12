# Workflow Builder: Skip Resume Readiness

## 目的

Workflow BuilderのArtifactsタブから、途中再開で再利用するstep outputとartifact定義を安全に準備する。

手書きで次を揃える代わりに、Builderが候補・衝突・生成後Markdownを事前表示する。

- `x-skipResume.fileBound: true`
- outputの`resultKey`
- 同じIDを持つ`artifacts[]`
- 正しい`producedBy`
- runごとに分離されたartifact path
- artifact schema

## 操作手順

1. Workflow Builderで対象workflowを開く。
2. 再利用したいagent、command、manual stepに`resultKey`を設定する。
3. `Artifacts`タブを開く。
4. `途中再開 readiness`カードで候補を確認する。
5. 再利用対象のstepを選択する。
6. `Before`と`After`のWORKFLOW.md、変更内容、strict diagnosticsを確認する。
7. `この設定を適用`を押す。
8. 通常の`Preview / Diagnostics`、`Diff`、`Save`で保存する。

`この設定を適用`はBuilderのメモリ上のmodelだけを変更する。ファイル保存は既存のSave経路を通り、保存直前に通常のworkflow validationが再実行される。

## 生成規約

選択したoutputには次のartifactを生成する。

```yaml
x-skipResume:
  fileBound: true

artifacts:
  - id: collectedContext
    producedBy: collect-context
    path: .bob/workflows/runs/{{run.id}}/artifacts/collect-context/collectedContext.md
    schema: text/markdown
```

artifact IDは`resultKey`と同じ値にする。pathは次の形式に固定する。

```text
.bob/workflows/runs/{{run.id}}/artifacts/<stepId>/<resultKey>.md
```

manual stepは`form.resultKey`と`approval.resultKey`をそれぞれ候補として扱う。

## 安全契約

- 既存artifactは自動削除、rename、上書きしない。
- 同じartifact IDを別stepが所有している場合はapplyを止める。
- 同じproducerにresultKeyと一致しないartifactがある場合はapplyを止める。
- matching artifactのpathがrun-scopedでない場合はapplyを止める。
- agent stepに`resultKey`がない場合は修正候補を表示し、applyを止める。
- result stepにfile sinkがない場合はapplyを止める。
- previewとapplyは同じpure plannerとstrict validatorを使う。
- model変更後に到着した古いpreview responseはrequest IDとsource signatureで破棄する。
- apply成功後は適用済みmodelからreadiness previewを再計算する。

## Candidate status

| status | 意味 | 操作 |
| --- | --- | --- |
| `ready` | artifactを安全に新規生成できる | checkboxで選択可能 |
| `existing` | 同じID、producer、run-scoped pathのartifactが既にある | 既存定義を保持 |
| `blocked` | ownership、path、step output契約に衝突がある | apply不可 |

## Round-trip

`x-skipResume`は`WorkflowAuthoringModel.skipResume`として明示管理する。既存WORKFLOW.mdの読み込み、Builder編集、serializer出力の往復で消えない。

未知front matterは従来どおり`unknownFrontMatter`で保持するが、`x-skipResume`はBuilder管理項目なので二重出力しない。

## トラブルシューティング

### agent stepにresultKeyがない

Step detailで`resultKey`を設定して再評価する。

### artifact IDが別stepと衝突する

既存artifactを手動で確認し、どちらを正本にするか決める。Builderは無断で所有権を変更しない。

### pathがrun-scopedではない

既存artifact pathを`{{run.id}}`または`{{runId}}`を含むpathへ手動修正する。

### Applyボタンが無効

`適用を止めている項目`と`Strict diagnostics`を確認する。すべて解消後に再評価する。

## 非対象

この機能はworkflow定義のreadiness設定だけを行う。次は別機能である。

- task snapshot importのpreviewと選択適用
- artifact fileの実生成
- artifact manifestからのstate hydration
- reused/skipped状態表示
- detached held runの復旧
