# Japanese GUI integration evidence

**Date:** 2026-07-17  
**Pull request:** #132  
**Integration source head before evidence commit:** `40c15a02b62a9959c9bd3ebca4ddf44ab4555c7f`

## Integrated scope

- `workflow-register`, `bob-bazaar-review`, and `bob-code-consistency-review` user-facing GUI copy is Japanese-first.
- Command IDs, configuration keys, Webview message values, saved enum values, JSON/YAML keys, schemas, CSP nonce handling, escaping, and path boundaries remain stable.
- The Review Wizard keeps the current-main `.bob` workspace-initialization card and model-backed status while localizing the surrounding surface.
- The workflow-register task-snapshot configuration retains `maxBytes.maximum = 1048576` and `maxPerRun.maximum = 500` from the runtime-blocker remediation.

## Patch queue recovery

The original split payload contained one extra reviewed byte at the end of `part01b`. The integration removed only that byte after verifying its exact location and value, then verified the decoded patch SHA-256 values before applying the series:

- Bazaar GUI: `6c7c6abf2a48678588be49107b7d3c997375ce713f654a761ff70fa3299a1c5d`
- Bazaar terminology/docs: `ae757b1157dbeec862b7222f05bd04529d0b814f719e1ffdd3f4c20bd62eb0a5`
- Consistency-review GUI: `65b6626ca2a8ac66f62d2ceebc62c05d5126f47f968e8443c3fb449345db2950`
- Consistency-review terminology/docs: `e63ae3ef08f07668ccaaf39a8b5a2158eb42498d56aa6e9544dd5094afa680e3`

The only current-main conflict was `consistencyReviewWizardHtml.ts`; it was resolved by combining the Japanese heading and labels with the workspace-initialization card and model-backed status. The temporary SDD workflows and encoded patch payloads were removed in the same successful cleanup commit.

## Validation

A repository-owner commit records this evidence and triggers the normal pull-request workflows after the preceding GitHub Actions bot push was held as `action_required` with no jobs. Final CI results are recorded in the PR before merge.
