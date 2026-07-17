# 共有計画の解決結果

日付: 2026-07-16
対象: `katamor1/bob_builtin_analyze`
共有元: `https://chatgpt.com/share/6a53743e-7444-83e8-b0f8-b21f9a9864d5`

## 解決結果

2026年7月12日の BLOCKED run は `source_plan.txt` が空で repository candidate も0件だったため、その run 単体では実行不能でした。しかし共有計画の原文は commit `d7d9aaa6de5572f477e88cdfe51a4fc0893f0f18` の `.codex/shared-plan.md` に取得済みであり、対象リポジトリは `katamor1/bob_builtin_analyze` と一意に解決できます。

共有計画は、実装可能な6段階の計画へ分解され、PR #72 で main に統合されています。今回の独立レビューでは、完了済みチェックリストと実装の間に6件の重要なギャップと1件の既定値不整合が見つかったため、失敗テストを先行して追加修正しました。

| Phase | 実行計画 | 完了条件 | 現在の状態 |
|---|---|---|---|
| 1 | `docs/superpowers/plans/2026-07-12-bob-evidence-scope-phase1.md` | evidence-scope domain、規約選択、文書adapter、budget、audit artifact | 完了（重複symbol IDの決定性を補強） |
| 2 | `docs/superpowers/plans/2026-07-12-bob-evidence-scope-phase2.md` | preprocess接続、`context-budget-report.json`、manifest handoff | 完了 |
| 3 | `docs/superpowers/plans/2026-07-12-bob-evidence-scope-phase3.md` | workspace-local rule pack、schema、SHA-256 provenance、stale input | 完了 |
| 4 | `docs/superpowers/plans/2026-07-12-bob-evidence-scope-phase4.md` | repository symbol/reference index consumer、freshness、graph validation | 完了（現在解析の優先とdepth既定値を補強） |
| 5 | `docs/superpowers/plans/2026-07-12-bob-evidence-scope-phase5.md` | immutable Git index producer、incremental cache、global re-link | 完了（credential非保持と置換失敗安全性を補強） |
| 6 | `docs/superpowers/plans/2026-07-12-bob-evidence-scope-phase6-artifact-ledger.md` | metadata-only artifact ledger、lineage、two-checkpoint stale propagation | 完了（synthetic missingとload失敗前checkpointを補強） |

## 実装対象の解決

- repository candidate: `katamor1/bob_builtin_analyze`（1件）
- default branch: `main`
- current inspected main: `f4f9d3308361333e02ab1af732706b7a9e5fc952`
- implementation PR: `#72`
- merge commit: `d275f911acf28d3924a52901de01328679aa8100`
- ancestry: current main は merge commit より7 commit ahead、behind 0、merge-base は同 merge commit

## 要求と実装の対応

| 共有計画の要求 | 実装位置 | 検証位置 |
|---|---|---|
| 変更symbolと影響範囲の決定論的選択 | `src/evidenceScope/changeScopeEngine.ts` | `test/evidenceScope.test.js` |
| 優先度付きcontext budget | `src/evidenceScope/contextBudgetPlanner.ts` | `test/evidenceScope.test.js` |
| project rule pack | `src/evidenceScope/projectRulePackLoader.ts` | `test/projectRulePack.test.js` |
| repository index consumer | `src/evidenceScope/repositorySymbolIndexLoader.ts` | `test/repositorySymbolIndex.test.js` |
| repository index producer/cache | `src/evidenceScope/repositorySymbolIndexProducer.ts`、`repositoryIndexCache.ts` | `test/repositorySymbolIndexProducer.test.js` |
| artifact lineageとstale伝播 | `src/evidenceScope/artifactLedger.ts` | `test/artifactLedger.test.js` |
| pipeline／manifest接続 | `src/evidenceScope/reviewContextBudget.ts`、`src/core/pipeline.ts` | `test/evidenceScopePipeline.test.js` |

上記は `extensions/bob-code-consistency-review/` からの相対パスです。

## 実行判断

PR #72 の機能を重複実装せず、mainとの差分レビューで確認できたギャップだけを修正対象としました。修正は5コミットに分割し、56件のevidence-scope焦点テスト、270件の全テスト、静的ポリシー、dependency audit、VSIX policyで検証します。BLOCKED runで欠落した計画・snapshot・実装報告・独立レビュー報告・公開状態も同じPRで補完します。
