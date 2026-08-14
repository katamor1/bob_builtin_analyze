# bob-bazaar-review 基本設計書

## 1. 目的

`bob-bazaar-review`は、Bazaar repositoryの変更レビュー、プロジェクト規約作成、レビュー実績管理をIBM Bob / VS Code上で安全に実施するための拡張機能である。

利用者向けの常時表示Command Palette entryは次の2件に限定する。

```text
Bob Bazaar Review: レビューを開始
Bob Bazaar Review: 資料からプロジェクト規約を作成
```

保存、検証、実績生成、workflow handoff等の内部Command IDは登録を維持するが、通常operatorの入口としてCommand Paletteへ列挙しない。

## 2. 設計目標

- `bzr --no-aliases`でalias依存を排除する。
- UTF-8、Shift-JIS、CP932系出力をboundedにdecodeする。
- Bazaar差分、変更file、規約、追加資料をbounded review packetへ固定する。
- Bob outputをschemaとproject ruleで検証し、人間decisionへ接続する。
- `review-run.json`でreview identity、進捗、artifact pathを再開可能にする。
- 規約候補をdiff preview、明示確認、backup、transactionを経て反映する。
- workspace、repository、artifact、recordのphysical containmentを検証する。

## 3. スコープ

### 3.1 対象

- Bazaar revision、revision range、working tree差分のread-only取得。
- review packet生成とBob context handoff。
- review-result JSONの抽出、schema検証、保存。
- `指摘確認・振り分け`とreview record / metrics / campaign summary生成。
- 規約資料の決定論的抽出、AI送信範囲確認、proposal検証、人間decision、安全反映。
- `.bob` template、Skill、Workflow、MCP設定の初期化・refresh。
- `workflow-register` action provider登録。
- Bazaar / project rules /保存済み結果のMCP read tools。

### 3.2 対象外

- Bazaarのcommit、push、pull、update、revert、merge、resolve。
- 任意shell command実行。
- Bobによる最終承認や自動採否。
- workspace外への無制限書込み。
- AI outputのhost validationなしでの保存・反映。

## 4. 全体構成

```text
VS Code Extension Host
  └─ bob-bazaar-review
       ├─ extension.ts
       ├─ ui/
       │    ├─ reviewGui.ts                -> 公開review panel owner
       │    ├─ reviewGuiStages.ts          -> runtime stage contract
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

`src/extension.ts`がcomposition rootであり、manifestの`main`は`./out/extension.js`である。`IBM.bob-code`と`local.workflow-register`はsoft dependencyである。

## 5. Bazaarレビュー主GUI

### 5.1 panel lifecycle

`bobBazaar.openReviewGui`はview type `bobBazaarReviewGui`、title `Bazaar レビュー`のpanelを開く。

- 現在実装はcommand呼び出しごとに新しいWebview panelを生成する。
- `enableScripts: true`、`retainContextWhenHidden: true`を使用する。
- panel dispose時にstage generationとoperation generationを進め、遅延完了を無効化する。
- 公開panel typeが1種類であることと、同一panel instanceを再利用することを混同しない。

### 5.2 runtime stage

主GUIのruntime stageは次の4件である。

| runtime stage | 利用者向け役割 |
|---|---|
| `review` | target選択、Bazaar情報取得、packet preview、Bob handoff |
| `review-result-capture` | `レビュー結果取り込み` |
| `triage` | `指摘確認・振り分け` |
| `review-results` | `レビュー実績` |

`target`、`packet`、`result`等のReview Run phaseは永続化上の進捗であり、Webview route stageとは別の契約である。

stale render token、古いstage generation、異なるworkspace、異なるreview identityからのmessageを拒否する。

## 6. Review Run

### 6.1 schemaとpath

Review Run schemaは`bazaar-review-run/v1`である。

```text
.bob-review-records/
  campaigns/<campaignId>/
    records/<reviewId>/
      review-run.json
      review-packet.md
```

`review-run.json`はcamelCase fieldでworkspace root、campaign ID、review ID、target、phase、status、artifact path、timing、issueを保持する。

### 6.2 phase

current phase:

```text
target | packet | result | triage | completed
```

tracked phase:

```text
target | packet | result | triage | record | summary
```

tracked phaseは`not_started / in_progress / completed / blocked / failed / skipped`のprogressを持つ。required artifactが存在しないphaseを完了扱いにしない。

### 6.3 mutation

Review Run identityごとのmutation queueで更新を直列化する。write前に`updatedAt`、identity、path containmentを再確認し、temporary fileとrenameでatomicに置換する。

## 7. Bazaar実行

すべてのBazaar subprocessはargument arrayを使用し、global option `--no-aliases`を付与する。

```text
bzr --no-aliases diff ...
bzr --no-aliases log ...
bzr --no-aliases status ...
```

- revisionとrelative pathを検証する。
- shell文字列連結を使わない。
- timeout、AbortSignal、stdout / stderr byte上限を持つ。
- diffありのexpected exit codeだけを明示許可する。
- commit系subcommandを公開しない。

## 8. Workspaceモデル

| Root | Marker | 用途 |
|---|---|---|
| Bob workspace root | `.bob` | Workflow、Skill、rules、results、MCP設定 |
| Bazaar repository root | `.bzr` | diff、log、status、catの実行対象 |

multi-rootではlogical pathだけでなくphysical identityを検証し、別rootのsession、artifact、recordを混在させない。

## 9. review-result、triage、record

review-result JSONはworkflow handoff、selection、editor、clipboardから抽出し、size、schema、checklist、review ID、active Review Runを検証して保存する。

`指摘確認・振り分け`ではaccepted、rejected、needs_investigation、deferredを人間が選ぶ。owner、reason、action、dueをhost側で検証し、summary件数を決定的に再計算する。

recordとsummaryの生成後、すべてのtracked phaseが完了した場合だけReview Run全体を`completed`へ進める。Bob outputを正式指摘や完了判定へ自動昇格させない。

## 10. 規約作成フロー

`bobBazaar.authorProjectRulesFromDocuments`は資料選択、抽出preview、AIへ送る根拠範囲の確認、proposal検証、人間decision、apply preview、transaction recoveryを提供する。

```text
source選択
→ bounded extraction
→ evidence確認
→ AI proposal
→ host validation
→ accept / reject / edit
→ base hash再確認
→ diff preview
→ 明示確認
→ backup / staged write / validation / commit
```

cancel、conflict、validation failureではcurrent fileとbackup setを変更しない。

### 10.1 検証済みOOXML snapshot境界

DOCX/XLSXの抽出境界は、選択時fingerprintの確認、1つのsnapshot Bufferへの固定、ZIP32構造preflight、全entry payload検証、parser loadの順で進む。前段が失敗した場合は後段へ進めず、選択後の差し替えやpayload不整合をparserから隔離する。

通常のDOCX/XLSXでは検証済みの元Bufferをparser inputとする。missing-both XLSX、すなわち`xl/styles.xml`と`xl/sharedStrings.xml`の両方が欠ける場合だけ、検証済みentryから最小stylesheet付きBufferをメモリ内で再構築する。原本とworkspaceへのwriteは行わない。

公開Command ID、設定、persisted schema、安全なpathless日本語エラーメッセージ、extension versionは変更しない。dependency宣言とlockfileのversionも既存contractを維持する。

## 11. workflow-register連携

`registerWorkflowProvidersWithRetry`は`local.workflow-register`が利用可能な場合だけproviderを登録し、起動順序差をbounded retryで吸収する。provider registration failureを本拡張のactivation failureへ変えない。

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

## 12. template refreshとMCP

既存template更新は次の順序を守る。

```text
current bytes比較
→ diff preview
→ operatorの明示確認
→ backup
→ replacement
→ post-write validation
```

`cancel時no-change`を保証し、確認前にbackupやwriteを開始しない。

MCP境界:

- Bazaar / project rules /保存済みresultの通常toolsはread-only。
- `BOB_BAZAAR_ALLOWED_ROOTS`内だけを受け付ける。
- allowed roots未設定は既定拒否する。
- `project_rules_init`は`BOB_BAZAAR_ENABLE_WRITE_TOOLS=1`の明示設定時だけ登録する。
- `.bob/mcp.json`はwrite toolsを暗黙有効化しない。

## 13. セキュリティ

- Bazaar操作をread-onlyに限定する。
- path、revision、ID、encoding、byte上限をhost側で検証する。
- CSP nonce、HTML escape、message allowlistを維持する。
- browser payload、Bob output、AI proposalをsource of truthにしない。
- review IDとcampaign IDはreserved name、control character、path separatorを拒否する。
- secretやsource本文をrelease evidenceへ保存しない。

## 14. テスト方針

- exact public command inventoryが2件。
- view type `bobBazaarReviewGui`とtitle `Bazaar レビュー`。
- runtime stage unionとReview Run phaseを別々に検証する。
- `bazaar-review-run/v1`、camelCase artifact field、CAS、atomic save。
- target、packet、result capture、triage、record、summaryの進捗。
- `bzr --no-aliases`、encoding、timeout、cancellation、output limit。
-規約作成のsource selection、proposal validation、decision、transaction。
- template refreshのpreview、confirmation、backup、cancel時no-change。
- MCP write opt-inとallowed roots。
- Ubuntu / Windowsの同一headでunit、policy、package、VSIX、Extension Host smoke。
- 実IBM Bob / Bazaar UAT、keyboard-only、200% zoom、High Contrast、Console error 0件。
