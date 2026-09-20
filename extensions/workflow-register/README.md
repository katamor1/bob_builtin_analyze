# Bob Workflow Register（Bob ワークフロー管理）

`workflow-register`は、workspace内の`.bob/workflows/*/WORKFLOW.md`を読み込み、IBM BobのWorkflow UI、standalone実行、作成・編集、診断、再開、成果物管理へ接続するVS Code拡張機能です。

実行状態の正本は`run.json`です。Bob Todo、chat message、panel表示はprojectionであり、永続状態の代替ではありません。

## 公開入口

Command Paletteに常時表示する入口は次の2件だけです。

| 表示名 | Command ID | 開く画面 |
| --- | --- | --- |
| `Bob: 操作ハブを開く` | `workflowRegister.openOperationHub` | view type `workflowRegisterOperationHub`、title `Bob 操作ハブ` |
| `Bob Workflow: ワークフローを作成・編集` | `workflowRegister.openWorkflowBuilder` | view type `workflowRegisterBuilder`、title `ワークフロー作成・編集` |

登録済みのworkflow実行、検証、run操作、template、AI補助commandは内部・workflow連携用として維持しますが、`menus.commandPalette`では`when: "false"`です。

## mainとsoft dependency

`package.json`の`main`は`./out/extensionWithAuthoring.js`です。

- IBM Bob 拡張: `IBM.bob-code`（Bob UI 登録時のみ必須）はsoft dependencyです。Bob task実行連携を使う場合にも利用します。
- IBM Bobがない場合も、authoring / validation / standalone workflow execution は利用でき、workflow作成・編集とrun inspectionも継続できます。
- `bob-bazaar-review`と`bob-code-consistency-review`もoptional integrationです。
- optional extensionがない場合、`Bob 操作ハブ`はcommand not found例外に頼らず、操作を無効化して理由を表示します。

## Bob バージョン互換性

Bob UI連携は`IBM.bob-code`の正式版`>=2.0.0 <3.0.0`を許可します。`2.1.0+build.42`のようなビルドメタデータ付き正式版も対象です。beta / rc、1.x / 3.x、不完全なバージョンや`v2.1.0`などの非正規表記は拒否します。バージョンが範囲内でも、必須APIが不足する場合は登録または実行を停止して理由を表示します。

workflow taskの標準必須APIは`getAllMetadata`、`getMessages`、`sendMessage`、`setStepComplete`、`startSubagent`です。Bob 2.1.0のworkflow taskが公開しない`toSerializable`は任意とし、存在しなくてもmetadata / messagesからsnapshotを保存できます。契約が明示的に要求する場合は存在検査を維持します。

既存の`bob/2.0.1`プロファイルとdigest、ロック形式は保存互換性の基準として保持します。これは実行中のBobバージョンを意味しません。診断には実バージョンと対応範囲を別に表示します。既存ロックの再生成・移行は不要です。

## Bob 操作ハブ

`Bob 操作ハブ`はworkflow運用の単一panelです。Explorerの重複viewや別のrun status UIはありません。

主な表示・操作:

- workspaceと`.bob` setup状態
- workflow catalog
- run一覧、status、current step
- resume、retry、accept、accept-and-next、run-next
- pause、run control inspection
- detached held run recovery
- artifact inspectionとartifact reuse
- task snapshotからのartifact import
- diagnostics
- run storage / retention previewと手動cleanup
- optional review extensionへの入口

run cardのmutationはworkspace root、run ID、表示時revisionを再検証し、同じrunへの操作を直列化します。`run.json`、`control.json`、artifact manifestのwatcherでpanelを更新します。

## ワークフロー作成・編集

`ワークフロー作成・編集`は単一panelで次の3モードを扱います。

1. 空のworkflowから作成
2. `標準テンプレートから作成`
3. 既存workflowを編集

標準テンプレートから作成する場合も、生成結果はin-memory Builder modelへ入り、通常のPreview / Diagnostics / Diff / 明示確認 / backup / transactional saveを通ります。直接ファイルを書いて安全確認を迂回しません。

`テンプレート調整`は別panelではなく、Builder内で標準templateを選択・編集し、同じ保存契約へ渡す操作です。

保存契約:

1. authoring modelをMarkdownへserializeする。
2. parserとvalidatorで検証する。
3. current file expectationを再検証する。
4. diffを表示する。
5. 利用者の明示確認を求める。
6. 既存fileがあれば一意なbackupを作る。
7. transaction lock内でatomic saveする。
8. `workflowRegister.reload`を実行する。

cancel時は既存fileとbackupを変更しません。別sessionやstale completionが現在の編集内容を上書きしないよう、session token、generation、render tokenを検証します。

## workflowの配置と探索

各resolved Bob rootから見た相対pathを探索します。

```text
<Bob root>/.bob/workflows/<workflow-name>/WORKFLOW.md
```

探索pattern:

```text
.bob/workflows/*/WORKFLOW.md
```

multi-root workspaceでは、direct candidate、child candidate、fallback candidateを解決し、rootごとにworkflowを読み込みます。同じlogical workflow IDが複数rootにある場合はroot情報を使って一意化します。

## 最小workflow

新規workflowでは`schemaVersion: workflow-register/v1`を推奨します。

```md
---
schemaVersion: workflow-register/v1
name: sample-review
description: サンプル対象をレビューする
title: サンプルレビュー
workspaceRequired: true
steps:
  - id: analyze
    title: 分析
    type: agent
    prompt: |
      対象を確認し、結果を日本語で要約してください。
---
# サンプルレビュー
```

主なtop-level field:

| field | 用途 |
| --- | --- |
| `schemaVersion` | 推奨値`workflow-register/v1` |
| `name` / `description` | 安定IDと説明 |
| `title` / `label` / `menuLabel` | 表示名 |
| `inputs` | string / number / boolean / select入力 |
| `requires` / `preflight` | 実行条件 |
| `guardrails` | command許可・拒否・approval |
| `stepExecution` | full / todo / engineSteps表示と順序 |
| `stepReview` | step後のreviewing停止、accept、retry |
| `runControl` | 自動pause制限 |
| `branching` | next / goto / end / fail / checkpoint |
| `artifacts` | 生成artifact宣言 |
| `completion` | 完了summaryとartifact表示 |
| `steps` | command / agent / manual / result step |

## step種別

| type | 用途 |
| --- | --- |
| `command` | action providerまたはVS Code commandを実行する |
| `agent` | Bob taskまたはagent providerへpromptを渡す |
| `manual` | 人間の入力・承認・確認を待つ |
| `result` | state / literal / agent結果をsinkへ渡す |

`includeState`、manual `form.resultKey`、manual `approval.resultKey`、artifact `producedBy`はproducerの存在と順序を検証します。

現行実装では`src/bobStepRuntime.ts`がBob UI実行用の`StepRuntime`を提供します。`StepRuntime`はheld/manual stepの一覧と選択、run / step期待値の照合、form・approval入力とstate keyの検証、result handoff、Bob task完了と待機中stepの解決を担当します。

## 実行状態

```text
<workflowRoot>/.bob/workflows/runs/<runId>/run.json
```

`run.json`は次を保持します。

- workflow ID、definition hash、workflow file
- inputsとstate
- step status、attempts、current step
- run statusとerror
- timestamps
- branch loop / checkpoint / transition history
- artifact reuse、hydration、task snapshot import provenance

主なstatus:

```text
running
paused
checkpoint
reviewing
held
failed
completed
```

保存は同一directoryのtemp fileとrenameを使います。workspace containment、symlink / junction、identity、lockを検証します。

## pause / resume

操作者制御は次へ保存します。

```text
<workflowRoot>/.bob/workflows/runs/<runId>/control.json
```

- manual pause request
- after-current-step pause
- before-next-AI-call intent
- automatic pause override
- resume note

engineは安全なcheckpointでpauseを評価します。実行中のagent / command / processを強制停止しません。manual requestを先に評価し、その後にrun time、agent count、local cutoff timeを評価します。

## task snapshot

Bob taskの補助証跡は次へ保存します。

```text
<workflowRoot>/.bob/workflows/runs/<runId>/task-snapshots/*.json
<workflowRoot>/.bob/workflows/runs/<runId>/task-snapshots/latest.json
```

snapshotは`run.json`の代替ではありません。handoff失敗調査、last assistant textの復旧候補、artifact import previewに使います。

既定ではchat messagesを保存しません。保存size、件数、pruningを設定で制御し、上限超過時は任意fieldから削減します。必須metadataだけでも上限へ収まらない場合は保存を拒否します。

## artifact reuseと途中開始

artifact manifestを検証し、前段stateを復元して指定stepから新しいrunを開始できます。

- checksumとbyte数を検証する。
- workflow definition、inputs、producing step、state keyを照合する。
- reuseしたstepは`completed` statusを維持し、別の`Reused` provenanceとして表示する。
- Bob Todoへ新しいstatusを追加しない。
- Task Snapshot importはpreviewとdigestを再計算し、選択したartifactだけをtransactionで適用する。

## detached held recovery

VS Code / IBM Bob再起動後にlive task handleを失ったheld runは、自動完了しません。

`Bob 操作ハブ`は次へ分類します。

- connected
- detached / resumable
- artifact recoverable
- blocked

保存済み状態からの復旧は、trust、definition、step順序、必要state、revision、execution leaseを再検証し、modal confirmation後に実行します。

## run retention

手動cleanupは次のpolicyを使います。

- `completedDays`
- `maxCompletedRuns`
- `maxTotalBytes`
- pin sidecar
- active / recoverable run保護
- artifact reuse / hydration / snapshot import参照保護
- physical path / identity / lock / journal保護

previewとapplyは同じplannerを使い、digestとevidence revisionの一致を要求します。cleanupはlease、owner guard、quarantine transactionを使います。startup / timer / backgroundによる自動削除は行いません。

## 公開API

`activate()`は`WorkflowRegisterApi`を返します。

```ts
registerActionProvider(provider)
registerAgentProvider(provider)
registerResultSink(type, handler)
listWorkflows()
runWorkflow(workflowId?, inputs?)
runWorkflowStep(workflowId?, stepId?, inputs?)
startFromStepWithArtifacts(workflowId?, stepId?, sourceRunId?, inputs?)
importArtifactsFromTaskSnapshots(runId?)
runNextStep(runId?)
approveBranchCheckpoint(runId?)
abortBranchCheckpoint(runId?)
inspectBranching(runId?)
```

provider registrationは所有元を持ち、別ownerによる無警告上書きを拒否します。登録解除用disposableを返します。

## 内部・workflow連携用command

次の系統は登録を維持しますが、通常operatorは`Bob 操作ハブ`または`ワークフロー作成・編集`を使います。

- workflow reload / inspect / validate
- standalone run / step / next-step
- resume / retry / accept / pause / branching
- manual-step completion
- diagnostics
- artifact reuse / snapshot import
- retention inspection / preview / cleanup / pin
- template validation / generation / readiness
- process workflow helper
- AI design / improve / diagnostics explanation

Command ID、provider ID、sink type、artifact schema、`run.json` contractは互換性境界として維持します。

## 設定

| 設定 | 既定値 | 用途 |
| --- | ---: | --- |
| `workflowRegister.sourceId` | `workflow-register` | Bob登録元ID |
| `workflowRegister.sourceName` | `ワークフロー登録` | Bob表示名 |
| `workflowRegister.agentCommand` | 空 | standalone agent command |
| `workflowRegister.aiProviderCommand` | 空 | authoring AI provider command |
| `workflowRegister.taskSnapshots.enabled` | `true` | snapshot保存 |
| `workflowRegister.taskSnapshots.maxBytes` | `262144` | 1件の上限 |
| `workflowRegister.taskSnapshots.maxPerRun` | `50` | runごとの件数 |
| `workflowRegister.taskSnapshots.includeMessages` | `false` | chat message本文を含めるか |
| `workflowRegister.taskSnapshots.pruneOnSave` | `true` | 保存時prune |
| `workflowRegister.runControl.maxRunMinutes` | `0` | 自動pause時間上限 |
| `workflowRegister.runControl.maxAgentStepsPerRun` | `0` | agent呼出し上限 |
| `workflowRegister.runControl.pauseAtLocalTime` | 空 | local cutoff |
| `workflowRegister.runControl.timezone` | `Asia/Tokyo` | cutoff timezone |
| `workflowRegister.runs.retention.enabled` | `false` | 将来の自動cleanup用予約値 |
| `workflowRegister.runs.retention.completedDays` | `30` | 手動cleanup候補日数 |
| `workflowRegister.runs.retention.maxCompletedRuns` | `100` | 終了run保持目安 |
| `workflowRegister.runs.retention.maxTotalBytes` | `524288000` | 保存容量目安 |

既定では Bob chat messages を含めません。必要な場合だけ`workflowRegister.taskSnapshots.includeMessages`を明示的に`true`へ変更します。

`workflowRegister.runs.retention.*`は現行設定です。廃止済みview IDと混同してrenameしません。

## ビルドと検証

```bash
npm ci
npm run compile
npm run dependency:policy
npm run architecture:policy
npm run source:policy
npm run schema:policy
npm run unused:report
npm test
npm run package
npm run package:policy
```

repository contract:

```bash
node --test \
  scripts/three-extension-command-surface.test.js \
  scripts/three-extension-documentation-contract.test.js \
  scripts/extension-host-smoke-contract.test.js
```

Ubuntu / WindowsのExtension Host gateは、activation、2つの公開command、代表hidden command、2つのpanel、unhandled rejection不在を同一SHAで確認します。

## 保守・配布ポリシー

### 生成物

主な生成物はワークスペース内の`.bob/workflows`と`.bob/workflows/runs`です。`.bob/workflows/*/WORKFLOW.md`はワークフロー定義、`.bob/workflows/runs/<runId>/run.json`はstandalone実行状態、task snapshotはBob UI実行時の復旧・診断用データです。利用者の要求・設計・レビュー内容が含まれる場合があるため、共有前に内容を確認してください。

### VSIX サイズ

`npm run package:policy`はVSIX サイズの上限を`1200000` bytesとして確認します。配布前は`npm run package`と`npm run package:policy`を続けて実行してください。`out/**/*.map`と開発用の`docs/**`はVSIXに同梱しません。

### 暗黙依存

`IBM.bob-code`はBob UIへworkflow sourceを登録する場合だけ必要です。authoring、validation、standalone実行、診断は`IBM.bob-code`なしで動作します。連携先が未導入の環境では、Bob UI登録ではなくstandalone commandを使ってください。

### 必要 CLI

開発と検証にはNode.jsとnpmが必要です。CIと同じ入口は次です。

```powershell
npm ci
npm run dependency:policy
npm run architecture:policy
npm run unused:report
npm run audit:prod
npm test
npm run package
npm run package:policy
```

### Trusted Workspace

ワークフロー定義、実行状態、task snapshotは開いているworkspaceの`.bob`配下だけを対象にします。信頼できないworkspaceでは、外部コマンドを実行するcommand step、result sink、AI provider commandの利用範囲を確認してから実行してください。

Run retentionでは、`inspectRunStorage`と`previewRunCleanup`だけがuntrusted workspaceでread-only利用可能です。`cleanupCompletedRuns`、`deleteSelectedRuns`、`pinRun`、`unpinRun`はtrustが確立するまでroot discovery、run selection、service construction、filesystem accessを開始しません。

## セキュリティとprivacy

- command stepは登録済みprovider / allowlistを使う。
- file sinkはworkspace外pathを拒否する。
- temp、backup、rename、lockはphysical path identityを検証する。
- snapshot、diagnostics、retention reportへBob message本文やartifact本文を既定で出さない。
- run mutationはcurrent revisionを再検証する。
- WebviewはCSP nonce、render token、action allowlistを使う。
- Bob task object、Promise、callbackを永続化しない。
