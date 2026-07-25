# bob-code-consistency-review 詳細設計書

## 1. 文書の位置付け

本書は`extensions/bob-code-consistency-review`の現在実装に対応する詳細設計を定義する。対象は公開command、レビュー主GUI、workspace初期化、review-input、traceability sidecar、VCS差分、文書・コード根拠、review-package、Bob output、指摘確認・振り分け、workflow-register provider、安全境界である。

通常operatorがCommand Paletteから開始する入口は次の1件だけである。

```text
Bob Code Consistency Review: 整合プレレビューを開始
```

| Command ID | title | category |
|---|---|---|
| `bobCodeConsistency.openReviewWizard` | `整合プレレビューを開始` | `Bob Code Consistency Review` |

その他のCommand IDは主GUI action、workflow provider、互換API、テストのため登録を維持するが、通常のCommand Paletteでは`when: "false"`とする。

## 2. entry pointとactivation

manifestの`main`は`./out/extension.js`であり、composition rootは`src/extension.ts`である。activation時は次を行う。

1. `bobCodeConsistency.openReviewWizard`と内部commandを登録する。
2. workspace、review-input、traceability、preprocess、Bob output、triage handlerを接続する。
3. `registerWorkflowProvidersWithRetry`を開始する。
4. retry timer、provider registration、extension change listenerを`ExtensionContext.subscriptions`へ所有させる。

`IBM.bob-code`と`local.workflow-register`はsoft dependencyである。未導入または未activationでもlocal GUI、workspace初期化、review-input作成、preprocessを利用できる。

## 3. 実装構成

現在の主要moduleは次のとおりである。将来想定のfile名を現在実装の正本として列挙しない。

```text
extensions/bob-code-consistency-review/
  package.json
  src/
    extension.ts
    extensionCommandOptions.ts
    reviewExecutionCommands.ts
    traceabilityCommands.ts
    workflowProviderRegistration.ts
    workspaceInitializer.ts
    workspaceResolver.ts
    commands/
      reviewInputCommands.ts
      workspaceCommands.ts
    core/
      reviewInputBuilder.ts
      reviewInputDiscovery.ts
      reviewInputAiDraftProvider.ts
      reviewInputDiagnostics.ts
      reviewInputValidator.ts
      reviewTypes.ts
      traceabilityCatalog.ts
      traceabilityCatalogStore.ts
      traceabilityAiDraftProvider.ts
      traceabilityPrepController.ts
      gitDiffCollector.ts
      languageClassifier.ts
      textEncoding.ts
      pipeline.ts
      reviewPackageBuilder.ts
      bobOutputCapture.ts
      bobOutputValidator.ts
      bobOutputSource.ts
      fileSystem.ts
      schemaLoader.ts
    analyzers/
      documentExtractor.ts
      codeChangeAnalyzer.ts
      cCppChangeAnalyzer.ts
      genericCodeEvidenceAnalyzer.ts
      traceabilityBuilder.ts
    webview/
      consistencyReviewWizard.ts
      consistencyReviewWizardHtml.ts
      consistencyReviewWizardStages.ts
      traceabilityPrepWebview.ts
      traceabilityPrepWebviewAssets.ts
      consistencyResultCapture.ts
      consistencyResultCaptureHtml.ts
      consistencyHumanTriage.ts
      consistencyHumanTriageHtml.ts
      displayLabels.ts
    triage/
      triageTypes.ts
      triageSource.ts
      triageDecisions.ts
      triageProjection.ts
      triageFileTransaction.ts
      humanTriageWorkspace.ts
      humanTriageHelper.ts
```

## 4. 整合プレレビュー主GUI

### 4.1 panel生成

`src/webview/consistencyReviewWizard.ts`だけがview type `bobCodeConsistencyReviewWizard`を生成する。

- title: `整合プレレビュー`
- `enableScripts: true`
- `retainContextWhenHidden: true`
- 現在実装はcommand呼び出しごとに新しいWebview panelを生成する
- panel dispose時にstage generationとoperation generationを進め、遅延完了を無効化する

公開panel typeが1種類であることと、同一panel instanceを再利用することは別契約である。現在実装はcached singleton panelを保持しない。

### 4.2 runtime stage

`src/webview/consistencyReviewWizardStages.ts`のstage unionは次である。

```ts
type ConsistencyReviewStage =
  | "review"
  | "traceability"
  | "review-result-capture"
  | "triage"
```

| runtime stage | 利用者向け役割 |
|---|---|
| `review` | workspace状態、レビュー入力、前処理、レビュー資料の確認 |
| `traceability` | `トレーサビリティ整理` |
| `review-result-capture` | `レビュー結果取り込み` |
| `triage` | `指摘確認・振り分け` |

`initializeWorkspace`、`createReviewInput`、`createReviewInputFromTraceability`、`validateTraceability`、`preprocess`は`review` stage内のactionであり、独立stageではない。

`traceabilityPrepWebview.ts`、`consistencyResultCapture.ts`、`consistencyHumanTriage.ts`は同じ公開panel内のstage serviceである。独立した公開Command Palette panelを作成しない。

### 4.3 message ownershipとfailure recovery

- messageの`renderToken`がcurrent generationと一致することを確認する。
- navigationの`fromStage`がcurrent stageと一致する場合だけ遷移する。
- stage generationとoperation generationでstale async completionを拒否する。
- non-review stageは`initialize()`成功後にだけmessage受付を有効にする。
- stage初期化が失敗した場合はreview stageへ戻し、errorをmodelへ表示する。
- unknown actionと不正messageをhost側で拒否する。
- stage service例外を未処理Promise rejectionとして放置しない。

## 5. workspace解決と初期化

### 5.1 workspace root

workspace rootはopen workspace folderまたはworkflow contextから解決する。pathはlogical containmentだけでなくphysical identityを確認する。

- symlink / junction traversalの拒否
- Windows device pathとdrive-relative pathの拒否
- nearest existing ancestorのworkspace containment
- parent directoryのdevice / inode再確認
- write対象がregular fileまたはmissingであることの確認

### 5.2 initializer

`bobCodeConsistency.initializeWorkspace`は次を扱う。

```text
.bob/workflows/code-consistency-review/WORKFLOW.md
review-input.yaml
docs/review-input-placeholder.md
.gitignore
```

workflow template更新は`src/workspaceInitializer.ts`でtransaction lockを取得し、current bytesとbundled bytesを比較する。

- same bytesなら`unchanged`
- existing workflowはsnapshot identityとbytesを再確認する
- same-directory temporary fileを排他的に作成する
- current workflowのhard-link backupを作成する
- temporary fileをtargetへpublishする
- publication後にtargetとbackupのidentity / bytesを検証する
-途中失敗時は所有権を確認してrollbackする

`review-input.yaml`がmissingなら雛形を排他的に作成する。既存`review-input.yaml`を上書きせずbackupだけ作成し、result statusは`unchanged`とする。operator固有のreview scopeをinitializerが暗黙変更してはならない。

## 6. review-input

### 6.1 draftとnormalized YAML

`src/core/reviewInputBuilder.ts`の`ReviewInputDraft`は次を持つ。

- `review`: id、title、change_type、purpose、base、head、vcs、vcs_root等
- `artifact_candidates`: kind、path、section / sheet / row / case locator
- `focus_preset`または`review_focus`
- `analysis_options`
- `bob_options`

hostはenum、required field、workspace containment、artifact existenceを検証して`schema_version: 1`のnormalized YAMLを生成する。AI draftやbrowser draftを直接fileへ書かない。

### 6.2作成経路

- review stageの対話入力
- accepted traceability catalog
- AI draft JSON
- existing fileの診断・repair

すべて`src/commands/reviewInputCommands.ts`からdomain builder / validatorへ接続する。既存fileを更新するguided authoringでは、設定に従い時刻付きbackupを作成してから書き込む。

### 6.3 discoveryとdiagnostics

`reviewInputDiscovery.ts`は候補文書のlogical metadataを列挙し、本文全量をUI modelへ含めない。`reviewInputDiagnostics.ts`はschema、path、VCS range、artifact、language、focus、legacy valueを検査する。repairはknown migrationだけをpreviewし、明示確認後に適用する。

## 7. traceability sidecar

### 7.1 storage

既定pathは次である。

```text
.bob-trace/traceability-catalog.json
.bob-trace/gate-report.md
```

`src/core/traceabilityCatalogStore.ts`がcatalogのread、validation、revision、backup、atomic write、gate reportを扱う。`traceabilityStore.ts`というmoduleは現在実装に存在しない。

catalogはdomain、item、link、decision、source locator、source hash、revisionを保持する。browserはintentだけを送り、save ownershipはExtension Hostが持つ。

### 7.2 トレーサビリティ整理

`traceability` stageは分類、項目、関連、判断、検証レポート、レビュー入力previewを提供する。stage requestはworkspace root、catalog path、report path、text encodingを持つ。

open時revisionとsave時revisionを比較し、stale revisionでは更新せず再読込を要求する。AI draftはproposed-only candidateとして検証し、accepted / rejected / deprecated statusをAI出力から直接昇格させない。

## 8. VCS差分とevidence

### 8.1 Git / Bazaar

`gitDiffCollector.ts`はargument arrayでGitを実行し、rename-aware status、numstat、unified diff、binary marker、changed file listを生成する。

`review.vcs`が`bazaar`または`bzr`の場合は`bzr --no-aliases`を用いる。Git / Bazaarともにshellを使わず、timeout、output limit、revision / path validationを適用する。

### 8.2 document evidence

`documentExtractor.ts`はMarkdown、DOCX、XLSX等からsource locator付きexcerptを生成する。XLSXではsheet / cell range / rowを保持し、formula評価やmacro実行を行わない。document、sheet、row、excerpt、aggregate bytesの上限を適用する。

### 8.3 code evidence

`cCppChangeAnalyzer.ts`はdiff contextからchanged function、caller / callee candidate、global / static candidate、macro candidate、source rangeを抽出する。完全AST解析ではないためconfidenceとhuman checkを付ける。

`genericCodeEvidenceAnalyzer.ts`はその他の言語でdiff hunk単位のevidenceを生成する。unsupported languageを黙って除外せず、generic evidenceまたはdiagnosticを出す。

`traceabilityBuilder.ts`はdocument evidenceとcode evidenceからcandidate relationを構築する。Bobの推測をsource of truthにしない。

## 9. review-packageとBob input

既定出力先は`.bob-review/review-package`である。

```text
manifest.yaml
review-input.normalized.yaml
evidence-index.json
traceability-map.yaml
bob-input.md
documents/
code-slices/
```

manifestはreview ID、package ID、VCS range、input hash、tool version、artifact inventory、bytes、SHA-256、truncation、warningを保持する。

`bob-input.md`はvalidated evidenceだけで構成し、absolute local path、未選択文書、secret、workspace全体のfile listを含めない。findingとquestionを分離し、evidence ID、uncertainty、output schema、正式承認禁止をBobへ明示する。

## 10. レビュー結果取り込み

`src/core/bobOutputCapture.ts`はworkflow handoff、clipboard、editor、manual textからBob output候補を抽出する。`src/core/bobOutputValidator.ts`はschema version、review / package ID、finding / question、severity / confidence、evidence membership、duplicate ID、byte上限を検証する。

validation errorがある場合はcurrent outputを置換しない。stage serviceはvalidated outputを保存した後、必要なtriage sourceを準備して`triage` stageへ遷移する。

## 11. 指摘確認・振り分けdomain

### 11.1 source snapshot

`src/triage/triageSource.ts`はBob outputから`triage-source/v1`を生成する。正本fileは`triage-source.yaml`である。

- `review_id`
- optional `package_id`
- `bob_output_sha256`
- `items[]`の`source_id`と`source_type`

source snapshotはimmutableであり、Webview messageから更新しない。

### 11.2 decision store

`src/triage/triageDecisions.ts`は`triage-decisions/v1`を扱う。正本fileは`triage-decisions.yaml`である。

- source SHA
- monotonic `decision_revision`
- `source_id` keyed decision map
- decision、severity、owner、reason、comment、follow-up

posted array orderをidentityにしない。known editable fieldだけをmergeし、同じschema versionのdisk上unknown fieldを保持する。browser由来unknown fieldは採用しない。

### 11.3 conflict

- source SHA mismatch: `TRIAGE_SOURCE_CHANGED`
- stale decision revision: `TRIAGE_REVISION_CONFLICT`
- invalid field: `TRIAGE_DECISION_INVALID <source_id>`

conflictはwrite開始前に検出する。

### 11.4 projectionとtransaction

`src/triage/triageProjection.ts`はdecisionからprojectionを決定的に生成する。未判断findingをaccepted projectionへ含めない。

`src/triage/triageFileTransaction.ts`はstaging、YAML validation、backup、replace、rollbackを行う。途中失敗時に一部projectionだけをcurrentへ残さない。

`src/triage/humanTriageWorkspace.ts`はBob output、source、decision、projectionをworkspace pathへ接続し、legacy `triage-result.yaml`のmatching IDだけを移行する。

## 12. workflow-register provider

source ownerは`local.bob-code-consistency-review`である。`src/workflowProviderRegistration.ts`はproviderごとのallowed option keyだけを採用し、workflow contextを明示fieldとして渡す。

登録provider:

```text
bobCodeConsistency.initializeWorkspace
bobCodeConsistency.createReviewInput
bobCodeConsistency.prepareAiReviewInputDraft
bobCodeConsistency.applyAiReviewInputDraft
bobCodeConsistency.prepareAiTraceabilityDraft
bobCodeConsistency.captureAiTraceabilityDraft
bobCodeConsistency.applyAiTraceabilityDraft
bobCodeConsistency.openTraceabilityPrep
bobCodeConsistency.validateTraceabilityCatalog
bobCodeConsistency.createReviewInputFromTraceability
bobCodeConsistency.repairReviewInput
bobCodeConsistency.explainReviewInputDiagnostics
bobCodeConsistency.preprocess
bobCodeConsistency.captureBobOutput
bobCodeConsistency.validateOutput
bobCodeConsistency.triage
```

`bobCodeConsistency.openTraceabilityPrep`は独立panelを作らず、`bobCodeConsistencyReviewWizard`を`traceability` stageで開く。provider registration failureをhard dependencyへ変えない。

## 13. security / privacy

- WebviewはCSP nonceとHTML escapeを維持する。
- inline event handlerとuntrusted `innerHTML`を使用しない。
- path containmentをphysical identityで検証する。
- symlink、junction、hard-link replacement、workspace escapeを拒否する。
- subprocessはshellを使わず、timeoutとoutput limitを適用する。
- YAML / JSON parse errorをoperator action付きdiagnosticへ変換する。
- secret、document本文、Bob output本文、decision本文をrelease evidenceへ保存しない。
- source hash、revision、file expectationをwrite前に再検証する。
- Bob outputやAI draftを人間decisionなしで正式承認へ使わない。

## 14. test / acceptance gate

unit / source contract:

- exact public command inventoryが1件
- view type `bobCodeConsistencyReviewWizard`とtitle `整合プレレビュー`
- runtime stage union `review / traceability / review-result-capture / triage`
- render token、from-stage、generation、stale async completion
- workflow template backup / publication / rollback
- 既存`review-input.yaml`を上書きせずbackupだけ
- review-input builder / schema / path validation
- traceability catalog revision、backup、gate report、AI proposed-only merge
- Git / Bazaar argument safety、encoding、document / code evidence
- review-package manifest、hash、size、truncation
- `triage-source.yaml`と`triage-decisions.yaml`
- `TRIAGE_SOURCE_CHANGED`と`TRIAGE_REVISION_CONFLICT`
- keyed identity、unknown field preservation、projection、rollback、legacy migration

release gate:

- Ubuntu / Windowsの同一source headでcompile、dependency / architecture / source policy、unit test、package、VSIX policy、Extension Host smokeを実行する。
- 実IBM Bob UATでresult handoff、workflow-register連携、layout、keyboard-only、200% zoom、High Contrastを確認する。
- Developer Tools Consoleのuncaught exception / unhandled rejectionを0件にする。
- tested commit、VSIX build commit、artifact hashを一致させる。
