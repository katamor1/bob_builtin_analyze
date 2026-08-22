# Workflow Carrier A merge-resolution evidence — 2026-08-22

## Result and immutable boundary

Workflow Carrier A is materialized locally at product commit `54d0b6c99da5884532125d224b9a760e8c333a37` on reviewed base main `5280723da6f0660322435255acdaf0ccbd02506f`. The frozen authority is range `56ba084d07f1641fa0454fe1da024f14fe99fd37..683e794eb4a39eea7bc3630bedbd2a557f4af8af`, 196 commits and 105 paths. Its archived patch is `carrier-patches/workflow-a.patch`, SHA-256 `6defa23b468efdac0ccb8e2c331f00191959481a3c01750c3dfcc4910df9f769`, 1,218,707 bytes.

This is pre-publication evidence. The carrier PR number, carrier reviewed head, carrier merge SHA, carrier-merged `origin/main`, evidence PR, and published-main identity are intentionally `pending`; none is predicted here. Full local gates are pending Task 5, exact-head CI is pending Task 6, and merge publication is pending Task 7.

The preflight command `git apply --check --3way --index <archived-workflow-a.patch>` exited `0` while reporting 92 fallback paths, 12 clean paths, and exactly one conflict path:

```text
extensions/workflow-register/test/bobGateLifecycle.test.js
```

The preflight index and worktree were immediately clean. Actual application of the 104 remaining frozen paths stopped only on that expected conflict and produced no other missing, extra, or unmerged path after resolution.

## Exact path fidelity

Before these evidence files were authored, the exact comparison `5280723da6f0660322435255acdaf0ccbd02506f..54d0b6c99da5884532125d224b9a760e8c333a37` proved:

- frozen paths: 105;
- sole added contract path: `.gitattributes`;
- expected product paths: 106;
- actual product paths: 106;
- missing product paths: `[]`;
- extra product paths: `[]`;
- intentionally omitted paths: `[]`.

The exact sorted 106-path product inventory is:

```text
.gitattributes
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
```

The complete carrier branch inventory is derived from those exact 106 paths plus only these two evidence paths, for expected and actual counts of 108 with missing `[]` and extra `[]`:

```text
docs/release-evidence/workflow-carrier-a-merge-resolution-2026-08-22.json
docs/release-evidence/workflow-carrier-a-merge-resolution-2026-08-22.md
```

## Lifecycle resolution

`extensions/workflow-register/test/bobGateLifecycle.test.js` is the exact frozen wrapper blob `a7065b85360079b7f7eef479674094b59dc70f2e`. It installs the audited six-method Bob task facade, unwraps task identity before every runner dispatch, and restores `Module._load` in `finally`.

`extensions/workflow-register/test/bobGateLifecycleLegacyCases.js` is the exact reviewed current-main lifecycle suite blob `b12c7ffb12015f3be17bb0b3e63af627741f2a01`, sourced from base-main `extensions/workflow-register/test/bobGateLifecycle.test.js`. It preserves all cases and exactly three `waitFor(..., 20_000)` bounds. No unmerged path remained.

## Exact frozen-blob departures

Exactly eight of the 105 frozen-path blobs intentionally differ from the frozen target. No ninth frozen blob differs.

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

The sole added product path is `.gitattributes`, blob `7b7d9a12b2c975a5e0c96e0f94f292e850851b8c`, with exact rule:

```gitattributes
extensions/workflow-register/test/fixtures/workflow-contract-v2/** text eol=lf
```

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

## Product commit and independent review

The product commit is:

```text
54d0b6c99da5884532125d224b9a760e8c333a37 feat: add workflow contract v2 foundation
parent: de340977e31fac4818386c4973c7dd869d1c006f
```

Independent Task 3 review of exact range `de340977e31fac4818386c4973c7dd869d1c006f..54d0b6c99da5884532125d224b9a760e8c333a37` was `APPROVED`, Critical 0 / Important 0 / Minor 0. The binary/full-index review package SHA-256 was `d780df0809c65d5e7899e39b4303f0acad764681a535278c8d5c67bfee40d179`; the implementation report SHA-256 was `f5ade7b4041486d4213540497bd836d9a8d167bb8fb33b9622b8d98a1cefe7f0`. The reviewer independently reran the exact focused suite: 602 tests, 601 pass, 0 fail, 0 cancelled, 1 skip, 0 todo, 68,599.3321 ms.

## Product `git diff --stat`

Command:

```text
git diff --stat 5280723da6f0660322435255acdaf0ccbd02506f 54d0b6c99da5884532125d224b9a760e8c333a37
```

Exact summary:

```text
106 files changed, 24740 insertions(+), 1866 deletions(-)
```

## Scope boundary

This evidence proves Workflow A only. It does not claim that Workflow B, Workflow C, any Processing carrier, or the later Workflow/Processing overlap has been resolved. It authorizes no branch, worktree, archive, artifact, or legacy-reference deletion.
