# IBM Bob ワークフロー作成・編集ガイド

## 1. 目的

このガイドは、`workflow-register`の公開UIを使ってIBM Bob用ワークフローを作成、検証、保存、実行、改善する手順を定義する。

通常operatorが使う入口は次の2件だけである。

```text
Bob Workflow: ワークフローを作成・編集
Bob: 操作ハブを開く
```

`ワークフロー作成・編集`は標準テンプレートからの作成、既存定義の編集、preview、diagnostics、diff、backup付き保存、AI補助を同じpanelで扱う。`Bob 操作ハブ`は実行、状態確認、pause、resume、review gate、診断、成果物、retentionを扱う。

個別レビューを開始する場合は、用途に応じて次の公開入口を使う。

```text
Bob Bazaar Review: レビューを開始
Bob Bazaar Review: 資料からプロジェクト規約を作成
Bob Code Consistency Review: 整合プレレビューを開始
```

## 2. 前提

- Bob IDEまたはVS Codeで対象workspaceを開いている。
- `workflow-register`がインストールされている。
- IBM Bobとの連携を使う場合は`IBM.bob-code`が利用可能である。
- Bazaarやコード整合プレレビューを使う場合は対応するcompanion extensionが利用可能である。
- workspace外への出力、破壊的VCS操作、未承認commandをワークフローへ含めない。

companion extensionはsoft dependencyである。未導入でもBuilder、validation、standalone engineは利用できる。

## 3. 全体の流れ

1. 作業目的を1文で定義する。
2. `Bob Workflow: ワークフローを作成・編集`を開く。
3. `標準テンプレートから作成`、空の新規作成、既存編集のいずれかを選ぶ。
4. workflow名、入力、step、guardrail、成果物を設定する。
5. previewとdiagnosticsを確認する。
6. 既存fileがある場合はdiffを確認する。
7. 保存を明示確認する。
8. backup作成後にatomic saveされることを確認する。
9. `Bob: 操作ハブを開く`から実行する。
10. 実行診断と成果物を確認し、必要なら同じBuilderで改善する。

## 4. 作業目的を定義する

目的文には入力、処理、出力を含める。

```text
Bazaarの指定revision rangeをプロジェクト規約に照らしてレビューし、検証済みJSONとMarkdownを保存する。
```

| 観点 | 例 |
|---|---|
| 入力 | revision、対象file、設計書、ticket、parameter |
| 処理 | 収集、検証、分析、変換、レビュー、要約 |
| 出力 | JSON、Markdown、checklist、artifact、修正案 |

## 5. workflow名と配置

`name`は安定IDであり、directory名と一致させる。

```text
.bob/workflows/<name>/WORKFLOW.md
```

命名規則:

- 英数字、`.`、`_`、`-`を使う。
- 先頭は英数字にする。
- 空白を使わない。
- 後から変更しにくいため、用途を短く明確に表す。

新規定義では`schemaVersion: workflow-register/v1`を使用する。

## 6. Builderの3モード

### 6.1 標準テンプレートから作成

`ワークフロー作成・編集`で`標準テンプレートから作成`を選ぶ。テンプレート、project profile、customization、readinessは別panelではなく同じBuilder sessionで扱う。

代表テンプレート:

| 用途 | template |
|---|---|
| AIへ1回依頼する | `simple-agent` |
| commandで情報収集後にAIへ渡す | `command-then-agent` |
| 人間確認を段階的に挟む | `manual-checklist` |
| 実行前入力を使う | `input-driven-agent` |
| 必須fileを検査する | `preflight-files` |
| artifactを保存する | `artifact-output` |
| commandの許可・禁止を明示する | `guarded-command` |
| レビュー結果を構造化する | `review-workflow` |

profileとcustomizationを検証し、preview、diff、readinessを確認してから生成する。cancelした場合はworkflow fileとbackup setを変更しない。

### 6.2 空の新規作成

最小構成からstepを追加する。

```md
---
schemaVersion: workflow-register/v1
name: sample-workflow
description: サンプル作業を実行する
title: サンプルワークフロー
mode: agent
workspaceRequired: true
steps:
  - id: analyze
    title: 対象を分析
    type: agent
    prompt: |
      対象を確認し、結果を日本語で要約してください。
---
# サンプルワークフロー
```

### 6.3 既存定義を編集

`workflow-register/v1`の既存fileを選び、parser / loaderでmodel化する。未知front matterやMarkdown bodyを保持し、save前にreference analysisとvalidationを行う。

外部変更、stale session、workspace escape、symlink、validation errorがある場合は保存しない。

## 7. top-levelフィールド

| フィールド | 用途 |
|---|---|
| `name` | 安定workflow ID |
| `description` | 人間とBobが理解できる目的 |
| `title` | 表示名 |
| `inputs` | 実行前入力 |
| `requires` | workspace、Bob version、必須file |
| `preflight` | 実行前check |
| `guardrails` | commandの許可、禁止、承認条件 |
| `stepExecution` | full / todo / engineStepsの表示・実行方式 |
| `stepReview` | step成功後の人間review gate |
| `branching` | 条件分岐、戻りloop、checkpoint |
| `artifacts` | 成果物contract |
| `completion` | 完了時の検証とhandoff |
| `steps` | 実行順序 |

Builderは参照切れ、前方参照、重複ID、`artifact.producedBy`不整合、危険なpathを保存前に表示する。

## 8. step種別

| type | 選択基準 |
|---|---|
| `command` | 登録済みaction providerで決定論的処理を行う |
| `agent` | AIに判断、要約、分析、生成を依頼する |
| `manual` | 人間の入力、確認、承認を待つ |
| `result` | stateやagent結果をsinkへ保存する |

作業は通常3〜7stepへ分割する。1stepへ過剰な責務を集めず、入力収集、検証、AI処理、保存を分離する。

## 9. state flow

前段結果は`resultKey`へ保存し、後段の`includeState`または`result.source: state`から参照する。

```yaml
steps:
  - id: collect-context
    title: 対象情報を収集
    type: command
    action:
      provider: bobBazaar.collectReviewContext
    resultKey: reviewContext
    required: true

  - id: analyze
    title: 変更を分析
    type: agent
    includeState:
      - reviewContext
    resultKey: analysisReport
    prompt: |
      reviewContextを根拠として分析してください。
```

存在しない`resultKey`、現在stepより後でしか生成されないkey、不明なmanual form / approval resultを参照するとdiagnosticsになる。

## 10. 入力

```yaml
inputs:
  target:
    type: string
    title: 対象pathまたはtopic
    required: true
  outputStyle:
    type: select
    title: 出力形式
    required: true
    options:
      - concise
      - detailed
```

promptでは`{{inputs.target}}`の形式で参照する。unknown placeholderは解決できないまま残るため、previewで確認する。

## 11. preflightとguardrails

必須fileがある場合は`requires`と`preflight`を定義する。

```yaml
requires:
  workspace: true
  files:
    - .bob/review/checklist.json
preflight:
  - id: required-review-files
    title: 必須レビューfileを確認
    required: true
    files:
      - .bob/review/checklist.json
    failurePolicy: stop
```

command stepはallowlist / denylistを明示する。

```yaml
guardrails:
  allowedCommands:
    - bobBazaar.collectReviewContext
  deniedCommands:
    - bzr.commit
    - bzr.push
```

同じcommandをallowed / deniedの両方へ置かない。workspace外書込み、VCS commit / push / revert / merge、shell文字列連結を許可しない。

## 12. artifactとresult sink

```yaml
artifacts:
  - id: report
    producedBy: write-report
    path: .bob/artifacts/sample-report.md
completion:
  includeArtifacts: true
steps:
  - id: write-report
    title: レポートを保存
    type: result
    result:
      source: state
      stateKey: analysisReport
      sinks:
        - type: file
          path: .bob/artifacts/sample-report.md
```

`file` sinkはworkspace外pathを拒否する。artifactの本文、size、checksum、producer identityはrun stateとmanifestの契約に従う。

## 13. manual input、承認、分岐

manual stepはformまたはapprovalを持てる。

```yaml
- id: user-approval
  title: 人間が内容を確認
  type: manual
  approval:
    resultKey: userApproval
    approveLabel: 承認
    rejectLabel: 差し戻し
```

step-level `transition`とtop-level `branching`を組み合わせると、決定的な条件で過去stepへ戻せる。backward `goto`にはnamed loopと上限を必須とし、上限到達時は`checkpoint`で停止する。

通常operatorはcheckpoint、manual待ち、review gateを`Bob 操作ハブ`のrun cardから処理する。内部Command IDはworkflow、panel action、API互換用に登録を維持するが、通常手順としてCommand Paletteへ列挙しない。

## 14. preview、diagnostics、diff、save

保存前の順序:

1. modelをcanonical化する。
2. Markdownへserializeする。
3. parser / validatorで再検証する。
4. reference analysisを実行する。
5. previewとdiagnosticsを表示する。
6. 既存fileがある場合はdiffを表示する。
7. operatorの明示確認を得る。
8. target pathとopen時file expectationを再検証する。
9. transaction lockを取得する。
10. 既存fileをbackupする。
11. temporary fileからatomic commitする。
12. catalogをreloadする。

cancel、stale generation、external change、unsafe path、validation errorではno-changeとする。

## 15. 実行と診断

保存後は`Bob: 操作ハブを開く`からworkflowを選び、開始する。実行中または過去runの確認も同じpanelで行う。

run cardから次を利用できる。

- status、current step、updated time
- pause / resume / retry
- accept / accept-and-next
- manual step input
- branch checkpoint
- task snapshot import
- artifact reuse
- run diagnostics
- retention preview / cleanup

`run.json`が実行状態の正本であり、`control.json`はoperator control signalの正本である。task snapshotは補助証跡であり、再開状態の正本ではない。

## 16. AI補助

AI設計、AI改善、diagnostics説明はBuilder内の操作として提供する。AIが返したcandidateは直接保存せず、host側でparser、schema、reference、pathを再検証し、previewとdiffを経て明示確認後に適用する。

AI providerが未設定の場合のfallbackやmock結果を、productionの成功証跡として扱わない。

## 17. レビューchecklist

### 構造

- [ ] `schemaVersion: workflow-register/v1`を使用している。
- [ ] `name`とdirectory名が一致している。
- [ ] step IDが一意で作業順に並んでいる。
- [ ] unknown referenceや前方参照がない。

### 実行

- [ ] provider IDとargsが正しい。
- [ ] `resultKey`と`includeState`が対応する。
- [ ] required stepの失敗時に適切に停止する。
- [ ] manual stepは人間が判断する内容だけを扱う。

### 安全性

- [ ] 破壊的commandを含めない。
- [ ] workspace外へのfile出力がない。
- [ ] diff / result / artifactにsize上限がある。
- [ ] secretや本文をrelease evidenceへ転記しない。

### 運用

- [ ] preview、diagnostics、diffを確認した。
- [ ] backupとatomic saveの結果を確認した。
- [ ] Ubuntu / Windowsの同一source headでtestする。
- [ ] 実IBM Bob UATではkeyboard、200% zoom、High Contrast、Consoleを確認する。

## 18. 関連文書

- `extensions/workflow-register/README.md`
- `extensions/workflow-register/docs/basic-design-ja.md`
- `extensions/workflow-register/docs/detailed-design-ja.md`
- `extensions/workflow-register/docs/unit-test-spec-ja.md`
- `extensions/workflow-register/docs/real-machine-test-spec-ja.md`
- `extensions/bob-bazaar-review/README.md`
- `extensions/bob-code-consistency-review/README.md`
