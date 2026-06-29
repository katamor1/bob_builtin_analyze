# Bob Code Consistency Review（コード整合プレレビュー）

`bob-code-consistency-review` は、コード変更と要求書・基本設計書・詳細設計書・テスト仕様書の整合性を、正式レビュー前に IBM Bob でプレレビューするための拡張機能として整備する予定の領域です。

現時点では、VS Code 拡張機能としての実装本体はまだ `extensions/bob-code-consistency-review/` には配置していません。MVP 実装スケルトンは `docs/workflows/code-consistency-review/scaffold/` にあり、既存リポジトリ構成やビルド方式と衝突しないよう、まずはドキュメント配下で検証できる形にしています。

この README では、コマンド名、設定キー、JSON / YAML のフィールド名、ファイル名、識別子は実装上の名称として原文のまま記載します。

## 目的

この拡張機能の目的は、コード差分と関連文書を Bob にそのまま投げるのではなく、事前に機械的な抽出・正規化・根拠付けを行い、Bob が意味的な整合確認に集中できる入力パッケージを作ることです。

正式レビューや承認を Bob に置き換えるものではありません。Bob は不整合候補を出すプレレビュー担当とし、最終判断は人間が行います。

## できること

将来的な拡張機能では、次の機能を提供する想定です。

- `review-input.yaml` で対象コミット、比較先、関連文書、レビュー観点を指定する。
- Git 差分、変更ファイル、変更関数を収集する。
- Word / Excel / Markdown などの関連文書から、Bob に渡す根拠抜粋を作る。
- 要求、設計、コード、テスト仕様の対応候補を作る。
- Bob 投入用の `review-package` を生成する。
- Bob 出力 YAML を schema で検証する。
- 人間が Bob 指摘を `accept` / `reject` / `needs-investigation` などに分類する triage 成果物を作る。

## 現在の実装状態

現在の実装・検証対象は次の場所にあります。

```text
docs/workflows/code-consistency-review/
  README.md
  review-input-schema.md
  review-package-spec.md
  bob-prompt-template.md
  bob-output-schema.md
  human-triage-spec.md
  c-cpp-analysis-scope.md
  document-extraction-spec.md
  mvp-architecture.md
  mvp-implementation-plan.md
  implementation-assets.md
  schemas/
  templates/
  examples/simple-timeout-bugfix/
  scaffold/
```

MVP スケルトンは次のディレクトリです。

```text
docs/workflows/code-consistency-review/scaffold/
```

この README は、上記 scaffold を後続フェーズで VS Code 拡張機能へ移行するときの、拡張機能側 README の土台です。

## 想定する利用フロー

1. 対象リポジトリと関連文書を含むワークスペースを開く。
2. `review-input.yaml` に、レビュー対象のコミット、比較先、関連文書、観点を記載する。
3. `preprocess` で Git 差分、文書抜粋、対応候補を収集し、`review-package` を作る。
4. `review-package/bob-input.md` を Bob に渡して整合プレレビューを実行する。
5. Bob が出力した `bob-output.yaml` を schema で検証する。
6. 人間が指摘を確認し、triage 結果を保存する。
7. 採用する指摘だけを正式レビューまたは修正作業に回す。

## CLI スケルトンのコマンド

現時点の scaffold では、次の CLI を想定しています。

```bash
bob-review preprocess --input review-input.yaml --out .bob-review/review-package
bob-review validate-output --package .bob-review/review-package --bob-output .bob-review/bob-output/bob-output.yaml
bob-review triage --package .bob-review/review-package --bob-output .bob-review/bob-output/bob-output.yaml --out .bob-review/human-triage
```

| コマンド | 用途 |
| --- | --- |
| `preprocess` | `review-input.yaml` を読み込み、Git 差分、文書抜粋、対応候補、Bob 入力を含む `review-package` を作る。 |
| `validate-output` | Bob 出力 YAML を `bob-output.schema.json` で検証する。 |
| `triage` | Bob 出力をもとに、人間確認用の triage 成果物を作る。 |

## 生成・更新する主なファイル

MVP では、次のような作業ディレクトリを想定します。

```text
.bob-review/
  review-package/
    review-input.normalized.yaml
    changed-files.json
    document-excerpts.json
    traceability-candidates.json
    bob-input.md
  bob-output/
    bob-output.yaml
  human-triage/
    triage-result.yaml
```

`review-package` は Bob に渡す前の根拠パッケージです。Bob が推測だけで判断しないよう、各情報には evidence_id を残す方針です。

## `workflow-register` との連携方針

VS Code 拡張機能へ移行する場合は、`workflow-register` から呼び出せる command step を提供する想定です。

代表的なステップ構成は次の通りです。

```yaml
steps:
  - id: preprocess
    title: 整合レビュー入力の前処理
    type: command
    action:
      provider: vscode.executeCommand
      args:
        - bobCodeConsistency.preprocess
    resultKey: reviewPackage
    required: true
    sendResult: true
  - id: review-with-bob
    title: Bob 整合プレレビュー
    type: agent
    includeState:
      - reviewPackage
    prompt: |
      reviewPackage の根拠だけを使って、コード変更と要求・設計・テスト仕様の不整合候補を抽出してください。
  - id: validate-output
    title: Bob 出力検証
    type: command
    action:
      provider: vscode.executeCommand
      args:
        - bobCodeConsistency.validateOutput
    resultKey: validationResult
    required: true
    sendResult: true
```

## Bob にさせること / させないこと

| 区分 | 内容 |
| --- | --- |
| Bob にさせること | 要求、設計、コード、テスト仕様の意味的な不整合候補を抽出する。 |
| 拡張機能で行うこと | 差分収集、文書抽出、schema 検証、ファイル生成、決定論的チェックを行う。 |
| 人間が行うこと | 指摘の採用判断、追加調査、正式レビュー、承認を行う。 |
| Bob にさせないこと | 正式承認、根拠なし断定、大規模ファイル探索、破壊的操作、レビュー対象外ファイルの勝手な推測。 |

## セキュリティと安全設計

- Bob に投入する前に、差分・文書抜粋・対応候補を明示的な `review-package` として固定する。
- Bob 出力は `bob-output.schema.json` で検証する。
- `final_approval` は `not_performed` 以外を invalid として扱う。
- 解析不能な情報は黙って捨てず、warning として保存する。
- 文書やコードの全量投入ではなく、根拠 ID 付きの抜粋を渡す。
- ファイル更新、コミット、PR コメント投稿などの副作用は、人間の明示操作または別フェーズで扱う。

## ビルドと検証

現時点では拡張機能本体ではなく scaffold を検証します。

```powershell
cd docs\workflows\code-consistency-review\scaffold
npm install
npm run typecheck
npm run unit
npm run smoke
```

VS Code 拡張機能として `extensions/bob-code-consistency-review/` に移行した後は、他の拡張機能と同様に拡張機能ディレクトリ単位で `npm install`、`npm run compile`、`npm run test`、`npm run package` を実行する想定です。

## 関連ドキュメント

- `docs/workflows/code-consistency-review/README.md`
- `docs/workflows/code-consistency-review/review-input-schema.md`
- `docs/workflows/code-consistency-review/review-package-spec.md`
- `docs/workflows/code-consistency-review/bob-prompt-template.md`
- `docs/workflows/code-consistency-review/bob-output-schema.md`
- `docs/workflows/code-consistency-review/human-triage-spec.md`
- `docs/workflows/code-consistency-review/scaffold/README.md`
- `extensions/workflow-register/README.md`
- `extensions/README.md`
