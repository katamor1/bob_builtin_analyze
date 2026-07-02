# 3拡張機能の責務分割見直し（基準: 54e1fe58）

基準コミット: `54e1fe58b47c9469dbcaba9d2af5aded3ff1083f`

この文書は、`bob_builtin_analyze` に含まれる主要3拡張機能について、中程度以下のAIが安全に読み書きしやすい単位へ分割する観点で見直した結果をまとめる。

## 対象拡張

| 拡張 | 主な役割 | 現状評価 |
|---|---|---|
| `extensions/workflow-register` | `.bob/workflows/*/WORKFLOW.md` の登録、実行、step review、Bob連携 | parser / engine / reports / Bob API helper は分割済み。次は `bobWorkflowRunner.ts` が主対象 |
| `extensions/bob-bazaar-review` | Bazaar差分・リビジョン範囲からレビューpacketを作成しBobへ渡す | `extension.ts` に workflow-register bridge、GUI command、packet作成、project rules、Bob context連携が同居 |
| `extensions/bob-code-consistency-review` | 要求・設計・テスト仕様とコード変更の整合プレレビュー用input/preprocess/output検証 | `extension.ts` がコマンド登録・入力収集・AI draft・traceability・preprocess・triageの入口をすべて持つ |

## 1. workflow-register

### 現状

`parser.ts` は facade 化され、実体は `core/parser/` 配下に分割済み。`engine.ts` も `engine/preflight.ts`、`engine/runState.ts`、`engine/templateRenderer.ts` へ helper が分離済み。

次に大きい責務は `src/bobWorkflowRunner.ts` に残っている。

### 実施済みの分割方針

PR #30 で以下を切り出した。

- `bobWorkflowMessages.ts`
  - Bob workflow開始/step継続/command result/state blockのメッセージ生成
- `bobTaskInputs.ts`
  - Bob task metadata / message から workflow input を抽出
- `taskSnapshotRecovery.ts`
  - task snapshot から最新 assistant text を復元
- `bobWorkflowFactory.ts`
  - Bob workflow object / step array の構築

### 次に切る対象

`StepRuntime` は VS Code UI、result handoff、guardrail、active step state に触るため、次PRで単独分離する。

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

`src/extension.ts` は約500行弱で、単体では極端に巨大ではない。ただし複数責務が混在している。

主な混在:

- VS Code command登録
- workflow-register action provider 登録
- workflow action input の解釈
- project rules読み込み
- Bazaar revision/range packet生成
- Bob context 追加/clipboard/save dialog
- review result JSON検証

### 最初に切るべき対象

副作用が比較的小さい workflow-register bridge と workflow input helper を分離する。

推奨ファイル:

```text
src/workflowRegisterBridge.ts
```

含める候補:

- `WorkflowActionExecutionInput`
- `WorkflowActionProvider`
- `WorkflowRegisterApi`
- `getWorkflowRegisterApi`
- `isWorkflowRegisterExtensionAvailable`
- `firstStringArg`
- `initialTargetFromWorkflowInputs`
- `targetMode`
- `stringInput`
- `captureOptionsFromCommandArgs`
- `recordStringMap`
- `recordInput`
- `expectedChecklistItemsFromState`
- `parseStateObject`

これにより `extension.ts` は「command登録」「レビューpacket作成」「UI表示」に近づく。

### 次に切る対象

#### `bazaarReviewCommands.ts`

含める候補:

- `reviewRevision`
- `reviewRange`
- `buildProjectRulesSectionForWorkspace`
- `makeBazaarClient`
- `getMaxDiffBytes`
- `getMaxAddedFileContentBytes`

ただし `showAndOfferBobContext` と VS Code UI 依存があるため、bridge分離後に行う。

#### `reviewResultValidationCommand.ts`

含める候補:

- `validateActiveReviewResultJson`

これは依存が少なく、単独で切れる。

## 3. bob-code-consistency-review

### 現状

`src/extension.ts` は700行規模で、3拡張の中で最も優先度が高い。コマンド登録自体は明快だが、個別command handlerと入力補助が同居している。

主な混在:

- VS Code command登録
- workflow provider registration用handler mapping
- workspace初期化
- review-input生成 wizard
- AI review-input draft作成/適用
- traceability draft作成/適用/検証
- preprocess / Bob output capture / output validate / triage
- command option parser / path helper / prompt helper / notification helper

### 最初に切るべき対象

#### `extensionCommandOptions.ts`

副作用は小さく、複数command handlerから横断利用される。

含める候補:

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

注意点:

- `requireBobWorkspaceRoot` は `resolveBobWorkspaceRoot` と VS Code UI に依存するため、純粋helperとは分けて扱うか、`extensionCommandOptions.ts` に VS Code依存ありと明記する。
- `vcsOrPrompt` / `changeTypeOption` / `reviewFocusOption` は `reviewInputBuilder` の enum values に依存する。

### 次に切る対象

#### `reviewInputWizard.ts`

含める候補:

- `collectReviewInputDraft`
- `pickArtifacts`
- `stripCandidateUiFields`
- `collectReviewMetadata`

この単位は UI QuickPick/InputBox 依存があるが、review-input作成に閉じている。

#### `traceabilityCommands.ts`

含める候補:

- `runPrepareAiTraceabilityDraft`
- `runApplyAiTraceabilityDraft`
- `runValidateTraceabilityCatalog`
- `runCreateReviewInputFromTraceability`
- `runOpenTraceabilityPrep`

traceability機能は増え続ける可能性が高いため、早めに `extension.ts` から外す。

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

1. `workflow-register`: `bobWorkflowRunner.ts` の低リスクhelper分離（PR #30）
2. `bob-code-consistency-review`: `extensionCommandOptions.ts` + `reviewInputWizard.ts`
3. `bob-bazaar-review`: `workflowRegisterBridge.ts`
4. `bob-code-consistency-review`: traceability / review-input / execution commands を段階分割
5. `workflow-register`: `bobStepRuntime.ts`
6. `bob-bazaar-review`: Bazaar packet生成 command / review result validation command を分割

## AIが扱いやすい粒度の目安

| ファイル種別 | 目安 |
|---|---|
| VS Code activation / command registration | 100〜180行 |
| command handler群 | 150〜300行 |
| pure builder / formatter / parser | 100〜250行 |
| UI wizard | 150〜300行 |
| runtime state machine | 200〜350行、ただし1責務に限定 |
| 型定義 | 長くても許容。ただし機能領域別に分ける |

## AIに任せにくい作業

- VS Code command ID / package.json contributes の整合変更
- Bob extension public API の互換性変更
- workflow-register action provider ID の変更
- result handoff / guardrail / manual completion の挙動変更
- task snapshot形式の変更

これらは分割PRでは変更せず、関数移動と import 変更に限定する。
