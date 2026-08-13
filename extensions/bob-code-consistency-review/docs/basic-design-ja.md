# bob-code-consistency-review 基本設計書

## 1. 目的

`bob-code-consistency-review`は、コード変更と要求、基本設計、詳細設計、テスト仕様の整合性を、正式レビュー前にIBM BobでプレレビューするためのVS Code拡張機能である。

通常operatorの公開入口は次の1件だけである。

```text
Bob Code Consistency Review: 整合プレレビューを開始
```

内部Command IDとworkflow providerは互換性のため登録を維持するが、通常のCommand Paletteへ表示しない。

本拡張はVCS差分、文書抜粋、コード根拠、対応候補、evidence IDを固定した`review-package`を生成する。Bobはこのpackageを根拠として不整合候補と確認事項を抽出し、最終判断は人間が行う。

## 2. 設計目標

- review対象を`review-input.yaml`で明示する。
- 上流文書を変更できない場合はtraceability sidecarを使用する。
- Git / Bazaar差分、文書、コードをbounded evidenceへ変換する。
- Bobへ渡す情報をvalidated review-packageへ限定する。
- Bob outputと人間decisionを別の正本へ保存する。
- stale source、stale revision、partial writeをfail-closedで拒否する。
- workflow-register未導入時もlocal GUIとpreprocessを利用可能にする。

## 3. スコープ

### 3.1 対象

- bundled `WORKFLOW.md`、`review-input.yaml`雛形、placeholder文書の初期化。
- `review-input.yaml`の対話作成、AI draft、diagnostics、repair。
- traceability catalogの読込、編集、検証、gate report。
- accepted traceabilityからのreview-input生成。
- Git / Bazaar差分とlanguage分類。
- Markdown / DOCX / XLSXからのbounded文書抜粋。
- C / C++軽量解析とその他言語のgeneric code evidence。
- review-packageと`bob-input.md`生成。
- Bob outputの抽出、schema / evidence検証、保存。
- `triage-source.yaml`、`triage-decisions.yaml`、projectionの生成・保存。
- `workflow-register` action provider登録。

### 3.2 対象外

- 正式レビューの承認。
- Bob outputの自動採用。
- 任意file全探索による根拠推測。
- commit、push、PR comment等の副作用。
- 完全なC / C++ AST / include graph解析。
- 文書全量のBob投入。
- browser payloadをsource of truthとすること。

## 4. 全体構成

```text
VS Code Extension Host
  └─ bob-code-consistency-review
       ├─ extension.ts
       ├─ workflowProviderRegistration.ts
       ├─ workspaceInitializer.ts
       ├─ commands/
       ├─ core/
       ├─ analyzers/
       ├─ triage/
       └─ webview/
            ├─ consistencyReviewWizard.ts       -> 公開panel owner
            ├─ consistencyReviewWizardStages.ts -> runtime stage contract
            ├─ traceabilityPrepWebview.ts       -> embedded stage service
            ├─ consistencyResultCapture.ts      -> embedded stage service
            └─ consistencyHumanTriage.ts        -> embedded stage service

workflow-register
  └─ bobCodeConsistency.* action providers
```

manifestの`main`は`./out/extension.js`である。`IBM.bob-code`と`local.workflow-register`はsoft dependencyである。

## 5. 整合プレレビュー主GUI

### 5.1 panel lifecycle

`bobCodeConsistency.openReviewWizard`は`src/webview/consistencyReviewWizard.ts`の`openConsistencyReviewWizard`を呼び、view type `bobCodeConsistencyReviewWizard`、title `整合プレレビュー`のpanelを開く。

- 現在実装はcommand呼び出しごとに新しいWebview panelを生成する。
- `enableScripts: true`、`retainContextWhenHidden: true`を使用する。
- panel dispose時にstage generationとoperation generationを進め、遅延完了を無効化する。
- 公開panel typeが1種類であることと、同一panel instanceを再利用することを混同しない。

close / reopen後はdisk上のreview-input、catalog、Bob output、decisionを再読込する。

### 5.2 runtime stage

主GUIのruntime stageは次の4件である。

| runtime stage | 利用者向け役割 |
|---|---|
| `review` | workspace状態、レビュー入力、preprocess、review-package確認 |
| `traceability` | `トレーサビリティ整理` |
| `review-result-capture` | `レビュー結果取り込み` |
| `triage` | `指摘確認・振り分け` |

workspace初期化、レビュー入力作成、traceabilityからの入力生成、validation、preprocessはreview stage内のactionであり、独立したruntime stageではない。

`traceabilityPrepWebview.ts`、`consistencyResultCapture.ts`、`consistencyHumanTriage.ts`は同じ主GUIの`embedded stage` serviceであり、独立panelを作らずmodel、HTML、action handlerを提供する。

stale render token、古いstage generation、異なるworkspace、古いsource SHA / decision revisionを拒否する。

## 6. Workspace初期化

`bobCodeConsistency.initializeWorkspace`は次を扱う。

```text
.bob/workflows/code-consistency-review/WORKFLOW.md
review-input.yaml
docs/review-input-placeholder.md
.gitignore
```

bundled workflowはcurrent bytesとtemplate bytesを比較する。変更時はtransaction lock、temporary file、backup、identity / bytes確認、atomic publication、rollbackを行う。

`review-input.yaml`がmissingなら雛形を作成する。既存`review-input.yaml`を上書きせずbackupだけ作成し、operator固有のreview scopeを暗黙変更しない。

path containment、symlink / junction、parent identity、stale file expectationをwrite前に検証する。

## 7. `review-input.yaml`

`review-input.yaml`は整合プレレビューの起点である。

| 項目 | 説明 |
|---|---|
| `review.id` | review identity |
| `review.title` | 表示名 |
| `review.change_type` | bugfix / feature / spec_change / refactor / performance / maintenance |
| `review.base` / `review.head` | VCS比較範囲 |
| `review.vcs` | git / bazaar / bzr |
| `review.vcs_root` | VCS rootをworkspace rootと分ける場合のpath |
| `artifacts` | 要求、設計、テスト、台帳、ticket |
| `review_focus` | 整合観点 |
| `analysis_options` | 解析深度と上限 |
| `bob_options` | prompt、output、evidence contract |

対話入力、AI draft、accepted traceabilityはdraft modelとしてhost側builderとschema validatorを通し、normalized YAMLへ変換する。AIやbrowserから受け取ったtextを直接fileへ保存しない。

## 8. Traceability sidecar

既定path:

```text
.bob-trace/traceability-catalog.json
.bob-trace/gate-report.md
```

catalogはdomain、item、link、decision、source locator、source hash、revisionを保持する。`traceability` stageではitem、link、decision、gate report、review-input previewを扱う。

browserはaction intentだけを送り、save ownership、revision check、backup、validationはExtension Hostが持つ。AI draftはproposed itemだけを生成し、人間がacceptedにするまで正式根拠へ昇格させない。

## 9. 前処理pipeline

```text
review-input validation
→ VCS diff collection
→ document extraction
→ code evidence generation
→ traceability mapping
→ review-package assembly
→ bob-input.md generation
```

GitとBazaarはargument arrayを使い、shell文字列連結を避ける。Bazaarは`bzr --no-aliases`を使用する。timeout、AbortSignal、output limit、physical root containmentを適用する。

文書抽出はsource locatorとtruncationを保持する。C / C++はchanged function、call candidate、global、macro等を抽出し、その他言語はdiff hunk単位のgeneric evidenceを生成する。

## 10. review-package

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

manifestはreview ID、package ID、VCS range、source hash、tool version、artifact inventory、bytes、truncationを保持する。Bobへ渡すのはvalidated packageだけであり、workspaceの任意fileを追加探索させない。

## 11. レビュー結果取り込み

Bob outputはworkflow handoff、clipboard、editor、manual textから抽出する。

1. byte上限を確認する。
2. YAMLをparseする。
3. schema versionとrequired fieldを検証する。
4. evidence IDを`evidence-index.json`と照合する。
5. review IDとpackage identityを照合する。
6. fixed output pathへ保存する。
7. triage sourceを準備する。

validation errorがある場合はcurrent outputを置換しない。

## 12. 指摘確認・振り分け

sourceとdecisionを分離する。

```text
.bob-review/human-triage/
  triage-source.yaml
  triage-decisions.yaml
  triage-result.yaml
  accepted-findings.md
  rejected-findings.md
  investigation-items.md
  questions-to-author.md
  follow-up-actions.md
  migration-report.md
```

- `triage-source.yaml`はimmutable Bob-output-derived snapshot。
- `triage-decisions.yaml`は`source_id` keyed human decision store。
- `triage-result.yaml`とMarkdownはgenerated projection。
- source hash mismatchは`TRIAGE_SOURCE_CHANGED`。
- stale decision revisionは`TRIAGE_REVISION_CONFLICT`。
- successful saveごとにrevisionを1増やす。
- staged multi-file replacementとrollbackを行う。
- legacy projectionはmatching IDだけを移行する。

Bobはdecisionを自動確定しない。

## 13. workflow-register連携

source ownerは`local.bob-code-consistency-review`である。providerはallowed option keyだけを採用し、workspace root、run ID、workflow path等を明示contextとして渡す。

主なprovider群:

```text
workspace / review-input
traceability draft / validation / apply
preprocess
capture / validate Bob output
triage
```

`bobCodeConsistency.openTraceabilityPrep`は独立panelを作らず、主GUIを`traceability` stageで開く。provider登録失敗をcore activation failureへ変えない。

## 14. セキュリティ

- CSP nonce、HTML escape、message allowlistを維持する。
- path containmentをphysical identityで検証する。
- symlink、junction、hard-link replacement、workspace escapeを拒否する。
- subprocessはshellを使わず、timeoutとoutput limitを適用する。
- secret、文書本文、Bob output本文、decision本文をrelease evidenceへ保存しない。
- source hash、revision、file expectationをwrite前に再検証する。
- Bob outputやAI draftを人間decisionなしで正式承認へ使用しない。

## 15. テスト方針

- exact public command inventoryが1件。
- view type `bobCodeConsistencyReviewWizard`とtitle `整合プレレビュー`。
- runtime stage unionとreview stage actionの分離。
- render token、generation、stale async completion。
- workflow template backup / publication / rollback。
- 既存`review-input.yaml`を上書きせずbackupだけ作成。
- review-input builder / schema / path validation。
- traceability revision、backup、gate report、AI proposed-only merge。
- Git / Bazaar、encoding、document / code evidence、resource limit。
- review-package manifest、hash、size、truncation。
- triage source / decision、conflict、projection、transaction、migration。
- Ubuntu / Windowsの同一headでunit、policy、package、VSIX、Extension Host smoke。
- 実IBM Bob UAT、keyboard-only、200% zoom、High Contrast、Console error 0件。
