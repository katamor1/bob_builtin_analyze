# extensions ディレクトリ

このディレクトリには、IBM Bob / Bob IDEと連携する3つのローカルVS Code拡張機能を配置します。

| 拡張機能 | 役割 | main | README |
| --- | --- | --- | --- |
| `workflow-register` | workflow作成・登録・実行・再開・診断・成果物管理 | `./out/extensionWithAuthoring.js` | `extensions/workflow-register/README.md` |
| `bob-bazaar-review` | Bazaar review、project rules、Review Run、MCP | `./out/extension.js` | `extensions/bob-bazaar-review/README.md` |
| `bob-code-consistency-review` | コードと要求・設計・テストの整合プレレビュー | `./out/extension.js` | `extensions/bob-code-consistency-review/README.md` |

## 公開Command Palette契約

常時表示するCommand Palette entryは次の5件だけです。

| 表示名 | Command ID |
| --- | --- |
| `Bob: 操作ハブを開く` | `workflowRegister.openOperationHub` |
| `Bob Workflow: ワークフローを作成・編集` | `workflowRegister.openWorkflowBuilder` |
| `Bob Bazaar Review: レビューを開始` | `bobBazaar.openReviewGui` |
| `Bob Bazaar Review: 資料からプロジェクト規約を作成` | `bobBazaar.authorProjectRulesFromDocuments` |
| `Bob Code Consistency Review: 整合プレレビューを開始` | `bobCodeConsistency.openReviewWizard` |

workflow、provider、record、validation、run operation用commandは登録・activationを維持しますが、`menus.commandPalette`では`when: "false"`です。

## operator surface

- `Bob 操作ハブ`はworkflow setup、catalog、実行状況、resume、approval、abort、diagnostics、artifact inspectionの単一panelです。
- `ワークフロー作成・編集`は、空のworkflow、`標準テンプレートから作成`、既存workflow編集の3モードを持つ単一panelです。
- Bazaar Reviewは1つの主GUIでレビュー、`レビュー結果取り込み`、`指摘確認・振り分け`、`レビュー実績`を扱います。
- Code Consistency Reviewは1つの`整合プレレビュー`主GUIで入力・根拠選択、`トレーサビリティ整理`、前処理、`レビュー結果取り込み`、`指摘確認・振り分け`を扱います。

旧Explorer view、別run monitor、独立template panel、独立capture / triage / dashboard panelは現行operator surfaceではありません。

## soft dependency

3拡張は必須`extensionDependencies`を持ちません。

- `workflow-register`はIBM Bobがなくてもauthoring、validation、standalone実行、run inspectionを利用できます。
- `bob-bazaar-review`はIBM Bob / workflow-registerがなくても通常のBazaar review serviceを利用できます。
- `bob-code-consistency-review`はIBM Bob / workflow-registerがなくても初期化、前処理、validationなどのlocal serviceを利用できます。
- optional extensionがない場合はactivationを失敗させず、利用できない統合操作を理由付きで無効化します。

## 推奨する読み順

1. `extensions/workflow-register/README.md`
2. `extensions/bob-bazaar-review/README.md`
3. `docs/workflows/code-consistency-review/README.md`
4. `extensions/bob-code-consistency-review/README.md`
5. `docs/workflow-action-contracts-ja.md`

## workspace構成

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

.bob-review/
  review-package/
  bob-output/
  human-triage/

.bob-trace/
  traceability-catalog.json
  gate-report.md
```

`workflow-register`は各resolved Bob rootから見た`.bob/workflows/*/WORKFLOW.md`を読み込みます。multi-rootではrootを明示的に解決し、同名workflowを混同しません。

## 安全な書込み契約

- workflow authoringはPreview / Diagnostics / Diff / 明示確認 / backup / transactional saveを通します。
- Bazaar bundled template更新はdiff preview、明示確認、backup、updateの順です。cancel時は変更しません。
- Code Consistency bundled workflowは差分があればbackup後に更新します。
- 既存`review-input.yaml`は上書きせず、内容を変更しないままbackupだけ作成します。
- workspace外path、symlink / junction escape、stale revision、identity mismatchを拒否します。

## MCP境界

Bazaar MCPのBazaar operationsはread-onlyです。書込み可能なMCP toolは、明示opt-inされた`project_rules_init`だけです。

```text
BOB_BAZAAR_ENABLE_WRITE_TOOLS=1
BOB_BAZAAR_ALLOWED_ROOTS=<approved roots>
```

`.bob/mcp.json`の更新はVS Code設定操作であり、MCP tool writeとは別です。通常の設定処理はwrite toolを自動有効化しません。

## README方針

各拡張READMEには次を記載します。

- 拡張機能の目的
- exact public Command Palette entry
- hidden workflow / internal commandの境界
- soft dependency
- operator flow
- 設定
- 生成・更新するfile
- backup / confirmation / transaction契約
- workflow / MCP連携
- build / test / package gate
- security / privacy

Command Palette表示名は`category: title`の完成形を記載します。公開5件以外のcommandは、operator向け一覧ではなく「workflow / internal integration」として説明します。

## buildと検証

```bash
for extension in workflow-register bob-bazaar-review bob-code-consistency-review; do
  (
    cd "extensions/$extension"
    npm ci
    npm run compile
    npm run dependency:policy
    npm run architecture:policy
    npm run source:policy
    npm test
    npm run package
    npm run package:policy
  )
done
```

repository contract:

```bash
node --test \
  scripts/three-extension-command-surface.test.js \
  scripts/three-extension-documentation-contract.test.js \
  scripts/extension-host-smoke-contract.test.js
```

Linux / WindowsのExtension Host gateは、3拡張のactivation、5公開command、代表hidden command、4 primary panel、unhandled rejection不在を同一SHAで確認します。

## 関連文書

- `docs/superpowers/specs/2026-07-17-three-extension-quality-contract-and-ui-consolidation-design.md`
- `docs/superpowers/plans/2026-07-17-three-extension-ui-and-documentation-contracts.md`
- `docs/workflow-action-contracts-ja.md`
- `extensions/workflow-register/README.md`
- `extensions/bob-bazaar-review/README.md`
- `extensions/bob-code-consistency-review/README.md`
