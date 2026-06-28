# extensions

このディレクトリには、IBM Bob を拡張するためのローカル VS Code 拡張機能を配置します。

現在の主な構成は次の通りです。

| 拡張機能 | 役割 | README |
| --- | --- | --- |
| `workflow-register` | `.bob/workflows/*/WORKFLOW.md` を読み込み、IBM Bob の workflow source として登録する。作成、検証、実行、診断、AI 補助のコマンドも提供する。 | `extensions/workflow-register/README.md` |
| `bob-bazaar-review` | Bazaar 差分レビュー、プロジェクト規約読み込み、review-result JSON 検証、読み取り専用 Bazaar MCP server を提供する。 | `extensions/bob-bazaar-review/README.md` |

## 推奨する読み順

1. `docs/workflow-authoring-guide-ja.md`
2. `extensions/workflow-register/README.md`
3. `extensions/bob-bazaar-review/README.md`

まずワークフロー定義の作り方を確認し、その後で各拡張機能の README を読んでください。

## 拡張機能の関係

```text
IBM.bob-code
  └─ workflow-register
       └─ bob-bazaar-review
```

`workflow-register` は、Bob に workflow を登録する基盤拡張です。

`bob-bazaar-review` は、`workflow-register` から呼び出せる Bazaar レビュー用 command や result capture を提供する連携拡張です。

## `.bob` workspace 構成

ワークフローとレビュー規約は、利用側 workspace の `.bob` に配置します。

```text
.bob/
  workflows/
    <workflow-name>/
      WORKFLOW.md
  review/
    checklist.json
    review-result.schema.json
  skills/
    <skill-name>/
      SKILL.md
  custom_modes.yaml
  mcp.json
```

`workflow-register` が直接読み込むのは次のファイルです。

```text
.bob/workflows/*/WORKFLOW.md
```

`bob-bazaar-review` は Bazaar レビュー向けに `.bob/review`、`.bob/mcp.json`、同梱 workflow / skill / mode の初期化を支援します。

## 新しい拡張機能を追加するときの README 方針

各拡張機能の README には、最低限次の項目を日本語で書いてください。

- 拡張機能の目的
- 依存拡張
- 利用手順
- Command Palette のコマンド一覧
- 設定項目
- 生成・更新するファイル
- `workflow-register` との連携方法
- ビルド方法
- セキュリティ上の注意点
- 関連ドキュメント

## ビルド方針

各拡張機能は、原則として拡張機能ディレクトリごとにビルドします。

```powershell
cd extensions\workflow-register
npm install
npm run compile
npm run test
npm run package
```

```powershell
cd extensions\bob-bazaar-review
npm install
npm run compile
npm run test
npm run package
```

## 関連ドキュメント

- `docs/workflow-authoring-guide-ja.md`
- `extensions/workflow-register/README.md`
- `extensions/bob-bazaar-review/README.md`
