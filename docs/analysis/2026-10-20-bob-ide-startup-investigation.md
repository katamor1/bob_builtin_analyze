# Bob IDE 起動時の3症状：原因調査

調査日: 2026-10-20（JST）。対象リポジトリ HEAD: `3d3d25c296dc798c7eb2fd786625775bca1152f0`。

## 結論

3症状は同じ原因ではない。MCP は起動設定と通信形式にそれぞれ問題があり、接続後には旧設定の allowed roots 欠落も問題になる。コマンドの多くは意図的な非表示。ワークフロー未検出は既存 workspace 定義の厳密検証エラーを再現した。

| 症状 | 調査結果 | 確度 |
| --- | --- | --- |
| MCP 接続エラー | `Bob.exe` を Node 実行指定なしで起動する旧設定。加えて、サーバーは Content-Length、Bob のクライアントは改行区切り JSON | 設定・実装不整合と通信再現は確認済み。元設定の GUI 再起動は実施していない |
| パレットのコマンド不足 | 3拡張の91コマンド中、公開入口5件、86件は `when: "false"` | 導入済み manifest・文書・テストで確認済み |
| ワークフロー未検出・ボタンなし | agent ステップの非対応フィールド `maxResultBytes` により唯一の定義が除外される | 導入済み compiler と loader の読み取り再現で確認済み |

解消順序は **ワークフロー定義の最小移行 → MCP の恒久修正・設定再生成 → 実機受入確認**。単純な再インストールや Bob のダウングレードでは、残存する workspace 設定と定義を解消できない。

## 調査対象と導入状態

エラーログが示す workspace は `C:\Users\stell\source\repos\bazaar_test\trunk`。本リポジトリとは別の workspace である。

| 対象 | 確認値 |
| --- | --- |
| Bob IDE / 組込 `IBM.bob-code` | 両方 `2.2.3` |
| 基盤バージョン | `1.126.0+bob2.2.3` |
| インストール先 | `C:\Users\stell\AppData\Local\Programs\IBM Bob` |
| 利用者拡張 | `C:\Users\stell\.bobide\extensions` |
| 診断ログ | `C:\Users\stell\AppData\Roaming\IBM Bob\logs\20261020T215713` ほか |
| workflow-register | `0.1.0`、JS 300/300件が手元 VSIX と一致 |
| bob-bazaar-review | `0.3.0`、JS 114/114件が手元 VSIX と一致 |
| bob-code-consistency-review | `0.1.0`、JS 100/100件が手元 VSIX と一致 |

全3拡張の main ファイルは存在し、同日21:57:28の Extension Host ログに activation 開始が記録されている。manifest は repo と `__metadata` だけが異なり、VS Code の要求はすべて `^1.106.1`。未導入やパッケージ展開不良を示す証拠はない。ただし全機能の activation 完了を意味するものではない。

workflow-register の通常 `out` と installed には75ファイルのバイト差があるが、配布スクリプトが一部モジュールを圧縮する。**配布 VSIX との比較では514ファイルすべて一致**するため、この差を旧版導入の証拠には使わない。

配布物の SHA-256 と比較件数: [distribution-check.json](C:/Users/stell/source/repos/bob_builtin_analyze/docs/analysis/bob-ide-startup-2026-10-20/distribution-check.json)。

## MCP：起動・通信・利用権限の3段階

### 起動設定

実設定 [mcp.json](C:/Users/stell/source/repos/bazaar_test/trunk/.bob/mcp.json) の `bazaar` は次の状態だった。設定の更新日時は2026-06-29であり、拡張を更新しても残っている。

- `command`: `C:\Users\stell\AppData\Local\Programs\IBM Bob\IBM Bob.exe`
- `args[0]`: installed `local.bob-bazaar-review-0.3.0\out\mcp\server.js`
- 明示 env: `BZR_PATH`、`BZR_TEXT_ENCODING` のみ。
- 実行ファイルと JS は存在する。`ELECTRON_RUN_AS_NODE` と `BOB_BAZAAR_ALLOWED_ROOTS` は設定されていない。

[mcpConfig.ts](C:/Users/stell/source/repos/bob_builtin_analyze/extensions/bob-bazaar-review/src/mcp/mcpConfig.ts:33) は現在も `process.execPath` をそのまま使い、Electron の Node 起動指定を生成しない。Bob 同梱 `bin/bobide.cmd` 自体は `ELECTRON_RUN_AS_NODE=1` を指定する。[Electron 公式仕様](https://www.electronjs.org/docs/latest/api/environment-variables)もこの変数による Node 起動を定義している。

ログ [IBM Bob MCP.log](<C:/Users/stell/AppData/Roaming/IBM Bob/logs/20261020T215713/window1/exthost/IBM.bob-code/IBM Bob MCP.log:6>) に `Session failed to start` / `Connection closed` が繰り返し記録され、再接続3回でも失敗する。Node 起動を指定しない設定はこの挙動と整合する。元設定の実行は余計な GUI を起動するため再実施せず、下記の Node 起動指定による対照検証を行った。

### stdio 通信形式

[jsonRpc.ts](C:/Users/stell/source/repos/bob_builtin_analyze/extensions/bob-bazaar-review/src/mcp/jsonRpc.ts:20) は `Content-Length: ...\r\n\r\n` で送信し、受信側も同じヘッダーを要求する。一方、導入済み Bob 2.2.3 の `dist/extension.js` の `readMessage()` は改行でメッセージを区切っている。標準の [MCP stdio transport](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)も改行区切り JSON を要求する。

導入済みサーバーを変更せず、次の対照検証を実行した。

| 起動方法 | 入力形式 | initialize / tools/list |
| --- | --- | --- |
| 外部 Node.js `22.23.2` | Content-Length | 成功、16 tools |
| Bob.exe + `ELECTRON_RUN_AS_NODE=1` | Content-Length | 成功、16 tools |
| 外部 Node.js `22.23.2` | 改行区切り JSON | 1.8秒で打ち切り、応答0件 |

したがって、**Node 起動指定だけを追加しても、標準クライアントとの通信は回復しない**。MCP の既存テストも同じ Content-Length ヘルパーで通信しており、相互運用不良を捕捉できていない。

### allowed roots と初期化状態

同じ起動検証で `bazaar_status` を呼ぶと、Bazaar 実行に進む前に `allowed roots are not configured` が返った。これは接続切断とは別の、接続後に現れる問題である。現行の設定生成処理には workspace root の出力があるが、古い実設定にはない。解消時には必要な workspace / repository root だけを明示する。

[bobWorkspaceInit.ts](C:/Users/stell/source/repos/bob_builtin_analyze/extensions/bob-bazaar-review/src/workspace/bobWorkspaceInit.ts:247) の初期化状態判定は server 項目の存在しか確認しないため、この古い設定も正常に見える。GUI の初期化は設定を再生成するため、手編集だけの対処では生成側の不具合が再発する。

## コマンドパレット：公開入口の集約

| 拡張 | 定義数 | 常時公開数 | 公開入口 |
| --- | --- | --- | --- |
| workflow-register | 55 | 2 | `Bob: 操作ハブを開く` / `Bob Workflow: ワークフローを作成・編集` |
| bob-bazaar-review | 19 | 2 | `Bob Bazaar Review: レビューを開始` / `Bob Bazaar Review: 資料からプロジェクト規約を作成` |
| bob-code-consistency-review | 17 | 1 | `Bob Code Consistency Review: 整合プレレビューを開始` |

[extensions/README.md](C:/Users/stell/source/repos/bob_builtin_analyze/extensions/README.md:13) の公開契約と installed manifest が一致した。その他のコマンドは登録を保ち、主 GUI から使用する設計である。

この5入口まで欠ける場合は追加の現象として、開いているプロファイル、無効化状態、パレットのフィルター、activation 失敗を実 UI で調べる。今回、画面上の5入口の有無そのものは直接確認していない。

## ワークフロー：旧 workspace 定義の残存

問題 workspace には `.bob/workflows/bazaar-project-rule-review/WORKFLOW.md` が1件ある。その [171行](C:/Users/stell/source/repos/bazaar_test/trunk/.bob/workflows/bazaar-project-rule-review/WORKFLOW.md:171) の `analyze-changes` は `type: agent` だが、`maxResultBytes: 20000` がある。

検出から非表示までの経路は次のとおり。

1. [parseV1Workflow.ts:123](C:/Users/stell/source/repos/bob_builtin_analyze/extensions/workflow-register/src/core/parser/parseV1Workflow.ts:123) が agent の `maxResultBytes` を無視対象として警告する。
2. [workflowCompiler.ts:57](C:/Users/stell/source/repos/bob_builtin_analyze/extensions/workflow-register/src/core/workflowCompiler.ts:57) が strict 検証で警告をエラーにする。
3. [workflowDefinitionLoader.ts:113](C:/Users/stell/source/repos/bob_builtin_analyze/extensions/workflow-register/src/workflowDefinitionLoader.ts:113) が strict に失敗した定義を除外する。
4. [workflowRegistrationService.ts:58](C:/Users/stell/source/repos/bob_builtin_analyze/extensions/workflow-register/src/workflowRegistrationService.ts:58) が0件として `bob-code.hasWorkflows=false` を設定する。
5. Bob のワークフローボタンと `bob-code.task.workflow` のパレット入口は、この context が true のときだけ表示される。

導入済みと repo の compiler の双方で、元ファイルは `ok:false`、171行だけをメモリ内で除いた定義は `ok:true` / 5 steps となった。導入済み loader も vscode 境界を読み取り stub にして確認し、元は0件、修正案は1件だった。**実ファイルは変更していない**。144・156行の command step 側の同名フィールドは残してよい。

repo と installed の Bazaar 同梱テンプレートは一致し、既にこの不正な agent フィールドを含まない。拡張の導入状態よりも既存 workspace への移行漏れが問題である。現在の stale 判定はタイトルと `workspaceRequired` を見るだけなので、内容の検証エラーを正常状態として見逃し得る。

## Bob 更新との関係と残る確認

Bob が同日更新された状況と、公式 [Changelog](https://bob.ibm.com/docs/ide/changelog) の MCP クライアント更新は、互換性確認を行う理由になる。ただし公開ページから今回の変更を2.2.3に厳密対応付けできず、旧版での比較もしていないため、**Bob 2.2.3 の回帰とは断定しない**。

workflow-register のバージョン許容範囲は正式版 `>=2.0.0 <3.0.0`。2.2.3は範囲内だが、実 API による登録成功は別途受入確認が必要。今回は定義の除外が API 呼び出しより先に起こる。

付随ログには、21:40の認証更新401、後続起動の IBM i entitlement 不足、Z 拡張の設定 `TypeError`、翻訳 bundle 不足もある。21:57には保存 session の復元と Bob 本体の activation 成功が記録されている。これらをローカル3症状の共通原因にはせず、必要な premium 機能について別途切り分ける。

## 実行した検証と限界

- [evidence.json](C:/Users/stell/source/repos/bob_builtin_analyze/docs/analysis/bob-ide-startup-2026-10-20/evidence.json): 導入 manifest、strict 検証、MCP 対照検証、元設定・定義のハッシュ不変を保存。
- [diagnose.cjs](C:/Users/stell/source/repos/bob_builtin_analyze/docs/analysis/bob-ide-startup-2026-10-20/diagnose.cjs): 読み取り再現スクリプト。現在の既知の設定だけを対象とし、allowed roots が変更済みの場合は tool-call 検証を停止する。
- Bazaar 関連既存テスト: **11件中9成功・2失敗**。allowed roots ケースで `realpath` の EPERM と tool-result assertion が発生。初回の一時ディレクトリ rename 制約は repo 内 TEMP への変更で解消した。残る失敗を製品不具合か実行環境制約かは確定していない。
- workflow-register の palette / compiler parity: **32件中29成功・3失敗**。Contract v2 package の `Package unavailable` と件数不一致であり、今回の V1 再現とは分けて扱う。原因は未分離。
- consistency の palette 契約: **1件成功**。3拡張の palette 契約テストはいずれも成功。
- 最終テスト出力は同ディレクトリの `bazaar-tests.log` / `workflow-tests.log` / `consistency-tests.log` に保存。

ソース、利用者設定、問題 workspace は変更していない。実 UI、通常プロファイルでの MCP 復旧、Bob API への登録成功、実モデルによる実行は未検証。全テスト成功や実機復旧完了は主張しない。

実施計画: [Bob IDE 起動問題の解消計画](C:/Users/stell/source/repos/bob_builtin_analyze/docs/superpowers/plans/2026-10-20-bob-ide-startup-recovery.md)。
