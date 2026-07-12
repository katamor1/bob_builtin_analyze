# bob-bazaar-review 実機テスト仕様書

## 1. 目的

本書は`extensions/bob-bazaar-review`の実機テスト仕様を定義する。単体テストでmock化するVS Code Extension Host、IBM Bob、workflow-register、Bob Workflow UI、Webview、Bazaar CLI、MCP server、multi-root workspace、実ファイルI/O、Review Runの中断・再開・finalize・legacy recoveryを含めて確認する。

## 2. テスト対象

| 区分 | 対象 |
| --- | --- |
| VS Code拡張 | `bob-bazaar-review` |
| 任意連携 | `IBM.bob-code`, `local.workflow-register` |
| Bazaar | `bzr root`, `bzr log`, `bzr diff`, `bzr cat`, `bzr status`, `bzr revno` |
| Bob workspace | `.bob/mcp.json`, `.bob/review/*`, `.bob/skills/*`, `.bob/workflows/bazaar-project-rule-review/WORKFLOW.md` |
| Review Run | `.bob-review-records/campaigns/<campaign_id>/records/<review_id>/review-run.json` |
| 成果物 | review packet、review-result JSON/Markdown/metadata、triage、record、campaign summary |
| UI | Command Palette、Review GUI、Result Capture、Human Triage、Bob Workflow UI |
| MCP | stdio JSON-RPC server、Bazaar readonly tools、project rules tools、review-result tools |

## 3. 前提環境

| 項目 | 条件 |
| --- | --- |
| OS | Windows 11を主対象。可能ならmacOS / Linuxでも代表ケースを確認する。 |
| VS Code / Bob IDE | `package.json`の`engines.vscode`を満たすこと。 |
| IBM Bob | Bob context連携を確認するケースだけ導入・有効化する。 |
| workflow-register | workflow連携を確認するケースだけ導入・有効化する。 |
| Bazaar CLI | `bzr`がPATHにあるか、`bobBazaar.bzrPath`で指定できること。 |
| Node.js / npm | extension build / MCP server起動が可能なこと。 |
| workspace | `.bob`を持つBob workspaceと`.bzr`を持つBazaar repositoryを用意する。 |

## 4. 事前準備

### 4.1 ビルドとVSIX

```powershell
cd extensions\bob-bazaar-review
npm ci
npm run compile
npm run package
npm run package:policy
```

### 4.2 推奨workspace

single-root:

```text
<workspace>/
  .bob/
  .bzr/
  src/
```

multi-root:

```text
bob-workspace/
  .bob/

bazaar-branch/
  .bzr/
  src/
```

### 4.3 テストデータ

- valid / invalid review-result JSON
- findingあり、failed checklistのみ、findingなしの各結果
- Shift-JIS / CP932のlog、diff、追加ファイル
- 上限を超えるdiffと追加ファイル
- summary出力先を意図的にdirectoryへした失敗fixture
- `review-run.json`のないlegacy result / packet / triage / record
- 同じreview IDを持つ複数campaign候補

## 5. 共通確認項目

- Developer Tools Consoleに未処理例外がない。
- Bazaar CLIは`bzr --no-aliases`経路で実行される。
- `.bob`と`.bzr`が別rootでも保存先と差分取得先が分離される。
- IBM Bob未導入時はMarkdown document作成で安全に停止する。
- workflow-register未導入時も通常commandが利用できる。
- JSON / Markdown / YAMLはUTF-8で保存される。
- MCPは破壊的Bazaar操作を公開しない。
- artifact pathはworkspace内に留まり、symlink / junction escapeを許さない。
- Human Triageを省略してfindingを自動採否しない。

## 6. 実機テスト項目

### 6.1 起動・初期化・GUI

| ID | 操作 | 期待結果 |
| --- | --- | --- |
| BZR-RT-001 | 拡張を有効化しCommand Paletteで`Bob Bazaar Review:`を検索する。 | GUI、capture、validation、MCP、record / triage / summary commandが登録される。 |
| BZR-RT-002 | workflow-registerと本拡張を有効化し、providerをinspectする。 | `openReviewGui`、`collectReviewContext`、`loadReviewRules`、`captureReviewResult`がprovider missingにならない。 |
| BZR-RT-003 | `.bob/review`のないworkspaceでproject rules初期化を実行する。 | checklist、schema、prompt template、exampleが作成される。 |
| BZR-RT-004 | Review GUIから`.bob`初期化を行う。 | custom mode、Skill、Workflow、MCP templateが不足分だけ作成される。 |
| BZR-RT-005 | `Bob MCP を設定`を実行する。 | `.bob/mcp.json`へserver名、command、args、`BZR_PATH`が設定される。 |
| BZR-RT-006 | Review GUIを開く。 | Bazaar / Bob workspace、初期化状態、Review Run、target入力が表示される。 |
| BZR-RT-007 | `singleRevision`でrevisionを読み込む。 | log、diff、changed files、target labelが表示される。 |
| BZR-RT-008 | `revisionRange`でbase / targetを読み込む。 | range diffとchanged filesが表示される。 |
| BZR-RT-009 | 未コミット変更を作り`workingTreeSinceRevision`を読み込む。 | working tree diff、revno、statusが表示される。 |
| BZR-RT-010 | GUIからpacketを生成しBobへ追加する。 | Markdown packetが保存・表示され、Bob context追加またはclipboard fallbackが行われる。 |
| BZR-RT-011 | IBM Bobを無効化してGUI reviewを実行する。 | Bob commandを呼ばずMarkdown document作成で停止する。 |
| BZR-RT-012 | workflowのreview-inputからGUIを開きpacketを作る。 | current step完了をbest effortで試行し、失敗してもpacketを保持する。 |

### 6.2 Direct command・workflow bridge

| ID | 操作 | 期待結果 |
| --- | --- | --- |
| BZR-RT-013 | `reviewRevision`を実行する。 | 単一revision packetが開く。 |
| BZR-RT-014 | `reviewRange`を実行する。 | revision range packetが開く。 |
| BZR-RT-015 | project rules付き`reviewRevision`を実行する。 | checklistとreview-result output contractを含む。 |
| BZR-RT-016 | project rules付き`reviewRange`を実行する。 | range packetへproject rulesが追加される。 |
| BZR-RT-017 | packetを開いて`collectReviewContext`を実行する。 | repository、mode、revision、diff summaryがresultへ返る。 |
| BZR-RT-018 | `loadReviewRules`を実行する。 | checklist件数、category、schema情報、summaryが返る。 |

### 6.3 Review-result capture・validation

| ID | 操作 | 期待結果 |
| --- | --- | --- |
| BZR-RT-019 | valid JSONをclipboardから保存する。 | `.bob/review/results/<review_id>.json`と`.md`が保存される。 |
| BZR-RT-020 | active editor / selectionから保存する。 | selection優先でJSON / Markdown / metadataが保存される。 |
| BZR-RT-021 | workflowのoutput-resultまで実行する。 | assistant outputがcapture sinkへ渡り保存される。 |
| BZR-RT-022 | required field不足のJSONをcaptureする。 | issueを表示し、不正artifactを保存しない。 |
| BZR-RT-023 | valid JSONをactive editorで検証する。 | valid表示とMarkdown summaryを確認できる。 |
| BZR-RT-024 | invalid JSONをactive editorで検証する。 | issue path / messageを含むMarkdown reportが開く。 |

### 6.4 MCP・workspace・encoding・limits

| ID | 操作 | 期待結果 |
| --- | --- | --- |
| BZR-RT-025 | stdioで`initialize`と`tools/list`を送る。 | serverInfo、capabilities、readonly toolsが返る。 |
| BZR-RT-026 | `bazaar_root`、`bazaar_log`、`bazaar_diff_revision`、`bazaar_status`を呼ぶ。 | 実repositoryの結果が返り、write toolは存在しない。 |
| BZR-RT-027 | project rules toolsを呼び、write toolを既定状態と明示有効状態で比較する。 | 既定ではinit非公開、明示有効時だけallowed root内へ書き込む。 |
| BZR-RT-027A | allowed roots未設定、root外、root内の`cwd`を試す。 | 未設定 / root外を拒否し、root内だけ処理する。 |
| BZR-RT-028 | 保存済みresultをlatest / ID指定で取得する。 | 対応するreview-resultが返る。 |
| BZR-RT-029 | `.bob`と`.bzr`を別workspace folderにする。 | diff / logはBazaar root、rules / result / Review RunはBob rootを使う。 |
| BZR-RT-030 | Shift-JIS / CP932のlog、diff、fileでpacketを作る。 | 日本語が大きく文字化けしない。 |
| BZR-RT-031 | `maxDiffBytes`を小さくして大きいdiffを処理する。 | 上限で切り詰め、truncated表示を含む。 |
| BZR-RT-032 | `maxAddedFileContentBytes`を小さくする。 | 追加ファイル本文が上限内に収まり、省略情報を含む。 |
| BZR-RT-033 | 改行や危険文字を含むrevision / pathを入力する。 | validation errorとなりBazaar CLIを実行しない。 |

### 6.5 End-to-Endと既存Phase 1 record

| ID | 操作 | 期待結果 |
| --- | --- | --- |
| BZR-RT-034 | Bob Workflow UIでreview-inputからoutput-resultまで実行する。 | packet、rules、analysis、result保存が完了する。 |
| BZR-RT-035 | Command Paletteだけでpacket、Bob review、capture、validationを行う。 | workflow-registerなしでも一連の処理を完了できる。 |
| BZR-RT-036 | Phase 1 campaignを初期化する。 | campaign、target、record / triage templateが作成される。 |
| BZR-RT-037 | packet artifactをrecord directoryへ保存・更新する。 | `review-packet.md`が存在し、更新時はbackupを保持する。 |
| BZR-RT-038 | capture済みresultからstandalone recordを作る。 | `record.yaml`へtarget、packet、result、triage path、metricsが入る。 |
| BZR-RT-039 | findingありのresultからtriage draftを作る。 | findingとfindingのないfailed checklistを`needs_investigation`へ変換する。 |
| BZR-RT-040 | triageへ不正decision / finding / summaryを設定して検証する。 | invalid decision、unknown finding、summary mismatchを表示する。 |
| BZR-RT-041 | 複数record / triageからsummaryを生成する。 | 件数、採否、時間、estimated minutes saved、warningを出力する。 |
| BZR-RT-042 | workflow経由とdirect経由でrecordを作る。 | run metadataがある場合は記録し、ない場合は`unavailable: true`で継続する。 |
| BZR-RT-043 | `summary.md`をレビューする。 | プロジェクトリーダ向け報告へ転記でき、欠損やinvalid recordを隠さない。 |

### 6.6 Review Run Wizard v3 Iteration 2

#### BZR-RT-044 Review Run開始とartifact関連付け

1. Review GUIでcampaignとsingle revisionを選ぶ。
2. Review Runを開始する。
3. record directoryとresult directoryを確認する。

期待結果:

- `review-run.json`と`review-packet.md`が同じcampaign / review IDで作成される。
- packetのReview Run sectionにexact `review_id`契約がある。
- phaseはpacket completed、result in_progressになる。
- workspace外pathやunsafe IDは保存前に拒否される。

#### BZR-RT-045 VS Code再起動後の再開

1. packet保存後、Result Capture前にVS Codeを閉じる。
2. 同じworkspaceを開きReview GUIを再表示する。
3. 未完了Review Runを選択し再開する。

期待結果:

- runが`updatedAt`順の候補に表示される。
- next actionが`resultCapture`になる。
- campaign / review ID、packetを再入力・再生成しない。
- result保存後に再度中断した場合はHuman Triageから再開する。

#### BZR-RT-046 decision別Human Triage validation

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
2. Human Triageを完了する。
3. baseline / Bob / Human Triage時間を確認する。
4. 有効値、負数、NaN相当、30日超を入力する。

期待結果:

- Bob reviewとHuman Triageの経過時間が自動記録される。
- valid補正は`user_corrected`として残る。
- invalid補正は拒否される。
- 完了済みtriageを再保存してもHuman Triage時間を二重加算しない。

#### BZR-RT-048 Review Run一括finalize

1. valid triageまで進める。
2. metricsを確認・補正する。
3. `Review Runを完了して集計`を実行する。

期待結果:

- `record.yaml`が生成・検証される。
- campaign `summary.json` / `summary.md`が再生成される。
- record / summary phaseとReview Run全体がcompletedになる。
- target、packet、result、triage、record、summaryが同じcampaign / review IDで結び付く。

#### BZR-RT-049 Summary失敗からの再試行

1. summary出力先をdirectoryにするなど、summary writeだけが失敗するfixtureを作る。
2. finalizeを実行する。
3. failure causeを解消し、古いHuman Triage画面から再度finalizeする。

期待結果:

- `record.yaml`を保持し、record phaseはcompletedのままになる。
- summaryだけfailedになり、retryable issueが表示される。
- 再操作時にpersisted stateへ追従し、recordを作り直さずsummaryから続行する。
- 最終的にReview Runがcompletedになる。

#### BZR-RT-050 Legacy artifact recovery

1. `review-run.json`のないresult / packet / triage / recordを用意する。
2. Review GUIからlegacy recoveryを開く。
3. 単一campaign、複数campaign、review ID不一致、既存runの各ケースを試す。

期待結果:

- 推測target、artifact、warningをpreviewとmodal確認で表示する。
- 複数campaignは明示選択までblockする。
- ID不一致と既存run上書きを拒否する。
- 承認後に追加されるのは`review-run.json`だけである。
- 既存packet / result / triage / recordのbytesが変化しない。

### 6.7 Review Run Wizard v3 Iteration 3 Campaign Dashboard

#### BZR-RT-051 Dashboard起動・campaign選択・refresh

1. 2件以上のcampaignを持つBob workspaceを開く。
2. Command PaletteまたはReview GUIからCampaign Dashboardを開く。
3. campaignを切り替え、refreshする。

期待結果:

- campaign候補がsafe IDだけで表示される。
- run一覧が`updatedAt`降順になる。
- refresh後に最新のReview Run / record / triageが反映される。
- workspace外rootは拒否される。

#### BZR-RT-052 Human Triage pendingの可視化

1. triageなしrun、invalid triage run、valid triage runを用意する。
2. Dashboardを開く。

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
2. Dashboardを開く。
3. 既存dashboard exportを用意し、置換途中で失敗するfixtureを作る。

期待結果:

- Dashboard全体を停止せずwarningを表示する。
- conflicting artifactからdecisionを生成しない。
- symlink / junctionを追跡しない。
- export失敗時は画面を維持し、旧exportを復元する。

#### BZR-RT-057 review evidence不変性

1. packet、result、triage、record、summaryのhashを取得する。
2. Dashboardのrefreshとexportを複数回実行する。
3. hashを再取得する。

期待結果:

- 既存review evidenceのbytesが変化しない。
- 変更されるのは`dashboard.json`、`dashboard.md`、`dashboard.csv`だけである。

## 7. 実機テスト結果記録テンプレート

| 項目 | 記入欄 |
| --- | --- |
| テスト日 |  |
| テスト担当 |  |
| OS / バージョン |  |
| VS Code / Bob IDEバージョン |  |
| IBM Bobバージョン |  |
| workflow-register commit / VSIX |  |
| bob-bazaar-review commit / VSIX |  |
| Bazaar CLIバージョン |  |
| workspace path |  |
| 実施したtestcase ID |  |
| 合格 |  |
| 不合格 |  |
| 保留 |  |
| 主な不具合 / 備考 |  |

## 8. 合格基準

- BZR-RT-001〜006の起動・初期化・GUI基本導線が合格する。
- Bazaar読み取り操作が`--no-aliases`で実行され、packetを生成できる。
- review-result JSON / Markdown / metadataを保存・検証できる。
- Phase 1 record / triage / summaryを保存できる。
- Review Runの開始、画面間handoff、中断再開、decision validation、metrics、finalizeが合格する。
- summary失敗時にrecordを保持し、失敗phaseから再試行できる。
- legacy recoveryが確認付きかつ非破壊である。
- Campaign Dashboardのpending、rate、rule / target mode trend、warning、3形式exportがsource artifactと一致する。
- Dashboard refresh / exportが既存review evidenceを変更しない。
- active editor validationとMCP result toolsが保存済みresultを扱える。
- Bob Workflow UIで主要providerがprovider missingにならない。
- multi-rootで`.bob`と`.bzr`の責務分離が守られる。
- Developer Tools Consoleに未処理例外が残らない。

## 9. 回帰確認の優先度

| 優先度 | 対象 |
| --- | --- |
| P0 | 起動、project rules初期化、Review Run開始、packet、capture、Human Triage、標準finalize。 |
| P1 | 中断再開、summary failure retry、legacy recovery、Campaign Dashboard、workflow provider、MCP、multi-root。 |
| P2 | revisionRange、working tree、metrics補正、Shift-JIS / CP932、diff / added file truncation。 |
| P3 | file save fallback、Bobなしfallback、unsafe input、OS差分。 |
