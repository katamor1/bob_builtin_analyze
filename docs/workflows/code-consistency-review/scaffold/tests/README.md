# scaffold テスト fixture

## 1. 目的

このディレクトリは、整合プレレビュー scaffold の最小検証に使う fixture を置く。

MVP の初期段階では、完全な自動テストよりも、以下を人間と実装者が確認しやすくすることを優先する。

- 正常な `review-input.yaml` を読み込めること
- 不正な `review-input.yaml` を検出できること
- 正常な `bob-output.yaml` を valid と判定できること
- 最終承認してしまう `bob-output.yaml` を invalid と判定できること
- triage 用 Markdown / YAML を生成できること

## 2. fixture 一覧

```text
tests/fixtures/
  review-input.valid.yaml
  review-input.invalid-missing-head.yaml
  bob-output.valid.yaml
  bob-output.invalid-final-approval.yaml
```

## 3. 手動確認例

### 3.1 review-input valid

```bash
node dist/cli/main.js preprocess \
  --input tests/fixtures/review-input.valid.yaml \
  --out .tmp/review-package
```

この確認は Git diff を伴うため、fixture の `base` / `head` がローカルで解決できる必要がある。

### 3.2 bob-output valid

```bash
node dist/cli/main.js validate-output \
  --package .tmp/review-package \
  --bob-output tests/fixtures/bob-output.valid.yaml
```

期待:

- invalid error が出ない。

### 3.3 bob-output invalid

```bash
node dist/cli/main.js validate-output \
  --package .tmp/review-package \
  --bob-output tests/fixtures/bob-output.invalid-final-approval.yaml
```

期待:

- `review_summary.final_approval must be not_performed` を error として検出する。

## 4. 後続で自動化すること

- Node.js の `node:test` で validator の unit test を追加する。
- fixture を使った smoke test script を追加する。
- CI で scaffold の `npm run build` と validator テストを実行する。
