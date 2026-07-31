# Bob 3拡張機能構成 評価・判断ドキュメント

- 対象repository: `katamor1/bob_builtin_analyze`
- 対象directory: `extensions/`
- 対象拡張:
  - `workflow-register`
  - `bob-bazaar-review`
  - `bob-code-consistency-review`
- 初版: 2026-07-04
- 現行surface同期: 2026-07-23

## 1. 結論

**ユーザー可視のVS Code拡張は3つのまま維持する。**

```text
workflow-register                 共通workflow基盤
bob-bazaar-review                Bazaar review domain
bob-code-consistency-review      コード・文書整合review domain
```

統合は単一VSIX化ではなく、次で行う。

1. action provider / result sink API
2. workflow / artifact schema
3. 5件の安定した公開Command Palette entry
4. single-panel operator route
5. 共通security / privacy / package policy
6. Linux / Windowsの同一SHA quality gate

3拡張の間に必須`extensionDependencies`は置かない。IBM Bobとcompanion extensionはsoft dependencyとして扱い、未導入時も各拡張のlocal機能とactivationを維持する。

## 2. 公開operator surface

常時表示するCommand Palette entryは次の5件だけである。

| job | Command ID |
| --- | --- |
| Bob操作ハブ | `workflowRegister.openOperationHub` |
| workflow作成・編集 | `workflowRegister.openWorkflowBuilder` |
| Bazaar review開始 | `bobBazaar.openReviewGui` |
| 資料からproject rules作成 | `bobBazaar.authorProjectRulesFromDocuments` |
| コード整合プレレビュー開始 | `bobCodeConsistency.openReviewWizard` |

この公開面はVSIXを3つに分けたままでも、一貫したoperator experienceを提供する。

- workflow runは`Bob 操作ハブ`へ集約する。
- workflow authoringは`ワークフロー作成・編集`へ集約する。
- Bazaar reviewの後段処理は1つの主GUIに集約する。
- Code Consistencyの後段処理も1つの`整合プレレビュー`主GUIに集約する。
- workflow / record / validation用commandは登録を維持するがCommand Paletteには表示しない。

## 3. 責務

| 拡張 | 主責務 | 主入力 | 主出力 | optional integration |
|---|---|---|---|---|
| `workflow-register` | workflow登録、作成・編集、実行、run state、再開、診断、artifact管理 | `.bob/workflows/*/WORKFLOW.md`、inputs、Bob task context | `.bob/workflows/runs/**`、diagnostics、result sink出力 | IBM Bob、Bazaar Review、Code Consistency |
| `bob-bazaar-review` | Bazaar packet、project rules、review-result、Review Run、decision、metrics、MCP | Bazaar repo、revision / range、`.bob/review/**` | packet、`.bob/review/results/**`、`.bob-review-records/**` | IBM Bob、workflow-register |
| `bob-code-consistency-review` | review-input、文書抽出、VCS差分、traceability、review-package、Bob output、decision | `review-input.yaml`、Git / Bazaar diff、docs、catalog | `.bob-review/**`、`.bob-trace/**` | IBM Bob、workflow-register |

### workflow-register

`workflow-register`は基盤であり、Bazaar固有処理や文書抽出処理を直接所有しない。

主なAPI:

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

### bob-bazaar-review

Bazaar CLI、revision / range、`--no-aliases`、review-result schema、Review Run、read-only MCPを所有する。workflow-registerへreview / rule-authoring providerを登録できるが、workflow-registerがなくてもlocal review serviceを利用できる。

### bob-code-consistency-review

文書抽出、Git / Bazaar差分、C / C++と汎用言語のコード根拠、sidecar traceability、review-package、Bob output validation、人間decisionを所有する。重いdomain pipelineを基盤拡張へ混ぜない。

## 4. 選択肢評価

| 選択肢 | 長所 | 短所 | 判定 |
|---|---|---|---|
| 3VSIXを維持 | 責務、依存、障害、release cycleを分離できる | build / package / version管理が3つ必要 | **採用** |
| 単一VSIXへ統合 | installは単純 | 基盤とdomainが密結合し、bundle / UI / audit /障害切分けが肥大化 | 非推奨 |
| さらに細かくVSIX分割 | 個々のmoduleは小さくなる | extension間API、導入順、互換性、test matrixが増える | 現時点では非推奨 |
| 3VSIX + shared package | helperの重複を抑えられる | shared APIとbundle管理が必要 | 条件付き採用 |
| extension pack | 導入を簡略化できる | private / local配布では効果が限定的 | 将来候補 |

## 5. 単一VSIXへ統合しない理由

### 5.1 基盤とdomainの変更頻度が異なる

workflow engine、run state、branching、artifact reuse、retentionは共通基盤として安定させる。一方、Bazaar reviewや文書整合reviewはdomain要件、schema、UAT、external toolに応じて変化する。

### 5.2 dependencyとpackage policyが異なる

Code Consistencyは文書抽出やschema validationのため比較的大きいdependencyを持つ。Bazaar ReviewはBazaar CLIとoptional PDF extractionを扱う。workflow-register利用者へ不要なdomain dependencyを同梱しない。

### 5.3 release gateをdomainごとに分けられる

- workflow-register: engine / run / authoring / retention
- Bazaar Review: Bazaar CLI / MCP / Review Run / rule authoring
- Code Consistency: extraction / diff / package / output / decision

各拡張のfull suite、package、VSIX budgetを個別に確認し、最後にcross-extension contractとExtension Host matrixで統合確認する。

## 6. さらに細かくVSIX分割しない理由

現行の責務分離は内部moduleで行う。

### workflow-register

- `src/gui/`
- `src/webview/`
- `src/core/engine/`
- `src/core/runtime/`
- `src/core/authoring/`
- `src/commands/`
- `src/template/`

### bob-bazaar-review

- `src/bazaar/`
- `src/projectRules/`
- `src/ruleAuthoring/`
- `src/reviewRuns/`
- `src/dashboard/`
- `src/ui/`
- `src/workflow/`
- `src/records/`
- `src/mcp/`

### bob-code-consistency-review

- `src/commands/`
- `src/core/`
- `src/analyzers/`
- `src/triage/`
- `src/webview/`
- `src/workflowProviderRegistration.ts`
- `src/workspaceInitializer.ts`

新しいVSIXを追加する前に、内部module、pure core、adapter、composition rootの分離で解決できないかを確認する。

## 7. soft dependency設計

### activation

- optional extensionが見つからなくてもactivationを成功させる。
- 後からextensionが有効化された場合にprovider registrationを再試行する。
- registrationはowner付きで行い、duplicate ownerを拒否する。
- extension停止時にregistrationをdisposeする。

### operator UX

`Bob 操作ハブ`はoptional integrationのavailabilityを事前判定する。利用不可の場合はbuttonを無効化し、extension未導入 / 未activeなどの理由を表示する。

### provider input

workflowから渡る`args`、`inputs`、`state`を信頼せず、許可field、workspace root、path、ID、revisionを各domain extensionが再検証する。

## 8. 保存・互換性境界

次はUI再編後も変更しない。

- workflow run engineとprovider ownership
- `run.json` / `control.json` / migration
- artifact manifestとresult sink
- Review Run identityとrecord schema
- review-input / Bob output / traceability schema
- preview-before-write
- explicit confirmation
- backup-before-replacement
- transaction / conflict check

UI routeはworkspace / run identityをstage serviceへ渡せるが、永続化契約の意味を変更しない。

## 9. quality gate

repository contract:

```bash
node --test \
  scripts/three-extension-command-surface.test.js \
  scripts/three-extension-documentation-contract.test.js \
  scripts/extension-host-smoke-contract.test.js
```

各拡張:

```bash
npm run compile
npm run dependency:policy
npm run architecture:policy
npm run source:policy
npm test
npm run package
npm run package:policy
```

Linux / WindowsのExtension Host gateは、3拡張のactivation、5公開command、代表hidden command、4 primary panel、soft-dependency unavailable state、unhandled rejection不在を同一SHAで確認する。

## 10. 再評価条件

次のいずれかが発生した場合に構成を再評価する。

- shared helperの重複が修正コストの主要因になる。
- provider APIのcross-extension呼出しが循環する。
- install / version mismatchが運用障害の主要因になる。
- single release unitが必須になる。
- extension packで解決できない配布要件が発生する。
- VSIX間境界よりdomain境界が変化する。

それまでは、**3VSIX + soft dependency + stable contract + consolidated operator surface**を維持する。
