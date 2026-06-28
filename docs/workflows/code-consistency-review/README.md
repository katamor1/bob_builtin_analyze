# コード変更と要求・設計整合プレレビュー 詳細仕様

このディレクトリは、コード変更と要求書・設計書・テスト仕様書の整合プレレビューを実装するための詳細仕様をまとめる。

## 文書一覧

| 文書 | 内容 |
|---|---|
| `../code-requirement-design-consistency-review.md` | 全体の詳細フロー |
| `../code-requirement-design-consistency-review-plan-skeleton.md` | 計画の骨格 |
| `review-input-schema.md` | 人間が指定する入力 YAML の仕様 |
| `review-package-spec.md` | bob 投入前に作る根拠パッケージ仕様 |
| `bob-prompt-template.md` | bob に投入するプロンプトテンプレート |
| `bob-output-schema.md` | bob の構造化出力 YAML 仕様 |
| `human-triage-spec.md` | bob 出力を人間が採用・棄却・追加調査に分類する仕様 |
| `c-cpp-analysis-scope.md` | C/C++ コード解析で抽出する対象 |
| `document-extraction-spec.md` | Word / Excel / Markdown 文書抽出仕様 |
| `mvp-implementation-plan.md` | MVP 実装マイルストーン、タスク、受け入れ条件 |
| `mvp-architecture.md` | MVP の CLI、モジュール、データフロー構成 |
| `mvp-backlog.md` | MVP 実装チケット候補と着手順 |
| `examples/simple-timeout-bugfix/README.md` | E2E 検証用の timeout 不整合サンプル |

## 実装順序

```text
1. review-input-schema.md
2. review-package-spec.md
3. document-extraction-spec.md
4. c-cpp-analysis-scope.md
5. bob-prompt-template.md
6. bob-output-schema.md
7. human-triage-spec.md
8. mvp-implementation-plan.md
9. mvp-architecture.md
10. mvp-backlog.md
11. examples/simple-timeout-bugfix/README.md
```

## MVP のゴール

MVP では、1 件のコード変更に対して以下を実現する。

- `review-input.yaml` で対象コミットと関連文書を指定できる。
- Git 差分、変更ファイル、変更関数を抽出できる。
- Word / Excel / Markdown から関連文書の抜粋を作れる。
- 要求・設計・コード・テストの対応候補を作れる。
- bob 投入用の `review-package` を生成できる。
- bob 出力を YAML として保存できる。
- 人間が bob 出力を triage できる。

## MVP 実装単位

```text
M1. review-input-validator
M2. git-diff-collector
M3. review-package-builder の最小版
M4. document-extractor の最小版
M5. c-cpp-change-analyzer の最小版
M6. traceability-builder の最小版
M7. bob-input.md 生成
M8. bob-output-validator
M9. human-triage-helper
M10. サンプル変更で end-to-end 検証
```

## CLI の想定

```bash
bob-review preprocess --input review-input.yaml --out .bob-review/review-package
bob-review validate-output --package .bob-review/review-package --bob-output .bob-review/bob-output/bob-output.yaml
bob-review triage --package .bob-review/review-package --bob-output .bob-review/bob-output/bob-output.yaml --out .bob-review/human-triage
```

## E2E サンプル

`examples/simple-timeout-bugfix/` には、timeout 発生時に `ERR_TIMEOUT` を返すべきところ、変更後コードが `ERR_OK` を返してしまう最小サンプルを配置する。

このサンプルは、以下の確認に使う。

- `review-input.yaml` の読み込み
- Markdown 文書抽出
- C コード変更解析
- 要求・設計・コード・テスト対応候補の生成
- bob-output YAML 検証
- human triage 出力生成

## 担当境界

| 領域 | 主担当 |
|---|---|
| 事実抽出 | 拡張機能 |
| 決定論的チェック | 拡張機能 / CI |
| 意味的な不整合候補の抽出 | bob |
| 指摘採用判断 | 人間 |
| 正式承認 | 人間 |
