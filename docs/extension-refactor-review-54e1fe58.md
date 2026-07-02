# 3拡張機能の責務分割見直し（基準: 54e1fe58）

基準コミット: `54e1fe58b47c9469dbcaba9d2af5aded3ff1083f`

この文書は、`bob_builtin_analyze` に含まれる主要3拡張機能について、中程度以下の AI が安全に読み書きしやすい単位へ分割する観点で見直した結果をまとめる。

## 対象拡張

| 拡張 | 主な役割 | 現状評価 |
|---|---|---|
| `extensions/workflow-register` | `.bob/workflows/*/WORKFLOW.md` の登録、実行、step review、Bob連携 | parser / engine / reports / Bob API helper は分割済み。`bobWorkflowRunner.ts` の低リスク helper 分離を実施済み。 |
| `extensions/bob-bazaar-review` | Bazaar 差分・リビジョン範囲からレビュー packet を作成し Bob へ渡す | workflow-register bridge / workflow action input helper を `workflowRegisterBridge.ts` へ分離済み。 |
| `extensions/bob-code-consistency-review` | 要求・設計・テスト仕様とコード変更の整合プレレビュー用 input / preprocess / output 検証 | command option / prompt / path helper と review-input wizard を分離済み。次は traceability command 分割。 |

## 1. workflow-register

### 現状

`parser.ts` は facade 化され、実体は `core/parser/` 配下へ分割済み。`engine.ts` も `engine/preflight.ts`、`engine/runState.ts`、`engine/templateRenderer.ts` へ helper が分離済み。

直近の分割では、Bob UI 実行 adapter である `src/bobWorkflowRunner.ts` から、比較的低リスクな helper を外へ出した。

### 実施済みの分割

| ファイル | 責務 |
| --- | --- |
| `src/bobApi.ts` | Bob 拡張 API の取得、activation error の記録、source-like object への安全な変換。 |
| `src/reports.ts` | attempt 実行、戻り値説明、Markdown report 表示。 |
| `src/bobWorkflowFactory.ts` | Bob workflow object と Bob step array の構築。 |
| `src/bobWorkflowMessages.ts` | workflow 開始、step 継続、command result、workflow state block の message 生成。 |
| `src/bobTaskInputs.ts` | Bob task metadata / message から workflow input を抽出。 |
| `src/taskSnapshotRecovery.ts` | task snapshot から最新 assistant text を復元。 |

既存の外部 import を壊さないよう、`bobWorkflowRunner.ts` から `createBobWorkflow` / `extractTaskWorkflowInputs` / `recoverResultTextFromSnapshots` を再 export している。

### 現在 `bobWorkflowRunner.ts` に残る責務

- `BobWorkflowEngineRunner`
- `StepRuntime`
- Bob task と `WorkflowEngine` の接続
- Bob chat への step message / command result / agent output 同期
- `WorkflowExecutionHooks` から task snapshot を保存する処理
- manual completion 待ちと `task.setStepComplete()` の同期
- result handoff 失敗時の復旧候補取得

### 次に切る対象

`StepRuntime` は VS Code UI、result handoff、guardrail、active step state に触るため、次 PR で単独分離する。

推奨ファイル:

```text
src/bobStepRuntime.ts
```

含める候補:

- `StepRuntime`
- `captureHeldStepResult`
- `getTaskMessageCount`

注意点:

- `validateCommandGuardrails`
- `executeResultHandoff`
- `vscode.window.showQuickPick`
- `vscode.commands.executeCommand`

に依存するため、最初から純粋関数として扱わない。

## 2. bob-bazaar-review

### 現状

`src/extension.ts` は単体では極端に巨大ではないが、複数責務が混在している。

主な混在:

- VS Code command 登録
- workflow-register action provider 登録
- project rules 読み込み
- Bazaar revision / range / working tree packet 生成
- Bob context 追加 / clipboard / save dialog
- review-result JSON 検証

### 実施済みの分割

副作用が比較的小さい workflow-register bridge と workflow action input helper を分離した。

```text
src/workflowRegisterBridge.ts
```

移動済み:

- `WORKFLOW_REGISTER_EXTENSION_ID`
- `WorkflowActionExecutionInput`
- `WorkflowActionProvider`
- `WorkflowRegisterApi`
- `getWorkflowRegisterApi`
- `isWorkflowRegisterExtensionAvailable`
- `firstStringArg`
- `initialTargetFromWorkflowInputs`
- `stringInput`
- `captureOptionsFromCommandArgs`
- workflow state から expected checklist count を読む private helper 群

これにより `extension.ts` は「command 登録」「レビュー packet 作成」「UI 表示」「review-result 検証」に近づいた。

### 次に切る対象

#### `bazaarReviewCommands.ts`

含める候補:

- `reviewRevision`
- `reviewRange`
- `buildProjectRulesSectionForWorkspace`
- `makeBazaarClient`
- `getMaxDiffBytes`
- `getMaxAddedFileContentBytes`

ただし `showAndOfferBobContext` と VS Code UI 依存があるため、bridge 分離後に行う。

#### `reviewResultValidationCommand.ts`

含める候補:

- `validateActiveReviewResultJson`

これは依存が少なく、単独で切れる。

## 3. bob-code-consistency-review

### 現状

`src/extension.ts` は 700 行規模だったが、command option / prompt / path helper と review-input wizard を外へ出して約 500 行規模まで下げた。まだ traceability / review execution command が残っている。

主な混在:

- VS Code command 登録
- workflow provider registration 用 handler mapping
- workspace 初期化
- AI review-input draft 作成 / 適用
- traceability draft 作成 / 適用 / Webview / gate 検証
- accepted traceability item からの review-input 生成
- preprocess / Bob output capture / output validate / triage

### 実施済みの分割

```text
src/extensionCommandOptions.ts
```

移動済み:

- `notifyInfo`
- `notifyError`
- `requireBobWorkspaceRoot`
- `pickValue`
- `stringOrPrompt`
- `vcsOrPrompt`
- `changeTypeOption`
- `reviewFocusOption`
- `stringArrayOption`
- `splitCsv`
- `absolute`
- `optionalAbsolute`
- `stringOption`
- `booleanOption`
- `firstString`

```text
src/reviewInputWizard.ts
```

移動済み:

- `collectReviewInputDraft`
- `collectReviewMetadata`
- `pickArtifacts`
- `stripCandidateUiFields`

注意点:

- `requireBobWorkspaceRoot` は `resolveBobWorkspaceRoot` と VS Code UI に依存するため、純粋 helper ではない。
- `reviewInputWizard.ts` は QuickPick / InputBox 依存があるが、review-input 作成 UI に閉じている。

### 次に切る対象

#### `traceabilityCommands.ts`

含める候補:

- `runPrepareAiTraceabilityDraft`
- `runApplyAiTraceabilityDraft`
- `runValidateTraceabilityCatalog`
- `runCreateReviewInputFromTraceability`
- `runOpenTraceabilityPrep`

traceability 機能は増え続ける可能性が高いため、早めに `extension.ts` から外す。

#### `reviewInputCommands.ts`

含める候補:

- `runCreateReviewInput`
- `runPrepareAiReviewInputDraft`
- `runApplyAiReviewInputDraft`
- `runRepairReviewInput`
- `runExplainReviewInputDiagnostics`

#### `reviewExecutionCommands.ts`

含める候補:

- `runPreprocess`
- `runCaptureBobOutput`
- `runValidateOutput`
- `runTriage`

## 推奨実施順

1. `workflow-register`: `bobWorkflowRunner.ts` の低リスク helper 分離（実施済み）
2. `bob-code-consistency-review`: `extensionCommandOptions.ts` へ helper 呼び出し移行（実施済み）
3. `bob-bazaar-review`: `workflowRegisterBridge.ts` へ bridge / helper 呼び出し移行（実施済み）
4. `bob-code-consistency-review`: `reviewInputWizard.ts` へ wizard 移行（実施済み）
5. `bob-code-consistency-review`: traceability / review-input / execution commands を段階分割
6. `workflow-register`: `bobStepRuntime.ts`
7. `bob-bazaar-review`: Bazaar packet 生成 command / review-result validation command を分割

## AI が扱いやすい粒度の目安

| ファイル種別 | 目安 |
|---|---|
| VS Code activation / command registration | 100〜180行 |
| command handler群 | 150〜300行 |
| pure builder / formatter / parser | 100〜250行 |
| UI wizard | 150〜300行 |
| runtime state machine | 200〜350行、ただし1責務に限定 |
| 型定義 | 長くても許容。ただし機能領域別に分ける |

## AI に任せにくい作業

- VS Code command ID / package.json contributes の整合変更
- Bob extension public API の互換性変更
- workflow-register action provider ID の変更
- result handoff / guardrail / manual completion の挙動変更
- task snapshot 形式の変更
- traceability item の正式承認状態の変更

これらは分割 PR では変更せず、関数移動と import 変更に限定する。
