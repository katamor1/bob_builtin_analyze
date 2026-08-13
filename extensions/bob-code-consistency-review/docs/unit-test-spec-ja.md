# bob-code-consistency-review 単体テスト仕様書

## 1. 目的

本書は`bob-code-consistency-review`の自動テスト契約を定義する。対象は公開surface、workspace初期化、review-input、AI draft、traceability sidecar、前処理、文書抽出、Git / Bazaar差分、コード根拠、review-package、Bob出力、指摘確認・振り分け、workflow provider、主GUI lifecycle、documentation contractである。

## 2. 実行方式

| 項目 | 内容 |
| --- | --- |
| compile | `npm run compile` |
| full suite | `node --test test/*.test.js`または`npm test` |
| runner | Node.js built-in test runner |
| VS Code / Bob | mock / stub |
| VCS | fixture / fake process / temporary Git repository |
| filesystem | `fs.mkdtemp()`でtestごとに隔離 |

## 3. 公開surface

### CCR-UT-SURFACE-001 公開Command Palette entry

常時表示は次の1件だけである。

```text
bobCodeConsistency.openReviewWizard | Bob Code Consistency Review | 整合プレレビューを開始
```

その他のcontributed commandは`menus.commandPalette`で`when: "false"`を持つ。activation、contribution、runtime registrationを照合する。

実テスト:

- `test/commandPalettePolicy.test.js`
- `../../scripts/three-extension-command-surface.test.js`

### CCR-UT-SURFACE-002 単一主GUI

- `openConsistencyReviewWizard()`だけがoperator review panelを作る。
- view typeは`bobCodeConsistencyReviewWizard`、titleは`整合プレレビュー`である。
- input、`トレーサビリティ整理`、前処理、`レビュー結果取り込み`、`指摘確認・振り分け`を同じpanelで扱う。
- embedded stage serviceは独立した公開panelを作らない。

実テスト:

- `test/guiFirstSurfaces.test.js`
- `test/consistencyReviewWizardInitialization.test.js`
- `test/consistencyReviewWizardLifecycle.test.js`
- `test/consistencyReviewWizardModelSnapshot.test.js`
- `test/task4CurrentRouteDocs.test.js`

## 4. 主GUI lifecycle

### CCR-UT-LIFE-001 generation / render token

panel-wide generationと暗号学的render tokenを、render、post、stage initialization、model commit、transitionに要求する。

### CCR-UT-LIFE-002 stage namespace

active stageのmessage namespace以外を拒否する。stage initialization完了前のmessageを処理しない。

### CCR-UT-LIFE-003 out-of-order completion

古いstage、same-stage ABA、dispose後、superseded initializationの完了が現在のmodelを上書きしない。

### CCR-UT-LIFE-004 transition recovery

embedded stage初期化が失敗した場合、利用可能なreview stageへ戻す。初期stage command errorを重複通知しない。

### CCR-UT-LIFE-005 render / post rejection

hostがrenderまたはWebview postを拒否した場合、structured errorを返し成功扱いしない。

主な実テスト:

- `test/consistencyReviewWizardLifecycle.test.js`
- `test/consistencyTraceabilityRecovery.test.js`
- embedded stage lifecycle / concurrency tests

## 5. Workspace初期化

### CCR-UT-INIT-001 bundled workflow create

workflow未存在時にbundled bytesを作成する。

### CCR-UT-INIT-002 workflow update / backup

既存workflowとbundled bytesが異なる場合、既存bytesを1回だけ読み、byte-exact backupを作成してからbundled bytesへ更新する。

### CCR-UT-INIT-003 existing review-input

既存`review-input.yaml`は上書きしない。同じraw bytesからbackupだけを作成し、original fileを変更しない。

### CCR-UT-INIT-004 non-UTF-8

CP932または任意non-UTF-8 Bufferをdecode / normalizeせずbackupする。

### CCR-UT-INIT-005 typed outcomes

`workflowResult`と`reviewInputResult`が個別に`status`、`path`、optional `backupPath`、`message`を返す。aggregate resultとの互換性を維持する。

### CCR-UT-INIT-006 write guard

workspace identity、parent identity、direct file identity、symlink / junction、exclusive create、transaction lockを検証する。

### CCR-UT-INIT-007 `.gitignore`

`.bob-review/`、`.bob-trace/ai-traceability-draft/`、`.bob/workflows/runs/`を重複なく追加する。

実テスト:

- `test/workspaceInitializerExactWrites.test.js`
- initializer lifecycle / lease / path boundary tests

## 6. review-input

### CCR-UT-INPUT-001 schema

required field、enum、number、array、artifact group、review focus、VCSを検証する。

### CCR-UT-INPUT-002 workspace-relative path

absolute、parent traversal、wrong artifact domain、symlink escapeを拒否する。

### CCR-UT-INPUT-003 interactive builder

target、base / head、change type、document candidates、sections、focusをvalidated modelへ変換する。

### CCR-UT-INPUT-004 AI draft

AIは短い`ReviewInputDraft` JSONだけを作る。hostがenum、path、document existence、sizeを再検証して最終YAMLを生成する。

### CCR-UT-INPUT-005 repair

known legacy enumだけをpreview / confirmation / backup付きで修復する。unknown contentを黙って変更しない。

主な実テスト:

- review input parser / validator / builder / draft / repair tests

## 7. Traceability sidecar

### CCR-UT-TRACE-001 catalog schema

schema version、document、domain、item、link、decision、status、ID formatを検証する。

### CCR-UT-TRACE-002 AI proposed-only boundary

AI draftは`status: proposed`だけを作成でき、正式ID / accepted stateを確定できない。

### CCR-UT-TRACE-003 human transition

人間操作だけがaccepted / rejected / deprecatedへ遷移できる。

### CCR-UT-TRACE-004 compare-and-set save

catalog revisionとidentityを再検証し、backup後に保存する。stale writerを拒否する。

### CCR-UT-TRACE-005 gate

欠落link、未承認domain、duplicate ID、unknown source、unresolved QA / review finding、stale anchorをerror / warningへ分類する。

### CCR-UT-TRACE-006 route

`bobCodeConsistency.openTraceabilityPrep`は独立panelを作らず、既存主GUIを`トレーサビリティ整理`stageへrouteする。

実テスト:

- traceability catalog / draft / gate / Webview tests
- `test/traceabilityPrepWebviewAssets.test.js`: CSP-safe assetとscript終端escaping
- `test/traceabilityPrepController.test.js`: 人間decision遷移、restore、gate model
- `test/traceabilityPrepConcurrency.test.js`
- `test/traceabilityPrepWebview.test.js`
- `test/consistencyTraceabilityRecovery.test.js`

## 8. VCS差分

### CCR-UT-VCS-001 Git

一時 Git repositoryでbase / head、rename、空白入りpath、binary numstat、untracked optionを検証する。revision、path、rename、binary分類の現行mappingは`test/vcsValidation.test.js`である。

### CCR-UT-VCS-002 Bazaar

`bzr --no-aliases`、revision / range / working tree、timeout、output cap、decodeを検証する。

### CCR-UT-VCS-003 execution safety

shellを使わずargument arrayを使う。abort、timeout、buffer超過、non-zero exitを分類する。

### CCR-UT-VCS-004 resource caps

raw diff、file count、per-file context、aggregate Bob input上限をUTF-8 bytesで検証する。

設定range、document / excerpt、raw diff、aggregate Bob input、package truncationの現行mappingは`test/sizeLimits.test.js`である。

## 9. 文書抽出

### CCR-UT-DOCX-001 Markdown / text

heading、section ID、table、list、line rangeを抽出する。

### CCR-UT-DOCX-002 Word

`.docx`のparagraph、heading、list、tableをdocument orderで抽出する。

### CCR-UT-DOCX-003 Excel

`.xlsx`のsheet、saved value、Excel row number、cell rangeを抽出する。formulaを再計算しない。

### CCR-UT-DOCX-004 bounded extraction

document size、sheet count、rows per sheet、excerpt bytesを検証し、超過時はfail / bounded warningにする。

### CCR-UT-DOCX-005 privacy

workspace外document、external link refresh、macro、embedded object、image OCRを実行しない。

## 10. コード根拠

### CCR-UT-CODE-001 C / C++

変更関数、caller / callee候補、global access、struct impact、context line上限を検証する。

### CCR-UT-CODE-002 generic languages

TypeScript、JavaScript、Python、Java、C#などをdiff hunk単位のbounded根拠へ変換する。

### CCR-UT-CODE-003 unsupported / binary

binaryとunsupported languageを明示し、意味のない全文をBob inputへ入れない。

## 11. review-package

### CCR-UT-PACKAGE-001 deterministic build

同じinput / repository / documentsからstableなmanifest、evidence ID、orderを生成する。

### CCR-UT-PACKAGE-002 artifact inventory

`manifest.yaml`、`input-normalized.json`、changed files / symbols、document index、evidence index、traceability map、Markdown summary、prompt、code slice、tableを整合させる。

### CCR-UT-PACKAGE-003 workspace transaction

staging、target identity、rename、rollback、cleanupを検証する。途中失敗でpartial packageを残さない。

### CCR-UT-PACKAGE-004 Bob input cap

prompt、diff、excerpt、code sliceを優先順位どおりbounded化し、hard capを超えない。

## 12. レビュー結果取り込み

### CCR-UT-OUTPUT-001 candidate sources

workflow handoff、clipboard、active editor、manual textからYAML candidateを取得する。

### CCR-UT-OUTPUT-002 fixed workspace

embedded stage初期化時にworkspace rootを固定し、後のselection変更で保存先を変えない。

### CCR-UT-OUTPUT-003 schema / evidence

schema、review ID、package ID、evidence reference、final approval禁止を検証する。

### CCR-UT-OUTPUT-004 atomic save

raw、canonical、primary outputをtransactionalに保存し、失敗時に部分成果物を残さない。

### CCR-UT-OUTPUT-005 render / disposal

render拒否、post rejection、stage change、dispose後完了をsuccessにしない。

実テスト:

- `test/resultCaptureStage.test.js`
- output capture / validation / transaction tests

## 13. 指摘確認・振り分け

### CCR-UT-DECISION-001 source snapshot

Bob outputからimmutable `triage-source.yaml`を生成し、source hashを保存する。

### CCR-UT-DECISION-002 decision store

人間decisionを`triage-decisions.yaml`へ保存し、projectionと分離する。

### CCR-UT-DECISION-003 conflict

source hash変更とdecision revision変更を別errorとして拒否する。古いpanelが最新decisionを上書きしない。

### CCR-UT-DECISION-004 validation

accepted、rejected、needs investigation、question、owner、reason、follow-up、due dateを検証する。

### CCR-UT-DECISION-005 projection / backup

成功saveごとにrevisionを1だけ増やし、projectionをdecisionから再生成する。failed saveではinstallしない。

### CCR-UT-DECISION-006 legacy migration

matching itemを移行し、unknown itemをdecision storeへ入れずmigration reportへ残し、legacy fileをbackupする。

実テスト:

- triage core / boundaries / lifecycle tests
- `test/humanTriageWebviewLifecycle.test.js`

## 14. Workflow provider

### CCR-UT-PROVIDER-001 exact inventory

workspace / review-input 6件、traceability 6件、review execution 4件の計16 providerをsource、文書、workflowと照合する。

### CCR-UT-PROVIDER-002 owner / rollback

owner付き登録、duplicate拒否、部分失敗時の逆順dispose、deactivation cleanupを検証する。

### CCR-UT-PROVIDER-003 soft dependency

workflow-register未導入でもactivationとlocal serviceを維持し、後から有効化するとregistrationが回復する。

主な実テスト:

- workflow provider registration / action input tests
- `test/workflowProviderRegistration.test.js`: provider inventory、soft dependency recovery、registration lifecycle

## 15. Cross-extension documentation contract

### CCR-UT-CONTRACT-001 recursive classification

`scripts/three-extension-documentation-contract.json`からextension README、extension docs、repository docsを再帰探索する。

### CCR-UT-CONTRACT-002 current documents

current文書には廃止済みpublic IDと旧user-facing UI名が残らない。technical artifact / module名は誤検出しない。

### CCR-UT-CONTRACT-003 historical notices

historical文書が旧ID / 旧画面名を保持する場合、冒頭12行以内の`Replaced:`または`Superseded:`で正規routeを示す。

### CCR-UT-CONTRACT-004 retained settings

`workflowRegister.runs.retention.*`と`getConfiguration("workflowRegister.runs.retention")`を廃止済みview IDのprefixとして誤検出しない。

### CCR-UT-CONTRACT-005 manifest / runtime / safety

main、soft dependency、composition root、workflow backup/update、existing review-input backup-only、MCP write boundaryをsourceと文書で照合する。

実行:

```bash
node --test ../../scripts/three-extension-documentation-contract.test.js
node --test ../../scripts/three-extension-command-surface.test.js
```

## 16. Policy / full gate

```bash
npm run compile
npm run dependency:policy
npm run architecture:policy
npm run source:policy
npm run unused:report
npm test
npm run package
npm run package:policy
```

完了条件:

- full suite fail 0。
- current docsの旧公開route 0件。
- package budget / forbidden entry policyを満たす。
- initializer、stage lifecycle、output / decision conflictのmutation regressionがfailからpassへ変化する。
