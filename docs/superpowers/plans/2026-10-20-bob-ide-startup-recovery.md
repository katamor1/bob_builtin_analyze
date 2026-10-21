# Bob IDE 起動問題の解消 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bob 2.2.3で、Bazaar MCP接続、ワークフロー検出・ボタン表示、5つの公開パレット入口を利用できる状態にする。

**実施状況（2026-10-21）:** MCP・公開5入口・定義の検証と2件登録は復旧。標準ワークフローボタンは、Bob本体が第三者sourceを無効化するため未達。[実施結果と次の解消計画](C:/Users/stell/source/repos/bob_builtin_analyze/docs/release-evidence/bob-ide-startup-recovery-2026-10-21.md)。登録成功を全体解消と扱わない。

**Architecture:** 既存workspaceのV1定義を最小移行し、Bazaar MCPの起動設定とstdio transportを修正する。設定の存在と利用可能状態を区別し、配布VSIXを検証したうえで段階的に適用する。3症状を独立して受入確認する。

**Tech Stack:** Windows、IBM Bob 2.2.3、VS Code extension API、TypeScript、Node.js、MCP stdio。

**Spec:** [原因調査報告](C:/Users/stell/source/repos/bob_builtin_analyze/docs/analysis/2026-10-20-bob-ide-startup-investigation.md)。再現証跡は同報告の `evidence.json`。

## Global Constraints

- 調査時点では利用者設定・workspace・製品コードの変更は未実施だった。適用後の状態とバックアップは上記実施結果に記録した。
- 既存の公開パレット契約は3拡張合計5入口を維持する。隠された86コマンドの一括再公開を行わない。
- workflow-register の厳密検証を弱めず、agent側の非対応フィールドだけを移行する。
- MCPは改行区切りJSONで通信し、stdoutへJSON-RPC以外を書かない。
- `BOB_BAZAAR_ALLOWED_ROOTS` は必要なworkspace/repository rootだけにする。無制限cwd許可やwrite tools一括有効化を対処に使わない。
- 変更前の設定と定義をバックアップし、他MCPサーバーと利用者のカスタマイズを保持する。
- Bob 2.2.3の不具合や旧版拡張の誤導入を前提にしない。今回3拡張の導入JS514件は手元VSIXと全一致した。
- 既存テストに5失敗が残る。修正前の結果と比較し、原因を切り分けずに成功扱いしない。

## Review Focus

- 空白・日本語を含むBob/拡張パスでも、余計なGUIを起動せずMCPが接続すること（Task 2/5）。
- UTF-8の途中分割、複数メッセージ、巨大行の後にもstdio境界が壊れないこと（Task 2）。
- 古い設定のserver名だけが存在しても正常表示せず、他serverの設定を保持すること（Task 3）。
- カスタムworkflowの正当なcommand側`maxResultBytes`やpromptを壊さないこと（Task 1/4）。
- 全定義が無効な場合に「未配置」と「検証失敗」を区別し、診断へ到達できること（Task 4）。

## Task 1: 問題workspaceのワークフローを最小移行

**Files:** `C:\Users\stell\source\repos\bazaar_test\trunk\.bob\workflows\bazaar-project-rule-review\WORKFLOW.md:171`。

**Interfaces:** installed `out/core/workflowCompiler.js` の `compileWorkflowDocument({sourceId,filePath,text,strict:true})`。成功時にV1定義1件・5 stepsを得る。

- [x] 対象ファイルのバックアップとSHA-256を記録する。現在のstrict診断がagent側`maxResultBytes`だけであることを再確認する。
- [x] `analyze-changes`内の`maxResultBytes: 20000`だけを削除する。command step側144・156行相当は残す。
- [x] installed compilerで`ok:true`、error/warningなし、5 stepsを確認する。調査用`diagnose.cjs`は変更前定義を前提とするため、適用後はこの直接検証に切り替える。
- [ ] Bobの操作ハブで再読込し、Bobのワークフローボタン・選択肢の安定表示を確認する。**登録・操作ハブ表示まで成功。対象1件に加え利用者追加の整合レビュー1件を保持。標準ボタンは本体制限で未達。**
- [x] 実API診断を保存し、Task 5で互換性を切り分ける。定義検証の成功だけでボタン復旧と判断しない。

**完了条件:** workspaceの対象V1定義が1件登録され、操作ハブとBobの選択画面で確認できる。

## Task 2: MCPのElectron起動と標準stdioを修正

**Modify:** `extensions/bob-bazaar-review/src/mcp/mcpConfig.ts`、`src/mcp/jsonRpc.ts`。

**Tests:** `test/mcpConfig.test.js`、`test/mcpRequestLimit.test.js`、`test/mcpAllowedRoots.test.js`、新規`test/mcpStdioInterop.test.js`。

**Interfaces:** `configureWorkspaceMcpServer(options)`の既存引数・戻り値を保持。`McpStdioReader`/`respond`/`respondError`は既存呼出側を保ち、ワイヤ形式を改行区切りJSONにする。

- [x] 先に失敗する回帰ケースを追加する。Electron Hostでは生成envに`ELECTRON_RUN_AS_NODE:"1"`、通常Nodeでは不要であること、改行JSONのinitialize応答が1行JSONであることを検証する。
- [x] config生成時にElectronをNodeとして起動するenvを追加する。実機2.2.3で同じBob.exeからNode起動できることは今回の対照検証で確認済み。外部Node指定機能の追加は必要性が出た場合に分離する。
- [x] stdioの入出力をUTF-8改行区切りJSONに統一する。最大request bytesと不正JSONへのエラー応答を維持し、過大な1行を捨てた後は次の改行メッセージを読めるようにする。
- [x] 既存MCPテストのContent-Lengthヘルパーを標準形式へ変更する。独立したクライアント実装によるinitialize→initialized→tools/listの往復を追加する。
- [x] UTF-8途中分割、1chunk複数message、CRLF、不正JSON、通知への無応答、過大行後の回復を回帰テストで固定する。
- [x] `npm run compile`後、`node --test test/mcpConfig.test.js test/mcpStdioInterop.test.js test/mcpRequestLimit.test.js test/mcpAllowedRoots.test.js test/mcpWriteTools.test.js test/mcpServerVersion.test.js`を実行する。

**完了条件:** 標準stdio clientで起動・初期化・tool列挙が完了し、Bob.exeのGUIが追加起動しない。

## Task 3: 古いMCP設定の診断と再生成

**Modify:** `extensions/bob-bazaar-review/src/workspace/bobWorkspaceInit.ts`、必要なら既存の状態表示を使うGUI呼出側。

**Tests:** 新規`test/bobWorkspaceMcpHealth.test.js`、既存`test/mcpConfig.test.js`。

**Interfaces:** 既存のworkspace状態取得経路を使い、設定済み状態と接続成功を区別する。接続未検証を「接続済み」と表示しない。

- [x] server名だけ存在する旧設定、実行ファイル/JS不在、Electron指定不足、allowed roots不足を検出する失敗テストを書く。
- [x] `mcpContainsServer()`の存在確認に加え、生成されるlaunch spec・必要env・実在パスを検査し、不足箇所をGUIで示す。
- [x] Task 2の修正済み拡張から既存`.bob/mcp.json`をバックアップ付きで再生成する。対象workspace rootと、分離している場合のみ必要なBazaar repository rootを設定する。
- [x] 他server、他のトップレベルキー、利用者設定が残ることをテストする。既存のatomic writeとbackup処理を再利用する。
- [x] initialize/tools/listの後、allowed root内の読み取りtoolを実行し、root外は拒否されることを確認する。再初期化後も同じ結果になることを確認する。

**完了条件:** 古い設定が正常扱いされず、修正済み設定が起動・列挙・必要tool呼出しまで成功する。

## Task 4: 既存workflowの移行漏れと診断導線を改善

**Modify:** `extensions/bob-bazaar-review/src/workspace/bobWorkspaceInit.ts`、`extensions/workflow-register/src/workflowRegistrationService.ts`と既存の診断表示経路。

**Tests:** 新規`test/bobWorkspaceWorkflowMigration.test.js`、既存`extensions/workflow-register/test/workflowCompilerParity.test.js`。

**Interfaces:** 同梱の修正済み`.bob/workflows/bazaar-project-rule-review/WORKFLOW.md`を更新候補に使い、既存のtemplate diff previewとbackupを再利用する。

- [x] タイトルと`workspaceRequired`が合っていてもagent側に旧フィールドがあるケースを追加する。未配置、全件invalid、正常、API非互換を別々に検証する。
- [x] 既存workflowの検証/更新案を提示する導線を初期化画面に加える。今回のケースではagentの非対応フィールドだけを差分として示し、promptやcommand側の上限を保つ。
- [x] 全件invalidの場合の登録結果は、配置0件と区別して「検証で除外」と理由・ファイル位置を表示する。APIを呼ぶ前の失敗であることを診断に残す。
- [x] 通常の操作ハブから再検証・再読込へ進めることを確認する。パレットの公開5入口は維持する。
- [x] `node --test test/commandPalettePolicy.test.js test/workflowCompilerParity.test.js`とBazaar側の新規移行テストを実行し、既存V2の3失敗も切り分ける。

**完了条件:** 古い定義を利用者が見つけて移行でき、全件除外時に無理由の「未検出」にならない。

## Task 5: 配布物・Bob 2.2.3実機の受入確認

**Files:** 修正対象拡張の`package.json`、VSIX、`docs/release-evidence/`内の新規検証記録。

**Interfaces:** 各拡張の既存compile/test/package/package:policy、Bob通常プロファイルの公開5入口、MCPとworkflowの実API。

- [x] 修正版にpatch versionを付け、base commit・未コミット差分・VSIX SHA-256・Bob/Node版を記録する。最終版はworkflow 0.1.2 / Bazaar 0.3.2。owner版も同期する。
- [x] 関連129テストとpackage policyが成功。workflow-registerは1,197,547 bytesで上限内。全suiteの固定Gate R admission失敗1件は別記し、sealを緩めない。
- [ ] 5入口、標準MCP、必要root内読み取り、V1検出・登録・Bob標準ボタンの全項目を確認する。**通常プロファイル＋検証用拡張、続いて検証用拡張なしの再起動で確認。分離test modeは一時storageを使うためtrustの根拠にしない。標準ボタンだけ本体制限で未達。**
- [ ] 再起動・再読込・設定再生成後も全回復状態が維持されることを確認する。**MCPと登録・操作ハブは維持。標準ボタンは本体制限で未達。**
- [x] 通常プロファイルのバックアップ、最終VSIX導入、対象設定/定義の移行、全516 JSとVSIXの一致を確認する。
- [x] 公開5入口の実表示を確認する。premiumの未契約コマンドは受入対象に含めない。
- [x] モデルを呼ばず登録・表示・ローカルMCP読み取りまで確認する。レビュー本処理は未実施と明記する。

**完了条件:** 3症状の受入結果と残課題を証跡化し、再起動・再生成後も同じ結果になる。

## ロールバック

MCPとworkflowの適用単位を分け、失敗した単位だけバックアップへ戻す。VSIXは旧版を保持し、設定の絶対パスが旧版のextension directoryを参照していないか併せて確認する。Bob本体のダウングレードは、修正済み定義で実API非互換が再現し、対応版を特定できた場合に別判断とする。
