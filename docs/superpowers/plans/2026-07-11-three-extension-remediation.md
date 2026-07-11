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

---

### Task 1: Code Consistency Soft Dependency and Retry Registration

**Files:**
- Modify: `extensions/bob-code-consistency-review/package.json`
- Modify: `extensions/bob-code-consistency-review/src/extension.ts`
- Modify: `extensions/bob-code-consistency-review/src/workflowProviderRegistration.ts`
- Modify: `extensions/bob-code-consistency-review/test/workflowProviderRegistration.test.js`

- [ ] hard dependencyを固定する既存テストを、soft dependencyと遅延登録の期待値へ変更する。
- [ ] PR上でテスト失敗を確認する。
- [ ] `extensionDependencies`を削除し、`onDidChange`と限定retryを持つ登録controllerを実装する。
- [ ] 登録済み状態、timer、listenerをdisposeできるようにする。
- [ ] 対象テストとモジュール全体テストを通す。

### Task 2: Provider Ownership, Duplicate Rejection, and Disposal

**Files:**
- Modify: `extensions/workflow-register/src/core/actionTypes.ts`
- Modify: `extensions/workflow-register/src/core/actionRegistry.ts`
- Modify: `extensions/workflow-register/src/workflowRegisterService.ts`
- Modify: `extensions/workflow-register/src/extension.ts`
- Modify: `extensions/workflow-register/test/actionRegistry.test.js`
- Modify: companion extension provider registration tests and implementations

- [ ] 同一provider IDの上書きを再現する失敗テストを追加する。
- [ ] `ActionProvider.sourceId`と登録解除用DisposableをAPIへ追加する。
- [ ] 異なる所有元による重複登録を拒否する。
- [ ] service dispose時にcustom providerを解除する。
- [ ] BBR/CCR登録側で`sourceId`を付与し、返却Disposableを保持する。

### Task 3: External Process Timeout, Cancellation, and Kill

**Files:**
- Create: `extensions/bob-bazaar-review/src/bazaar/externalProcessRunner.ts`
- Modify: `extensions/bob-bazaar-review/src/bazaar/bazaar.ts`
- Create: `extensions/bob-code-consistency-review/src/core/externalProcessRunner.ts`
- Modify: `extensions/bob-code-consistency-review/src/core/gitDiffCollector.ts`
- Add/modify focused process tests in both extensions

- [ ] timeout、cancel、buffer overflowを再現する失敗テストを追加する。
- [ ] error kindを`timeout`、`cancelled`、`bufferExceeded`、`spawnFailure`、`nonZeroExit`へ分類する。
- [ ] `AbortSignal`とhard timeoutをchild processへ接続する。
- [ ] Windowsを含むchild process terminationを実装する。
- [ ] raw `execFile`呼び出しをrunner経由へ置換する。

### Task 4: Windows Path Validation and Processing Limit Clamps

**Files:**
- Modify: `extensions/bob-bazaar-review/src/bazaar/bazaar.ts`
- Modify: `extensions/bob-bazaar-review/test/bazaarClient.test.js`
- Modify: `extensions/bob-code-consistency-review/package.json`
- Modify: `extensions/bob-code-consistency-review/src/core/limits.ts`
- Modify: size-limit tests

- [ ] Windows drive、UNC、device pathが現在通過する失敗テストを追加する。
- [ ] POSIX/Windows絶対path、drive-relative、`.`、`..`、制御文字を拒否する。
- [ ] 全size設定にmanifest/runtime共通のmin/max clampを追加する。
- [ ] 個別上限に加えて総量budgetを検証する。

### Task 5: Provider-aware Workflow Contract CI

**Files:**
- Modify: `extensions/workflow-register/test/workflowContractFiles.test.js`
- Modify: `.github/workflows/workflow-contracts.yml`
- Create provider contract catalog modules where needed

- [ ] 固定配列外のworkflowと未知providerが通過する失敗テストを追加する。
- [ ] 対象`WORKFLOW.md`を再帰探索する。
- [ ] action provider、preflight、nested `vscode.executeCommand` command IDをcatalogと照合する。
- [ ] templateとworkspace mirrorのdriftを検出する。

### Task 6: Windows/Extension Host Quality Gate and Documentation Sync

**Files:**
- Modify: `.github/workflows/extensions-quality.yml`
- Modify: three extensions' basic design, detailed design, unit test, real-machine test documents
- Modify: `docs/review-findings-tracking.md`

- [ ] Windows matrixとExtension Host smokeを追加する。
- [ ] soft dependency、provider lifecycle、timeout、path、limit、contract CIを文書へ反映する。
- [ ] verification commandsとcommit SHAをtrackingへ記録する。
- [ ] 外部GitHub Actionsをfull commit SHAへ固定する。

### Final Verification

- [ ] `workflow-register`: dependency, architecture, source, schema, unit, package, package policy
- [ ] `bob-bazaar-review`: dependency, architecture, source, unused, artifact, unit, package, package policy
- [ ] `bob-code-consistency-review`: dependency, architecture, source, unit, package, package policy
- [ ] 全workflow strict/provider-aware contract test
- [ ] Windows/Ubuntu CI
- [ ] draft PRのcheck結果と未解決事項を報告する
