# bob-code-consistency-review 基本設計書

## 1. 目的

`bob-code-consistency-review`は、コード変更と要求、基本設計、詳細設計、テスト仕様の整合性を、正式レビュー前にIBM BobでプレレビューするためのVS Code拡張機能である。

通常operatorの公開入口は次の1件だけである。

```text
Bob Code Consistency Review: 整合プレレビューを開始
```

view type `bobCodeConsistencyReviewWizard`の単一主GUIが、レビュー入力、`トレーサビリティ整理`、前処理、`レビュー結果取り込み`、`指摘確認・振り分け`を同じsessionでrouteする。内部Command IDとworkflow providerは互換性のため登録を維持するが、通常のCommand Paletteへは表示しない。

本拡張はコードや文書を無制限にBobへ渡さず、VCS差分、文書抜粋、コード根拠、対応候補、evidence IDを固定した`review-package`を生成する。Bobはこのpackageを根拠として不整合候補と確認事項を抽出し、最終判断は人間が行う。

## 2. 背景と課題

- コード差分、要求、設計、テスト仕様が別fileへ分散している。
- Markdown、docx、xlsx、複数encodingが混在する。
- Git / Bazaarで差分取得方法が異なる。
- Bobへ全量投入すると対象外情報、根拠不明の断定、token過多が起きやすい。
- C / C++の変更関数、caller / callee候補、global、define、RT / TS観点を整理したい。
- TypeScript、Python、Java、C#等でもdiff hunk単位のコード根拠を作りたい。
- 上流文書へ直接IDを書けない場合もsidecar catalogでtraceabilityを管理したい。
- Bob出力をschemaとevidence indexで検証し、人間decisionへ接続したい。
- source本文と人間decisionを分離し、stale saveやlegacy migrationを安全に扱いたい。

## 3. スコープ

### 3.1 対象範囲

- bundled `WORKFLOW.md`、`review-input.yaml`雛形、placeholder文書の初期化。
- `review-input.yaml`の対話作成、AI draft、diagnostics、repair。
- traceability sidecar catalogの読込、編集、検証、gate report。
- traceability AI draftの提案・適用。
- accepted traceabilityから`review-input.yaml`生成。
- Git / Bazaar差分、rename、binary numstat、language分類。
- Markdown / docx / xlsxからのbounded文書抜粋。
- C / C++軽量解析とその他言語のgeneric code evidence。
- traceability mapと`review-package`生成。
- Bob投入用`bob-input.md`生成。
- Bob output YAMLの抽出、保存、schema / evidence検証。
- `triage-source.yaml`、`triage-decisions.yaml`、projectionの生成・保存。
- `workflow-register` action provider登録。
- single-panel Webview lifecycle、conflict token、backup、transaction。

### 3.2 対象外

- 正式レビューの承認。
- Bob出力の自動採用。
- 任意file全探索による根拠推測。
- commit、push、PR commentなどの副作用。
- 完全なC / C++ AST / include graph解析。
- 文書全量のBob投入。
- 上流仕様書へのtraceability ID直接書込み。
- browser payloadをsource of truthとすること。

## 4. 利用者と利用シーン

| 利用者 | 主な用途 |
|---|---|
| 開発者 | 変更内容と関連文書を選び、review-packageを生成する。 |
| レビュー担当者 | Bobの候補を確認し、`指摘確認・振り分け`を行う。 |
| 設計担当者 | 要求、設計、テスト仕様とコード差分の対応を確認する。 |
| traceability管理者 | sidecar catalogでID、link、decision、gate reportを管理する。 |
| workflow設計者 | `workflow-register` stepから本拡張のproviderを呼ぶ。 |
| 導入担当者 | 初期化、backup、package、実機UATを確認する。 |

## 5. 全体構成

```text
VS Code Extension Host
  └─ bob-code-consistency-review
       ├─ extension.ts
       ├─ extensionCommandOptions.ts
       ├─ workflowProviderRegistration.ts
       ├─ workspaceInitializer.ts
       ├─ reviewInputWizard.ts
       ├─ reviewExecutionCommands.ts
       ├─ traceabilityCommands.ts
       ├─ core/
       ├─ analyzers/
       ├─ triage/
       └─ webview/
            ├─ consistencyReviewWizard.ts      -> 唯一のpanel owner
            ├─ traceabilityPrepWebview.ts      -> embedded stage service
            ├─ consistencyResultCapture.ts     -> embedded stage service
            └─ consistencyHumanTriage.ts       -> embedded stage service

workflow-register
  └─ bobCodeConsistency.* action providers
```

manifestの`main`は`./out/extension.js`で固定する。`IBM.bob-code`と`local.workflow-register`はsoft dependencyである。

## 6. 主GUI

### 6.1 lifecycle

`consistencyReviewWizard.ts`だけが公開panelを所有する。

- view type: `bobCodeConsistencyReviewWizard`
- title: `整合プレレビュー`
- session key: workspace root、review ID
- current stageとrender generationをhost側で管理する
- 同じsessionは既存panelをrevealする
- close / reopen後もdisk上のinput、catalog、Bob output、decisionを再読込する

### 6.2 stage

```text
レビュー入力
→ トレーサビリティ整理
→ 前処理・レビュー資料生成
→ レビュー結果取り込み
→ 指摘確認・振り分け
```

`traceabilityPrepWebview.ts`、`consistencyResultCapture.ts`、`consistencyHumanTriage.ts`は独立panelを作らず、主GUIへmodel、HTML fragment、action handlerを提供する。

stale render token、異なるworkspace、異なるreview ID、古いsource SHA / decision revisionを拒否する。

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
| `analysis_options` | 解析言語、深度、sidecar利用 |
| `bob_options` | prompt、output、evidence contract |

Wizard、AI、traceabilityからはdraft modelを作り、host側builderとschema validatorを通してYAMLへ保存する。

## 8. Workspace初期化

`bobCodeConsistency.initializeWorkspace`は次を扱う。

```text
.bob/workflows/code-consistency-review/WORKFLOW.md
review-input.yaml
docs/review-input-placeholder.md
```

bundled workflowはcurrent bytesとtemplate bytesを比較し、変更時はbackup後に更新する。一方、既存`review-input.yaml`を上書きせずbackupだけ作成する。operatorが入力したreview scopeをinitializerが暗黙置換してはならない。

path containment、symlink / junction、stale file expectation、backup publicationを検証する。

## 9. Traceability sidecar

上流文書を変更できない場合、sidecar catalogへ次を保存する。

- domains
- items
- links
- decisions
- source locator
- source hash
- status: proposed / accepted / rejected / deprecated

`トレーサビリティ整理`stageではitem、link、decision、gate report、review-input previewを編集する。browserはaction intentだけを送り、save ownership、revision check、backup、validationはextension hostが持つ。

AI draftはproposed itemだけを生成し、人間がacceptedにするまでreview inputの正式根拠へ昇格させない。

## 10. 前処理pipeline

```text
review-input validation
→ VCS diff collection
→ document extraction
→ code evidence generation
→ traceability mapping
→ review-package assembly
→ bob-input.md generation
```

### 10.1 VCS

Gitはargument arrayと`--no-ext-diff`等の安全optionを使う。Bazaarは`bzr --no-aliases`を使う。どちらもshell文字列連結を避け、timeout、AbortSignal、output limit、physical root containmentを適用する。

### 10.2 文書抽出

- Markdownはheading / line rangeを保持する。
- docxはparagraph / tableを抽出する。
- xlsxはsheet / cell rangeを抽出する。
- decode結果とtruncationをevidence metadataへ記録する。
- absolute local pathや文書全量をBob inputへ含めない。

### 10.3 コード根拠

C / C++は変更関数、call candidate、global、define、RT禁止候補を抽出する。その他の対応言語はdiff hunk単位で`SRC-*` evidenceとcode sliceを生成する。

## 11. review-package

代表出力:

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

manifestはreview ID、source hashes、tool version、VCS range、artifact inventoryを保持する。Bobへ渡すのはvalidated packageだけであり、workspaceの任意fileを追加探索させない。

## 12. `レビュー結果取り込み`

Bob output YAMLはresult handoff、clipboard、editor、text inputから抽出する。

1. size上限を確認する。
2. YAMLをparseする。
3. schema versionとrequired fieldを検証する。
4. evidence IDが`evidence-index.json`に存在することを確認する。
5. review IDとpackage identityを照合する。
6. fixed output pathへ保存する。
7. validation reportを主GUIへ表示する。

不正なoutputを保存成功として扱わない。

## 13. `指摘確認・振り分け`

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
- legacy `triage-result.yaml`はmatching IDだけ一度移行する。

Bobはdecisionを自動確定しない。

## 14. workflow-register連携

`workflowProviderRegistration.ts`は`local.workflow-register`が利用可能な場合だけproviderを登録する。provider source ownerは`local.bob-code-consistency-review`である。

provider group:

- workspace / review-input: initialize、create、AI draft、repair、diagnostics
- traceability: AI draft、capture、apply、open stage、validate、create input
- review execution: preprocess、capture output、validate output、triage

`bobCodeConsistency.openTraceabilityPrep`は独立panelを作らず、保持中の`bobCodeConsistencyReviewWizard`を`トレーサビリティ整理`stageへrouteする。

## 15. セキュリティ

- browser messageはallowlistとrender tokenを検証する。
- pathはphysical workspace containmentで検証する。
- symlink、junction、hard link、workspace escapeを拒否する。
- external processはshellを使わない。
- source本文、Bob output、decision本文をrelease evidenceへ貼り付けない。
- AI draftをhost validationなしで保存しない。
- generated file更新はpreview、明示確認、backup、transactionを通す。
- Bob task object、Promise、callbackを永続化しない。

## 16. テスト方針

- exact public command inventoryが1件であること。
- `bobCodeConsistencyReviewWizard`のsingle-panel lifecycle。
- stage route、close / reopen、stale token拒否。
- workspace initializerのworkflow backupと既存`review-input.yaml`を上書きせずbackupだけの契約。
- review-input builder、schema、AI draft、repair。
- traceability catalog、revision、backup、gate report。
- Git / Bazaar差分、encoding、document extraction、multi-language code evidence。
- review-package manifest、evidence index、size bounds。
- Bob output schema / evidence validation。
- `triage-source.yaml`、`triage-decisions.yaml`、`TRIAGE_SOURCE_CHANGED`、`TRIAGE_REVISION_CONFLICT`、projection、migration、rollback。
- workflow provider ownershipとsoft dependency。
- Ubuntu / Windowsのcompile、unit、package、VSIX policy、Extension Host smoke。
- 実IBM Bob UATのkeyboard-only、200% zoom、High Contrast、Console、result handoff。

詳細は`detailed-design-ja.md`、`unit-test-spec-ja.md`、`real-machine-test-spec-ja.md`に定義する。
