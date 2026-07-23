# Traceability Sidecar Catalog方式

## 1. 目的

`bob-code-consistency-review`は、上流の自然言語仕様書を直接書き換えず、追跡可能な仕様単位、ID、領域、工程間link、承認状態を`.bob-trace`配下のsidecar catalogへ保持する。

AIは候補を生成し、人間が承認した内容だけを正式入力として扱う。`review-input.yaml`は、accepted catalog itemから既存の`ReviewInputBuilder`とschema validatorを通して生成する。

## 2. operator flow

```text
自然言語仕様書
  -> AIが仕様単位、ID候補、領域候補、link候補を生成
  -> 整合プレレビュー主GUIのトレーサビリティ整理stageで人間が承認 / 修正 / 棄却
  -> .bob-trace/traceability-catalog.jsonを更新
  -> gateが欠落、未承認、staleを検出
  -> accepted itemからReviewInputDraftを生成
  -> ReviewInputBuilder / schema validatorでreview-input.yamlを生成
  -> review-packageを作成してコード差分と仕様根拠を照合
```

catalog未整備の案件では、`createReviewInput`、`prepareAiReviewInputDraft`、`applyAiReviewInputDraft`をfallbackとして利用できる。

## 3. ID形式

工程別prefixを固定する。

```text
REQ-<元文書ID>-<領域>-0001
BD-<元文書ID>-<領域>-0001
DD-<元文書ID>-<領域>-0001
TC-<元文書ID>-<領域>-0001
QA-<元文書ID>-<領域>-0001
RV-<元文書ID>-<領域>-0001
```

例:

```text
REQ-RS001-PAY-0001
BD-BD001-PAY-0001
DD-DD001-PAY-0001
TC-TS001-PAY-0001
QA-QA001-PAY-0001
RV-RV001-PAY-0001
```

元文書内の管理番号を優先する。抽出できない場合は`DOC0001`形式でsidecar採番し、document registryへ`id_source: sidecar-generated`を記録する。

領域codeもAIが候補生成し、人間が承認する。accepted itemが未承認domainを参照する場合はgate errorにする。

## 4. proposed / accepted境界

AIは正式IDを確定しない。

```json
{
  "proposed_id": "REQ-RS001-PAY-0001",
  "id": null,
  "status": "proposed"
}
```

人間承認後:

```json
{
  "proposed_id": "REQ-RS001-PAY-0001",
  "id": "REQ-RS001-PAY-0001",
  "status": "accepted"
}
```

一度acceptedになったIDは再採番しない。削除、棄却、廃止による欠番は監査証跡として許容する。

## 5. catalog形状

初期実装は1つのcatalog objectにdocuments、domains、items、links、decisionsを保持する。

```json
{
  "schema_version": 1,
  "documents": [
    {
      "document_id": "RS001",
      "source_path": "docs/requirements-payment.md",
      "id_source": "extracted"
    }
  ],
  "domains": [
    {
      "code": "PAY",
      "label": "決済",
      "status": "accepted"
    }
  ],
  "items": [
    {
      "proposed_id": "REQ-RS001-PAY-0001",
      "id": "REQ-RS001-PAY-0001",
      "type": "requirement",
      "source_document_id": "RS001",
      "domain": "PAY",
      "sequence": 1,
      "source_path": "docs/requirements-payment.md",
      "status": "accepted"
    }
  ],
  "links": [],
  "decisions": []
}
```

QA itemとreview findingもitemとして保持できる。source pathはworkspace-containedなdocument registry entryと一致させる。

## 6. linkとn/a decision

linkもAI候補から人間承認へ昇格する。

```yaml
links:
  - proposed_from: REQ-RS001-PAY-0001
    proposed_to: BD-BD001-PAY-0001
    link_type: satisfies
    status: proposed
```

承認後:

```yaml
links:
  - from: REQ-RS001-PAY-0001
    to: BD-BD001-PAY-0001
    link_type: satisfies
    status: accepted
```

初期link type:

| link_type | 用途 |
|---|---|
| `satisfies` | `REQ -> BD` |
| `elaborates` | `BD -> DD` |
| `verified_by` | `REQ/DD -> TC` |
| `clarifies` | `QA -> REQ/BD/DD/TC/RV` |
| `reviewed_by` | `REQ/BD/DD/TC/QA -> RV` |
| `references` | 補助参照 |

対応不要の場合は欠落を消さず、理由付きaccepted decisionを残す。

```yaml
decisions:
  - subject: REQ-RS001-PAY-0008
    gate: basic_design
    decision: n/a
    reason: 文言修正のみで設計変更を伴わない
    status: accepted
```

## 7. Gate判定

Gateはaccepted itemと、accepted linkまたはaccepted n/a decisionだけで判定する。

error:

- 必須link / n/a decisionがない。
- accepted itemが未承認domainを使う。
- IDが重複する。
- source documentがregistryにない。
- accepted linkのfrom / toがaccepted itemではない。
- accepted QA itemにaccepted `clarifies` linkがない。
- accepted review findingにaccepted `reviewed_by` linkがない、または未対応である。

warning:

- proposed item / link / decisionが残る。
- AI候補が未承認である。
- source anchor hashが変わりstaleの疑いがある。
-元文書IDを抽出できず`DOC0001`形式を使う。
- QAが回答済みだがcloseされていない。

## 8. review-input.yaml生成

accepted itemから`ReviewInputDraft`を作成し、既存builder / validatorへ渡す。

| item type | review-input artifact |
|---|---|
| `requirement` | `artifacts.requirements[].sections` |
| `basic_design` | `artifacts.basic_design[].sections` |
| `detailed_design` | `artifacts.detailed_design[].sections` |
| `test_spec` | `artifacts.test_spec[].cases` |
| `qa_item` | `artifacts.ledgers[].rows` |
| `review_finding` | `artifacts.tickets[].rows` |

利用者はYAMLを手で組み立てる代わりに、catalogの承認状態を整える。runtimeはaccepted itemだけを下流のレビュー対象へ変換する。

## 9. workflow provider

内部provider IDは次である。

| Provider ID | 用途 |
|---|---|
| `bobCodeConsistency.prepareAiTraceabilityDraft` | 文書候補、既存catalog、diff summaryからAI draft promptを作る。 |
| `bobCodeConsistency.captureAiTraceabilityDraft` | AIのproposed-only JSONを検証してworkflow stateへ渡す。 |
| `bobCodeConsistency.applyAiTraceabilityDraft` | proposed-only JSONをcatalogへmergeする。 |
| `bobCodeConsistency.openTraceabilityPrep` | 独立panelを作らず、既存の`整合プレレビュー`panelを`トレーサビリティ整理`stageへ移動する。 |
| `bobCodeConsistency.validateTraceabilityCatalog` | gate report Markdownを生成する。 |
| `bobCodeConsistency.createReviewInputFromTraceability` | accepted itemから`review-input.yaml`を生成する。 |

これらは同梱workflowとAPI連携用に登録を維持するが、通常operatorは`Bob Code Consistency Review: 整合プレレビューを開始`から操作する。

## 10. トレーサビリティ整理stage

主GUIはcatalogを読み込み、次を編集・確認する。

- Domains
- Items
- Links
- Decisions
- Gate Report
- Review Input Preview

編集はまずWebview内の作業状態へ反映する。保存時は次を守る。

1. current catalog identityとrevisionを再検証する。
2. existing catalogをbackupする。
3. compare-and-setでcatalogを保存する。
4. gate reportを再生成する。
5. stale generationやdisposed panelからのpost / model更新を拒否する。

保存失敗、catalog read失敗、render拒否時に成功通知を表示しない。stage初期化失敗後は、利用可能なreview stageへ戻す。

## 11. security / privacy

- 元文書を自動変更しない。
- AIはaccepted / rejected / deprecatedを確定しない。
- path、ID、link endpoint、domainをhost側で再検証する。
- workspace外pathとsymlink / junction escapeを拒否する。
- `.bob-trace/ai-traceability-draft/`はrun-local / ignored領域として扱う。
- current catalog、gate report、review-inputはproject policyに従ってversion管理できる。
