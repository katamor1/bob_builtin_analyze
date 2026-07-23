# bob-bazaar-review 基本設計書

## 1. 目的

`bob-bazaar-review`は、Bazaar repositoryの変更レビュー、プロジェクト規約作成、レビュー実績管理をIBM Bob / VS Code上で安全に実施するための拡張機能である。

利用者向けの常時表示Command Palette entryは次の2件に限定する。

```text
Bob Bazaar Review: レビューを開始
Bob Bazaar Review: 資料からプロジェクト規約を作成
```

レビュー開始後はview type `bobBazaarReviewGui`の単一主GUIが、レビュー対象、レビュー資料、`レビュー結果取り込み`、`指摘確認・振り分け`、`レビュー実績`を同じsessionでrouteする。保存、検証、実績生成などの内部Command IDはworkflow、host action、互換API用に登録を維持するが、通常operatorの入口としてCommand Paletteへ列挙しない。

## 2. 背景と課題

- `bzr diff`や`bzr log`の出力収集が手作業になりやすい。
- Bazaar aliasにより標準出力を取得できない場合がある。
- UTF-8、Shift-JIS、CP932系出力が混在する。
- `.bob` workspaceと`.bzr` repositoryがmulti-rootで分かれる場合がある。
- Bobへ渡す差分、変更file、規約、追加資料をbounded packetへ固定したい。
- Bob出力をschemaとproject ruleで検証し、JSON / Markdown成果物へ保存したい。
- レビュー途中の状態を`review-run.json`で再開可能にしたい。
- Bobの指摘を人間が確認し、実績とmetricsへ接続したい。
- 既存の規約資料から候補を作り、diff preview、明示確認、backup、transactionを経て安全に反映したい。

## 3. スコープ

### 3.1 対象範囲

- Bazaar revision、revision range、working tree差分のread-only取得。
- `bzr --no-aliases`の強制。
- Bazaar出力のencoding判定とbounded decode。
- review packet生成とBob context追加。
- `bobBazaarReviewGui`によるレビュー全stageの統合。
- review-result JSONの抽出、正規化、schema検証、保存。
- `review-run.json`によるsession identity、stage、artifact path、revisionの保持。
- project checklist、schema、prompt、packet addendumの読み込み。
- review record、decision、metrics、campaign summaryの生成。
- 規約資料の決定論的抽出、AI送信範囲確認、proposal検証、人間decision、安全反映。
- `.bob` template、Skill、Workflow、MCP設定の初期化・refresh。
- `workflow-register` action provider登録。
- Bazaar / project rules /保存済み結果のMCP tools。
- `.bob` rootと`.bzr` rootの分離解決。

### 3.2 対象外

- Bazaarのcommit、push、pull、update、revert、merge、resolve。
- 任意shell command実行。
- Bobによる最終承認や自動採否。
- workspace外への無制限書込み。
- 複数利用者間の自動同期。
- AI出力をhost validationなしで保存・反映すること。

## 4. 利用者と利用シーン

| 利用者 | 主な用途 |
|---|---|
| 開発者 | revisionまたはworking treeを選び、レビュー資料を作成する。 |
| レビュー担当者 | `レビュー結果取り込み`後に`指摘確認・振り分け`を行う。 |
| PL / UAT担当 | `レビュー実績`でrecord、metrics、campaign summaryを確認する。 |
| 規約管理者 | 資料から規約候補を作成し、人間decision後に反映する。 |
| workflow設計者 | `workflow-register` providerから本拡張を呼び出す。 |
| 保守担当者 | template、MCP、backup、transaction、release evidenceを確認する。 |

## 5. 全体構成

```text
VS Code Extension Host
  └─ bob-bazaar-review
       ├─ extension.ts
       ├─ ui/
       │    ├─ reviewGui.ts                -> panel owner
       │    ├─ resultCaptureGui.ts         -> embedded stage service
       │    ├─ humanTriageGui.ts           -> embedded stage service
       │    ├─ campaignDashboardGui.ts     -> embedded stage service
       │    ├─ ruleAuthoringGui.ts
       │    └─ ruleProposalTriageGui.ts
       ├─ reviewRuns/
       ├─ bazaar/
       ├─ projectRules/
       ├─ ruleAuthoring/
       ├─ records/
       ├─ workflow/
       ├─ workspace/
       └─ mcp/

workflow-register
  └─ bobBazaar.* action providers
```

`src/extension.ts`がcomposition rootであり、manifestの`main`は`./out/extension.js`で固定する。`IBM.bob-code`と`local.workflow-register`はsoft dependencyである。

## 6. 公開UI

### 6.1 Bazaarレビュー主GUI

`bobBazaar.openReviewGui`は単一panelをopen / revealする。

- view type: `bobBazaarReviewGui`
- title: `Bazaar レビュー`
- session key: workspace root、campaign ID、review ID
- stage: target、packet、result、decision、record

主GUIは次を扱う。

1. review target選択。
2. Bazaar log / diff / status取得。
3. changed filesとpacket preview。
4. Bob context handoff。
5. `レビュー結果取り込み`。
6. `指摘確認・振り分け`。
7. `レビュー実績`とsummary生成。

各stageは同じ`review-run.json` identityを使用し、別panelへ対象情報を再入力させない。古いrender token、異なるworkspace、異なるreview IDからのmessageを拒否する。

### 6.2 規約作成フロー

`bobBazaar.authorProjectRulesFromDocuments`は、資料選択、抽出preview、AIへ送る内容の確認、proposal検証、人間decision、apply preview、transaction recoveryを提供する。

AIは候補を返すだけであり、採用、却下、編集、競合解消、反映は人間とextension hostが行う。

## 7. Bazaar実行方針

すべてのBazaar subprocessは`execFile`とargument arrayを使用し、global option `--no-aliases`を付与する。

```text
bzr --no-aliases diff -c REV
bzr --no-aliases log -r REV
bzr --no-aliases status
```

- revisionとrelative pathを検証する。
- shell文字列連結を使わない。
- hard timeout、AbortSignal、stdout / stderr byte上限を持つ。
- diffありのexpected exit codeだけを明示許可する。
- commit系subcommandを公開しない。

## 8. Workspaceモデル

| Root | Marker | 用途 |
|---|---|---|
| Bob workspace root | `.bob` | Workflow、Skill、rules、results、MCP設定 |
| Bazaar repository root | `.bzr` | diff、log、status、catの実行対象 |

multi-rootでは物理path identityを検証し、別rootのreview session、artifact、recordを混在させない。

## 9. review-runと成果物

主GUIのsession stateはreview record配下の`review-run.json`へ保存する。

```text
.bob-review-records/
  campaigns/<campaignId>/
    records/<reviewId>/
      review-run.json
      record.yaml
      triage.yaml
      metrics.json
      notes.md
```

`review-run.json`はphase、target、packet、result、decision、record path、timestamps、next actionを保持する。保存済みreview-resultの正本は引き続き次である。

```text
.bob/review/results/<reviewId>.json
.bob/review/results/<reviewId>.md
```

## 10. workflow-register連携

`registerWorkflowProvidersWithRetry`は`local.workflow-register`が利用可能な場合だけproviderを登録する。起動順序差を吸収するためbounded retryを行い、成功後は重複登録しない。未導入時もlocal UIとserviceを利用できる。

Review provider:

```text
bobBazaar.openReviewGui
bobBazaar.collectReviewContext
bobBazaar.loadReviewRules
bobBazaar.captureReviewResult
```

規約作成provider:

```text
bobBazaar.openRuleAuthoringGui
bobBazaar.loadRuleSourceIndex
bobBazaar.captureRuleEvidenceSelection
bobBazaar.loadSelectedRuleEvidence
bobBazaar.captureRuleProposal
bobBazaar.openRuleProposalTriageGui
bobBazaar.verifyRuleAuthoringApply
```

provider IDは公開Command Palette entryではない。input、args、state、workspace root、review identityをuntrustedとして再検証する。

## 11. template refreshと初期化

`.bob`初期化ではMCP設定、checklist、schema、prompt、example、Skill、Workflowを配置する。

既存file更新は次の順序で行う。

```text
現在bytesとtemplate bytesを比較
→ diff preview
→ operatorの明示確認
→ backup作成
→ replacement
→ post-write validation
```

`cancel時no-change`を保証し、cancel、stale expectation、unsafe path、backup failureでは既存fileとbackup setを変更しない。確認前にbackupやwriteを開始しない。

## 12. MCP境界

Bazaar read tools、project rules read tools、保存済みresult read toolsはread-onlyである。

- `BOB_BAZAAR_ALLOWED_ROOTS`内だけを受け付ける。
- allowed roots未設定は既定拒否する。
- `project_rules_init`は`BOB_BAZAAR_ENABLE_WRITE_TOOLS=1`の明示設定時だけ公開する。
- `.bob/mcp.json`は`BOB_BAZAAR_ALLOWED_ROOTS`を設定できるが、write toolsを暗黙有効化しない。
- unrestricted cwdは通常運用で使用しない。

## 13. review-resultとdecision

review-result JSONはresult handoff、selection、editor、clipboardから抽出し、schemaとchecklist contractで検証する。保存前にreview ID、active session、evidence、sizeを再確認する。

`指摘確認・振り分け`では、accepted、rejected、needs_investigation、deferredを人間が選ぶ。owner、reason、action、due、metricsをhost側で検証し、summary件数を決定的に再計算する。

Bob出力をそのまま正式指摘や完了判定へ昇格させない。

## 14. セキュリティ

- Bazaar操作はread-onlyに限定する。
- path、revision、ID、encoding、byte上限をhost側で検証する。
- CSP nonce、HTML escape、message allowlistを維持する。
- browserからsource本文、file path、stored decisionを信頼しない。
- review IDとcampaign IDはreserved name、control character、path separatorを拒否する。
- rule applyはbase hash、decision revision、preview digest、transaction lockを照合する。
- secretやsource本文をrelease evidenceへ保存しない。

## 15. テスト方針

- exact public command inventoryが2件であること。
- `bobBazaarReviewGui`のsingle-panel lifecycle、close / reopen、stale message拒否。
- target、packet、`レビュー結果取り込み`、`指摘確認・振り分け`、`レビュー実績`のroute。
- `review-run.json` identityとresume。
- Bazaar `--no-aliases`、timeout、encoding、path validation。
- `registerWorkflowProvidersWithRetry`とsoft dependency。
- template refreshのdiff preview、明示確認、backup、`cancel時no-change`。
- MCP read-only、`BOB_BAZAAR_ENABLE_WRITE_TOOLS=1`、`BOB_BAZAAR_ALLOWED_ROOTS`。
- result validation、decision validation、record / summary整合。
- Ubuntu / Windowsのcompile、unit、package、VSIX policy、Extension Host smoke。
- 実IBM Bob UATのkeyboard-only、200% zoom、High Contrast、Console、MCP、result handoff。

詳細は`detailed-design-ja.md`、`unit-test-spec-ja.md`、`real-machine-test-spec-ja.md`に定義する。
