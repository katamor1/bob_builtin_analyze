# workflow-register ドキュメント

このディレクトリには、`workflow-register` 拡張機能の設計・運用・テストに関するドキュメントを配置します。

## 設計書

- `basic-design-ja.md`  
  拡張機能の目的、スコープ、全体構成、主要コンポーネント、workflow 定義モデル、実行状態、run control、task snapshot、GUI Builder、Template Customization Studio、AI 補助、他拡張連携、テスト方針をまとめた基本設計書です。

- `detailed-design-ja.md`  
  実装モジュール、activation、command、設定、公開 API、parser / validator、Bob 登録、WorkflowEngine、run state、run control、Run Control View、task snapshot、result handoff、GUI Builder、Template Customization Studio、diagnostics、テスト観点を整理した詳細設計書です。

- `run-state-schema-v1-ja.md`  
  `run.json` の schema version、historical v0 migration、exact-byte backup、future-version read-only protection、invalid document isolationを定義します。

- `reproducible-runtime-phase4-ja.md`  
  immutable event log、crash journal、fsync、cross-process lease、stale-write protection、`control.json` の独立signal契約、運用診断と復旧手順を定義します。

- `reproducible-runtime-phase4-windows-ja.md`  
  Windowsの8.3 short path、native realpath、heartbeat中のlock replacement、Windows回帰testの追加契約を定義します。

- `workflow-run-retention-ja.md`
  6つの手動retention command、4設定、trust split、root-first multi-root、protected run、cleanup lease/owner guard/quarantine、operator recovery、migration crash pair、metadata-only evidenceを定義する運用ガイドです。

## テスト仕様書

- `unit-test-spec-ja.md`  
  parser、validator、engine、run state、run control、Run Control View、task snapshot、result handoff、Bob adapter helper、authoring helper、Template Customization Studio helper の単体テスト仕様書です。

- `real-machine-test-spec-ja.md`  
  VS Code / IBM Bob / Bob Workflow UI / Webview / Template Customization Studio / Explorer view / Status Bar / multi-root workspace を含めた実機テスト仕様書です。

## Release evidence

- [`workflow-reproducible-runtime-phase4-2026-07-12.md`](../../../docs/release-evidence/workflow-reproducible-runtime-phase4-2026-07-12.md)  
  Phase 2〜4のevent、journal、lease、CAS、runner復旧、hardening review、検証ゲートを記録します。

- [`workflow-reproducible-runtime-phase4-windows-2026-07-12.md`](../../../docs/release-evidence/workflow-reproducible-runtime-phase4-windows-2026-07-12.md)  
  Windows root identity、lock retry、Linux / Windows final matrix、release decisionを記録します。

- [`workflow-run-retention-p1-6-2026-07-13.md`](../../../docs/release-evidence/workflow-run-retention-p1-6-2026-07-13.md)
  P1-6のdelivered behavior、安全契約、local/hosted gates、VSIX情報、integration GOとProduct Release NO-GOを記録します。

- [`workflow-run-retention-p1-6-review-2026-07-13.md`](../../../docs/release-evidence/workflow-run-retention-p1-6-review-2026-07-13.md)
  P1-6のreview scope、修正finding、invariant、final whole-diff review結果を記録します。

## 運用・検討メモ

- `workflow-authoring-guide.md`  
  workflow 作成者向けの authoring guide です。

- `bob-task-export-recovery-plan-ja.md`  
  Bob task snapshot / recovery に関する検討メモです。

- `workflow-pause-resume-plan-ja.md`  
  workflow pause / resume 機能の検討メモです。

- `workflow-pause-resume-phase0-decision-ja.md`  
  pause / resume phase0 の判断記録です。
