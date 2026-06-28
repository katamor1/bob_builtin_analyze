# 整合プレレビュー scaffold 開発手順

## 1. 目的

この文書は、`scaffold/` 配下の MVP 実装スケルトンを、開発者がローカルで確認するための手順を定義する。

この scaffold はまだ正式な拡張機能配置ではない。既存構成に移す前に、CLI の入出力、review-package 生成、bob-output 検証、human triage 生成の流れを確認するための足場である。

## 2. 前提

- Node.js が利用できること。
- Git コマンドが利用できること。
- scaffold の作業ディレクトリは `docs/workflows/code-consistency-review/scaffold/` とする。
- 実行時はリポジトリルートからの相対パスを扱う。

## 3. 初期セットアップ

```bash
cd docs/workflows/code-consistency-review/scaffold
npm install
npm run build
```

## 4. help 表示確認

```bash
node dist/cli/main.js
```

期待:

- `preprocess`
- `validate-output`
- `triage`

の 3 サブコマンドが表示される。

## 5. preprocess の確認

リポジトリルートで以下を実行する。

```bash
node docs/workflows/code-consistency-review/scaffold/dist/cli/main.js preprocess \
  --input docs/workflows/code-consistency-review/examples/simple-timeout-bugfix/review-input.yaml \
  --out .bob-review/review-package
```

期待する生成物:

```text
.bob-review/review-package/
  manifest.yaml
  input-normalized.json
  changed-files.json
  changed-symbols.json
  change-summary.md
  diff-context.md
  document-index.json
  document-excerpts.md
  traceability-map.md
  deterministic-checks.md
  evidence-index.json
  bob-input.md
```

注意:

- 現時点の scaffold では、文書抽出と C/C++ 解析は TODO を含む簡易実装である。
- `review-input.yaml` の `base` / `head` がローカルで存在しない場合、Git diff 収集で失敗する。
- その場合は fixture を使った手動確認、またはローカルに検証ブランチを作成して実行する。

## 6. bob-output 検証

```bash
node docs/workflows/code-consistency-review/scaffold/dist/cli/main.js validate-output \
  --package .bob-review/review-package \
  --bob-output docs/workflows/code-consistency-review/examples/simple-timeout-bugfix/bob-output.sample.yaml
```

期待:

- `review_summary.final_approval` が `not_performed` であることを確認する。
- finding に evidence と human_check があることを確認する。
- MVP scaffold では evidence-index との完全照合は TODO warning とする。

## 7. human triage 生成

```bash
node docs/workflows/code-consistency-review/scaffold/dist/cli/main.js triage \
  --package .bob-review/review-package \
  --bob-output docs/workflows/code-consistency-review/examples/simple-timeout-bugfix/bob-output.sample.yaml \
  --out .bob-review/human-triage
```

期待する生成物:

```text
.bob-review/human-triage/
  triage-result.yaml
  accepted-findings.md
  questions-to-author.md
  rejected-findings.md
  follow-up-actions.md
```

## 8. 最初に改善すべき TODO

1. `review-input-validator.ts` で JSON Schema 検証を使う。
2. `document-extractor.ts` で Markdown 文書の実テキストを抽出する。
3. `c-cpp-change-analyzer.ts` で変更行の関数所属を推定する。
4. `bob-output-validator.ts` で evidence-index との照合を実装する。
5. `human-triage-helper.ts` で triage-result.yaml の decision に応じた Markdown 分割を行う。

## 9. 終了コード方針

| 状態 | 終了コード |
|---|---:|
| 正常終了 | 0 |
| 入力不正 | 1 |
| Git diff 取得失敗 | 1 |
| bob-output invalid | 1 |
| warning のみ | 0 |

## 10. このフェーズの完了条件

- `npm run build` が通る構成になっている。
- `node dist/cli/main.js` で help が表示できる。
- fixture を使って validator / triage の入出力を確認できる。
- TODO が明示され、次の実装対象が分かる。
