# bob-code-consistency-review 詳細設計書

## 1. 文書の位置付け

本書は`extensions/bob-code-consistency-review`の現在実装に対応する詳細設計を定義する。対象は公開command、single-panel UI、workspace初期化、review-input、traceability sidecar、VCS差分、文書・コード根拠、review-package、Bob output、指摘確認・振り分け、workflow-register provider、transaction、安全境界である。

通常operatorがCommand Paletteから開始する入口は次の1件だけである。

```text
Bob Code Consistency Review: 整合プレレビューを開始
```

| Command ID | title | category |
|---|---|---|
| `bobCodeConsistency.openReviewWizard` | `整合プレレビューを開始` | `Bob Code Consistency Review` |

その他のCommand IDは主GUI action、workflow provider、互換API、テスト用に登録を維持するが、通常のCommand Paletteでは`when: "false"`とする。

## 2. entry pointとactivation

manifestの`main`は`./out/extension.js`である。`src/extension.ts`はcomposition rootとして次を行う。

1. workspace resolverとdomain serviceを生成する。
2. `consistencyReviewWizard.ts`のpanel ownerを生成する。
3. public / internal commandを登録する。
4. traceability、review execution、decision serviceを接続する。
5. `workflowProviderRegistration.ts`でoptional provider登録を開始する。
6. diagnostics、listener、panel、registrationを`ExtensionContext.subscriptions`へ追加する。

`IBM.bob-code`と`local.workflow-register`はsoft dependencyである。未導入でもactivation、local UI、preprocess serviceを利用できる。

## 3. 実装構成

```text
extensions/bob-code-consistency-review/
  package.json
  src/
    extension.ts
    extensionCommandOptions.ts
    reviewExecutionCommands.ts
    reviewInputWizard.ts
    traceabilityCommands.ts
    workflowProviderRegistration.ts
    workspaceInitializer.ts
    workspaceResolver.ts
    core/
      reviewInputBuilder.ts
      reviewInputDiscovery.ts
      reviewInputAiDraftProvider.ts
      reviewInputDiagnostics.ts
      reviewInputValidator.ts
      traceabilityCatalog.ts
      traceabilityStore.ts
      traceabilityValidation.ts
      traceabilityPrepController.ts
      gitDiffCollector.ts
      languageClassifier.ts
      textEncoding.ts
      pipeline.ts
      reviewPackageBuilder.ts
      bobOutputCapture.ts
      bobOutputValidator.ts
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
      traceabilityPrepWebview.ts
      traceabilityPrepWebviewAssets.ts
      consistencyResultCapture.ts
      consistencyResultCaptureHtml.ts
      consistencyHumanTriage.ts
      consistencyHumanTriageHtml.ts
    triage/
      triageTypes.ts
      triageSource.ts
      triageDecisions.ts
      triageProjection.ts
      triageFileTransaction.ts
      humanTriageWorkspace.ts
      humanTriageHelper.ts
```

## 4. `bobCodeConsistencyReviewWizard` ownership

### 4.1 panel lifecycle

`consistencyReviewWizard.ts`だけが公開panelを所有する。

- view type: `bobCodeConsistencyReviewWizard`
- title: `整合プレレビュー`
- `enableScripts: true`
- `retainContextWhenHidden: true`
- session identity: canonical workspace root、review ID
- 同じsessionを再openした場合は既存panelを`reveal()`する
- dispose時にlistener、watcher、pending operation、render stateを破棄する

`traceabilityPrepWebview.ts`、`consistencyResultCapture.ts`、`consistencyHumanTriage.ts`はembedded stage serviceであり、独立した公開panelを作成しない。

### 4.2 stage

```ts
type ConsistencyReviewStage =
  | "input"
  | "traceability"
  | "preprocess"
  | "result"
  | "decision"
```

| stage | 表示 |
|---|---|
| `input` | レビュー入力 |
| `traceability` | トレーサビリティ整理 |
| `preprocess` | Bobに渡すレビュー資料 |
| `result` | レビュー結果取り込み |
| `decision` | 指摘確認・振り分け |

stage routeはhost側でprerequisiteを検証する。validated inputなしでpreprocessへ進む、validated Bob outputなしでdecisionへ進む、といった遷移を拒否する。

### 4.3 messageとconcurrency

Webview messageは`type`、action ID、render token、session generationを検証する。

- stale generationのasync resultをcurrent modelへ適用しない。
-同じworkspace / target fileへのsaveをqueueとtransaction lockで直列化する。
- browserから受け取ったpath、source text、hash、decision revisionを再検証する。
- unknown action、missing field、duplicate source IDを拒否する。
- action errorはstage modelへ返し、uncaught rejectionにしない。

## 5. workspace解決と初期化

### 5.1 root selection

workspace rootはopen workspace folderから選ぶ。`review.vcs_root`がある場合、VCS rootはworkspace root内または明示許可されたopen rootへ解決する。

path validation:

- absolute / relative形式の正規化
- canonical physical path
- symlink / junction / alias拒否
- Windows drive-relative / device path拒否
- workspace containment
- target fileのregular-file identity

### 5.2 initializer

`bobCodeConsistency.initializeWorkspace`は次を扱う。

```text
.bob/workflows/code-consistency-review/WORKFLOW.md
review-input.yaml
docs/review-input-placeholder.md
```

workflow templateはcurrent bytesとbundled bytesを比較する。差異がある場合はbackupを作成してから更新し、same bytesなら`unchanged`を返す。

既存`review-input.yaml`を上書きせずbackupだけ作成する。initializerがoperator固有のreview scopeやartifact選択を暗黙変更してはならない。

save sequence:

```text
path / identity検証
→ current bytes読込
→ backup path予約
→ backup publication
→ temporary write
→ atomic replace
→ post-write validation
```

backup failure、stale file、unsafe pathではreplacementを開始しない。

## 6. review-input

### 6.1 model

```ts
interface ReviewInputDraft {
  review: {
    id: string
    title: string
    change_type: string
    purpose?: string
    vcs: "git" | "bazaar" | "bzr"
    base: string
    head: string
    vcs_root?: string
  }
  artifacts: ReviewArtifactInput[]
  review_focus: string[]
  analysis_options?: Record<string, unknown>
  bob_options?: Record<string, unknown>
}
```

### 6.2 creation routes

- 主GUIの対話入力
- accepted traceability catalog
- AI draft JSON
- existing file edit / repair

すべて`reviewInputBuilder.ts`と`reviewInputValidator.ts`を通す。AI draftやbrowser draftを直接YAMLへ書かない。

### 6.3 discovery

`reviewInputDiscovery.ts`はdocs配下から候補を列挙する。候補はlogical ID、kind、relative path、size、encoding hintを持ち、本文全量をUI modelへ含めない。

### 6.4 diagnosticsとrepair

`reviewInputDiagnostics.ts`はschema、path、VCS range、artifact existence、language、focus、legacy enumを検査する。repairはknown migrationだけをpreviewし、明示確認、backup、revalidation後に適用する。

## 7. traceability sidecar

### 7.1 catalog

sidecar catalogはdomains、items、links、decisions、source locator、source hash、revisionを保持する。

```yaml
schema_version: bob-traceability-catalog/v1
revision: 12
items:
  - id: REQ-0001
    kind: requirements
    status: accepted
    locator:
      path: docs/requirements.md
      heading: Timeout
```

### 7.2 `トレーサビリティ整理`

embedded stageは次のtabを持つ。

- 分類
- 項目
- 関連
- 判断
- 検証レポート
- レビュー入力プレビュー

browser actionはapprove、reject、deprecate、restore、link / decision edit等のintentだけを送る。save ownershipはextension hostが持つ。

### 7.3 optimistic locking

open時catalog revisionとcurrent revisionを比較する。stale revisionでは保存せず再読込を要求する。backup、staged YAML validation、atomic replace、gate report generationを同一transactionへ含める。

### 7.4 AI draft

AI draftはproposed-only candidateとして検証する。accepted / rejected / deprecated statusをAI payloadから直接適用しない。citation、source membership、ID、base revisionをhost側で確認する。

## 8. VCS diff collection

### 8.1 Git

`gitDiffCollector.ts`はargument arrayでGitを実行する。

- rename-aware name status
- numstat
- unified diff
- binary marker
- changed file list
- base / head verification

shellを使わず、timeout、AbortSignal、output limitを適用する。

### 8.2 Bazaar

`review.vcs`が`bazaar`または`bzr`の場合は`bzr --no-aliases`を使う。revision、root、pathを検証し、Gitと共通のnormalized changed-file modelへ変換する。

### 8.3 language classification

`languageClassifier.ts`はC / C++、TypeScript、JavaScript、Python、C#、Java、Go、Rust、Shell、SQL、JSON、YAML、Markdown、text、unknownを分類する。

`analysis_options.language`指定時だけfilterし、未指定は全対応言語を対象にする。

## 9. document extraction

### 9.1 Markdown

heading、line range、source IDを保持したexcerptを生成する。

### 9.2 docx

paragraphとtable cellを抽出し、document indexとsource locatorを保持する。

### 9.3 xlsx

sheet、cell range、header、data rowを抽出する。formula評価やmacro実行は行わない。

### 9.4 encoding / size

UTF-8を優先し、configured fallbackでShift-JIS / CP932系をdecodeする。excerpt、document、aggregate bytesに上限を設け、truncationをmanifestへ記録する。

## 10. code evidence

### 10.1 C / C++

`cCppChangeAnalyzer.ts`は軽量parserとdiff contextを使って次を抽出する。

- changed function
- caller / callee candidate
- global / static candidate
- macro / define candidate
- RT / TS rule candidate
- source line range

完全AST解析ではないため、confidenceとhuman checkを付ける。

### 10.2 generic languages

`genericCodeEvidenceAnalyzer.ts`はdiff hunkごとに`SRC-*` evidenceと`code-slices/*.md`を生成する。unsupported languageでもchanged fileを黙って捨てず、generic evidenceまたはdiagnosticを出す。

## 11. traceability mapping

`traceabilityBuilder.ts`はdocument evidenceとcode evidenceからcandidate linkを作る。linkはdeterministic heuristicと明示inputに基づき、Bobの推測をsource of truthにしない。

accepted sidecar link、artifact kind、review focus、changed file relationをmanifestへ記録する。

## 12. review-package

### 12.1 output

```text
.bob-review/
  review-package/
    manifest.yaml
    review-input.normalized.yaml
    evidence-index.json
    traceability-map.yaml
    bob-input.md
    documents/
    code-slices/
```

### 12.2 manifest

manifestはreview ID、package ID、VCS range、input hash、tool version、artifact inventory、bytes、SHA-256、truncation、warningを保持する。

### 12.3 `bob-input.md`

Bobへ渡す本文はvalidated evidenceだけで構成する。absolute local path、未選択文書、secret、workspace全体のfile listを含めない。

Bobへ次を明示する。

- evidence IDなしの断定を避ける。
- findingとquestionを分離する。
- uncertaintyを表示する。
-正式承認を行わない。
- output schemaへ従う。

## 13. `レビュー結果取り込み`

### 13.1 capture

`bobOutputCapture.ts`はresult handoff、clipboard、editor、manual textからYAML候補を抽出する。source typeとcapture timestampを記録する。

### 13.2 validation

`bobOutputValidator.ts`は次を検証する。

- schema version
- review ID / package ID
- finding / question shape
- severity / confidence enum
- evidence ID existence
- duplicate ID
- output bytes

validation errorがある場合は固定outputを置換しない。

### 13.3 save

validated YAMLをsame-directory temporary fileからatomic replaceする。既存outputがある場合はfile expectationとbackupを扱う。save成功後にだけ主GUIを`指摘確認・振り分け`へ進める。

## 14. decision domain

### 14.1 source snapshot

`triageSource.ts`はBob outputから`triage-source/v1`を生成する。source textはimmutableであり、Webview messageから更新しない。

### 14.2 decision store

`triageDecisions.ts`は`triage-decisions/v1`を扱う。itemsは`source_id` keyed mapであり、posted array orderをidentityにしない。

known editable fieldだけをmergeし、disk上のunknown fieldは同じschema versionで保持する。browserが送ったunknown fieldは破棄する。

### 14.3 conflicts

- source SHA mismatch: `TRIAGE_SOURCE_CHANGED`
- stale decision revision: `TRIAGE_REVISION_CONFLICT`
- invalid field: `TRIAGE_DECISION_INVALID <source_id>`

conflictはsave開始前に検出する。

### 14.4 projection

`triageProjection.ts`は次を決定的に生成する。

```text
triage-result.yaml
accepted-findings.md
rejected-findings.md
investigation-items.md
questions-to-author.md
follow-up-actions.md
```

未判断findingをaccepted projectionへ出さない。

### 14.5 transaction / migration

`triageFileTransaction.ts`はstaging、YAML validation、backup、replace、rollbackを行う。途中失敗時に一部projectionだけをcurrentへ残さない。

legacy `triage-result.yaml`はcurrent sourceに存在するmatching IDだけ移行し、unmatched IDを`migration-report.md`へ記録する。

## 15. workflow-register providers

source ownerは`local.bob-code-consistency-review`である。

### 15.1 workspace / input

```text
bobCodeConsistency.initializeWorkspace
bobCodeConsistency.createReviewInput
bobCodeConsistency.prepareAiReviewInputDraft
bobCodeConsistency.applyAiReviewInputDraft
bobCodeConsistency.repairReviewInput
bobCodeConsistency.explainReviewInputDiagnostics
```

### 15.2 traceability

```text
bobCodeConsistency.prepareAiTraceabilityDraft
bobCodeConsistency.captureAiTraceabilityDraft
bobCodeConsistency.applyAiTraceabilityDraft
bobCodeConsistency.openTraceabilityPrep
bobCodeConsistency.validateTraceabilityCatalog
bobCodeConsistency.createReviewInputFromTraceability
```

`bobCodeConsistency.openTraceabilityPrep`は独立panelを作らず、current `bobCodeConsistencyReviewWizard`を`トレーサビリティ整理`stageへrouteする。

### 15.3 execution

```text
bobCodeConsistency.preprocess
bobCodeConsistency.captureBobOutput
bobCodeConsistency.validateOutput
bobCodeConsistency.triage
```

provider inputのargs、inputs、state、workspace root、run ID、step IDをuntrustedとして検証する。registration failureをhard dependencyへ変えない。

## 16. security and error handling

- Webview CSP nonceとHTML escapeを維持する。
- inline event handlerとuntrusted `innerHTML`を使用しない。
- path containmentはphysical identityで検証する。
- symlink、junction、hard link、alias、workspace escapeを拒否する。
- subprocessはshellを使わず、timeout、AbortSignal、output limitを適用する。
- YAML / JSON parser errorをuser action付きdiagnosticへ変換する。
- secret、document本文、Bob output本文、decision本文をrelease evidenceへ保存しない。
- source hash、revision、preview digest、file expectationをwrite前に再検証する。
- Bob outputやAI draftを人間decisionなしで正式承認へ使わない。

## 17. tests

### 17.1 UI / route

- exact public command inventoryが1件。
- view type `bobCodeConsistencyReviewWizard`のsingle-panel lifecycle。
- `トレーサビリティ整理`、`レビュー結果取り込み`、`指摘確認・振り分け`のstage route。
- close / reopen、render token、stale async completion。
- keyboard、focus、200% zoom、High Contrast。

### 17.2 initializer / input

- workflow template backup / update。
- 既存`review-input.yaml`を上書きせずbackupだけ。
- builder / schema / path validation。
- AI draft host revalidation。
- repair preview / confirmation / backup。

### 17.3 traceability / preprocess

- catalog revision、backup、transaction、gate report。
- proposed-only AI merge。
- Git / Bazaar argument safety。
- encodingとdocument extraction。
- C / C++とgeneric language evidence。
- review-package manifest、hash、size、truncation。

### 17.4 output / decision

- Bob output schemaとevidence membership。
- `triage-source.yaml`と`triage-decisions.yaml`。
- `TRIAGE_SOURCE_CHANGED`と`TRIAGE_REVISION_CONFLICT`。
- keyed identity、unknown field preservation、decision validation。
- projection classification、transaction rollback、legacy migration。

### 17.5 cross-platform / package

Ubuntu / Windowsの同一source headでcompile、architecture、source、dependency、unit、package、VSIX policy、Extension Host smokeを実行する。

実IBM Bob UATではresult handoff、workflow-register連携、visual layout、keyboard-only、200% zoom、High Contrast、Developer Tools Console、artifact hashを確認する。
