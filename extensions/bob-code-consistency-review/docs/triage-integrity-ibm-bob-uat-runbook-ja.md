# Human Triage Integrity IBM Bob UAT Runbook

> **現行UIへの読み替え:** 本書の `Human Triage` は成果物／domain moduleの歴史的名称である。standalone Result Capture／Human Triage panelと公開commandは削除済みで、現在のoperator操作は`整合プレレビュー`主GUI内の`レビュー結果取り込み`／`指摘確認・振り分け`stageから行う。

- 対象: `extensions/bob-code-consistency-review`
- 対象ブランチ: `agent/bob-code-consistency-review-triage-integrity`
- Pull Request: `#74`
- ステータス: ready to run / 実IBM Bob環境での実施待ち
- 関連仕様:
  - `real-machine-test-spec-ja.md`
  - `triage-operator-extension-host-test-spec-ja.md`
  - `triage-integrity-release-evidence-2026-07-12.md`

## 1. 目的

Human Triage Integrity Phase 1について、自動Extension Host試験では代替できないIBM Bob固有の経路を、同じ入力・同じ証跡形式で再現できるようにする。

本runbookは次を対象とする。

1. Bob Workflow UIからのpreprocess、agent、capture、validate、triage
2. Bob agent出力とresult handoff
3. workflow-registerのrun stateと生成成果物の対応
4. MCP連携の代表smoke
5. 主GUIの`指摘確認・振り分け`stageの視覚表示、focus、keyboard操作、operator向け文言
6. 二画面競合の見え方
7. Developer Tools Console全体のwarning / exception確認

Human Triageの保存、再読込、source/revision conflict、legacy migration、projection生成はUbuntu / WindowsのExtension Host自動試験でも検証済みである。本runbookでは、実際のoperator体験とIBM Bob固有の統合点を確認する。

## 2. UATキット

triageだけを決定論的に再現するfixtureは次に置く。

```text
test/fixtures/triage-operator-uat/
  bob-output-initial.yaml
  bob-output-regenerated.yaml
  legacy-triage-result.yaml
  README.md
```

fixtureはBob output schemaの代表形を持つが、任意のreview-packageの`evidence-index.json`とは結び付かない。したがって、fixtureを使うケースはHuman Triageの生成・保存・競合・migration確認に限定する。Bob output validationを含むE2Eでは、同じworkspaceで実際に生成したreview-packageとBob agent出力を使う。

実施結果は次へコピーして記録する。

```text
docs/triage-integrity-ibm-bob-uat-evidence-template.md
```

原本templateを直接書き換えず、次のような日付入りfileへ複製する。

```text
docs/release-evidence/triage-integrity-ibm-bob-uat-YYYY-MM-DD.md
```

## 3. 前提条件

実施前に以下を満たす。

- Windows 11を主対象とする。追加でmacOS / Linuxを使った場合は別runとして記録する。
- VS Code / Bob IDEは`package.json`の`engines.vscode`を満たす。
- `IBM.bob-code`が導入済みで有効である。
- `local.workflow-register`が導入済みで有効である。
- `bob-code-consistency-review`のVSIXが対象commitから作成されている。
- テストworkspaceは本番repositoryのcopyではなく、破棄可能なsandboxである。
- Developer Tools Consoleを開ける。
- screenshot、run state export、generated artifactを保存できる場所がある。
- 実施者はPR head SHA、各extension version、OS、VS Code / Bob IDE versionを記録する。

VSIX作成例:

```powershell
git checkout agent/bob-code-consistency-review-triage-integrity
git rev-parse HEAD
cd extensions\bob-code-consistency-review
npm ci
npm test
npm run package
npm run package:policy
```

## 4. 証跡の命名規則

証跡fileは次の形式にする。

```text
CCR74-<testcase>-<sequence>-<description>.<ext>
```

例:

```text
CCR74-RT031-01-workflow-start.png
CCR74-RT031-02-run-state.json
CCR74-RT038-03-revision-conflict.png
CCR74-RT040-04-artifact-hashes.txt
CCR74-CONSOLE-01-errors.txt
```

各testcaseについて最低限、開始状態、操作結果、生成成果物、Console状態の4種類を記録する。

## 5. 共通setup

### 5.1 sandbox作成

1. `docs/workflows/code-consistency-review/examples/`の適切なsampleからsandboxを作る。
2. sandboxをVS Code / Bob IDEで開く。
3. `Bob Code Consistency Review: .bob ワークフロー定義と review-input 雛形を初期化`を実行する。
4. `workflowRegister.reload`を実行する。
5. `Bob Code Consistency Review: 整合プレレビューを開始`で主GUIを開き、`レビュー結果取り込み`と`指摘確認・振り分け`へ同じpanel内で遷移できることを確認する。
6. Developer Tools Consoleをclearする。
7. workspace内に以前の`.bob-review/human-triage`がある場合はbackup後に削除する。

### 5.2 version記録

次をevidence fileへ記録する。

```text
PR:
commit:
OS:
VS Code / Bob IDE:
IBM Bob:
workflow-register:
bob-code-consistency-review:
workspace:
operator:
started_at:
```

## 6. IBM Bob Workflow E2E

対象: `CCR-RT-023`, `CCR-RT-024`, `CCR-RT-026`, `CCR-RT-031`

### 6.1 preprocess

1. validな`review-input.yaml`を用意する。
2. Bob Workflow UIで`code-consistency-review`を開始する。
3. `preprocess-review-package` stepを実行する。
4. `.bob-review/review-package`とworkflow run stateを確認する。

合格条件:

- stepがsuccessになる。
- run stateにcommand resultが残る。
- `manifest.yaml`, `evidence-index.json`, `bob-input.md`が存在する。
- run stateの対象workspace / package pathと実fileが一致する。
- Consoleに未処理例外がない。

### 6.2 Bob agent

1. `run-bob-pre-review` stepを実行する。
2. Bobが`bob-input.md`とreview-package由来の根拠だけを使っていることを確認する。
3. YAML出力の冒頭と末尾を保存する。
4. 根拠IDが`evidence-index.json`に存在することをspot checkする。

合格条件:

- result typeがpre-reviewで、final approvalを行っていない。
- finding / questionがsource evidenceを参照する。
- workspace外探索や自動修正を行わない。
- Bob agentのresultが次stepへhandoff可能である。

### 6.3 capture / validate / triage

1. `capture-bob-output` stepを実行する。
2. `validate-bob-output` stepを実行する。
3. `human-triage` stepを実行する。
4. run stateと以下のfileを比較する。

```text
.bob-review/bob-output/bob-output.yaml
.bob-review/human-triage/triage-source.yaml
.bob-review/human-triage/triage-decisions.yaml
.bob-review/human-triage/triage-result.yaml
```

合格条件:

- captureした内容がagent resultと一致する。
- validation errorが0件である。
- triage sourceのreview ID / package IDがBob outputと一致する。
- command step resultとfile pathが対応する。
- Consoleに未処理例外がない。

## 7. 指摘確認・振り分け operator UAT

### 7.1 fixture配置

PowerShell例:

```powershell
$fixture = "extensions\bob-code-consistency-review\test\fixtures\triage-operator-uat"
$workspace = "<sandbox-root>"

New-Item -ItemType Directory -Force "$workspace\.bob-review\bob-output" | Out-Null
Copy-Item "$fixture\bob-output-initial.yaml" "$workspace\.bob-review\bob-output\bob-output.yaml" -Force
```

以降のfixture caseでは、Bob output validationを実行せずHuman Triage生成から開始する。

### 7.2 CCR-RT-036 Generate / edit / save / reload

1. initial fixtureを配置する。
2. `人間確認用 triage を生成`を実行する。
3. `整合プレレビュー`主GUIを開き、`指摘確認・振り分け`stageへ進む。
4. `PRE-001`を次の内容で保存する。
   - decision: `accepted`
   - final severity: `high`
   - owner: `uat-owner`
   - human reason: `UATで根拠を確認した`
   - review comment: `正式レビューへ引き継ぐ`
   - follow-up required: checked
   - action: `timeout実装を修正`
   - due: 実施日より後の日付
5. `Q-001`を`question`としてownerまたはsuggested recipientとreasonを入力する。
6. 主GUIを閉じて再度開き、`指摘確認・振り分け`stageへ進む。

合格条件:

- 入力内容が再表示される。
- source contextは変更されない。
- `decision_revision`が1増える。
- `accepted-findings.md`, `questions-to-author.md`, `follow-up-actions.md`が入力と一致する。
- `triage-source.yaml`のhashがGUI保存前後で同じである。

### 7.3 CCR-RT-037 Source change conflict

1. initial fixtureでGUIを開いたままにする。
2. 別操作で`bob-output-regenerated.yaml`を`bob-output.yaml`へ上書きする。
3. `人間確認用 triage を生成`を再実行する。
4. 古いGUIへ戻り、何かを変更して保存する。
5. 画面を閉じて再度開く。

合格条件:

- 古い画面の保存は`TRIAGE_SOURCE_CHANGED`になる。
- regenerated sourceとprojectionを古い内容で上書きしない。
- 再open後に新しいsummary、severity、package ID由来のsource hashを表示する。
- operatorが「保存失敗」と「再読込が必要」を理解できる文言である。

### 7.4 CCR-RT-038 Two-window revision conflict

1. initial fixtureでtriageを生成する。
2. `整合プレレビュー`主GUIを二つ開き、両方を`指摘確認・振り分け`stageへ進める。
3. 画面Aで`PRE-001`をacceptedとして保存する。
4. 画面Bで異なるowner / reasonを入力して保存する。
5. 画面Bを閉じて再度開く。

合格条件:

- 画面Bは`TRIAGE_REVISION_CONFLICT`になる。
- 画面Aのdecisionとprojectionを保持する。
- 再open後に最新revisionと画面Aの内容を表示する。
- 競合時に成功通知を表示しない。
- keyboardだけでstatus領域へ到達できる。

### 7.5 CCR-RT-039 Legacy migration

1. Human Triage directoryを削除する。
2. initial fixtureを`bob-output.yaml`へ配置する。
3. `legacy-triage-result.yaml`だけを`.bob-review/human-triage/triage-result.yaml`へ配置する。
4. `人間確認用 triage を生成`を実行する。
5. `整合プレレビュー`主GUIを開き、`指摘確認・振り分け`stageへ進む。

合格条件:

- `PRE-001`のaccepted decisionが移行される。
- `OLD-999`はdecision storeへ入らない。
- `migration-report.md`に`OLD-999`が記録される。
- `triage-result.yaml.bak-*`が存在する。
- owner、review comment、follow-upが保持される。

### 7.6 CCR-RT-040 Backup / projection

1. decisionを2回以上保存する。
2. Human Triage directoryのfile一覧、更新時刻、hashを採取する。
3. Markdownを一時的に手編集し、GUIからもう一度保存する。

合格条件:

- 成功保存ごとに`decision_revision`が1だけ増える。
- `triage-source.yaml`はGUI保存で変わらない。
- Markdownの手編集は次回生成でdecision由来の内容へ戻る。
- backup名が衝突しない。
- failed saveでは新しいprojectionをinstallしない。

hash採取例:

```powershell
Get-ChildItem "<sandbox-root>\.bob-review\human-triage" -File |
  Sort-Object FullName |
  ForEach-Object {
    $hash = (Get-FileHash $_.FullName -Algorithm SHA256).Hash
    "$hash  $($_.Name)"
  } | Set-Content "CCR74-RT040-04-artifact-hashes.txt"
```

## 8. Webview visual / keyboard / wording

主GUIの`指摘確認・振り分け`stageで次を確認する。

- 200% zoomでもhorizontal scrollだけに依存せず、field labelと値を識別できる。
- Windows High ContrastまたはVS Code High Contrast themeでstatus、button、input境界を識別できる。
- Tab / Shift+Tabでaction buttonと全editable fieldへ移動できる。
- select、checkbox、date inputをkeyboardで操作できる。
- focus indicatorが見える。
- source contextとhuman-editable fieldを区別できる。
- suggested ownerがowner inputへ自動入力されない。
- 未判断itemがacceptedとして見えない。
- validation、source conflict、revision conflictの文言が区別できる。
- status更新後もoperatorが結果を見失わない。
- screenshotには秘密情報、個人情報、顧客dataを含めない。

## 9. MCP smoke

IBM Bob環境で利用するMCP接続について、次を代表確認する。

1. 対象workflow runでMCP接続状態を記録する。
2. 読み取り系の代表toolを1回実行する。
3. Human Triageの正本fileがMCP経由で無断更新されないことを確認する。
4. tool resultとworkflow run stateの対応を記録する。
5. 接続失敗、permission不足、timeoutのいずれかを安全に表示できることを確認する。

合格条件:

- MCP tool利用の有無と結果が追跡可能である。
- Human Triage decisionは人間操作なしに変更されない。
- failure時にworkflowが成功扱いにならない。
- secret、token、credentialが証跡へ出ない。

## 10. Developer Tools Console

UAT開始直前にConsoleをclearし、各testcase終了時に次を検索する。

```text
error
unhandled
rejection
exception
CSP
webview
provider
MCP
```

既知で許容するwarningは、evidenceに全文、発生条件、影響、tracking issueを記録する。理由を記録できないwarningは合格扱いにしない。

合格条件:

- uncaught exceptionが0件
- unhandled rejectionが0件
- CSP violationが0件
- save failure後に追加のsecondary exceptionが0件
- extension deactivate / 主GUI panel close後のdangling callback errorが0件

## 11. cleanup

1. screenshotとlogをevidence directoryへ退避する。
2. `.bob-review`, `.bob-trace`, `.bob`の必要な証跡だけをcopyする。
3. sandboxを削除する。
4. credential、customer data、absolute user pathを共有前にredactする。
5. evidence templateへ結果と最終判定を記入する。
6. UAT結果fileをPR branchへcommitする。

## 12. 判定

次のすべてを満たした場合だけIBM Bob operator UATをpassとする。

- `CCR-RT-023`, `024`, `026`, `031`, `036`から`040`がpass
- MCP representative smokeがpass
- Webview visual / keyboard確認がpass
- Consoleの重大errorが0件
- evidence fileと参照artifactがcommitされている
- 実施commitとVSIX build commitが一致する

一部を実施できなかった場合は`conditional pass`ではなく`pending`とし、未実施理由とownerを記録する。
