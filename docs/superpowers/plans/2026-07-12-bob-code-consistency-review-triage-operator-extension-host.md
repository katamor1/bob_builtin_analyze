# Bob Code Consistency Review Triage Operator Extension Host Plan

Replaced: bobCodeConsistency.openReviewWizard, bobBazaar.openReviewGui. This historical plan retains the former standalone decision panel command and screen name as implementation evidence.

- Status: implemented and verified / IBM Bob UAT kit ready
- Date: 2026-07-12
- Repository: `katamor1/bob_builtin_analyze`
- Extension: `extensions/bob-code-consistency-review`
- Branch: `agent/bob-code-consistency-review-triage-integrity`
- Pull Request: `#74`
- Parent plan: `docs/superpowers/plans/2026-07-12-bob-code-consistency-review-triage-integrity.md`

## Goal

Phase 1で手動operator gateとして残していたHuman Triageの主要操作を、実VS Code Extension Host上で再現可能なクロスプラットフォーム自動テストへ移す。

対象は次の通り。

1. triage生成、decision保存、再読込後の保持
2. source再生成後の`TRIAGE_SOURCE_CHANGED`
3. stale revisionによる`TRIAGE_REVISION_CONFLICT`
4. legacy `triage-result.yaml` migration
5. backup、projection、migration report
6. Human Triage Webviewのopen / close / reopenと未処理Promise rejection

IBM Bob固有のagent実行、MCP、workflow UI、画面の視覚的確認はこの自動化の対象外とする。

## Approach

既存の共通Extension Host smoke runnerを拡張し、各extension jobが必要な場合だけ追加test fileとworkspace fixtureを読み込めるようにする。

```text
scripts/extension-host-smoke.test.js
  + SMOKE_EXTRA_FILES
  + SMOKE_WORKSPACE_FOLDER

extensions-quality.yml
  Ubuntu bob-code-consistency-review
    + triage-integrity-extension-host.test.js
    + triage-operator-workspace

  Windows / bob-code-consistency-review
    + same operator test
    + same workspace fixture
```

他extensionは環境変数を空にし、従来のactivation smokeだけを実行する。

## TDD execution

### RED

- [x] `scripts/extension-host-smoke-contract.test.js`へ、追加test fileとworkspace fixtureのCI配線契約を追加した。
- [x] commit `ca2fa5ccac398229e0366057d58255afc2f676a4`で最初のRED契約を保存した。
- [x] GitHub Actions run `29194873809`の`workflow-register / Verify Extension Host smoke contract`で、未実装の契約が失敗することを確認した。
- [x] workspace fixture要件をcommit `9528529d0934ac596f2e9b27d3cb268b37fde5ec`で追加した。

### GREEN

- [x] `SMOKE_EXTRA_FILES`をcomma-separated file listとして検証・読込するようにした。
- [x] `SMOKE_WORKSPACE_FOLDER`を検証し、`.vscode-test.json`の`workspaceFolder`へ設定するようにした。
- [x] `scripts/triage-integrity-extension-host.test.js`を追加した。
- [x] `test/fixtures/triage-operator-workspace`を追加した。
- [x] Ubuntu / Windowsの`bob-code-consistency-review` jobへoperator suiteを接続した。
- [x] 共通contract testをGREENに戻した。

## Automated operator scenarios

### EH-TRIAGE-001 Save and reopen

1. temporary workspaceへBob outputを作成する。
2. `bobCodeConsistency.triage` commandを実行する。
3. accepted decisionを保存する。
4. workspace stateを再読込する。
5. decision、owner、accepted projectionが保持されることを確認する。

### EH-TRIAGE-002 Source conflict

1. 保存済み画面相当のsource hashとrevisionを保持する。
2. Bob outputを変更してtriageを再生成する。
3. 古いtokenで保存する。
4. `TRIAGE_SOURCE_CHANGED`を確認する。

### EH-TRIAGE-003 Revision conflict

1. 同じsource/revisionを二画面相当として保持する。
2. 一方で保存してrevisionを進める。
3. 古いrevisionでもう一度保存する。
4. `TRIAGE_REVISION_CONFLICT`を確認する。

### EH-TRIAGE-004 Legacy migration

1. legacy `triage-result.yaml`を作成する。
2. current sourceに存在するIDと存在しないIDを混在させる。
3. triage commandを実行する。
4. matching IDだけがdecisionへ移行されることを確認する。
5. unmatched IDが`migration-report.md`へ記録されることを確認する。
6. legacy resultのbackupとaccepted projectionを確認する。

### EH-TRIAGE-005 Webview reopen

1. single workspace fixtureへsourceとdecisionを生成する。
2. `bobCodeConsistency.openHumanTriageGui`を実行する。
3. Human Triage tabが開くことを確認して閉じる。
4. 同じ操作を再実行する。
5. `unhandledRejection`が発生しないことを確認する。
6. decisionが再読込後も保持されることを確認する。

## Verification evidence

- [x] `code-consistency-review-scaffold` run `29195289840`: scaffold and extension jobs succeeded.
- [x] `extensions-quality` run `29195289814`, Ubuntu `bob-code-consistency-review`: unit, package, VSIX policy, and Extension Host operator smoke succeeded.
- [x] `extensions-quality` run `29195289814`, Windows `bob-code-consistency-review`: unit, package, VSIX policy, and Extension Host operator smoke succeeded.
- [x] `workflow-register / Verify Extension Host smoke contract` succeeded after implementation.

`extensions-quality`全体は、変更対象外の`workflow-register` unit jobがUbuntu / Windowsで失敗するためfailureとなる。この計画の正本判定は、変更対象である`bob-code-consistency-review`のUbuntu / Windows jobとscaffold workflowの結果とする。

## IBM Bob UAT kit continuation

自動化対象外のintegration / visual gateを実施可能な形へ固定した。

- [x] `extensions/bob-code-consistency-review/docs/triage-integrity-ibm-bob-uat-runbook-ja.md`を追加した。
- [x] `extensions/bob-code-consistency-review/docs/triage-integrity-ibm-bob-uat-evidence-template.md`を追加した。
- [x] `test/fixtures/triage-operator-uat/bob-output-initial.yaml`を追加した。
- [x] `test/fixtures/triage-operator-uat/bob-output-regenerated.yaml`を追加した。
- [x] `test/fixtures/triage-operator-uat/legacy-triage-result.yaml`を追加した。
- [x] fixtureの用途、copy手順、制約をREADMEへ記録した。
- [ ] 実IBM Bob環境でrunbookを実行する。
- [ ] 日付入りUAT evidenceを`docs/release-evidence/`へcommitする。
- [ ] Operator / reviewer / release ownerがsign-offする。

fixtureはHuman Triageの競合・migration・projection専用で、任意のreview-packageのevidence indexとは対応しない。Bob output validationを含むE2Eでは、実際に生成したreview-packageとBob agent resultを使う。

## Remaining manual gate

以下は実IBM Bob環境でのみ確認する。

- Bob agentによるreview実行とresult handoff
- workflow-register / Bob Workflow UIからの一連の操作
- MCP連携
- Webviewの視覚的表示、keyboard操作、operator向け文言
- Developer Tools Console全体の警告・例外確認

コアtriage persistence、conflict、migration、projection、Webview reopenは自動ゲートへ移行済みである。残件はUAT kitに従って実施し、未実施項目は`pass`ではなく`pending`として記録する。
