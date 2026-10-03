# WF2 P4 Completion Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完了済み `WF2-P4-COMPILER` の実受入をclosed completion registryへ加算し、P5の前提を表示する。

**Architecture:** 既存Wave 0A/Bのcanonical recordとprefix replayを保持する。P4の実source/main/CI/review/保全/cleanupだけを新recordへ結合し、既存registryへ一件追加する。public function signatureとstatic Program/selection ledgerを変更しない。

**Tech Stack:** Node.js 22 ES modules、node:test、canonical JSON/SHA-256、read-only Git/GitHub Actions API。

**Spec:** `docs/superpowers/specs/2026-08-23-feature-selection-and-sequential-main-integration-design.md` §6.3・§8・§11–12（technical-only）、`docs/superpowers/specs/2026-08-31-wave0a-risk-tiered-approval-and-evidence-design.md`、P4 compiler plan Integration and Handoff、既存Wave 0B completion recovery方式。

## Global Constraints

- 実装head `9b196dad6b5f593dbb99846717463d906d057c7f`、統合main `925c50f10e114ac5613135dab7b7439ab3dba0de`、tree `f36dee5bb1ecb8f4aa7d113d68eb64f6ccccf674`、PR #178。
- 今回のexecution baseは統合main925c50f1。native managed worktree `C:/Users/stell/.codex/worktrees/v2-p4-completion/bob_builtin_analyze`、branch `codex/v2-p4-completion`。
- 対象は完了済みP4のhistorical recovery import。今回のpublicationの未来head/merge/cleanupをrecordへ書かない。
- `ONE_ACTIVE_SLICE`、`ONE_CONTINUOUS_SLICE_WORKSPACE`、`automaticCleanup=false`、`mutationAuthority=false`。
- 保全元 `C:/Users/stell/source/repos/bob_builtin_analyze/.superpowers/preservation/wf2-p4-925c50f1` はread-only。351-file manifestと全コピーhashを再照合する。
- Wave 0A/B records、static ledger/Program/source universe、製品source/API/schema、native recovery refs、primary user dataを変更しない。
- P4だけをVERIFIEDへ投影する。WORKFLOW-B-GATE-Pはplanned、P5以降はplanned/inactive。P5計画/実装、runtime activationは対象外。
- 承認capture、request hash、claim/receipt、provider transcript、旧bootstrapを保存・実行しない。
- local作業はtest/review/local commitまで。push/PR/main統合と今回workspaceのcleanupは具体的C対象を提示してから実施する。

## Review Focus

1. P4だけ、Wave 0A/P4、B/P4、逆順、duplicate、sparseの入力でpredecessorを飛ばさない。
2. 39 raw checkout proofのactual/expected SHA・nonce・byte hashを両phaseのrun/jobへ一意に結合する。失敗した旧head9325のCIを成功証跡に読み替えない。
3. P4のslice completionがWORKFLOW-B-GATE-PやP5以降を昇格させない。
4. 本recovery publicationのhead/受入、caller-supplied future references、tampered external digestsを受け入れない。
5. 既存A/Bの歴史replayとcanonical generatorを保つ。保全artifact/package bytesを上書きせず、local VSIXとhosted package-policy evidenceを区別する。

## File Map

- Create `docs/release-evidence/wf2-p4-completion-2026-10-04.json`: actual P4完了のcanonical observation。
- Modify `tools/main-consolidation/featureIntegrationStatusPolicy.mjs`: reviewed P4 record/evidence/reference digestの加算のみ。
- Modify `tools/main-consolidation/create-feature-integration-status.mjs`: canonical P4入力の追加。
- Modify `tools/main-consolidation/test/featureIntegrationStatusPolicy.test.mjs`: P4 positive、prefix/tamper/future拒否、generator byte drift。
- Modify `docs/release-evidence/feature-integration-status.json`: P4 VERIFIED / P5 next projection。
- Modify `docs/superpowers/plans/2026-10-03-wf2-p4-compiler.md`: historical local statusを保持し、新completion記録へ案内。
- Create this plan: task scope/検証/実行判断。

### Task 1: Register Actual P4 Completion

**Interfaces:** `validateCompletionObservation(record,{programIndex,evidenceDigests})`、`projectIntegrationStatus({programIndex,ledger,completionObservations})`、`deriveNextSlice({programIndex,statusProjection})`、`renderIntegrationStatus(inputs)` を維持。collectionは既存prefixと `[Wave0A,Wave0B,P4]` のみ。

- [x] **Step 1: Bind actual evidence.** 全351保全files、control metadata、CI両phase/run/job/raw checkout、レビュー、merge parents/tree、12 main package-policy outputs、3 retained VSIX、remote exact-lease deletion/native archive/local deletion/main-onlyをread-only照合。canonical P4 recordを作る。
- [x] **Step 2: RED.** P4 recoveryを受理しP5だけをderiveする回帰testを追加。prefix omission/order/duplicates/sparse、tamper、Gate P/P5 future promotion、generator P4 input byte driftを検証。`node --test tools/main-consolidation/test/featureIntegrationStatusPolicy.test.mjs` が未登録P4で失敗することを確認。
- [x] **Step 3: GREEN.** closed registryへP4一件、generatorへP4入力一件を追加。generator `--print` でstatusを更新。既存A/B replayを保つ。
- [x] **Step 4: Verify.** Status/Program/Campaign/Risk/Legacy/Source/Ledger policy suites、四generator `--check`、`git diff --check`、製品runtime/static inputs差分0を確認。詳細ログはowned ignored scratchに保持。
- [ ] **Step 5: Review and local commit.** exact branch diffとexternal bindingを独立review。Critical/Importantを修正、検証してowned七filesだけをlocal commit。P4 planへ完了記録を案内する。

## Pre-flight

Taskは一つ。record/evidence digest → registry pin → canonical projection → deriveNextSliceを一つの受入として扱う。既存 `reference.boundaryId` fieldへslice ID `WF2-P4-COMPILER` を入れることでAPIを維持し、境界WORKFLOW-B-GATE-Pを別IDのままplannedに保つ。

## Local Verification — 2026-10-04

P4 recordは82 external bindingsを保持し、351-file snapshot全件、39 raw checkout proofs、candidate/main 12 actual CI runs、native recovery/ref deletionをread-only照合した。focused status suiteはRED 11 pass / 3 failからGREEN 14/14。関連七policy suitesは682/682、skip/failure 0。四generatorの `--check` と `git diff --check` が成功。製品runtime/static Program/ledger/source universe差分0。完了登録のpublic/main反映、P5 authoring、現在workspaceのcleanupは未実施。独立branch reviewはlocal候補固定後に実施し、その結果をowned ledgerへ記録する。
