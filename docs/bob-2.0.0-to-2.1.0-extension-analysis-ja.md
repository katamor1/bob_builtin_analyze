# IBM Bob 2.0.0 → 2.1.0：拡張機能の変更・互換性分析

調査日: 2026-09-17。対象はコミット `3567883d2b5ec93ff9e17877b1fee3512f1d1633` と、その親 `5af8de26c42576226e9cccf26ccabf05d8dbef64` の比較。

## 結論

2.1.0は、公開コマンドや拡張IDを維持しながら、Office文書操作、Hooks、組織ポリシー、編集承認、タスク管理を拡充した更新である。一方、設定・skillの探索範囲、サブエージェントの権限、Excel用ツールには移行上の注意がある。

本リポジトリの3拡張にとって最優先なのは、**workflow-registerが監査済みBob 2.0.1だけを受け付けるため、現状のままでは2.1.0にworkflowを登録できない**点である。これはBob側のAPI削除ではなく利用側の既存制約で、2.0.0も同じ検査では拒否される。したがって「2.0.0で動いていた現行3拡張が今回壊れた」とは結論しない。

配布済みJavaScriptと設定の静的分析であり、Bob 2.1.0を起動した実機検証、サーバー側機能・契約・機能フラグの検証は実施していない。

## 1. 比較対象を取り違えないための整理

| 項目 | 確認結果 |
| --- | --- |
| 実際の更新対象 | `bob2/bob-code_2.0.0/`。フォルダー名は変わらず、内部`package.json`が2.0.0→2.1.0 |
| 別ディレクトリ | `bob2/bob-code/`は2.0.1のまま。このコミットの比較対象ではない |
| 独自3拡張 | `extensions/workflow-register`、`bob-bazaar-review`、`bob-code-consistency-review`のソース変更なし |
| 生の差分 | 1,995ファイル。追加78、変更23、削除1,894（rename正規化なし） |
| 配布物整理 | 旧`webview-ui/`、`dist/i18n/`、source map、多数のアイコン等が削除。新UIは`dist/web/`を更新 |
| 新しいネイティブ配布物 | `dist/officecli.exe`、`dist/vscode-policy-watcher.node` |
| 周辺変更 | `.gitignore`に`.bob/workflows/runs/`を追加。実行結果のGit追跡除外であり、workflow APIの機能追加ではない |

削除数の大きさを機能廃止数と読み替えてはいけない。旧版でも使われていた`dist/web/`の更新と、旧配布資産の整理を区別する必要がある。また、このWindows向けスナップショットだけでは他OS向けパッケージの内容を保証できない。

## 2. VS Code拡張としての公開面

`package.json`をJSONとして構造比較すると、変更は`version`とSCM Reviewビューの表示名のローカライズだけである。

| 契約 | 2.0.0 → 2.1.0 |
| --- | --- |
| 拡張ID | `IBM.bob-code`を維持 |
| VS Code engine | `^1.106.1`を維持 |
| 起動・entry point | `onStartupFinished`、`./dist/extension.js`を維持 |
| 公開コマンド | 20件、ID・宣言・メニュー配置は同一。実装上の引数互換性は別途確認が必要 |
| ビュー | `bobChatView`、`bobFindingsView`、`bobReviewView`を維持 |
| Review表示名 | 固定文字列`Review`→`%bob-review.view.title%`。`package.nls.json`に対応キー追加 |

根拠: [package.json](C:/Users/stell/source/repos/bob_builtin_analyze/bob2/bob-code_2.0.0/package.json:1)、[package.nls.json](C:/Users/stell/source/repos/bob_builtin_analyze/bob2/bob-code_2.0.0/package.nls.json:1)。

## 3. 利用者・拡張作者に影響する機能変更

以下の「旧」は親コミットの同名ファイル、「新」は対象コミットのファイルを指す。`B`は`bob2/bob-code_2.0.0/dist/extension.js`。配布バンドルは圧縮されているため、行番号に加えて識別用の名前を記す。

### Office文書：Excel専用読取から構造化読み書きへ

旧`read_xlsx`と組込みskill `xlsx-insights`がなくなり、`office_read`・`office_edit`・`office-insights`が追加された。

| 2.0.0 | 2.1.0 | 拡張・workflowへの意味 |
| --- | --- | --- |
| `read_xlsx(path, sheet, range, header_row, dump)` | `office_read(path, mode, query, …)` | 呼出し名だけでなく、入力・出力の契約が変わる |
| Excelのシート概要、型推定、最大50行のsample、JSON dump | `.docx` / `.xlsx` / `.pptx`のtext / outline / get / validate / dump | Word・PowerPointを含む構造化抽出・検証が可能 |
| Excel分析用skill | Office共通skill | 旧skill名を固定したプロンプトは見直し対象 |
| 読取中心 | `office_edit`のset / add / remove / move / find_replace / batch、存在しないファイルの作成 | 成果物生成・編集へ用途拡大 |

`read_file`もOffice形式を新ツールへ転送する。Officeツールの登録はexecution FSとlocal FSのschemeが一致する場合に限られ、リモート実行でも常に使えるとはいえない。

Office操作は同梱OfficeCLI SDKを利用する。実装内のツール説明はresident接続への並列操作を禁止しているため、独自workflowは逐次実行か単一`batch`を前提にする。これは並列処理全体の禁止ではなく、この文書操作経路の制約である。

根拠: 旧B:2497 `ReadXlsxTool`、旧B:3686 `xlsx-insights`。新[B:2443](C:/Users/stell/source/repos/bob_builtin_analyze/bob2/bob-code_2.0.0/dist/extension.js:2443) `OfficeEditTool`、新B:2448 `OfficeReadTool`、新B:2452 `officeReadToolId`、新B:3954 `BUILTIN_SKILLS`、新B:6388 `kJn` / `OJn`。

### Hooks：実行ライフサイクルを拡張可能に

`SessionStart`、`UserPromptSubmit`、`PreToolUse`、`PostToolUse`、`Stop`のHooksが追加された。設定UIだけでなく、コマンド実行とライフサイクルへの接続が存在する。

- global / workspaceの設定、matcher、timeoutを扱う。
- UserPromptSubmitでは入力の拒否、PreToolUseではツールのキャンセル、PostToolUseでは成功後の追加contextが扱われる。
- 実行timeoutの既定値は10秒、stdoutの上限は1MiB。
- workspace Hooksはworkspace trustを確認して取り込む。組織ポリシー由来のHooksも別経路で設定される。

ブロックはUserPromptSubmit / PreToolUseの終了コード2で行う。その他の終了コード異常・timeout等を一律にブロック扱いにする設計ではなく、SessionStart / PostToolUse / Stopはブロックできない。実行制御へ使う場合はこの契約に合わせる。

独自拡張では、監査・前処理・実行制御をBobのライフサイクルに結び付ける選択肢が増える。ただしHooksと、本リポジトリのworkflow承認・成果物契約を同じものとして扱わない。

根拠: 旧版には`PreToolUse` / `UserPromptSubmit` / `runHooks`がない。新[B:3059](C:/Users/stell/source/repos/bob_builtin_analyze/bob2/bob-code_2.0.0/dist/extension.js:3059) `BOB_HOOK_EVENTS`、新B:6388 `runHooks`、新B:6392 `HookLifecycle`、新B:6473 `getHooks`。

### 組織ポリシー：設定値の強制とロック表示

ユーザー設定より優先するpolicy override、ロック対象パスの取得、設定UIの管理者ロック表示が追加された。

| Bobのポリシー | 効果 |
| --- | --- |
| `DisabledAutoApprovalGroups` | 指定グループの自動承認を禁止。ツール自体の一律禁止とは異なる |
| `ExcludePayloadFromTelemetry` | telemetryからpayloadを除外 |
| `GatewayUrl` | Bob backend接続先を強制 |
| `EnforcedHooks` | 管理者定義HooksをユーザーHooksより先に実行 |

定義中の`default:"edit,execute"`等を「2.1.0の全環境で強制される初期値」とは解釈しない。適用にはpolicy値が存在することが必要である。`UpdateMode`は別のVS Code側policy定義で、上記4つとは区別する。

拡張側の操作が従来の自動承認設定だけで完了するとは限らなくなるため、policyが要求する承認・接続先・Hooksの結果を扱える必要がある。

根拠: 新[B:66](C:/Users/stell/source/repos/bob_builtin_analyze/bob2/bob-code_2.0.0/dist/extension.js:66) `applyPolicyOverrides/getLockedPaths`、新B:6473 `BOB_POLICY_DEFINITIONS` / `applyPolicies`、`dist/web/assets/PolicyLockIndicator-RtAdaNEH.js`。旧版に当該override・policy定義はない。

### 編集承認：ユーザー修正の反映と待機状態の復元

編集承認のpreview先をeditor / chatで選ぶ設定が追加された。単一ファイルかつツールが対応する場合、利用者がpreview上で修正した内容を`applyApprovedEdit`で適用できる。適用前に元ファイルの存在・内容が変わっていないか確認し、変わっていれば上書きを拒否する。ユーザー修正を後続のモデルcontextへ渡す処理もある。

さらに`task_pending_approvals`テーブル、承認要求の保存・削除・復元処理が追加された。タスクを開き直す際に承認待ちを復元する経路がある。独自ツールが編集previewを使う場合、`getEdits`に加えて新しい適用契約への対応を検討する。

根拠: 新[B:2467](C:/Users/stell/source/repos/bob_builtin_analyze/bob2/bob-code_2.0.0/dist/extension.js:2467) `applyApprovedEdit`、新B:6675 `getEdits` / `editable`、新B:6703 `restorePendingApprovals`、新B:6705 `editApprovalPreviewMode`、新B:6711の復元呼出し。旧版にこれらの識別子・承認待ちテーブルはない。

### チャート・IBM文書検索・追加パッケージ

| 追加 | 内容・影響 | 根拠 |
| --- | --- | --- |
| `create_chart` / `create-chart` | EChartsのline / bar / pie / scatter / radar / boxplotをチャットに表示。`artifact`権限グループ。既存`create_html_artifact`とは別に追加 | 新B:9867 `id="create_chart"`、新B:9871の登録、旧版に同IDなし |
| previewビュー | `preview.html`と`bobPreviewView`を追加。成果物の表示経路を拡充 | 新B:6921、`dist/web/preview.html` |
| `list_ibm_doc_libraries` / `search_ibm_docs` | IBM文書ライブラリ一覧・意味検索。Bobの文書検索サービス自体は旧版にもあるが、汎用のIBM製品検索ツールへ拡張 | 新B:6237–6238、B:6388の登録 |
| MCP resourceツール | `list_mcp_resources` / `list_mcp_resource_templates` / `read_mcp_resource`の登録・実行経路を追加。独自MCPからの資料取得経路が増える | 新B:6196 `getResourceTools` / `listMcpResources`等 |
| MCP認証の案内 | `needs_auth`のサーバーをチャットUIへ通知 | 新B:6921 `getMcpAuthRequiredServers` / `mcpAuthRequired` |
| DevSecOps追加パッケージ | `ibm_bob_devsecops_addon`→`IBM.bob-security` / source `bob-security`の対応を追加 | 新B:9871 `Premium Package for DevSecOps` |

最後の項目は連携定義の追加を示す。このコミットに`IBM.bob-security`の実体が追加されたことや、全ユーザーが利用可能になったことを意味しない。

### タスク管理とモード

- 承認待ち・入力待ち・完了の通知設定と送信処理が追加。ウィンドウが非focusのときの通知経路があり、通知音を含めて設定できる。
- 履歴保持の仕組み自体は旧版にもある。**既定保持日数が14→30日**に変わり、設定UIが追加された。保存済みの明示設定まで30日に上書きするとまでは確認していない。
- タスク一括削除の`batchDeleteSessions`ハンドラーが追加された。
- 会話中の送信対象画像20枚上限に対して、画像の自動pruneと選択除去を追加。既定は`autoImagePrune:true`。
- チャットリンクを内部ブラウザで開く設定を追加（既定は外部）。チャットからのPR workflow表示設定も追加（既定有効）。
- Agent / Plan / Askの3モードは旧版にもある。Planは`todo`グループを追加。Askは`mode`グループを除外し、読取専用の指示とBob文書検索の指示を強化した。Askの`hidden:true`は継続。
- DB migrationにWindowsの旧タスクworkspaceパス正規化と承認待ちテーブルが追加された。永続化データを直接読む拡張はschemaの差分に注意する。

根拠: 旧B:6235と新B:3059 `DEFAULT_BOB_CONFIG`、新B:6701–6705の通知、新B:6711 `batchDeleteSessions`、新B:307 `autoPruneImages/checkImageLimit`、旧新`DEFAULT_MODES`（新B:2217）、新B:6557–6567 `009_normalize_legacy_bob_code_windows_workspaces` / `010_pending_approvals`。

## 4. 互換性上の実質的な変更

### 設定・skillの探索範囲が縮小

| 対象 | 2.0.0 | 2.1.0 | 影響例 |
| --- | --- | --- | --- |
| custom modes | `.bob/**/custom_modes.yaml` | `.bob/custom_modes.yaml`と`.bob/*/custom_modes.yaml` | `.bob/a/b/custom_modes.yaml`は探索対象外 |
| MCP設定 | `.bob/**/mcp.json` | `.bob/mcp.json`と`.bob/*/mcp.json` | `.bob/a/b/mcp.json`は探索対象外 |
| workspace skills | `{.bob,.agents,.claude}/**/skills/{*,*/*}/SKILL.md` | `.bob/skills/*/SKILL.md`、`.bob/*/skills/*/SKILL.md`、`.agents/skills/*/SKILL.md`、`.claude/skills/*/SKILL.md` | `.bob/skills/group/name/SKILL.md`は探索対象外 |

これはworkspace側の変更であり、global skillのgrouped配置まで廃止されたわけではない。本リポジトリのBazaar標準テンプレートは直下配置のため、この変更だけでは移設不要である。

根拠: 旧B:2780→新[B:2807](C:/Users/stell/source/repos/bob_builtin_analyze/bob2/bob-code_2.0.0/dist/extension.js:2807)のcustom mode watcher、旧B:5993→新B:6177 `McpConfigManager`、旧B:3686→新B:3954 `WorkspaceSkillsManager`。

### generalサブエージェントが親の権限・制限を継承

2.0.0では既定generalのツールグループが`read/edit/execute`だった。2.1.0では親modeのgroupsとrestrictionsを引き継ぐ。親modeがない場合のfallbackは`read/edit/execute`である。

禁止ツールに`switch_mode` / `update_todo_list`を追加し、継承グループから`subagent` / `subtask`を除外する。一方、`allowedSubagents`によるpreset名の制約は旧版にもある。

これは権限縮小だけを意味しない。親のread-only / fileRegex制約が効く一方、親のグループ次第ではMCPやskillなどの利用範囲が広がり得る。workflow-registerは`startSubagent(prompt)`をpresetなしで呼ぶため、カスタムモードでの実行結果を重点確認する必要がある。

根拠: 旧B:2510–2512→新[B:2481](C:/Users/stell/source/repos/bob_builtin_analyze/bob2/bob-code_2.0.0/dist/extension.js:2481)–2483 `SubAgentTool` / `resolvePreset` / `buildMode`、利用側[bobWorkflowRunner.ts:286](C:/Users/stell/source/repos/bob_builtin_analyze/extensions/workflow-register/src/bobWorkflowRunner.ts:286)。

### 拡張間APIは主要経路を維持し、追加もある

| API | 差分 |
| --- | --- |
| `registerSource(id, name)`、sourceの`registerWorkflow/deactivate/log` | 主要経路は継続 |
| workflow taskの`sendMessage/setStepComplete/startSubagent/getMessages/getAllMetadata/toSerializable` | メソッドが存在する経路は継続。動作全体の互換性を保証するものではない |
| `startWorkflow()` | 従来の返却値なしから、開始成功時に`{taskId}`を返す経路を追加 |
| `getActiveMcpServers()` | 追加。workspaceRoot / name / scope / configPathを返す |
| source API | `registerTrigger`、MCP登録の第3引数fileRef、部分`deactivate(part)`、`createFetch`を追加 |
| `bob-code.addToContext` | Bazaarが使う`uri, text, start, end`の処理は実質的に継続 |

根拠: 旧B:6244・6498・6598→新[B:6471](C:/Users/stell/source/repos/bob_builtin_analyze/bob2/bob-code_2.0.0/dist/extension.js:6471)・6668・6755。`addToContext`は旧B:6797→新B:6943、利用側[bobContext.ts:11](C:/Users/stell/source/repos/bob_builtin_analyze/extensions/bob-bazaar-review/src/bob/bobContext.ts:11)。

Bob本体が`.bob/workflows/*/WORKFLOW.md`を新たに直接発見するようになった根拠はない。本リポジトリでは引き続きworkflow-registerがMarkdownを読み、BobへAPI登録する。

## 5. 本リポジトリの3拡張への判定

| 拡張 | 判定 | 対応 |
| --- | --- | --- |
| workflow-register | **現行profileでは2.1.0登録不可**。2.0.1完全一致・digest検査がある | 2.1.0用profileを監査し、capability・task契約を確認したうえで対応版を追加 |
| bob-bazaar-review | Bobコンテキスト追加、標準MCP / mode / skill配置は静的には維持。workflow連携は上記登録制約の影響を受ける | 通常ローカル機能とBob連携を分け、登録・MCP・コンテキスト追加を確認 |
| bob-code-consistency-review | ローカル前処理等のソースは不変。workflow連携は上記登録制約の影響を受ける | provider登録、実行、結果取込、再開の一連の経路を確認 |

拒否の直接根拠は[bobProfile.ts:224](C:/Users/stell/source/repos/bob_builtin_analyze/extensions/workflow-register/src/core/contractV2/bobProfile.ts:224)。[bobApi.ts:34](C:/Users/stell/source/repos/bob_builtin_analyze/extensions/workflow-register/src/bobApi.ts:34)が実拡張のversionを渡し、[workflowRegistrationService.ts:60](C:/Users/stell/source/repos/bob_builtin_analyze/extensions/workflow-register/src/workflowRegistrationService.ts:60)がAPI取得失敗時に登録済みsourceを解除し、登録IDを空にして`bob-code.hasWorkflows=false`とする。

単にversion文字列検査を緩めると「監査済み2.0.1 profile」と実際の2.1.0実装が食い違う。追加APIがあることと、既存の厳格な連携契約を満たすことは別に検証する。

## 6. 移行時の確認順序

1. **2.1.0用profileと連携契約**：source登録・解除、workflow起動、task snapshot、metadata、戻り値を確認する。
2. **探索対象の棚卸し**：深い階層のmcp.json / custom_modes.yaml、grouped workspace skillを新探索範囲へ合わせる。
3. **サブエージェント権限**：Agent / read-only / fileRegex制限 / MCPを持つcustom modeで、期待する権限だけが子へ渡るか確認する。
4. **旧Excel契約の利用箇所**：`read_xlsx` / `xlsx-insights`固定呼出し、sample / dumpの出力依存を点検し、新Office契約へ更新する。
5. **承認と再開**：previewの修正、外部ファイル更新時の拒否、承認待ちタスクの再オープンを確認する。
6. **Hooks・組織設定下の実行**：trust、timeout、policyによるロック・自動承認禁止のある環境で、独自workflowの表示と結果が整合するか確認する。

この調査では対応実装や設定変更は行っていない。上記は静的差分から導いた実機確認項目であり、試験済み項目ではない。

## 7. 調査方法・限界

- Gitの親コミットと対象コミットからマニフェスト、翻訳、UI bundle、実行bundleを比較した。別に置かれた2.0.1配布物や未追跡の作業ディレクトリを比較基準にしていない。
- マニフェストをJSON構造比較し、圧縮bundleはツールID、登録処理、設定探索glob、API返却値、DB migrationと実際の呼出しを照合した。
- 翻訳キー追加だけでは機能追加と判断しない。既存機能の翻訳対応、JSハッシュ名変更、旧asset削除を切り分けた。
- 新版のsource mapは削除されている。親に残るmapにも`sourcesContent`がなく、完全な元ソース差分には復元できない。
- 本番認証・外部サービス・feature flag・OS別native binary・実機での互換性は未確認。リリース全体を網羅する公式changelogの代替ではなく、このコミットの配布物で確認できる範囲の分析である。

再現の起点:

```powershell
git show 3567883d^:bob2/bob-code_2.0.0/package.json
git show 3567883d:bob2/bob-code_2.0.0/package.json
git diff-tree --no-commit-id --name-status -r 3567883d
git diff 3567883d^ 3567883d -- extensions
```
