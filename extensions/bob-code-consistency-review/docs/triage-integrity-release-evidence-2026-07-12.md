# Human Triage Integrity Phase 1 リリース証跡

- 対象: `extensions/bob-code-consistency-review`
- ブランチ: `agent/bob-code-consistency-review-triage-integrity`
- Pull Request: `#74`
- 記録日: 2026-07-12
- 状態: automated core and operator gates complete / IBM Bob UAT kit committed / execution pending

## 実装範囲

Workspace v2 Phase 1として、Bob output由来のsource dataと人間のdecisionを分離した。

- `triage-source/v1`のimmutable snapshot
- `triage-decisions/v1`の`source_id` keyed decision store
- `source_sha256`と`decision_revision`によるoptimistic locking
- decision別validation
- accepted / rejected / investigation / question / follow-up Markdown projection
- legacy `triage-result.yaml` migration
- staged multi-file replacement、backup、rollback
- Human Triage Webviewのuntriaged state、source context、follow-up、save token
- 既存command ID、`triagePath`、`triage-result.yaml` compatibility pathの維持

## TDD証跡

最初に次の回帰契約を追加し、旧実装で失敗するRED状態を確認した。

- source snapshotとdecision fileが存在しない
- generation直後に全findingがaccepted扱いになる
- GUI saveがitem配列を置換して未知fieldとfollow-upを失う
- array positionにidentityが依存する
- source / revision conflictを検出できない
- legacy decision migrationが存在しない

その後、source、decision、projection、transaction、migration、GUI boundaryの順に実装してfocused testをGREENにした。

Operator Extension Host gateについても、追加test file / workspace fixtureの配線契約を先に追加した。

- RED contract commit: `ca2fa5ccac398229e0366057d58255afc2f676a4`
- RED確認: `extensions-quality` run `29194873809`の`Verify Extension Host smoke contract`
- workspace contract追加: `9528529d0934ac596f2e9b27d3cb268b37fde5ec`
- GREEN implementation head: `105f9962ce994c17be118880a7aaa75c30644319`

## 自動検証

### Windows full verification

GitHub Actions run `29193276984`で次を実行し、すべて成功した。

```text
npm ci
npm run dependency:policy
npm run architecture:policy
npm run source:policy
npm test
npm run package
npm run package:policy
```

同runでPhase 1のREADME、詳細設計、単体テスト仕様、実機テスト仕様、実装計画を同期し、一時診断workflowを削除した。

### Windows traceability regression

既存CAS regression testがWindowsの8.3短縮pathと長形式pathをlexical stringで比較していたため、temporary file barrierとbackup parent assertionをphysical identity基準へ変更した。GitHub Actions run `29193144292`で対象suiteが成功した。

### Human Triage operator Extension Host gate

共通smoke runnerへ次を追加した。

- `SMOKE_EXTRA_FILES`: extension固有の追加Mocha test file
- `SMOKE_WORKSPACE_FOLDER`: Extension Host起動時に開くworkspace fixture

`bob-code-consistency-review`では`triage-integrity-extension-host.test.js`と`triage-operator-workspace`をUbuntu / Windowsの両方へ接続した。

自動化したoperator flow:

1. `bobCodeConsistency.triage`による生成
2. accepted decision保存
3. workspace state再読込とprojection保持
4. Bob output再生成後の`TRIAGE_SOURCE_CHANGED`
5. stale revisionによる`TRIAGE_REVISION_CONFLICT`
6. legacy `triage-result.yaml` migration
7. unmatched legacy IDのmigration report
8. legacy backupとaccepted projection
9. Human Triage Webviewのopen / close / reopen
10. operator flow中の`unhandledRejection`不在

実行結果:

- `extensions-quality` run `29195289814`
  - Ubuntu `bob-code-consistency-review`: success
  - Windows `bob-code-consistency-review`: success
  - 両jobでunit、package、VSIX policy、Extension Host smokeがsuccess
- `code-consistency-review-scaffold` run `29195289840`
  - scaffold: success
  - VS Code extension validation: success

`extensions-quality` workflow全体は、変更対象外の`workflow-register` unit jobがUbuntu / Windowsで失敗するためfailureとなる。本Phase 1の対象判定は、`bob-code-consistency-review`のUbuntu / Windows jobとscaffold workflowの結果を正本とする。

## Operator gateの自動化範囲

従来manualとしていた次のcore flowは自動gateへ移行した。

- generate → save → reload
- source change conflict
- stale revision conflict
- matching legacy migration
- unmatched ID report
- backup / projection確認
- Webview reopen
- test processでのunhandled rejection検出

二画面の競合は、同一source hash / revisionを保持した二つのsave attemptとしてdomain contractを再現している。二つのpanelを目視操作するUI確認はmanual gateに残す。

## IBM Bob UAT kit

実IBM Bob環境でだけ確認できる残件を、同じ入力・同じ判定・同じ証跡形式で実施できるようにした。

追加した成果物:

- `docs/triage-integrity-ibm-bob-uat-runbook-ja.md`
  - Bob Workflow UI E2E、Bob agent result handoff、MCP、Webview visual / keyboard、二画面競合、Console確認を手順化した。
- `docs/triage-integrity-ibm-bob-uat-evidence-template.md`
  - version、commit、testcase、artifact hash、conflict、migration、MCP、Console、sign-offを記録するtemplateを定義した。
- `test/fixtures/triage-operator-uat/bob-output-initial.yaml`
  - generate / save / reopen / revision conflict用のdeterministic input。
- `test/fixtures/triage-operator-uat/bob-output-regenerated.yaml`
  - 同じreview IDでsource hashを変えるsource conflict用input。
- `test/fixtures/triage-operator-uat/legacy-triage-result.yaml`
  - matching `PRE-001`とunmatched `OLD-999`を含むmigration input。
- `test/fixtures/triage-operator-uat/README.md`
  - copy手順とvalidation対象外である制約を記録した。

fixtureはHuman Triageのoperator UAT専用で、任意のreview-packageの`evidence-index.json`とは対応しない。Bob output validationを含むE2Eでは、同一workspaceで生成したreview-packageとBob agent outputを使用する。

実施後はevidence templateを次へcopyして記入し、PR branchへcommitする。

```text
docs/release-evidence/triage-integrity-ibm-bob-uat-YYYY-MM-DD.md
```

現時点ではkitの準備まで完了しており、実IBM Bob環境での結果やsign-offは記録していない。未実施項目をpassとして扱わない。

## 手動UAT残件

実IBM Bob環境でのみ確認可能な範囲をrelease-candidate gateとして残す。

1. Bob agentによるreview実行とresult handoff
2. workflow-register / Bob Workflow UIを介した一連の操作
3. MCP連携
4. 二つのHuman Triage panelを使った視覚的競合表示
5. Webview layout、focus、keyboard操作、operator向け文言
6. Developer Tools Console全体のwarning / exception確認
7. 日付入りUAT evidenceのcommit
8. Operator / reviewer / release owner sign-off

## 関連文書

- `docs/superpowers/plans/2026-07-12-bob-code-consistency-review-triage-integrity.md`
- `docs/superpowers/plans/2026-07-12-bob-code-consistency-review-triage-operator-extension-host.md`
- `docs/superpowers/specs/2026-07-11-bob-code-consistency-review-workspace-v2-design.md`
- `extensions/bob-code-consistency-review/docs/triage-operator-extension-host-test-spec-ja.md`
- `extensions/bob-code-consistency-review/docs/triage-integrity-ibm-bob-uat-runbook-ja.md`
- `extensions/bob-code-consistency-review/docs/triage-integrity-ibm-bob-uat-evidence-template.md`

## 判定

Phase 1のコード、単体・package gate、Ubuntu / Windows Extension Host operator gate、設計・運用文書、IBM Bob UAT kitの準備は完了した。IBM Bob本体、workflow UI、MCP、visual operator UATとsign-offが完了するまではrelease可とは判定せず、Pull Requestはdraftで維持する。
