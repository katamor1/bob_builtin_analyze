# Bob 2.x正式版対応の検証記録

検証日: 2026-09-20。ベース: `3567883d`。実装はCodex管理の`bob-2x-compat` worktreeに保存。

## 変更

- 実行時のBobバージョンを、2.0.1完全一致から正規SemVerの正式版`>=2.0.0 <3.0.0`へ変更。ビルドメタデータを許可し、プレリリース・不正形式・他majorを拒否する。
- 実バージョンをbindingと診断に保持し、保存用の`bob/2.0.1`プロファイル・digest・lock形式は維持する。
- 標準のtask必須APIを5件へ統一。`toSerializable`は任意とし、契約が明示的に要求する場合だけ必須検査する。
- 既存依存の`semver`をVSIXへ同梱する。依存バージョンとlockfileの変更はない。

## 自動検証

| 検証 | 結果 |
| --- | --- |
| `npm ci` / TypeScript compile | 成功 |
| workflow-register全体テスト | 1,886件: 成功1,885、失敗0、skip1 |
| repository文書・command surface検査 | 21件成功 |
| dependency / architecture / source policy | 成功 |
| unused report | 成功、depcheck指摘なし |
| 独立コードレビュー | 修正指摘なし。レビュアー独自の関連テスト80件も成功 |
| Bazaar context / workflow bridge / provider / step completion / result capture | 41件成功 |
| consistency provider / output canonicalize / result capture | 15件成功 |
| VSIX作成・package policy | 成功。903 entries、1,193,624 bytes、上限1,200,000 bytes |

修正前には追加回帰テストで9件の失敗を確認した。全体テストの初回実行で残っていた2.0.1完全一致の旧source assertionも新仕様に更新し、再実行で失敗0となった。

VSIX: `extensions/workflow-register/workflow-register-0.1.0.vsix`

SHA-256: `1992f7521376eb69aab77e2831709a3f4d535ee977d69cdf637bec5999c97b94`

## インストール済みBob 2.1.0の実API検証

Windows上のインストール済み`IBM.bob-code@2.1.0`を使用。通常プロファイルと分離したuser-data-dir / extensions-dir / workspaceで、VSIXを展開した拡張を`--extensionDevelopmentPath`、ローカル検証ハーネスを`--extensionTestsPath`に指定した。2.0.1のリポジトリ内Bob拡張はロードしていない。

確認結果:

1. VSIX内の拡張がactivateし、同梱`semver`を含む実API bindingに成功。
2. 実sourceへworkflowを登録し、Bobの`startWorkflow({id, workspaceFolder, defaultMeta})`で開始。
3. Bobから渡された実taskには必須5件が存在し、`toSerializable`は存在しなかった。factoryの標準probeと実行に成功。
4. `sendMessage`、`setStepComplete`、metadata / messages取得に成功。
5. `toSerializable`なしでsnapshot保存・再読込に成功。assistant textとmetadataを確認。
6. source解除に成功し、Extension Hostはexit code 0で終了。

モデル呼出しは0件。初回のハーネスは検証用metadataキー`smokeToken`が既存の機密情報マスクにより`[REDACTED]`になることを誤って失敗扱いしたため、非機密キー`smokeMarker`に変更して再実行した。製品側のマスク処理は変更していない。

ローカル証跡はworktree内`.superpowers/sdd/bob-2x-compat/`の`smoke-host.js`、`smoke-result.json`、`smoke-stdout-final.log`、各テストログに保存。

## 残る検証・監査事項

- `npm run audit:prod`は既存依存`fast-uri`と`js-yaml`のHigh指摘2件で失敗。今回の変更による追加依存・バージョン変更ではなく、別途更新が必要。
- 実モデルを使うagent / subagent実行、親modeの権限継承、Bob UIからの対話的な再開は未検証。実機で確認したのはローカルworkflow実行、手動完了、snapshot保存・再読込まで。
- 他2拡張のprovider登録・結果取込・context追加は自動回帰テストで確認した。実機のレビュー全工程や外部サービス接続は未検証。
- 実機検証はWindowsのみ。将来の2.x全版の動作保証ではなく、バージョン許可と実APIの存在検査を組み合わせた対応である。
