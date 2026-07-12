# Human Triage Operator Extension Host テスト仕様

## 1. 目的

本書は、`bob-code-consistency-review`のHuman Triage Integrity Phase 1について、Node.js単体テストでは確認できないVS Code Extension Host上のoperator flowを定義する。

対象はcommand登録だけのsmokeではなく、実Extension Hostでcommandを呼び、filesystem artifact、optimistic lock、legacy migration、Webview lifecycleを確認する統合テストである。

## 2. 対象

| 項目 | 内容 |
| --- | --- |
| Extension ID | `local.bob-code-consistency-review` |
| Test file | `scripts/triage-integrity-extension-host.test.js` |
| Workspace fixture | `extensions/bob-code-consistency-review/test/fixtures/triage-operator-workspace` |
| Ubuntu job | `extensions-quality / bob-code-consistency-review` |
| Windows job | `extensions-quality / Windows / bob-code-consistency-review` |
| VS Code runtime | `.vscode-test.json`で固定した`1.106.1` |
| Dependency isolation | `skipExtensionDependencies: true` |

## 3. Smoke runner extension

共通runner `scripts/extension-host-smoke.test.js`は、既存activation smokeに加えて以下を扱う。

### `SMOKE_EXTRA_FILES`

- comma-separatedのtest file pathを受け取る。
- `process.cwd()`を基準にabsolute pathへ解決する。
- missing pathとnon-file pathを起動前に拒否する。
- duplicate pathを除外する。
- 未指定時は既存activation smokeだけを実行する。

### `SMOKE_WORKSPACE_FOLDER`

- workspace directory pathを受け取る。
- missing pathとnon-directory pathを起動前に拒否する。
- valid pathを`.vscode-test.json`の`workspaceFolder`へ設定する。
- 未指定時は既存のempty-window smokeを維持する。

## 4. Test cases

### CCR-EH-001 Extension activation

| 項目 | 内容 |
| --- | --- |
| 入力 | Extension Host起動、`SMOKE_EXTENSION_ID`、representative command IDs |
| 操作 | extension activation後にregistered commandsを取得する。 |
| 期待結果 | `bobCodeConsistency.openReviewWizard`と`bobCodeConsistency.preprocess`が登録される。 |

### CCR-EH-002 Save and reopen

| 項目 | 内容 |
| --- | --- |
| 入力 | one finding / one questionを持つBob output |
| 操作 | `bobCodeConsistency.triage` → accepted decision保存 → workspace state再読込 |
| 期待結果 | revisionが進み、decision、owner、reason、follow-up、accepted projectionが保持される。 |

### CCR-EH-003 Source conflict

| 項目 | 内容 |
| --- | --- |
| 入力 | 保存前に取得したsource hash / revisionと、変更後のBob output |
| 操作 | Bob output変更後にtriageを再生成し、古いtokenで保存する。 |
| 期待結果 | `TRIAGE_SOURCE_CHANGED`で拒否される。 |

### CCR-EH-004 Revision conflict

| 項目 | 内容 |
| --- | --- |
| 入力 | 同じsource hash / revisionを持つ二つのsave attempt |
| 操作 | first save成功後、同じold revisionでsecond saveを行う。 |
| 期待結果 | second saveは`TRIAGE_REVISION_CONFLICT`で拒否される。 |

このtestは二画面競合のdomain contractを、同じstale tokenの二つのsaveとして再現する。実際の二つのWebview panelを同時操作する視覚的UATは別途行う。

### CCR-EH-005 Legacy migration

| 項目 | 内容 |
| --- | --- |
| 入力 | matching `PRE-001`とunmatched `OLD-999`を含むlegacy `triage-result.yaml` |
| 操作 | `bobCodeConsistency.triage`を実行する。 |
| 期待結果 | matching decisionだけが移行され、unmatched IDがreportされ、legacy resultがbackupされる。 |

追加確認:

- `decision_revision: 1`
- `triaged_by`保持
- nested follow-up保持
- `accepted-findings.md`にmatching findingを出力
- `migration-report.md`に`OLD-999`を出力

### CCR-EH-006 Webview reopen

| 項目 | 内容 |
| --- | --- |
| 入力 | workspace fixture、生成済みsource / decision |
| 操作 | Human Triage commandでpanelを開く → active tab確認 → close → reopen |
| 期待結果 | 二回ともpanelが開き、`unhandledRejection`がなく、decisionが保持される。 |

## 5. Cleanup

- temporary workspaceはsuite終了時にrecursive deleteする。
- committed workspace fixture内の`.bob-review`はsuite終了時に削除する。
- open editor / Webviewは終了処理で閉じる。
- generated review dataをrepositoryへ残さない。

## 6. Cross-platform gate

同一test fileをUbuntuとWindowsで実行する。

| Gate | 必須結果 |
| --- | --- |
| Compile | success |
| Unit tests | success |
| Package | success |
| VSIX policy | success |
| Extension Host activation | success |
| Human Triage operator suite | success |

## 7. 実行証跡

2026-07-12時点の実行証跡:

- `extensions-quality` run `29195289814`
- Ubuntu `bob-code-consistency-review`: success
- Windows `bob-code-consistency-review`: success
- `code-consistency-review-scaffold` run `29195289840`: success

## 8. 手動確認として残す範囲

本testではIBM Bob本体を導入しないため、以下はmanual release-candidate gateとする。

- Bob agent responseとresult handoff
- workflow-register / Bob Workflow UIを介した操作
- MCP連携
- Webviewのvisual layout、focus、keyboard操作
- Developer Tools Console全体の警告確認

Human Triageの保存・再読込、source/revision conflict、legacy migration、artifact生成、Webview reopenのコア動作は自動gateで確認する。
