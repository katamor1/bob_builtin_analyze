# `bob-evidence-scope` ドメイン契約（Phase 1）

## 目的

`bob-evidence-scope` は、レビュー対象の巨大なコード・文書・規約を無条件に AI へ渡すのではなく、今回の変更に必要な evidence を決定論的に選び、採用・除外理由と概算 token 量を残すためのドメイン境界です。

Phase 1 は `bob-code-consistency-review` 内の独立モジュールとして実装します。既存 pipeline の安定性を保ったまま契約と選定アルゴリズムを固め、複数 workflow から独立利用する段階で別 VSIX に切り出せる構造にしています。

## 公開 API

`src/evidenceScope/index.ts` は次を明示 export します。

- `buildEvidenceScope(request)`
- `buildReviewEvidenceScope(codeAnalysis, documents, options)`
- `planContextBudget(items, policy)`
- `selectApplicableRules(rules, symbols)`
- `parseProjectRules(value)`
- `InMemoryDocumentEvidenceAdapter`
- `createContextBudgetArtifact(scope, metadata)`

`export *` は使いません。公開面を明示し、将来の VSIX 分離時に互換性を管理しやすくします。

## Change Scope Engine

入力の `changedSymbolIds` を必須 seed とし、resolved dependency edge を breadth-first で展開します。`maxDependencyDepth` が `NaN` や無限値の場合は 0 として扱い、変更 symbol 以外を展開しません。

| 深さ | 優先度 | 代表例 |
| --- | --- | --- |
| 0 | `required` | 変更 symbol、公開 interface 変更 |
| 1 | `high` | 直接 caller/callee、直接 read/write/type dependency |
| 2 以上 | `medium` | 2-hop 以降の影響候補 |
| 非関連 | `low` | raw diff 全文など、変更との関連を証明できない候補 |

incoming と outgoing の両方向を impact として扱います。caller index が `caller -> callee`、callee 展開が `callee -> dependency` のどちらで表現されても、直接接続した symbol を候補化するためです。

`resolution: "unknown"` の edge は展開しませんが、`unknownImpact` に次を残します。

```json
{
  "sourceId": "fn:dispatch",
  "edgeKind": "dynamic",
  "reason": "function pointer target unresolved",
  "targetHint": "callback"
}
```

## Project Rule Pack Engine

Phase 1 の設定入口は `review-input.yaml` の `bob_options.evidence_scope_rules` を想定します。`bob_options` は既存 schema 上 `Record<string, unknown>` であり、既存項目を壊さず段階導入できます。

```yaml
bob_options:
  evidence_scope_rules:
    - id: public-api-compatibility
      title: Public API compatibility
      evaluation: ai
      estimated_tokens: 120
      priority: required
      applies_when:
        paths:
          - src/public/**
        languages:
          - cpp
        symbol_kinds:
          - function
        risk_tags:
          - compatibility
        interface_change: true
```

`applies_when` に指定した次元はすべて一致する必要があります。各配列内は OR、異なる次元間は AND です。

- `paths`: `/` 正規化後の `*` / `**` glob
- `languages`
- `symbol_kinds`
- `risk_tags`
- `interface_change`

不正な rule は例外で全処理を停止せず、rule ID を含む warning とともに除外します。重複 ID は先勝ちです。

## Document Evidence adapter

ドメインは文書ファイルを直接読みません。`DocumentEvidenceAdapter` が次の query に対して候補 `DocumentEvidenceUnit[]` を返します。

```ts
{
  symbolIds: string[]
  riskTags: string[]
  ruleIds: string[]
  keywords: string[]
}
```

参照 unit は raw 文書ではなく、安定 ID、source path、locator、content hash、概算 token 数を持ちます。

```ts
{
  id: "REQ-SEC-001",
  sourcePath: "docs/security-requirements.md",
  locator: "# REQ-SEC-001",
  contentHash: "4f6d2a91",
  estimatedTokens: 84,
  linkedSymbols: ["fn:authorize"],
  tags: ["security"]
}
```

参照実装の `InMemoryDocumentEvidenceAdapter` は symbol link を最優先し、risk/rule tag、keyword の順で加点します。同一 ID は最上位候補だけを残します。

将来 UNC / AD ファイルサーバ adapter を実装するときも、この境界の外側で次を強制します。

- Trusted Workspace
- UNC root allowlist
- Windows の既存認証のみ使用し、資格情報を保存しない
- read-only
- raw 文書を無条件に cache しない
- hash、locator、必要な抜粋だけを保存

## Context budget policy

`planContextBudget` は `required -> high -> medium -> low`、同一優先度では ID の昇順で処理します。

- `required` は budget 超過でも採用します。
- `high` / `medium` は残量に収まる場合だけ採用します。
- `low` は `includeLowPriority: true` を明示しない限り除外します。
- 除外理由は `token-budget` または `low-priority-policy` です。
- duplicate は `kind:id` で統合し、理由を重複排除します。

Phase 1 の token 数は概算です。既存 analyzer から変換する adapter では `ceil(text.length / 4)` を使用し、課金 token や特定モデル tokenizer と同一であるとは扱いません。

## `context-budget-report.json` 契約

`createContextBudgetArtifact` は次を含む schema version 1 の決定論的 object を生成します。

- `selection_policy: bob-evidence-scope-v1`
- `scope_fingerprint`
- `source_revision`
- `token_estimation`
- `rule_source`
- `selected_code`
- `applicable_rules`
- `selected_documents`
- `unknown_impact`
- `budget.selected` / `budget.excluded`
- `warnings`

Phase 1 は serializer と契約までを実装します。`review-package/context-budget-report.json` への pipeline 接続は次の実装単位です。

## Determinism

同じ論理入力について、symbol、edge、rule、document candidate の入力配列順が変わっても次が同一になります。

- 選定順
- budget report
- unknown impact 順
- `scopeFingerprint`

fingerprint は security 用 checksum ではありません。選定 scope の安定比較用に、unknown impact の reason を含む sorted canonical identity へ FNV-1a 32-bit を適用しています。artifact ledger へ接続する段階では SHA-256 の input hash を別途記録します。
