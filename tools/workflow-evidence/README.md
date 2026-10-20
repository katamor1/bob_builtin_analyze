# Workflow discovery evidence

These build tools inventory tracked V1 contributions and compile explicitly published V2 collections through the existing P4 compiler and P7 manifest encoder. They do not register commands, activate the V2 runtime, or extract executable code from a VSIX.

Build the current compiler before running any evidence command:

```sh
npm ci --prefix extensions/workflow-register
npm run compile --prefix extensions/workflow-register
node --test --test-concurrency=2 tools/workflow-evidence/test/*.test.mjs
```

The two shared CLI entrypoints accept an exact 40-character commit, a canonical subjects JSON file containing `{path, expectedSha256, expectedBytes}` rows, and tracked repository-relative control paths:

```sh
node tools/workflow-evidence/generate-workflow-contract-report.mjs \
  --commit <40-lowercase-hex-commit> --subjects subjects.json \
  --provider-catalog extensions/workflow-register/test/fixtures/workflow-contract-v2/manifest-provider-catalog.json \
  --collections tools/workflow-evidence/test/fixtures/ci-collections.json \
  --output-directory fresh-evidence
```

`discover-tracked-workflows.mjs` accepts the same arguments. Without an output directory it prints discovery JSON; with a directory it publishes the same four files. Add `--check` to compare an existing directory without writing, opening for write, building a helper, or renaming. Unknown/repeated flags, branch names, manually supplied catalogs, and compiler selection are rejected.

The portable directory contains exactly `catalog.json`, `discovery.json`, `report.json`, and `compiled-plan-manifest.json`. Files are canonical UTF-8 JSON with one LF and bounded at 8 MiB each. Commit/OS/build/locator information lives in external receipts. Git blobs and copied VSIX bytes supply the inputs; edits to the live checkout cannot replace tracked control or package bytes.

Publication requires an existing direct parent and a fresh destination on that volume. Linux requires `cc` and kernel/filesystem support for `renameat2(RENAME_NOREPLACE)`. Windows requires PowerShell 7 and `Add-Type`; its small build-only helper calls `MoveFileExW` with flags zero. Neither backend falls back to replacement or cross-volume copying. The four files are flushed and closed before one promotion. Occupied destinations remain intact. Failed staging directories and native source/binary/compiler receipts are retained, including uncertain outcomes; there is no recursive cleanup or rollback.

CI first packages the three actual extensions on Ubuntu. `prepare` accepts one VSIX in each producer job and all three verified producer bundles in the subject job:

```sh
node tools/workflow-evidence/ci-evidence.mjs prepare producer-subject actual.vsix
node tools/workflow-evidence/ci-evidence.mjs prepare common-subject --bundles workflow-subject bazaar-subject consistency-subject
node tools/workflow-evidence/ci-evidence.mjs generate common-subject os-output
node tools/workflow-evidence/compare-evidence.mjs ubuntu-output windows-output
```

Both OS jobs download the same descriptor, receipt and exact three VSIX files. Generation checks actual checkout HEAD/tree, tracked control digests, and VSIX hashes/sizes before publishing. The tracked CI collection contains an existing published minimal package, so compilation is nonempty. Comparison requires both OS identities, identical source/VSIX bindings, matching receipt digests and exact bytes for all four files. The Windows and Linux native receipts remain external and are retained in the uploaded OS artifacts. A copied local artifact with a changed OS label is useful only as a comparison unit test; real portability acceptance requires both CI jobs.
