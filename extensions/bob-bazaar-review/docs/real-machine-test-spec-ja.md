# bob-bazaar-review 実機テスト仕様書

## 1. 目的

本書は `extensions/bob-bazaar-review` の実機テスト仕様を定義する。レビュー実行の中断・再開・finalize・legacy recoveryも対象とする。単体テストでは mock 化する VS Code Extension Host、IBM Bob、workflow-register、Bob Workflow UI、Webview、Bazaar CLI、MCP server、multi-root workspace、実ファイル I/O を含めて確認する。

## 2. テスト対象

| 区分 | 対象 |
| --- | --- |
| Extension ID | `local.bob-bazaar-review` |
| 公開 command | `bobBazaar.openReviewGui`, `bobBazaar.authorProjectRulesFromDocuments` |
| Primary panel | view type `bobBazaarReviewGui`、title `Bazaar レビュー` |
| Optional integrations | `IBM.bob-code`, `local.workflow-register` |
| Bazaar | `bzr root`, `bzr log`, `bzr diff`, `bzr cat`, `bzr status`, `bzr revno` |
| Bob workspace | `.bob/mcp.json`, `.bob/review/*`, `.bob/skills/*`, `.bob/workflows/bazaar-project-rule-review/WORKFLOW.md` |
| 成果物 | `.bob/review/results/<review_id>.json`, `.bob/review/results/<review_id>.md`, `.bob-review-records/campaigns/<campaign_id>/...` |
| UI | Command Palette、単一の `Bazaar レビュー` 主GUI Webview（レビュー／レビュー結果取り込み／指摘確認・振り分け／レビュー実績）、Bob Workflow UI、active editor validation report |
| MCP | stdio JSON-RPC server、Bazaar readonly tools、project rules tools、review result tools |
| 対象 platform | Ubuntu、Windows |

## 3. 前提環境

| 項目 | 条件 |
| --- | --- |
| OS | Ubuntu と Windows の Hosted Extension Host。実Bazaar CLIのmanual UATは破棄可能なsandbox repositoryで行う。 |
| VS Code / Bob IDE | `package.json` の `engines.vscode` を満たすバージョン。 |
| IBM Bob 拡張 | `IBM.bob-code` が導入済みで、有効化できること。 |
| workflow-register | `local.workflow-register` が導入済みで、有効化できること。 |
| Bazaar CLI | `bzr` が PATH にある、または `bobBazaar.bzrPath` で指定できること。 |
| Node.js / npm | extension build / MCP server 起動が可能なバージョン。 |
| テスト workspace | `.bob` を持つ Bob workspace と `.bzr` を持つ Bazaar repository。 |
| Evidence | commit SHA、VSIX、OS、VS Code / Bob IDE / companion extension / Bazaar CLIのversion、artifact hash、screenshot、run stateを保存できること。 |
| データ | 秘密情報、顧客data、credentialを使用しないこと。 |

## 4. 事前準備

### 4.1 拡張機能ビルド

```powershell
cd extensions\bob-bazaar-review
npm ci
npm run compile
npm run dependency:policy
npm run architecture:policy
npm run source:policy
npm run unused:policy
npm run unused:report
npm run artifact:policy
npm run audit:prod
npm test
npm run package
npm run package:policy
npm run package:smoke
npm run package:metrics
```

VSIXを作成したcommit SHAと実機テスト対象commit SHAが一致しない場合はUATを開始しない。Ubuntu / WindowsのHosted Extension Hostは同じSHAから作成したVSIXを使う。

### 4.2 推奨 workspace 構成

single-root の場合:

```text
<workspace>/
  .bob/
  .bzr/
  src/
    sample.c
```

multi-root の場合:

```json
{
  "folders": [
    { "path": "./workspace" },
    { "path": "./bazaar_test/branch2" }
  ]
}
```

```text
workspace/
  .bob/

bazaar_test/branch2/
  .bzr/
  src/
    sample.c
```

### 4.3 review-result JSON 例

```json
{
  "review_id": "bazaar-review-smoke",
  "target": {
    "repository": "sample",
    "revision": "1"
  },
  "summary": "重大な問題はありません。",
  "findings": [],
  "questions": [],
  "overall_severity": "info"
}
```

実際の schema に合わせて必須 field はプロジェクトの `.bob/review/review-result.schema.json` を参照する。

## 5. 共通確認項目

各テストでは可能な範囲で次を確認する。

- VS Code Developer Tools Console に未処理例外が出ていない。
- `bzr` 実行に alias が影響せず、`--no-aliases` 経路で動作する。
- `.bob` と `.bzr` が別 root の場合も、保存先と差分取得先が分離される。
- `IBM.bob-code` 未導入時または無効時は Markdown document 作成で安全に停止する。
- `workflow-register` 未導入時でも通常 command が利用できる。
- `.bob/review/results` への JSON / Markdown 保存が UTF-8 で行われる。
- MCP tools は読み取り専用で、破壊的 Bazaar 操作を提供しない。
- Command Palette で常時公開するのは `Bob Bazaar Review: レビューを開始` と `Bob Bazaar Review: 資料からプロジェクト規約を作成` の2件だけである。その他の command は主GUI、workflow provider、または `vscode.commands.executeCommand` による技術確認で扱い、独立した利用者向けpanelを作らない。

## 6. Hosted Extension Host matrix

### BZR-EH-001 activation

Ubuntu / Windowsの両方で対象VSIXをactivateする。`IBM.bob-code` と `local.workflow-register` の両方を無効化した条件も含め、activationがresolveし、uncaught exception / unhandled rejectionが発生しないことを確認する。

### BZR-EH-002 exact command inventory

`vscode.commands.getCommands(true)` に公開command 2件が存在する。

```text
bobBazaar.openReviewGui
bobBazaar.authorProjectRulesFromDocuments
```

さらに代表hidden command `bobBazaar.collectReviewContext`、`bobBazaar.captureReviewResult`、`bobBazaar.records.createRecord` が登録されていること、Command Paletteに常時表示されるのは公開2件だけであることを確認する。

### BZR-EH-003 primary panel

`Bob Bazaar Review: レビューを開始` を実行し、view type `bobBazaarReviewGui`、title `Bazaar レビュー` がexact matchすることを確認する。workspace選択を含む初期modelがrenderされ、panelを閉じた後にdangling callbackが残らないこと。

### BZR-EH-004 same-panel stages

同じ `bobBazaarReviewGui` panelで `レビュー`、`レビュー結果取り込み`、`指摘確認・振り分け`、`レビュー実績` を順に切り替える。

期待結果:

- panel identityとactive Review Run identityを維持する。
- stage変更、同じstageへの再遷移、dispose後に古いasync completionが最新modelを上書きしない。
- render / post拒否を成功扱いしない。
- 独立した後段panelを作らない。

### BZR-EH-005 soft dependency availability

| 条件 | 期待結果 |
| --- | --- |
| IBM Bob / workflow-registerなし | local review serviceと主GUIが利用でき、packet Markdownを作成する。activation failureにならない。 |
| IBM Bobのみ | Bob context投入を利用でき、workflow provider不在でもlocal reviewを継続できる。 |
| workflow-registerのみ | providerを登録でき、IBM Bob投入が必要な操作は理由付きで安全に停止する。 |
| 両方あり | providerが登録され、Bob workflowを実行できる。 |
| activation後に有効化 | companion extension変更を検知し、provider registration / Bob連携が回復する。 |

## 7. 実機テスト項目

### BZR-RT-001 拡張起動と command 登録

| 項目 | 内容 |
| --- | --- |
| 目的 | 拡張が起動し、公開commandとhidden commandの登録境界が守られることを確認する。 |
| 手順 | 1. テスト workspace を開く。<br>2. `Developer: Show Running Extensions` で拡張状態を確認する。<br>3. Command Palette で `Bob Bazaar Review:` を検索する。<br>4. `vscode.commands.getCommands(true)` で代表hidden commandを確認する。 |
| 期待結果 | Command Palette には `レビューを開始` と `資料からプロジェクト規約を作成` の2件だけが常時表示される。context収集、rules読込み、capture、MCP設定、init、revision / range review、JSON検証、Phase 1 record / triage / summaryのcommandは登録済みだがhiddenのままである。 |

### BZR-RT-002 workflow-register provider 登録

| 項目 | 内容 |
| --- | --- |
| 目的 | workflow-register に action provider が登録されることを確認する。 |
| 手順 | 1. workflow-register と本拡張を有効化する。<br>2. `.bob/workflows/bazaar-project-rule-review/WORKFLOW.md` を配置または初期化する。<br>3. workflow-register reload / inspect を実行する。 |
| 期待結果 | `bobBazaar.openReviewGui`、`collectReviewContext`、`loadReviewRules`、`captureReviewResult` が provider missing にならない。 |

### BZR-RT-003 `.bob` project rules 初期化

| 項目 | 内容 |
| --- | --- |
| 目的 | `.bob/review` 規約ファイルを初期化できることを確認する。 |
| 手順 | 1. `.bob/review` が無い workspace を開く。<br>2. `Bob Bazaar Review: レビューを開始` で主GUIを開き、プロジェクト規約の初期化操作を実行する。 |
| 期待結果 | `.bob/review/checklist.json`、`review-result.schema.json`、`review-prompt-template.md`、example が作成される。checklist が editor で開く。 |

### BZR-RT-004 `.bob` workspace / workflow template 初期化

| 項目 | 内容 |
| --- | --- |
| 目的 | GUI または初期化処理で workflow / Skill / MCP template が配置されることを確認する。 |
| 手順 | 1. `Bob Bazaar Review: レビューを開始` で `Bazaar レビュー` 主GUIを開く。<br>2. `.bob` 未初期化状態を確認し、同じ主GUIから初期化する。<br>3. 既存workflowをbundled templateと異なる内容にして更新を試し、diff previewでcancelする。<br>4. 再度更新し、diffを確認して明示承認する。 |
| 期待結果 | `.bob/custom_modes.yaml`、`.bob/skills/project-review-checklist/SKILL.md`、`.bob/workflows/bazaar-project-rule-review/WORKFLOW.md` などが作成またはrefreshされる。既存workflow更新ではdiff previewと明示確認が必須で、cancel時はtargetとbackupを変更しない。承認時は衝突しない一意なbackupへ既存bytesを保存してからbundled bytesへ置換する。 |

### BZR-RT-005 MCP 設定

| 項目 | 内容 |
| --- | --- |
| 目的 | `.bob/mcp.json` に Bazaar MCP server を設定できることを確認する。 |
| 手順 | 1. `Bazaar レビュー` 主GUIの初期化操作からMCP設定を実行する。<br>2. Bob workspace を選択する。<br>3. `.bob/mcp.json` を確認する。<br>4. 必要に応じてhidden command `bobBazaar.configureMcp` を `vscode.commands.executeCommand` で呼び、同じ結果になることを確認する。 |
| 期待結果 | configured server name、command、args、env.BZR_PATH、disabled false が設定される。既存の非対象MCP server設定は保持され、`BOB_BAZAAR_ENABLE_WRITE_TOOLS` や unrestricted cwdを自動的に有効化しない。 |

### BZR-RT-006 Bazaar レビュー主GUI 起動

| 項目 | 内容 |
| --- | --- |
| 目的 | `Bazaar レビュー` 主GUIが開き、workspace state と `.bob` status が表示されることを確認する。 |
| 手順 | 1. `Bob Bazaar Review: レビューを開始` を実行する。<br>2. `Bazaar レビュー` Webview の初期表示を確認する。 |
| 期待結果 | Bazaar workspace、Bob workspace、初期化状態、target 入力欄が表示される。 |

### BZR-RT-007 GUI singleRevision target 読み込み

| 項目 | 内容 |
| --- | --- |
| 目的 | GUI で単一 revision の metadata と diff を取得できることを確認する。 |
| 手順 | 1. GUI で `singleRevision` を選ぶ。<br>2. revision を入力する。<br>3. target を読み込む。 |
| 期待結果 | log、diff、changed files、target label が表示される。 |

### BZR-RT-008 GUI revisionRange target 読み込み

| 項目 | 内容 |
| --- | --- |
| 目的 | GUI で revision range の diff を取得できることを確認する。 |
| 手順 | 1. GUI で `revisionRange` を選ぶ。<br>2. baseRevision / targetRevision を入力する。<br>3. target を読み込む。 |
| 期待結果 | range diff と changed files が表示される。 |

### BZR-RT-009 GUI workingTreeSinceRevision target 読み込み

| 項目 | 内容 |
| --- | --- |
| 目的 | GUI で working tree diff と status を取得できることを確認する。 |
| 手順 | 1. Bazaar working tree に未コミット変更を作る。<br>2. GUI で `workingTreeSinceRevision` を選ぶ。<br>3. baseRevision を任意で入力し、target を読み込む。 |
| 期待結果 | working tree diff、revno、status が表示される。 |

### BZR-RT-010 GUI review packet 生成と Bob context 追加

| 項目 | 内容 |
| --- | --- |
| 目的 | GUI から review packet を生成し、IBM Bob context へ追加できることを確認する。 |
| 手順 | 1. GUI で target を読み込む。<br>2. review 実行ボタンを押す。<br>3. Bob context / chat を確認する。 |
| 期待結果 | `# Bazaar Revision Review Request` packet が Bob context に追加される。失敗時は clipboard fallback される。 |

### BZR-RT-011 IBM Bob 未導入 / 無効時の GUI fallback

| 項目 | 内容 |
| --- | --- |
| 目的 | IBM Bob が無い場合でも Markdown document 作成で安全に停止することを確認する。 |
| 手順 | 1. IBM Bob 拡張を無効化した環境で GUI review を実行する。 |
| 期待結果 | Bob context 追加を試みず、Markdown document が作成される。 |

### BZR-RT-012 workflow 実行中 GUI step completion

| 項目 | 内容 |
| --- | --- |
| 目的 | workflow action として GUI を開いた後、current step 完了が best effort で実行されることを確認する。 |
| 手順 | 1. Bob Workflow UI から `bazaar-project-rule-review` を開始する。<br>2. `review-input` step で GUI を開く。<br>3. packet を生成する。 |
| 期待結果 | packet 生成後、workflow-register の current step 完了が試行される。失敗しても packet 生成自体は成功扱いになる。 |

### BZR-RT-013 direct reviewRevision command

| 項目 | 内容 |
| --- | --- |
| 目的 | hidden technical commandから単一 revision packetを生成でき、主GUIと同じservice結果になることを確認する。 |
| 手順 | 1. Extension Hostの技術確認から `vscode.commands.executeCommand("bobBazaar.reviewRevision")` を実行する。<br>2. Bazaar workspace と revision を入力する。 |
| 期待結果 | review packet Markdown が開き、環境に応じて Bob context 追加または選択ダイアログが表示される。 |

### BZR-RT-014 direct reviewRange command

| 項目 | 内容 |
| --- | --- |
| 目的 | hidden technical commandから revision range packetを生成でき、主GUIと同じservice結果になることを確認する。 |
| 手順 | 1. Extension Hostの技術確認から `vscode.commands.executeCommand("bobBazaar.reviewRange")` を実行する。<br>2. baseRevision / targetRevision を入力する。 |
| 期待結果 | range packet Markdown が開く。 |

### BZR-RT-015 project rules 付き direct reviewRevision

| 項目 | 内容 |
| --- | --- |
| 目的 | project rules section 付きの単一 revision packet を生成できることを確認する。 |
| 手順 | 1. `.bob/review` を初期化する。<br>2. Extension Hostの技術確認からhidden command `bobBazaar.reviewRevisionWithProjectRules` を実行する。 |
| 期待結果 | packet に checklist と review-result output contract が含まれる。 |

### BZR-RT-016 project rules 付き direct reviewRange

| 項目 | 内容 |
| --- | --- |
| 目的 | project rules section 付きの range packet を生成できることを確認する。 |
| 手順 | 1. `.bob/review` を初期化する。<br>2. Extension Hostの技術確認からhidden command `bobBazaar.reviewRangeWithProjectRules` を実行する。 |
| 期待結果 | range packet に project rules section が含まれる。 |

### BZR-RT-017 workflow collectReviewContext

| 項目 | 内容 |
| --- | --- |
| 目的 | 開いている review packet から workflow state 用 context を収集できることを確認する。 |
| 手順 | 1. review packet Markdown を開く。<br>2. workflow actionまたはhidden command `bobBazaar.collectReviewContext` を実行する。 |
| 期待結果 | packet の repository、mode、revision、diff summary などが result として返る。workflow 経由の場合は state に保存される。 |

### BZR-RT-018 workflow loadReviewRules

| 項目 | 内容 |
| --- | --- |
| 目的 | checklist / schema を読み込み、workflow action result に反映できることを確認する。 |
| 手順 | 1. `.bob/review` を初期化する。<br>2. workflow actionまたはhidden command `bobBazaar.loadReviewRules` を実行する。 |
| 期待結果 | checklistItems、categories、schemaTopLevelKeys、summary が返る。 |

### BZR-RT-019 review-result capture: clipboard

| 項目 | 内容 |
| --- | --- |
| 目的 | clipboard の review-result JSON を検証・保存できることを確認する。 |
| 手順 | 1. valid review-result JSON を clipboard にコピーする。<br>2. `Bob Bazaar Review: レビューを開始` で開いた同じpanelの `レビュー結果取り込み` stageからclipboardを取り込む。 |
| 期待結果 | `.bob/review/results/<review_id>.json` と `.md` が保存される。 |

### BZR-RT-020 review-result capture: active editor

| 項目 | 内容 |
| --- | --- |
| 目的 | active editor の selection / full text から review-result JSON を保存できることを確認する。 |
| 手順 | 1. review-result JSON を editor で開く。<br>2. 必要に応じて範囲選択する。<br>3. 主GUIの `レビュー結果取り込み` stageからactive editorを取り込む。 |
| 期待結果 | JSON と Markdown が `.bob/review/results` に保存される。 |

### BZR-RT-021 review-result capture: workflow handoff

| 項目 | 内容 |
| --- | --- |
| 目的 | workflow-register result handoff から assistant output を保存できることを確認する。 |
| 手順 | 1. Bob Workflow UI で `output-result` step まで実行する。<br>2. `bobBazaar.captureReviewResult` sink が呼ばれることを確認する。 |
| 期待結果 | assistant が生成した JSON が `.bob/review/results` に保存される。 |

### BZR-RT-022 invalid review-result capture

| 項目 | 内容 |
| --- | --- |
| 目的 | schema 不一致の review-result が保存されず error になることを確認する。 |
| 手順 | 1. required field を欠いた JSON を入力する。<br>2. 主GUIの `レビュー結果取り込み` stageでcaptureを実行する。 |
| 期待結果 | validation issue が表示され、results directory に不正成果物が保存されない。 |

### BZR-RT-023 active editor JSON validation OK

| 項目 | 内容 |
| --- | --- |
| 目的 | active editor の valid review-result JSON を検証できることを確認する。 |
| 手順 | 1. valid JSON を editor で開く。<br>2. 主GUIの `レビュー結果取り込み` stageから検証し、必要に応じてhidden validation actionを実行する。<br>3. `Markdown サマリを表示` を選ぶ。 |
| 期待結果 | 有効メッセージが表示され、Markdown summary が開く。 |

### BZR-RT-024 active editor JSON validation error

| 項目 | 内容 |
| --- | --- |
| 目的 | invalid JSON の validation report が表示されることを確認する。 |
| 手順 | 1. invalid JSON を editor で開く。<br>2. 主GUIの `レビュー結果取り込み` stageから検証し、必要に応じてhidden validation actionを実行する。 |
| 期待結果 | Markdown validation report が開き、issue path と message が表示される。 |

### BZR-RT-025 MCP initialize / tools/list

| 項目 | 内容 |
| --- | --- |
| 目的 | MCP server が initialize と tools/list に応答することを確認する。 |
| 手順 | 1. `.bob/mcp.json` の command / args で MCP server を起動する。<br>2. stdio JSON-RPC で `initialize` と `tools/list` を送る。 |
| 期待結果 | serverInfo、capabilities、Bazaar readonly tools、project rules tools、review result tools が返る。 |

### BZR-RT-026 MCP Bazaar tools

| 項目 | 内容 |
| --- | --- |
| 目的 | Bazaar readonly tools が実 repository に対して動作することを確認する。 |
| 手順 | 1. MCP `tools/call` で `bazaar_root`、`bazaar_log`、`bazaar_diff_revision`、`bazaar_status` を呼ぶ。 |
| 期待結果 | 結果 text が返る。commit / push / pull / revert などの tool は存在しない。 |

### BZR-RT-027 MCP project rules tools

| 項目 | 内容 |
| --- | --- |
| 目的 | project rules tools の読み取りと write tool の既定無効を確認する。 |
| 手順 | 1. env 未指定で `tools/list` を呼ぶ。<br>2. `project_rules_init` を直接 call する。<br>3. `project_rules_get_checklist`、`project_rules_get_schema` を呼ぶ。<br>4. 必要な場合だけ `BOB_BAZAAR_ENABLE_WRITE_TOOLS=1` と `BOB_BAZAAR_ALLOWED_ROOTS` を指定して `project_rules_init` を呼ぶ。 |
| 期待結果 | env 未指定では `project_rules_init` は `tools/list` に出ず、直接 call は `isError: true` になる。読み取り tools は allowed root 内で結果を返す。利用者が `BOB_BAZAAR_ENABLE_WRITE_TOOLS=1` とallowed rootsを明示した場合だけdefault rules / schemaが作成され、GUI初期化やMCP設定がwrite opt-inを自動追加しない。 |

### BZR-RT-027A MCP allowed roots

| 項目 | 内容 |
| --- | --- |
| 目的 | MCP server が allowed roots 未設定 cwd と allowed root 外 cwd を拒否することを確認する。 |
| 手順 | 1. `BOB_BAZAAR_ALLOWED_ROOTS` 未設定で Bazaar tool を call する。<br>2. allowed root 外の `cwd` を指定する。<br>3. allowed root 内の `cwd` を指定する。 |
| 期待結果 | 未設定または root 外は `isError: true` になり、allowed root 内だけ処理される。手動検証で無制限 cwd を使う場合は `BOB_BAZAAR_ALLOW_UNRESTRICTED_CWD=1` を明示する。 |

### BZR-RT-028 MCP review result tools

| 項目 | 内容 |
| --- | --- |
| 目的 | 保存済み review-result を MCP から取得できることを確認する。 |
| 手順 | 1. review-result を保存する。<br>2. `project_rules_get_latest_review_result` と `project_rules_get_review_result` を呼ぶ。 |
| 期待結果 | 最新または指定 ID の review-result が返る。 |

### BZR-RT-029 multi-root `.bob` / `.bzr` 分離

| 項目 | 内容 |
| --- | --- |
| 目的 | `.bob` workspace と Bazaar repository が別 root の場合に正しく分離されることを確認する。 |
| 手順 | 1. multi-root workspace を開く。<br>2. GUI で Bazaar workspace と Bob workspace を確認する。<br>3. packet 生成と capture を行う。 |
| 期待結果 | diff / log は `.bzr` root、rules / result 保存は `.bob` root を使う。 |

### BZR-RT-030 Shift-JIS / CP932 decode

| 項目 | 内容 |
| --- | --- |
| 目的 | Bazaar 出力や追加ファイル本文の Shift-JIS / CP932 decode を確認する。 |
| 手順 | 1. 日本語を含む Bazaar log / diff / file を用意する。<br>2. `bobBazaar.textEncoding` を `auto` / `cp932` に設定して packet を生成する。 |
| 期待結果 | packet 内の日本語が大きく文字化けしない。 |

### BZR-RT-031 maxDiffBytes truncation

| 項目 | 内容 |
| --- | --- |
| 目的 | 大きい diff が上限で切り詰められることを確認する。 |
| 手順 | 1. 大きい diff を用意する。<br>2. `bobBazaar.maxDiffBytes` を小さく設定する。<br>3. packet を生成する。 |
| 期待結果 | diff section が切り詰められ、truncated 表示が含まれる。 |

### BZR-RT-032 maxAddedFileContentBytes truncation

| 項目 | 内容 |
| --- | --- |
| 目的 | 追加ファイル本文の上限が守られることを確認する。 |
| 手順 | 1. 大きい追加ファイルを含む revision を用意する。<br>2. `bobBazaar.maxAddedFileContentBytes` を小さく設定する。<br>3. single revision packet を生成する。 |
| 期待結果 | added file contents section が上限内に収まり、省略情報が表示される。 |

### BZR-RT-033 unsafe revision / path エラー

| 項目 | 内容 |
| --- | --- |
| 目的 | 不正 revision / path が Bazaar CLI へ渡らないことを確認する。 |
| 手順 | 1. 改行、option injection、path escapeを狙う危険文字を含むrevision / pathを入力する。<br>2. 主GUIまたはhidden technical commandを実行する。 |
| 期待結果 | validation errorになり、危険値を引数にしたBazaar CLIは実行されない。正常値では配列引数の `bzr --no-aliases ...` 経路だけを使う。 |

### BZR-RT-034 End-to-End: Bob Workflow UI 経由

| 項目 | 内容 |
| --- | --- |
| 目的 | 同梱 workflow を Bob Workflow UI から実行し、packet 生成、規約読み込み、Bob 分析、result 保存まで確認する。 |
| 手順 | 1. `.bob` を初期化し workflow-register reload を実行する。<br>2. Bob Workflow UI で `bazaar-project-rule-review` を起動する。<br>3. `review-input`、`collect-context`、`load-rules`、agent、`output-result` を順に実行する。 |
| 期待結果 | review packet が Bob context に入り、review-result JSON / Markdown が `.bob/review/results` に保存される。 |

### BZR-RT-035 End-to-End: Command Palette 経由

| 項目 | 内容 |
| --- | --- |
| 目的 | Command Paletteから公開主GUIを開き、同じpanel内でpacket作成からresult保存まで実行できることを確認する。 |
| 手順 | 1. Command Paletteで `Bob Bazaar Review: レビューを開始` を実行する。<br>2. `レビュー` stageでproject rules付きpacketを作り、Bobにレビューさせる。<br>3. 同じpanelの `レビュー結果取り込み` stageでBob出力JSONをclipboardまたはeditorからcaptureする。<br>4. 同じstageでJSON validationを行う。 |
| 期待結果 | packet 生成、Bob context 追加、review-result 保存、validation が完了する。 |

### BZR-RT-036 Phase 1 campaign 初期化

| 項目 | 内容 |
| --- | --- |
| 目的 | Phase 1 実績作成用の `.bob-review-records` campaign 雛形を作成できることを確認する。 |
| 手順 | 1. `Bazaar レビュー` 主GUIの `レビュー実績` stageからcampaign初期化を実行する。<br>2. workspace root の `.bob-review-records/campaigns/phase1-bazaar-review-uat-001` を確認する。 |
| 期待結果 | `campaign.yaml`、`targets.yaml`、`records/_template/record.yaml`、`records/_template/triage.yaml` が作成される。 |

### BZR-RT-037 review packet artifact 保存

| 項目 | 内容 |
| --- | --- |
| 目的 | Bob に渡した packet を campaign record 配下へ保存できることを確認する。 |
| 手順 | 1. 主GUIでreview packetを作成する。<br>2. 同じReview Runのartifact保存を実行する。技術確認ではhidden command `bobBazaar.records.createRecord` を引数付きで呼ぶ。 |
| 期待結果 | `.bob-review-records/campaigns/<campaign_id>/records/<review_id>/review-packet.md` が存在し、既存 packet 更新時は backup が残る。 |

### BZR-RT-038 review-result から record.yaml 作成

| 項目 | 内容 |
| --- | --- |
| 目的 | capture 済み review-result と packet を `record.yaml` で追跡できることを確認する。 |
| 手順 | 1. review-result JSON / Markdown を `.bob/review/results` に保存する。<br>2. 主GUIの `レビュー実績` stageで実績記録を作成する。 |
| 期待結果 | `record.yaml` に target、packet、review-result JSON/Markdown、triage path、metrics が記録される。 |

### BZR-RT-039 指摘確認・振り分け一覧の雛形生成

| 項目 | 内容 |
| --- | --- |
| 目的 | Bob findingを人間が確認・振り分けるための `triage.yaml` に変換できることを確認する。 |
| 手順 | 1. findingsを含むreview-resultを保存する。<br>2. 主GUIの `指摘確認・振り分け` stageで `指摘確認・振り分け一覧を作成` を実行する。 |
| 期待結果 | finding ごとに item が作成され、初期 decision は `needs_investigation` になる。fail checklist だが finding がない rule も追加調査 item になる。 |

### BZR-RT-040 指摘確認・振り分け validation error

| 項目 | 内容 |
| --- | --- |
| 目的 | 指摘確認・振り分け成果物の不正decisionやsummary mismatchを検出できることを確認する。 |
| 手順 | 1. `triage.yaml` のdecisionを不正値に変更する。<br>2. 主GUIの同じstageで `指摘確認・振り分け内容を検証` を実行する。 |
| 期待結果 | invalid decision、unknown finding_id、summary mismatch が warning / error として表示される。 |

### BZR-RT-041 campaign summary 生成

| 項目 | 内容 |
| --- | --- |
| 目的 | 複数 record / triage から Phase 1 実績 summary を生成できることを確認する。 |
| 手順 | 1. 2件以上の `record.yaml` と `triage.yaml` を用意する。<br>2. 主GUIの `レビュー実績` stageでcampaign summaryを生成する。 |
| 期待結果 | `summary.json` と `summary.md` に件数、schema valid/invalid、triage decision、所要時間、estimated minutes saved が出る。 |

### BZR-RT-042 workflow run metadata 紐付け

| 項目 | 内容 |
| --- | --- |
| 目的 | workflow-register 実行がある場合に record と run metadata を紐付け、ない場合も実績作成を継続できることを確認する。 |
| 手順 | 1. workflow 経由と direct command 経由の両方で record を作る。<br>2. `record.yaml` の workflow section を確認する。 |
| 期待結果 | workflow 経由では run_id / status が入り、取得できない場合は `unavailable: true` として扱われる。 |

### BZR-RT-043 実績報告 Markdown 作成

| 項目 | 内容 |
| --- | --- |
| 目的 | campaign summary をプロジェクトリーダ向けの報告材料として読めることを確認する。 |
| 手順 | 1. `summary.md` を開く。<br>2. 件数、採用/棄却/追加調査、所要時間、warning を確認する。 |
| 期待結果 | Phase 1 実績報告へ転記でき、triage missing や invalid record が隠れない。 |

### 7.6 レビュー手順 Iteration 2

#### BZR-RT-044 レビュー実行開始とartifact関連付け

1. `Bazaar レビュー` 主GUIでcampaignとsingle revisionを選ぶ。
2. レビュー実行を開始する。
3. record directoryとresult directoryを確認する。

期待結果:

- `review-run.json`と`review-packet.md`が同じcampaign / review IDで作成される。
- packetのレビュー実行 sectionにexact `review_id`契約がある。
- phaseはpacket completed、result in_progressになる。
- workspace外pathやunsafe IDは保存前に拒否される。

#### BZR-RT-045 VS Code再起動後の再開

1. packet保存後、レビュー結果取り込み前にVS Codeを閉じる。
2. 同じworkspaceを開き `Bazaar レビュー` 主GUIを再表示する。
3. 未完了レビュー実行を選択し再開する。

期待結果:

- runが`updatedAt`順の候補に表示される。
- next actionが`resultCapture`になる。
- campaign / review ID、packetを再入力・再生成しない。
- result保存後に再度中断した場合は指摘確認・振り分けから再開する。

#### BZR-RT-046 decision別の指摘確認・振り分け validation

各decisionについて不足値を作り、保存を試す。

| decision | 不足時に拒否するfield |
| --- | --- |
| `accepted` | ownerとactionの両方 |
| `rejected` | reason |
| `needs_investigation` | ownerまたはaction |
| `deferred` | reason |

期待結果:

- Webviewでfinding行ごとの不足を表示する。
- host側validationでも保存を拒否する。
- 修正後はtriage phaseがcompletedになる。

#### BZR-RT-047 Metricsの自動計測と補正

1. packetを保存してからvalid resultを保存する。
2. 指摘確認・振り分けを完了する。
3. baseline / Bob / 指摘確認・振り分け時間を確認する。
4. 有効値、負数、NaN相当、30日超を入力する。

期待結果:

- Bob reviewと指摘確認・振り分けの経過時間が自動記録される。
- valid補正は`user_corrected`として残る。
- invalid補正は拒否される。
- 完了済みtriageを再保存しても指摘確認・振り分け時間を二重加算しない。

#### BZR-RT-048 レビュー実行一括finalize

1. valid triageまで進める。
2. metricsを確認・補正する。
3. `レビュー実行を完了して集計`を実行する。

期待結果:

- `record.yaml`が生成・検証される。
- campaign `summary.json` / `summary.md`が再生成される。
- record / summary phaseとレビュー実行全体がcompletedになる。
- target、packet、result、triage、record、summaryが同じcampaign / review IDで結び付く。

#### BZR-RT-049 Summary失敗からの再試行

1. summary出力先をdirectoryにするなど、summary writeだけが失敗するfixtureを作る。
2. finalizeを実行する。
3. failure causeを解消し、指摘確認・振り分けstageから再度finalizeする。

期待結果:

- `record.yaml`を保持し、record phaseはcompletedのままになる。
- summaryだけfailedになり、retryable issueが表示される。
- 再操作時にpersisted stateへ追従し、recordを作り直さずsummaryから続行する。
- 最終的にレビュー実行がcompletedになる。

#### BZR-RT-050 Legacy artifact recovery

1. `review-run.json`のないresult / packet / triage / recordを用意する。
2. `Bazaar レビュー` 主GUIのレビュー実績stageからlegacy recoveryを開く。
3. 単一campaign、複数campaign、review ID不一致、既存runの各ケースを試す。

期待結果:

- 推測target、artifact、warningをpreviewとmodal確認で表示する。
- 複数campaignは明示選択までblockする。
- ID不一致と既存run上書きを拒否する。
- 承認後に追加されるのは`review-run.json`だけである。
- 既存packet / result / triage / recordのbytesが変化しない。

### 7.7 レビュー手順 Iteration 3 レビュー実績

#### BZR-RT-051 レビュー実績の起動・campaign選択・refresh

1. 2件以上のcampaignを持つBob workspaceを開く。
2. `Bob Bazaar Review: レビューを開始`を開き、主GUI内のレビュー実績へ切り替える。
3. campaignを切り替え、refreshする。

期待結果:

- campaign候補がsafe IDだけで表示される。
- run一覧が`updatedAt`降順になる。
- refresh後に最新のレビュー実行 / record / triageが反映される。
- workspace外rootは拒否される。

#### BZR-RT-052 指摘確認・振り分け pendingの可視化

1. triageなしrun、invalid triage run、valid triage runを用意する。
2. レビュー実績を開く。

期待結果:

- triageなしとinvalid triageがpending tableに出る。
- run一覧からは消えない。
- pending findingはaccepted / rejected件数へ加算されない。
- reasonはwarningに表示される。

#### BZR-RT-053 schema / finding rateの照合

1. schema valid / invalid recordとdecisionが既知のtriageを用意する。
2. Overviewのrateを手計算する。
3. recordまたはtriageが0件のcampaignも開く。

期待結果:

- schema validation、finding acceptance / rejection / resolutionの分母が仕様通りである。
- 分母0は`0%`ではなく`n/a`になる。

#### BZR-RT-054 rule / change type trend

1. 同じrule IDを複数runで検出する。
2. 3種類のtarget modeを持つrunを用意する。

期待結果:

- rule trendのdetected / accepted / rejected件数がtriageと一致する。
- ruleは検出数順に並ぶ。
- change typeは`singleRevision`、`revisionRange`、`workingTreeSinceRevision`として集計される。
- file名からsource / test / docs分類を推測しない。

#### BZR-RT-055 JSON / Markdown / CSV export

1. comma、quote、改行を含むwarningがあるcampaignを表示する。
2. exportを実行する。
3. 3形式を比較する。

期待結果:

- campaign directoryへ`dashboard.json`、`dashboard.md`、`dashboard.csv`が作成される。
- campaign ID、overview、rule、change type、warningが3形式で一致する。
- CSVのcomma / quote / newlineがRFC 4180形式でescapeされる。

#### BZR-RT-056 malformed evidenceとexport failure

1. malformed record / triage / resultとsymlink record directoryを用意する。
2. レビュー実績を開く。
3. 既存dashboard exportを用意し、置換途中で失敗するfixtureを作る。

期待結果:

- レビュー実績全体を停止せずwarningを表示する。
- conflicting artifactからdecisionを生成しない。
- symlink / junctionを追跡しない。
- export失敗時は画面を維持し、旧exportを復元する。

#### BZR-RT-057 review evidence不変性

1. packet、result、triage、record、summaryのhashを取得する。
2. レビュー実績のrefreshとexportを複数回実行する。
3. hashを再取得する。

期待結果:

- 既存review evidenceのbytesが変化しない。
- 変更されるのは`dashboard.json`、`dashboard.md`、`dashboard.csv`だけである。

## 8. Project Rule Authoring Windows UAT

資料からプロジェクト規約を作成する経路は `docs/project-rule-authoring-windows-uat.md` を正式runbookとして使い、PRA-WIN-001からPRA-WIN-008を実施する。全caseの実測記録、rollback confirmation、approved-rule review evidence、Developer Tools Consoleの未処理例外0件、package gate成功が揃った場合だけcompleteとし、未実施またはprivate evidenceしかない場合はpendingのまま報告する。

## 9. Manual visual / accessibility gate

Ubuntu / Windowsの代表環境で次を確認する。

- 200% zoomとVS Code / Windows High Contrastでstage、field label、status、button、focus境界を識別できる。
- Tab / Shift+Tabだけで全主要actionへ移動でき、select、checkbox、date inputなどのform controlをkeyboardで操作できる。
- validation、warning、conflict、pendingを色だけに依存せず区別できる。
- screenshotに秘密情報、顧客data、credential、absolute user pathを含めない。

## 10. Console gate

各scenario前にDeveloper Tools Consoleをclearし、終了後に `uncaught`、`unhandled`、`rejection`、`exception`、`CSP`、`webview`、`provider`、`MCP` を検索する。合格条件はuncaught exception、unhandled rejection、CSP violation、save failure後のsecondary exception、panel dispose / deactivate後のdangling callbackがすべて0件であること。

## 11. Cross-extension hosted acceptance

同一commit SHAから作成したVSIX群で、次の5 public commandが登録され、4 primary panelのview type / titleがexact matchすることを確認する。

```text
workflowRegister.openOperationHub
workflowRegister.openWorkflowBuilder
bobBazaar.openReviewGui
bobBazaar.authorProjectRulesFromDocuments
bobCodeConsistency.openReviewWizard

workflowRegisterOperationHub / Bob 操作ハブ
workflowRegisterBuilder / ワークフロー作成・編集
bobBazaarReviewGui / Bazaar レビュー
bobCodeConsistencyReviewWizard / 整合プレレビュー
```

4 panelを開閉し、uncaught exception / unhandled rejection / dangling callbackがないことも確認する。

## 12. 実機テスト結果記録テンプレート

| 項目 | 記入欄 |
| --- | --- |
| テスト日 |  |
| テスト担当 |  |
| OS / バージョン |  |
| VS Code / Bob IDE バージョン |  |
| IBM Bob 拡張バージョン |  |
| workflow-register commit / VSIX |  |
| bob-bazaar-review commit / VSIX |  |
| VSIX SHA-256 / artifact hash |  |
| Bazaar CLI バージョン |  |
| workspace path |  |
| 実施した testcase ID |  |
| 合格 |  |
| 不合格 |  |
| 保留 |  |
| 主な不具合 / 備考 |  |

## 13. 合格基準

- BZR-RT-001 から BZR-RT-006 までの起動・初期化・GUI 基本導線が合格する。
- Bazaar CLI 読み取り操作が `--no-aliases` 経路で実行され、packet が生成できる。
- review-result JSON / Markdown が `.bob/review/results` に保存できる。
- Phase 1 record / triage / summary が `.bob-review-records` に保存できる。
- レビュー実行の開始、画面間handoff、中断再開、decision validation、metrics、finalizeが合格する。
- summary失敗時にrecordを保持し、失敗phaseから再試行できる。
- legacy recoveryが確認付きかつ非破壊である。
- レビュー実績のpending、rate、rule / target mode trend、warning、3形式exportがsource artifactと一致する。
- レビュー実績のrefresh / exportが既存review evidenceを変更しない。
- active editor validation と MCP result tools が保存済み result を扱える。
- Bob Workflow UI 経由で主要 provider が provider missing にならない。
- multi-root で `.bob` と `.bzr` の責務分離が守られる。
- Developer Tools Console に未処理例外が残らない。
- build / policy / audit / package gate、Ubuntu / Windows Hosted Extension Host、exact command / panel、same-panel、soft-dependency、visual / accessibility、Console、cross-extension同一SHAの各gateが合格する。
- evidenceにcommit SHA、VSIX SHA-256、OS、各version、artifact hashを記録する。

## 14. 回帰確認の優先度

| 優先度 | 対象 |
| --- | --- |
| P0 | 起動、project rules初期化、レビュー実行開始、packet、capture、指摘確認・振り分け、標準finalize。 |
| P1 | 中断再開、summary failure retry、legacy recovery、レビュー実績、workflow provider、MCP、multi-root。 |
| P2 | revisionRange、working tree、Shift-JIS / CP932、diff / added file truncation。 |
| P3 | file save fallback、Bob 拡張なし fallback、unsafe input、OS 差分。 |

<!-- REMEDIATION-2026-07-11 -->
## 2026-07-11 追加リリースゲート

1. Windows と Ubuntu の CI が成功していること。
2. timeout / cancel 後に Git / Bazaar 子プロセスが残留しないこと。
3. companion extension を無効化した状態で通常 command が起動し、再有効化後に provider が回復すること。
4. multi-root workspace で Bob root と VCS root が混同されないこと。
5. IBM Bob 実環境で workflow source、step review、result handoff、MCP、Webview の代表 smoke を実施し、結果を release evidence に保存すること。
6. workflow-contracts CI が repository 内の全対象 WORKFLOW.md を検証し成功していること。
