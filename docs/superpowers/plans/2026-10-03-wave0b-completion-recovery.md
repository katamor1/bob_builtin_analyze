# Wave 0B Completion Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 実際に統合・CI・cleanupを完了したWave 0Bの証跡を、既存のclosed recovery registryへ加算し、P4の前提を表示する。

**Architecture:** 既存Wave 0A recordを保持し、Wave 0Bの外部完了記録・CI snapshot/raw log・保全manifest・native archive/ref deletion readbackをcanonical recordに結合する。registryはreview対象の二つのrecord digestとevidence digestだけを受理し、順序付きprefixからstatusを生成する。既存の公開関数signatureは変えない。

**Tech Stack:** Node.js ES modules、node:test、canonicalJson/SHA-256、read-only Git plumbing。

**Spec:** `docs/superpowers/specs/2026-08-23-feature-selection-and-sequential-main-integration-design.md` §6.3・§8・§11、`docs/superpowers/specs/2026-08-31-wave0a-risk-tiered-approval-and-evidence-design.md`、既存Wave 0B plan Task 3のadditive reviewed completion registry。

## Global Constraints

- source Wave 0B: `ccd9cd3c6ecf2fcf8c4b82e19fe15836d053aa5e`、accepted main: `b8876b2714d74bd8bbe686b66d17f2f76467f041`、tree: `eea7c107b9cae833b758646d4082ee94e6e7d78a`、PR #176。
- 対象は完了した先行sliceのhistorical recovery import。今回のpublication自身の未来head/merge/cleanupをrecordに含めない。
- `ONE_ACTIVE_SLICE`、`ONE_CONTINUOUS_SLICE_WORKSPACE`、`automaticCleanup=false`、`mutationAuthority=false`。
- static selection ledger/source universe/Programを変更しない。製品runtime、API、保存schema、provider dispatchを変更しない。
- Wave 0A recordを上書きしない。Wave 0B証跡も既存保全copyを編集しない。承認本文、request hash、claim/receipt、provider transcript、旧bootstrapを保存・実行しない。
- このlocal作業はregistry反映とP4計画のreview対象を作る。P4実装、push/PR/main更新、今回workspaceのcleanupは別の具体的対象とする。

## Review Focus

1. Wave 0Bだけの入力や順序逆転がWave 0A predecessorを省略してP4をadmitしない。
2. raw checkout logのexpected/actual SHA、nonce、byte count、digestの不一致を完成recordへ取り込まない。
3. Wave 0Aだけのhistorical replayを維持し、現mainや未来のP4受入を捏造しない。
4. duplicate completion、caller-supplied future reference、外部evidenceの改変をregistryが拒否する。
5. P4以降、conditional R3–R5、Gate P、product runtimeをactive/VERIFIEDへ昇格しない。

## File Map

| File | Responsibility |
| --- | --- |
| `docs/release-evidence/wave0b-completion-2026-10-03.json` | PR #176の完了証跡をcanonical digestへ結合 |
| `tools/main-consolidation/featureIntegrationStatusPolicy.mjs` | Wave 0A/Wave 0Bだけのclosed registryとprefix replay |
| `tools/main-consolidation/create-feature-integration-status.mjs` | 二つのrecordのcanonical bytesを読み、statusを生成・check |
| `docs/release-evidence/feature-integration-status.json` | Wave 0B VERIFIED、P4 next、将来slice inactiveのprojection |
| `tools/main-consolidation/test/featureIntegrationStatusPolicy.test.mjs` | 前提省略・順序・tamper・将来昇格のregression tests |
| `docs/superpowers/plans/2026-10-03-wf2-p4-compiler.md` | P4のlocal実装計画。実装は未着手 |

### Task 1: Add Reviewed Wave 0B Recovery and Prepare P4

**Interfaces:** 既存の `validateCompletionObservation(record, {programIndex,evidenceDigests})`、`projectIntegrationStatus({programIndex,ledger,completionObservations})`、`deriveNextSlice({programIndex,statusProjection})`、`renderIntegrationStatus(inputs)` を維持する。受理するcollectionは `[]`、`[Wave0A]`、`[Wave0A,Wave0B]` の三つだけ。

- [x] **Step 1: Bind actual external bytes.** 外部完了JSON、preservation manifestの4,160 file hashes、42 post-merge evidence bindings、24 raw checkout markers、8 nonce、native archive snapshot、exact source ref deletionと保持例外の証跡を読み取り検証し、canonical Wave 0B recordへ保存する。
- [x] **Step 2: Write and run RED.** `replays_verified_wave0b_and_admits_p4_only` はaccepted main b8876b27、Wave 0A/B VERIFIED、next `WF2-P4-COMPILER`、後続19 slices planned/inactiveをassertする。`rejects_nonprefix_or_duplicate_completions` はBだけ・B/A・A/A・A/B/Bをrejectする。`rejects_wave0b_evidence_tamper_and_future_promotion` はmain/CI/evidence digest/未完了P4/reference改変をrejectする。generatorのB byte driftもrejectする。
- [x] **Step 3: Add only the registered completion.** 二つのrecord/evidence/reference digestをclosed registryへ固定し、prefix検証とVERIFIED IDだけのprojectionを加える。callerからregistryやdescriptorを注入させない。
- [x] **Step 4: Generate and verify.** focused status tests、関連Program/Campaign/Risk/Legacy/Source/Ledger policy tests、Program/source/ledger/status各generator `--check`、`git diff --check`、runtime source diff0を確認。長いログは専用ignored scratchに保存する。
- [x] **Step 5: Prepare P4 plan.** 既存P4 spec/plan、現行foundation、reviewed source itemsを調査し、正確なfiles/interfaces/testsとP5/P6/P7の除外を明記。P4 codeは書かない。
- [x] **Step 6: Review and commit.** exact local候補の独立reviewを受け、Critical/Importantを解消。今回owned filesだけをlocal commitし、review可能なhead・plan・検証結果を報告する。

## Execution Scope

execution baseは実main `b8876b27`。native managed worktree `C:/Users/stell/.codex/worktrees/v2-wave0b-recovery/bob_builtin_analyze`、local branch `codex/v2-wave0b-recovery`、test-owned scratch `.superpowers/sdd/2026-10-03-wave0b-completion-recovery/fixtures`。元mainのuser dataは編集しない。

## Local Execution Notes — 2026-10-03

Wave 0B recordは51 external bindings、4,160保全payload、24 raw checkout markers、8 nonceを実byteへ結合した。最終関連policy suiteは687/687、fail/cancelled/skipped/todoはすべて0。status focused testsは11/11、四つのgenerator checksとruntime/CI source diff0を確認した。Windows checkoutでもcanonical recordのLFを維持する属性を追加した。

独立reviewはCritical 0 / Important 0 / Minor 0。Wave 0Aだけのhistorical projectionは旧statusとbyte一致し、Wave 0A/Bのprefixではnext P4、後続19 sliceはplanned/inactiveとなる。P4計画は27 target paths・30 source itemsを既存spec/ledger/現行foundationへ照合して保存した。checkboxはlocal作業だけを表し、今回publicationの公開・main統合・cleanupやP4実装を完了扱いにしない。
