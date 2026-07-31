# Bazaar Review UAT Plan

- 対象: `workflow-register`, `bob-bazaar-review`, `bob-code-consistency-review`
- 対象フェーズ: Phase 0 基盤安定化・運用設計、Phase 1 Bazaar レビュー実績作成
- 実施単位: 1 workspace、1 Bazaar repository、1 Bob 実行セッション
- 判定語: `ok`, `ng`, `n/a`

## 1. 目的

Bazaar review workflowを実運用へ渡す前に、主GUI、workflow、MCP、レビュー結果取り込み、指摘確認・振り分け、成果物保存の一連の流れが再現できることを確認する。

UATでは機能の網羅よりも、運用者が迷わず再実行できること、失敗時に原因を切り分けられること、生成物が許可領域にだけ保存されることを重視する。

## 2. 前提条件

| 項目 | 必須条件 | 記録 |
|---|---|---|
| VS Code / Bob IDE | 拡張機能をインストールできる。 | version: |
| IBM Bob | `IBM.bob-code` が有効。未導入時はBob連携項目を`n/a`にする。 | version: |
| workflow-register | workflow連携項目を実施する場合は`local.workflow-register`が有効。 | version: |
| Bazaar | `bzr --no-aliases status` が対象repoで成功する。 | version: |
| Workspace | `.bob` を作成できる信頼済みworkspace。 | path: |
| 拡張 VSIX | Phase 0のrelease checklistを通過したVSIX。 | file: |

## 3. 事前セットアップ

1. 対象workspaceをVS Code / Bob IDEで開く。
2. `bob-bazaar-review`、`workflow-register`、必要に応じて`bob-code-consistency-review`をインストールする。
3. Command Paletteから `Bob Bazaar Review: レビューを開始`（`bobBazaar.openReviewGui`）を実行する。
4. `.bob`が未初期化なら主GUIの初期化操作を実行する。
5. `.bob/mcp.json`にBazaar MCPが登録され、`BOB_BAZAAR_ALLOWED_ROOTS`が対象rootへ限定されていることを確認する。
6. `.gitignore`または同等のignoreに次を含める。

```gitignore
.bob/review/results/
.bob/workflows/runs/
.bob-review-records/
.bob-review/
.bob-trace/ai-traceability-draft/
```

## 4. UATシナリオ

| ID | シナリオ | 手順 | 期待結果 | 判定 |
|---|---|---|---|---|
| UAT-BZR-01 | 主GUI初期化 | 主GUIを開き、不足ファイルを初期化する。 | `.bob/mcp.json`, `.bob/review/checklist.json`, `.bob/review/review-result.schema.json`, workflowが作成される。 | |
| UAT-BZR-02 | 単一revision packet | `1リビジョン`でrevisionを指定し、対象情報取得とレビュー開始を行う。 | packetにrevision、変更ファイル、`bzr --no-aliases`由来のdiff/logが含まれる。 | |
| UAT-BZR-03 | revision range packet | `リビジョン範囲`でbase/targetを指定する。 | range diffが取得され、対象revisionがpacketに記録される。 | |
| UAT-BZR-04 | 未コミット差分packet | working tree差分を対象にする。 | working tree diffとstatusがpacketに含まれる。 | |
| UAT-BZR-05 | workflow実行 | Bob workflow `bazaar-project-rule-review`を実行する。 | context収集、規約読込、AI review、結果保存のstepが順番に進む。 | |
| UAT-BZR-06 | レビュー結果取り込み | 主GUI内の`レビュー結果取り込み`stageでBobのreview-result JSON fenced blockを取り込む。 | schema validation後、`.bob/review/results/`にJSON / Markdownが保存される。 | |
| UAT-BZR-07 | 不正JSON | 必須fieldを欠いたreview-result JSONを取り込む。 | 保存されず、validation errorが表示される。 | |
| UAT-BZR-08 | MCP cwd境界 | workspace外pathをMCP操作対象に指定する。 | allowed root validationで拒否される。 | |
| UAT-BZR-09 | alias影響確認 | Bazaar aliasがある環境でpacketを生成する。 | 拡張機能のBazaar呼び出しは`--no-aliases`で成功する。 | |
| UAT-BZR-10 | 再実行性 | 同じ条件でもう一度packet生成と取り込みを行う。 | 新しいartifactが作成され、既存結果の上書きや混線がない。 | |
| UAT-BZR-11 | Phase 1 campaign初期化 | workflow/internal command経由でcampaignを初期化する。 | `.bob-review-records/campaigns/phase1-bazaar-review-uat-001`が作成される。 | |
| UAT-BZR-12 | packet artifact | review packetを`review-packet.md`としてcampaign record配下へ保存する。 | Bobに渡したpacketを後から確認できる。 | |
| UAT-BZR-13 | review record | 保存済みreview-resultから`record.yaml`を作成・検証する。 | review-result JSON / Markdown、packet、triage pathを追跡できる。 | |
| UAT-BZR-14 | 指摘確認・振り分け | 主GUI内の`指摘確認・振り分け`stageで`triage.yaml`を生成し、人間が採否を記入して検証する。 | `accepted` / `rejected` / `needs_investigation` / `deferred`を集計できる。 | |
| UAT-BZR-15 | レビュー実績 | 主GUI内の`レビュー実績`stageで複数recordの集計とexportを行う。 | 件数、採否、所要時間、warningを確認でき、JSON / Markdown / CSVをexportできる。 | |
| UAT-BZR-16 | 単一panel | レビュー、レビュー結果取り込み、指摘確認・振り分け、レビュー実績を順に切り替える。 | 同じ`bobBazaarReviewGui` panelとactive Review Run identityを使う。 | |

## 5. Code Consistency連携スモーク

| ID | シナリオ | 手順 | 期待結果 | 判定 |
|---|---|---|---|---|
| UAT-CCR-01 | 主GUI起動 | `Bob Code Consistency Review: 整合プレレビューを開始`を実行する。 | `整合プレレビュー` panelが開く。 | |
| UAT-CCR-02 | preprocess | 主GUIまたはworkflow actionからpreprocessを実行する。 | review packageが`.bob-review/review-package`に生成される。 | |
| UAT-CCR-03 | レビュー結果取り込み | 主GUIの`レビュー結果取り込み`stageでBob outputを保存する。 | raw / canonical / primary YAMLが`.bob-review/bob-output`に保存される。 | |
| UAT-CCR-04 | 指摘確認・振り分け | 主GUIの`指摘確認・振り分け`stageでdecisionを保存する。 | triage filesが`.bob-review/human-triage`に保存される。 | |
| UAT-CCR-05 | path guard | 出力先にabsolute path、`..`、誤った`.bob-review`サブ領域を指定する。 | すべて拒否される。 | |

## 6. 視覚・操作確認

- 200% zoomでもstage、field label、status、buttonを識別できる。
- Windows High ContrastまたはVS Code High Contrast themeで境界を識別できる。
- Tab / Shift+Tabで主要操作へ移動でき、focus indicatorが見える。
- panelを閉じた後にdangling callback errorやunhandled rejectionが発生しない。
- screenshotとlogに秘密情報、顧客data、absolute user pathを含めない。

## 7. 記録テンプレート

| 実施日 | 実施者 | workspace | Bazaar revision/range | Bob session | VSIX set |
|---|---|---|---|---|---|
| | | | | | |

| ID | 判定 | 証跡 path / screenshot | 事象 | follow-up |
|---|---|---|---|---|
| UAT-BZR-01 | | | | |
| UAT-BZR-02 | | | | |
| UAT-BZR-03 | | | | |
| UAT-BZR-04 | | | | |
| UAT-BZR-05 | | | | |
| UAT-BZR-06 | | | | |
| UAT-BZR-07 | | | | |
| UAT-BZR-08 | | | | |
| UAT-BZR-09 | | | | |
| UAT-BZR-10 | | | | |
| UAT-BZR-11 | | | | |
| UAT-BZR-12 | | | | |
| UAT-BZR-13 | | | | |
| UAT-BZR-14 | | | | |
| UAT-BZR-15 | | | | |
| UAT-BZR-16 | | | | |
| UAT-CCR-01 | | | | |
| UAT-CCR-02 | | | | |
| UAT-CCR-03 | | | | |
| UAT-CCR-04 | | | | |
| UAT-CCR-05 | | | | |

## 8. 完了条件

- `ng`が0件である。
- `n/a`は理由が記録されている。
- 生成物が許可領域外へ保存されていない。
- Bob output、review-result、triage、traceabilityのうち、実施対象にした成果物pathが記録されている。
- 主GUI内stageが同一panel / identityで動作する。
- Phase 1実績作成を対象にした場合は、レビュー実績または`summary.md`に`records_total`、triage decision、warningが記録されている。
- Developer Tools Consoleのuncaught exception、unhandled rejection、CSP violationが0件である。
- follow-upがある場合はownerと対応方針が決まっている。
