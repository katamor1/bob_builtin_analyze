# 日本語 GUI 統合の最終検証

**日付:** 2026-07-17  
**対象:** PR #132  
**修正済み head:** `be9b2181f0369ee7015f14ce8205256dabebdb42`

## 表示契約の整合

- workflow-register の Command Palette は既存ポリシーどおり `Bob Workflow: <日本語の操作名>` を維持する。
- Human Triage の Extension Host smoke は、実際の日本語 Webview タイトル `指摘確認・振り分け` を待機する。
- コマンド ID、設定キー、Webview message value、保存列挙値、JSON/YAMLキー、成果物schemaは変更しない。
- Consistency Review Wizard は日本語化と同時に、`.bob` workspace初期化カードとmodel-backed statusを保持する。

## 統合時に解消した問題

1. Bazaar GUI patchの分割payload末尾に混入した1byteを、位置・値・全patch SHA-256を確認して除去した。
2. current `main` との唯一のpatch競合を、初期化機能と日本語文言の双方を残して解消した。
3. 日本語化後も英語Command Paletteカテゴリを要求する既存policyへpackage metadataを再整合した。
4. Extension Host smokeの旧英語タブ名期待値を日本語表示へ同期した。
5. 一時SDD workflow、encoded patch queue、診断workflow、診断markerを製品差分から除去した。

この文書をrepository owner commitとして追加し、bot push後に保留された通常CIを再実行する。最終結果はPRの検証欄へ記録する。
