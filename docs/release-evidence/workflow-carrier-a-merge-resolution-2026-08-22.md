# Workflow Carrier A merge-resolution evidence — 2026-08-22

## Result and immutable boundary

Workflow Carrier A is materialized locally through reviewed remediation commit `b543b38e17a1461cd53c75fb72acb38f38e636ac` on reviewed base main `5280723da6f0660322435255acdaf0ccbd02506f`; the foundation product commit is `54d0b6c99da5884532125d224b9a760e8c333a37`. The frozen authority is range `56ba084d07f1641fa0454fe1da024f14fe99fd37..683e794eb4a39eea7bc3630bedbd2a557f4af8af`, 196 commits and 105 paths. Its archived patch is `carrier-patches/workflow-a.patch`, SHA-256 `6defa23b468efdac0ccb8e2c331f00191959481a3c01750c3dfcc4910df9f769`, 1,218,707 bytes.

This is pre-publication evidence. All Task 5 local gates and final independent review passed on exact head `b543b38e17a1461cd53c75fb72acb38f38e636ac`, which remains local and unpushed at this evidence boundary. The carrier PR number, carrier reviewed head, carrier merge SHA, carrier-merged `origin/main`, evidence PR, and published-main identity are intentionally `pending`; none is predicted here. Exact-head CI and the carrier PR are pending Task 6, and merge publication is pending Task 7.

The preflight command `git apply --check --3way --index <archived-workflow-a.patch>` exited `0` while reporting 92 fallback paths, 12 clean paths, and exactly one conflict path:

```text
extensions/workflow-register/test/bobGateLifecycle.test.js
```

The preflight index and worktree were immediately clean. Actual application of the 104 remaining frozen paths stopped only on that expected conflict and produced no other missing, extra, or unmerged path after resolution.

## Exact path fidelity

The exact comparison `5280723da6f0660322435255acdaf0ccbd02506f..b543b38e17a1461cd53c75fb72acb38f38e636ac`, excluding only the two evidence-only paths listed below, proves:

- frozen paths: 105;
- added product paths: `.gitattributes` and `extensions/workflow-register/test/workflowCompilerParity.test.js`;
- expected product paths: 107;
- actual product paths: 107;
- missing product paths: `[]`;
- extra product paths: `[]`;
- intentionally omitted paths: `[]`.

The exact sorted 107-path product inventory is:

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
```

The complete carrier branch inventory is derived from those exact 107 paths plus only these two evidence paths, for expected and actual counts of 109 with missing `[]` and extra `[]`:

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

The repository checkout-contract product path is `.gitattributes`, blob `7b7d9a12b2c975a5e0c96e0f94f292e850851b8c`, with exact rule:

```gitattributes
extensions/workflow-register/test/fixtures/workflow-contract-v2/** text eol=lf
```

## Reviewed added-product departure outside the frozen carrier

`extensions/workflow-register/test/workflowCompilerParity.test.js` is the second added product path and is outside the frozen 105-path carrier. It therefore has no frozen target blob and is not a ninth frozen-blob departure. Reviewed remediation commit `b543b38e17a1461cd53c75fb72acb38f38e636ac` changes its base blob `8ef407de08f8e3b1a1c7939b7bb8c0b53dd23018` to final blob `b81b20eb562f31630eb7617928b395602d2cce98` with exactly four insertions and no deletion:

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

## Complete local gate evidence

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

Final invariants were clean status, no push, product 107/107 and branch 109/109 with missing/extra `[]`, historical patch blob `e0946c6a29f7aa17538b1bc89e8160892845fb44`, lifecycle legacy blob `b12c7ffb12015f3be17bb0b3e63af627741f2a01`, and unchanged lock blob `243bfe66b9e441e0c8c002f0ff2324ebfc8d9dc0` / SHA-256 `3e80a76ffb318c969e40e81ddf28ca44c3f53b7252cc392ee159d135e015c985`.

## Current branch `git diff --stat`

Command:

```text
git diff --stat 5280723da6f0660322435255acdaf0ccbd02506f b543b38e17a1461cd53c75fb72acb38f38e636ac
```

Exact summary:

```text
109 files changed, 25468 insertions(+), 1866 deletions(-)
```

## Scope boundary

This evidence proves Workflow A only. It does not claim that Workflow B, Workflow C, any Processing carrier, or the later Workflow/Processing overlap has been resolved. It authorizes no branch, worktree, archive, artifact, or legacy-reference deletion.
