---
schemaVersion: workflow-register/v1
name: code-consistency-review
description: 文書候補収集から traceability catalog と review-input.yaml を作成し、コード変更を要求書・設計書・テスト仕様書と照合する整合プレレビューを実施します。
title: コード整合プレレビュー
category: code-review
mode: agent
todo: true
todoRequired: true
todoAsSteps: true
stepCompletion: manual
stepMessage: step
permissions:
  - read
  - mcp
  - skill
  - todo
autoApproval: true
workspaceRequired: false
requires:
  workspace: true
  bob:
    minVersion: "2.0.0"
guardrails:
  allowedCommands:
    - bobCodeConsistency.prepareAiTraceabilityDraft
    - bobCodeConsistency.applyAiTraceabilityDraft
    - bobCodeConsistency.openTraceabilityPrep
    - bobCodeConsistency.validateTraceabilityCatalog
    - bobCodeConsistency.createReviewInputFromTraceability
    - bobCodeConsistency.preprocess
    - bobCodeConsistency.captureBobOutput
    - bobCodeConsistency.validateOutput
    - bobCodeConsistency.triage
  deniedCommands:
    - shell
    - file.writeOutsideBob
  requireApproval:
    - id: traceability-human-approval
      when: ".bob-trace/traceability-catalog.json contains proposed domains, items, links, or decisions"
      message: traceability catalog の proposed 候補は、Webview で人間が承認・棄却・廃止を判断してから review-input.yaml へ変換してください。
    - id: large-review-package
      when: ".bob-review/review-package/bob-input.md is too large for one review pass"
      message: review-package が1回のレビューには大きすぎます。パッケージを分割し、slice ごとにこのワークフローを実行してください。
inputs:
  reviewId:
    type: string
    title: review.id
    default: code-consistency-review
  reviewTitle:
    type: string
    title: review.title
    default: コード整合プレレビュー
  reviewPurpose:
    type: string
    title: review.purpose
    default: 要求・設計・テスト仕様とコード変更の整合性を確認する
  changeType:
    type: select
    title: 変更種別
    default: maintenance
    options:
      - bugfix
      - feature
      - spec_change
      - refactor
      - performance
      - maintenance
  vcs:
    type: select
    title: VCS
    default: git
    options:
      - git
      - bazaar
      - bzr
  base:
    type: string
    title: 比較元 revision
    default: HEAD~1
  head:
    type: string
    title: 比較先 revision
    default: HEAD
  vcsRoot:
    type: string
    title: VCS root（任意）
    default: ""
  docsRoot:
    type: string
    title: 文書候補を探索する root
    default: docs
  reviewFocus:
    type: string
    title: review_focus（カンマ区切り）
    default: requirement-code-consistency,design-code-consistency,test-gap
  reviewInputPath:
    type: string
    title: review-input.yaml のパス
    default: review-input.yaml
  traceabilityCatalogPath:
    type: string
    title: traceability catalog のパス
    default: .bob-trace/traceability-catalog.json
  traceabilityGateReportPath:
    type: string
    title: traceability gate report のパス
    default: .bob-trace/gate-report.md
  aiTraceabilityDraftPromptPath:
    type: string
    title: traceability AI draft prompt の出力先
    default: .bob-trace/ai-traceability-draft
  reviewPackagePath:
    type: string
    title: review-package の出力先
    default: .bob-review/review-package
  textEncoding:
    type: string
    title: テキスト読み取り文字コード
    default: auto
  bobOutputPath:
    type: string
    title: Bob 出力 YAML の保存先
    default: .bob-review/bob-output/bob-output.yaml
  triagePath:
    type: string
    title: 人間 triage の出力先
    default: .bob-review/human-triage
tools:
  bobCodeConsistency.prepareAiTraceabilityDraft:
    purpose: 文書候補、既存 catalog、diff summary から traceability AI draft 用 prompt を生成します。
    required: true
    outputKey: traceabilityDraftPrompt
    failurePolicy: stop
  bobCodeConsistency.applyAiTraceabilityDraft:
    purpose: AI が返した proposed-only JSON を .bob-trace/traceability-catalog.json へ merge します。
    required: true
    outputKey: traceabilityCatalog
    failurePolicy: stop
  bobCodeConsistency.openTraceabilityPrep:
    purpose: Traceability Prep Webview を開き、domain / item / link / decision を人間が承認・棄却・廃止します。
    required: true
    outputKey: traceabilityPrep
    failurePolicy: stop
  bobCodeConsistency.validateTraceabilityCatalog:
    purpose: traceability catalog を gate 検証し、.bob-trace/gate-report.md を生成します。
    required: true
    outputKey: traceabilityGate
    failurePolicy: stop
  bobCodeConsistency.createReviewInputFromTraceability:
    purpose: accepted catalog item から review-input.yaml を生成します。
    required: true
    outputKey: reviewInput
    failurePolicy: stop
  bobCodeConsistency.preprocess:
    purpose: review-package と bob-input.md を生成します。
    required: true
    outputKey: reviewPackage
    failurePolicy: stop
  bobCodeConsistency.captureBobOutput:
    purpose: 直前の Bob YAML 出力を .bob-review/bob-output/bob-output.yaml に保存します。
    required: true
    outputKey: captureResult
    inputSource: state
    failurePolicy: stop
  bobCodeConsistency.validateOutput:
    purpose: Bob YAML 出力を schema と package evidence に照らして検証します。
    required: true
    outputKey: validationResult
    failurePolicy: stop
  bobCodeConsistency.triage:
    purpose: 人間確認用 triage ファイルを生成します。
    required: true
    outputKey: triageResult
    failurePolicy: stop
artifacts:
  - id: traceabilityDraftPrompt
    producedBy: collect-document-candidates
    path: .bob-trace/ai-traceability-draft/ai-draft-prompt.md
  - id: traceabilityCatalog
    producedBy: apply-traceability-draft
    path: .bob-trace/traceability-catalog.json
  - id: traceabilityGateReport
    producedBy: validate-traceability-catalog
    path: .bob-trace/gate-report.md
  - id: reviewInput
    producedBy: create-review-input-from-traceability
    path: review-input.yaml
    schema: docs/workflows/code-consistency-review/schemas/review-input.schema.json
  - id: reviewPackage
    producedBy: preprocess-review-package
    path: .bob-review/review-package
  - id: bobInput
    producedBy: preprocess-review-package
    path: .bob-review/review-package/bob-input.md
  - id: bobOutput
    producedBy: capture-bob-output
    path: .bob-review/bob-output/bob-output.yaml
    schema: docs/workflows/code-consistency-review/schemas/bob-output.schema.json
  - id: triage
    producedBy: human-triage
    path: .bob-review/human-triage
completion:
  summary: markdown
  includeArtifacts: true
  validateResult: true
  visualization:
    type: mermaid
    enabled: false
steps:
  - id: collect-document-candidates
    title: 文書候補と差分サマリを収集
    type: command
    action:
      provider: bobCodeConsistency.prepareAiTraceabilityDraft
    prompt: |
      docsRoot 配下の要求書・設計書・テスト仕様書・QA表・レビュー指摘候補と、base/head の差分サマリを収集し、traceability AI draft 用 prompt を生成してください。
      ここでは元文書を変更せず、候補抽出と prompt 作成だけを行います。
    sendResult: true
    resultKey: traceabilityDraftPrompt
    maxResultBytes: 30000
    required: true
    completeOnSuccess: true
  - id: generate-traceability-draft
    title: AI が traceability proposed draft JSON を作成
    type: agent
    required: true
    includeState:
      - traceabilityDraftPrompt
    stateRequired: true
    resultKey: traceabilityDraftJson
    maxResultBytes: 60000
    prompt: |
      .bob-trace/ai-traceability-draft/ai-draft-prompt.md または state の traceabilityDraftPrompt を読み、`.bob-trace/traceability-catalog.json` に merge するための AI draft JSON を作成してください。

      厳守事項:
      - 出力は JSON object のみ。Markdown、YAML、説明文、コメントは禁止。
      - status は必ず proposed にしてください。
      - item に id を設定してはいけません。proposed_id だけを使ってください。
      - link に from / to を設定してはいけません。proposed_from / proposed_to だけを使ってください。
      - accepted / rejected / deprecated は人間だけが決めます。
      - 不確かな対応は無理に補完せず、proposed 候補として残してください。
  - id: copy-traceability-draft-json
    title: traceability draft JSON を clipboard へコピー
    type: manual
    required: true
    includeState:
      - traceabilityDraftJson
    stateRequired: true
    prompt: |
      前段の traceabilityDraftJson の JSON object 全文を clipboard へコピーしてください。
      次の command step は clipboard から JSON を読み取り、proposed-only として検証して sidecar catalog へ merge します。
  - id: apply-traceability-draft
    title: AI draft JSON を sidecar catalog に反映
    type: command
    action:
      provider: bobCodeConsistency.applyAiTraceabilityDraft
    prompt: |
      clipboard の traceability AI draft JSON を読み取り、accepted 状態を含まないことを検証して `.bob-trace/traceability-catalog.json` へ merge してください。
      merge 後に `.bob-trace/gate-report.md` も生成してください。
    sendResult: true
    resultKey: traceabilityCatalog
    maxResultBytes: 30000
    required: true
    completeOnSuccess: true
  - id: approve-traceability-catalog
    title: Traceability Prep で候補を人間承認
    type: command
    action:
      provider: bobCodeConsistency.openTraceabilityPrep
    prompt: |
      Traceability Prep Webview を開き、Domains / Items / Links / Decisions を確認してください。
      人間が候補を Approve / Reject / Deprecate し、Save で `.bob-trace/traceability-catalog.json` と `.bob-trace/gate-report.md` を保存してください。
      Save 後、この step を手動で完了してください。
    sendResult: true
    resultKey: traceabilityPrep
    maxResultBytes: 12000
    required: true
    completeOnSuccess: false
  - id: validate-traceability-catalog
    title: traceability catalog を gate 検証
    type: command
    action:
      provider: bobCodeConsistency.validateTraceabilityCatalog
    prompt: |
      accepted item / accepted link / accepted n/a decision に基づいて traceability gate を検証してください。
      error が残っている場合は review-input.yaml を生成せず、Traceability Prep へ戻してください。
    sendResult: true
    resultKey: traceabilityGate
    maxResultBytes: 20000
    required: true
    completeOnSuccess: true
  - id: create-review-input-from-traceability
    title: traceability catalog から review-input.yaml を生成
    type: command
    action:
      provider: bobCodeConsistency.createReviewInputFromTraceability
    includeState:
      - traceabilityGate
    stateRequired: true
    prompt: |
      accepted catalog item から ReviewInputDraft を作成し、ReviewInputBuilder と schema validator を通して review-input.yaml を生成してください。
      traceability gate error または関連文書パスの欠落がある場合は停止してください。
    sendResult: true
    resultKey: reviewInput
    maxResultBytes: 20000
    required: true
    completeOnSuccess: true
  - id: preprocess-review-package
    title: review-package と bob-input.md を生成
    type: command
    action:
      provider: bobCodeConsistency.preprocess
    includeState:
      - reviewInput
    stateRequired: true
    prompt: |
      review-input.yaml から review-package を生成してください。入力検証エラーまたは関連文書の欠落が報告された場合は停止してください。
    sendResult: true
    resultKey: reviewPackage
    maxResultBytes: 20000
    required: true
    completeOnSuccess: true
  - id: run-bob-pre-review
    title: bob-input.md を使って整合プレレビューを実行
    type: agent
    required: true
    includeState:
      - reviewPackage
    stateRequired: true
    resultKey: bobReviewResult
    maxResultBytes: 40000
    prompt: |
      .bob-review/review-package/bob-input.md を読み、そこに定義された整合プレレビューだけを実施してください。

      あなたの役割は、要求書、基本設計書、詳細設計書、テスト仕様書、台帳、チケット、変更コードの間で、根拠に基づく不整合候補と人間への確認事項を抽出することです。

      厳守事項:
      - 最終承認をしてはいけません。
      - 変更が完全に網羅されていると断定してはいけません。
      - 根拠が不足していることを、正しさの証明として扱ってはいけません。
      - すべての finding には package 内の具体的な evidence を含めてください。
      - 根拠が弱い場合は finding ではなく question として出力してください。

      docs/workflows/code-consistency-review/schemas/bob-output.schema.json に一致する YAML を返してください。final_approval の値は必ず not_performed にしてください。
  - id: capture-bob-output
    title: Bob YAML 出力を取り込み
    type: command
    action:
      provider: bobCodeConsistency.captureBobOutput
    includeState:
      - bobReviewResult
    stateRequired: true
    prompt: |
      直前の Bob YAML 出力を .bob-review/bob-output/bob-output.yaml に保存してください。
    sendResult: true
    resultKey: captureResult
    maxResultBytes: 10000
    required: true
    completeOnSuccess: true
  - id: validate-bob-output
    title: Bob YAML 出力を検証
    type: command
    action:
      provider: bobCodeConsistency.validateOutput
    prompt: |
      取り込んだ Bob YAML 出力を schema と evidence-index.json に照らして検証してください。検証エラーが残っている間は続行しないでください。
    sendResult: true
    resultKey: validationResult
    maxResultBytes: 20000
    required: true
    completeOnSuccess: true
  - id: human-triage
    title: 人間確認用 triage ファイルを生成
    type: command
    action:
      provider: bobCodeConsistency.triage
    prompt: |
      triage-result.yaml、accepted-findings.md、rejected-findings.md、questions-to-author.md、follow-up-actions.md を生成してください。
    sendResult: true
    resultKey: triageResult
    maxResultBytes: 20000
    required: true
    completeOnSuccess: true
  - id: handoff-formal-review
    title: 正式レビューへの引き継ぎを作成
    type: agent
    required: true
    includeState:
      - traceabilityGate
      - reviewPackage
      - validationResult
      - triageResult
    stateRequired: true
    prompt: |
      正式な人間レビューへ渡すための簡潔な Markdown 引き継ぎを作成してください。

      含める内容:
      - レビュー対象と package path
      - traceability gate の error / warning 状況
      - 採用候補のプレレビュー指摘
      - 作成者への確認事項
      - 検証エラーまたは warning があればその内容
      - 不足しているテストまたは文書更新の gap
      - Bob はこの変更を承認していない、という明示的な注記

      出力は引き継ぎサマリに限定し、最終レビュー判断として書かないでください。
---
# コード整合プレレビュー

## 目的

文書候補の収集、traceability sidecar catalog の整備、review-input.yaml の生成、review-package 作成、Bob による整合プレレビュー、人間 triage までを一連の手順として実行します。

このワークフローは `docs/workflows/code-consistency-review/` の仕様を実行手順化し、Bob を支援役に限定します。Bob は仕様単位やリンクの候補、不整合候補、確認事項を提示できますが、traceability の承認、最終解釈、レビュー承認、リスク受容は人間のレビュー担当者が行います。

## 開始地点

`review-input.yaml` が既にある状態だけでなく、要求書・設計書・テスト仕様書・QA表・レビュー指摘などの関連文書候補を集める段階から開始できます。

前段では元文書を変更せず、AI は proposed-only の traceability draft JSON だけを作成します。人間が Traceability Prep Webview で accepted / rejected / deprecated を判断した後、accepted item から `review-input.yaml` を生成します。