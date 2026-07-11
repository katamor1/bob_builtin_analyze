# Three Extension Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `workflow-register`、`bob-bazaar-review`、`bob-code-consistency-review` の依存契約、provider lifecycle、外部プロセス境界、workflow契約検証、実機CIを修正し、本番配布可能な状態にする。

**Architecture:** 変更を4つのレビュー単位に分割する。まずsoft dependencyとprovider登録契約を修正し、次にGit/Bazaar実行境界とpath/size制限を強化する。その後、全workflowのprovider-aware契約検証をCIへ組み込み、最後にWindows/Extension Host smokeと設計文書を同期する。

**Tech Stack:** TypeScript、Node.js built-in test runner、VS Code Extension API、GitHub Actions、GitHub Contents API。

## Global Constraints

- 本番コード変更は失敗する回帰テストを先に追加する。
- `shell: false` を維持する。
- workspace外への読み書きは禁止する。
- provider ID、command ID、workflow IDは互換性契約として扱う。
- 既存のBob非依存コマンドはIBM Bobまたは`workflow-register`不在でも起動できること。
- 3拡張すべてでcompile、policy、unit test、VSIX packageを検証する。

## 実施状況（2026-07-11）

実装項目はPR #68のブランチ `agent/three-extension-remediation-20260711` へ反映済みである。追加レビューで、Git revision解決中のcancel/timeout分類保持、provider登録に実際に使用したAPI identityの保持、`registered:false`時の部分登録rollbackも追加した。

局所検証では、retry controllerのAPI identity維持・generation切替・部分rollbackを3件、Git revision解決のcancel分類と不正revision正規化を確認した。GitHub Actionsは全jobがstep開始前に終了しており、最新headの全体CIと実機試験は未完了である。PRはdraftを維持し、CI／実機ゲートが閉じるまでmergeしない。

---

### Task 1: Code Consistency Soft Dependency and Retry Registration

**Files:**
- Modify: `extensions/bob-code-consistency-review/package.json`
- Modify: `extensions/bob-code-consistency-review/src/extension.ts`
- Modify: `extensions/bob-code-consistency-review/src/workflowProviderRegistration.ts`
- Modify: `extensions/bob-code-consistency-review/test/workflowProviderRegistration.test.js`

- [x] hard dependencyを固定する既存テストを、soft dependencyと遅延登録の期待値へ変更する。
- [x] PR上でテスト失敗を確認する。
- [x] `extensionDependencies`を削除し、`onDidChange`と限定retryを持つ登録controllerを実装する。
- [x] 登録済み状態、timer、listenerをdisposeできるようにする。
- [x] API generation、stale/late completion、部分登録rollbackをテストする。
- [ ] 最新headで対象テストとモジュール全体テストを再実行する。

### Task 2: Provider Ownership, Duplicate Rejection, and Disposal

**Files:**
- Modify: `extensions/workflow-register/src/core/actionTypes.ts`
- Modify: `extensions/workflow-register/src/core/actionRegistry.ts`
- Modify: `extensions/workflow-register/src/workflowRegisterService.ts`
- Modify: `extensions/workflow-register/src/extension.ts`
- Modify: `extensions/workflow-register/test/actionRegistry.test.js`
- Modify: companion extension provider registration tests and implementations

- [x] 同一provider IDの上書きを再現する失敗テストを追加する。
- [x] `ActionProvider.sourceId`と登録解除用DisposableをAPIへ追加する。
- [x] 異なる所有元による重複登録を拒否する。
- [x] service dispose時にcustom providerを解除する。
- [x] BBR/CCR登録側で`sourceId`を付与し、返却Disposableを保持する。
- [x] 登録に実際に使用したAPI objectをgeneration identityとして保持する。

### Task 3: External Process Timeout, Cancellation, and Kill

**Files:**
- Create: `extensions/bob-bazaar-review/src/bazaar/externalProcessRunner.ts`
- Modify: `extensions/bob-bazaar-review/src/bazaar/bazaar.ts`
- Create: `extensions/bob-code-consistency-review/src/core/externalProcessRunner.ts`
- Modify: `extensions/bob-code-consistency-review/src/core/gitDiffCollector.ts`
- Add/modify focused process tests in both extensions

- [x] timeout、cancel、buffer overflowを再現する失敗テストを追加する。
- [x] error kindを`timeout`、`cancelled`、`bufferExceeded`、`spawnFailure`、`nonZeroExit`へ分類する。
- [x] `AbortSignal`とhard timeoutをchild processへ接続する。
- [x] Windowsを含むchild process terminationを実装する。
- [x] raw `execFile`呼び出しをrunner経由へ置換する。
- [x] preflight-to-listenerのcancel競合を閉じる。
- [x] Git revision validationでは`nonZeroExit`だけを不正revisionへ正規化し、cancel/timeout等を保持する。

### Task 4: Windows Path Validation and Processing Limit Clamps

**Files:**
- Modify: `extensions/bob-bazaar-review/src/bazaar/bazaar.ts`
- Modify: `extensions/bob-bazaar-review/test/bazaarClient.test.js`
- Modify: `extensions/bob-code-consistency-review/package.json`
- Modify: `extensions/bob-code-consistency-review/src/core/limits.ts`
- Modify: size-limit tests

- [x] Windows drive、UNC、device pathが現在通過する失敗テストを追加する。
- [x] POSIX/Windows絶対path、drive-relative、`.`、`..`、制御文字を拒否する。
- [x] 全size設定にmanifest/runtime共通のmin/max clampを追加する。
- [x] 個別上限に加えて最終Bob入力全体を`maxBobInputBytes`で制限し、UTF-8 suffix込みのbyte上限を検証する。

### Task 5: Provider-aware Workflow Contract CI

**Files:**
- Modify: `extensions/workflow-register/test/workflowContractFiles.test.js`
- Modify: `.github/workflows/workflow-contracts.yml`
- Create provider contract catalog modules where needed

- [x] 固定配列外のworkflowと未知providerが通過する失敗テストを追加する。
- [x] 対象`WORKFLOW.md`を再帰探索する。
- [x] action provider、preflight、nested `vscode.executeCommand` command IDをcatalogと照合する。
- [x] templateとworkspace mirrorのdriftを検出する。
- [x] sample固有の外部commandは、正確なfile pathとguardrail宣言の両方を満たす場合だけallowlistする。
- [ ] 最新headで全workflow strict/provider-aware contract testを再実行する。

### Task 6: Windows/Extension Host Quality Gate and Documentation Sync

**Files:**
- Modify: `.github/workflows/extensions-quality.yml`
- Modify: three extensions' basic design, detailed design, unit test, real-machine test documents
- Modify: `docs/review-findings-tracking.md`

- [x] Windows matrixとExtension Host smokeを追加する。
- [x] soft dependency、provider lifecycle、timeout、path、limit、contract CIを文書へ反映する。
- [x] verification項目をtrackingへ記録する。
- [x] 外部GitHub Actionsをfull commit SHAへ固定する。
- [x] 一時的な`agent-*` workflowとpatch scriptを削除する。
- [ ] release evidenceへ最新headのCI／実機結果を記録する。

### Final Verification

- [ ] `workflow-register`: dependency, architecture, source, schema, unit, package, package policy
- [ ] `bob-bazaar-review`: dependency, architecture, source, unused, artifact, unit, package, package policy
- [ ] `bob-code-consistency-review`: dependency, architecture, source, unit, package, package policy
- [ ] 全workflow strict/provider-aware contract test
- [ ] Windows/Ubuntu CI
- [ ] VS Code Extension Host activation smoke
- [ ] IBM Bob実環境のworkflow source、provider recovery、step review、result handoff、Webview smoke
- [ ] 実Bazaar環境のtimeout/cancel後のchild process残留確認
- [ ] multi-rootでBob rootとVCS rootの分離確認
- [x] draft PRのcheck結果と未解決事項を報告する
