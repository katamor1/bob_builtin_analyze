# Bob Bazaar レビュー

`bob-bazaar-review`は、Bazaarリポジトリの差分レビューをIBM Bobから扱いやすくするVS Code拡張機能です。

`IBM.bob-code`本体は変更しません。`.bob/mcp.json`へ読み取り専用Bazaar MCP serverを登録し、レビュー対象の収集、プロジェクト規約、review-resultの検証・保存、指摘確認・振り分け、レビュー実行、実績集計を支援します。

コマンドID、設定キー、JSON / YAML field、ファイル名は実装上の名称をそのまま記載します。

## Bazaar alias対策

拡張機能が実行するBazaar CLIは必ず次の形式です。

```text
bzr --no-aliases <command>
```

ユーザー環境のaliasがGUIを起動するとstdoutを取得できず、review packetやMCP応答が壊れるためです。Skill、Workflow、手動調査でも同じ形式を使います。

## できること

- revision / revision range / working treeの差分を取得する。
- Bobへ渡すMarkdown review packetを作る。
- `.bob/review/checklist.json`と`.bob/review/review-result.schema.json`を使う。
- workspace外の`.docx`、`.xlsx`、text PDFからAI規約候補を作り、人による判定後にproject-owned review assetへ選択適用する。
- `workflow-register`のaction providerを提供する。
- Bobのreview-result JSONを検証し、JSON / Markdown / metadataとして保存する。
- packet、result、指摘確認・振り分け、record、summary、所要時間をレビュー実行として追跡する。
- 中断したレビュー実行を一覧から再開する。
- Iteration 1以前のartifactを確認付きでレビュー実行へ復旧する。
- campaign単位のレビュー実行、指摘確認・振り分け、rule、target mode、時間指標をレビュー実績で確認・exportする。
- 読み取り専用Bazaar MCP toolsとproject rules toolsを提供する。

## 任意連携

必須`extensionDependencies`はありません。

- `IBM.bob-code`があればpacketをBob chat / contextへ追加する。
- `IBM.bob-code`がなければMarkdown document作成で安全に停止する。
- `workflow-register`があれば同梱workflow `bazaar-project-rule-review`から実行できる。
- `workflow-register`がなくてもGUIとCommand Paletteは利用できる。
- 資料からの規約作成では、抽出とpreviewは拡張機能が担い、AI stepはIBM Bobと`workflow-register`の設定済みmodel routeを使う。

推奨導入順:

1. `bob-bazaar-review`
2. `IBM.bob-code`（Bob context連携時）
3. `workflow-register`（workflow連携時）

## 規約資料からプロジェクト規約を作成

Command Paletteの`bobBazaar.authorProjectRulesFromDocuments`は、外部資料の個別選択、決定論的抽出、source scope、AI送信前の明示同意までをGUIで行います。AI consent後はBob UIから`bazaar-project-rule-authoring` workflowを開始します。Palette commandからBob taskを直接自動起動するAPIは使用しません。

対応形式は`.docx`、`.xlsx`、text抽出可能な`.pdf`です。`.doc` / `.xls`は変換が必要、image-only PDFはOCRが必要としてAI対象から除外します。PDF抽出は設定`bobBazaar.ruleAuthoring.pdfToTextPath`で指定するPoppler `pdftotext`を使用します。

候補はAI出力から正式assetへ直接書きません。規約単位の人による判定、apply preview、journal / backup付きtransaction、rollback、最終hash / provenance検証を必須にします。詳細は次を参照してください。

- `docs/project-rule-authoring.md`
- `docs/project-rule-authoring-windows-uat.md`

## 標準レビュー実行フロー

1. Bazaar workspaceをBob IDE / VS Codeで開く。
2. `Bob Bazaar Review: レビューを開始`を実行する。
3. 必要なら`.bobを初期化`する。
4. campaign、target、review IDを確認する。
5. `対象情報を取得`でrevision情報と変更ファイルを確認する。
6. `レビュー実行を開始してBobに追加`で`review-run.json`と`review-packet.md`を保存する。
7. Bobでレビューし、主GUI内の`レビュー結果取り込み`でreview-resultを検証・保存する。
8. `指摘確認・振り分け`でdecision、owner、action、reasonを入力する。
9. Bob review / 指摘確認・振り分け時間を確認し、必要なら補正する。
10. `レビュー実行を完了して集計`で`record.yaml`と集計レポートを生成する。

VS Codeを閉じた後は、Review GUIの未完了レビュー実行一覧から続きの画面へ再開できます。

## Command Palette

| 表示名 | command ID | 用途 |
| --- | --- | --- |
| Bob Bazaar Review: レビューを開始 | `bobBazaar.openReviewGui` | レビュー手順を開く。 |
| レビューコンテキストを収集 | `bobBazaar.collectReviewContext` | packetからworkflow contextを作る。 |
| プロジェクト規約を読み込む | `bobBazaar.loadReviewRules` | checklistとschemaを読み込む。 |
| レビュー結果を取り込む | `bobBazaar.captureReviewResult` | editor / selection / clipboardから保存する。 |
| クリップボードから保存 | `bobBazaar.saveReviewResultFromClipboard` | clipboardだけを入力にする。 |
| Bob MCPを設定 | `bobBazaar.configureMcp` | `.bob/mcp.json`を更新する。 |
| プロジェクト規約を初期化 | `bobBazaar.initProjectRules` | `.bob/review`を作る。 |
| 規約資料からプロジェクト規約を作成 | `bobBazaar.authorProjectRulesFromDocuments` | source選択、抽出preview、AI consent、人による判定への導線を開く。 |
| 1リビジョンをレビュー | `bobBazaar.reviewRevision` | `log -r`と`diff -c`からpacketを作る。 |
| リビジョン範囲をレビュー | `bobBazaar.reviewRange` | `diff -r BASE..TARGET`からpacketを作る。 |
| 規約付き1リビジョン | `bobBazaar.reviewRevisionWithProjectRules` | packetへproject rulesを追加する。 |
| 規約付きリビジョン範囲 | `bobBazaar.reviewRangeWithProjectRules` | range packetへrulesを追加する。 |
| レビュー結果JSONを検証 | `bobBazaar.validateReviewResultJson` | active JSONを検証する。 |
| 実績キャンペーンを初期化 | `bobBazaar.records.initCampaign` | `.bob-review-records`の雛形を作る。 |
| 実績記録を作成 | `bobBazaar.records.createRecord` | standaloneでartifactをrecordへ結ぶ。 |
| 実績記録を検証 | `bobBazaar.records.validateRecord` | field、path、artifactを検証する。 |
| 指摘確認・振り分け一覧を作成 | `bobBazaar.records.createTriage` | resultからtriageを作る。 |
| 指摘確認・振り分け内容を検証 | `bobBazaar.records.validateTriage` | decisionと必須入力を検証する。 |
| 集計レポートを生成 | `bobBazaar.records.generateSummary` | 複数recordを集計する。 |

レビューGUIのcapture、triage、実績表示は独立commandを持たず、`bobBazaar.openReviewGui`で開く単一panel内のstageとして切り替えます。非GUI workflow commandとrecord commandは引き続き利用できます。

## レビュー手順

主GUI内のレビュー、レビュー結果取り込み、指摘確認・振り分け、レビュー実績を、永続化された同じrun contextで接続します。

### 生成物

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

`review-run.json`は進行状態のsource of truthです。既存のreview-result、triage、record、summary形式は変更しません。

### Phase statusと再開

```text
target -> packet -> result -> triage -> record -> summary
```

各phaseは`not_started`、`in_progress`、`completed`、`blocked`、`failed`、`skipped`のいずれかです。

| 状態 | 再開先 |
| --- | --- |
| packet未完了 | Review GUI |
| packet完了、result未完了 | レビュー結果取り込み |
| result完了、triage未完了 | 指摘確認・振り分け |
| triage完了、record / summary未完了 | finalize |
| completed | 操作なし |

一覧は`updatedAt`降順です。malformed JSON、template、symlink / junction経由のrunは通常一覧へ含めません。

### 指摘確認・振り分け契約

| decision | 必須入力 |
| --- | --- |
| `accepted` | `owner`または`action` |
| `rejected` | `reason` |
| `needs_investigation` | `owner`と`action` |
| `deferred` | `reason` |

Webviewの表示だけでなく、extension hostの`validateTriage()`で検証します。AI findingを自動採否しません。

### Metrics

- `baselineReviewMinutes`: 従来手順の想定時間。任意入力。
- `bobReviewSeconds`: packet保存からvalid result保存まで。
- `humanTriageSeconds`: valid result保存からvalid triage保存まで。
- `timingSource`: `auto_wall_clock`または`user_corrected`。
- `correctedByUser`: 手動補正の有無。

補正値は0以上、43200分以下の有限値だけを受け付けます。recordへは小数第1位の分として保存します。完了済みtriageを再保存しても時間を二重加算しません。

### Finalizeと再試行

`レビュー実行を完了して集計`はpersisted stateとtriageを再読込し、次を行います。

1. triageをreview-resultと照合する。
2. metricsをReviewRecord形式へ変換する。
3. `record.yaml`を生成・検証する。
4. campaign `summary.json` / `summary.md`を生成する。
5. runを`completed`へ進める。

summaryが失敗しても作成済みrecordを保持します。次回はpersisted stateへ追従し、recordを再作成せずsummaryから再試行します。

### Legacy recovery

`review-run.json`のないreviewは、result、packet、triage、recordからpreviewを作れます。

- result file名とJSON内`review_id`の不一致を拒否する。
- campaign候補が複数なら明示選択を要求する。
- target、artifact、warningをmodalで確認する。
- 承認後に追加するのは`review-run.json`だけとする。
- 既存artifactをrename、上書き、補正しない。

## レビュー実績

主GUI内の`レビュー実績`stageは、レビュー実行、record、validな指摘確認・振り分け、review-resultをcampaign単位で集計します。

表示内容:

- レビュー実行一覧と次の操作。
- 指摘確認・振り分け pending一覧。
- schema validation成功率。
- findingのaccepted / rejected / needs investigation / deferredと各rate。
- rule別の検出数・採用率・棄却率。
- target mode別の傾向。Dashboard v1ではこれを`change_type`とする。
- baseline / Bob review / 指摘確認・振り分け / estimated savedの時間。
- malformed、missing、identity mismatch、symlink除外などのdata quality warning。

rateの分母が0の場合は`0%`ではなく`n/a`です。decisionはvalidな`triage.yaml`だけから集計し、pending triageを自動採否しません。

export先:

```text
.bob-review-records/campaigns/<campaign_id>/dashboard.json
.bob-review-records/campaigns/<campaign_id>/dashboard.md
.bob-review-records/campaigns/<campaign_id>/dashboard.csv
```

3形式は同じmodelから生成します。既存の`summary.json` / `summary.md`、packet、result、triage、recordは変更しません。

## Review GUIのtarget mode

| mode | 入力 | Bazaar操作 |
| --- | --- | --- |
| `singleRevision` | Revision | `bzr --no-aliases log -r REV`, `diff -c REV` |
| `revisionRange` | Base / Target | `bzr --no-aliases diff -r BASE..TARGET` |
| `workingTreeSinceRevision` | 任意Base | `bzr --no-aliases diff -r BASE`, `status` |

追加ファイル本文とdiffには設定値によるbyte上限があります。

## workflow-register連携

`src/workflow/workflowRegisterBridge.ts`がworkflow API、action input、capture optionを変換します。

```workflow-step
command: bobBazaar.collectReviewContext
sendResult: true
resultKey: reviewContext
required: true
completeOnSuccess: false
```

```workflow-step
command: bobBazaar.loadReviewRules
sendResult: true
resultKey: reviewRules
required: true
completeOnSuccess: false
```

レビュー実行から進んだレビュー結果取り込みでは、workflowのchecklist / schema契約に加え、expected review IDをartifact保存前に検証します。

## review-resultの保存

raw JSONとfenced JSON blockに対応します。valid resultは次へ保存します。

```text
.bob/review/results/<review_id>.json
.bob/review/results/<review_id>.md
.bob/review/results/<review_id>.artifact-metadata.json
```

invalid JSONとactive レビュー実行とは異なる`review_id`は正式artifactとして保存しません。

## Phase 1 review record

`record.yaml`はtarget、packet、result、triage、metricsを追跡します。`triage.yaml`は人間判断のsource of truthです。summaryは採否、時間、estimated minutes saved、missing triageを集計します。

standalone commandでは`workspaceRoot`、`campaignId`、`reviewId`を指定できます。packet更新時はbackupを残します。

## MCP tools

Bazaar toolsは読み取り専用です。

- `bazaar_root`
- `bazaar_revno`
- `bazaar_log`
- `bazaar_diff_revision`
- `bazaar_diff_range`
- `bazaar_diff_working_tree`
- `bazaar_cat_revision`
- `bazaar_status`

`commit`、`push`、`pull`、`update`、`revert`、`merge`、`resolve`は公開しません。

Project rules tools:

- `project_rules_init`: 既定では非公開。`BOB_BAZAAR_ENABLE_WRITE_TOOLS=1`時だけ公開。
- `project_rules_get_checklist`
- `project_rules_get_schema`
- `project_rules_get_context`
- `project_rules_get_provenance`
- `project_rules_validate_review_result`
- `project_rules_render_markdown`

Bazaar / result toolは`BOB_BAZAAR_ALLOWED_ROOTS`内だけを受け付けます。手動起動で制限を外す場合は`BOB_BAZAAR_ALLOW_UNRESTRICTED_CWD=1`を明示します。

## 実装分割

| directory | 責務 |
| --- | --- |
| `src/bazaar/bazaarReviewCommands.ts` | Direct revision / range review commandとBob context連携 |
| `src/bazaar/` | Bazaar client、target、packet、direct command |
| `src/projectRules/reviewResultValidationCommand.ts` | Active editorのreview-result検証とMarkdown report |
| `src/workflow/workflowRegisterBridge.ts` | workflow-register API、action input、capture option変換 |
| `src/projectRules/` | checklist、schema、result検証 |
| `src/ruleAuthoring/` | 文書抽出、source/evidence/proposal契約、run store、apply transaction、approved bundle |
| `src/reviewRuns/` | state、store、metrics、resume、finalize、recovery、coordinator |
| `src/dashboard/` | campaign evidence集計、rate / trend、JSON / Markdown / CSV export |
| `src/ui/` | 単一Review GUI内のレビュー結果取り込み、指摘確認・振り分け、レビュー実績、規約作成wizard / proposal triage |
| `src/workflow/` | workflow-register bridge、review / rule authoring action adapter |
| `src/workspace/` | workspace rootと`.bob`初期化 |
| `src/records/` | record、triage、summary |
| `src/mcp/` | readonly MCP server |

Command IDとworkflow provider IDは変更しません。

## 設定

| 設定 | 既定値 |
| --- | --- |
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

## ビルドと検証

### 必要 CLI

利用時はBazaar CLIが必要です。開発と検証にはNode.jsとnpmが必要です。

```powershell
cd extensions\bob-bazaar-review
npm ci
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

```powershell
code --install-extension bob-bazaar-review-0.3.0.vsix
```

## セキュリティ設計

- Bazaarは`execFile` / argument arrayで実行する。
- revision、ID、relative path、artifact pathを検証する。
- workspace containmentをrealpathで確認し、symlink / junction escapeを拒否する。
- レビュー実行更新は`updatedAt`を比較し、古い画面の上書きを拒否する。
- WebviewはCSP nonceとhost側action allowlistを使う。
- MCPはreadonlyを既定にする。
- 人による判定 gateを維持する。
- 規約原本を`.bob`へコピーせず、AI送信前にsource名、chunk数、UTF-8 byte数の明示同意を要求する。
- `.bob/review/rule-authoring/**`の抽出本文、raw AI出力、backup、run-local stateは既定でGit対象外にする。
- checklist、context、addendum、source manifest、provenanceだけをproject-owned approved assetとしてreviewする。

## 保守・配布ポリシー

### 生成物の共有

review-result、packet、triage、record、レビュー実行にはレビュー対象や指摘根拠が含まれます。共有前に内容を確認してください。Bobの生チャット全文は`review-run.json`へ保存しません。

### VSIX サイズ

`npm run package:policy`はVSIXの上限を`12000000` bytesとして検証し、`npm run package:smoke`はpackage生成後のruntime entryを検証します。`out/**/*.map`と開発用`docs/**`はVSIXへ同梱しません。

実行時依存は`ajv`、`cheerio`、`js-yaml`、`mammoth`、`read-excel-file`です。VSIXには各packageの実行用JavaScript / JSONとtransitive dependencyを含め、tests、docs、source maps、型宣言は含めません。

### 暗黙依存

`IBM.bob-code`と`workflow-register`は任意連携であり、必須`extensionDependencies`ではありません。

### Trusted Workspace

`bobBazaar.bzrPath`のworkspace overrideはTrusted Workspaceでのみ利用します。MCP toolとartifact writeは選択されたworkspace / allowed root内に限定します。

## 関連ドキュメント

- `docs/README-ja.md`
- `docs/review-run-v3-iteration1-ja.md`
- `docs/review-run-v3-iteration2-ja.md`
- `docs/review-run-v3-iteration3-dashboard-ja.md`
- `docs/review-run-v3-acceptance-ja.md`
- `docs/review-run-v3-integration-result-ja.md`
- `docs/unit-test-spec-ja.md`
- `docs/real-machine-test-spec-ja.md`
- `docs/workflow-authoring-guide-ja.md`
- `docs/project-rule-authoring.md`
- `docs/project-rule-authoring-windows-uat.md`

<!-- REMEDIATION-2026-07-11 -->
## Integration and process safety

- Companion extensions are optional unless the command explicitly needs them; provider registration retries after delayed activation.
- Workflow providers are owner-scoped, reject duplicate IDs, and are disposed with the extension lifecycle.
- Git and Bazaar subprocesses have bounded output, hard timeouts, cancellation, and process-tree termination.
- Release validation runs on both Ubuntu and Windows, while IBM Bob UI/MCP checks remain a release-candidate real-machine gate.
