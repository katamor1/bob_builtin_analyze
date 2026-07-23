# bob-bazaar-review 詳細設計書

## 1. 文書の位置付け

本書は`extensions/bob-bazaar-review`の現在実装に対応する詳細設計を定義する。対象はBazaar差分収集、単一レビュー主GUI、review session永続化、review-result検証、指摘確認・振り分け、レビュー実績、規約資料からの規約作成、workflow-register連携、template refresh、MCP、安全境界である。

公開Command Palette entryは次の2件だけである。

| Command ID | 完成表示名 | 用途 |
|---|---|---|
| `bobBazaar.openReviewGui` | `Bob Bazaar Review: レビューを開始` | Bazaarレビュー主GUIをopen / revealする |
| `bobBazaar.authorProjectRulesFromDocuments` | `Bob Bazaar Review: 資料からプロジェクト規約を作成` | 規約資料の取り込みと候補反映を開始する |

他のCommand IDはworkflow、主GUI action、MCP設定、互換API、テスト用に登録を維持するが、通常のCommand Paletteでは`when: "false"`とする。

## 2. entry pointとactivation

manifestの`main`は`./out/extension.js`である。`src/extension.ts`は次の順序で構成する。

1. local serviceとstoreを生成する。
2. `bobBazaarReviewGui`のpanel ownerを生成する。
3. public / internal commandを登録する。
4.規約作成serviceを登録する。
5. MCP config commandとserver entryを登録する。
6. `registerWorkflowProvidersWithRetry`を開始する。
7. dispose時にpanel、listener、timer、provider registrationを破棄する。

`IBM.bob-code`と`local.workflow-register`はsoft dependencyである。未導入をactivation failureにしない。

## 3. 実装構成

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
      revisionInfo.ts
      textEncoding.ts
    bob/
      bobCodeExtension.ts
      bobContext.ts
    ui/
      reviewGui.ts
      reviewGuiHtml.ts
      resultCaptureGui.ts
      resultCaptureGuiHtml.ts
      humanTriageGui.ts
      humanTriageGuiHtml.ts
      campaignDashboardGui.ts
      campaignDashboardGuiHtml.ts
      ruleAuthoringGui.ts
      ruleAuthoringGuiHtml.ts
      ruleProposalTriageGui.ts
      ruleProposalTriageGuiHtml.ts
    reviewRuns/
      reviewRunStore.ts
      reviewRunTypes.ts
      reviewRunMetrics.ts
    projectRules/
      resultCapture.ts
      resultCaptureCore.ts
      schemaValidator.ts
      validator.ts
      reviewResultsStore.ts
    ruleAuthoring/
      sourceExtraction.ts
      evidenceSelection.ts
      proposalValidation.ts
      ruleApplyPlan.ts
      ruleApplyTransaction.ts
    records/
      campaignStore.ts
      reviewRecord.ts
      triage.ts
      summary.ts
    workflow/
      workflowRegisterBridge.ts
      workflowProviders.ts
      workflowStepCompletion.ts
    workspace/
      workspaceResolver.ts
      bobWorkspaceInit.ts
      templateRefresh.ts
    mcp/
      bazaarTools.ts
      projectRulesTools.ts
      mcpConfig.ts
      server.ts
```

## 4. `bobBazaarReviewGui` ownership

### 4.1 lifecycle

`reviewGui.ts`だけがBazaarレビューの公開panelを所有する。

- view type: `bobBazaarReviewGui`
- title: `Bazaar レビュー`
- `enableScripts: true`
- `retainContextWhenHidden: true`
- 同じworkspace / review sessionでは既存panelを`reveal()`する
- dispose時にlistener、watcher、debounce、pending requestを破棄する

`resultCaptureGui.ts`、`humanTriageGui.ts`、`campaignDashboardGui.ts`はembedded stage serviceであり、独立した公開panelを作成しない。

### 4.2 stage model

```ts
type BazaarReviewStage =
  | "target"
  | "packet"
  | "result"
  | "decision"
  | "record"
```

表示名は次へ固定する。

| stage | 表示 |
|---|---|
| `target` | レビュー対象 |
| `packet` | レビュー資料 |
| `result` | レビュー結果取り込み |
| `decision` | 指摘確認・振り分け |
| `record` | レビュー実績 |

stage transitionはhost側で検証する。review ID、campaign ID、workspace root、stage prerequisiteが一致しないtransitionを拒否する。

### 4.3 message boundary

Webview messageは`type`とaction allowlistを検証する。browserから受け取ったpath、revision、review ID、decision、metricsをそのまま使用しない。

- render tokenがcurrent generationと一致すること。
- workspace rootがopen workspaceのcanonical physical pathであること。
- active review IDが`review-run.json`と一致すること。
- target modeごとのrequired fieldがあること。
- file pathがBazaar rootまたはBob root内であること。
- stale stage completionをcurrent sessionへ適用しないこと。

## 5. review session persistence

### 5.1 `review-run.json`

```text
.bob-review-records/
  campaigns/<campaignId>/
    records/<reviewId>/
      review-run.json
```

代表shape:

```json
{
  "schema_version": "bazaar-review-run/v3",
  "campaign_id": "campaign-a",
  "review_id": "review-001",
  "stage": "result",
  "status": "in_progress",
  "target": {
    "mode": "revisionRange",
    "base_revision": "120",
    "target_revision": "126"
  },
  "artifacts": {
    "packet": "review-packet.md",
    "result": ".bob/review/results/review-001.json",
    "decision": "triage.yaml",
    "record": "record.yaml"
  },
  "updated_at": "2026-07-23T00:00:00.000Z"
}
```

`review-run.json`はUI navigationの正本である。review-result JSON、record、decision、metrics本体の正本を置き換えない。

### 5.2 save semantics

- current revisionを読込む。
- expected revisionと比較する。
- next stateをmemory上で検証する。
- same-directory temporary fileへwriteする。
- atomic renameする。
-成功後にpanel modelをrefreshする。

stale revisionは再読込を要求し、browser側stateで上書きしない。

## 6. review targetとBazaar collection

### 6.1 target mode

```ts
type ReviewTarget =
  | { mode: "singleRevision"; revision: string }
  | { mode: "revisionRange"; baseRevision: string; targetRevision: string }
  | { mode: "workingTreeSinceRevision"; baseRevision: string }
```

revisionはhost側validatorを通す。path separator、control character、option injectionとなる値を拒否する。

### 6.2 Bazaar subprocess

実行形式:

```text
execFile(bzrPath, ["--no-aliases", ...args], options)
```

契約:

- `shell: false`
- hard timeout
- AbortSignal
- stdout / stderr上限
- `BZR_PROGRESS_BAR=none`
- expected exit codeの明示allowlist
- cwdのphysical containment
- Windows drive-relative、UNC device path、junction、aliasの拒否

### 6.3 packet生成

packetはrevision metadata、changed files、bounded diff、追加file本文、project rule section、provenanceを含む。size limitを超えた本文はUTF-8 boundaryで切り詰め、truncation markerを含めても上限を超えない。

Bob contextへ追加できない場合は、保存済みMarkdownまたはclipboard fallbackを選べる。fallback failureをreview成功として扱わない。

## 7. `レビュー結果取り込み`

### 7.1 input候補

- workflow result handoff
- active editor selection
- active editor full text
- clipboard
- command argument

抽出順序とsource typeをrecordし、review IDとactive sessionを照合する。

### 7.2 validation

1. JSON objectまたはfenced JSONを抽出する。
2. byte上限を検査する。
3. schema versionとrequired fieldを検証する。
4. checklist rule IDを検証する。
5. severity、summary、evidenceを正規化する。
6. active review IDと一致することを確認する。
7. JSONとMarkdownをtransactionalに保存する。

保存先:

```text
.bob/review/results/<reviewId>.json
.bob/review/results/<reviewId>.md
```

## 8. `指摘確認・振り分け`

review-result findingごとに次を保存する。

```yaml
finding_id: F-001
rule_id: RULE-001
decision: accepted
owner: reviewer-a
reason: 根拠を確認し、正式レビュー対象とした
action: fix_required
```

decision enum、required field、finding ID membership、summary countをhost側で検証する。browserから送られたrule本文、review-result本文、既存decisionを正本にしない。

複数window / stale revisionがある場合はlatest recordを再読込し、古いsaveを拒否する。

## 9. `レビュー実績`

recordはpacket、result、decision、timing、quality gate、environmentを紐付ける。

```text
campaign.yaml
targets.yaml
records/<reviewId>/record.yaml
records/<reviewId>/triage.yaml
records/<reviewId>/metrics.json
summary.json
summary.md
```

summaryはrecord / decisionから決定的に再計算する。手入力の集計値を正本にしない。missing artifact、schema invalid、件数不一致をquality gateへ出す。

## 10. 規約資料からの規約作成

### 10.1 source extraction

- source fileをexplicit selectionする。
- allowed extension、file count、per-file bytes、aggregate bytesを検証する。
- PDF変換、OCR required、partial extractionを状態として記録する。
- chunk ID、source hash、logical source nameを生成する。
- local absolute pathや未選択本文をAI payloadへ含めない。

### 10.2 AI consentとproposal

operatorは選択chunkと合計bytesを確認し、AIへ送る範囲を明示承認する。proposalはschema、operation、rule ID、citation、base hashをhost側で再検証する。

### 10.3 decisionとapply

人間がaccept、reject、editを選ぶ。apply前にcurrent filesとproposalからplanを再生成する。

```text
base hash確認
→ diff preview
→ conflict表示
→ operatorの明示確認
→ transaction lock
→ backup
→ staged write
→ validation
→ commit manifest
```

`cancel時no-change`を保証する。cancel、base hash mismatch、revision conflict、validation failureではcurrent fileとbackup setを変更しない。

## 11. template refresh

`workspace/templateRefresh.ts`はbundled templateとcurrent targetを比較する。

処理順:

1. targetのphysical containmentを確認する。
2. current bytesとsource bytesを読む。
3. same bytesなら`unchanged`を返す。
4. `diff preview`を生成する。
5. overwriteの`明示確認`を得る。
6. current fileをunique backupへcopyする。
7. source bytesをwriteする。
8. post-write validationを行う。

confirmationはbackupより前、backupはreplacementより前でなければならない。cancel時no-change、backup failure時no-changeをテストで固定する。

## 12. workflow-register providers

`registerWorkflowProvidersWithRetry`は次の条件でproviderを登録する。

- `local.workflow-register`が存在する。
- exported APIに`registerActionProvider`がある。
- source ownerが`local.bob-bazaar-review`である。
- 同一owner / IDの重複registrationを避ける。
- dispose時にregistrationを解除する。

Review providers:

| Provider ID | Contract |
|---|---|
| `bobBazaar.openReviewGui` | 主GUIを開きinitial targetを受け取る |
| `bobBazaar.collectReviewContext` | target、changed files、packet summaryを返す |
| `bobBazaar.loadReviewRules` | checklist、schema、approved addendumをboundedに返す |
| `bobBazaar.captureReviewResult` | handoff JSONをactive review identityへ保存する |

Document-backed rule authoring providers:

| Provider ID | Contract |
|---|---|
| `bobBazaar.openRuleAuthoringGui` | source選択、抽出、AI consent |
| `bobBazaar.loadRuleSourceIndex` | 本文なしsource index |
| `bobBazaar.captureRuleEvidenceSelection` | selected chunk membership / hash検証 |
| `bobBazaar.loadSelectedRuleEvidence` | 選択本文だけをbounded frameで返す |
| `bobBazaar.captureRuleProposal` | proposal schema / citation / base hash検証 |
| `bobBazaar.openRuleProposalTriageGui` | human decisionとapply preview |
| `bobBazaar.verifyRuleAuthoringApply` | manifest、final hash、phase再検証 |

## 13. MCP

### 13.1 configuration

`.bob/mcp.json`はserver commandと`BOB_BAZAAR_ALLOWED_ROOTS`を設定する。`BOB_BAZAAR_ENABLE_WRITE_TOOLS`を暗黙設定しない。

### 13.2 tool boundary

- Bazaar toolsはread-only。
- project rule read / validation / render toolsはread-only。
- saved result get toolsはread-only。
- `project_rules_init`は`BOB_BAZAAR_ENABLE_WRITE_TOOLS=1`のときだけ登録する。
- every toolは`BOB_BAZAAR_ALLOWED_ROOTS`とrequired cwdを検証する。
- unrestricted cwdは明示的な検証用途以外で許可しない。

## 14. security and privacy

- pathはlogical stringだけでなくphysical identityで検証する。
- symlink、junction、hard link、workspace escapeを拒否する。
- source本文、diff、AI payload、review-resultをrelease evidenceへ貼り付けない。
- WebviewはCSP nonce、HTML escape、inline handler禁止を維持する。
- subprocessはshellを使わない。
- external process errorはcommand、cwd、exit code、bounded outputを保持する。
- AI proposal / Bob resultを人間decisionなしで正式成果物へ昇格させない。

## 15. tests

### 15.1 unit / source contracts

- exact public command inventoryと`when: "false"`。
- `bobBazaarReviewGui`のsingle-panel lifecycle。
- stage prerequisite、render token、review revision。
- `review-run.json`のsave / resume / migration。
- Bazaar validation、encoding、timeout、cancellation。
- result extraction、schema、checklist、active identity。
- decision enum、required field、summary parity。
- record / campaign aggregation。
- `registerWorkflowProvidersWithRetry`とsoft dependency。
-規約作成source selection、proposal、decision、transaction。
- template refreshの`diff preview`、`明示確認`、backup、`cancel時no-change`。
- MCPの`BOB_BAZAAR_ENABLE_WRITE_TOOLS=1`と`BOB_BAZAAR_ALLOWED_ROOTS`。

### 15.2 package / host gates

Ubuntu / Windowsの同一headでcompile、architecture、source、dependency、unit、package、VSIX policy、Extension Host smokeを実行する。

実IBM Bob / Bazaar UATでは次を確認する。

- review targetから`レビュー実績`までのE2E。
- rule sourceからsafe applyまでのE2E。
- keyboard-only、200% zoom、High Contrast。
- Developer Tools Consoleにuncaught exception / unhandled rejectionがない。
- MCP read-onlyとwrite opt-in。
- artifact / recordのhashとtested commit / VSIX build commitの一致。
