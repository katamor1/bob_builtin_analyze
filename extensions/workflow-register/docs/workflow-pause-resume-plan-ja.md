# workflow-register 中断・再開コントロール実装計画

## 1. 目的

業務時間終了、席外し、ネットワーク不安定、想定外に長い AI 実行などで、ワークフローが無人で進み続けることを防ぐ。

特に、次を満たすことを目的にする。

- 人間が明示的に「この run を止める」操作をできる。
- 停止要求後は、新しい step / 新しい AI 呼び出しを開始しない。
- 実行済み成果物、attempt 履歴、task snapshot は失わない。
- 再開時は `run.json` を正本として、次に実行すべき step から安全に再開する。
- Bob UI 内のチャット導線を優先しつつ、VS Code command / status bar / tree view でも操作できるようにする。

## 2. 用語整理

| 用語 | 意味 |
| --- | --- |
| pause request | 人間または自動制限により「停止してほしい」と要求された状態。実行中 step がすぐ止まるとは限らない。 |
| paused | Engine が checkpoint に到達し、次 step を開始せず停止した永続状態。 |
| resume | paused run を running に戻し、current step から再開する操作。 |
| hard cancel | 進行中の AI / command に cancellation を通知する best-effort 操作。provider が対応しない場合は即時停止できない。 |
| review gate | step 実行後の人間確認。`reviewing` 状態。pause とは別概念。 |

## 3. 設計方針

### 3.1 `reviewing` / `held` とは分離する

既存の `reviewing` は step 実行後の人間確認である。`held` は manual step / manual completion 待ちである。中断・再開は安全停止なので、`paused` として別 status にする。

```ts
export type RunStatus =
  | "running"
  | "pausing"   // 任意: 実行中 step の終了待ち表示用
  | "paused"
  | "reviewing"
  | "held"
  | "completed"
  | "failed"
```

最小実装では `pausing` は必須ではない。UI 表示の分かりやすさを優先する場合だけ追加する。

### 3.2 最初に保証する範囲

まず保証するのは **「停止要求後に次の step / 次の AI 呼び出しを開始しない」** である。

実行中の AI 呼び出しを即時停止できるかは Bob / agent provider / VS Code command 側の cancellation 対応に依存するため、Phase 1 では best-effort とする。

### 3.3 永続化は `run.json` と別の control file に分ける

実行中の Engine と UI command が同時に `run.json` を更新すると、atomic write でも後勝ち上書きが起きる可能性がある。

そのため pause request は次の control file に保存する。

```text
<workflowRoot>/.bob/workflows/runs/<runId>/control.json
```

例:

```json
{
  "schemaVersion": "workflow-register/run-control/v1",
  "runId": "20260703T...-code-consistency-review",
  "pauseRequestedAt": "2026-07-03T09:30:00.000Z",
  "pauseReason": "end-of-business-day",
  "requestedBy": "user",
  "mode": "afterCurrentStep"
}
```

Engine は checkpoint ごとに `control.json` を読む。`run.json` は Engine が正本として更新し、UI は control request を置くだけにする。

## 4. ユーザー操作設計

### 4.1 コマンド

追加する VS Code command:

| Command ID | 用途 |
| --- | --- |
| `workflowRegister.pauseCurrentRun` | 最新または選択 run に pause request を出す。 |
| `workflowRegister.pauseAfterCurrentStep` | 実行中 step の完了後に pause。既定モード。 |
| `workflowRegister.pauseBeforeNextAiCall` | 次の AI 呼び出し前に pause。checkpoint として before agent step を強制確認する。 |
| `workflowRegister.resumePausedRun` | paused run を再開する。 |
| `workflowRegister.cancelCurrentStepBestEffort` | 実行中 AI / command に cancellation を通知する。provider 対応時のみ有効。 |
| `workflowRegister.inspectRunControl` | pause request / paused 状態 / 自動停止理由を表示する。 |

既存の `workflowRegister.resumeRun` は `paused` を受け付けるように拡張してもよい。ただし UX としては `resumePausedRun` を別名で追加する。

### 4.2 Bob UI チャット内の導線

Bob API が chat message 内の command link / markdown link を許容する場合は、step 開始時と review-required 時に次のような control block を送る。

```md
Workflow controls:
- Pause after current step: command:workflowRegister.pauseAfterCurrentStep?<encoded runId>
- Inspect current step: command:workflowRegister.inspectCurrentStep?<encoded runId>
- Open current step in Builder: command:workflowRegister.openCurrentStepInBuilder?<encoded runId>
```

Bob chat が command link を実行しない場合でも、同じ内容をテキストとして表示し、Command Palette から同名 command を実行できるようにする。

### 4.3 VS Code 外側 UI

チャット内ボタンが難しい場合に備え、以下を実装する。

- Status Bar item: `Workflow: running / paused / reviewing`
- QuickPick: run 一覧から pause / resume / inspect
- Tree View: `Workflow Runs` に run 状態、currentStep、pause request を表示

Phase 1 は Command Palette + QuickPick、Phase 2 で Status Bar、Phase 3 で Tree View とする。

## 5. Engine checkpoint 設計

### 5.1 checkpoint 位置

`WorkflowEngine.continueRun()` に次の checkpoint を追加する。

1. workflow 開始直後、preflight 前
2. step 開始直前
3. agent step 実行直前
4. command step 実行直前
5. step 成功直後、次 step へ進む前
6. review accept 後、次 step へ進む前

### 5.2 checkpoint 動作

pause request が存在する場合:

- 現在 step がまだ開始前なら、その step は `pending` のままにする。
- 直前 step が完了済みなら、その step は `completed` のままにする。
- `run.status = "paused"`
- `run.currentStep = 次に実行すべき step id`
- `run.state["workflow.pause"]` に理由、時刻、mode を保存する。
- `onRunPaused` hook を発火する。

再開時:

- `control.json` の pause request を clear する。
- `run.status = "running"`
- `run.currentStep` から `continueRun()` を再開する。

## 6. 自動停止・コスト抑制

### 6.1 workflow 定義

`WORKFLOW.md` に `runControl` を追加する。

```yaml
runControl:
  pause:
    enabled: true
    defaultMode: afterCurrentStep
    showChatControls: true
  limits:
    maxRunMinutes: 45
    maxAgentStepsPerRun: 6
    pauseAtLocalTime: "18:00"
    timezone: "Asia/Tokyo"
```

### 6.2 VS Code settings

全 workflow 共通の上限として設定も追加する。

```json
{
  "workflowRegister.runControl.enabled": true,
  "workflowRegister.runControl.maxRunMinutes": 60,
  "workflowRegister.runControl.pauseAtLocalTime": "18:00",
  "workflowRegister.runControl.timezone": "Asia/Tokyo",
  "workflowRegister.runControl.showStatusBar": true
}
```

workflow 側と settings 側の両方がある場合は、より厳しい値を採用する。

### 6.3 自動 pause の判定

Engine checkpoint で次を判定する。

- 現在時刻が `pauseAtLocalTime` を超えている。
- run 開始から `maxRunMinutes` を超えている。
- agent step 実行回数が `maxAgentStepsPerRun` を超える。
- `control.json` に pause request がある。

該当した場合、次 step / 次 AI call を開始せず paused にする。

## 7. 変更対象ファイル

### 7.1 core model

`src/core/model.ts`

- `RunStatus` に `paused` を追加する。
- 必要なら `pausing` を追加する。
- `WorkflowRunControlDefinition` を追加する。
- `CoreWorkflowDefinition` に `runControl` を追加する。
- `WorkflowRunState` に `pausedAt`, `pauseReason` は直接持たせず、まずは `state["workflow.pause"]` に入れる。

### 7.2 schema / parser

`src/core/workflowSchema.ts`

- `runControl.pause.enabled`
- `runControl.pause.defaultMode`
- `runControl.pause.showChatControls`
- `runControl.limits.maxRunMinutes`
- `runControl.limits.maxAgentStepsPerRun`
- `runControl.limits.pauseAtLocalTime`
- `runControl.limits.timezone`

を schema に追加する。

`src/core/parser.ts`

- `runControl` を normalize して `CoreWorkflowDefinition` に入れる。
- 未指定時は安全寄りの default を設定する。

### 7.3 run control store

新規ファイル:

```text
src/core/runControlStore.ts
```

責務:

- `requestPause(runId, reason, mode)`
- `clearPause(runId)`
- `loadControl(runId)`
- `isPauseRequested(runId)`

保存先:

```text
.bob/workflows/runs/<runId>/control.json
```

### 7.4 engine

`src/core/engine.ts`

- `WorkflowEngineOptions` に `runControlStore` と `clock` を追加する。
- `continueRun()` の before/after step に checkpoint を追加する。
- `executeStep()` の agent / command 直前に checkpoint を追加する。
- `resumeRun()` は `paused` を受け入れる。
- `findRecoverableRun()` の recoverable status に `paused` を追加する。
- `WorkflowExecutionHooks` に `onRunPaused` / `onPauseRequested` を追加する。

### 7.5 commands

新規または `commands/stepReview.ts` を分割して追加:

```text
src/commands/runControl.ts
```

追加 command:

- `pauseCurrentRun`
- `pauseAfterCurrentStep`
- `pauseBeforeNextAiCall`
- `resumePausedRun`
- `cancelCurrentStepBestEffort`
- `inspectRunControl`

### 7.6 Bob UI message

既存の Bob UI hook に control block を追加する。

- `onWorkflowStart`
- `onStepStart`
- `onStepReviewRequired`
- `onStepHeld`

message は command link が使える環境では link、使えない環境では command ID と run ID のテキストを表示する。

### 7.7 package.json

- activationEvents に command を追加する。
- contributes.commands に title を追加する。
- configuration に runControl settings を追加する。

### 7.8 diagnostics

`src/core/runDiagnostics.ts`

- `paused` run 数を summary に追加する。
- pause request / pause reason / pauseAt を表示する。
- `workflow.pause` state を読みやすく整形する。

## 8. 実装フェーズ

### Phase 1: 手動 pause / resume の最小実装

目的: 業務時間終了時に、次 step / 次 AI call を始めない。

実装:

1. `RunStatus` に `paused` を追加。
2. `runControlStore.ts` を追加。
3. `pauseAfterCurrentStep` / `resumePausedRun` / `inspectRunControl` を追加。
4. Engine に before step / after step checkpoint を追加。
5. `findRecoverableRun()` に `paused` を追加。
6. diagnostics に paused / pause reason を表示。

完了条件:

- 実行中 run に pause request を出せる。
- 現 step 完了後に run が `paused` になる。
- `resumePausedRun` で同じ runId から再開できる。
- `run.json` と `control.json` だけで VS Code 再起動後も復帰できる。

### Phase 2: Bob UI チャット内 control block

目的: Command Palette を開かず、Bob の会話中に停止操作を見つけられるようにする。

実装:

1. `bobWorkflowMessages.ts` または既存 message builder に `buildWorkflowControlBlock()` を追加。
2. `onStepStart` / `onStepReviewRequired` で control block を送る。
3. command URI link が使えない場合の fallback text を用意する。
4. `taskSnapshots` に `pause-requested` / `paused` reason を追加する。

完了条件:

- Bob chat に runId 付きの pause / inspect / open builder 導線が表示される。
- link 実行不可環境でも Command Palette から操作できる。

### Phase 3: 自動停止制限

目的: 無人実行のコスト上限を workflow / workspace 単位で制御する。

実装:

1. `runControl` schema / parser / authoring model / serializer を追加。
2. VS Code settings に `workflowRegister.runControl.*` を追加。
3. checkpoint で maxRunMinutes / pauseAtLocalTime / maxAgentStepsPerRun を判定する。
4. diagnostics に自動停止理由を表示する。

完了条件:

- 18:00 を超えた run が次 AI call 前に paused になる。
- agent step 数上限を超えた run が paused になる。
- workflow 個別設定と workspace 設定のうち厳しい値が使われる。

### Phase 4: best-effort hard cancel

目的: provider が対応している場合に、実行中 AI / command へ cancellation を通知する。

実装:

1. `AgentExecutionInput` に `cancellationToken` 相当を追加するか、`WorkflowEngineOptions` に abort controller provider を追加する。
2. command action provider に cancellation 対応 API を追加する。
3. Bob `task.startSubagent()` が cancel を受けられない場合は、Bob UI へ「現在の応答終了後に停止します」と表示する。
4. hard cancel 失敗時も pause request は残し、次 checkpoint で paused にする。

完了条件:

- 対応 provider では実行中 step を中断できる。
- 非対応 provider では明確に best-effort と表示され、次 step へは進まない。

### Phase 5: Status Bar / Tree View

目的: チャット外でも run 状態を一目で確認し、停止・再開できるようにする。

実装:

1. Status Bar item で最新 run 状態を表示。
2. クリックで pause / resume / inspect の QuickPick を出す。
3. Tree View `Workflow Runs` を追加し、running / paused / reviewing / failed を一覧表示する。

完了条件:

- Bob chat を見ていなくても無人実行中 run に気づける。
- running run を 2 click 程度で pause request できる。

## 9. テスト計画

### Unit test

- pause request がない場合、既存 workflow は従来通り進む。
- before step checkpoint で pause request がある場合、step は pending のまま `paused` になる。
- after step checkpoint で pause request がある場合、直前 step は completed、次 step が currentStep になる。
- paused run を resume すると currentStep から再開する。
- paused run が recoverable run として選ばれる。
- pauseAtLocalTime / maxRunMinutes / maxAgentStepsPerRun が正しく判定される。

### Integration test

- Bob UI 実行中に pause request を出し、次 step に進まないこと。
- review-required 中に pause request を出しても、accept 後に次 step が始まらず paused になること。
- VS Code 再起動後、paused run を再開できること。
- command link が使えない場合でも Command Palette で同じ操作ができること。

## 10. リスクと対策

| リスク | 対策 |
| --- | --- |
| 実行中 AI 呼び出しを即時停止できない | Phase 1 では「次 AI call を始めない」を保証し、hard cancel は Phase 4 の best-effort に分離する。 |
| run.json の同時更新で pause request が消える | pause request は `control.json` に分離する。 |
| `held` / `reviewing` / `paused` の意味が混ざる | `paused` を安全停止専用 status として追加する。 |
| Bob chat 内ボタンが環境依存 | Command Palette / Status Bar / Tree View を fallback とする。 |
| 自動停止時刻の timezone 問題 | workflow / settings に timezone を明示し、未指定時は VS Code 環境の timezone を使う。 |
| resume 後に古い定義で危険な再開をする | 既存の workflowDefinitionHash / step id order 検査を再利用し、危険な変更は止める。 |

## 11. 推奨する初回実装スコープ

最初の PR では次だけを入れる。

- `paused` RunStatus
- `runControlStore.ts`
- `pauseAfterCurrentStep`
- `resumePausedRun`
- Engine checkpoint: before step / after step
- diagnostics 表示
- package.json command 登録

この範囲なら、実行中 AI を無理に kill せず、コスト暴走の主要因である「次々に step が進む」問題を止められる。

Bob chat 内ボタン、自動停止時刻、hard cancel は後続 PR に分ける。
