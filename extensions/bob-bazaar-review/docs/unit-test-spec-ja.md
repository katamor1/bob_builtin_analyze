# bob-bazaar-review 単体テスト仕様書

## 1. 目的

本書は`extensions/bob-bazaar-review`の自動テスト契約を定義する。対象はBazaar CLI wrapper、文字コード、workspace解決、review packet、Review Run、project rules、review-result、指摘確認・振り分け、レビュー実績、文書ベース規約作成、MCP、workflow provider、主GUI lifecycleである。

## 2. 実行方式

| 項目 | 内容 |
| --- | --- |
| compile | `npm run compile` |
| full suite | `node --test test/*.test.js`または`npm test` |
| runner | Node.js built-in test runner |
| VS Code / Bob | mock / stub |
| Bazaar CLI | fake executableまたはinjected process runner |
| filesystem | `fs.mkdtemp()`でtestごとに隔離 |

## 3. 公開surface contract

### BZR-UT-SURFACE-001 公開Command Palette entry

- manifestを構造的に読む。
- 常時表示は次の2件だけである。

```text
bobBazaar.openReviewGui | Bob Bazaar Review | レビューを開始
bobBazaar.authorProjectRulesFromDocuments | Bob Bazaar Review | 資料からプロジェクト規約を作成
```

- その他のcontributed commandは`menus.commandPalette`で`when: "false"`を持つ。
- contributed commandと`onCommand:` activation event、runtime registrationの対応を検証する。

実テスト:

- `test/commandPalettePolicy.test.js`
- `../../scripts/three-extension-command-surface.test.js`

### BZR-UT-SURFACE-002 単一主GUI

- `bobBazaar.openReviewGui`だけがreview operator panelを開く。
- view typeは`bobBazaarReviewGui`、titleは`Bazaar レビュー`である。
- review、`レビュー結果取り込み`、`指摘確認・振り分け`、`レビュー実績`を同じpanelで切り替える。
- stage serviceは独立した公開panelを作らない。
- stage切替、dispose、同じstageへの再遷移、古いgeneration完了を検証する。

実テスト:

- `test/guiFirstSurfaces.test.js`
- `test/reviewGuiHtml.test.js`
- `test/reviewGuiLifecycle.test.js`
- `test/campaignDashboardGui.test.js`

## 4. Bazaar CLI

### BZR-UT-CLI-001 `--no-aliases`

`root`、`revno`、`log`、`diff`、`cat`、`status`の全呼出しで`--no-aliases`が先頭global optionとして入る。

### BZR-UT-CLI-002 safe argument array

- shellを使わない。
- revision、path、cwdを別argumentで渡す。
-改行、制御文字、absolute / traversal path、Windows device pathを拒否する。

### BZR-UT-CLI-003 exit code / timeout / output cap

- diffありexit codeだけを許可する。
- timeout、abort、buffer超過、非許可exit codeを分類する。
- process終了後にdangling callbackを残さない。

### BZR-UT-CLI-004 text decode

UTF-8、Shift-JIS、CP932、windows-31j、auto fallbackを検証する。byte上限はdecode前後で逸脱しない。

主な実テスト:

- `test/bazaar.test.js`
- `test/textEncoding.test.js`
- external process policy tests

## 5. Workspace解決

### BZR-UT-ROOT-001 `.bob` / `.bzr`分離

multi-rootでBob workspaceとBazaar repositoryを別々に解決する。

### BZR-UT-ROOT-002 explicit / active / picker優先順位

explicit root、workflow root、marker candidate、active editor、single candidate、QuickPick、fallbackの順序を固定する。

### BZR-UT-ROOT-003 physical containment

realpath、symlink / junction、case、Windows reserved name、trailing dot / spaceを検証する。

主な実テスト:

- workspace resolver / roots / path boundary tests

## 6. Review targetとpacket

### BZR-UT-PACKET-001 target mode

`singleRevision`、`revisionRange`、`workingTreeSinceRevision`のmetadataとdiff commandを検証する。

### BZR-UT-PACKET-002 added file content

新規file本文をboundedに取得し、超過時は省略を明記する。

### BZR-UT-PACKET-003 packet contract

packetにrepository、mode、revision / range、log、diff、changed files、project rules、output contractを含める。

### BZR-UT-PACKET-004 Bob fallback

IBM Bob不在時はMarkdown documentを作成する。context追加失敗時はclipboard fallbackを行う。

主な実テスト:

- Bazaar target / packet / direct command tests
- `test/workflowStepCompletion.test.js`

## 7. Review Run

### BZR-UT-RUN-001 identityとpath

- `campaignId` / `reviewId`をsafe path segmentとして検証する。
- workspace外、symlink / junction、Windows reserved nameを拒否する。

### BZR-UT-RUN-002 collision-safe allocation

既存またはlegacy record directoryがある場合は`-02`以降をatomic予約する。並行開始で同じIDを共有しない。

### BZR-UT-RUN-003 state transition

```text
target -> packet -> result -> triage -> record -> summary
```

逆方向遷移、不正schema、identity mismatchを拒否する。

### BZR-UT-RUN-004 atomic save / revision

same-directory temp + rename、cleanup、revision token、stale writer rejectionを検証する。

### BZR-UT-RUN-005 resume / recovery

未完了runの一覧、再開、legacy artifact recovery、duplicate candidate、workspace再検証を確認する。

### BZR-UT-RUN-006 result ID binding

active Review Runと異なる`review_id`を、artifact保存前と関連付け時の両方で拒否する。

主な実テスト:

- `test/reviewRunPaths.test.js`
- `test/reviewRunState.test.js`
- `test/reviewRunStore.test.js`
- `test/reviewRunCoordinator.test.js`
- `test/reviewRunCommandInput.test.js`
- `test/reviewRunExpectedReviewId.test.js`
- Review Run resume / recovery / integration tests

## 8. レビュー結果取り込み

### BZR-UT-RESULT-001 candidate extraction

raw object、fenced JSON、balanced JSON objectから候補を抽出する。

### BZR-UT-RESULT-002 schema / rule validation

required、enum、type、minimum、local `$ref`、project checklist条件を検証する。

### BZR-UT-RESULT-003 fixed workspace

stage初期化時に選択したworkspace rootを、manual / clipboard / validationの全処理で固定する。

### BZR-UT-RESULT-004 atomic artifacts

JSON、Markdown、metadata sidecarを整合したidentityで保存する。途中失敗で部分成果物を残さない。

### BZR-UT-RESULT-005 render / dispose

render拒否、Webview post rejection、dispose後完了、古いgeneration完了を成功扱いしない。

主な実テスト:

- result capture core / artifact tests
- `test/reviewGuiLifecycle.test.js`
- `test/guiFirstSurfaces.test.js`

## 9. 指摘確認・振り分け / record / summary

### BZR-UT-DECISION-001 decision validation

`accepted`、`rejected`、`needs_investigation`、`deferred`と必須owner / action / reasonを検証する。

### BZR-UT-DECISION-002 record binding

packet、review-result、decision、quality gateを同じreview IDで`record.yaml`へ結び付ける。

### BZR-UT-DECISION-003 finalize

record validation、summary generation、Review Run phase更新を安全な順序で行う。

### BZR-UT-DECISION-004 legacy recovery

legacy fileを読込み、backup、migration report、unmatched findingの保全を確認する。

主な実テスト:

- `test/reviewRecordCommands.test.js`
- record store / validation / finalize / recovery tests

## 10. レビュー実績

### BZR-UT-METRICS-001 aggregation

Review Run、record、valid decision、review-resultをsource priorityに従って集計する。

### BZR-UT-METRICS-002 rates / pending / warning

- 分母0は`n/a`。
- pending decisionを別集計する。
- malformed、missing、identity mismatch、symlink除外をwarningにする。

### BZR-UT-METRICS-003 export parity

JSON / Markdown / CSVを同じmodelから生成し、source artifactを変更しない。

主な実テスト:

- `test/campaignDashboardExport.test.js`
- `test/campaignDashboardGui.test.js`
- dashboard / metric / integration tests

## 11. 文書ベース規約作成

### BZR-UT-AUTHOR-001 extraction

`.docx`、`.xlsx`、text PDFをdocument orderとlocator付きでbounded抽出する。`.doc` / `.xls` / image-only PDFはconversion / OCR要求として扱う。

### BZR-UT-AUTHOR-002 AI consent

source name、selected chunk count、UTF-8 bytes、model routeを表示し、明示同意前に本文をagentへ渡さない。

### BZR-UT-AUTHOR-003 evidence / proposal

chunk ID、hash、source membership、proposal schema、base hash、citation、operationを検証する。

### BZR-UT-AUTHOR-004 human decision / transaction

accept / reject / edit、preview、journal、backup、rename、rollback、restart recovery、final verificationを検証する。

### BZR-UT-AUTHOR-005 privacy

raw document text、raw AI response、absolute pathをremote artifact、notification、MCP provenanceへ出さない。

### BZR-UT-AUTHOR-006 検証済みOOXML snapshot

source byte上限、1つのopen handle、読み取り前後のstat、SHA-256を含むfingerprintに結び付いたsnapshot Bufferを検証する。same-size / same-mtime replacementを含むfingerprint不一致ではparserをloadしない。ZIP32 preflightと全entry payloadのstored長、bounded deflate、圧縮入力の完全消費、展開長、CRC検証がすべてparser loadより先に完了することを確認する。

通常のDOCX/XLSXではparserが元の検証済みsnapshot Bufferだけを受け取ることを確認する。missing-both XLSXだけがメモリ内で再構築され、拡張所有の`fflate`直接loadがこのbranchでだけ発生することを、parser由来の推移依存loadと分けて検証する。成功時も失敗時も原本とworkspaceを変更しない。

契約testは、公開Command ID、設定、persisted schema、安全なpathless日本語エラーメッセージ、extension version、dependency宣言とlockfileが変わらないことも確認する。

主な実テスト:

- rule authoring extraction / consent / proposal / apply tests
- `test/ruleOoxmlPreflight.test.js`
- `test/ruleDocxExtraction.test.js`
- `test/ruleXlsxExtraction.test.js`
- `test/ruleDocumentExtraction.test.js`
- `test/ruleAuthoringHeavyDependencyLoading.test.js`
- `test/ruleAuthoringDocumentation.test.js`
- Windows-root identity tests

## 12. MCP

### BZR-UT-MCP-001 stdio protocol

`initialize`、`notifications/initialized`、`tools/list`、`tools/call`、unknown method、malformed params、request size上限を検証する。

### BZR-UT-MCP-002 read-only Bazaar tools

Bazaar operationsはread-onlyのみ。破壊的operationはtool registryに存在しない。

### BZR-UT-MCP-003 allowed root

`BOB_BAZAAR_ALLOWED_ROOTS`未設定またはroot外cwdを拒否する。明示的なunrestricted modeだけ例外にする。

### BZR-UT-MCP-004 write opt-in

`project_rules_init`だけがwrite toolであり、`BOB_BAZAAR_ENABLE_WRITE_TOOLS=1`とallowed rootの両方を要求する。

### BZR-UT-MCP-005 VS Code config separation

`.bob/mcp.json`設定は`BOB_BAZAAR_ALLOWED_ROOTS`を記録するが、write toolを自動有効化しない。

主な実テスト:

- MCP server / registry / root boundary / write-tool tests
- `test/mcpWriteTools.test.js`

## 13. Workflow provider

### BZR-UT-PROVIDER-001 exact provider inventory

review provider 4件とrule authoring provider 7件を実装・文書・同梱workflow間で照合する。

### BZR-UT-PROVIDER-002 owner / rollback

owner付き登録、duplicate拒否、部分登録失敗時の逆順dispose、deactivation cleanupを検証する。

### BZR-UT-PROVIDER-003 soft dependency

workflow-register未導入でもactivationとlocal commandが利用でき、後から有効化すると登録が回復する。

主な実テスト:

- `test/workflowProviderRegistration.test.js`
- workflow action contract tests

## 14. Cross-extension documentation contract

### BZR-UT-DOC-001 recursive classification

`scripts/three-extension-documentation-contract.json`のrootから全Markdownを再帰探索し、未列挙fileはcurrent、明示pathだけhistoricalにする。

### BZR-UT-DOC-002 current references

current文書には、廃止済みpublic IDと旧user-facing UI名が残らない。

### BZR-UT-DOC-003 historical notices

historical文書が旧ID / 旧画面名を保持する場合、冒頭12行以内の`Replaced:`または`Superseded:`で正規routeを示す。

### BZR-UT-DOC-004 manifest / runtime / write safety

main、soft dependency、composition root、template diff -> confirmation -> backup -> update、MCP write boundaryをsourceと文書で照合する。

実行:

```bash
node --test ../../scripts/three-extension-documentation-contract.test.js
node --test ../../scripts/three-extension-command-surface.test.js
```

## 15. Policy / full gate

```bash
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

完了条件:

- full suiteがfail 0。
- current docsに旧公開routeが0件。
- package budgetと禁止entry policyを満たす。
- source / manifest / workflow / docsのprovider IDが一致する。
