# P6 completion recovery import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Import the observed P6 shadow completion as an exact historical record, then derive P7 as the next planned slice without execution authority.

**Architecture:** Add one immutable completion/evidence digest pair to the existing closed registry and one generator input. Existing prefix ordering, tamper rejection and inactive activation projection stay unchanged.

**Tech Stack:** Node built-ins, ES modules, node:test, Git canonical checkout.

**Spec:** `.superpowers/sdd/2026-10-08-wf2-p6-completion-import/2026-10-08-wf2-p6-completion-import-proposal.json` (approved proposal retained outside tracked files).

## Global Constraints

- Base main: c5f9fcff29a787cc4f02140800556257bf05c547; tree: 125635f64accbd7febe0ab58836d96ac7608798b.
- Historical source H: 1e9e785a34927416e1bc1ad78511ca905d9b0b26; PR 182 is merged.
- Canonical P6 record SHA-256: 0a8f01068b306f387e3e72d185024ab5ab0ce4f04f68b8afe3a4471956937399.
- Actual evidence digest registry SHA-256: b7eeb8bd743cb085bceed6226dc92baf0557bdc6345391bcff30732a64e608a5.
- Only the seven proposal-owned tracked paths may change. Preserve previous completion bytes, static program/selection/source universe and all three extension trees.
- Product runtime/provider dispatch stays inactive; maximum activation shadow. P7 remains planned and this projection grants no action permission.
- Primary main stays unchanged; no push, PR, hosted CI dispatch, main integration or cleanup in this local scope.
- Retain technical/TMP evidence and this worktree through separately approved publication/preservation/cleanup.

## Review Focus

- Provenance: exact CI checkout/nonce proof, installed UAT limits, preservation and native snapshot/ref absence must remain bound to the historical M2/H identities.
- Authority: a historical completion must not authorize P7, runtime activation, Gate P or arbitrary fields.
- Prefix: prior completions and sparse/missing/reordered/duplicate inputs must preserve closed admission.
- Fresh checkout: LF bytes must survive core.autocrlf=true, and the generator must consume the new input rather than silently omit it.
- Scope: no extension/static-source changes and no rewriting prior failed observations or review heads.

## Task 1: Add the pinned historical P6 import

**Files:** `.gitattributes`; `docs/release-evidence/wf2-p6-completion-2026-10-08.json`; `docs/release-evidence/feature-integration-status.json`; `tools/main-consolidation/featureIntegrationStatusPolicy.mjs`; `tools/main-consolidation/create-feature-integration-status.mjs`; `tools/main-consolidation/test/featureIntegrationStatusPolicy.test.mjs`; this plan.

**Interfaces:** Consumes canonical completion bytes and independently read external evidence digests. Produces the unchanged validateCompletionObservation/projectIntegrationStatus/deriveNextSlice contracts with a fifth exact registered prefix member; generator --print/--check; nextSliceId WF2-P7-MANIFEST.

- [x] Step 1: Verify 1,924 actual external hashes, primary/remote M2/T, native H snapshot and absent new target. Create the authorized managed worktree/local branch and owned technical/TMP markers.
- [x] Step 2: Run existing status-policy suite and generator --check; require a clean baseline.
- [x] Step 3: Copy the exact canonical record as test input and stage that input for checkout tests. Add P6 acceptance, tamper/authority/premature promotion, prefix ordering, generator inclusion/byte drift and autocrlf checkout tests.
- [x] Step 4: Run new tests before production changes. Expected RED: unregistered P6, omitted generator input and CRLF byte mismatch.
- [x] Step 5: Append one exact registry entry, one generator input and one exact LF rule; generate the status projection. No validator or admission algorithm changes.
- [x] Step 6: Run complete status-policy suite, status generator --check and static generators; compare scope, previous completion bytes and all extension tree identities to base.
- [x] Step 7: Stage an immutable review tree, generate its diff/provenance package, and perform one focused read-only metadata review. Fix material findings with targeted verification; retain the original review.
- [ ] Step 8: Mark observed steps, commit only the seven owned paths, and verify committed source/record/projection identities plus unchanged primary status.
- [ ] Step 9: Prepare a concrete exact-head publication/integration proposal, retain branch/worktree, and report local P6 VERIFIED/P7 planned separately from primary P6/P7 planned.

Expected validation commands: `node --test tools/main-consolidation/test/featureIntegrationStatusPolicy.test.mjs`; `node tools/main-consolidation/create-feature-integration-status.mjs --check`; reviewed static generators --check; `git diff --check` and base-to-candidate scope/tree checks. Child TMP/TEMP use task-marked `.t` only.
