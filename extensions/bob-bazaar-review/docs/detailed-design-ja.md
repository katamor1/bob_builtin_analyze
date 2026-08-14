# bob-bazaar-review 詳細設計書

## 1. 文書の位置付け

本書は`extensions/bob-bazaar-review`の現在実装に対応する詳細設計を定義する。対象はBazaar差分収集、レビュー主GUI、Review Run永続化、review-result検証、指摘確認・振り分け、レビュー実績、資料からのプロジェクト規約作成、workflow-register連携、template refresh、MCP、安全境界である。

通常operatorがCommand Paletteから開始する入口は次の2件だけである。

| Command ID | 完成表示名 | 用途 |
|---|---|---|
| `bobBazaar.openReviewGui` | `Bob Bazaar Review: レビューを開始` | Bazaarレビュー主GUIを開く |
| `bobBazaar.authorProjectRulesFromDocuments` | `Bob Bazaar Review: 資料からプロジェクト規約を作成` | 規約資料の選択と規約作成workflowを開始する |

その他のCommand IDはworkflow、主GUI action、MCP設定、互換API、テストのため登録を維持するが、通常のCommand Paletteでは`when: "false"`とする。

## 2. entry pointとactivation

manifestの`main`は`./out/extension.js`であり、composition rootは`src/extension.ts`である。activation時は次を行う。

1. public commandと内部commandを`ExtensionContext.subscriptions`へ登録する。
2. review record command群を登録する。
3. `registerWorkflowProvidersWithRetry`を開始する。
4. MCP serverはExtension Hostへ常駐させず、Bobから必要時に別processとして起動する。

`IBM.bob-code`と`local.workflow-register`はsoft dependencyである。未導入または未activationでも、本拡張のactivation自体を失敗させない。

## 3. 実装構成

現在の主要moduleは次のとおりである。実装に存在しない将来想定のfile名を設計上の正本として列挙しない。

```text
extensions/bob-bazaar-review/
  package.json
  src/
    extension.ts
    bazaar/
      bazaar.ts
      bazaarReviewCommands.ts
      reviewPacket.ts
      reviewTarget.ts
      reviewLimits.ts
      externalProcessRunner.ts
      textEncoding.ts
    ui/
      reviewGui.ts
      reviewGuiHtml.ts
      reviewGuiStages.ts
      resultCaptureGui.ts
      humanTriageGui.ts
      campaignDashboardGui.ts
      ruleAuthoringGui.ts
      ruleProposalTriageGui.ts
      displayLabels.ts
    reviewRuns/
      reviewRunTypes.ts
      reviewRunPaths.ts
      reviewRunState.ts
      reviewRunStore.ts
      reviewRunCoordinator.ts
      reviewRunMetrics.ts
      reviewRunResume.ts
      reviewRunRecovery.ts
    projectRules/
      resultCapture.ts
      resultCaptureCore.ts
      reviewResultValidationCommand.ts
      reviewResultsStore.ts
      schemaValidator.ts
      validator.ts
    ruleAuthoring/
      extraction/
        documentExtractor.ts
        ooxmlArchive.ts
        ooxmlPreflight.ts
        docxExtractor.ts
        xlsxExtractor.ts
        pdfExtractor.ts
      evidenceSelection.ts
      sourceIndex.ts
      ruleProposalValidation.ts
      ruleApplyPlan.ts
      ruleApplyTransaction.ts
      ruleAuthoringRunStore.ts
    records/
      reviewRecordCommands.ts
      reviewRecordStore.ts
      reviewTriage.ts
    workflow/
      workflowActions.ts
      workflowProviders.ts
      ruleAuthoringWorkflowActions.ts
      workflowRegisterBridge.ts
      workflowStepCompletion.ts
    workspace/
      workspaceCommands.ts
      workspaceResolver.ts
      bobWorkspaceInit.ts
      templateRefresh.ts
    mcp/
      server.ts
      bazaarTools.ts
      projectRulesTools.ts
      mcpConfig.ts
```

## 4. Bazaarレビュー主GUI

### 4.1 panel生成

`src/ui/reviewGui.ts`だけがview type `bobBazaarReviewGui`を生成する。

- title: `Bazaar レビュー`
- `enableScripts: true`
- `retainContextWhenHidden: true`
- 現在実装はcommand呼び出しごとに新しいWebview panelを生成する
- controllerはpanel dispose時にstage generationとoperation generationを進め、遅延完了を無効化する

「公開panel typeが1種類であること」と「同一instanceを再利用すること」は別契約である。現在実装は前者を満たすが、cached singleton panelを保持しない。

### 4.2 Webview route stage

`src/ui/reviewGuiStages.ts`のruntime unionは次である。

```ts
type BazaarReviewStage =
  | "review"
  | "review-result-capture"
  | "triage"
  | "review-results"
```

| runtime stage | 利用者向け役割 |
|---|---|
| `review` | レビュー対象の選択、レビュー資料の生成、Review Run開始・再開 |
| `review-result-capture` | `レビュー結果取り込み` |
| `triage` | `指摘確認・振り分け` |
| `review-results` | `レビュー実績` |

`resultCaptureGui.ts`、`humanTriageGui.ts`、`campaignDashboardGui.ts`は同じpanel typeのHTMLとmessage処理を担当するstage serviceであり、別の公開Command Palette入口を持たない。

### 4.3 message ownership

- すべてのmessageでcurrent `renderToken`を確認する。
- navigationは`fromStage`がcurrent stageと一致する場合だけ受理する。
- stage generationとreview operation generationでstale completionを拒否する。
- active Review Runの更新はidentityとobject generationを確認してからcommitする。
- stage serviceの例外は主GUIから通知し、未処理Promise rejectionとして放置しない。

## 5. Review Run永続化

### 5.1 pathとidentity

Review Runは次へ保存する。

```text
.bob-review-records/
  campaigns/<campaignId>/
    records/<reviewId>/
      review-run.json
      review-packet.md
```

`campaignId`と`reviewId`は安全な単一path segmentとして検証する。空文字、`.`、`..`、control character、Windows禁止文字、予約device名、末尾のdotまたはspaceを拒否する。保存pathはworkspaceのlogical containmentとrealpath containmentを検証し、symlink traversalを拒否する。

### 5.2 schemaとphase

schema定数は`bazaar-review-run/v1`である。

Review Runのcurrent `phase`は次のunionである。

```ts
type ReviewRunPhase =
  | "target"
  | "packet"
  | "result"
  | "triage"
  | "completed"
```

進捗を個別追跡するphaseは次である。

```ts
type ReviewRunTrackedPhase =
  | "target"
  | "packet"
  | "result"
  | "triage"
  | "record"
  | "summary"
```

Webview route stageとReview Run phaseを同一の型として扱わない。

代表shapeは次のとおりである。

```json
{
  "schemaVersion": "bazaar-review-run/v1",
  "workspaceRoot": "C:/work/project",
  "campaignId": "campaign-a",
  "reviewId": "review-001",
  "phase": "result",
  "status": "in_progress",
  "createdAt": "2026-07-23T00:00:00.000Z",
  "updatedAt": "2026-07-23T00:01:00.000Z",
  "target": {
    "mode": "revisionRange",
    "repositoryRoot": "C:/work/project",
    "baseRevision": "120",
    "targetRevision": "126"
  },
  "artifacts": {
    "reviewPacketPath": ".bob-review-records/campaigns/campaign-a/records/review-001/review-packet.md",
    "reviewResultJsonPath": ".bob/review/results/review-001.json",
    "reviewResultMarkdownPath": ".bob/review/results/review-001.md",
    "triageYamlPath": ".bob-review-records/campaigns/campaign-a/records/review-001/triage.yaml",
    "recordYamlPath": ".bob-review-records/campaigns/campaign-a/records/review-001/record.yaml"
  },
  "phases": {
    "target": { "status": "completed" },
    "packet": { "status": "completed" },
    "result": { "status": "in_progress" },
    "triage": { "status": "not_started" },
    "record": { "status": "not_started" },
    "summary": { "status": "not_started" }
  },
  "metrics": {
    "bobReviewSeconds": 0,
    "humanTriageSeconds": 0,
    "timingSource": "auto_wall_clock",
    "correctedByUser": false
  },
  "issues": []
}
```

`review-run.json`はnavigation、resume、phase progress、artifact path、timingの正本である。review-result JSON、triage、record、summary本体の正本を置き換えない。

### 5.3 mutationとatomic save

`src/reviewRuns/reviewRunState.ts`はReview Runの生成、legacy stateのnormalize、phase前進、tracked phaseごとのrequired artifact検証を担う。`src/reviewRuns/reviewRunCoordinator.ts`はReview Run identityごとのmutation queueで更新を直列化する。`src/reviewRuns/reviewRunStore.ts`は次を行う。

1. memory上でnormalizeとschema検証を行う。
2. `expectedUpdatedAt`が指定された場合、永続化済み`updatedAt`と比較する。
3. 同じdirectoryへtemporary fileを書く。
4. renameで`review-run.json`を置換する。
5. stale `updatedAt`、identity不一致、path escape、parse errorをfail-closedで拒否する。

packet、result、triage、record、summaryの完了時はrequired artifact pathを確認してからphaseを進める。全tracked phaseが`completed`になるまでReview Run全体を`completed`へ遷移させない。

## 6. Bazaar targetとpacket生成

### 6.1 target mode

```ts
type ReviewRunTargetMode =
  | "singleRevision"
  | "revisionRange"
  | "workingTreeSinceRevision"
```

`target.repositoryRoot`は必須である。modeに応じて`revision`、`baseRevision`、`targetRevision`を検証する。

### 6.2 Bazaar process

`src/bazaar/bazaar.ts`はすべての呼出しへ`--no-aliases`を追加する。実行optionは次を含む。

- `shell`を使用しない外部process runner
- bounded stdout / stderr buffer
- `timeoutMs`
- `AbortSignal`
- expected exit code allowlist
- `BZR_PROGRESS_BAR=none`
- revision specとrelative pathの検証

`diff`系では差分ありのexit code `1`を明示的に成功扱いへ含める。出力は設定されたUTF-8 / Shift-JIS / CP932系encodingでdecodeする。

### 6.3 review packet

packetはtarget metadata、変更file、bounded diff、新規file本文、project rule section、Review Run metadataを組み立てる。size limit超過時はUTF-8 boundaryを壊さずに切り詰める。

packet保存に成功するとtracked `packet`を完了し、tracked `result`を`in_progress`へ進め、Bob review timerを開始する。

## 7. レビュー結果取り込み

入力候補はworkflow handoff、command argument、active editor selection /全文、clipboardである。処理は次の順序で行う。

1. JSON objectまたはfenced JSONを抽出する。
2. byte上限を確認する。
3. schemaとrequired fieldを検証する。
4. checklist rule IDを検証する。
5. review IDをactive Review Runと照合する。
6. JSON、Markdown、metadataを保存する。
7. Review Runのartifact pathをworkspace相対pathとして記録する。
8. tracked `result`を完了し、tracked `triage`を`in_progress`へ進める。

invalid resultまたはreview ID不一致をReview Runへ接続しない。

## 8. 指摘確認・振り分けとレビュー実績

`src/records/reviewTriage.ts`と`src/ui/humanTriageGui.ts`はfinding ID、decision、owner、reason、action、summary countを検証する。`src/records/reviewRecordCommands.ts`はcampaign初期化、record / triageの作成・検証、campaign summary生成commandを登録し、永続化を`src/records/reviewRecordStore.ts`へ委譲する。triage draftの保存時は`triageYamlPath`を記録し、完了時にtracked `triage`を完了してtracked `record`を開始する。

`src/reviewRuns/reviewRunCoordinator.ts`はfinalize時に次を行う。

1. triage完了を確認する。
2. `src/records/reviewRecordStore.ts`を用いてrecordを生成する。
3. summary JSON / Markdownを生成する。
4. recordとsummaryのartifact pathを記録する。
5.全tracked phase完了後にReview Runを`completed`へ進める。

集計値はrecordとdecisionから決定的に再計算し、browserから渡された集計値を正本にしない。

## 9. 資料からのプロジェクト規約作成

公開入口は`bobBazaar.authorProjectRulesFromDocuments`である。`src/workspace/workspaceCommands.ts`がhost configurationを解決し、`src/ui/ruleAuthoringGui.ts`を開始する。

主要module:

- `src/ruleAuthoring/extraction/documentExtractor.ts`: 選択資料のformat別抽出
- `src/ruleAuthoring/sourceIndex.ts`: source / chunk index
- `src/ruleAuthoring/evidenceSelection.ts`: AIへ渡す根拠範囲の検証
- `src/ruleAuthoring/ruleProposalValidation.ts`: proposal、citation、operationの検証
- `src/ruleAuthoring/ruleApplyPlan.ts`: current fileとproposalからapply planを再生成
- `src/ruleAuthoring/ruleApplyTransaction.ts`: lock、backup、staged write、validation、commit
- `src/ruleAuthoring/ruleAuthoringRunStore.ts`: phaseとartifactの永続化

operatorはAIへ送るsource名、chunk、件数、合計byte数を確認する。proposalは人間がaccept / reject / editを判断し、apply前にbase hashとcurrent fileを再確認する。

```text
base hash確認
→ diff preview
→ conflict表示
→ operatorの明示確認
→ transaction lock
→ backup
→ staged write
→ validation
→ commit
```

`cancel時no-change`を保証する。cancel、base hash mismatch、revision conflict、validation failureではcurrent fileとbackup setを変更しない。

### 9.1 検証済みOOXML snapshotとparser input

`src/ruleAuthoring/extraction/ooxmlArchive.ts`の`prepareOoxmlParserInput`は、選択したDOCX/XLSXごとに1つの`FileHandle`を`r` modeで開き、同じhandleをsnapshot準備完了まで保持する。最初の`stat({ bigint: true })`を事前fingerprintのdevice、inode、byte size、mtimeと照合してからallocationし、source byte上限内の内容を1回の読み取り処理で1つのsnapshot Bufferへ固定する。snapshot SHA-256を含むfingerprintと、読み取り後の`BigInt` statを再照合し、不一致時はparserをloadしない。

`src/ruleAuthoring/extraction/ooxmlPreflight.ts`は同じsnapshot Bufferを受け取り、ZIP32のEOCD、central directory、local header、entry名、重複、overlap、data descriptor、entry count、declared byte、stored sizeと範囲を検証する。preflight後は全entry payloadを順番に検証し、stored entryの長さ、deflate output上限、圧縮入力の完全消費、実展開長、CRCのいずれかが一致しない場合もparser load前にfail-closedとする。

通常のDOCX/XLSXの`parserInput`は元のsnapshot Bufferと同一objectであり、`docxExtractor.ts`と`xlsxExtractor.ts`はpathではなくBufferだけを受け取る。`xl/styles.xml`と`xl/sharedStrings.xml`の両方が欠けるXLSXだけ、検証済みentryをnull-prototype mapへ保持し、最小stylesheetを追加したBufferをメモリ内で再構築する。拡張所有の`fflate`直接dynamic importは`ooxmlArchive.ts`のこのmissing-both branchだけであり、`read-excel-file@9.3.1`によるparser由来の推移依存`fflate` loadとは区別する。この準備処理は原本とworkspaceへ書き込みません。

この変更は公開Command ID、設定、persisted schema、安全なpathless日本語エラーメッセージ、extension version、dependency宣言とlockfileを変更しない。

## 10. template refresh

`src/workspace/templateRefresh.ts`はbundled templateとtarget fileをbyte比較する。

1. target containmentを確認する。
2. same bytesなら`unchanged`を返す。
3. `diff preview`を生成する。
4. overwriteの`明示確認`を得る。
5. current fileをunique backupへcopyする。
6. source contentを書き込む。

confirmationはbackupより前、backupはreplacementより前である。cancel時no-changeとbackup failure時no-changeを維持する。

## 11. workflow-register provider

`src/workflow/workflowActions.ts`はReview providerのreview context収集とproject rule bundle読込を実装する。`src/workflow/workflowProviders.ts`の`registerWorkflowProvidersWithRetry`は`local.workflow-register`の遅延activationを監視し、1秒、3秒、10秒のbounded retryを行う。providerはsource owner `local.bob-bazaar-review`で登録し、返された`Disposable`をextension contextで所有する。

Review provider:

- `bobBazaar.openReviewGui`
- `bobBazaar.collectReviewContext`
- `bobBazaar.loadReviewRules`
- `bobBazaar.captureReviewResult`

Document-backed rule authoring provider:

- `bobBazaar.openRuleAuthoringGui`
- `bobBazaar.loadRuleSourceIndex`
- `bobBazaar.captureRuleEvidenceSelection`
- `bobBazaar.loadSelectedRuleEvidence`
- `bobBazaar.captureRuleProposal`
- `bobBazaar.openRuleProposalTriageGui`
- `bobBazaar.verifyRuleAuthoringApply`

provider IDはworkflow definitionから参照される互換性契約であり、公開Command Palette inventoryとは別に管理する。

## 12. MCP

`.bob/mcp.json`はserver commandと`BOB_BAZAAR_ALLOWED_ROOTS`を設定するが、`BOB_BAZAAR_ENABLE_WRITE_TOOLS`を暗黙設定しない。

- Bazaar toolsはread-onlyである。
- project ruleのread / validate / render toolsはread-onlyである。
- 保存済みresult取得toolsはread-onlyである。
- `project_rules_init`は`BOB_BAZAAR_ENABLE_WRITE_TOOLS=1`のときだけ登録する。
- write toolは`BOB_BAZAAR_ALLOWED_ROOTS`とrequired cwdを検証する。

## 13. security / privacy

- workspace pathはlogical containmentとphysical containmentの両方で検証する。
- symlink、junction、device path、workspace escapeを拒否する。
- Bazaar revision、relative path、campaign ID、review IDをhost側で再検証する。
- source本文、diff、review-result、AI payloadをrelease evidenceへ貼り付けない。
- WebviewはCSP nonceとHTML escapeを維持する。
- external processのstdout / stderrとerror messageをboundedに扱う。
- AI proposalとBob resultを人間decisionなしで正式成果物へ昇格させない。

## 14. test / acceptance gate

unit / source contract:

- exact public command inventoryと`when: "false"`
- `bobBazaarReviewGui`のview typeとtitle
- runtime Webview stage union
- `bazaar-review-run/v1`、phase、artifact field、CAS、atomic save
- Bazaar validation、encoding、timeout、cancellation
- result extraction、schema、checklist、active identity
- triage、record、summary parity
- `registerWorkflowProvidersWithRetry`とsoft dependency
- rule authoring source selection、proposal、decision、transaction
- template refreshの`diff preview`、`明示確認`、backup、`cancel時no-change`
- MCPの`BOB_BAZAAR_ENABLE_WRITE_TOOLS=1`と`BOB_BAZAAR_ALLOWED_ROOTS`

release gate:

- Ubuntu / Windowsの同一headでcompile、dependency / architecture / source policy、unit test、package、VSIX policy、Extension Host smokeを実行する。
- 実IBM Bob / Bazaar UATでreview targetから`レビュー実績`までを確認する。
- keyboard-only、200% zoom、High Contrastを確認する。
- Developer Tools Consoleのuncaught exception / unhandled rejectionを0件にする。
- tested commit、VSIX build commit、artifact hashを一致させる。
