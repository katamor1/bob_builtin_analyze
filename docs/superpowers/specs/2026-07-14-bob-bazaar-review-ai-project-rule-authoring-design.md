Replaced: `workflowRegister.openOperationHub`, `workflowRegister.openWorkflowBuilder`, `bobBazaar.openReviewGui`, and `bobCodeConsistency.openReviewWizard` are the current operator routes; the legacy Human Triage terminology below is retained only as historical project-rule-authoring design evidence.

# Bob Bazaar Review AI Project Rule Authoring Design

**Date:** 2026-07-14

**Status:** Approved

**Scope:** `extensions/bob-bazaar-review` に、外部資料からプロジェクト固有レビュー規約を生成・選択適用する機能を追加する

**Base revision:** `f35e7e79b3133f639b80aa9e4b3a5b00fe3b09cc`

## 1. Goal

プロジェクト固有の規約やレビュー観点が記載された Word、Excel、PDF を利用者が個別選択し、構造を保持した抽出結果を生成AIへ渡して、`.bob` 配下のプロジェクト固有レビュー資産へ反映する。

文書解釈、複数資料の統合、重複整理、矛盾検出、適用条件の文章化には生成AIを使用する。一方、ファイル選択、抽出、ハッシュ、上限管理、構造検証、差分計算、バックアップ、選択適用、rollback は決定論的に実行する。AI出力を正式ファイルへ直接書き込まず、規約単位の Human Triage を必須とする。

## 2. Confirmed product decisions

- ワークスペース外および共有フォルダ上の資料を、VS Code の file picker から個別選択できる。
- 原本は `.bob` へコピーしない。
- 抽出本文、原本ハッシュ、出典位置を `.bob/review/rule-authoring` に保存する。
- AIが提案できるのはプロジェクト固有部分だけとする。
- `WORKFLOW.md`、`review-result.schema.json`、`custom_modes.yaml`、`mcp.json` などの基盤契約は拡張機能が管理する。
- AI生成案は、規約ごとの追加、更新、廃止候補として表示し、利用者が選択適用する。
- 初期対応形式は `.docx`、`.xlsx`、テキスト抽出可能な `.pdf` とする。
- `.doc`、`.xls`、画像PDFは自動解釈せず、変換またはOCRが必要と明示する。
- AI実行は `workflow-register` の agent step と Bob の設定済みモデル経路を使用する。
- `bob-bazaar-review` の既存レビュー機能は、Bobや`workflow-register`が未導入でも従来どおり利用できる。

## 3. Existing system constraints

- `.bob/review/checklist.json` は既存レビューの機械可読な正本である。
- `.bob/skills/project-review-checklist/SKILL.md` と `bazaar-project-rule-review/WORKFLOW.md` は拡張機能テンプレートとして配布される。
- `.bob` 初期化は基本的に missing-only であり、管理対象 workflow のみ確認付き refresh を行う。
- `bobBazaar.loadReviewRules` は checklist と review-result schema を workflow state へ渡す。
- `buildProjectRulesSection()` は checklist と schema を Bazaar review packet に埋め込む。
- workflow action provider は `sourceId` 付きで登録し、extension停止時に解除する。
- 外部プロセスは shell を使わず、hard timeout、出力上限、AbortSignal、子プロセス終了を持つ。
- Linux と Windows の compile、unit test、package gateを維持する。Bob、Office文書、Popplerを含む結合確認は Windows 実機UATで行う。

## 4. Considered approaches

### A. Workflow-coordinated hybrid

拡張機能が文書抽出、構造化、検証、差分、適用を担当し、`workflow-register` の agent step が証拠選択と規約案生成を担当する。

**Advantages:** 現行のworkflow、成果物、result handoff、中断再開、人間確認の境界と一致する。AIプロバイダー、APIキー、課金、再試行を拡張機能へ重複実装しない。

**Disadvantages:** 規約作成機能の利用時にはBobと`workflow-register`が必要になる。

### B. Direct model invocation from bob-bazaar-review

VS Code拡張機能がモデルAPIを直接呼び、単独wizardとして完結させる。

**Advantages:** 画面遷移を拡張機能だけで制御できる。

**Disadvantages:** provider選択、credential、streaming、retry、cost、result persistenceを独自実装する必要があり、Bobの責務と重複する。

### C. MCP/Skill-driven authoring

文書取得とファイル適用だけをMCP toolとして公開し、進行と生成をAIへ委ねる。

**Advantages:** 拡張機能側のorchestrationが小さい。

**Disadvantages:** 再現性、構造化出力、規約単位の選択適用、中断再開、rollbackが弱い。

**Decision:** Approach Aを採用する。

## 5. Architecture

```text
Project Rule Authoring Wizard
  -> explicit external file selection
  -> deterministic extraction and source hashing
  -> compact structural source index
  -> workflow agent selects relevant chunk IDs
  -> extension validates IDs and loads bounded evidence
  -> workflow agent emits rule-proposal/v1 JSON
  -> extension validates proposal and computes semantic operations
  -> Human Triage accepts, rejects, or edits each operation
  -> transactional apply updates project-owned .bob assets
  -> existing Bazaar review loads the approved bundle
```

AIは原本ファイルや任意パスへ直接アクセスしない。拡張機能が生成した `document-chunk/v1` と既存のproject rule bundleだけを受け取る。

### 5.1 Responsibility boundary

| Responsibility | Owner |
| --- | --- |
| file picker、形式確認、size/hash、duplicate detection | extension host |
| DOCX/XLSX/PDF extraction、chunking、locator付与 | extension host |
| 構造索引からの候補chunk選択 | workflow agent |
| candidate ID、選択量、source hashの検証 | extension host |
| 規約候補、矛盾候補、context/prompt section生成 | workflow agent |
| JSON Schema、citation、operation、base hash検証 | extension host |
| 候補の採用、却下、編集、矛盾解決 | human |
| stable rule ID採番、backup、write、rollback | extension host |
| review packetでの承認済み規約評価 | existing review workflow agent |

## 6. Workspace artifacts and ownership

### 6.1 Extension-managed assets

```text
.bob/
  review/
    review-result.schema.json
    review-prompt-template.md
    rule-authoring/
      .gitignore
  skills/
    project-review-checklist/
      SKILL.md
  workflows/
    bazaar-project-rule-review/
      WORKFLOW.md
    bazaar-project-rule-authoring/
      WORKFLOW.md
  custom_modes.yaml
  mcp.json
```

これらは拡張機能のversioned contractであり、authoring AIの提案対象にしない。stable Skillとreview prompt templateは、project-owned assetを読み込む入口だけを持つ。

### 6.2 Project-owned approved assets

```text
.bob/
  review/
    checklist.json
    project-context.md
    review-prompt-addendum.md
    rule-sources.json
    rule-provenance.json
```

- `checklist.json`: active project rulesの機械可読な正本。
- `project-context.md`: レビュー時に必要なプロジェクト背景、用語、責務境界。
- `review-prompt-addendum.md`: project固有の調査順序、重点確認、禁止事項。
- `rule-sources.json`: redacted source identity、SHA-256、形式、論理名、抽出status。
- `rule-provenance.json`: rule IDからsource/chunk locatorへの対応とgeneration履歴。

### 6.3 Local authoring artifacts

```text
.bob/
  review/
    rule-authoring/
      source-locations.local.json
      runs/
        <run-id>/
          authoring-run.json
          generations/
            gen-<32hex>/
              source-manifest.json
              document-chunks.jsonl
              source-scope.json
              source-index.json
              evidence-selection.json
              selected-evidence.md
              rule-proposal.raw.txt
              rule-proposal.json
              proposal-validation.json
              proposal-decisions.json
              apply-preview.json
              apply-manifest.json
      backups/
        <transaction-id>/
      transactions/
        <transaction-id>/
          transaction-journal.json
```

`source-locations.local.json`、抽出本文、raw AI response、backup、transaction stagingは既定でGit対象外にする。承認済みproject-owned assetsと、絶対パスおよび本文を含まないprovenance/apply metadataだけをremote共有対象とする。

各artifact generationはimmutableとし、`authoring-run.json` のartifact pointerをauthoritativeな参照とする。新しいgenerationの全fileをdurableに書き終えた後、run storeと同じlock/CAS境界でpointerをatomicに更新する。consumerはrun-root直下のbasenameを組み立てず、共有artifact resolverでpointerのcontainmentとcanonical basenameを検証する。

管理対象の `.bob/review/rule-authoring/.gitignore` はauthoring directory配下を既定除外し、`.gitignore` 自身だけを追跡可能にする。remote共有が必要な承認済み情報は、ignored run directoryではなくproject-owned `rule-sources.json` と `rule-provenance.json` へ投影する。

### 6.4 Runtime dependency decision

`bob-bazaar-review` に `ajv`、`cheerio`、`mammoth`、`read-excel-file` をproduction dependencyとして追加する。DOCX/XLSX dependencyは利用時だけlazy loadし、extension activationの通常経路へ読み込まない。PDF engineはVSIXへ同梱せず、設定済み`pdftotext`を使用する。

VSIX size policyは現在の350,000 bytesから12,000,000 bytesへ明示的に変更し、package metricsで実測値を記録する。production dependency auditでhigh以上の脆弱性がある状態をrelease不可とする。

## 7. Source selection and extraction

### 7.1 Selection rules

- VS Code `showOpenDialog` の `canSelectMany: true` で個別ファイルを選択する。
- directory selectionと暗黙の再帰走査は提供しない。
- 抽出対応extensionは `.docx`、`.xlsx`、`.pdf` とする。file pickerには判定対象として `.doc`、`.xls` も表示するが、抽出対象にはしない。
- `.doc`、`.xls` はlocal-only selection resultで`requires_conversion`、本文を取得できないPDFは `requires_ocr` とする。承認済み`rule-sources.json`とAI入力には抽出成功した`.docx`、`.xlsx`、`.pdf`だけを含める。
- 同一run内と既存`rule-sources.json`に同じfull SHA-256がある場合、duplicateとして表示する。
- 抽出前後に `stat` と全内容SHA-256を取り、size、mtime、file identity（利用可能なplatformではdevice/inodeを含む）、digestがすべて一致した場合だけsource snapshotを採用する。ライブラリが対象pathを再openする間に差し替えられたsourceも拒否する。

### 7.2 Limits

| Limit | Default |
| --- | ---: |
| source files per run | 20 |
| bytes per source | 25 MiB |
| aggregate source bytes | 100 MiB |
| UTF-8 bytes per chunk | 32 KiB |
| compact source index | 1 MiB |
| selected evidence sent to proposal agent | 1 MiB |
| proposal JSON input | 1 MiB |
| `pdftotext` combined output | 32 MiB |
| OOXML ZIP entries | 5,000 |
| OOXML declared uncompressed bytes | 250 MiB |
| rule operations per proposal | 200 |
| project-context operations per proposal | 100 |
| prompt-addendum operations per proposal | 100 |
| approved `project-context.md` | 256 KiB |
| approved `review-prompt-addendum.md` | 256 KiB |

上限超過時は黙って切り詰めない。対象外になるsource、section、sheet、page、chunkを表示し、利用者が選択を減らす。

### 7.3 DOCX extraction

`mammoth` と `cheerio` をlazy loadし、見出し、段落、list、tableをdocument orderでchunk化する。各chunkはheading path、block index、table indexをlocatorとして持つ。画像、macro、embedded object、external relationshipは実行・取得しない。

### 7.4 XLSX extraction

`read-excel-file/node` をlazy loadし、sheet名、row、cell valuesを抽出する。row chunkはsheet名、Excel row number、非空cellの最小・最大columnから成るcell rangeをlocatorとして持つ。公式規約の根拠として使用するのは保存済みcell valueであり、formula実行、external link refresh、macro実行は行わない。

### 7.5 PDF extraction

設定 `bobBazaar.ruleAuthoring.pdfToTextPath` の既定値を `pdftotext` とする。実行形式は次の固定argument arrayとする。

```text
pdftotext -layout -enc UTF-8 <input.pdf> -
```

shellを使用せず、既存のexternal process contractと同じhard timeout、AbortSignal、32 MiB combined output上限、child terminationを適用する。form feedでpageを分割し、最後のtrailing empty pageだけを除外してpage numberをlocatorとする。内部の空pageは維持する。出力が空なら`requires_ocr`、低いtext densityはwarningとする。

## 8. Data contracts

### 8.1 Source manifest

```ts
interface RuleSourceManifestV1 {
  schema_version: "bob-bazaar-review/rule-sources/v1"
  generated_at: string
  sources: Array<{
    source_id: string
    logical_name: string
    media_type: "docx" | "xlsx" | "pdf"
    sha256: string
    byte_size: number
    extraction_status: "success" | "partial" | "blocked" | "requires_conversion" | "requires_ocr"
    extractor: { id: string; version: string }
    warnings: string[]
  }>
}
```

`source_id` は `src-` とfull SHA-256の先頭12桁から生成し、manifest内衝突時はprefixを延長する。remote共有manifestにabsolute pathを含めない。

### 8.2 Document chunk

```ts
interface DocumentChunkV1 {
  schema_version: "bob-bazaar-review/document-chunk/v1"
  chunk_id: string
  source_id: string
  kind: "heading" | "paragraph" | "list" | "table" | "row" | "page"
  locator: {
    heading_path?: string[]
    block_index?: number
    table_index?: number
    sheet?: string
    row?: number
    cell_range?: string
    page?: number
    part_index?: number
  }
  title?: string
  text: string
  text_sha256: string
  flags: string[]
}
```

`chunk_id` はsource ID、format、structural locatorから決定論的に生成する。同一構造要素が32 KiBを超える場合はUTF-8境界で分割し、0始まりの`part_index`をlocatorへ加える。AIが返したsource/chunk referenceは、保存済みchunk indexに完全一致しなければ拒否する。

### 8.3 Rule proposal

```ts
interface RuleProposalV1 {
  schema_version: "bob-bazaar-review/rule-proposal/v1"
  run_id: string
  base: {
    checklist_sha256: string
    project_context_sha256: string
    prompt_addendum_sha256: string
  }
  operations: RuleProposalOperationV1[]
  conflicts: RuleProposalConflictV1[]
  project_context_operations: ProposedMarkdownOperationV1[]
  prompt_addendum_operations: ProposedMarkdownOperationV1[]
}

interface RuleProposalOperationV1 {
  candidate_id: string
  operation: "add" | "update" | "retire"
  target_rule_id: string | null
  rule: {
    category: string
    title: string
    description: string
    severity_on_fail: "error" | "warning" | "info"
    applies_when: string[]
    evidence_required: boolean
    review_hint: string
  } | null
  source_refs: Array<{ source_id: string; chunk_id: string }>
  confidence: "high" | "medium" | "low"
  rationale: string
  conflict_ids: string[]
}

interface ProposedMarkdownOperationV1 {
  candidate_id: string
  operation: "add" | "update" | "retire"
  target_section_id: string | null
  heading: string | null
  markdown: string | null
  source_refs: Array<{ source_id: string; chunk_id: string }>
  confidence: "high" | "medium" | "low"
  rationale: string
  conflict_ids: string[]
}

interface RuleProposalConflictV1 {
  conflict_id: string
  summary: string
  blocking: boolean
  source_refs: Array<{ source_id: string; chunk_id: string }>
  affected_candidate_ids: string[]
  alternatives: Array<{
    alternative_id: string
    description: string
    source_refs: Array<{ source_id: string; chunk_id: string }>
  }>
}
```

Validation rules:

- `add` は `target_rule_id: null` とnon-null `rule`を必要とする。
- `update` は存在するtarget rule IDとnon-null `rule`を必要とする。
- `retire` は存在するtarget rule IDを必要とし、`rule`はnullとする。
- managed Markdownの`add`は`target_section_id: null`とnon-null heading/markdownを必要とする。
- managed Markdownの`update`は存在するtarget section IDとnon-null heading/markdownを必要とする。
- managed Markdownの`retire`は存在するtarget section IDを必要とし、heading/markdownはnullとする。
- candidate ID、target ID、source referenceはproposal内で一意または整合していなければならない。
- source referenceを1件以上持たないoperationは適用できない。
- unresolved blocking conflictを参照するoperationは適用できない。
- proposalのbase hashと現在のapproved asset hashが一致しなければstaleとする。
- `applies_when` v1は空配列、`changed_file_matches:<glob>`、`diff_contains:<literal>`だけを受け付け、任意式やcommandを実行しない。
- rule operationは200件、context operationは100件、prompt operationは100件を上限とし、1 MiB全体上限と併用する。
- managed Markdown本文にNUL、制御文字、`bob-managed-section` markerを含めることを拒否する。

新規rule IDはAIに採番させない。apply時に既存の`PRJ-NNNN`最大値から次番号を規約候補の表示順で決定し、選択されたaddだけへ付与する。

project contextとprompt addendumも、AIが全ファイルを書き換える形式にはしない。拡張機能が次のstable markerで管理するsectionだけを追加、更新、廃止する。

```markdown
<!-- bob-managed-section:CTX-0001 -->
## 状態遷移の責務

承認済みのproject context本文。
<!-- /bob-managed-section:CTX-0001 -->
```

marker外の利用者記述はそのまま保持する。新規section IDはcontextに`CTX-NNNN`、prompt addendumに`PRM-NNNN`をextensionが採番する。`update`と`retire`は既存managed section IDを必須とし、markerの欠損、重複、nesting不正がある場合はapplyを停止する。

### 8.4 Rule provenance

```ts
interface RuleProvenanceV1 {
  schema_version: "bob-bazaar-review/rule-provenance/v1"
  updated_at: string
  rules: Array<{
    rule_id: string
    lifecycle: "active" | "retired"
    source_refs: Array<{
      source_id: string
      chunk_id: string
      locator: DocumentChunkV1["locator"]
      text_sha256: string
    }>
    first_applied_at: string
    last_applied_at: string
    last_run_id: string
  }>
  markdown_sections: Array<{
    asset: "project-context" | "review-prompt-addendum"
    section_id: string
    lifecycle: "active" | "retired"
    source_refs: Array<{
      source_id: string
      chunk_id: string
      locator: DocumentChunkV1["locator"]
      text_sha256: string
    }>
    last_applied_at: string
    last_run_id: string
  }>
}
```

retired itemもprovenanceから物理削除せず、履歴として保持する。apply時にlocal chunkからlocatorとtext SHA-256をprovenanceへ固定し、remote側では原文なしでも参照位置と版を確認できるようにする。active checklistまたはmanaged Markdownから参照されるsourceは`rule-sources.json`に存在し、chunk metadataはproposal作成時のlocal evidenceと一致しなければならない。

## 9. Workflow

新しいtemplateを次に配置する。

```text
templates/.bob/workflows/bazaar-project-rule-authoring/WORKFLOW.md
```

| Step | Type | Provider/result |
| --- | --- | --- |
| `select-and-extract` | command | `bobBazaar.openRuleAuthoringGui` |
| `load-source-index` | command | `bobBazaar.loadRuleSourceIndex` -> `ruleSourceIndex` |
| `select-evidence` | agent | `ruleEvidenceSelectionRaw` |
| `capture-evidence-selection` | command | `bobBazaar.captureRuleEvidenceSelection`、`{{state.ruleEvidenceSelectionRaw}}` を入力 |
| `load-selected-evidence` | command | `bobBazaar.loadSelectedRuleEvidence` -> `ruleEvidence` |
| `draft-rule-proposal` | agent | `ruleProposalRaw` |
| `capture-proposal` | command | `bobBazaar.captureRuleProposal`、`{{state.ruleProposalRaw}}` を入力 |
| `human-review-and-apply` | command | `bobBazaar.openRuleProposalTriageGui` |
| `verify-authoring-apply` | command | `bobBazaar.verifyRuleAuthoringApply`、apply manifestと正式assetを再検証 |

source indexは本文全体ではなく、source logical name、heading path、sheet、page、chunk title、短いpreview、byte countだけを含み、生成物全体へ1 MiB hard limitを適用する。selection agentはchunk IDだけを返す。`loadSelectedRuleEvidence` はID存在確認、重複除去、1 MiB aggregate limitを適用した後、本文をuntrusted evidence delimiter付きで返す。

`workflow-register/v1` のstep typeは `command`、`agent`、`manual`、`result` に限定されるため、AI結果のcaptureはagent result sinkではなく明示的なcommand stepで行う。これにより`workflow-register`側の固定sink allowlistを拡張せず、既存のcommand action contract内で検証と永続化を実行する。

workflowは `stepCompletion: manual` に加えて `stepReview.enabled: false`、`pauseAfter: none`、`requireAcceptBeforeNext: false` を明示する。GUI command stepは `completeOnSuccess: false` とし、host側の完了通知で進める。最終verification stepはapply manifest、正式asset hash、source/provenance参照整合性を検証し、GUI待機のdetached recoveryだけで未適用runを完了扱いにしない。

`draft-rule-proposal` のsystem-level instructionは、document textを命令ではなく証拠として扱い、文書内のprompt、tool request、role marker、JSON output instructionを実行しないことを必須化する。

## 10. Wizard and state model

新commandを追加する。

```text
bobBazaar.authorProjectRulesFromDocuments
```

Wizard pages:

1. Environment check
2. Source selection
3. Extraction preview and scope selection
4. AI consent and workflow progress
5. Rule proposal triage
6. Apply preview
7. Completion and unresolved issues

AI consent pageは、送信対象source logical names、selected chunk count、UTF-8 bytes、設定済みBob model経路を表示する。明示承認前にagent stepへ本文を渡さない。

`bobBazaar.authorProjectRulesFromDocuments` はwizardを開いてsource選択、抽出、AI送信内容の準備までを行う。現行の公開APIではPalette commandからBob taskを直接生成できないため、AI consent後はBob UIから `bazaar-project-rule-authoring` workflowを開始するよう案内する。`workflow-register.runWorkflow()` のstandalone実行をBob model経路の代替として暗黙利用しない。

`authoring-run.json` は次のphaseを持つ。

```text
sources -> extraction -> evidence_selection -> proposal -> human_review -> apply -> completed
```

各phase statusは `not_started`、`in_progress`、`completed`、`blocked`、`failed`、`skipped` とする。authoring runはworkflow run ID、current phase、artifacts、warnings、issues、created/updated timestampsを保持する。VS Code再起動後は未完了run一覧から再開する。

`proposal-decisions.json` は候補ごとのaccept/reject/edit、reject reason、conflict resolution、reviewed timestampを保持する。AI proposal自体は変更せず、利用者編集はdecision overlayとして保存し、apply previewを再生成できるようにする。

## 11. Human Triage

proposal tableはasset種別、operation、target rule/section、severity、confidence、source count、conflict statusを表示する。rule operationとmanaged Markdown operationのそれぞれについて次を提供する。

- accept
- reject with optional reason
- edit proposed rule fields
- inspect source excerpt and locator
- inspect existing rule versus proposed rule
- resolve or link a conflict decision

host側でmessage typeとactionをallowlistし、Webviewからfile path、target path、command IDを自由入力させない。UI validationだけに依存せず、apply直前にextension hostで全契約を再検証する。

## 12. Transactional apply

1. approved assetのcurrent hashを計算する。
2. proposal base hashと不一致ならstaleとして停止する。
3. accepted operationだけを使用してstaging directoryへ全targetを生成する。
4. checklist、Markdown、source manifest、provenanceのcross-referenceを検証する。
5. current targetをtransaction backupへコピーする。
6. transaction journalにtargetごとの`prepared`状態を記録する。
7. targetと同じdirectoryのtemporary fileからrenameし、journalを`replaced`へ進める。
8. 全target成功後に`committed`とapply manifestを記録する。
9. 途中失敗時はreplaced targetを逆順でbackupから復元し、journalを`rolled_back`または`rollback_failed`にする。

Windows filesystemでは複数ファイルの単一atomic transactionを作れないため、journalとbackupによるrecoverable transactionとする。次回起動時にincomplete transactionを検出し、通常runを再開する前にrollbackまたはrecoveryを要求する。

`retire` はactive `checklist.json`からruleを除外する。削除前内容、decision、source referencesはbackupとapply manifestに保持する。

## 13. Existing review integration

- `loadReviewRules()` はchecklist/schemaに加え、存在する場合だけproject context、prompt addendum、provenance summaryを返す。
- 既存consumerが利用するchecklist/schema fieldは変更しない。
- `buildProjectRulesSection()` はproject contextとprompt addendumをbounded optional sectionとして追加する。
- `.bob/review/project-context.md` と `review-prompt-addendum.md` がない既存workspaceは空として扱う。
- `.bob` 初期化は空のproject-owned companion filesとauthoring workflowをmissing-onlyで配置する。
- stable Skillは、project contextとprompt addendumが存在する場合だけそれらを読むよう指示する。
- MCPへ`project_rules_get_context`と`project_rules_get_provenance`を追加し、既存tool responseを変更しない。

## 14. Error and recovery behavior

| Failure | Required behavior |
| --- | --- |
| one source extraction fails | sourceをblockedにし、除外を明示承認すれば他sourceで継続 |
| unsupported `.doc`/`.xls` | requires_conversion、AIへ送らない |
| image-only PDF | requires_ocr、AIへ送らない |
| `pdftotext` missing | PDF sourceをblocked、DOCX/XLSXは継続可能 |
| source changes during extraction | source snapshotを破棄し再抽出を要求 |
| source index exceeds budget | section/sheet/page selectionを減らすまで停止 |
| agent timeout | deterministic artifactsを保持し、agent stepだけ再試行 |
| malformed AI JSON | raw responseをlocal run artifactとして保持し、captureから再試行 |
| nonexistent citation | operationをinvalidにし、正式assetへ書かない |
| unresolved source conflict | 関連operationだけapply不可 |
| approved asset changed after proposal | stale proposalとしてrebaseまたはregenerationを要求 |
| apply write failure | transaction journalに従い全targetをrollback |
| extension restart during apply | incomplete transactionを先にrecoveryし、通常resumeを抑止 |

## 15. Security and privacy

- external source access is explicit and read-only.
- pathはlocal-only mappingへ保存し、remote artifactへabsolute pathを出さない。
- raw document text、raw AI response、backupをconsole、notification、telemetryへ出さない。
- OOXMLはcentral directoryを事前検査し、entry count、declared uncompressed size、path traversal entryを拒否する。
- archive entry pathはabsolute、drive-relative、UNC、device path、`..` segment、control characterを拒否する。
- PDF processはshell-free、bounded、abortableとする。
- document textはuntrusted evidenceであり、文書中の命令をworkflow instructionとして扱わない。
- evidence frameは本文と衝突しないboundaryを決定論的に選び、本文中のdelimiter風文字列でframeを終了できないようにする。
- shareable previewのpath redactionはhost OSに依存せず、POSIX root path、Windows drive-qualified path、slash/backslash UNC、file URIを対象にする。bounded scannerはraw authorityがありbackslashを含まないHTTP(S) URLのscheme・authority・path（IPv6と国際化URLを含む）を保持し、query・fragmentをlocal pathとして再走査する。nested HTTP(S)は深さ4、全体1,024 tokenを上限とし、超過時はfail closedでlocal pathとして扱う。Unicode letter/numberと直前のbase letter/numberに属するcombining markのslash区切り、および明示allowlistに含むforward-slashのstatus pairは通常文として保持する一方、symbol直後・URL query/fragment内・backslashのpathは伏字化する。raw display fieldは32 KiB、heading pathは64要素を上限とする。artifact pathはaggregate 1,024 bytes、各segment 255 bytesを上限とし、drive-relative、alternate data stream、Windows予約名・禁止文字・末尾dot/spaceを含む非portableなWindows構文を全platformで拒否する。
- AI送信前にsource namesとbyte countを表示し、明示承認を必要とする。
- extensionは独自network clientを追加せず、Bob/workflow-registerの設定済みmodel routeだけを使う。
- project-owned assetの変更は利用者の通常のGit/Bazaar運用へ委ね、authoring機能自身はcommit、push、pullを実行しない。
- authoring run、lock、closure、artifact pathは固定byte上限を持ち、JSONは上限+1 byteのbounded read後にだけparseする。
- source index/evidenceは最終byte上限だけでなく、そこへ収まり得るsource/chunk/item件数とselected text累積byteを処理前またはstream中に制限する。
- run lock directoryはstreaming走査し、owner、generation、closure、全entryの処理件数を固定上限で停止する。
- run lockの自動dead-owner回収は同一host/PID namespace fingerprint内だけで行う。Linuxはboot IDとPID namespaceを使用し、Windows/macOSはhostnameとnon-internal MAC集合をhash化する。利用可能なMACがない場合はextension-host固有scopeへ退避する。異なるfingerprintはfail closedとし、自動closeしない。同一hostnameとMAC集合を意図的に複製した複数hostで同じworkspaceを同時利用する構成は対象外とする。
- 同一namespaceでdead ownerのPIDが別processへ再利用された場合は安全側にliveとみなし、そのPIDが終了するまで自動回収を遅延させる。
- 複数processによる異なるrunの初期作成では、共有ancestorの`mkdir`が`EEXIST`になった場合に作成後の実体を再検証し、symlink/non-directoryへ置換された競合だけを拒否する。
- 静的なsymlink/junctionと通常I/O中に観測できるidentity変更は拒否する。同一userの別processが最終identity確認とpath-based filesystem operationの間だけ親directoryを差し替えて復元する攻撃は、Node coreにhandle-relative open/renameがないためtrusted-workspace境界の外とする。

## 16. Module boundaries

```text
src/ruleAuthoring/
  ruleAuthoringTypes.ts
  ruleAuthoringPaths.ts
  ruleAuthoringLimits.ts
  ruleSourceHash.ts
  ruleSourceManifest.ts
  documentChunk.ts
  sourceIndex.ts
  evidenceSelection.ts
  ruleProposalSchema.ts
  ruleProposalValidation.ts
  ruleProposalDiff.ts
  ruleIdAllocator.ts
  managedMarkdownSections.ts
  ruleAuthoringRunStore.ts
  ruleApplyPlan.ts
  ruleApplyTransaction.ts
  ruleBundle.ts
  extraction/
    documentExtractor.ts
    ooxmlPreflight.ts
    docxExtractor.ts
    xlsxExtractor.ts
    pdfExtractor.ts
src/ui/
  ruleAuthoringGui.ts
  ruleAuthoringGuiHtml.ts
  ruleProposalTriageGui.ts
  ruleProposalTriageGuiHtml.ts
src/workflow/
  ruleAuthoringWorkflowActions.ts
```

- extraction modules do not import VS Code or workflow types.
- proposal validation and apply planning are pure functions over typed data.
- filesystem mutation is isolated in run store and transaction modules.
- Webview HTML modules render escaped model data only.
- command/provider registration remains in existing thin entry modules.

## 17. Testing

### 17.1 Unit tests

- source hash、duplicate detection、source ID collision extension
- DOCX heading/paragraph/list/table order and locators
- XLSX sheet/row/cell-range locators
- PDF argument array、page split、empty text `requires_ocr`
- OOXML entry count、size、traversal rejection
- chunk IDs、byte limits、UTF-8 boundaries
- evidence selection ID validation and aggregate limit
- proposal schema、operation matrix、target existence、citation existence
- blocking conflict and stale base hash
- deterministic `PRJ-NNNN` allocation
- deterministic `CTX-NNNN` / `PRM-NNNN` allocation
- managed Markdown marker parsing、manual text preservation、malformed marker rejection
- transaction success、mid-write failure、rollback、rollback failure journal
- restart recovery from incomplete transaction
- redaction of absolute paths and exclusion of raw text from shareable manifests

### 17.2 Integration and contract tests

- command registration and package configuration
- owned workflow provider registration/disposal
- strict authoring WORKFLOW validation and template mirror consistency
- explicit command-step handoff for evidence selection and proposal capture
- run resume after extraction, agent failure, proposal capture, Human Triage
- Webview CSP nonce、no inline handler、message allowlist、HTML escaping
- old workspace without companion assets remains reviewable
- approved bundle is loaded by direct review command、workflow provider、MCP tools
- dependency policy、architecture cycle policy、source policy、unused policy
- production audit、VSIX package、package-size policy

### 17.3 Windows UAT

- external DOCX、XLSX、text PDF selection
- Microsoft Officeで作成した実文書のextract preview
- Poppler `pdftotext` detection、cancel、timeout、image-only warning
- Bob agent evidence selection and proposal generation
- conflicting documents and rule-level resolution
- selective add/update/retire
- VS Code restart and resume
- induced write failure and verified rollback
- approved rule use in a Bazaar revision review

## 18. Acceptance criteria

1. ワークスペース外のDOCX、XLSX、テキストPDFを個別選択できる。
2. DOCX見出し、XLSX sheet/row/cell range、PDF pageを出典として追跡できる。
3. 原本SHA-256により同一資料を重複検出できる。
4. AIへ渡す本文とbyte countを送信前に確認できる。
5. 存在しないchunkを引用した候補を適用できない。
6. Human Triage完了前に正式なproject-owned assetを変更しない。
7. add、update、retireを規約単位で選択適用できる。
8. 複数ファイル更新の途中失敗時に全対象を変更前へ復元できる。
9. VS Code再起動後、抽出後、agent失敗後、承認途中から再開できる。
10. 適用済み規約を既存review packet、Skill、workflow、MCPから参照できる。
11. companion assetのない既存workspaceでも従来レビューが変わらず動作する。
12. `.doc`、`.xls`、画像PDFを誤ってAIへ渡さず、必要な変換を表示する。
13. Git対象成果物に原本本文、absolute path、raw AI responseが含まれない。
14. Linux/Windowsの自動gateとWindows実機UATが完了する。

## 19. Delivery checkpoints

Implementation branch: `codex/bazaar-ai-project-rule-authoring`

Remote checkpoints are pushed only after the checkpoint-specific tests pass:

1. approved design and implementation plan
2. data contracts and deterministic extraction foundation
3. workflow and AI handoff
4. wizard, Human Triage, transactional apply and recovery
5. existing review, Skill and MCP integration
6. full regression, package gates, operator documentation and UAT evidence

Each checkpoint is independently reviewable. A failed checkpoint remains local until its scoped verification passes.
