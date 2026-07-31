# Bob Bazaar Review

`bob-bazaar-review`は、Bazaar repositoryの変更をIBM Bob / VS Codeでレビューするための拡張機能です。Bazaar差分、review packet、project rules、review-result検証、指摘確認・振り分け、レビュー実績、MCP連携を提供します。

Bazaarの書込み操作は実行しません。CLIは必ず`bzr --no-aliases`形式で呼びます。

## 公開入口

Command Paletteに常時表示する入口は次の2件だけです。

| 完成表示名 | Command ID | 用途 |
|---|---|---|
| `Bob Bazaar Review: レビューを開始` | `bobBazaar.openReviewGui` | view type `bobBazaarReviewGui`、title `Bazaar レビュー`の主GUIを開く |
| `Bob Bazaar Review: 資料からプロジェクト規約を作成` | `bobBazaar.authorProjectRulesFromDocuments` | 資料選択、抽出preview、AI consent、規約候補作成を開始する |

レビュー主GUIは1つのpanel内で次を扱います。

1. review targetとReview Run準備
2. review packet生成
3. `レビュー結果取り込み`
4. `指摘確認・振り分け`
5. `レビュー実績`

後段stage用の独立公開panelはありません。workflow、record、validation用の内部Command IDは登録・activationを維持しますが、通常のCommand Paletteでは`when: "false"`です。

## mainとsoft dependency

`package.json`の`main`は`./out/extension.js`です。必須`extensionDependencies`はありません。

- `IBM.bob-code`があればpacketをBob contextへ追加します。
- `IBM.bob-code`がなければreview packetを保存し、利用できないBob actionへ理由を表示します。
- `local.workflow-register`があれば同梱workflowとaction providerを利用できます。
- `local.workflow-register`がなくても主GUIとdirect review serviceを利用できます。
- 規約作成でAI stepを使う場合だけ、設定済みBob model routeを利用します。

optional extensionがない場合もactivationを失敗させません。

## 標準レビュー実行フロー

1. `Bob Bazaar Review: レビューを開始`を実行する。
2. Bazaar rootとBob workspace rootを確認する。
3. 必要なら`.bob` assetを初期化する。
4. campaign、target mode、revision / range、review IDを入力する。
5. 対象情報を取得し、log、diff、changed filesを確認する。
6. Review Runを開始し、`review-run.json`と`review-packet.md`を保存する。
7. Bobでレビューする。
8. 同じpanelの`レビュー結果取り込み`でreview-resultを検証・保存する。
9. `指摘確認・振り分け`でdecision、owner、action、reasonを保存する。
10. finalizeして`record.yaml`とsummaryを生成する。
11. `レビュー実績`でcampaign集計を確認・exportする。

VS Code再起動後は未完了Review Runを主GUIから再開できます。workspace root、campaign ID、review IDをstage間で引き継ぎ、再入力や別runへの誤関連付けを避けます。

## Bazaar alias対策

すべてのBazaar CLI呼出しはargument arrayで実行します。

```text
bzr --no-aliases root
bzr --no-aliases log -r REV
bzr --no-aliases diff -c REV
bzr --no-aliases diff -r BASE..TARGET
bzr --no-aliases status
```

revisionとrepository-relative pathを検証し、shell文字列連結を行いません。timeout、AbortSignal、stdout / stderr上限を適用します。diff系のnon-zero exitは明示allowlistにある場合だけ成功として扱います。

## workspaceモデル

| Root | Marker | 用途 |
|---|---|---|
| Bob workspace root | `.bob` | workflow、rules、result、MCP設定、record |
| Bazaar repository root | `.bzr` | diff、log、status、cat |

multi-rootではphysical path identityを確認し、別rootのreview session、artifact、recordを混在させません。

## Review Runと成果物

```text
.bob-review-records/
  campaigns/<campaignId>/
    records/<reviewId>/
      review-run.json
      review-packet.md
      triage.yaml
      record.yaml
      metrics.json
      notes.md
    summary.json
    summary.md
    dashboard.json
    dashboard.md
    dashboard.csv

.bob/review/results/
  <reviewId>.json
  <reviewId>.md
  <reviewId>.artifact-metadata.json
```

`review-run.json`は進行stageとresume identityの正本です。review-result、decision、record、metrics本体の正本を置き換えません。

同一campaignでrecord directoryが存在する場合は、`-02`、`-03`のようなsuffixをatomic directory予約で割り当てます。既存recordを暗黙上書きしません。

## レビュー結果取り込み

raw JSON、fenced JSON、text中のbalanced JSON objectを候補として抽出します。

保存前に次を検証します。

- active Review Run identity
- review ID
- schema versionとrequired field
- project rule ID
- severity、summary、evidence
- output bytes
- workspace path

validated resultだけを次へ保存します。

```text
.bob/review/results/<reviewId>.json
.bob/review/results/<reviewId>.md
.bob/review/results/<reviewId>.artifact-metadata.json
```

stage開始時のworkspace rootを固定し、active editorやworkspace selectionの変化を同じrequestへ混在させません。

## 指摘確認・振り分け

`triage.yaml`は人間判断の正本です。

| decision | 必須入力 |
|---|---|
| `accepted` | `owner`または`action` |
| `rejected` | `reason` |
| `needs_investigation` | `owner`と`action` |
| `deferred` | `reason` |

Webview表示だけでなくextension hostのvalidatorで再検証します。Bob findingを自動採否しません。stale revision、unknown finding ID、summary mismatchを保存前に拒否します。

## レビュー実績

`レビュー実績`stageはReview Run、record、valid decision、review-resultをcampaign単位で集計します。

- Review Run一覧と次の操作
- pending decision
- schema validation成功率
- accepted / rejected / needs investigation / deferred件数とrate
- rule別・target mode別傾向
- baseline / Bob review / human decision / estimated saved時間
- malformed、missing、identity mismatch、symlink除外のwarning

rateの分母が0の場合は`0%`ではなく`n/a`です。JSON / Markdown / CSVは同じmodelから生成し、packet、result、decision、record、summaryを変更しません。

## `.bob` asset更新

`.bob`初期化はmissing assetを追加し、versioned templateが既存fileと異なる場合だけ更新候補にします。

更新順序:

1. current fileとbundled templateの`diff preview`を作る。
2. operatorへ`明示確認`を求める。
3. cancel時no-changeを保証する。
4. 承認後、既存fileを一意なbackupへcopyする。
5. backup成功後にtargetを置換する。
6. post-write validationを行う。

確認より前にbackupやreplacementを開始しません。backup failure、stale expectation、unsafe pathではno-changeとします。

## 資料からプロジェクト規約を作成

`Bob Bazaar Review: 資料からプロジェクト規約を作成`は、資料選択、決定論的抽出、AI送信前consent、proposal検証、人間decision、安全反映を提供します。

- `.docx`、`.xlsx`、text抽出可能な`.pdf`を個別選択します。
- `.doc` / `.xls`はconversionが必要です。
- image-only PDFはOCR済みfileを用意します。
- directoryの暗黙再帰走査、macro実行、formula再計算、external link refreshを行いません。
- AIへ渡すのはoperatorが承認したbounded evidenceだけです。
- AI proposalは正式assetを直接変更しません。
- applyはbase hash、decision revision、preview digest、journal、backup、transaction、rollback、final hashを検証します。

詳細は`docs/project-rule-authoring.md`を参照します。

## MCP境界

Bazaar MCP operationsとproject rule read operationsはread-onlyが既定です。

- `BOB_BAZAAR_ALLOWED_ROOTS`内のcwdだけを許可します。
- allowed roots未設定は既定拒否です。
- `project_rules_init`は`BOB_BAZAAR_ENABLE_WRITE_TOOLS=1`の明示設定時だけ登録します。
- `.bob/mcp.json`はallowed rootsを設定できますが、write toolを暗黙opt-inしません。
- commit、push、pull、update、revert、merge、resolveを公開しません。

## workflow連携

同梱workflowと`workflow-register` action providerは、context収集、rule読込、result capture、規約作成serviceを呼び出します。

provider / Command IDは技術的な互換契約として維持します。通常operatorは主GUIまたは`Bob 操作ハブ`から操作し、内部IDをCommand Paletteの入口として使いません。

## 設定

| 設定 | 既定値 |
|---|---:|
| `bobBazaar.bzrPath` | `bzr` |
| `bobBazaar.textEncoding` | `auto` |
| `bobBazaar.mcpServerName` | `bazaar` |
| `bobBazaar.maxDiffBytes` | `1048576` |
| `bobBazaar.maxAddedFileContentBytes` | `262144` |
| `bobBazaar.projectRules.checklistPath` | `.bob/review/checklist.json` |
| `bobBazaar.projectRules.schemaPath` | `.bob/review/review-result.schema.json` |
| `bobBazaar.ruleAuthoring.pdfToTextPath` | `pdftotext` |
| `bobBazaar.ruleAuthoring.maxSourceFiles` | `20` |
| `bobBazaar.ruleAuthoring.maxSelectedEvidenceBytes` | `1048576` |
| `bobBazaar.commandTimeoutMs` | `120000` |

## ビルドと検証

```bash
npm ci
npm run compile
npm run dependency:policy
npm run architecture:policy
npm run source:policy
npm run unused:policy
npm run artifact:policy
npm test
npm run package
npm run package:policy
npm run package:smoke
```

Ubuntu / Windowsの同一source headでExtension Host smokeまで実行します。実IBM Bob / Bazaar UATではkeyboard-only、200% zoom、High Contrast、Developer Tools Console、MCP、result handoffを確認します。

## セキュリティ

- Bazaarは`execFile`とargument arrayで実行します。
- revision、ID、relative path、artifact pathを検証します。
- realpath containmentを確認し、symlink / junction escapeを拒否します。
- Review Run更新はrevision / identityを再検証し、stale writerを拒否します。
- WebviewはCSP nonce、render token、host-side action allowlistを使います。
- MCPはread-onlyを既定にします。
- AI outputと人間decisionを分離します。
- source本文、raw AI output、backup、run-local stateをremote共有しません。
