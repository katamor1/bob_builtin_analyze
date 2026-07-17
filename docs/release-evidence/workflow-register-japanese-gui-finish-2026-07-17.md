# workflow-register 日本語 GUI 横断仕上げ 検証証跡

- 日付: 2026-07-17
- 対象拡張: `extensions/workflow-register`
- 実装差分適用後の先端: `18e80d17fe85c0d601fab280a427c6bfcd507339`

## 対象範囲

- ワークフロー作成・編集の残りタブ、ヘルプ、保存・競合ダイアログ
- Bob 手動ステップ
- テンプレート調整
- Runs View、ステータスバー、実行制御、実行診断
- Quick Pick、Input Box、通知、確認ダイアログ
- コマンドパレット、設定説明、README、UAT 文書
- 残存する旧英語文言の回帰テスト

## 互換性境界

- コマンド ID、設定キー、Webview メッセージ、保存値を維持
- JSON・YAML キー、成果物形式、CSP、nonce、パス境界を維持
- Command Palette のカテゴリ `Bob Workflow` を維持
- task snapshot の上限設定を維持

## ローカル検証

- 集中 GUI 回帰: 60件成功、失敗0件
- `architecture:policy`: 成功（TypeScript 221ファイル）
- `source:policy`: 成功（TypeScript 221ファイル）
- `schema:policy`: 5件成功、失敗0件
- `dependency:policy`: 3件成功、失敗0件
- 全168テストファイルの決定的直列実行: 1,203件中1,202件成功、失敗0件、環境依存スキップ1件
- `package:policy`: 成功
- VSIX生成: `workflow-register-0.1.0.vsix`、1,058,554 bytes、815 entries
- VSIX SHA-256: `21f47b44da586826553a33963df2a211e9dfa18bd7cf54ae4be276359458db31`
- `git diff --check`: 成功

標準の一括 `npm test` は、一部テストが完了後もハンドルを保持するため外部タイムアウトした。全テストファイルを独立プロセスで網羅実行し、失敗0件を確認した。

## リモート統合

一時パッチ輸送ファイルと一時 GitHub Actions workflow は、製品差分の適用と同じ処理で削除した。最終 GitHub Actions 結果とマージコミットは PR に記録する。
