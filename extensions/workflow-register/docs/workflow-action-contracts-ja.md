# Bob workflow action contract

この文書は、`local.workflow-register`が公開するAPIと、domain extensionが登録するaction provider IDの互換性境界を定義します。provider ID、workflow ID、result sink type、artifact schemaを変更する場合は、同梱workflow、runtime、README、テストを同じ変更で更新します。

## 公開operator commandとの関係

Command Paletteに常時表示する入口は5件だけです。action providerはこの公開面とは別のworkflow連携契約であり、provider数だけCommand Palette entryを増やしません。

```text
workflowRegister.openOperationHub
workflowRegister.openWorkflowBuilder
bobBazaar.openReviewGui
bobBazaar.authorProjectRulesFromDocuments
bobCodeConsistency.openReviewWizard
```

## workflow-register exported API

`local.workflow-register`は次のAPIをexportします。

| API | Contract |
| --- | --- |
| `acceptBobWorkflowGate(workspaceRoot, runId, stepId)` | live Bob executionが待つreview gateをatomicに承認する。 |
| `acceptBobWorkflowGateWithMetadata(workspaceRoot, runId, stepId)` | gate承認結果と待機中Bob execution metadataを返す。 |
| `coordinateReviewAcceptance(workspaceRoot, runId, operation)` | 同じroot / runの重複review acceptanceをsingle-flight化する。 |
| `registerActionProvider(provider)` | `command` step用providerを所有元付きで登録し、解除用disposableを返す。 |
| `registerAgentProvider(provider)` | standalone / Bob adapter fallback用agent providerを登録する。 |
| `registerResultSink(type, handler)` | `result.sinks[].type`に対応するhandlerを登録する。 |
| `listWorkflows()` | 現在登録済みのcore workflow definitionを返す。 |
| `runWorkflow(workflowId?, inputs?)` | workflowをstandalone実行する。 |
| `runWorkflowStep(workflowId?, stepId?, inputs?)` | workflowの指定stepをsingle-stepで実行する。 |
| `startFromStepWithArtifacts(workflowId?, stepId?, sourceRunId?, inputs?)` | 検証済みartifactからstateを復元し、新しいrunを指定stepから開始する。 |
| `importArtifactsFromTaskSnapshots(runId?)` | preview / selection / digest検証後にtask snapshot候補をartifactへ取り込む。 |
| `runNextStep(runId?)` | 保存済みrunの次に実行可能なstepを実行する。 |
| `approveBranchCheckpoint(runId?)` | pending branch checkpointを承認してloop allowanceを延長する。 |
| `abortBranchCheckpoint(runId?)` | pending branch checkpointのrunを中止する。 |
| `inspectBranching(runId?)` | loop、checkpoint、transition historyを表示する。 |

`registerActionProvider`は同じIDを別ownerが無警告で上書きすることを拒否します。古いregistrationのdisposeが新しいregistrationを削除してはなりません。

## ActionExecutionInput

```ts
interface ActionExecutionInput {
  args: unknown
  inputs: Record<string, unknown>
  state?: Record<string, string>
  workflowId?: string
  logicalWorkflowId?: string
  workflowRoot?: string
  workflowFile?: string
  workflowFolderName?: string
  bobRoot?: string
  workspaceRoot?: string
  runId?: string
  stepId?: string
}
```

providerは`args`、`inputs`、`state`をuntrusted inputとして扱い、許可field、workspace containment、ID、pathをhost側で再検証します。

## Result handoff

agent出力のhandoffは、trim済みtextを互換用`args[0]`と`latestAssistantText` / `resultText` / `artifactText`へ渡します。file sink、command sink、registered sinkのいずれでも、失敗を成功として握りつぶさずstep / runをfailedにします。

## bob-bazaar-review providers

source ownerは`local.bob-bazaar-review`です。

### Review providers

| Provider ID | Contract |
| --- | --- |
| `bobBazaar.openReviewGui` | `Bazaar レビュー`主GUIを開き、workflow contextからinitial targetを受け取る。 |
| `bobBazaar.collectReviewContext` | target、changed files、packet summaryを収集する。 |
| `bobBazaar.loadReviewRules` | checklist、schema、approved context / addendum / provenanceをboundedに読み込む。 |
| `bobBazaar.captureReviewResult` | result handoffからreview-result JSONを検証し、active Review Run identityと一致する場合だけ保存する。 |

### Document-backed rule authoring providers

| Provider ID | Contract |
| --- | --- |
| `bobBazaar.openRuleAuthoringGui` | source選択、決定論的抽出、preview、AI consentを行う。 |
| `bobBazaar.loadRuleSourceIndex` | 本文を含まないbounded source indexを読み込む。 |
| `bobBazaar.captureRuleEvidenceSelection` | selected chunk ID、hash、source membershipを検証・保存する。 |
| `bobBazaar.loadSelectedRuleEvidence` | 明示選択された本文だけをuntrusted evidence frameで渡す。 |
| `bobBazaar.captureRuleProposal` | proposal schema、base hash、citation、operationを検証・保存する。 |
| `bobBazaar.openRuleProposalTriageGui` | 規約候補の人間decision、apply preview、transactionを行う。 |
| `bobBazaar.verifyRuleAuthoringApply` | committed manifest、final hash、provenance、phaseを再検証する。 |

## bob-code-consistency-review providers

source ownerは`local.bob-code-consistency-review`です。

### Workspace and review-input providers

| Provider ID | Contract |
| --- | --- |
| `bobCodeConsistency.initializeWorkspace` | bundled workflowをbackup後に更新し、既存`review-input.yaml`は変更せずbackupだけ作成する。 |
| `bobCodeConsistency.createReviewInput` | 対話入力をbuilder / schema / path validatorへ通して`review-input.yaml`を作成する。 |
| `bobCodeConsistency.prepareAiReviewInputDraft` | AIへ渡すbounded draft promptを作成する。 |
| `bobCodeConsistency.applyAiReviewInputDraft` | AIの`ReviewInputDraft` JSONをhost側で再検証して適用する。 |
| `bobCodeConsistency.repairReviewInput` | 既知の旧enumなどをpreview / backup付きで修復する。 |
| `bobCodeConsistency.explainReviewInputDiagnostics` | review-input診断を説明する。 |

### Traceability providers

| Provider ID | Contract |
| --- | --- |
| `bobCodeConsistency.prepareAiTraceabilityDraft` | proposed-only traceability候補用promptを作成する。 |
| `bobCodeConsistency.captureAiTraceabilityDraft` | AI draft JSONを検証しworkflow stateへ渡す。 |
| `bobCodeConsistency.applyAiTraceabilityDraft` | proposed-only JSONをsidecar catalogへmergeする。 |
| `bobCodeConsistency.openTraceabilityPrep` | 独立panelを作らず、保持中の`整合プレレビュー`主GUIを`トレーサビリティ整理`stageへrouteする。 |
| `bobCodeConsistency.validateTraceabilityCatalog` | catalog gateを検証してreportを生成する。 |
| `bobCodeConsistency.createReviewInputFromTraceability` | accepted itemから`review-input.yaml`を生成する。 |

### Review execution providers

| Provider ID | Contract |
| --- | --- |
| `bobCodeConsistency.preprocess` | validated review-input、VCS差分、文書、コード根拠からreview-packageを生成する。 |
| `bobCodeConsistency.captureBobOutput` | result handoff / clipboard / textからBob output YAMLを取り込み、固定workspaceへ保存する。 |
| `bobCodeConsistency.validateOutput` | Bob outputをschemaとevidence indexで検証する。 |
| `bobCodeConsistency.triage` | immutable source snapshot、人間decision store、projectionを生成する。 |

## UI route boundary

provider IDとUI ownershipは別契約です。

- `bobBazaar.openReviewGui`がBazaarのreview / result / decision / metrics stageを所有します。
- `bobCodeConsistency.openReviewWizard`がinput / traceability / preprocess / result / decision stageを所有します。
- stage serviceはvalidator、store、transaction、conflict tokenを再利用しますが、独立した公開panelを所有しません。

## soft dependency

Bazaar ReviewとCode Consistency Reviewは、`workflow-register`が存在する場合だけproviderを登録します。未導入時も各拡張のactivationとlocal serviceを維持します。登録失敗はwarningとして扱い、optional integrationをhard dependencyへ変えません。
