# bob-bazaar-review 実機テスト仕様書

## 1. 目的

本書は`bob-bazaar-review`の実機・Extension Host受入契約を定義する。mockでは確認できないVS Code activation、Command Palette、主GUI、IBM Bob、workflow-register、Bazaar CLI、MCP、multi-root、filesystem、視覚・keyboard操作を確認する。

## 2. 対象

| 区分 | 対象 |
| --- | --- |
| Extension | `local.bob-bazaar-review` |
| Public commands | `bobBazaar.openReviewGui`, `bobBazaar.authorProjectRulesFromDocuments` |
| Primary panel | view type `bobBazaarReviewGui`, title `Bazaar レビュー` |
| Optional integrations | `IBM.bob-code`, `local.workflow-register` |
| Bazaar | `root`, `revno`, `log`, `diff`, `cat`, `status` |
| MCP | stdio JSON-RPC、read-only Bazaar tools、project rules tools |
| Artifacts | `.bob/review/results/**`, `.bob-review-records/**`, `.bob/review/rule-authoring/**` |
| Platforms | UbuntuとWindows |

## 3. 前提

- 対象commitからVSIXを作成する。
- Ubuntu / WindowsのHosted Extension Hostは同じhead SHAを使う。
- 実Bazaar CLIを使うmanual UATでは、破棄可能なsandbox repositoryを使う。
- IBM Bob / workflow-registerがないcaseと、両方があるcaseを分ける。
- Developer Tools Consoleを開ける。
- screenshot、artifact hash、run stateを保存できる。
- 秘密情報、顧客data、credentialを使わない。

## 4. build / package

```bash
npm ci
npm run compile
npm run dependency:policy
npm run architecture:policy
npm run source:policy
npm run unused:policy
npm run unused:report
npm run artifact:policy
npm test
npm run package
npm run package:policy
npm run package:smoke
npm run package:metrics
```

VSIX build commitとtested commitが一致しない場合はUATを開始しない。

## 5. Hosted Extension Host matrix

### BZR-EH-001 activation

Ubuntu / Windowsの両方で拡張をactivateする。

期待結果:

- activationがresolveする。
- optional extension不在でもactivation errorにならない。
- uncaught exception / unhandled rejectionがない。

### BZR-EH-002 exact public command inventory

`vscode.commands.getCommands(true)`に次の2件が存在する。

```text
bobBazaar.openReviewGui
bobBazaar.authorProjectRulesFromDocuments
```

代表hidden commandも登録されている。

```text
bobBazaar.collectReviewContext
bobBazaar.captureReviewResult
bobBazaar.records.createRecord
```

Command Palette policyは2件だけを常時表示する。

### BZR-EH-003 primary panel

`Bob Bazaar Review: レビューを開始`を実行する。

期待結果:

- view type: `bobBazaarReviewGui`
- title: `Bazaar レビュー`
- workspace選択を含む初期modelがrenderされる。
- panelを閉じてもdangling callbackがない。

### BZR-EH-004 same-panel stages

同じpanelで次を順に切り替える。

```text
レビュー
レビュー結果取り込み
指摘確認・振り分け
レビュー実績
```

期待結果:

- panel identityが変わらない。
- active Review Run identityを引き継ぐ。
- stageを戻しても古いcompletionが最新modelを上書きしない。
-独立した後段panelを作らない。

### BZR-EH-005 soft dependency availability

| 条件 | 期待結果 |
| --- | --- |
| IBM Bobなし | packet Markdownを作成し、Bob context追加を試みない。 |
| workflow-registerなし | local review serviceを利用できる。 |
| 両方あり | providerが登録され、Bob workflowを実行できる。 |
| 後から有効化 | provider registrationが回復する。 |

## 6. Bazaar CLI manual UAT

### BZR-RT-001 `--no-aliases`

1. user aliasを設定したBazaar環境を用意する。
2. 主GUIでsingle revision、range、working tree targetを取得する。
3. process logを確認する。

期待結果:

- 全操作が`bzr --no-aliases ...`を使う。
- alias GUI起動やstdout欠落がない。
- argument injectionを許さない。

### BZR-RT-002 single revision

- revision log、diff、changed filesを表示する。
- new file contentはsize上限内だけpacketへ入る。

### BZR-RT-003 revision range

- base / targetを別fieldで入力する。
- `BASE..TARGET`のrange diffとtarget metadataを表示する。

### BZR-RT-004 working tree

- optional base revision、current revno、diff、statusを表示する。
- uncommitted changeをpacketへ含める。

### BZR-RT-005 CP932 / Shift-JIS

日本語log、diff、added fileを`auto` / `cp932`で取得し、重大な文字化けがないことを確認する。

### BZR-RT-006 size limits

`maxDiffBytes`と`maxAddedFileContentBytes`を小さくし、省略表示とUTF-8 byte上限を確認する。

## 7. `.bob` initialization / template update

### BZR-RT-010 missing assets

主GUIの初期化操作でmissing assetを作成する。

```text
.bob/mcp.json
.bob/custom_modes.yaml
.bob/review/checklist.json
.bob/review/review-result.schema.json
.bob/review/review-prompt-template.md
.bob/skills/project-review-checklist/SKILL.md
.bob/workflows/bazaar-project-rule-review/WORKFLOW.md
```

### BZR-RT-011 workflow update

既存workflowをbundled templateと異なる内容にする。

期待結果:

1. diff previewを表示する。
2. replacementを明示確認する。
3. cancel時はtargetとbackupを変更しない。
4. 承認時は一意なbackupを作る。
5. backup成功後にbundled bytesへ更新する。

### BZR-RT-012 MCP config separation

`.bob/mcp.json`を更新する。

期待結果:

- `BOB_BAZAAR_ALLOWED_ROOTS`が設定される。
- `BOB_BAZAAR_ENABLE_WRITE_TOOLS`を自動設定しない。
- config updateはMCP tool writeとは別操作である。

## 8. Review Run end-to-end

### BZR-RT-020 start

1. campaign、target、requested review IDを入力する。
2. Review Runを開始する。

期待結果:

- safeなactual review IDを割り当てる。
- `review-run.json`と`review-packet.md`を保存する。
- packetにexact review ID contractを含める。
- IBM Bobがあればcontextへ追加する。

### BZR-RT-021 collision

同じcampaign / requested IDで2回開始する。

期待結果:

- 2件目は`-02`になる。
- legacy directoryを上書きしない。
- 同時開始でもIDが重複しない。

### BZR-RT-022 レビュー結果取り込み

Bobのvalid review-resultを同じpanelで保存する。

期待結果:

- active Review Runのworkspace / campaign / review IDを表示する。
- JSON、Markdown、metadata sidecarを保存する。
- phaseが`result`へ進む。
- 保存後に`指摘確認・振り分け`へ進める。

### BZR-RT-023 ID mismatch

異なる`review_id`を持つJSONを入力する。

期待結果:

- expected / actual IDを示すvalidation errorになる。
- JSON / Markdown / metadataを保存しない。
- active runを別IDへ関連付けない。

### BZR-RT-024 指摘確認・振り分け

- accepted: ownerまたはaction
- rejected: reason
- needs_investigation: ownerとaction
- deferred: reason

を保存し、reopen後に同じdecisionを表示する。

### BZR-RT-025 finalize

record validation、summary generation、phase更新を行う。

期待結果:

- packet / result / decision / record / summaryが同じidentityで結び付く。
-失敗時にcompleted扱いしない。
- source artifactを変更しない。

### BZR-RT-026 resume / legacy recovery

VS Codeを再起動し、未完了runを主GUIから再開する。legacy artifactがある場合はbackupとmigration reportを確認する。

## 9. レビュー実績

### BZR-RT-030 aggregation

複数runを持つcampaignを開く。

期待結果:

- run status、pending decision、schema success、decision rate、rule / target mode trend、timeを表示する。
- malformed / missing / identity mismatchをwarningにする。
- rate分母0は`n/a`になる。

### BZR-RT-031 export

JSON / Markdown / CSVをexportする。

期待結果:

- 3形式が同じmodelを表す。
- `dashboard.*`だけを更新する。
- packet、result、decision、record、summaryを変更しない。

## 10. 文書ベース規約作成

### BZR-RT-040 source extraction

`.docx`、`.xlsx`、text PDFを個別選択する。

期待結果:

- source hash、locator、chunk、warningをpreviewする。
- `.doc` / `.xls`はconversion要求になる。
- image-only PDFはOCR要求になる。
- macro、formula recalc、external link refreshを行わない。

### BZR-RT-041 AI consent

source name、selected chunks、UTF-8 bytes、model routeを確認し、同意前に本文がagentへ渡らないことを確認する。

### BZR-RT-042 proposal / decision / apply

- proposed rule、context、addendumを個別判断する。
- apply preview、pre/post hash、retire内容を確認する。
- journal、backup、transaction、rollback、final verificationを確認する。

### BZR-RT-043 restart recovery

未完了transactionを作り、再起動後に通常操作より先にrecoveryへ誘導されることを確認する。

## 11. MCP UAT

### BZR-MCP-001 initialize / list

`initialize`と`tools/list`に応答する。

### BZR-MCP-002 read-only Bazaar tools

代表toolをallowed root内で実行する。破壊的toolが存在しない。

### BZR-MCP-003 root boundary

allowed root未設定、root外cwd、symlink escapeを拒否する。

### BZR-MCP-004 write opt-in

`project_rules_init`は既定でlistに出ず、直接callもerrorになる。`BOB_BAZAAR_ENABLE_WRITE_TOOLS=1`とallowed rootを明示した場合だけ実行できる。

## 12. Multi-root

Bob workspaceとBazaar repositoryを別folderにする。

期待結果:

- Bazaar commandは`.bzr` rootで動く。
- rules、result、Review Runは選択したBob workspaceへ保存する。
- stage途中でactive editorが変わっても固定workspaceを使う。
- 同じIDを持つ別rootを混同しない。

## 13. Manual visual / accessibility gate

UbuntuとWindowsの代表環境で次を確認する。

- 200% zoomでfield label、status、stage navigation、buttonを識別できる。
- VS Code High Contrast / Windows High Contrastで境界とfocusを識別できる。
- Tab / Shift+Tabだけで主要actionへ移動できる。
- select、checkbox、inputをkeyboardで操作できる。
- error、conflict、successを色だけに依存せず区別できる。
- stage変更後もstatusを見失わない。
- screenshotに秘密情報、顧客data、absolute user pathを含めない。

## 14. Console gate

各scenario前にConsoleをclearし、終了後に次を確認する。

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
- dispose後のcallback error 0
- write failure後のsecondary exception 0

## 15. Cross-extension hosted acceptance

同一head SHAで次を満たす。

```text
workflowRegister.openOperationHub      -> workflowRegisterOperationHub / Bob 操作ハブ
workflowRegister.openWorkflowBuilder   -> workflowRegisterBuilder / ワークフロー作成・編集
bobBazaar.openReviewGui                -> bobBazaarReviewGui / Bazaar レビュー
bobCodeConsistency.openReviewWizard    -> bobCodeConsistencyReviewWizard / 整合プレレビュー
```

さらに5件すべてのpublic commandと代表hidden commandがUbuntu / Windowsで登録される。panelを閉じた後もunhandled rejectionがない。

## 16. 完了条件

- automated full suite / policy / package gateがpass。
- Ubuntu / Windows Extension Hostが同一SHAでpass。
- public command / panel type / titleがexact match。
- Bazaar CLI、MCP、Review Run、規約作成のmanual UATがpass。
- visual / keyboard / Console gateがpass。
- evidenceにcommit、VSIX、OS、versions、artifact hashesを記録する。
