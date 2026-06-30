# Workflow Builder ヘルプ検索・項目ジャンプ

## 背景

Phase 1 では、Workflow Builder に静的な日本語コンテキストヘルプを追加した。

Phase 2 では、設定者が項目名や効果を覚えていなくても、ヘルプパネル上で検索し、該当項目へ移動できるようにする。

## 追加機能

- ヘルプパネル上部に `ヘルプ検索` 入力欄を表示する。
- `resultKey`、`承認`、`成果物`、`Bob`、`stop` など、日本語・英語のどちらでも検索できる。
- 検索対象は以下。
  - help entry id
  - 日本語ラベル
  - 実フィールド名
  - 概要
  - 効果
  - 使う場面
  - 注意
  - YAML例
  - select 選択肢の説明
- 検索結果には日本語ラベル、実フィールド名、対象タブを表示する。
- 検索結果をクリックすると、対象タブへ移動し、可能な場合は該当 input / select / textarea へ focus する。

## 実装方針

`workflowBuilderHelpCatalog.ts` のデータ構造は大きく変更しない。

`workflowBuilderHelpScript.ts` 側で help id から対象タブを推定する。

| help id prefix | tab |
| --- | --- |
| `step.` / `command.` / `result.` | `Step detail` |
| `input.` | `Inputs` |
| `requires.` | `Requires` |
| `preflight.` | `Preflight` |
| `artifact.` | `Artifacts` |
| `guardrails.` / `approval.` | `Guardrails` |
| `completion.` | `Completion` |
| `body.` | `Markdown Body` |
| `tab.*` | 対応するタブ |
| `meta.` | 左側の基本情報 |

## 非対象

- 検索結果のランキング最適化。
- 類義語辞書の導入。
- Diagnostics からの自動誘導。
- AI による動的説明生成。

これらは後続 Phase の候補とする。
