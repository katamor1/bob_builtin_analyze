# `bob-evidence-scope` ドメイン契約（Phase 1–2）

## 目的

`bob-evidence-scope` は、レビュー対象の巨大なコード・文書・規約を無条件に AI へ渡すのではなく、今回の変更に必要な evidence を決定論的に選び、採用・除外理由と概算 token 量を残すためのドメイン境界です。

Phase 1 は選定ドメインと serializer を独立実装し、Phase 2 は既存 `preprocessReview` と review-package へ接続します。現在も `bob-code-consistency-review` 内の独立モジュールですが、public API と pipeline adapter を分けているため、複数 workflow から独立利用する段階で別 VSIX へ切り出せます。

## 公開 API

`src/evidenceScope/index.ts` は次を明示 export します。

- `buildEvidenceScope(request)`
- `buildReviewEvidenceScope(codeAnalysis, documents, options)`
- `buildReviewContextBudget(input)`
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

`resolution: "unknown"` の edge は展開しませんが、`unknownImpact` に残します。

```json
{
  "sourceId": "fn:dispatch",
  "edgeKind": "dynamic",
  "reason": "function pointer target unresolved",
  "targetHint": "callback"
}
```

## Project Rule Pack Engine

Phase 2 の設定入口は `review-input.yaml` の `bob_options.evidence_scope_rules` です。

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
  evidence_scope_include_low_priority: false
```

`review-input.schema.json` は `evidence_scope_rules` が array であることと、`evidence_scope_include_low_priority` が boolean であることを検証します。rule entry の詳細は `parseProjectRules` が検証します。

この分離により、不正 rule は review-input 全体の hard failure にせず、rule ID を含む warning として除外できます。ただし `bob_options` の未知項目は引き続き `additionalProperties: false` で拒否します。

`applies_when` に指定した次元はすべて一致する必要があります。各配列内は OR、異なる次元間は AND です。

- `paths`: `/` 正規化後の `*` / `**` glob
- `languages`
- `symbol_kinds`
- `risk_tags`
- `interface_change`

重複 rule ID は先勝ちです。`evaluation: local` の rule は token cost 0、`evaluation: ai` の rule は `estimated_tokens` を budget へ加算します。

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

既存 analyzer から変換する adapter の evidence 見積りは `ceil(text.length / 4)` です。Phase 2 pipeline の budget は `max(1, floor(maxBobInputBytes / 4))` です。課金 token や特定モデル tokenizer と同一とは扱いません。

## Pipeline adapter

`buildReviewContextBudget` は、検証済み `ReviewInput`、immutable SHA を持つ `DiffSummary`、文書 evidence、コード解析結果、正規化済み limits を受け取ります。

処理内容は次です。

1. `bob_options.evidence_scope_rules` を parse する。
2. review ID、ticket ID、review focus、title、purpose から document keyword を作る。
3. `analysis_options.max_call_depth` で依存展開深度を決める。未指定時は 1。
4. `maxBobInputBytes` から scope budget を算出する。
5. `buildReviewEvidenceScope` を実行する。
6. parser warning と scope warning を sort・deduplicate する。
7. `createContextBudgetArtifact` で artifact を作る。

`preprocessReview` は scope warning を既存の diff/document/code/traceability/package warning とともに返します。public input/result shape は変えません。

## `context-budget-report.json` 契約

Phase 2 は `review-package/context-budget-report.json` を毎回生成します。

```json
{
  "schema_version": 1,
  "selection_policy": "bob-evidence-scope-v1",
  "scope_fingerprint": "scope-1234abcd",
  "source_revision": "<40-char-sha>..<40-char-sha>",
  "token_estimation": "ceil(text.length / 4); budget=floor(maxBobInputBytes / 4)",
  "rule_source": "review-input.bob_options.evidence_scope_rules",
  "selected_code": [],
  "applicable_rules": [],
  "selected_documents": [],
  "unknown_impact": [],
  "budget": {
    "budgetTokens": 524288,
    "selectedTokens": 0,
    "requiredTokens": 0,
    "overBudget": false,
    "selected": [],
    "excluded": []
  },
  "warnings": []
}
```

report は raw source body、raw diff、文書本文、code-slice Markdown を複製しません。次工程は ID、priority、estimate、reason、fingerprint、unknown impact を使って、必要な evidence 本体を既存 package から参照します。

## Managed output と manifest

`context-budget-report.json` は `MANAGED_PACKAGE_OUTPUTS` の一部です。package 再生成時に stale copy を消し、現在の artifact がある場合だけ書き直します。

`manifest.yaml` は artifact が存在するときだけ次を出力します。

```yaml
inputs:
  context_budget_report: .bob-review/review-package/context-budget-report.json
```

低レベル API として `buildReviewPackage` を artifact なしで呼んだ場合、この行はありませんが、古い report は削除されます。

## Determinism

同じ論理入力について、symbol、edge、rule、document candidate の入力配列順が変わっても次が同一になります。

- 選定順
- budget report
- warning 順
- unknown impact 順
- `scopeFingerprint`

VCS ref は report 生成前に 40 桁 commit SHA へ解決されます。branch 名を source revision として記録しません。

fingerprint は security 用 checksum ではありません。選定 scope の安定比較用に、unknown impact の reason を含む sorted canonical identity へ FNV-1a 32-bit を適用しています。Phase 3 の rule pack と将来の artifact ledger では、別途 SHA-256 input hash を記録します。

## Phase 3 境界

次の実装単位では project rule pack ファイルを read-only で読み込み、schema/version、source path、SHA-256 rule-pack hash を report と manifest へ追加します。

Phase 2 は次を行いません。

- workspace 外 rule pack の探索
- UNC/AD credential 管理
- raw document cache
- producer 横断 artifact index
- stale artifact の ledger 伝播
