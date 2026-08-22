# Workflow Carrier A merge-resolution evidence — 2026-08-22

## Result and immutable boundary

Workflow Carrier A is merged through [PR #170](https://github.com/katamor1/bob_builtin_analyze/pull/170). Its independently reviewed exact head is `b728061be3d5365e0ff7adb89fd328bfc2450001`; the carrier merge commit and the exact carrier-merged `origin/main` are both `36b54145bf2e365f8e56282ab18f6cbc900012d9`. The reviewed CI-remediation commit is `7467869201edc5f1d9d3e342542c7d29dbf390b6` on reviewed base main `5280723da6f0660322435255acdaf0ccbd02506f`; its parent is the initial published carrier head `3b98bbd6c5d8b8a4b0559de0377c486f32f061c2`, the Task 5 remediation commit is `b543b38e17a1461cd53c75fb72acb38f38e636ac`, and the foundation product commit is `54d0b6c99da5884532125d224b9a760e8c333a37`. The frozen authority is range `56ba084d07f1641fa0454fe1da024f14fe99fd37..683e794eb4a39eea7bc3630bedbd2a557f4af8af`, 196 commits and 105 paths. Its archived patch is `carrier-patches/workflow-a.patch`, SHA-256 `6defa23b468efdac0ccb8e2c331f00191959481a3c01750c3dfcc4910df9f769`, 1,218,707 bytes.

PR #170's initial exact head `3b98bbd6c5d8b8a4b0559de0377c486f32f061c2` failed one required current-document contract. The reviewed five-path fix then passed all 11 formal local gates once, without retry, on exact fix head `7467869201edc5f1d9d3e342542c7d29dbf390b6`. Final exact head `b728061be3d5365e0ff7adb89fd328bfc2450001` passed all three required workflows and 10 jobs on attempt 1, received independent `APPROVED` review with Critical 0 / Important 0 / Minor 0, and was merged without reusing the old failed run. This docs-only evidence update is now at status `carrier_merged_pending_evidence_pr`: the evidence PR and published-main identity remain intentionally `null`, and no value is predicted or self-referenced. Legacy PR comments and closures remain blocked until the evidence PR is reviewed, merged, and its two published blobs are verified.

The preflight command `git apply --check --3way --index <archived-workflow-a.patch>` exited `0` while reporting 92 fallback paths, 12 clean paths, and exactly one conflict path:

```text
extensions/workflow-register/test/bobGateLifecycle.test.js
```

The preflight index and worktree were immediately clean. Actual application of the 104 remaining frozen paths stopped only on that expected conflict and produced no other missing, extra, or unmerged path after resolution.

## Exact path fidelity

The exact comparison `5280723da6f0660322435255acdaf0ccbd02506f..7467869201edc5f1d9d3e342542c7d29dbf390b6`, excluding only the two evidence-only paths listed below, proves:

- frozen paths: 105;
- reviewed non-frozen product paths: `.gitattributes`, `.github/workflows/three-extension-ui-contracts.yml`, `extensions/workflow-register/test/workflowCompilerParity.test.js`, and `scripts/three-extension-ui-contract-workflow.test.js`;
- expected product paths: 109;
- actual product paths: 109;
- missing product paths: `[]`;
- extra product paths: `[]`;
- intentionally omitted paths: `[]`.

The exact sorted 109-path product inventory is:

```text
.gitattributes
.github/workflows/three-extension-ui-contracts.yml
docs/release-evidence/workflow-contract-v2-foundation-doc-sync.patch
docs/release-evidence/workflow-contract-v2-foundation-status-2026-07-23.md
docs/superpowers/plans/2026-07-17-workflow-contract-v2-atomic-authoring.md
docs/superpowers/plans/2026-07-17-workflow-contract-v2-foundation.md
docs/superpowers/plans/2026-07-17-workflow-contract-v2-master.md
docs/superpowers/plans/2026-07-17-workflow-contract-v2-package-compiler.md
docs/superpowers/plans/2026-07-17-workflow-contract-v2-repository-cutover.md
docs/superpowers/plans/2026-07-17-workflow-contract-v2-runtime.md
docs/superpowers/specs/2026-07-17-workflow-contract-v2-design.md
docs/superpowers/specs/2026-07-24-workflow-contract-v2-generation-directory-amendment.md
extensions/workflow-register/package-lock.json
extensions/workflow-register/package.json
extensions/workflow-register/src/bobApi.ts
extensions/workflow-register/src/bobWorkflowFactory.ts
extensions/workflow-register/src/bobWorkflowTypes.ts
extensions/workflow-register/src/core/actionRegistry.ts
extensions/workflow-register/src/core/contractV2/bobProfile.ts
extensions/workflow-register/src/core/contractV2/canonicalJson.ts
extensions/workflow-register/src/core/contractV2/diagnostics.ts
extensions/workflow-register/src/core/contractV2/jsonSchema.ts
extensions/workflow-register/src/core/contractV2/jsonValue.ts
extensions/workflow-register/src/core/contractV2/packageFileSystem.ts
extensions/workflow-register/src/core/contractV2/packageFileSystemNode.ts
extensions/workflow-register/src/core/contractV2/packageFileSystemVscode.ts
extensions/workflow-register/src/core/contractV2/packageGenerationPath.ts
extensions/workflow-register/src/core/contractV2/packageLoader.ts
extensions/workflow-register/src/core/contractV2/packageLoaderContract.ts
extensions/workflow-register/src/core/contractV2/packageLoaderInput.ts
extensions/workflow-register/src/core/contractV2/packageLoaderIntrinsics.ts
extensions/workflow-register/src/core/contractV2/packageLoaderIo.ts
extensions/workflow-register/src/core/contractV2/packageLoaderSnapshot.ts
extensions/workflow-register/src/core/contractV2/packagePointer.ts
extensions/workflow-register/src/core/contractV2/packageRoot.ts
extensions/workflow-register/src/core/contractV2/packageShape.ts
extensions/workflow-register/src/core/contractV2/predicate.ts
extensions/workflow-register/src/core/contractV2/providerContract.ts
extensions/workflow-register/src/core/contractV2/providerRegistry.ts
extensions/workflow-register/src/core/contractV2/workflowLock.ts
extensions/workflow-register/src/core/contractV2/workflowLockArrayPreflight.ts
extensions/workflow-register/src/core/contractV2/workflowLockBob.ts
extensions/workflow-register/src/core/contractV2/workflowLockComparison.ts
extensions/workflow-register/src/core/contractV2/workflowLockContract.ts
extensions/workflow-register/src/core/contractV2/workflowLockEnvironmentSnapshot.ts
extensions/workflow-register/src/core/contractV2/workflowLockFiles.ts
extensions/workflow-register/src/core/contractV2/workflowLockGeneration.ts
extensions/workflow-register/src/core/contractV2/workflowLockIntrinsics.ts
extensions/workflow-register/src/core/contractV2/workflowLockPreflight.ts
extensions/workflow-register/src/core/contractV2/workflowLockProvider.ts
extensions/workflow-register/src/core/contractV2/workflowLockRawPackage.ts
extensions/workflow-register/src/core/contractV2/workflowLockShape.ts
extensions/workflow-register/src/core/contractV2/workflowLockSnapshot.ts
extensions/workflow-register/src/core/contractV2/workflowLockSnapshotUtilities.ts
extensions/workflow-register/src/core/contractV2/workflowLockValidation.ts
extensions/workflow-register/src/core/contractV2/yamlDocument.ts
extensions/workflow-register/src/workflowAdapter.ts
extensions/workflow-register/src/workflowDefinitionLoader.ts
extensions/workflow-register/src/workflowRegistrationService.ts
extensions/workflow-register/test/bobGateLifecycle.test.js
extensions/workflow-register/test/bobGateLifecycleLegacyCases.js
extensions/workflow-register/test/bobWorkflowFactory.test.js
extensions/workflow-register/test/fixtures/workflow-contract-v2/lock/expected.lock.json
extensions/workflow-register/test/fixtures/workflow-contract-v2/package-schema/invalid-cases.json
extensions/workflow-register/test/fixtures/workflow-contract-v2/package-schema/valid-minimal.json
extensions/workflow-register/test/fixtures/workflow-contract-v2/packages/minimal-source/files.json
extensions/workflow-register/test/fixtures/workflow-contract-v2/predicate-golden.json
extensions/workflow-register/test/fixtures/workflow-contract-v2/yaml/invalid-cases.json
extensions/workflow-register/test/fixtures/workflow-contract-v2/yaml/valid-minimal.yaml
extensions/workflow-register/test/registrationWiring.test.js
extensions/workflow-register/test/workflowCompilerParity.test.js
extensions/workflow-register/test/workflowContractV2BobCapabilitySelectionCases.js
extensions/workflow-register/test/workflowContractV2BobLoaderBindingCases.js
extensions/workflow-register/test/workflowContractV2BobProfile.test.js
extensions/workflow-register/test/workflowContractV2BobProfileCoreCases.js
extensions/workflow-register/test/workflowContractV2BobProfileHardeningCases.js
extensions/workflow-register/test/workflowContractV2BobRegistrationTypeBoundaryCases.js
extensions/workflow-register/test/workflowContractV2CanonicalJson.test.js
extensions/workflow-register/test/workflowContractV2Diagnostics.test.js
extensions/workflow-register/test/workflowContractV2JsonSchema.test.js
extensions/workflow-register/test/workflowContractV2Lock.test.js
extensions/workflow-register/test/workflowContractV2LockGenerationCases.js
extensions/workflow-register/test/workflowContractV2LockHostileCases.js
extensions/workflow-register/test/workflowContractV2LockLimitCases.js
extensions/workflow-register/test/workflowContractV2LockOrderingCases.js
extensions/workflow-register/test/workflowContractV2LockPreflightCases.js
extensions/workflow-register/test/workflowContractV2LockSchemaIdentityCases.js
extensions/workflow-register/test/workflowContractV2LockSnapshotCases.js
extensions/workflow-register/test/workflowContractV2LockStagingCases.js
extensions/workflow-register/test/workflowContractV2LockTestSupport.js
extensions/workflow-register/test/workflowContractV2LockVerificationCases.js
extensions/workflow-register/test/workflowContractV2PackageLoader.test.js
extensions/workflow-register/test/workflowContractV2PackageLoaderAdapterCases.js
extensions/workflow-register/test/workflowContractV2PackageLoaderContainmentRootCases.js
extensions/workflow-register/test/workflowContractV2PackageLoaderCoreCases.js
extensions/workflow-register/test/workflowContractV2PackageLoaderLimitCases.js
extensions/workflow-register/test/workflowContractV2PackageLoaderSafetyCases.js
extensions/workflow-register/test/workflowContractV2PackageLoaderStagingCases.js
extensions/workflow-register/test/workflowContractV2PackageLoaderTestSupport.js
extensions/workflow-register/test/workflowContractV2PackageSchema.test.js
extensions/workflow-register/test/workflowContractV2PackageSchemaLockCases.js
extensions/workflow-register/test/workflowContractV2PackageSchemaPointerCases.js
extensions/workflow-register/test/workflowContractV2PackageSchemaProviderCases.js
extensions/workflow-register/test/workflowContractV2PackageSchemaTestSupport.js
extensions/workflow-register/test/workflowContractV2Predicate.test.js
extensions/workflow-register/test/workflowContractV2ProviderRegistry.test.js
extensions/workflow-register/test/workflowContractV2Yaml.test.js
extensions/workflow-register/test/workflowDefinitionLoader.test.js
scripts/three-extension-ui-contract-workflow.test.js
```

The complete carrier branch inventory is derived from those exact 109 paths plus only these two evidence paths, for expected and actual counts of 111 with missing `[]` and extra `[]`:

```text
docs/release-evidence/workflow-carrier-a-merge-resolution-2026-08-22.json
docs/release-evidence/workflow-carrier-a-merge-resolution-2026-08-22.md
```

## Lifecycle resolution

`extensions/workflow-register/test/bobGateLifecycle.test.js` is the exact frozen wrapper blob `a7065b85360079b7f7eef479674094b59dc70f2e`. It installs the audited six-method Bob task facade, unwraps task identity before every runner dispatch, and restores `Module._load` in `finally`.

`extensions/workflow-register/test/bobGateLifecycleLegacyCases.js` is the exact reviewed current-main lifecycle suite blob `b12c7ffb12015f3be17bb0b3e63af627741f2a01`, sourced from base-main `extensions/workflow-register/test/bobGateLifecycle.test.js`. It preserves all cases and exactly three `waitFor(..., 20_000)` bounds. No unmerged path remained.

## Exact frozen-blob departures

Exactly 11 of the 105 frozen-path blobs intentionally differ from the frozen target. The first eight are the previously reviewed integration resolutions; the final three are current-document synchronizations required by the reviewed Task 6 CI remediation. No twelfth frozen blob differs.

| Path | Final blob | Frozen blob | Reviewed resolution |
| --- | --- | --- | --- |
| `extensions/workflow-register/package.json` | `3522c9689040ec2a370ff7059de77ebd0a1a25bf` | `50bfb4b82b8f8c0749ee39d74809ff01c1d9f301` | Retain reviewed current-main manifest state while adding only `semver@7.7.2` and `@types/semver@7.7.1`. |
| `extensions/workflow-register/package-lock.json` | `243bfe66b9e441e0c8c002f0ff2324ebfc8d9dc0` | `5f7240b66935534d629d6d4f7d8314d5b432b257` | Retain reviewed current-main dependency state while applying the frozen dependency delta; `npm.cmd ci` left it unchanged. |
| `extensions/workflow-register/test/bobGateLifecycleLegacyCases.js` | `b12c7ffb12015f3be17bb0b3e63af627741f2a01` | `b316c00affb1e7a62d2d49ebf9c2f9e4d37a9d86` | Preserve the exact current-main lifecycle suite and all three 20-second waits. |
| `extensions/workflow-register/test/bobWorkflowFactory.test.js` | `d190979da111cf8522033e9cb52fa10055e07224` | `195d9b95d3eb84fe2edccfd44bdfc9932a10d805` | Independent review added missing-capability and binding-drift negatives for engine, Todo, and fallback dispatch. |
| `extensions/workflow-register/src/core/contractV2/packageFileSystemNode.ts` | `26c36223273c776122a3e1f363d9ab2c935e3a98` | `92681a677ea1a05bf80c7f152df05daad2e5051f` | Use least-privilege `O_WRONLY`, `O_NOFOLLOW` when supported, and direct regular-file `dev`/`ino` checks before and after sync without suppressing errors. |
| `extensions/workflow-register/test/workflowContractV2BobRegistrationTypeBoundaryCases.js` | `e1fbc8ba29cf3e490f72c6118095a44d61f95abb` | `a3ada2e0ebd336ed450146d8e887b12b3919e089` | Normalize checkout CR/CRLF only in the source-inspection helper. |
| `extensions/workflow-register/test/workflowContractV2PackageLoaderAdapterCases.js` | `ca2ab5989efe449d887b4c7895c23a632d796498` | `63a0b62a9ec5ef37591df8f4d10579c1376ff9c1` | Prove real-file Windows flush and reject a file symlink whenever symlink creation is available. |
| `extensions/workflow-register/test/workflowContractV2Yaml.test.js` | `d1036dfe549f193c2e8a71f289b6bd88003d80fb` | `d1c9b0458e944adc2d201e1da001124b84f024aa` | Assert the exact repository LF checkout contract without weakening the strict production YAML parser. |
| `docs/superpowers/plans/2026-07-17-workflow-contract-v2-package-compiler.md` | `ebf249d51228012efa83a7c6627862fbe30ed83a` | `e7fa3d2bde5953e4dcc063f17f97df5cc58633f7` | Synchronize the current compiler plan to the canonical `workflowRegister.openOperationHub` route and `Bob 操作ハブ` display label without changing internal identifiers. |
| `docs/superpowers/plans/2026-07-17-workflow-contract-v2-runtime.md` | `24b98777d582fa703c077c94a62ac3593fcb8587` | `6d8c70e5bf61c75a778b56f20f09499352c24f5e` | Synchronize the current runtime plan to the canonical `workflowRegister.openOperationHub` route and `Bob 操作ハブ` display label without changing internal identifiers. |
| `docs/superpowers/specs/2026-07-17-workflow-contract-v2-design.md` | `efdd38885803057260b96d60c8d0435a320788d9` | `60d121fbe96d10b7504a632bb2698600144dcdbf` | Synchronize the current design specification to the canonical `workflowRegister.openOperationHub` route and `Bob 操作ハブ` display label without changing internal identifiers. |

The repository checkout-contract product path is `.gitattributes`, blob `7b7d9a12b2c975a5e0c96e0f94f292e850851b8c`, with exact rule:

```gitattributes
extensions/workflow-register/test/fixtures/workflow-contract-v2/** text eol=lf
```

## Reviewed non-frozen product paths

Four reviewed product paths are outside the frozen 105-path carrier. Their exact base/final blobs and authority are:

| Path | Base blob | Final blob | Reviewed authority |
| --- | --- | --- | --- |
| `.gitattributes` | `46c1dff9503b7f30ac547f243713f83712f064a0` | `7b7d9a12b2c975a5e0c96e0f94f292e850851b8c` | Task 3 Windows portability amendment and independent review. |
| `.github/workflows/three-extension-ui-contracts.yml` | `e21dff9c2cc4bcc0d481aec1575461828fd6365c` | `74a900c6db525c9dcebf9a121c28eb5936faac5f` | Task 6 CI fix amendment and exact five-path independent review. |
| `extensions/workflow-register/test/workflowCompilerParity.test.js` | `8ef407de08f8e3b1a1c7939b7bb8c0b53dd23018` | `b81b20eb562f31630eb7617928b395602d2cce98` | Task 5 remediation amendment and independent review. |
| `scripts/three-extension-ui-contract-workflow.test.js` | `de89418a61ddd9394717f9d8426abe3f224c3ec5` | `52fb4726e9069f32d4e0ce011ff415f6e5ea2781` | Task 6 CI fix amendment and exact five-path independent review. |

The workflow and source-contract test jointly fail closed on the exact checkout head and historical-patch blob before excluding exactly that literal artifact path. The pull-request branch uses only the merge-base range; the push branch uses only the exact pushed commit. The regression rejects fixed event/base/head values, swapped branches, unconditional commands, wildcard or unscoped fallbacks, and fail-open behavior.

The parity fixture is not a frozen-blob departure. Reviewed remediation commit `b543b38e17a1461cd53c75fb72acb38f38e636ac` changes it with exactly four insertions and no deletion:

- extension identity `id: "IBM.bob-code"`;
- extension version `packageJSON: { version: "2.0.1" }`;
- own ordinary no-op `runtime.source.deactivate` function;
- own ordinary no-op `runtime.source.log` function.

This aligns the existing parity fixture with the already enforced audited Bob 2.0.1 extension/source contract. Production validation remains fail closed and was not weakened.

## Historical nested-patch whitespace exception

`docs/release-evidence/workflow-contract-v2-foundation-doc-sync.patch` is exactly frozen target blob `e0946c6a29f7aa17538b1bc89e8160892845fb44`. Unscoped `git diff --cached --check` exited `2` because 27 historical artifact records each contain exactly one ASCII space (`0x20`) at lines 5, 8, 10, 12, 14, 17, 19, 21, 23, 38, 44, 48, 51, 53, 57, 61, 64, 66, 70, 74, 77, 79, 83, 93, 98, 110, and 115. Git renders each outer added-line marker plus that byte as `+ `.

The independently reviewed exception preserves the exact blob and excludes only this historical artifact:

```text
git diff --cached --check -- . ':(exclude)docs/release-evidence/workflow-contract-v2-foundation-doc-sync.patch'
```

That scoped command exited `0` with no output; no other path's whitespace finding is hidden.

## RED and GREEN evidence

Task 2 committed test-only contracts before production:

- `2f4704ad6b33a27dd7fb6ea6f12779146a9939bf` — `test: define workflow contract v2 Bob audit`;
- `de340977e31fac4818386c4973c7dd869d1c006f` — `test: cover all Bob task dispatch paths`.

From `extensions/workflow-register`, `npm.cmd run compile` exited `0`, then:

```text
node --test test/bobWorkflowFactory.test.js
```

exited `1`: 9 tests, 3 pass, 6 expected `Missing expected rejection` failures, 0 cancelled, 0 skipped, 0 todo. The six failures cover missing capability and binding drift before engine, Todo, and fallback dispatch.

The Windows/LF review round recorded these additional test-first failures:

| RED command | Result |
| --- | --- |
| `node --test --test-reporter=spec --test-name-pattern='repository preserves Contract v2 fixtures as LF bytes' test/workflowContractV2Yaml.test.js` | 1 test, 0 pass, 1 fail |
| `node --test --test-reporter=spec --test-name-pattern='Node package filesystem (adapter exposes\|flush rejects)' test/workflowContractV2PackageLoader.test.js` | 2 tests, 0 pass, 2 fail |
| `node --test --test-reporter=spec --test-name-pattern='incompatible Bob and failed source creation clear stale source, ids, and context' test/workflowContractV2BobProfile.test.js` | 1 test, 0 pass, 1 fail |
| `node --test --test-reporter=spec --test-name-pattern='exports exact policy literals and parses the minimal fixture into detached frozen JSON' test/workflowContractV2Yaml.test.js` | 1 test, 0 pass, 1 fail |

After the reviewed fixes, `npm.cmd run compile` exited `0`. Narrow GREEN results were 1/1 LF checkout contract, 2/2 real-file and symlink flush, 1/1 Bob source boundary, and 1/1 minimal YAML fixture.

The exact 14-file focused command was:

```text
node --test --test-reporter=spec test/bobWorkflowFactory.test.js test/bobGateLifecycle.test.js test/registrationWiring.test.js test/workflowDefinitionLoader.test.js test/workflowContractV2BobProfile.test.js test/workflowContractV2CanonicalJson.test.js test/workflowContractV2Diagnostics.test.js test/workflowContractV2JsonSchema.test.js test/workflowContractV2Lock.test.js test/workflowContractV2PackageLoader.test.js test/workflowContractV2PackageSchema.test.js test/workflowContractV2Predicate.test.js test/workflowContractV2ProviderRegistry.test.js test/workflowContractV2Yaml.test.js
```

It exited `0`: 602 tests, 4 suites, 601 pass, 0 fail, 0 cancelled, 1 pre-existing platform-gated skip, 0 todo, duration 61,915.1603 ms. All nine audited-Bob cases were present and GREEN.

### Task 5 initial stop and reviewed remediation

The first exact `npm.cmd test` at head `774deb7fa8f0d8718d71d87e4ed192b71c069ecd` stopped the sequence before packaging: 1,878 tests, 1,876 pass, 1 fail, and 1 skip. One identical diagnostic repeat reported 1,875 pass, 2 fail, and 1 skip. Review separated the observations:

- `workflowCompilerParity.test.js` had a stable fixture defect: its Bob mock lacked the audited extension identity/version and source `deactivate`/`log` members;
- the held-state lifecycle observer was load-sensitive: it passed the first full run at 10,406.8103 ms, failed the diagnostic repeat at its 10,000 ms observer bound, and passed isolated lifecycle checks. No lifecycle, timeout, product, or concurrency change was authorized.

Reviewed commit `b543b38e17a1461cd53c75fb72acb38f38e636ac` (`test: align compiler parity Bob mock with audited contract`) changes only the parity test by those four insertions. On that commit, the named case passed 1/1, the full parity file passed 14/14, and the focused compile passed. The initial-stop report SHA-256 is `684e007e1664f48af9e4a1a0af084f7fee274b8e166e57ea61d5961492bcfeab`.

### Task 6 exact-head CI stop and reviewed remediation

Ready PR #170 initially pointed to exact head `3b98bbd6c5d8b8a4b0559de0377c486f32f061c2`. Exact-head `three-extension-ui-contracts` run `32547887762`, job `96969574121`, failed step 5 (`Verify UI and documentation contracts`) with 30 tests / 29 pass / 1 fail / 0 skipped. The initial publication report SHA-256 is `117389952e2ecd0253d0985368a11092f7be832cba15d540ae3c66809ca3326c`. No failed workflow was rerun.

The failure was reproduced locally before the fix:

- documentation contract: 11 tests / 10 pass / 1 fail, exit 1, because three current documents still advertised the obsolete two-word English label;
- strengthened workflow source contract against the old YAML: 1 test / 0 pass / 1 fail, exit 1;
- unscoped base-to-old-head whitespace check: exit 2 with exactly 27 findings, all and only in the immutable historical patch.

The reviewed workflow source contract also produced six isolated mutation REDs: fixed `EVENT_NAME`, fixed `BASE_SHA`, fixed `HEAD_SHA`, swapped pull-request/push ranges, an unconditional pull-request range, and an unconditional push range. Every mutation was restored without being committed.

Reviewed commit `7467869201edc5f1d9d3e342542c7d29dbf390b6` (`fix: align workflow carrier CI contracts`), parent `3b98bbd6c5d8b8a4b0559de0377c486f32f061c2`, changes exactly five paths with 72 insertions and 10 deletions:

1. `.github/workflows/three-extension-ui-contracts.yml`;
2. `docs/superpowers/plans/2026-07-17-workflow-contract-v2-package-compiler.md`;
3. `docs/superpowers/plans/2026-07-17-workflow-contract-v2-runtime.md`;
4. `docs/superpowers/specs/2026-07-17-workflow-contract-v2-design.md`;
5. `scripts/three-extension-ui-contract-workflow.test.js`.

After the fix, focused documentation/workflow contracts passed 12/12, the exact seven-file Actions-equivalent root suite passed 30/30, both Git Bash event branches exited 0, and all three current documents contained seven canonical route references plus seven `Bob 操作ハブ` labels with zero obsolete-English-label occurrence. The base-to-fix-head unscoped whitespace check still found only the artifact's 27 records; excluding exactly that path produced exit 0 and zero other finding.

The amendment and exact fix were independently approved with Critical 0 / Important 0 / Minor 0. Their bindings are:

| Evidence | SHA-256 |
| --- | --- |
| Task 6 CI fix amendment | `f284b1e05d7ff0b38a9788e876287e9290bd69ed655e99b932fb9ff9c059c431` |
| amendment independent review | `cfed37dc6c7ef3711050fd6de15f7b2a2095b454bb8b8bc473370f3ad9ab4e39` |
| exact fix report | `943cd7c6006e676a5954dd78302f3ff916622ef22512446468e9e35d1e6259c8` |
| exact fix review package | `7c0c987755a1352219da9fd0584ebfe38ab3a2d512ca418472e47eb2a745252b` |
| full-index fix patch | `7d6a4655f79657cdacb9405186384c3fea066ba4e9e8e17f2fa40d93d28aeb78` |
| exact fix independent review | `ff8c975ce3985cde81b307da6ecad168cfb1f25002d4bdd1d9a2a442166c0bef` |

### Task 6E exact-head publication, review, and carrier merge

[PR #170](https://github.com/katamor1/bob_builtin_analyze/pull/170) reached `MERGED` with reviewed exact head `b728061be3d5365e0ff7adb89fd328bfc2450001`. Its merge commit is `36b54145bf2e365f8e56282ab18f6cbc900012d9`, and the fetched carrier-merged `origin/main` was exactly `36b54145bf2e365f8e56282ab18f6cbc900012d9`. The Task 6E publication report SHA-256 is `8c7b6fb998739c1f6301a609b8492ffeb9281cfbd5e7b54331f957253cceb226`.

All exact-head Actions completed successfully on attempt 1: 3 workflows and 10 jobs, with no reuse or rerun of failed run `32547887762`.

| Workflow | Run ID | Result |
| --- | ---: | --- |
| `workflow-contracts` | `32550717770` | success |
| `extensions-quality` | `32550717771` | success |
| `three-extension-ui-contracts` | `32550717776` | success |

Required job identities were Ubuntu workflow-register `96976884206`, Windows workflow-register `96976884314`, and UI/docs `96976884332`; all succeeded. Final independent exact-head review was `APPROVED`, Critical 0 / Important 0 / Minor 0, bound by SHA-256 `35ad107144952a93a63e762f229c463dbda4d98afc11dd47edf7ce5494704703`.

The next publication boundary is deliberately unfilled: evidence pull request `null`, published-main SHA `null`. These values will be recorded only after that distinct docs-only PR exists and is merged.

## Product commits and independent review

The product commit is:

```text
54d0b6c99da5884532125d224b9a760e8c333a37 feat: add workflow contract v2 foundation
parent: de340977e31fac4818386c4973c7dd869d1c006f
```

Independent Task 3 review of exact range `de340977e31fac4818386c4973c7dd869d1c006f..54d0b6c99da5884532125d224b9a760e8c333a37` was `APPROVED`, Critical 0 / Important 0 / Minor 0. The binary/full-index review package SHA-256 was `d780df0809c65d5e7899e39b4303f0acad764681a535278c8d5c67bfee40d179`; the implementation report SHA-256 was `f5ade7b4041486d4213540497bd836d9a8d167bb8fb33b9622b8d98a1cefe7f0`. The reviewer independently reran the exact focused suite: 602 tests, 601 pass, 0 fail, 0 cancelled, 1 skip, 0 todo, 68,599.3321 ms.

The Task 5 remediation commit is:

```text
b543b38e17a1461cd53c75fb72acb38f38e636ac test: align compiler parity Bob mock with audited contract
parent: 774deb7fa8f0d8718d71d87e4ed192b71c069ecd
```

Its final independent review was `APPROVED`, Critical 0 / Important 0 / Minor 0. Relative to remediation base `774deb7fa8f0d8718d71d87e4ed192b71c069ecd`, production source, lifecycle tests, package manifest/lock, and both evidence files were unchanged.

## Task 5 complete local gate evidence

All 11 commands ran in the prescribed order from `extensions/workflow-register` on exact committed head `b543b38e17a1461cd53c75fb72acb38f38e636ac`:

| Order | Command | Result |
| ---: | --- | --- |
| 1 | `npm.cmd ci` | exit 0; independently reviewed immutable npm log, 135,899 bytes, SHA-256 `47ae6ded4fefd1b37d715d978add5fcbc628f2f7e1cce07c573a0e82b7cd11d6` |
| 2 | `npm.cmd run compile` | exit 0 |
| 3 | `npm.cmd run dependency:policy` | exit 0; 3/3 pass |
| 4 | `npm.cmd run architecture:policy` | exit 0; 257 TypeScript files |
| 5 | `npm.cmd run source:policy` | exit 0; 257 TypeScript files |
| 6 | `npm.cmd run schema:policy` | exit 0; 5/5 pass after compile |
| 7 | `npm.cmd run unused:report` | exit 0; no depcheck issue |
| 8 | `npm.cmd run audit:prod` | exit 0; 0 production vulnerabilities |
| 9 | `npm.cmd test` | exit 0; 1,878 tests / 1,877 pass / 0 fail / 1 platform skip / 4 suites; 172,647.8639 ms |
| 10 | `npm.cmd run package` | exit 0; 851 packaged files |
| 11 | `npm.cmd run package:policy` | exit 0; 1,150,213 bytes / 851 entries, below the 1,200,000-byte limit |

The command-1 capture wrapper discarded its yielded PTY identifier, so execution stopped before command 2. The same invocation's npm log records exact `npm ci`, cwd, Node `v22.23.2`, npm `11.3.0`, and terminal `exit 0` / `info ok`. Independent review approved accepting that single invocation and resuming at command 2; `npm ci` was not rerun. No external process was killed.

The packaged `extensions/workflow-register/workflow-register-0.1.0.vsix` is 1,150,213 bytes, contains 851 ZIP entries, and has SHA-256 `06910a7c7f348064ab1ad548adf75b821dd8a7e429e9810307d70d10b29a307f`.

The local-gate evidence documents and packages are bound by these SHA-256 values:

| Evidence | SHA-256 |
| --- | --- |
| initial Task 5 stop report | `684e007e1664f48af9e4a1a0af084f7fee274b8e166e57ea61d5961492bcfeab` |
| remediation amendment | `ea7895d3e43ca7206000eca52e950afccf462563316aa230d1ca12907db20556` |
| remediation amendment review | `20d0662d7ebf4b916e3952677d7ffc0a8172530b463b8236b4bc5d2dc93328e6` |
| gate-capture recovery proposal | `739f73fa1809d81d5acf2b3b1ac64518b4ab08247896d063fd8ebeb9c4ff1b6e` |
| gate-capture independent review | `03480b08a56254ff57f924c4a9ce44289c9302ace8ebb04557db2a2f72e4526b` |
| remediation and complete gate report | `593cfa8ddd9a65c9bd072fa345e7b73262c50256516d976c14266c6e9fb4ff1e` |
| exact remediation review patch | `066764b439858b1e0f7c609ebdfdda6b5c6e68d70fa7307472657547d3d60dc7` |
| remediation review package | `1a800ea08aac1cb7d561bafaf1a197154cb395a1adbd8f547e5bb1121a89f2f3` |
| final independent review | `894f06b18a861a337e511d19ed1575bafc434241d8cb50213028ccf2667d27f0` |

Retained npm logs corroborate the full test (`eb076918fa474688c8e922eb3fb7f76b1779211b1b8e40ce3e2f0d33387c1462`), package (`17170ebc27ecd517f696eba12172c855028032f4d5626e35cd1e0f7a3b29275f`), and package-policy (`501ff68f1426ce9adbab6efada20d1a5c4a07d1bd03b08a027c328ef8360adbb`) invocations.

Final Task 5 invariants were clean status, no push, product 107/107 and branch 109/109 with missing/extra `[]`, historical patch blob `e0946c6a29f7aa17538b1bc89e8160892845fb44`, lifecycle legacy blob `b12c7ffb12015f3be17bb0b3e63af627741f2a01`, and unchanged lock blob `243bfe66b9e441e0c8c002f0ff2324ebfc8d9dc0` / SHA-256 `3e80a76ffb318c969e40e81ddf28ca44c3f53b7252cc392ee159d135e015c985`.

## Task 6D one-time formal local gates

The exact 11-command sequence ran once, in order, in one directly captured session from `extensions/workflow-register` on clean reviewed fix head `7467869201edc5f1d9d3e342542c7d29dbf390b6`. It started at `2026-08-22T12:37:47.9493512+09:00`, ended at `2026-08-22T12:43:51.94890096+09:00`, and used no retry or serial substitute.

| Order | Command | Result |
| ---: | --- | --- |
| 1 | `npm.cmd ci` | exit 0 |
| 2 | `npm.cmd run compile` | exit 0 |
| 3 | `npm.cmd run dependency:policy` | exit 0; 3/3 pass |
| 4 | `npm.cmd run architecture:policy` | exit 0; 257 TypeScript files |
| 5 | `npm.cmd run source:policy` | exit 0; 257 TypeScript files |
| 6 | `npm.cmd run schema:policy` | exit 0; 5/5 pass after compile |
| 7 | `npm.cmd run unused:report` | exit 0; no depcheck issue |
| 8 | `npm.cmd run audit:prod` | exit 0; 0 production vulnerabilities |
| 9 | `npm.cmd test` | exit 0; 1,878 tests / 1,877 pass / 0 fail / 1 platform skip / 4 suites; 191,379.8474 ms |
| 10 | `npm.cmd run package` | exit 0; 851 packaged files |
| 11 | `npm.cmd run package:policy` | exit 0; 1,150,213 bytes / 851 entries, below the 1,200,000-byte limit |

The newly generated `extensions/workflow-register/workflow-register-0.1.0.vsix` is 1,150,213 bytes, contains 851 ZIP entries, and has SHA-256 `639b868b8a62bb78557be6165970e0c8e8a2c53a6278e01dedeb346ec756f688`.

Post-gate proofs bound this result to the unchanged fix head: clean status; lock committed/index/working blob `243bfe66b9e441e0c8c002f0ff2324ebfc8d9dc0`; historical patch blob `e0946c6a29f7aa17538b1bc89e8160892845fb44`; frozen paths 105; frozen departures 11; product 109/109; branch 111/111; missing/extra/omitted `[]`. At this Task 6D capture boundary only, the remote carrier branch and PR still pointed to initial failed head `3b98bbd6c5d8b8a4b0559de0377c486f32f061c2`, and no push, PR body edit, workflow rerun, merge, legacy-PR action, force update, or deletion had occurred. The later Task 6E publication and merge are recorded separately above.

## Historical fix-head and reviewed carrier-head `git diff --stat`

The reviewed product/fix head measurement before the evidence rewrite is:

```text
git diff --stat 5280723da6f0660322435255acdaf0ccbd02506f 7467869201edc5f1d9d3e342542c7d29dbf390b6
```

Its exact summary is:

```text
111 files changed, 25741 insertions(+), 1869 deletions(-)
```

The reviewed carrier-head measurement, reverified for exact head `b728061be3d5365e0ff7adb89fd328bfc2450001` with `git diff --stat 5280723da6f0660322435255acdaf0ccbd02506f b728061be3d5365e0ff7adb89fd328bfc2450001`, is:

```text
111 files changed, 25961 insertions(+), 1869 deletions(-)
```

## Legacy pull-request preservation judgments

All four segment proofs were recomputed against frozen `toSha` `683e794eb4a39eea7bc3630bedbd2a557f4af8af`. For every row, the segment `from` is an ancestor of the original head and the original head is an ancestor of that frozen `toSha`. The carrier preserves all frozen 105 paths within the reviewed 109-path product set; the four reviewed non-frozen product paths are `.gitattributes`, `.github/workflows/three-extension-ui-contracts.yml`, `extensions/workflow-register/test/workflowCompilerParity.test.js`, and `scripts/three-extension-ui-contract-workflow.test.js`. Product fidelity is 109/109 and branch fidelity is 111/111, with missing/extra/omitted `[]` and exactly 11 reviewed frozen-blob departures.

| PR | Original head branch | Full original head | Original base | Frozen segment | Scale | From → head | Head → frozen `toSha` | Individual judgment |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- |
| #143 | `codex/workflow-contract-v2-f7` | `2af41862b61d3e0f53218cc0f760b19292870a3b` | `main` | `56ba084d07f1641fa0454fe1da024f14fe99fd37..2af41862b61d3e0f53218cc0f760b19292870a3b` | 80 commits / 48 paths | `true` | `true` | F7 foundation and audited Bob boundary are ancestors of the frozen `toSha`; all frozen 105 paths are present within the reviewed 109-path product set, and the declared lifecycle/Windows/test resolutions plus B0/G0 GREEN evidence preserve its unique changes. |
| #148 | `codex/workflow-contract-v2-p1` | `a0da0c8f17cbb648873577a573230c8241f755f2` | `codex/workflow-contract-v2-f7` | `2af41862b61d3e0f53218cc0f760b19292870a3b..a0da0c8f17cbb648873577a573230c8241f755f2` | 6 commits / 16 paths | `true` | `true` | P1 package-pointer/lock-provider changes are a distinct ancestor segment; all frozen 105 paths are present within the reviewed 109-path product set and K0/L0/R0 GREEN evidence proves the segment was not lost. |
| #149 | `codex/workflow-contract-v2-p2` | `629f53ade7fcb42481fad6906d36ef6425fd1071` | `codex/workflow-contract-v2-p1` | `a0da0c8f17cbb648873577a573230c8241f755f2..629f53ade7fcb42481fad6906d36ef6425fd1071` | 70 commits / 21 paths | `true` | `true` | P2 package filesystem/loader/generation changes are a distinct ancestor segment; all frozen 105 paths are present within the reviewed 109-path product set and L0/J0/Y0 GREEN evidence proves the segment was not lost. |
| #151 | `codex/workflow-contract-v2-p3` | `683e794eb4a39eea7bc3630bedbd2a557f4af8af` | `codex/workflow-contract-v2-p2` | `629f53ade7fcb42481fad6906d36ef6425fd1071..683e794eb4a39eea7bc3630bedbd2a557f4af8af` | 40 commits / 20 paths | `true` | `true` | P3 lock snapshot/validation changes terminate at exact frozen `toSha`; all frozen 105 paths are present within the reviewed 109-path product set and K0 GREEN evidence proves the segment was not lost. |

No legacy PR comment or closure is authorized yet. Those actions remain blocked until the docs-only evidence PR receives exact-head CI and independent review, is merged, and both evidence blobs plus their semantic bindings are verified on fetched `origin/main`. Every legacy source branch remains preserved.

## Scope boundary

This evidence proves Workflow A only. It does not claim that Workflow B, Workflow C, any Processing carrier, or the later Workflow/Processing overlap has been resolved. It authorizes no branch, worktree, archive, artifact, or legacy-reference deletion.
