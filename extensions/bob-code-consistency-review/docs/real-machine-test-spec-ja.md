# bob-code-consistency-review 実機テスト仕様書

## 1. 目的

本書は`bob-code-consistency-review`の実機・Extension Host受入契約を定義する。mockでは確認できないVS Code activation、Command Palette、単一の`整合プレレビュー`主GUI、IBM Bob、workflow-register、Git / Bazaar、文書抽出、review-package、Bob出力、指摘確認・振り分け、visual / keyboard操作を確認する。

## 2. 対象

| 区分 | 対象 |
| --- | --- |
| Extension | `local.bob-code-consistency-review` |
| Public command | `bobCodeConsistency.openReviewWizard` |
| Primary panel | view type `bobCodeConsistencyReviewWizard`、title `整合プレレビュー` |
| Optional integrations | `IBM.bob-code`, `local.workflow-register` |
| Workflow | `.bob/workflows/code-consistency-review/WORKFLOW.md` |
| Inputs | `review-input.yaml`, traceability catalog, AI draft JSON |
| Outputs | `.bob-review/review-package`, `.bob-review/bob-output`, `.bob-review/human-triage`, `.bob-trace` |
| VCS | Git、Bazaar |
| Documents | Markdown、`.docx`、`.xlsx` |
| Platforms | UbuntuとWindows |

## 3. 前提

- 対象commitからVSIXを作成する。
- Ubuntu / WindowsのHosted Extension Hostは同じhead SHAを使う。
- manual UATは破棄可能なsandboxで行う。
- IBM Bob / workflow-registerなしのcaseと、両方ありのcaseを分ける。
- Developer Tools Console、artifact hash、run state、screenshotを保存できる。
- 秘密情報、顧客data、credentialを使わない。

## 4. build / package

```bash
npm ci
npm run compile
npm run dependency:policy
npm run architecture:policy
npm run source:policy
npm run unused:report
npm test
npm run package
npm run package:policy
```

VSIX build commitとtested commitが一致しない場合はUATを開始しない。

## 5. Hosted Extension Host matrix

### CCR-EH-001 activation

Ubuntu / Windowsの両方で拡張をactivateする。

期待結果:

- activationがresolveする。
- IBM Bob / workflow-register不在でもactivation errorにならない。
- uncaught exception / unhandled rejectionがない。

### CCR-EH-002 exact command inventory

`vscode.commands.getCommands(true)`に次が存在する。

公開command:

```text
bobCodeConsistency.openReviewWizard
```

代表hidden command:

```text
bobCodeConsistency.initializeWorkspace
bobCodeConsistency.openTraceabilityPrep
bobCodeConsistency.preprocess
bobCodeConsistency.captureBobOutput
bobCodeConsistency.triage
```

Command Palette policyは公開1件だけを常時表示する。

### CCR-EH-003 primary panel

`Bob Code Consistency Review: 整合プレレビューを開始`を実行する。

期待結果:

- view type: `bobCodeConsistencyReviewWizard`
- title: `整合プレレビュー`
- workspace modelとstage navigationがrenderされる。
- panelを閉じてもdangling callbackがない。

### CCR-EH-004 same-panel stages

`Bob Code Consistency Review: 整合プレレビューを開始`で開いた同じpanel内で、次を順に操作する。

```text
入力・根拠選択
トレーサビリティ整理
前処理 / review-package preview
レビュー結果取り込み
指摘確認・振り分け
```

期待結果:

- panel identityが変わらない。
- stage-specific serviceが独立した公開panelを作らない。
- stage変更、same-stage再遷移、dispose後に古いcompletionが最新modelを上書きしない。
- render / post拒否を成功扱いしない。

### CCR-EH-005 soft dependency availability

| 条件 | 期待結果 |
| --- | --- |
| IBM Bobなし | local初期化、入力、前処理、validationを利用できる。Bob投入操作は理由付きで無効。 |
| workflow-registerなし | local主GUIとserviceを利用できる。workflow provider不在をactivation failureにしない。 |
| 両方あり | provider 16件が登録され、同梱workflowを実行できる。 |
| 後から有効化 | provider registrationが回復する。 |

## 6. Workspace初期化

### CCR-RT-001 create

workflow未配置のsandboxで主GUIの初期化操作を実行する。

期待結果:

```text
.bob/workflows/code-consistency-review/WORKFLOW.md
review-input.yaml
docs/review-input-placeholder.md
.gitignore
```

が作成され、workflow / review-inputの個別結果を表示する。

### CCR-RT-002 workflow backup / update

既存workflowをbundled bytesと異なる内容にする。

期待結果:

- 既存bytesをbyte-exact backupする。
- backup成功後にbundled bytesへ更新する。
- workflow resultは`updated`とbackup pathを示す。

### CCR-RT-003 existing review-input backup-only

既存`review-input.yaml`へCP932または任意non-UTF-8 bytesを置く。

期待結果:

- original fileを変更しない。
-同じbytesのbackupを作る。
- review-input resultは`unchanged`とbackup pathを示す。
- workflow更新結果と別に表示する。

### CCR-RT-004 write boundary

workspace外path、symlink / junction parent、identity replacementを用意する。

期待結果:

- 書込みを拒否する。
- partial fileや誤ったbackupを残さない。

## 7. review-input

### CCR-RT-010 interactive creation

主GUIでVCS、base / head、change type、purpose、document candidates、section / case ID、review focusを選択する。

期待結果:

- validな`review-input.yaml`を生成する。
- workspace-relative pathだけを保存する。
- preview、diagnostics、明示確認を行う。

### CCR-RT-011 AI draft

AI draft用promptを生成し、valid / invalid `ReviewInputDraft` JSONを適用する。

期待結果:

- AIは短いdraftだけを作る。
- hostがenum、path、document existence、sizeを再検証する。
- invalid draftでfinal YAMLを変更しない。

### CCR-RT-012 repair

known legacy enumを持つinputを修復する。

期待結果:

- diff previewとconfirmationを表示する。
- cancel時は変更しない。
- 承認時はbackup後に修復する。

## 8. トレーサビリティ整理

### CCR-RT-020 AI proposed-only draft

文書候補からAI draft promptを作り、proposed-only JSONを取り込む。

期待結果:

- AI draftがaccepted / rejected / deprecatedを確定しない。
- proposed item / linkをcatalogへmergeする。
- raw AI draftはignored作業領域へ保存する。

### CCR-RT-021 human transition

`トレーサビリティ整理`stageで候補をaccepted / rejected / deprecatedへ変更する。

期待結果:

-人間操作だけが正式状態を変更する。
- catalog revisionとidentityを再検証する。
- backup後に保存する。
- gate reportを再生成する。

### CCR-RT-022 gate

missing link、unapproved domain、duplicate ID、stale anchor、unresolved QA / review findingを用意する。

期待結果:

- error / warningを分類して表示する。
- errorがある状態でreview-input生成へ進めない。

### CCR-RT-023 route / recovery

hidden workflow commandからtraceability routeを呼ぶ。

期待結果:

- 既存`整合プレレビュー`panelが`トレーサビリティ整理`stageへ移動する。
-初回catalog read failure時に二重readやgate report writeを行わない。
- failure後は利用可能なreview stageへ戻る。

## 9. VCS / document / code evidence

### CCR-RT-030 Git

- base / head差分
- rename
- 空白入りpath
- binary numstat
- untracked option

をtemporary repositoryで確認する。

### CCR-RT-031 Bazaar

`bzr --no-aliases`、revision / range / working tree、CP932、timeout、output capを確認する。

### CCR-RT-032 Markdown

section ID、heading、table、list、line rangeを抽出する。

### CCR-RT-033 Word

`.docx`のheading、paragraph、list、tableをdocument orderで抽出する。

### CCR-RT-034 Excel

`.xlsx`のsheet、saved value、row number、cell rangeを抽出する。formulaを再計算しない。

### CCR-RT-035 code evidence

- C / C++変更関数と周辺候補
- TypeScript / Python / Javaのdiff hunk根拠
- binary / unsupported language warning
- caller / callee / global / struct option

を確認する。

## 10. review-package

### CCR-RT-040 deterministic build

valid inputで前処理を実行する。

期待結果:

```text
manifest.yaml
input-normalized.json
changed-files.json
changed-symbols.json
document-index.json
evidence-index.json
traceability-map.json
change-summary.md
diff-context.md
document-excerpts.md
deterministic-checks.md
bob-input.md
prompts/
code-slices/
tables/
```

が整合して生成される。

### CCR-RT-041 caps

raw diff、document excerpt、code slice、Bob input上限を小さくする。

期待結果:

- hard capを超えない。
- truncation / omission理由をmanifestへ記録する。
- required metadataだけでも収まらない場合はfailする。

### CCR-RT-042 transaction failure

stagingまたはrenameで意図的に失敗させる。

期待結果:

- partial packageをinstallしない。
- existing packageを保持する。
- temp / staging cleanup結果を報告する。

## 11. IBM Bob Workflow E2E

### CCR-RT-050 preprocess

Bob Workflow UIで同梱workflowを開始し、review-packageを作る。

### CCR-RT-051 Bob agent

Bobが`bob-input.md`とpackage内evidenceだけを使い、final approvalを行わないことを確認する。

### CCR-RT-052 result handoff

Bob resultを次stepへhandoffする。

期待結果:

- `args[0]` / explicit result fieldから同じoutputを取得する。
- handoff failureをsuccess扱いしない。
-必要なsnapshotをboundedに保存する。

## 12. レビュー結果取り込み

### CCR-RT-060 valid output

同じpanelの`レビュー結果取り込み`stageでvalid YAMLを保存する。

期待結果:

- stage初期化時のworkspace rootを固定する。
- raw / canonical / primary outputを保存する。
- schema、review ID、package ID、evidence IDを検証する。
- 保存後に`指摘確認・振り分け`へ進める。

### CCR-RT-061 invalid evidence

unknown evidence IDまたはfinal approvalを含むYAMLを入力する。

期待結果:

- issue pathとmessageを表示する。
-正式outputを保存しない。
- success notificationを出さない。

### CCR-RT-062 render / dispose

render拒否、panel dispose、stage変更中に保存を完了させる。

期待結果:

- domain writeが未完了ならinstallしない。
-完了済みdomain writeを別stage modelへ誤反映しない。
- unhandled rejectionがない。

## 13. 指摘確認・振り分け Integrity 実機テスト

### CCR-RT-070 generate / save / reload

- source snapshotを生成する。
- accepted / rejected / investigation / questionとowner / reason / follow-upを入力する。
- 保存してpanelを閉じ、再度`指摘確認・振り分け`stageを開く。

期待結果:

- decisionが再表示される。
- source hashが変わらない。
- decision revisionが1増える。
- projectionがdecisionと一致する。

### CCR-RT-071 source conflict

panelを開いたままBob outputを再生成し、古いpanelから保存する。

期待結果:

- source changed errorになる。
- new source / projectionを上書きしない。
- reopen後に最新sourceを表示する。

### CCR-RT-072 revision conflict

2つのpanel generationで同じdecision revisionを開き、先行save後に後続saveする。

期待結果:

-後続saveがrevision conflictになる。
-先行decisionを保持する。
- conflict時にsuccess notificationを出さない。

### CCR-RT-073 legacy migration

legacy `triage-result.yaml`だけを配置して生成する。

期待結果:

- matching decisionを移行する。
- unknown itemをdecision storeへ入れない。
- migration reportとbackupを作る。

### CCR-RT-074 projection / backup

複数回saveし、projectionを手編集して再saveする。

期待結果:

- revisionが成功saveごとに1だけ増える。
- projectionがdecisionから再生成される。
- backup名が衝突しない。
- failed saveでnew projectionをinstallしない。

詳細UATは`triage-integrity-ibm-bob-uat-runbook-ja.md`を使う。

## 14. Multi-root

同じreview IDを持つ2つのworkspaceを開く。

期待結果:

- selected / workflow rootをrequest内で固定する。
- package、output、decisionを別rootへ書かない。
- source / revision conflictをroot間で混同しない。
- workspace picker後のactive editor変更でrootを変えない。

## 15. Manual visual / accessibility gate

UbuntuとWindowsの代表環境で確認する。

- 200% zoomでstage、field label、source context、editable field、status、buttonを識別できる。
- VS Code High Contrast / Windows High Contrastで境界とfocusを識別できる。
- Tab / Shift+Tabだけで全主要actionとeditable fieldへ移動できる。
- select、checkbox、date inputをkeyboardで操作できる。
- source contextと人間editable fieldを区別できる。
- suggested ownerをowner inputへ自動入力しない。
- 未判断itemをacceptedとして見せない。
- validation、source conflict、revision conflictを色だけに依存せず区別する。
- screenshotに秘密情報、顧客data、absolute user pathを含めない。

## 16. Console gate

各scenario前にConsoleをclearし、終了後に次を検索する。

```text
uncaught
unhandled
rejection
exception
CSP
webview
provider
MCP
```

合格条件:

- uncaught exception 0
- unhandled rejection 0
- CSP violation 0
- save failure後のsecondary exception 0
- panel close / deactivate後のdangling callback 0

## 17. Cross-extension hosted acceptance

同一head SHAで次を満たす。

```text
workflowRegister.openOperationHub      -> workflowRegisterOperationHub / Bob 操作ハブ
workflowRegister.openWorkflowBuilder   -> workflowRegisterBuilder / ワークフロー作成・編集
bobBazaar.openReviewGui                -> bobBazaarReviewGui / Bazaar レビュー
bobCodeConsistency.openReviewWizard    -> bobCodeConsistencyReviewWizard / 整合プレレビュー
```

さらに5件すべてのpublic commandと代表hidden commandがUbuntu / Windowsで登録される。4panelを開閉してunhandled rejectionがない。

## 18. 完了条件

- automated full suite / policy / package gateがpass。
- Ubuntu / Windows Extension Hostが同一SHAでpass。
- public command / panel type / titleがexact match。
- initializer、traceability、review-package、Bob output、decision UATがpass。
- visual / keyboard / Console gateがpass。
- evidenceにcommit、VSIX、OS、versions、artifact hashesを記録する。
