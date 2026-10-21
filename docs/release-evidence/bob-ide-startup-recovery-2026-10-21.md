# Bob IDE 起動問題：実施結果と残課題

確認日：2026-10-21（JST）。**MCP接続、公開5コマンド、定義の検証・登録は復旧。Bob標準のワークフローボタンは、本体の第三者source制限により未解消。**

対象は IBM Bob 2.2.3 / VS Code 1.126.0 / Electron 42.2.0 と、`C:\Users\stell\source\repos\bazaar_test\trunk\trunk.code-workspace`。通常プロファイル、既存のworkspace trustを維持して確認した。Bob本体のダウングレードは実施していない。

## 受入結果

| 項目 | 結果 | 実機で確認した内容 |
|---|---|---|
| Bazaar MCP | 合格 | Bob自身が `Session connected`。16 toolsを列挙し、`bazaar_status`成功、root外拒否、write tools非公開を確認 |
| コマンドパレット | 合格 | 公開5入口が登録され、実画面の検索結果にも表示。非公開86コマンドは既存仕様を維持 |
| ワークフロー定義 | 合格 | Bazaar V1の5 stepsをstrict検証・登録。利用者が追加した整合プレレビューも保持し、合計2件 |
| 操作ハブ | 合格 | 通常起動で2件の名称と開始ボタンを表示 |
| Bob標準のStart Workflowボタン／選択肢 | 未解消 | 登録直後には一時表示するが、Bob本体がsourceを無効化し、安定後は非表示 |
| モデルを使うレビュー本処理 | 未実施 | 今回は登録・表示とローカルMCP読み取りまでを検査 |

**登録APIの成功と、Bobでの利用許可は別である。** [実API登録検査](C:/Users/stell/source/repos/bob_builtin_analyze/docs/release-evidence/bob-ide-startup-recovery-2026-10-20/real-api-acceptance.json)の `passed:true` は、そのファイルに記載した検査範囲に限る。最終判定は、制限適用後も観察した[通常起動の受入記録](C:/Users/stell/source/repos/bob_builtin_analyze/docs/release-evidence/bob-ide-startup-recovery-2026-10-20/normal-startup-acceptance.json)の `fullyResolved:false`。

公開5入口は、検証用拡張なしの通常再起動後にも[ネイティブUIで再確認](C:/Users/stell/source/repos/bob_builtin_analyze/docs/release-evidence/bob-ide-startup-recovery-2026-10-20/normal-palette-observation.json)した。Bobは通常起動の操作ハブを表示した状態で残している。

## 実施した変更

1. 対象WORKFLOW.mdをバックアップし、agent `analyze-changes` の非対応 `maxResultBytes: 20000` だけを除去した。command側の同名上限2件とpromptを保持した。変更後SHA-256は `5251b67b715213934909f42e033efe843832cae72826425aa4f50cc107a72e38`。[移行記録](C:/Users/stell/source/repos/bob_builtin_analyze/docs/release-evidence/bob-ide-startup-recovery-2026-10-20/workflow-migration.json)
2. MCPの旧Content-Length通信を改行区切りJSONへ修正し、Electron起動時に `ELECTRON_RUN_AS_NODE=1` を生成するようにした。UTF-8分割、不正JSON、過大行後の回復を回帰検査した。
3. 古いserver.js参照、起動env、allowed roots、実在パスを検査する設定診断を追加した。junctionは実体パスで比較する。既存workflowの移行もカスタマイズを保持する差分候補として扱い、全件検証失敗と未配置を区別した。
4. packageとworkflow contribution ownerの版を同期した。中間版で起きたactivation失敗を回帰テストで固定し、最終版へ入れ替えた。
5. インストール済み最終版の生成処理で `.bob/mcp.json` をバックアップ付き再生成した。Bazaar実行ファイルとserver.jsを絶対パスにし、許可rootを対象trunkに限定した。他設定を保持し、再生成が同一内容になることを確認した。[設定記録](C:/Users/stell/source/repos/bob_builtin_analyze/docs/release-evidence/bob-ide-startup-recovery-2026-10-20/mcp-configuration.json)、[MCP往復検査](C:/Users/stell/source/repos/bob_builtin_analyze/docs/release-evidence/bob-ide-startup-recovery-2026-10-20/mcp-acceptance.json)

通常起動後のMCP接続は **03:59:27.222 JST** に確認した。設定の存在確認だけを接続の根拠にはしていない。

## 未解消の原因：Bob本体のsource制限

通常起動の[IBM Bob.log](<C:/Users/stell/AppData/Roaming/IBM Bob/logs/20261021T035846/window1/exthost/IBM.bob-code/IBM Bob.log:25>)に **03:59:27.963 JST**、以下を記録した。

> Source "workflow-register" is registered but disabled because third party extensions are disabled.

インストール済みBobの[本体bundle](<C:/Users/stell/AppData/Local/Programs/IBM Bob/resources/app/extensions/bob-code/dist/extension.js>)も読み取り確認した。

- `hostName` は `vscode.env.appName` から取得される。
- hostNameが `IBM Bob` の場合、AddonManagerへ第三者sourceを無効化する値を渡す。
- 公開 `registerSource(id, name)` は第三者sourceを作成する。内部のfirstParty引数はこの公開ラッパーに存在しない。
- 登録後の有効workflow一覧は、無効sourceの所有する定義を除外する。その結果、Bob自身が `bob-code.hasWorkflows=false` にする。

本体bundleのSHA-256は `f111fce450ee57b16ca9d7c9fa3cebfcf69fea90ca08d28c68da580ee04bf64b`。[静的確認とログイベント](C:/Users/stell/source/repos/bob_builtin_analyze/docs/release-evidence/bob-ide-startup-recovery-2026-10-20/normal-startup-acceptance.json)に根拠を保存した。これはworkspace trustやVS Code拡張機能の無効化とは別の段階である。

ホスト名変更、IBM sourceの偽装、本体書き換え、context値の継続的な強制は行っていない。公開設定schemaと今回確認した公式資料では、当該制限の解除手順を確認できなかった。制限の導入版が2.2.3か、それ以前かは未確定であり、今回確認した2.2.3での挙動として扱う。

## 導入物と検証

| 拡張 | 導入版 | VSIX bytes | SHA-256 |
|---|---:|---:|---|
| workflow-register | 0.1.2 | 1,197,547 | `01038D2C4D3F10DD04C58DDF3658F4BCBAA2C2A9E4138BEF4D4F8255A9F35667` |
| bob-bazaar-review | 0.3.2 | 3,757,042 | `71EB4280D2B51E75688F3A060E5C99E2DC231C66441E64C93ED7EB3C25A3CC63` |
| bob-code-consistency-review | 0.1.0（維持） | 3,704,259 | `5C4FD457B00B310FDDD7916F5DD9BBEE8230A929FB6AC539D31DDE840D309B39` |

両修正版のcompile/package/policyが成功した。workflow-registerは既存のAST同値圧縮を拡張し、1,200,000-byte上限を維持した。導入済み全516 JSとcontribution定義はVSIXと完全一致。package内容もBobが追加する `__metadata` を除いて一致し、3拡張すべてのowner版が整合した。[導入物照合](C:/Users/stell/source/repos/bob_builtin_analyze/docs/release-evidence/bob-ide-startup-recovery-2026-10-20/installed-artifacts.json)

| 検査 | 結果 |
|---|---|
| Bazaar機能修正後の全suite | 778件：777成功、0失敗、1 skip |
| workflow-register全suite | 2,265件：2,263成功、1失敗、1 skip |
| 最終owner同期後の関連suite | 129件すべて成功（workflow 88、Bazaar 21、consistency 20） |
| main反映前の再検査 | 両拡張のcompile、関連157件（Bazaar 48、workflow 109）、両package policy成功 |
| 独立レビュー | Critical 0、Important 1を修正。旧server参照とjunctionのRED→GREENを確認 |
| `git diff --check` | 成功 |

全suiteは最終owner版同期より前、129件は同期後に実行した。残る1失敗は `Gate R hosted R1 and R2 suites pass with measured inactive product wiring`。変更したshipping sourceが過去の固定source snapshotと一致しないため、admissionが拒否する。固定sealは更新せず、全テスト成功とは扱わない。[検査集計](C:/Users/stell/source/repos/bob_builtin_analyze/docs/release-evidence/bob-ide-startup-recovery-2026-10-20/test-summary.json)

実装は `codex/bob-startup-recovery` ブランチで作成した。基点は `3d3d25c296dc798c7eb2fd786625775bca1152f0`。実機検証時点では未コミットだったが、その後、利用者から「現時点をmainへ反映する」と指示されたため、上記の未解消事項を含めた状態をコミットし、ローカルmainへ反映する。反映対象は今回の復旧コード・調査計画・受入記録。リモートへのpushは今回の操作に含めない。

この統合は現状保存の指示に基づくもので、上記の全体未解消・Gate R失敗を解消済みとするものではない。[反映前の検査記録](C:/Users/stell/source/repos/bob_builtin_analyze/docs/release-evidence/bob-ide-startup-recovery-2026-10-20/main-integration-checks.json)

## 次の解消計画

1. [問い合わせ草案](C:/Users/stell/source/repos/bob_builtin_analyze/docs/release-evidence/bob-ide-startup-recovery-2026-10-20/ibm-support-draft.md)を用い、IBMに第三者workflow sourceの正式なサポート可否・許可方法・対応版を確認する。草案はローカル保存のみで、送信していない。
2. 正式な対応方法または対応版が得られたら、分離環境で同じ2定義を登録し、10秒以上安定後も標準ボタンと選択肢が残り、source無効化ログが出ないことを受入条件にする。旧版への変更は対応可否を確定してから判断する。
3. 標準workflow APIが非対応である場合は、既存のレビューGUI入口を利用する構成、または公式のskill・MCP機構へ移す設計を別途作る。skill化では既存engineの順序・承認・成果物検証を同等に保てるか確認が必要であり、単純なファイル移動で代替できるとは扱わない。公式情報：[Skills systemを含む変更履歴](https://bob.ibm.com/docs/ide/changelog)、[MCPの構成方法](https://bob.ibm.com/docs/ide/configuration/mcp/mcp-in-bob)。
4. 公開配布／main統合前には、固定Gate R候補の再作成・審査手順も別途完了させる。

## バックアップ

- 定義：[WORKFLOW.md.before-recovery](C:/Users/stell/source/repos/bob_builtin_analyze/docs/analysis/bob-ide-startup-2026-10-20/backups/WORKFLOW.md.before-recovery)
- MCP：対象trunkの `.bob/mcp.json.bak-2026-10-20T14-24-56-168Z` が当初設定。最終再生成前も `.bob/mcp.json.bak-2026-10-20T18-54-06-159Z` に保存した。
- 拡張一覧：[extensions.before-recovery.json](C:/Users/stell/AppData/Local/BobStartupRecovery/2026-10-20/extensions.before-recovery.json)。旧VSIXを保持した。

ロールバック時は、拡張だけでなくMCPのserver.js参照先も同じ版へ揃える。今回の機能修正を戻しても、Bob本体の第三者source制限が解除される根拠はない。
