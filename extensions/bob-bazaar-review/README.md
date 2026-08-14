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

## 内部互換契約と実装配置

公開入口の背後では、次のmodule pathと内部Command IDをworkflow／host actionとの互換契約として維持します。

| 領域 | 実装 |
|---|---|
| workflow-register bridge | `src/workflow/workflowRegisterBridge.ts`、`src/workflow/` |
| Bazaar command | `src/bazaar/bazaarReviewCommands.ts` |
| review-result validation | `src/projectRules/reviewResultValidationCommand.ts` |
| GUI | `src/ui/` |
| workspace | `src/workspace/` |

record操作の内部Command IDは`bobBazaar.records.initCampaign`、`bobBazaar.records.createRecord`、`bobBazaar.records.createTriage`、`bobBazaar.records.generateSummary`です。これらは`review-packet.md`、`summary.json`などの成果物を扱います。review-resultのsidecar metadataは`.bob/review/results/<review_id>.artifact-metadata.json`へ保存します。

規約作成の運用手順は`docs/project-rule-authoring.md`、Windows実機受入は`docs/project-rule-authoring-windows-uat.md`を参照してください。

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

## 現行実装パス

| Path | 責務 |
|---|---|
| `src/workflow/workflowRegisterBridge.ts` | `workflow-register`のsoft dependency、action input、workflow stateを拡張内の型へ変換する |
| `src/bazaar/bazaarReviewCommands.ts` | revision / rangeを収集し、Bazaar review packetの表示、保存、Bob context連携を調整する |
| `src/projectRules/reviewResultValidationCommand.ts` | active editorのreview-result JSONを検証し、有効な結果のMarkdown summaryを表示する |
| `src/ui/` | 主GUIと各stageのWebview lifecycle、message境界を実装する |
| `src/workflow/` | workflow action providerの登録、input変換、service呼出しを実装する |
| `src/workspace/` | Bob / Bazaar root解決と`.bob` assetの初期化・更新を実装する |

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
  <review_id>.json
  <review_id>.md
  <review_id>.artifact-metadata.json
```

`review-run.json`は進行stageとresume identityの正本です。review-result、decision、record、metrics本体の正本を置き換えません。

同一campaignでrecord directoryが存在する場合は、`-02`、`-03`のようなsuffixをatomic directory予約で割り当てます。既存recordを暗黙上書きしません。

review record操作は内部互換Command IDとして次を維持します。

| Command ID | 生成・更新する内容 |
|---|---|
| `bobBazaar.records.initCampaign` | `.bob-review-records`のcampaign templateをmissing-onlyで初期化する |
| `bobBazaar.records.createRecord` | `review-packet.md`を含むreview artifactを関連付け、`record.yaml`を生成・検証する |
| `bobBazaar.records.createTriage` | 保存済みreview-resultから`triage.yaml`の人間判断雛形を生成・検証する |
| `bobBazaar.records.generateSummary` | campaignのrecordを集計し、`summary.json`と`summary.md`を生成する |

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
.bob/review/results/<review_id>.json
.bob/review/results/<review_id>.md
.bob/review/results/<review_id>.artifact-metadata.json
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
4. 承認後、既存fileを一意なバックアップ（backup）へcopyする。
5. バックアップ成功後にtargetを置換する。
6. post-write validationを行う。

確認より前にバックアップやreplacementを開始しません。バックアップ失敗、stale expectation、unsafe pathではno-changeとします。

## 資料からプロジェクト規約を作成

`Bob Bazaar Review: 資料からプロジェクト規約を作成`は、資料選択、決定論的抽出、AI送信前consent、proposal検証、人間decision、安全反映を提供します。

- `.docx`、`.xlsx`、text抽出可能な`.pdf`を個別選択します。
- `.doc` / `.xls`はconversionが必要です。
- image-only PDFはOCR済みfileを用意します。
- directoryの暗黙再帰走査、macro実行、formula再計算、external link refreshを行いません。
- AIへ渡すのはoperatorが承認したbounded evidenceだけです。
- AI proposalは正式assetを直接変更しません。
- applyはbase hash、decision revision、preview digest、journal、バックアップ、transaction、rollback、final hashを検証します。

### 検証済みOOXML snapshot境界

DOCX/XLSXはparserへ渡す前に、選択時のfingerprintに結び付いたsnapshot Bufferへ固定し、そのBuffer上でarchive構造と全entryのpayloadを検証します。検証が完了するまでMammothとExcel parserをloadしません。

通常のDOCX/XLSXには検証に使った元のsnapshot Bufferそのものを渡します。`xl/styles.xml`と`xl/sharedStrings.xml`の両方が欠けるXLSXだけ、検証済み内容へ最小stylesheetを加えたBufferをメモリ内で作ります。この準備処理は原本とworkspaceへ書き込まず、公開Command、設定、保存形式、利用者向けエラーを変えません。

このmissing-both互換処理に限って拡張側の`fflate`を遅延ロードします。通常XLSXで`read-excel-file`が内部利用する`fflate`とは区別します。

詳細は`docs/project-rule-authoring.md`、Windows release UATは`docs/project-rule-authoring-windows-uat.md`を参照します。

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
npm run unused:report
npm run artifact:policy
npm run audit:prod
npm test
npm run package
npm run package:policy
npm run package:smoke
npm run package:metrics
```

Ubuntu / Windowsの同一source headでExtension Host smokeまで実行します。実IBM Bob / Bazaar UATではkeyboard-only、200% zoom、High Contrast、Developer Tools Console、MCP、result handoffを確認します。

## 保守・配布契約

### 生成物

workspace初期化とレビュー実行の主な生成物は`.bob/mcp.json`、`.bob/review`配下のchecklist / schema / `review-result`、`.bob-review-records`配下のpacket / triage / record / summaryです。source本文、差分、AI output、人間decisionを含み得るため、共有前に内容を確認します。

### VSIX サイズと依存関係

`npm run package:policy`はVSIX サイズの上限を`12000000` bytesとして検査し、production dependencyがVSIXへ収録されていることも確認します。runtime dependencyはproposal検証用の`ajv`、DOCX抽出用の`cheerio`と`mammoth`、review record YAML用の`js-yaml`、XLSX抽出用の`read-excel-file`と互換処理用の`fflate`です。

### 暗黙依存

`IBM.bob-code`と`workflow-register`はoptional integrationであり、manifestのhard dependencyではありません。前者はreview packetのBob context連携、後者は同梱workflowとaction providerを使う場合に必要です。両方が未導入でも主GUIとdirect review serviceは利用できます。

### 必要 CLIとrelease gate

実行時はBazaar CLIを`bzr --no-aliases`で使用します。PDF抽出には設定済みの`pdftotext`が必要です。開発・配布検証にはNode.jsとnpmが必要で、clean installから次を実行します。

```powershell
npm ci
npm run compile
npm run dependency:policy
npm run architecture:policy
npm run source:policy
npm run unused:policy
npm run unused:report
npm run artifact:policy
npm run audit:prod
npm test
npm run package
npm run package:policy
npm run package:smoke
npm run package:metrics
```

### Trusted Workspace

規約資料、Bazaar差分、workspace内の`.bob` assetを確認し、Trusted Workspaceとして信頼できる場合に処理します。未信頼workspaceではworkspace設定の`bobBazaar.bzrPath`を採用せず、global設定または既定の`bzr`を使用します。MCP toolとartifact writeは選択されたworkspace / allowed root内に限定します。

## セキュリティ

- Bazaarは`execFile`とargument arrayで実行します。
- revision、ID、relative path、artifact pathを検証します。
- realpath containmentを確認し、symlink / junction escapeを拒否します。
- Review Run更新はrevision / identityを再検証し、stale writerを拒否します。
- WebviewはCSP nonce、render token、host-side action allowlistを使います。
- MCPはread-onlyを既定にします。
- AI outputと人間decisionを分離します。
- source本文、raw AI output、バックアップ、run-local stateをremote共有しません。
