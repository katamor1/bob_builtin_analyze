# `bob-evidence-scope` ドメイン契約（Phase 1–5）

## 目的

`bob-evidence-scope` は、巨大なコード・文書・規約を無条件に AI へ渡さず、今回の変更に必要な evidence を決定論的に選び、採用・除外理由、未解決影響、概算 token 量、入力 provenance を残すためのドメイン境界です。

- Phase 1: change scope、rule applicability、document adapter、context budget
- Phase 2: `preprocessReview` と review-package への接続
- Phase 3: workspace-local project rule pack と SHA-256 provenance
- Phase 4: versioned repository symbol/reference index consumer
- Phase 5: immutable Git snapshot producer と file-fragment incremental cache

現時点では `bob-code-consistency-review` 内の独立モジュールですが、domain engine、loader、producer、merge adapter、pipeline adapter、serializer を分離しており、将来の別 VSIX や外部 producer から同じ契約を再利用できます。

## 公開 API

`src/evidenceScope/index.ts` は公開面を明示 export します。

- `buildEvidenceScope(request)`
- `buildReviewEvidenceScope(codeAnalysis, documents, options)`
- `buildReviewContextBudget(input)`
- `planContextBudget(items, policy)`
- `selectApplicableRules(rules, symbols)`
- `parseProjectRules(value)`
- `loadProjectRulePack(input)`
- `mergeProjectRules(projectRules, inlineRules)`
- `loadRepositorySymbolIndex(input)`
- `mergeRepositoryScopeData(analysisSymbols, analysisEdges, repositoryIndex)`
- `produceRepositorySymbolIndex(input)`
- `InMemoryDocumentEvidenceAdapter`
- `createContextBudgetArtifact(scope, metadata)`

`export *` は使いません。公開 API と型を列挙し、将来の分離・versioning 時の accidental export を防ぎます。

## Change Scope Engine

`changedSymbolIds` を必須 seed とし、resolved dependency edge を breadth-first で展開します。incoming/outgoing の両方向を impact として扱います。

| 深さ | 優先度 | 代表例 |
| --- | --- | --- |
| 0 | `required` | 変更 symbol、公開 interface 変更 |
| 1 | `high` | 直接 caller/callee、type/global/test dependency |
| 2 以上 | `medium` | 2-hop 以降の影響候補 |
| 非関連 | `low` | 変更との関連を証明できない候補 |

`maxDependencyDepth` が非有限値なら0に正規化します。`resolution: unknown` の edge は展開せず、source、kind、reason、target hint を `unknownImpact` に残します。

## Project Rule Pack

### 設定

```yaml
bob_options:
  evidence_scope_rule_pack_path: .bob/evidence-scope/project-rules.yaml
  evidence_scope_rules:
    - id: review-specific-check
      title: Review-specific check
      evaluation: local
  evidence_scope_include_low_priority: false
```

rule-pack path は workspace-relative の `.json` / `.yaml` / `.yml` に限定します。absolute path、`..`、control character、workspace 外へ解決される symlink は拒否します。

### v1 schema

```yaml
schema_version: 1
rule_pack:
  id: payment-review
  version: "2026.07"
rules:
  - id: public-api-compatibility
    title: Public API compatibility
    evaluation: ai
    estimated_tokens: 120
    priority: required
    applies_when:
      paths: [src/public/**]
      languages: [cpp]
      symbol_kinds: [function]
      risk_tags: [compatibility]
      interface_change: true
```

runtime と docs mirror の schema は byte-identical です。authoritative project pack の schema error、invalid rule、duplicate ID は fatal。review-local inline rule の invalid entry は warning として除外します。

### Read-only / hash

`loadProjectRulePack` は path/realpath containment、mode `r`、`maxDocumentBytes` 前後検査、exact raw bytes SHA-256、encoding decode、schema/semantic validation を行います。raw rule body や credentials は artifact に保存しません。

### Merge precedence

project rule が authoritative です。project rules を先に登録し、inline-only ID を追加します。inline が project ID を再利用した場合は project entry を維持し deterministic warning を出します。

`applies_when` の異なる次元間は AND、各配列内は OR。`evaluation: local` は token cost 0、`ai` は `estimated_tokens` を budget に加算します。

## Repository Symbol/Reference Index Consumer

### consume mode 設定

```yaml
analysis_options:
  repository_symbol_index_mode: consume
  repository_symbol_index_path: .bob/evidence-scope/repository-symbol-index.json
  max_call_depth: 2
```

`repository_symbol_index_mode` 未指定時は `consume` と同等です。path 未設定時は Phase 3 と同じ changed-file analysis だけで scope を構築します。

### Index v1

```json
{
  "schema_version": 1,
  "index": {
    "id": "payment-repository",
    "source_revision": "<40-character-head-sha>",
    "generator": "producer-name/version"
  },
  "symbols": [
    {
      "id": "function:src/payment/api.ts#authorize",
      "name": "authorize",
      "path": "src/payment/api.ts",
      "kind": "function",
      "language": "typescript",
      "estimated_tokens": 80,
      "risk_tags": ["security"]
    }
  ],
  "edges": [
    {
      "from": "file:test/payment.test.ts",
      "to": "file:src/payment/api.ts",
      "kind": "tests",
      "resolution": "resolved",
      "reason": "test import"
    }
  ]
}
```

runtime/docs schema mirrorsは byte-identical。`schema_version: 1`、index ID、immutable source revision、symbols、edges を必須にします。edge kind は producer 固有 relationship を許す open string です。

### Consumer boundary

`loadRepositorySymbolIndex` は次を強制します。

1. workspace-relative `.json` path
2. lexical path と realpath/symlink containment
3. read-only bounded load
4. exact raw-byte SHA-256
5. JSON/schema validation
6. `index.source_revision === resolved diff.head`
7. duplicate symbol/edge、dangling resolved target、invalid path の拒否

stale index は warning で続行せず fatal とします。古い graph を正しい impact として採用する方が index 無効化より危険だからです。

`is_test: true` の symbol には `test-impact` risk tag を追加します。unknown edge は `target_hint` と reason を human-visible に残します。

### Stable identity / merge precedence

current changed-file analysis が authoritative です。

1. exact ID match を優先
2. exact match がなければ normalized `(path, name, kind)` が repository 内で一意な場合だけ stable repository ID へ昇格
3. ambiguous match は current ID を維持し deterministic warning
4. repository symbol/edge を先に登録し current analysis の matching record で上書き
5. current call edge も stable alias table へ remap

repository index は seed を増やしません。changed symbols だけを seed とし、consumer graph は caller、callee、type、global、test、import、inheritance、implementation の bounded expansion を提供します。

## Repository Index Producer（Phase 5）

### build mode 設定

```yaml
analysis_options:
  repository_symbol_index_mode: build
  repository_symbol_index_path: .bob/evidence-scope/repository-symbol-index.json
  repository_symbol_index_cache_path: .bob/evidence-scope/repository-symbol-index.cache.json
```

- `build` は index path 必須
- cache path は build mode のみ
- cache 未指定時は index path から `.cache.json` を導出
- index/cache は `.bob/evidence-scope/` または `.custom/` 配下だけ
- built-in producer は Git のみ。Bazaar consumer contract は維持する

### Immutable source contract

producer は working-tree bytes を抽出入力にしません。

1. `sourceRevision` が40桁 SHAであることを確認
2. checked-out Git HEAD と一致することを確認
3. `git ls-tree -r -l -z <sha>` で tracked blobs を列挙
4. selected tracked source の dirty state を拒否
5. rebuild 対象だけ `git cat-file blob <object-id>` で読む

同じ commit、同じ options、同じ extractor version なら checkout EOL、mtime、filesystem ordering に依存せず同じ logical index を生成します。

### Supported source set

組込み extractor は以下を対象にします。

- C / C++ / header
- TypeScript / JavaScript
- Python
- C#
- Java
- Go
- Rust

review input に producer 未対応 language が含まれても build 全体を即時失敗させず、対応 language だけを deterministic に選び warning を返します。producer 対象が0件なら明示 error とします。

### Stable IDs and fragments

file fragment は raw source を保持せず、stable symbol metadata と unresolved reference candidate だけを保持します。

```text
file:src/payment/api.ts
function:src/payment/api.ts#authorize
type:src/payment/api.ts#Request
```

fragment fields:

- path / language / byte count
- source-free symbols
- local resolved edges
- import/include/test/call/type reference candidates
- deterministic warnings

組込み extractor は conservative lexical policy です。compiler/LSP-grade completeness を主張しません。曖昧な関係は unknown impact として残します。

### Global relink

cache hit した fragment も含め、全 fragment の references は毎 build 再リンクします。

- relative import/include を repository path へ解決
- test file から production file への path relation を `tests` edge に分類
- name reference は kind-compatible candidate が一意な場合だけ解決
- ambiguous/missing candidate は unknown edge
- symbols/edges/warnings を canonical sort・deduplicate

これにより、callee 側だけの変更・追加・削除でも reused caller fragment の edge が最新 graph に追随します。

## Incremental Cache

### Cache v1

cache は consumer input ではなく producer 内部 optimization です。review package や report には含めません。

header:

- `schema_version: 1`
- producer ID/version
- producer options hash
- source revision
- extraction policy/encoding

file entry:

- normalized source path
- Git blob object ID
- exact blob SHA-256
- byte size / language
- source-free fragment

### Reuse / invalidation

fragment reuse 条件:

- producer ID/version 一致
- options hash 一致
- path と blob object ID 一致
- cache entry semantic validation success

new/changed blob は rebuild、deleted path は drop。language set、encoding、repository root、extractor policy など output semantics に影響する option は options hash に含め、変更時は全 fragment を invalidate します。

cache missing、corrupt、unknown schema、invalid fragment は warning + full rebuild。cache は source of truth ではありません。

### Atomic write

index/cache は canonical JSON + trailing newline として temporary sibling file へ書き、rename で置換します。Windows の短時間 rename conflict に限定 retry を適用します。

## Document Evidence Adapter

ドメインは文書ファイルを直接読みません。`DocumentEvidenceAdapter` は symbol ID、risk tag、rule ID、keyword に対して、stable ID、source path、locator、content hash、estimated tokens を持つ unit を返します。

参照実装は symbol link、risk/rule tag、keyword の順で rank し、同一 ID は最上位候補だけを残します。raw document は domain artifact に複製しません。

## Context Budget

`planContextBudget` は `required -> high -> medium -> low`、同一優先度では ID 昇順です。

- `required`: budget 超過でも採用
- `high` / `medium`: 残量に収まる場合だけ採用
- `low`: explicit opt-in がない限り除外
- exclusion: `token-budget` / `low-priority-policy`
- duplicate: `kind:id` で統合し reasons をdeduplicate

既存 analyzer evidence は `ceil(text.length / 4)`、pipeline budget は `max(1, floor(maxBobInputBytes / 4))`。特定 model tokenizer と同一とは扱いません。

## Pipeline Order

`preprocessReview` と `buildReviewContextBudget` の順序:

1. review input parse/schema validation
2. VCS base/head を immutable revision に解決
3. build mode の場合 producer を実行
4. configured rule pack を read-only load/validate
5. inline rules と project-authoritative merge
6. generated/configured repository index を Phase 4 loader で再検証
7. current analysis と repository graph を stable identity で merge
8. document keywords、max depth、token budget を構築
9. evidence scope を実行
10. warnings を sort/deduplicate
11. context-budget artifact と review package を生成

build mode の生成物を loader で再読込するため、producer と consumer の schema/freshness/semantic contract が同じ preprocessing 内でも省略されません。

`PreprocessResult.repositoryIndexBuild` は build metrics を返します。

- index/cache path
- index ID、revision、hash、symbol/edge count
- scanned/reused/rebuilt/removed file count
- cache status: `miss | partial | hit`
- warnings

## `context-budget-report.json`

report は selection と provenance を保持します。

```json
{
  "schema_version": 1,
  "selection_policy": "bob-evidence-scope-v1",
  "scope_fingerprint": "scope-1234abcd",
  "source_revision": "<base-sha>..<head-sha>",
  "rule_pack": {
    "schema_version": 1,
    "id": "payment-review",
    "version": "2026.07",
    "source_path": ".bob/evidence-scope/project-rules.yaml",
    "content_hash": "sha256:..."
  },
  "symbol_index": {
    "schema_version": 1,
    "id": "bob-repository-index",
    "source_revision": "<head-sha>",
    "source_path": ".bob/evidence-scope/repository-symbol-index.json",
    "content_hash": "sha256:...",
    "symbol_count": 1250,
    "edge_count": 4890
  },
  "selected_code": [],
  "applicable_rules": [],
  "selected_documents": [],
  "unknown_impact": [],
  "budget": {},
  "warnings": []
}
```

report は raw source、raw diff、document body、code-slice Markdown、raw rule pack、raw repository index、cache body を複製しません。

## Manifest / stale detection

index/rule pack がある場合、`manifest.yaml` は path、ID、version/revision、SHA-256、symbol/edge counts を記録します。

`artifact_metadata.input_hash` は次を含みます。

- normalized review input
- immutable diff input
- rule-pack content hash
- repository-index content hash

rule pack または index bytes だけが変わっても review package input hash が変わります。未設定 provenance は出力せず hash input に空文字列を使います。

`context-budget-report.json` は managed output。再生成時に stale copy を消し、現在の artifact がある場合だけ書き直します。

## Determinism / Security

同じ logical input、same immutable revisions、same rule/index bytes、same producer options について、input array/file enumeration order が変わっても selection、warnings、unknown impact、fingerprint、provenance、producer index は安定します。

security checksum は exact raw bytes の SHA-256。scope fingerprint の FNV-1a は selection comparison 用でsecurity checksumではありません。

境界:

- workspace/repository-root lexical・physical containment
- read-only authoritative inputs
- bounded Git process timeout/stdout
- bounded source count/per-file/aggregate bytes
- tracked immutable blob only
- no raw source/document/rule/cache body in review package
- no credential management/storage
- no new npm dependency

## Phase 5 非目標

- compiler/LSP/ctags の自動導入
- Bazaar index producer
- remote/distributed cache
- workspace 外 source scan
- producer横断 artifact ledger
- stale artifact のledger伝播
- cacheをuser-facing artifact/source of truthにすること
