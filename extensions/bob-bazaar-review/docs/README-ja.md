# bob-bazaar-review ドキュメント

このディレクトリには、`bob-bazaar-review` 拡張機能の設計・運用・テストに関するドキュメントを配置します。

## 現在の実装状態

`bob-bazaar-review` は、Bazaar 差分レビュー、project rules、review-result 保存、MCP 連携、Phase 1 review record 管理を提供する実行可能な VS Code 拡張です。

リファクタリング後は、`workflow-register` 連携を `src/workflow/`、直接レビュー command と Bazaar packet 生成を `src/bazaar/`、active editor の review-result JSON 検証を `src/projectRules/`、Bob 拡張連携を `src/bob/`、GUI を `src/ui/`、workspace 初期化と root 解決を `src/workspace/`、MCP server を `src/mcp/`、review record / triage / summary を `src/records/` に分離しています。

Review Run Wizard v3では、`src/reviewRuns/`がReview GUI、Result Capture、Human Triage間のrun contextを管理します。Iteration 1でpacketからtriage draftまでを接続し、Iteration 2で中断・再開、phase status、timing、decision validation、record/summary一括finalize、legacy artifact復旧を追加しています。Iteration 3では`src/dashboard/`とCampaign Dashboard GUIが、run、pending triage、schema/finding/rule/target mode/timeを集計し、JSON / Markdown / CSVへexportします。

## 設計書

- `basic-design-ja.md`  
  拡張機能の目的、スコープ、全体構成、主要コンポーネント、workspace モデル、Bazaar 実行方針、GUI / 直接レビュー command、workflow-register 連携、MCP、review-result 保存、review record、セキュリティ方針をまとめた基本設計書です。

- `detailed-design-ja.md`  
  実装モジュール、VS Code command、workspace 解決、BazaarClient、GUI、直接レビュー command、MCP server、workflow-register bridge、project rules、review-result capture、review record、multi-root 動作、テスト観点を整理した詳細設計書です。

- `review-run-v3-iteration1-ja.md`  
  Review Run Wizard v3 Iteration 1 のrun schema、artifact配置、ID/path安全性、Review GUIからResult Capture・Human Triageへのhandoff、互換性、テスト、UATをまとめた実装仕様書です。

- `review-run-v3-iteration2-ja.md`  
  Review Run Wizard v3 Iteration 2 のprogress/metrics field、stale-write保護、未完了run再開、decision validation、finalize順序、legacy recovery、セキュリティ、UATをまとめた実装仕様書です。

- `review-run-v3-iteration3-dashboard-ja.md`
  Campaign Dashboardのsource優先順位、rate定義、pending triage、rule / target mode trend、warning、export、セキュリティ、UATをまとめています。

- `review-run-id-allocation-ja.md`  
  同一campaign内で既存・legacy・並行Review Runを上書きしない、`-02`以降のcollision-safe ID予約契約をまとめています。

- `review-run-command-boundary-ja.md`  
  Result Capture / Human Triage command引数のopen workspace境界、ID再検証、workspace外root拒否をまとめています。

## テスト仕様書

- `unit-test-spec-ja.md`  
  BazaarClient、文字コード、workspace resolver、review packet、直接レビュー command、workflow-register bridge、review-result capture、MCP server、review record、Review Run、workflow template の単体テスト仕様書です。

- `real-machine-test-spec-ja.md`  
  VS Code、IBM Bob、workflow-register、Bob Workflow UI、Bazaar Review GUI、Review Run再開/finalize/recovery、Campaign Dashboard、Bazaar CLI、MCP server、multi-root workspace を含む実機テスト仕様書です。

## 既存ドキュメント

- `../README.md`  
  利用者向けの機能説明、コマンド一覧、GUI、MCP、設定、ビルド手順、現在の実装分割をまとめています。

- `workflow-authoring-guide-ja.md`  
  Bob / workflow-register で利用するワークフロー作成ガイドです。

- `../../../docs/extension-refactor-review-54e1fe58.md`  
  3 拡張機能全体の責務分割方針と、今後の分割候補をまとめています。
