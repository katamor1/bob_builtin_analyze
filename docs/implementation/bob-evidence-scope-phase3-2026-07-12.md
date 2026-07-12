# Bob Evidence Scope Phase 3 実装記録

## 実装範囲

Phase 3 では、project 固有の整合規約を workspace-local rule pack として read-only に読み込み、Evidence Scope の規約選択へ適用し、review package に provenance を残す経路を実装した。

設定入口は `review-input.yaml` の次の項目である。

```yaml
bob_options:
  evidence_scope_rule_pack_path: .bob/evidence-scope/project-rules.yaml
```

## Rule-pack loader

`projectRulePackLoader.ts` は次を担当する。

- workspace-relative path の正規化
- `.json` / `.yaml` / `.yml` 拡張子制約
- workspace 外 path および symlink escape の拒否
- mode `r` による read-only open
- 読込前後の `maxDocumentBytes` 検査
- exact raw bytes の SHA-256 計算
- YAML/JSON parse
- `schema_version: 1` の AJV validation
- authoritative pack 内の invalid rule / duplicate ID の拒否

rule pack の raw body は review package にコピーしない。report と manifest には ID、version、source path、content hash のみを保存する。

## Rule merge

project rule pack を authoritative とする。

- project rule を先に登録する
- inline rule の新規 ID は追加する
- inline rule が project rule ID と重複した場合は project rule を保持する
- 重複は deterministic warning として返す

```text
duplicate inline evidence scope rule <id>; project rule pack entry retained.
```

## Pipeline 接続

`buildReviewContextBudget` を async 化し、workspace root と text encoding を受け取るようにした。処理順は次のとおり。

1. project rule pack の load・validation
2. inline rule の parse
3. authoritative merge
4. Evidence Scope 選定
5. warning の sort・deduplicate
6. provenance 付き context-budget artifact の生成

`preprocessReview` の公開 input/result shape は変更していない。

## Artifact provenance

`context-budget-report.json` は、rule pack がある場合に次を含む。

```json
{
  "rule_source": ".bob/evidence-scope/project-rules.yaml",
  "rule_pack": {
    "schema_version": 1,
    "id": "payment-review",
    "version": "2026.07",
    "source_path": ".bob/evidence-scope/project-rules.yaml",
    "content_hash": "sha256:..."
  }
}
```

`manifest.yaml` は次を記録する。

```yaml
inputs:
  project_rule_pack: .bob/evidence-scope/project-rules.yaml
  project_rule_pack_id: payment-review
  project_rule_pack_version: "2026.07"
  project_rule_pack_hash: sha256:...
```

`artifact_metadata.input_hash` の入力には rule-pack content hash を含める。review input と Git revision が同一でも rule-pack bytes が変われば input hash が変わる。

## Schema

次の runtime schema と documentation mirror を追加した。

- `extensions/bob-code-consistency-review/resources/schemas/evidence-scope-rule-pack.schema.json`
- `docs/workflows/code-consistency-review/schemas/evidence-scope-rule-pack.schema.json`

review-input schema には `bob_options.evidence_scope_rule_pack_path` を追加した。新規 npm dependency は追加していない。

## 非対象

Phase 3 では、workspace 外 rule pack、UNC credential、rule pack 書換え、raw pack copy、repository-wide symbol index、producer 横断 ledger は実装しない。
