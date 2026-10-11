# Gate R inventory and bootstrap design

## Intent and authority

Implement the approved Gate R composite as read-only repository tooling. Its consumers are migration reviewers and Ubuntu/Windows verification jobs. Success means a complete, independently audited archive classification, a separately validated active manifest, and an honest inventory-only bootstrap result. Runtime activation, archive execution, archive payload import, R1/R2 implementation and R3–R6 integration are excluded.

Authority: docs/superpowers/specs/2026-08-23-feature-selection-and-sequential-main-integration-design.md §12.2 and the approved docs/superpowers/plans/2026-10-11-wf2-gate-r-inventory-and-implementation.md. Baseline main 268c83128c3d58a0c226bfa1a969c731fcb298e5, tree 72e737e71c94e4ac8be09f40dfab4b76bad6f5a0. P7 and WORKFLOW-B-GATE-P are VERIFIED. Runtime capabilities WF2-R1-PROVENANCE / WF2-R2-INVOKE remain planned. This spec is committed and independently reviewed before implementation body inspection; preliminary Git tree identities and the existing source-universe metadata are permitted design inputs.

## Chosen boundary

Use a sealed committed source catalog and an independently captured live archive audit. Hosted clones validate that exact catalog and deterministic derivatives; they do not claim to have read the external archive. A live Git audit on the local trusted objects records the archive manifests/carrier, endpoints, every changed historical path, and all family origin blobs before the catalog is sealed. An endpoint-only inventory would miss transported/deleted families; a live-only runner would fail on hosted clones. The two evidence layers remain distinct.

Place implementation in tools/main-consolidation/gateRPolicy.mjs, create-gate-r-inventory.mjs, run-gate-r.mjs, gate-r-archive-source-catalog.json, gate-r-archive-inventory.json, gate-r-active-suite.json and test/gateRPolicy.test.mjs. Add docs/release-evidence/schemas/workflow-gate-r-archive-inventory.schema.json and workflow-gate-r-active-suite.schema.json plus extensions/workflow-register/test/workflowContractV2GateR.test.js. Per-file LF attributes for these canonical JSONs are permitted. No dependency, product source, package/lock, shipped resource or existing test changes.

## Immutable provenance

Source universe SHA256 c69adc6b82d1d6d40719e10c116e985890f17d45ee4b99e0feabe76b00d08c79 is the family/owner authority, not the path-completeness authority. Workflow C starts e860d1ebbafe7068fc6871b16c9586a11b4fe19d and ends a18c09b10fa51702d312e34940a694ad971a48cc, endpoint tree 1c37b277ffa2047041c4473c56c112edc9ae98e5. The carrier workflow-c.patch is 589835 bytes, SHA256 2852e9e0e535bbb63165ae01538dd271bd888afe0b7f7dcbca53d193ef24912f; metadata reports 217 commits and 91 net carrier paths. Actual commit/path sets must be captured from Git and checked against the carrier rather than treating 91 as all historical paths.

Archive manifests: 2026-08-21-main-consolidation / 36e477ee9b752ebf7f07a208c166fec24e14a89bf7ba6a7921cf6bdf708c9f31; 2026-08-22-local-worktree-cleanup / ad742f4dbd2112c5674da2e3e0ee2046645849e4b3bf3674596df3b868c8bdff; 2026-08-22-remote-main-unification / bcdb61aad397ef4c6463eaa789d5d278b9d1bcad34015bc472c1dfc97773e476. All referenced archive artifact digests from their manifests and the source-universe trust chain are independently rehashed. If objects are unavailable, fetch only into an absent task-owned bare object store under primary ignored evidence storage, never into an archive or managed worktree.

Catalog top-level fields are closed: schemaVersion, authority, archive, sourceUniverseSha256, commits, endpointPaths, rangePaths, families, baseline. authority is the literal archive_read_only, schemaVersion workflow-gate-r-source-catalog/v1. archive carries fromSha, toSha, treeSha, carrierSha256 and the three manifest digests. commits is a sorted unique full SHA list. endpointPaths enumerates the entire endpoint tree (path, mode, blobSha); rangePaths enumerates the union of paths changed in every range commit and net endpoint diff, recording predecessor/endpoint blobs (or null), sorted unique historical blob identities with byteSize/SHA256 and classification. No content is embedded. A historical identity includes commitSha, path, blobSha; deletion and rename are explicit through their old/new paths and null endpoints.

Each family has sourceItemId, owner, kind, family, path, symbols, origins. origins retain the declared owner-stage commit/path/blob and independently measured byteSize/SHA256, even if the endpoint blob changed. Include every source-universe item whose primaryOwner is one of the six WF2-R owners; test_family subsets must total R1=8, R2=7, R3=4, R4=8, R5=11, R6=12. The unique key is sourceItemId, not filename: ExecutionBoundary and ProviderInvocationTestSupport deliberately carry different families at different stage blobs. Every source/test path introduced or changed in Workflow C must have explicit owner-family membership or a documented predecessor/non-runtime classification derived from source-universe metadata and before/after blobs. Unclassified/unknown paths stop admission. Non-source transport/docs/policy and unchanged endpoint material are explicitly classified and retained; they do not acquire runtime ownership.

The completed live audit and classification decisions are external evidence. Catalog SHA256 is then a literal trusted constant in gateRPolicy, paired with source-universe SHA256 and archive endpoint identities. User input cannot nominate or replace the trusted catalog digest. A catalog edit requires explicit reviewed migration work, never self-registration.

## Inventory contract

Closed top-level fields: schemaVersion, authority, catalogSha256, archive, paths, families, absentLegacyTests. schemaVersion workflow-gate-r-archive-inventory/v1; authority archive_read_only. paths is the complete catalog rangePaths classification projection, families is every catalog family projection with provenance, no extras/omissions. The validator computes the expected projection from a validated sealed catalog and compares exact canonical bytes; the independently captured Git audit is the authenticity evidence. Each family carries policyState: R1/R2 expected_inactive_planned, R3/R4/R5 expected_inactive_conditional, R6 expected_absent_rejected. Presence in archive is never presence in main.

absentLegacyTests is exactly the two repository paths for workflowContractV2Runtime.test.js and workflowContractV2BobRuntime.test.js; independent endpoint audit proves both absent. Neither filename is an executable Gate R target.

Canonical JSON uses recursively code-point-sorted object keys, original validated array order, two-space indentation, UTF-8 without BOM and exactly one terminal LF. Catalog path/commit/family arrays use unique ordinal lexical ordering. Unknown keys, duplicate parsed JSON keys, prototype properties, accessor objects, non-plain records, sparse/alias/cyclic input objects, NaN and ambiguous paths are rejected. Canonical byte comparison also rejects CRLF, alternate ordering/spacing, extra newline, duplicate keys and trailing input. Paths are repository-relative forward slash paths with no absolute/drive/UNC/dot-dot/dot/empty segment, backslash, control character or case-fold duplicate. Blob/commit SHA1 and SHA256 fields are lowercase fixed length. Invalid input is rejected before any execution.

## Shared current-main baseline

The following shared filenames are legitimate pre-existing main code, not imported runtime capability evidence. Their exact baseline blobs are pinned; matching filenames or an overlapping symbol do not activate an archive family.

| Path | Current main blob | Archive family owners |
| --- | --- | --- |
| extensions/workflow-register/src/bobWorkflowFactory.ts | e023f9a93f5603ae5cb00541bd26197e77188baa | WF2-R5-BOB |
| extensions/workflow-register/src/core/contractV2/index.ts | 7eb4976a534551fca57ec6fcfd612c62bd175241 | WF2-R1-PROVENANCE |
| extensions/workflow-register/src/core/contractV2/planLease.ts | 3948750e9f58dac0a77e6d258a9536170d5b4b8b | WF2-R2-INVOKE |
| extensions/workflow-register/src/core/contractV2/planStore.ts | af1b872263cf693063daf07126bb702087d025cb | WF2-R5-BOB |
| extensions/workflow-register/src/core/contractV2/providerRegistry.ts | 3173e057e2f7ae051388eb867e26484a060f4f39 | WF2-R2-INVOKE |
| extensions/workflow-register/src/core/engine/recoveryState.ts | 2c796fce9cb7fc15a8fe82564ccfd3aaa61caaca | WF2-R6-ARCHIVED |
| extensions/workflow-register/src/core/engine/runExecutionCoordinator.ts | 30bf27b842b92c09c99d84b48ec19298932991c3 | WF2-R6-ARCHIVED, WF2-R1-PROVENANCE |
| extensions/workflow-register/src/core/engine/runState.ts | a1c857c619c165c907a4871da02cea8a74985760 | WF2-R1-PROVENANCE |
| extensions/workflow-register/src/core/modelSchema.ts | 0b6aec282920488deeb079df34025bcb73ede6f0 | WF2-R1-PROVENANCE |
| extensions/workflow-register/src/core/runProvenance.ts | 834a4018f7e9af269a237ab6f18906059ccb90af | WF2-R1-PROVENANCE |
| extensions/workflow-register/src/core/runtime/runStateCodec.ts | 8b14cb373d27bb207d43456768cee135c892ecdf | WF2-R1-PROVENANCE |
| extensions/workflow-register/src/workflowContractV2Entrypoint.ts | 64220fc98962291bbf1fbdb5a9c22344e366643d | WF2-R6-ARCHIVED |
| extensions/workflow-register/src/workflowContractV2ProviderLifecycle.ts | 9344094fe3204ebe200f4e0ea099756e38b817d1 | WF2-R1-PROVENANCE |
| extensions/workflow-register/src/workflowContractV2RunStateStore.ts | 820beb77bd74b3f650aaa5366378fa9c383f0359 | WF2-R1-PROVENANCE |
| extensions/workflow-register/src/workflowRegisterService.ts | d9c7dcdc12d48be6b7babeac86ea733a36ec6c9a | WF2-R1-PROVENANCE, WF2-R4-EXECUTOR |
| extensions/workflow-register/src/workflowRunCommands.ts | d028b7e4f7c71f238ff6f8789e5f1120dd580552 | WF2-R6-ARCHIVED |
| extensions/workflow-register/src/workflowRuntimeFactory.ts | 0a07f05e18172c5f27edb66ac41eee9b169b8e35 | WF2-R1-PROVENANCE, WF2-R6-ARCHIVED |
| extensions/workflow-register/test/workflowContractV2ExecutionBoundary.test.js | 208c6a2bf45f62f538a51cfef57139dc1ac7c087 | WF2-R5-BOB, WF2-R1-PROVENANCE, WF2-R4-EXECUTOR |
| extensions/workflow-register/test/workflowContractV2ExecutionGuard.test.js | bc85a22bad3d257e81faeb6588768916f6815390 | WF2-R1-PROVENANCE |

Every family/symbol membership for these paths is preserved from the fixed source universe in catalog baseline.sharedPaths; those strings describe archived families, not assertions that the symbols exist on main. Baseline also records the complete current main product src and pre-existing workflow test path/blob set, package/lock/shipping policy identities. Gate R bootstrap independently checks this entire set unchanged, disallows extra product source or pre-existing test rename/removal, and permits only the single new Gate R bootstrap test path. This stronger unchanged-byte boundary makes new runtime/provider/Bob/run-directory/artifact-staging reachability impossible for this slice while preserving existing P1–P7 behavior, including inactive captured provider delegates.

For source and existing tests, compare Git blob hashes from regular contained files with checkout line endings normalized by the repository text policy; use literal SHA identities from the baseline, not a caller-provided exemption. Refuse symlinks/reparse aliases or paths whose real location leaves the repository. No filename-only inactive scan is allowed. Future R1/R2 slices must deliberately replace this closed baseline policy with reviewed capability evidence and public reachability/wiring tests; this bootstrap does not pre-authorize that change.

## Active suite contract and empty semantics

Closed fields: schemaVersion, authority, catalogSha256, capabilities. schemaVersion workflow-gate-r-active-suite/v1; authority integrated_runtime_only. Initial capabilities is exactly []. The committed bootstrap policy accepts only the proven empty runtime set at this baseline; no caller-supplied VERIFIED status, arbitrary test path or module activates a capability. Nonempty manifests, duplicates, R3–R6 entries, future/missing test paths and forged activation are rejected. Later R1/R2 work must explicitly review/update the fixed registry and add genuine integrated test specimens; filenames are not guessed here.

The runner's success object is deterministic and host-independent: schemaVersion workflow-gate-r-result/v1, state INVENTORY_ONLY, inventoryValidation PASSED, runtimeSuiteState NOT_RUN_EMPTY, runtimeSuitesExecuted 0, archiveTestsExecuted 0, runtimeActivation false, providerDispatches 0, bobDispatches 0, catalogSha256 and activeManifestSha256. It never emits runtimeSuiteState PASSED for an empty manifest. Bootstrap validation may exit 0 because inventory and absence checks passed, but is not a runtime suite PASS or final program UAT.

## Pure validator and fixed command boundary

gateRPolicy exposes validateGateRInventory, validateGateRActiveSuite and validateGateRRepository plus deterministic serialization/projection helpers only as needed. Validation reads ordinary JSON/data, never imports archive code. Root location is the repository relative to the module, not cwd-selected. Source catalog path and digest are fixed; module execution and runner target allowlists are closed. Repository checks require actual regular files, realpath containment, no symlink components and measured blob identities. Any configurable testing helper supplies data, not executable authority; production CLI does not expose alternate trust/context/root/output parameters.

create-gate-r-inventory accepts only --check or --print, reading the sealed catalog and producing/validating the inventory. --print writes canonical bytes to stdout; it does not mutate files. run-gate-r accepts no arguments or --check, reads the three fixed artifacts, checks source-universe digest and current main absence/baseline, then writes canonical result JSON to stdout. Unknown flags, arbitrary command/module/root/output options and extra args exit nonzero before side effects. The bootstrap has zero runtime test allowlist; it cannot call child_process, product APIs, providers, Bob, or archived tests. Full suite/policies/package remain external existing CI commands, not recursively invoked by the bootstrap test. No runtime test imports occur.

## Verification and hosted identity

Before implementation, write meaningful tests against valid hand-derived expectations and actual mutation specimens, then observe RED. Cover omitted/duplicated/unclassified path/family, wrong head/tree/blob, untrusted catalog, unknown keys/path and alternate canonical/order bytes, inherited shared-path acceptance and wrong baseline rejection, inactive/rejected manifest entries, absent/future test files, duplicate capability, forged status and empty false PASS. Exercise both real CLIs for unknown flag rejection, deterministic stdout and repository unchanged after execution. Test roots are absent task-owned external temporary directories, bounded and never archive/product roots.

The one workflow extension test invokes the bootstrap via the real command at repository root and asserts INVENTORY_ONLY / NOT_RUN_EMPTY / zero execution counts, then runs focused closed-validator tests or representative tamper checks without runtime recursion. The existing full-suite Ubuntu/Windows quality jobs run it and print a single base64 canonical result marker for independent equality extraction. The bootstrap test remains excluded from the VSIX by the existing shipping policy. Exact checkout/nonce and raw job graph gates are preserved; manual four-workflow cohorts get new fixed nonces once. Automatic candidate and push graphs include extensions-quality and UI for this test/docs diff.

Compile, focused Gate R, four existing generators, full workflow tests, all policy/audit/package checks, LF checkout, staged path allowlist, product/shipped payload equality and fresh whole-branch review must pass before conditional publication. Live archive hashes are rechecked after local commands. Read-only tool UAT has targetSurfaces=[]; no installed product UAT is necessary when shipped entries are unchanged. Final three-extension program UAT remains not_run.

## Separate closed composite completion

After exact candidate integration and actual tool-main CI, import one dated GATE-R-ARCHIVE-INVENTORY completion record through the existing pinned evidence registry. Require all four scopes GATE-R-ARCHIVE-INVENTORY, GATE-R-ACTIVE-MANIFEST, GATE-R-VALIDATOR, GATE-R-RUNNER complete. Promote these exact four capability statuses only when that single registered composite slice is VERIFIED; no generic ownedScope iteration or user-provided promotion map. Keep programAtomicSlices unchanged, seven historical completion records unchanged, P7/Gate P VERIFIED, all other inactive capabilities planned, activeSliceIds=[], runtime inactive and automaticCleanup=false. Test missing scopes, partial prefix, forged composite ownership, premature R1/R2/conditional promotion, authority tamper and independent external-byte checks before pinning. Preserve accepted tool main separately from the later metadata merge. Fresh metadata review and exact-head/main CI precede readback of the next R1 descriptor. Retain all worktrees, branches, profiles and exclusive evidence copies; no cleanup.
