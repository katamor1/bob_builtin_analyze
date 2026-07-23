# Bob Bazaar Review

`bob-bazaar-review`は、Bazaar repositoryの変更をIBM Bob / VS Codeでレビューするための拡張機能です。Bazaar差分の取得、review packet、project rules、review-result検証・保存、Review Run、指摘確認・振り分け、レビュー実績、MCP連携を提供します。

Bazaarの書込み操作は実行しません。CLIは必ず`bzr --no-aliases`形式で呼びます。

## 公開入口

Command Paletteに常時表示する入口は次の2件だけです。

| 表示名 | Command ID | 用途 |
| --- | --- | --- |
| `Bob Bazaar Review: レビューを開始` | `bobBazaar.openReviewGui` | view type `bobBazaarReviewGui`、title `Bazaar レビュー`の主GUIを開く |
| `Bob Bazaar Review: 資料からプロジェクト規約を作成` | `bobBazaar.authorProjectRulesFromDocuments` | 文書選択、抽出preview、AI consent、規約候補作成を開始する |

レビュー主GUIは1つのpanel内で次のstageを扱います。

1. review targetとReview Run準備
2. `レビュー結果取り込み`
3. `指摘確認・振り分け`
4. `レビュー実績`

後段stage用の独立した公開panelはありません。workflow / record用commandは登録・activationを維持しますが、`menus.commandPalette`では`when: "false"`です。

## mainとsoft dependency

`package.json`の`main`は`./out/extension.js`です。必須`extensionDependencies`はありません。

- `IBM.bob-code`があればpacketをBob contextへ追加します。
- `IBM.bob-code`がなければMarkdown documentを作成して安全に停止します。
- `local.workflow-register`があれば同梱workflowとaction providerを利用できます。
- `local.workflow-register`がなくても主GUIとdirect review serviceを利用できます。
- 資料からの規約作成でAI stepを実行する場合だけ、IBM Bobとworkflow-registerの設定済みmodel routeを使います。

optional extensionがない場合もactivationを失敗させません。利用できない統合操作は理由を表示して無効化します。

## Bazaar alias対策

すべてのBazaar CLI呼出しはargument arrayで実行します。

```text
bzr --no-aliases root
bzr --no-aliases log -r REV
bzr --no-aliases diff -c REV
bzr --no-aliases diff -r BASE..TARGET
bzr --no-aliases status
```

revisionとrepository-relative pathを検証し、shell文字列連結を行いません。diff系でBazaarが返す差分ありexit codeは、許可された場合だけ成功として扱います。

## 標準レビュー実行フロー

1. `Bob Bazaar Review: レビューを開始`を実行する。
2. Bazaar workspaceとBob workspaceを確認する。
3. 必要なら`.bob` assetを初期化する。
4. campaign、target mode、revision / range、review IDを入力する。
5. 対象情報を取得し、log、diff、changed filesを確認する。
6. Review Runを開始し、`review-run.json`と`review-packet.md`を保存する。
7. Bobでレビューする。
8. 同じpanelの`レビュー結果取り込み`でreview-resultを検証・保存する。
9. `指摘確認・振り分け`でdecision、owner、action、reasonを保存する。
10. finalizeして`record.yaml`とsummaryを生成する。
11. `レビュー実績`でcampaign集計を確認・exportする。

VS Code再起動後は、未完了Review Runを主GUIから再開できます。active Review RunのworkspaceRoot、campaignId、reviewIdをstage間で引き継ぎ、再入力や別runへの誤関連付けを避けます。

## Review Runと成果物

```text
.bob-review-records/
  campaigns/
    <campaign_id>/
      records/
        <review_id>/
          review-run.json
          review-packet.md
          triage.yaml
          record.yaml
          notes.md
      summary.json
      summary.md
      dashboard.json
      dashboard.md
      dashboard.csv

.bob/
  review/
    results/
      <review_id>.json
      <review_id>.md
      <review_id>.artifact-metadata.json
```

`review-run.json`が進行状態のsource of truthです。phaseは次の順で進みます。

```text
target -> packet -> result -> triage -> record -> summary
```

Review Run bound modeでは、保存直前にpersisted identityを再読込します。review-result内の`review_id`がactive runと一致しない場合、JSON / Markdown / metadataを保存しません。

同一campaignでrecord directoryが存在する場合は、`-02`、`-03`のようなsuffixをatomic directory予約で割り当てます。legacy recordと同時開始を暗黙上書きしません。

## レビュー結果取り込み

raw JSON、fenced JSON、text中のbalanced JSON objectを候補として抽出します。schemaとproject rule条件を満たしたresultだけを保存します。

```text
.bob/review/results/<review_id>.json
.bob/review/results/<review_id>.md
.bob/review/results/<review_id>.artifact-metadata.json
```

保存先workspaceはstage初期化時に固定し、後からactive editorやworkspace selectionが変わっても同じrequest内で混在させません。

## 指摘確認・振り分け

`triage.yaml`は人間判断の正本です。

| decision | 必須入力 |
| --- | --- |
| `accepted` | `owner`または`action` |
| `rejected` | `reason` |
| `needs_investigation` | `owner`と`action` |
| `deferred` | `reason` |

Webview表示だけでなくextension hostのvalidatorで再検証します。AI findingを自動採否しません。

## レビュー実績

主GUI内の`レビュー実績`stageは、Review Run、record、validなtriage、review-resultをcampaign単位で集計します。

- Review Run一覧と次の操作
- pending triage
- schema validation成功率
- accepted / rejected / needs investigation / deferred件数とrate
- rule別・target mode別傾向
- baseline / Bob review / human decision / estimated saved時間
- malformed、missing、identity mismatch、symlink除外などのdata quality warning

rateの分母が0の場合は`0%`ではなく`n/a`です。export先は次です。

```text
.bob-review-records/campaigns/<campaign_id>/dashboard.json
.bob-review-records/campaigns/<campaign_id>/dashboard.md
.bob-review-records/campaigns/<campaign_id>/dashboard.csv
```

3形式は同じmodelから生成し、packet、result、triage、record、summaryを変更しません。

## `.bob` template更新

`.bob`初期化はmissing assetを追加し、versioned workflow templateが既存fileと異なる場合だけ更新候補にします。

更新順序:

1. current fileとbundled templateのdiff previewを作る。
2. 利用者へ明示確認を求める。
3. cancelの場合は変更しない。
4. 承認された場合、既存fileを一意なbackupへコピーする。
5. backup成功後にbundled bytesでtargetを更新する。

確認より前にbackupや置換を行いません。backupより前にtargetを上書きしません。

## 資料からプロジェクト規約を作成

公開command `bobBazaar.authorProjectRulesFromDocuments`は、`.docx`、`.xlsx`、text抽出可能な`.pdf`を個別選択し、決定論的抽出とAI送信前consentを行います。

- `.doc` / `.xls`はconversionが必要です。
- image-only PDFはOCR済みfileを別途用意します。
- directoryの暗黙再帰走査、macro実行、formula再計算、external link refresh、画像OCRは行いません。
- PDF抽出はPoppler `pdftotext -layout -enc UTF-8`をshellなしで実行します。
- AIへ渡すのは利用者が明示承認したbounded evidenceだけです。
- AI proposalは正式assetを直接変更しません。
- 人間decision、apply preview、journal、backup、transaction、rollback、最終hash / provenance検証を必須にします。

詳細:

- `docs/project-rule-authoring.md`
- `docs/project-rule-authoring-windows-uat.md`

## MCP境界

Bazaar MCP operationsは常にread-onlyです。

```text
bazaar_root
bazaar_revno
bazaar_log
bazaar_diff_revision
bazaar_diff_range
bazaar_diff_working_tree
bazaar_cat_revision
bazaar_status
```

`commit`、`push`、`pull`、`update`、`revert`、`merge`、`resolve`は公開しません。

Project rules tools:

- `project_rules_get_checklist`
- `project_rules_get_schema`
- `project_rules_get_context`
- `project_rules_get_provenance`
- `project_rules_validate_review_result`
- `project_rules_render_markdown`
- `project_rules_get_latest_review_result`
- `project_rules_get_review_result`

書込み可能なMCP toolは`project_rules_init`だけです。次の両方を満たす場合だけ利用できます。

1. `BOB_BAZAAR_ENABLE_WRITE_TOOLS=1`
2. `cwd`が`BOB_BAZAAR_ALLOWED_ROOTS`内

allowed roots未設定時は既定拒否です。`.bob/mcp.json`の更新はVS Code設定操作であり、MCP tool writeとは別の境界です。通常の設定処理は`BOB_BAZAAR_ALLOWED_ROOTS`を記録しますが、write toolを自動opt-inしません。

## workflow連携用command

次は同梱workflow、Operation Hub、テスト、API連携向けに登録されています。通常operatorは主GUIを利用します。

```text
bobBazaar.collectReviewContext
bobBazaar.loadReviewRules
bobBazaar.captureReviewResult
bobBazaar.saveReviewResultFromClipboard
bobBazaar.configureMcp
bobBazaar.initProjectRules
bobBazaar.reviewRevision
bobBazaar.reviewRange
bobBazaar.reviewRevisionWithProjectRules
bobBazaar.reviewRangeWithProjectRules
bobBazaar.validateReviewResultJson
bobBazaar.records.initCampaign
bobBazaar.records.createRecord
bobBazaar.records.validateRecord
bobBazaar.records.createTriage
bobBazaar.records.validateTriage
bobBazaar.records.generateSummary
```

Command ID、workflow provider ID、artifact schemaは技術的な互換契約として維持します。

## 設定

| 設定 | 既定値 |
| --- | ---: |
| `bobBazaar.bzrPath` | `bzr` |
| `bobBazaar.textEncoding` | `auto` |
| `bobBazaar.mcpServerName` | `bazaar` |
| `bobBazaar.maxDiffBytes` | `1048576` |
| `bobBazaar.maxAddedFileContentBytes` | `262144` |
| `bobBazaar.projectRules.checklistPath` | `.bob/review/checklist.json` |
| `bobBazaar.projectRules.schemaPath` | `.bob/review/review-result.schema.json` |
| `bobBazaar.ruleAuthoring.pdfToTextPath` | `pdftotext` |
| `bobBazaar.ruleAuthoring.maxSourceFiles` | `20` |
| `bobBazaar.ruleAuthoring.maxSourceBytes` | `26214400` |
| `bobBazaar.ruleAuthoring.maxAggregateSourceBytes` | `104857600` |
| `bobBazaar.ruleAuthoring.maxChunkBytes` | `32768` |
| `bobBazaar.ruleAuthoring.maxSelectedEvidenceBytes` | `1048576` |
| `bobBazaar.commandTimeoutMs` | `120000` |

## 実装分割

| directory | 責務 |
| --- | --- |
| `src/extension.ts` | command登録とcomposition root |
| `src/bazaar/` | Bazaar client、target、packet、direct service |
| `src/projectRules/` | checklist、schema、result検証・保存 |
| `src/ruleAuthoring/` | 文書抽出、evidence、proposal、transaction、approved bundle |
| `src/reviewRuns/` | Review Run state、metrics、resume、finalize、recovery |
| `src/dashboard/` | campaign集計とJSON / Markdown / CSV export |
| `src/ui/` | 主GUIstage、規約作成wizard、proposal decision UI |
| `src/workflow/` | workflow-register bridge / action adapter |
| `src/workspace/` | root解決、`.bob`初期化、template refresh |
| `src/records/` | record、triage、summary |
| `src/mcp/` | stdio MCP serverとtool registry |

## ビルドと検証

```bash
npm ci
npm run compile
npm run dependency:policy
npm run architecture:policy
npm run source:policy
npm run unused:policy
npm run unused:report
npm run artifact:policy
npm test
npm run package
npm run package:policy
npm run package:smoke
npm run package:metrics
```

開発文書とsource mapはVSIXへ含めません。package policyはsize、entry、禁止pathを検査します。

## セキュリティ

- Bazaarは`execFile`とargument arrayで実行する。
- revision、ID、relative path、artifact pathを検証する。
- realpath containmentを確認し、symlink / junction escapeを拒否する。
- Review Run更新はrevision / identityを再検証し、古い画面の上書きを拒否する。
- WebviewはCSP nonce、render token、host側action allowlistを使う。
- MCPはread-onlyを既定にする。
- AI outputと人間decisionを分離する。
- 規約原本を`.bob`へコピーせず、AI送信前にsource名、chunk数、UTF-8 bytesを提示する。
- `.bob/review/rule-authoring/**`のraw text、raw AI output、backup、run-local stateをGit対象外にする。
