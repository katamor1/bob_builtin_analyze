# CI baseline evidence reconciliation (2026-07-16)

**Source PR:** #135 `docs: record CI baseline evidence`  
**Source head:** `e00da243646b7dc0265df66c11e90b62a53ae183`

PR #135 recorded a detailed CI baseline against the then-current `main` (`f4f9d3308361333e02ab1af732706b7a9e5fc952`). Subsequent integrations updated the shared tracking table and remediation plan, so replacing those canonical files would discard newer evidence.

The source documents are therefore retained byte-for-byte as dated snapshots:

- `ci-baseline-review-findings-snapshot-2026-07-16.md`
- `ci-baseline-remediation-plan-snapshot-2026-07-16.md`

The snapshots preserve the billing/spending-limit classification, actionlint result, hosted Ubuntu/Windows runs, local test and package evidence, environment versions, VSIX digests, and the 2026-07-16 IBM Bob operator attestation. Later `main` evidence remains canonical where the records differ.

Real Bazaar descendant-process verification, multi-root UAT, signing/distribution, and upgrade/rollback remain separate release gates unless superseded by newer evidence.
