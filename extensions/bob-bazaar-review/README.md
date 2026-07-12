# Bob Bazaar Review（Bob Bazaar レビュー支援）

`bob-bazaar-review` は、Bazaar リポジトリの差分レビューを IBM Bob から扱いやすくするための VS Code 拡張機能です。

`IBM.bob-code` 本体は変更しません。ワークスペースの `.bob/mcp.json` に読み取り専用 Bazaar MCP サーバーを登録し、レビュー対象の収集、プロジェクト規約の読み込み、review-result JSON の検証・保存、Human Triage、実績集計を支援します。

この README では、コマンド名、設定キー、JSON / YAML のフィールド名、ファイル名、識別子は実装上の名称として原文のまま記載します。

## Bazaar alias 対策

この拡張機能が実行する Bazaar CLI は、必ず `bzr --no-aliases <command>` 形式にします。

ユーザー環境の Bazaar alias に `diff` や `log` で GUI ツールを起動する設定があると、拡張機能へ stdout として差分やログが返らず、レビュー packet の生成や MCP tool の応答が壊れるためです。

AI チャット、Skill、Workflow、手動調査で Bazaar CLI を直接使う場合も同じです。

- 禁止: `bzr diff ...`、`bzr log ...`、`bzr status`
- 許可: `bzr --no-aliases diff ...`、`bzr --no-aliases log ...`、`bzr --no-aliases status`

## できること

- Bazaar の revision / revision range / working tree 差分を取得する。
- Bob に渡すレビュー用 Markdown packet を作る。
- `.bob/review/checklist.json` と `.bob/review/review-result.schema.json` を使ったプロジェクト規約レビューを支援する。
- `workflow-register` のワークフローステップから呼び出せる action provider を提供する。
- Bob が出力した review-result JSON を検証し、JSON、Markdown、artifact metadata として保存する。
- Review Runとしてpacket、result、Human Triage、record、summary、所要時間を一貫して追跡する。
- 中断したReview Runを一覧から再開する。
- Iteration 1導入前のreview artifactを確認付きでReview Runへ復旧する。
- 読み取り専用の Bazaar MCP ツールと、プロジェクト規約支援ツールを提供する。

## 任意連携

`bob-bazaar-review` は VS Code の必須 `extensionDependencies` を持ちません。`IBM.bob-code` や `workflow-register` が未導入でも拡張機能はロードでき、GUI またはレビューコマンドで `# Bazaar Revision Review Request` の Markdown packet を生成できます。

`IBM.bob-code` が導入されている場合は、生成した Markdown packet を Bob chat / context へ追加できます。`IBM.bob-code` が見つからない場合は、Markdown document を作成して安全に停止します。

`workflow-register` は任意です。導入されている場合は同梱ワークフロー `bazaar-project-rule-review` から action provider として呼び出せます。導入されていない場合でも、`IBM.bob-code` があれば生成した Markdown packetをBob chat / contextへ追加できます。

導入順は次を推奨します。

1. `bob-bazaar-review`
2. `IBM.bob-code`（Bob chat / contextへ追加する場合のみ）
3. `workflow-register`（ワークフロー連携を使う場合のみ）

## 代表的な利用フロー

1. BazaarワークスペースをBob IDE / VS Codeで開く。
2. `Bob Bazaar Review: GUI を開く`を実行する。
3. `.bob`が未初期化の場合は`.bobを初期化`を押す。
4. campaign、review target、review IDを確認する。
5. `対象情報を取得`でrevision情報と変更ファイルを確認する。
6. `Review Runを開始してBobに追加`で`review-run.json`と`review-packet.md`を保存する。
7. Bobでレビューを実行し、Result Captureでreview-result JSONを検証・保存する。
8. 自動で開くHuman Triageでfindingごとのdecision、owner、action、reasonを入力する。
9. 自動計測されたBob review / Human Triage時間を確認し、必要なら補正する。
10. `Review Runを完了して集計`で`record.yaml`とcampaign summaryを生成する。

途中でVS Codeを閉じた場合はReview GUIの未完了Review Run一覧から再開できます。packet、result、triage、recordの作成済みartifactをやり直す必要はありません。

## Command Palette のコマンド

| コマンド | 内部 command ID | 用途 |
| --- | --- | --- |
| `Bob Bazaar Review: GUI を開く` | `bobBazaar.openReviewGui` | Review Run Wizard v3を開く。 |
| `Bob Bazaar Review: Result Capture GUI を開く` | `bobBazaar.openResultCaptureGui` | Bob出力を検証・保存する。 |
| `Bob Bazaar Review: Human Triage GUI を開く` | `bobBazaar.openHumanTriageGui` | findingの人間判断、metrics補正、finalizeを行う。 |
| `Bob Bazaar Review: レビューコンテキストを収集` | `bobBazaar.collectReviewContext` | ワークフローステップから現在のレビュー対象とpacket概要を取得する。 |
| `Bob Bazaar Review: プロジェクト規約を読み込む` | `bobBazaar.loadReviewRules` | checklistとreview-result schemaを読み込む。 |
| `Bob Bazaar Review: レビュー結果を取り込む` | `bobBazaar.captureReviewResult` | active editor、selection、clipboardからreview-result JSONを検証・保存する。 |
| `Bob Bazaar Review: クリップボードからレビュー結果を保存` | `bobBazaar.saveReviewResultFromClipboard` | clipboardだけを入力としてreview-result JSONを保存する。 |
| `Bob Bazaar Review: Bob MCP を設定` | `bobBazaar.configureMcp` | `.bob/mcp.json`にBazaar MCP serverを登録する。 |
| `Bob Bazaar Review: プロジェクト規約を初期化` | `bobBazaar.initProjectRules` | `.bob/review`の規約ファイルを未作成時に生成する。 |
| `Bob Bazaar Review: 1リビジョンを Bob でレビュー` | `bobBazaar.reviewRevision` | `bzr log -r REV`と`bzr diff -c REV`からpacketを作る。 |
| `Bob Bazaar Review: リビジョン範囲を Bob でレビュー` | `bobBazaar.reviewRange` | `bzr diff -r BASE..TARGET`からpacketを作る。 |
| `Bob Bazaar Review: 1リビジョンをプロジェクト規約付きでレビュー` | `bobBazaar.reviewRevisionWithProjectRules` | 単一revision packetへproject rulesを追加する。 |
| `Bob Bazaar Review: リビジョン範囲をプロジェクト規約付きでレビュー` | `bobBazaar.reviewRangeWithProjectRules` | range packetへproject rulesを追加する。 |
| `Bob Bazaar Review: レビュー結果 JSON を検証` | `bobBazaar.validateReviewResultJson` | active editor / selectionのJSONを検証する。 |
| `Bob Bazaar Review: 実績 campaign を初期化` | `bobBazaar.records.initCampaign` | `.bob-review-records`のcampaign雛形を作る。 |
| `Bob Bazaar Review: 実績 record を作成` | `bobBazaar.records.createRecord` | standalone modeで既存artifactを`record.yaml`へ紐付ける。 |
| `Bob Bazaar Review: 実績 record を検証` | `bobBazaar.records.validateRecord` | recordのfield、path、参照artifactを検証する。 |
| `Bob Bazaar Review: 人間 triage 雛形を生成` | `bobBazaar.records.createTriage` | review-resultから`triage.yaml`を生成する。 |
| `Bob Bazaar Review: 人間 triage を検証` | `bobBazaar.records.validateTriage` | decision、finding_id、summary、必須入力を検証する。 |
| `Bob Bazaar Review: 実績 campaign summary を生成` | `bobBazaar.records.generateSummary` | 複数record / triageからsummaryを生成する。 |

既存commandは引数なしのstandalone modeを維持します。Review Runから呼び出す場合だけ、検証済みの`workspaceRoot`、`campaignId`、`reviewId`を引き渡します。

## Review Run Wizard v3

Review GUI、Result Capture、Human Triageを、永続化された同じReview Runとして接続します。巨大な単一Webviewへ統合せず、各画面の既存責務を維持したまま`src/reviewRuns/`のcoordinatorで連携します。

### 保存場所

```text
.bob-review-records/
  campaigns/
    <campaign_id>/
      campaign.yaml
      targets.yaml
      records/
        <review_id>/
          review-run.json
          review-packet.md
          triage.yaml
          record.yaml
          notes.md
      summary.json
      summary.md

.bob/
  review/
    results/
      <review_id>.json
      <review_id>.md
      <review_id>.artifact-metadata.json
```

`review-run.json`は進行中状態のsource of truthです。既存のreview-result、triage、record、summary形式と保存先は変更しません。

### Phase status

Review Runは次の6工程を管理します。

```text
target -> packet -> result -> triage -> record -> summary
```

各工程は`not_started`、`in_progress`、`completed`、`blocked`、`failed`、`skipped`のいずれかです。Review GUIはphase status、次の操作、metrics、issues、artifact pathを表示します。

### 中断・再開

Review GUIはworkspace内の未完了`review-run.json`を走査し、`updatedAt`の新しい順で表示します。

| 状態 | 再開先 |
| --- | --- |
| packet未完了 | Review GUI |
| packet完了、result未完了 | Result Capture |
| result完了、triage未完了 | Human Triage |
| triage完了、record / summary未完了 | Human Triageのfinalize |
| completed | 操作なし |

`_template`、malformed JSON、symlink / junction経由のrunは通常一覧へ含めません。

### Human Triage契約

AIのfindingは自動採否しません。Human Triageで次を満たす必要があります。

| decision | 必須入力 |
| --- | --- |
| `accepted` | `owner`または`action` |
| `rejected` | `reason` |
| `needs_investigation` | `owner`と`action` |
| `deferred` | `reason` |

Webviewでも不足を表示しますが、extension hostの`validateTriage()`を最終的な判定とします。

### Metrics

次を追跡します。

- `baselineReviewMinutes`: 同等レビューの従来想定時間。任意入力。
- `bobReviewSeconds`: packet保存からvalid result保存まで。
- `humanTriageSeconds`: valid result保存からvalid triage保存まで。
- `timingSource`: `auto_wall_clock`または`user_corrected`。
- `correctedByUser`: 手動補正の有無。

補正値は0以上、30日以下の有限値だけを受け付けます。recordへは小数第1位の分へ変換します。完了済みtriageを再保存しても時間を二重加算しません。

### 一括finalizeと再試行

`Review Runを完了して集計`は次を行います。

1. persisted Review Runとvalid triageを再読込・検証する。
2. metricsを既存ReviewRecord形式へ変換する。
3. `record.yaml`を生成・検証する。
4. campaign `summary.json` / `summary.md`を再生成する。
5. Review Runを`completed`へ進める。

record作成後にsummary生成が失敗しても、`record.yaml`は保持します。次回はpersisted stateを読み直し、recordを作り直さずsummaryから再試行します。古いWebview contextから再操作した場合も、完了済みtriageの再保存はidempotentに最新状態へ追従します。

### Legacy recovery

`review-run.json`が存在しない既存reviewについて、review-result、packet、triage、recordから復旧previewを作成できます。

- result file名とJSON内`review_id`の不一致は拒否する。
- campaign候補が複数なら利用者が明示選択する。
- 推測したtarget、artifact、warningをmodalで確認する。
- 承認後に新規作成するのは`review-run.json`だけとする。
- 既存packet、result、triage、recordをrename・上書き・補正しない。

## レビュー GUI

`Bob Bazaar Review: GUI を開く`を実行すると、Bazaar workspace、Bob workspace、`.bob`初期化状態、Review Run一覧、target入力欄が表示されます。

GUIは次の`.bob`ファイルを確認します。

```text
.bob/mcp.json
.bob/custom_modes.yaml
.bob/review/checklist.json
.bob/review/review-result.schema.json
.bob/review/review-prompt-template.md
.bob/review/examples/review-result.example.json
.bob/skills/project-review-checklist/SKILL.md
.bob/workflows/bazaar-project-rule-review/WORKFLOW.md
```

不足している場合、`.bobを初期化`で不足しているSkill、Workflow、Mode、review template、MCP設定を作成します。

### レビュー対象モード

| モード | 入力 | Bazaar操作 |
| --- | --- | --- |
| `singleRevision` | Revision | `bzr log -r REV`、`bzr diff -c REV` |
| `revisionRange` | Base revision、Target revision | `bzr diff -r BASE..TARGET` |
| `workingTreeSinceRevision` | 任意のBase revision | `bzr diff -r BASE`、`bzr status`。未入力なら`bzr revno`を利用。 |

単一revisionとrevision rangeでは、新規追加ファイルの内容も`bobBazaar.maxAddedFileContentBytes`の上限内でpacketへ含めます。

## `workflow-register`との連携

この拡張は、`workflow-register`から呼び出されるaction providerを提供します。代表例は同梱ワークフロー`bazaar-project-rule-review`です。

`src/workflow/workflowRegisterBridge.ts`がworkflow API、action input、capture optionを変換します。workflow-registerがない場合も通常commandとBob context追加は利用できます。

### コンテキスト収集

```workflow-step
command: bobBazaar.collectReviewContext
sendResult: true
resultKey: reviewContext
required: true
completeOnSuccess: false
```

`collectReviewContext`はreview packetからrepository root、mode、target、変更ファイル、byte count、packet概要を返します。

### 規約読み込み

```workflow-step
command: bobBazaar.loadReviewRules
sendResult: true
resultKey: reviewRules
required: true
completeOnSuccess: false
```

checklistまたはschemaが欠落している場合、required stepはpendingのままになり、Bobへcommand failureを返します。

### レビュー結果取り込み

workflow stateの`reviewRules`から期待checklist件数、rule ID、schemaをcapture optionへ変換します。Review Runから開いたResult Captureでは、さらにexpected review IDを保存前に検証します。

## レビュー結果の保存

入力はraw JSONとfenced JSON blockの両方に対応します。検証成功時は次を保存します。

```text
.bob/review/results/<review_id>.json
.bob/review/results/<review_id>.md
.bob/review/results/<review_id>.artifact-metadata.json
```

Markdownは件数、checklist、evidence、findingsを表示します。metadata sidecarはproducer、workflow run、VCS revision、input hash、人間確認要否を記録します。invalid JSONとactive Review Runとは異なる`review_id`は正式artifactとして保存しません。

## Phase 1レビュー実績record

`record.yaml`はtarget、review packet、review-result JSON / Markdown、triage、metricsを追跡する索引です。`triage.yaml`はBobの指摘に対する人間判断です。campaign summaryはtriageを採否のsource of truthとして集計し、triageがないrecordを`triage_missing` warningとして表示します。

standalone commandから作る場合は、少なくとも`workspaceRoot`、`campaignId`、`reviewId`を渡します。`bobBazaar.records.createRecord`へ`reviewPacketText`を渡すとpacket artifactを保存し、既存packetがある場合はbackupを作ります。

## MCPツール

同梱MCP serverはBazaar操作を読み取り専用で公開します。

| ツール | Bazaar操作 |
| --- | --- |
| `bazaar_root` | `bzr root` |
| `bazaar_revno` | `bzr revno` |
| `bazaar_log` | `bzr log` / `bzr log -r REV` |
| `bazaar_diff_revision` | `bzr diff -c REV` |
| `bazaar_diff_range` | `bzr diff -r BASE..TARGET` |
| `bazaar_diff_working_tree` | `bzr diff` / `bzr diff -r BASE` |
| `bazaar_cat_revision` | `bzr cat -r REV PATH` |
| `bazaar_status` | `bzr status` |

`commit`、`push`、`pull`、`update`、`revert`、`merge`、`resolve`などの破壊的操作は公開しません。

プロジェクト規約支援ツール:

| ツール | 用途 |
| --- | --- |
| `project_rules_init` | `.bob/review`規約ファイルを作成する。既定では非公開。 |
| `project_rules_get_checklist` | checklist JSONを返す。 |
| `project_rules_get_schema` | review-result schemaを返す。 |
| `project_rules_validate_review_result` | review-resultを検証する。 |
| `project_rules_render_markdown` | review-resultをMarkdownへ変換する。 |

`project_rules_init`は`BOB_BAZAAR_ENABLE_WRITE_TOOLS=1`を明示したserverでのみ公開します。Bazaar / result取得toolは`BOB_BAZAAR_ALLOWED_ROOTS`内だけを受け付けます。手動起動でallowed rootsを省略する場合は`BOB_BAZAAR_ALLOW_UNRESTRICTED_CWD=1`が必要です。

## プロジェクト規約ファイル

```text
.bob/
  review/
    checklist.json
    review-result.schema.json
```

`checklist.json`はプロジェクト固有レビュー規約のsource of truthです。Bobには正式成果物であるJSONを先に返し、その後に人間向けMarkdown checklistを出力するよう指示します。

### checklist status

| Status | Markdown mark | 意味 |
| --- | --- | --- |
| `pass` | `[x]` | evidenceがあり、問題が見つからない。 |
| `fail` | `[ ]` | 規約違反または高リスクが見つかった。 |
| `unknown` | `[?]` | evidenceが不足している。 |
| `not_applicable` | `[-]` | 規約が明確に対象外。 |
| `blocked` | `[!]` | 必須tool、file、revision、ruleを取得できない。 |

## 現在の実装分割

| ファイル / ディレクトリ | 責務 |
| --- | --- |
| `src/extension.ts` | command登録、workflow provider登録、GUI起動、MCP設定。 |
| `src/bazaar/` | Bazaar client、target収集、packet生成、direct review command。 |
| `src/projectRules/` | checklist / schema / review-result検証とMarkdown変換。 |
| `src/reviewRuns/` | Review Run型、state、store、metrics、resume、finalize、recovery、coordinator。 |
| `src/ui/` | Review GUI、Result Capture、Human TriageのWebviewとhost controller。 |
| `src/workflow/` | workflow-register providerとworkflow context変換。 |
| `src/workspace/` | workspace root解決、`.bob`初期化、path helper。 |
| `src/records/` | review record、triage、campaign summary、standalone record command。 |
| `src/mcp/` | readonly Bazaar MCP serverとproject rules MCP tool。 |

公開contractは`docs/workflow-action-contracts-ja.md`、artifact metadata contractは`docs/artifact-metadata-contract-ja.md`に固定しています。Command IDとworkflow action provider IDは変更しません。

## 設定

| 設定 | 既定値 | 説明 |
| --- | --- | --- |
| `bobBazaar.bzrPath` | `bzr` | Bazaar実行ファイルのパス。 |
| `bobBazaar.textEncoding` | `auto` | `auto` / `utf8` / `shift_jis` / `cp932` / `windows-31j`。 |
| `bobBazaar.mcpServerName` | `bazaar` | `.bob/mcp.json`のserver名。 |
| `bobBazaar.maxDiffBytes` | `1048576` | packetへ含めるdiffの最大byte数。 |
| `bobBazaar.maxAddedFileContentBytes` | `262144` | 新規追加ファイル本文の最大合計byte数。`0`で省略。 |
| `bobBazaar.projectRules.checklistPath` | `.bob/review/checklist.json` | checklist JSONのパス。 |
| `bobBazaar.projectRules.schemaPath` | `.bob/review/review-result.schema.json` | review-result schemaのパス。 |

## Bob MCP設定

Bazaarワークスペースを開いて`Bob Bazaar Review: Bob MCP を設定`を実行します。`.bob/mcp.json`変更後はBob MCP serverを再読み込みするか、Bob IDE / VS Codeを再起動してください。

## ビルドと検証

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
npm run package:metrics
```

生成したVSIXをインストールします。

```powershell
code --install-extension bob-bazaar-review-0.3.0.vsix
```

## セキュリティ設計

- Bazaarはshell文字列ではなく`execFile` / argument arrayで実行する。
- Bazaar CLIへ必ず`--no-aliases`を付ける。
- revision、ID、repository-relative path、artifact pathを実行・保存前に検証する。
- workspace containmentをrealpathで確認し、symlink / junction経由のescapeを拒否する。
- Review Run更新は`updatedAt`を比較し、古い画面からの上書きを拒否する。
- WebviewはCSP nonceとhost側action allowlistを使い、任意command IDを受け取らない。
- MCP serverのBazaar操作は読み取り専用とする。
- diffと追加ファイル本文へbyte上限を設ける。
- `pass` / `fail`のchecklist resultにはevidenceを要求する。
- `fail` ruleには同じ`rule_id`のfindingを要求する。
- Human Triageを省略した自動採否を行わない。

## 保守・配布ポリシー

### 生成物

review-result、review packet、triage、record、Review Runにはレビュー対象や指摘根拠が含まれます。共有前に内容を確認してください。Bobの生チャット全文は`review-run.json`へ保存しません。

### VSIXサイズ

`npm run package:policy`はVSIXサイズの上限を`350000` bytesとして確認します。`out/**/*.map`と開発用`docs/**`はVSIXへ同梱しません。

### 暗黙依存

`IBM.bob-code`と`workflow-register`は任意連携です。どちらも必須`extensionDependencies`ではありません。

### Trusted Workspace

`bobBazaar.bzrPath`のworkspace overrideはTrusted Workspaceのときだけ利用します。MCP toolはallowed root内だけを受け付け、`.bob/mcp.json`と`.bob/review`は選択されたBob workspace配下へ書き込みます。

## 関連ドキュメント

- `docs/README-ja.md`
- `docs/review-run-v3-iteration1-ja.md`
- `docs/review-run-v3-iteration2-ja.md`
- `docs/unit-test-spec-ja.md`
- `docs/real-machine-test-spec-ja.md`
- `docs/workflow-authoring-guide-ja.md`
- `extensions/workflow-register/README.md`
- `extensions/README.md`
