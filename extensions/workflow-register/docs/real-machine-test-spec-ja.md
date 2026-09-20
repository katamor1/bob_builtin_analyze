# workflow-register 実機テスト仕様書

## 1. 目的

本書は`extensions/workflow-register`のExtension Host / 実機テストを定義する。
Node単体テストではmock化するVS Code command、Webview、IBM Bob、Bob Workflow UI、Bob task、multi-root workspace、watcher、実filesystem、VSIX内容を、UbuntuとWindowsの同一commitで確認する。

## 2. 必須matrix

| 項目 | Ubuntu | Windows |
| --- | --- | --- |
| OS | repository CIのsupported Ubuntu | Windows 11 |
| Node / npm | lockfile準拠 | lockfile準拠 |
| VS Code / Bob IDE | `engines.vscode`を満たす | `engines.vscode`を満たす |
| extension | 同一SHAからbuildしたVSIX | 同一SHAからbuildしたVSIX |
| IBM Bob | 導入あり / なし | 導入あり / なし |
| workspace | single-root / multi-root | single-root / multi-root |

片方だけの成功をrelease passにしない。IBM Bob実環境を利用できないrunは`pending`とし、Node / Extension Host gateの成功と混同しない。

### Bob 2.1.0互換性の確認

Bob 2.1.0ではsource登録・解除、workflow開始、command / agent step、subagent結果取得、手動完了、snapshot保存・再開を確認する。taskの`toSerializable`がなくても実行できること、presetなしsubagentが親modeの権限・制限を継承して動作することを確認する。Bazaarのcontext追加、Bazaar / consistency reviewのprovider登録・結果取込も対象とする。

診断には実バージョン`2.1.0`と許可範囲`>=2.0.0 <3.0.0`が表示されること。保存用profileの`bob/2.0.1`は互換性基準であり、実バージョンの表示と区別する。認証や接続が必要な実行を完了できない場合、その項目は未検証として記録し、mockテストの成功で代替しない。

## 3. buildと事前gate

各OSで次を実行する。

```text
cd extensions/workflow-register
npm ci
npm run compile
node --test test/*.test.js
npm run package
npm run package:policy
```

repository rootでは次を実行する。

```text
node --test scripts/three-extension-command-surface.test.js scripts/three-extension-documentation-contract.test.js
git diff --check
```

記録する証跡:

- commit SHA
- OS / architecture
- Node / npm version
- VS Code / Bob IDE version
- IBM Bob version
- VSIX nameとSHA-256
- compile / test / package / policy result
- Developer Tools Console log

## 4. test workspace

```text
<workspace>/
  .bob/
    workflows/
      smoke-command/WORKFLOW.md
      smoke-agent-result/WORKFLOW.md
      smoke-manual/WORKFLOW.md
      smoke-review/WORKFLOW.md
      smoke-pause/WORKFLOW.md
      smoke-branch/WORKFLOW.md
      smoke-invalid/WORKFLOW.md
  docs/sample.md
```

multi-rootでは次を追加する。

```text
<workspace-a>/.bob/workflows/...
<workspace-b>/.bob/workflows/...
```

同じlogical workflow IDとrun ID候補を両rootへ配置し、root identityが混線しないことを確認する。

## 5. 共通確認

各caseで次を確認する。

- Developer Tools Consoleにuncaught exception、unhandled rejection、CSP violationがない。
- `run.json`、`control.json`、task snapshot、artifact manifestが操作結果と一致する。
- panelを閉じた後にdangling callback、watcher error、timer errorが出ない。
- screenshotへcredential、個人path、顧客data、Bob message本文を含めない。
- WindowsとUbuntuでpath separator差を除き同じ判定になる。

## 6. command surface gate

### WR-RT-SURFACE-001 公開5command

Command Paletteで次の5件だけが利用者向け入口として表示されることを確認する。

```text
workflowRegister.openOperationHub
workflowRegister.openWorkflowBuilder
bobBazaar.openReviewGui
bobBazaar.authorProjectRulesFromDocuments
bobCodeConsistency.openReviewWizard
```

期待結果:

- workflow-registerは2件、Bazaarは2件、Code Consistencyは1件。
- categoryと日本語titleがmanifest契約と一致する。
- 内部run / pause / review / retention / template commandがPaletteへ露出しない。
- 廃止済みcommand / view / panel entryが表示されない。

### WR-RT-SURFACE-002 内部command登録

Developer ConsoleまたはExtension Host smokeから代表内部commandを実行する。

- reload / validate
- run / next / retry
- pause / resume
- accept / accept-and-next
- held recovery
- artifact reuse
- retention inspect / preview

期待結果:

- hiddenでもcommand registrationは維持される。
- workflow、操作ハブ、公開APIから呼び出せる。
- Command Palette公開数は増えない。

## 7. `Bob 操作ハブ` gate

### WR-RT-HUB-001 open / single panel

1. `workflowRegister.openOperationHub`を実行する。
2. 同じcommandを複数回実行する。
3.別run IDをfocus inputとして渡す。

期待結果:

- viewTypeは`workflowRegisterOperationHub`。
- titleは`Bob 操作ハブ`。
- panelは1枚だけで、再実行時はrevealされる。
- focus対象がroot / run identityに一致する。

### WR-RT-HUB-002 no-workspace / setup

1. folderを開かずpanelを開く。
2. single-root workspaceを開く。
3. `.bob` markerあり / なしを切り替える。

期待結果:

- no-workspaceを例外にせず説明する。
- marker rootを優先し、無い場合はworkspace folderをfallbackにする。
- setup actionはworkspace外へ書き込まない。

### WR-RT-HUB-003 extension status / soft dependency

次を順に確認する。

1. IBM Bob、Bazaar、Code Consistencyすべて未導入。
2. IBM Bobだけ導入。
3. companion extensionを後から導入・有効化。

期待結果:

- 不在extensionを理由付きで表示する。
- 不在extension向けactionを安全に無効化する。
- workflow-register単体のrun / authoring機能は利用できる。
- 後から有効化するとrefresh後にactionが回復する。

### WR-RT-HUB-004 workflow / run model

running、paused、reviewing、held、checkpoint、completed、failedを用意する。

期待結果:

- status、current step、updated time、workflow identityを正しく表示する。
- held recovery可否と根拠を区別する。
- artifact manifestがvalidなrunだけreuse actionを表示する。
- multi-rootの同名runをroot別に扱う。

### WR-RT-HUB-005 watcher / refresh

1. panelを開く。
2.別processまたはeditorから`run.json`を更新する。
3. `control.json`とartifact manifestをcreate / change / deleteする。

期待結果:

- 変更がdebounce後に表示へ反映される。
- action後も段階refreshで最終stateへ追従する。
- close後は自動refreshしない。

### WR-RT-HUB-006 mutation revision

1. panel表示後に同じrunを外部更新する。
2. 古いpanelからpause / resume / retry / acceptを実行する。

期待結果:

- stale `expectedRevision`を拒否する。
- external updateを上書きしない。
- refresh-required messageを表示する。
- refresh後の新revisionでは1回だけ実行できる。

### WR-RT-HUB-007 concurrent action

同じrunへ同時にmutation actionを送る。

期待結果:

-同じphysical root / target / actionが直列化される。
- duplicate acceptanceや二重next-stepが発生しない。
-別rootの独立runは不要にblockしない。

### WR-RT-HUB-008 artifact open

1. valid artifactを開く。
2. traversal、absolute outside path、symlink escapeを指定する。

期待結果:

- contained artifactだけをeditorで開く。
- outside / alias pathを拒否する。

## 8. `ワークフロー作成・編集` gate

### WR-RT-BUILDER-001 open / mode

1. `workflowRegister.openWorkflowBuilder`を実行する。
2. 空から作成、標準テンプレートから作成、既存編集を切り替える。

期待結果:

- viewTypeは`workflowRegisterBuilder`。
- titleは`ワークフロー作成・編集`。
- 3 modeを同一panelで扱う。
- root選択をキャンセルした場合は書込みを行わない。

### WR-RT-BUILDER-002 標準テンプレートから作成

1. templateを選ぶ。
2. project profileとcustomizationを入力する。
3. validate、preview、diff、readinessを実行する。
4. authoring phaseへ進む。

期待結果:

- typed defaultを保持する。
- generated workflowがparser / validatorを通る。
- readiness reportをworkspace内へ保存する。
-別panelや別公開commandを作らない。

### WR-RT-BUILDER-003 existing edit / backup

1. 既存v1 workflowを開く。
2. step title、transition、bodyを変更する。
3. preview / diagnostics / diffを確認する。
4. 保存する。

期待結果:

- backupを作成してからatomic saveする。
- unknown front matterとbodyを保持する。
- reload後も変更が反映される。

### WR-RT-BUILDER-004 dirty session

1. panelで未保存変更を作る。
2. 操作ハブまたはeditorから別workflowを開く。

期待結果:

- 未保存内容を無断破棄しない。
- 新しい外部内容を現在sessionへ混入しない。
- 保存、破棄、再読込を促す。

### WR-RT-BUILDER-005 external change / path safety

1. panel open後にtarget fileを外部変更する。
2. symlink / junction配下またはworkspace外pathへ保存を試みる。

期待結果:

- stale file expectationを拒否する。
- outside / alias pathへ書き込まない。
- backupやtemporary fileを不完全な状態で残さない。

### WR-RT-036 Builder内のテンプレート調整

| 項目 | 内容 |
| --- | --- |
| 目的 | 現行Builderの`standard-template` modeでテンプレート調整を行い、安全な生成・上書きとreadinessを確認する。 |
| 手順 | 1. `workflowRegister.openWorkflowBuilder`で`ワークフロー作成・編集`を開く。<br>2. 標準テンプレートを選択し、`targetLanguage`、`vcs.type`、phase artifact root、input defaultを編集する。<br>3. Preview / Diff / Readinessを確認する。<br>4. 保存し、既存生成物がある状態でもう一度保存する。 |
| 期待結果 | 候補はtemplate metadataと一致し、number / boolean / null defaultsが保持される。Bazaar profileだけ`bzr --no-aliases` prompt supplementを持ち、Git profileには混入しない。workspace外またはsymlink escapeの生成先は拒否され、既存profile / customization / workflowはbackup後に更新される。 |

## 9. workflow runtime gate

### WR-RT-RUNTIME-001 Bob source登録

- valid workflowをBob sourceへ登録する。
- invalid workflowはdiagnosticsを出し、登録対象から除外する。
- IBM Bobの遅延activation後にretryで登録を回復する。

### WR-RT-RUNTIME-002 full / single step

- Bob UI full executionで全stepを完了する。
- engine-step executionで同じrecoverable runを継続する。
- predecessor未完了のout-of-order実行を拒否する。

### WR-RT-RUNTIME-003 manual held

- manual stepでrunを`held`へ移す。
- live taskがある場合は操作ハブからmanual panelを開き、完了できる。
- restart後にlive taskが無い場合は誤って完了せず、recovery分類を表示する。

### WR-RT-RUNTIME-004 review gate

- step成功後に`reviewing`へ移す。
- accept、retry、accept-and-nextを操作ハブから実行する。
- durable stateとBob UI gateが一度だけ更新される。
- previous attemptを保持する。

### WR-RT-RUNTIME-005 pause / resume

- current-step後pause、next-AI-call前pause、automatic limitを確認する。
- `control.json`と`workflow.pause`が一致する。
- resume時にclear / resume noteを保存する。
- completed / failedへのpauseを拒否する。

### WR-RT-RUNTIME-006 branching

- forward transition、backward loop、checkpointを確認する。
- reset step attemptとstate producer cleanupを確認する。
- checkpoint approve / abortを操作ハブ経由で実行する。

### WR-RT-RUNTIME-007 task snapshot / handoff

- workflow-start、step-start、agent-output、held、failed、completedを保存する。
- byte capとpruningを確認する。
- handoff failure後にmatching identityからだけassistant textを回復する。
-設定disabled時は新規snapshotを作らない。

### WR-RT-RUNTIME-008 artifact reuse

- valid manifestから指定stepへ新runを開始する。
- hash、workflow identity、inputs、source step不一致を拒否する。
- source runをretention cleanupから保護する。

## 10. retention gate

### WR-RT-RETENTION-001 inspect / preview

untrusted workspaceとtrusted workspaceの両方でread-only inspect / previewを行う。

期待結果:

-本文を出さずrun ID、status、bytes、timestamp、blocker、digest、revisionを表示する。
- active、referenced、pinned、unsafe runを候補にしない。

### WR-RT-RETENTION-002 destructive trust

cleanup / delete / pin / unpinをuntrusted workspaceから実行する。

期待結果:

- root discovery、selection、filesystem accessより前に拒否する。

### WR-RT-RETENTION-003 lease / quarantine

- execution中runとの競合を再現する。
- owner token mismatch、stale identity、symlink / hard linkを用意する。
- quarantine rename途中でfailureを注入する。

期待結果:

- protected runを削除しない。
- rollbackまたはresidual quarantineを保持する。
- incomplete errorにphaseとrun IDを記録する。

## 11. visual / keyboard manual gate

UbuntuとWindowsの両方で、`Bob 操作ハブ`と`ワークフロー作成・編集`を手動確認する。

- 100% / 200% zoom
- VS Code Light / Dark / High Contrast
- 1024×768相当と通常desktop幅
- keyboard only: Tab、Shift+Tab、Enter、Space、Escape
- visible focus indicator
- heading / field / buttonの読み上げ順
- statusとactionの意味が色だけに依存しない
- long workflow ID、long step title、long error message
- Japanese / ASCII path
- no-workspace / optional extension absent / stale revision / save conflict

合格条件:

- horizontal scrollだけに依存せず主要操作へ到達できる。
- focus trapやkeyboard inaccessible actionがない。
- destructive actionとread-only actionを識別できる。
- error後もrefresh、close、reopenが可能である。
- ConsoleにCSP violation、uncaught exception、dangling callbackがない。

## 12. evidence

caseごとに次を保存する。

```text
WR-<OS>-<case>-<sequence>-<description>.<ext>
```

最低限:

- start state screenshot
- operation result screenshot
- relevant `run.json` / `control.json` / manifestのredacted copy
- Console log
- VSIX SHA-256
- pass / fail / pendingと理由

## 13. 判定

release passには次をすべて要求する。

- Ubuntu / Windowsのcompile、unit、package、package policy
- repository command-surface contract
- repository documentation contract
-公開5commandと2つのworkflow-register panel
- runtime、pause、review、held recovery、artifact reuseの代表case
- manual visual / keyboard gate
- Console重大error 0件
- evidenceと実施SHAの一致

IBM Bob実環境caseが未実施なら`pending`とし、他gateの成功だけでpassへ繰り上げない。
