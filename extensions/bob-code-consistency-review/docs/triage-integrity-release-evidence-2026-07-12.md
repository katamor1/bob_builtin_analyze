# Human Triage Integrity Phase 1 リリース証跡

- 対象: `extensions/bob-code-consistency-review`
- ブランチ: `agent/bob-code-consistency-review-triage-integrity`
- Pull Request: `#74`
- 記録日: 2026-07-12
- 状態: automated gates complete / manual operator UAT pending

## 実装範囲

Workspace v2 Phase 1 として、Bob output由来のsource dataと人間のdecisionを分離した。

- `triage-source/v1` のimmutable snapshot
- `triage-decisions/v1` の`source_id` keyed decision store
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

## 自動検証

### Windows full verification

GitHub Actions run `29193276984` で次を実行し、すべて成功した。

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

既存CAS regression testがWindowsの8.3短縮pathと長形式pathをlexical stringで比較していたため、temporary file barrierとbackup parent assertionをphysical identity基準へ変更した。GitHub Actions run `29193144292` で対象suiteが成功した。

### Repository workflows

本ファイルのコミットを通常のPull Request eventとして使用し、最新headに対する次のworkflowを最終共有gateとする。

- `code-consistency-review-scaffold`
- `extensions-quality`（Ubuntu / Windows、unit、package、VSIX policy、Extension Host smoke）

結果はPull Request checksを正本とする。

## 手動UAT残件

次は実VS Code / IBM Bob環境でのみ確認可能なため、merge後のrelease candidateまたはmerge前のoperator gateとして実施する。

1. generate → edit → save → close → reopenでdecisionとsource contextが一致する。
2. triage再生成後、古い画面からのsaveが`TRIAGE_SOURCE_CHANGED`になる。
3. 二画面競合で古い画面が`TRIAGE_REVISION_CONFLICT`になる。
4. legacy `triage-result.yaml`からmatching IDだけが移行される。
5. backup、projection、migration reportが仕様どおりである。
6. Developer Tools Consoleに未処理例外が残らない。

## 判定

Phase 1のコード、単体・package gate、設計・運用文書の同期は完了した。自動workflowが最新headで成功した後も、実IBM Bob operator UATが完了するまではrelease可とは判定しない。
