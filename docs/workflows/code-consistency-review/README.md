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

## 実装順序

```text
1. review-input-schema.md
2. review-package-spec.md
3. document-extraction-spec.md
4. c-cpp-analysis-scope.md
5. bob-prompt-template.md
6. bob-output-schema.md
7. human-triage-spec.md
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

## 担当境界

| 領域 | 主担当 |
|---|---|
| 事実抽出 | 拡張機能 |
| 決定論的チェック | 拡張機能 / CI |
| 意味的な不整合候補の抽出 | bob |
| 指摘採用判断 | 人間 |
| 正式承認 | 人間 |
