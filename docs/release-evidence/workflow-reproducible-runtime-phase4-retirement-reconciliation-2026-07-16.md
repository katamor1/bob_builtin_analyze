# Workflow Reproducible Runtime Phase 4 retirement reconciliation

- Date: 2026-07-16
- Historical evidence: `docs/release-evidence/workflow-reproducible-runtime-phase4-2026-07-12.md`
- Precursor branch: `agent/workflow-reproducible-runtime-phase4-20260712`
- Audited precursor head: `38d62885a8b7249b1f2d3853f31a0abc999ca160`
- Diagnostic branch: `diagnostic/phase4-windows-20260712`
- Audited diagnostic head: `5db1f71676736add1a7d45d199c707f57291bfe2`
- Durable replacement: PR #77
- PR #77 merge commit: `57ff053bc3f476e3e9d268a743f25edeb0d68356`

## Final reconciliation

The historical Phase 4 evidence correctly preserves the point-in-time NO-GO state before the complete hardening gate. PR #77 subsequently merged the journal ancestry, read-only diagnostic, control contract, path/lock, and Windows fixture hardening to `main` and records successful Linux and Windows unit, policy, package, VSIX, and Extension Host gates.

The precursor branch therefore has disposition `superseded`. The Windows branch was used to diagnose and apply fixes to PR #77; its patches and one-shot workflows are not product deliverables and have disposition `diagnostic-only`.

## Current-main evidence

- `extensions/workflow-register/src/core/runtime/runStateJournal.ts`
- `extensions/workflow-register/src/core/runtime/runStateStore.ts`
- `extensions/workflow-register/src/core/runtime/runLock.ts`
- `extensions/workflow-register/test/workflowRunJournal.test.js`
- `docs/release-evidence/workflow-reproducible-runtime-phase4-2026-07-12.md`

## Temporary paths confirmed absent

- `.github/phase4-windows-fix.patch`
- `.github/workflows/phase4-windows-diagnostic.yml`
- `.github/workflows/phase4-review-merge-pr77.yml`

## Retirement status

No unique product change was identified outside PR #77. Remote deletion is nevertheless blocked until fresh branch-protection enumeration, execution-branch hosted checks, and independent deletion authorization are complete.
