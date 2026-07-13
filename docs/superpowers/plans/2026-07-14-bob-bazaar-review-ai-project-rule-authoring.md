# Bob Bazaar Review AI Project Rule Authoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 利用者が選択したDOCX、XLSX、テキストPDFから、生成AI支援でプロジェクト固有レビュー規約を作成し、人間が規約単位で承認した内容だけを`.bob/review`のproject-owned assetsへ安全に反映する。

**Architecture:** VS Code非依存の`src/ruleAuthoring/`が抽出、hash、chunk、AI入出力検証、差分、適用計画、transactionを担当する。Webviewは選択とHuman Triageだけを担当し、`workflow-register`のcommand/agent stepがBob UIからAI処理を調停する。既存レビュー経路はapproved rule bundleをadditiveに読み込み、旧workspaceとの互換性を維持する。

**Tech Stack:** TypeScript 5.4、VS Code Extension API 1.106、Node.js `fs/promises`・`crypto`・`child_process`、`node:test`、Ajv 8、Mammoth 1.8、Cheerio 1、read-excel-file 9、Poppler `pdftotext`、workflow-register/v1。

## Global Constraints

- 正式なAI提案対象は`.bob/review/checklist.json`、`project-context.md`、`review-prompt-addendum.md`、`rule-sources.json`、`rule-provenance.json`だけとする。
- 原本、抽出本文、absolute path、raw AI response、backup、transaction stagingをGit対象成果物へ含めない。
- AI出力は正式assetへ直接書かず、schema、base hash、citation、operation、conflictをhost側で再検証してからHuman Triageへ渡す。
- file picker以外の暗黙再帰走査、外部文書への書き込み、VCS commit/push/pull、独自network clientを追加しない。
- `.doc`と`.xls`は`requires_conversion`、本文が空のPDFは`requires_ocr`としてAIへ渡さない。
- OOXMLは展開前にZIP32 central directoryをbounded検査し、暗号化、multi-disk、ZIP64、重複entry、危険path、未対応compressionを拒否する。
- source snapshotは抽出前後のstat、full SHA-256、file identityが一致した場合だけ採用する。
- 既存`getBobWorkspaceStatus().initialized`のrequired file集合を変更しない。authoring readinessは別の`getRuleAuthoringWorkspaceStatus()`で評価する。
- heavy dependencyはDOCX/XLSX利用時だけlazy loadし、通常activation経路へ読み込まない。
- workflow AI captureはagent result sinkではなく明示的command stepで行う。providerが1 MiB上限を必ず強制する。
- Palette commandはsource準備と案内を行い、Bob taskを直接生成しない。AI実行は利用者がBob UIからauthoring workflowを開始する。
- scoped test成功後に明示pathだけをlocal commitし、そのcommit相当の変更をGitHub connectorで`codex/bazaar-ai-project-rule-authoring`へ同期する。同期後はremote file内容を再取得して確認する。
- user worktreeの無関係な変更をstage、上書き、削除しない。

---

### Task 1: Domain contracts, paths, limits, source identity, and deterministic chunks

**Files:**
- Create: `extensions/bob-bazaar-review/src/ruleAuthoring/ruleAuthoringTypes.ts`
- Create: `extensions/bob-bazaar-review/src/ruleAuthoring/ruleAuthoringPaths.ts`
- Create: `extensions/bob-bazaar-review/src/ruleAuthoring/ruleAuthoringLimits.ts`
- Create: `extensions/bob-bazaar-review/src/ruleAuthoring/ruleSourceHash.ts`
- Create: `extensions/bob-bazaar-review/src/ruleAuthoring/ruleSourceManifest.ts`
- Create: `extensions/bob-bazaar-review/src/ruleAuthoring/documentChunk.ts`
- Test: `extensions/bob-bazaar-review/test/ruleAuthoringLimits.test.js`
- Test: `extensions/bob-bazaar-review/test/ruleAuthoringPaths.test.js`
- Test: `extensions/bob-bazaar-review/test/ruleSourceHash.test.js`
- Test: `extensions/bob-bazaar-review/test/ruleSourceManifest.test.js`
- Test: `extensions/bob-bazaar-review/test/ruleDocumentChunk.test.js`

**Interfaces:**
- `RULE_AUTHORING_SCHEMA_VERSION`, `RuleSourceManifestV1`, `DocumentChunkV1`, `RuleAuthoringPhase`, `RuleAuthoringPhaseStatus`。
- `getRuleAuthoringPaths(workspaceRoot, runId)`, `validateRuleAuthoringId(value, fieldName)`。
- `DEFAULT_RULE_AUTHORING_LIMITS` with 20 files、25 MiB/source、100 MiB aggregate、32 KiB/chunk、1 MiB index/evidence/proposal、32 MiB PDF output、5,000 ZIP entries、250 MiB declared bytes、200 rule operations、100 context operations、100 prompt operations、256 KiB per approved context/addendum file。
- `fingerprintSource(filePath)`, `assertStableSourceFingerprint(before, after)`。
- `assignSourceIds(sha256Values)` resolves all colliding prefixes together independent of selection order; `buildRuleSourceManifest(input)`。
- `splitDocumentChunk(input, maxBytes)`, `buildDocumentChunkId(sourceId, mediaType, kind, locator)`。

```ts
export interface DocumentChunkV1 {
  schema_version: "bob-bazaar-review/document-chunk/v1"
  chunk_id: string
  source_id: string
  kind: "heading" | "paragraph" | "list" | "table" | "row" | "page"
  locator: {
    heading_path?: string[]
    block_index?: number
    table_index?: number
    sheet?: string
    row?: number
    cell_range?: string
    page?: number
    part_index?: number
  }
  title?: string
  text: string
  text_sha256: string
  flags: string[]
}
```

- [ ] **Step 1: Write failing path, fingerprint, source-ID, and UTF-8 chunk tests**

Tests must prove exact limit values, safe run/source IDs, workspace-contained artifact paths, full 64-character SHA-256, fingerprint change detection, source-ID prefix extension on collision independent of input order, stable chunk IDs including media type, and 32 KiB split without breaking a multibyte code point. A split structural element must receive sequential `part_index` values.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
cd extensions/bob-bazaar-review
npm run compile
node --test test/ruleAuthoringLimits.test.js test/ruleAuthoringPaths.test.js test/ruleSourceHash.test.js test/ruleSourceManifest.test.js test/ruleDocumentChunk.test.js
```

Expected: compile fails because the new modules do not exist.

- [ ] **Step 3: Implement immutable contracts and pure helpers**

Use SHA-256 over exact bytes. `fingerprintSource` returns `{ byteSize, mtimeNs, device, inode, sha256 }` with integer identity values serialized as decimal strings; `assertStableSourceFingerprint` compares every available identity field and digest. Chunk splitting measures `Buffer.byteLength(text, "utf8")`, finds a code-point-safe boundary, and never silently truncates.

- [ ] **Step 4: Run focused tests and source policies**

Run:

```bash
cd extensions/bob-bazaar-review
npm run compile
node --test test/ruleAuthoringLimits.test.js test/ruleAuthoringPaths.test.js test/ruleSourceHash.test.js test/ruleSourceManifest.test.js test/ruleDocumentChunk.test.js
npm run architecture:policy
npm run source:policy
```

Expected: all focused tests and both policies pass.

- [ ] **Step 5: Commit and remote checkpoint**

Commit message: `feat: add project rule authoring contracts`

GitHub checkpoint must contain only the six new modules and five tests, then be verified by fetching one source file and the commit branch head.

### Task 2: Production dependencies, OOXML preflight, and package policy

**Files:**
- Create: `extensions/bob-bazaar-review/src/ruleAuthoring/extraction/ooxmlPreflight.ts`
- Modify: `extensions/bob-bazaar-review/package.json`
- Modify: `extensions/bob-bazaar-review/package-lock.json`
- Modify: `extensions/bob-bazaar-review/.vscodeignore`
- Modify: `extensions/bob-bazaar-review/scripts/check-vsix-policy.js`
- Modify: `extensions/bob-bazaar-review/test/dependencyPolicy.test.js`
- Create: `extensions/bob-bazaar-review/test/helpers/storedZipFixture.js`
- Create: `extensions/bob-bazaar-review/test/ruleOoxmlPreflight.test.js`
- Create: `extensions/bob-bazaar-review/test/ruleAuthoringHeavyDependencyLoading.test.js`
- Create: `extensions/bob-bazaar-review/test/ruleAuthoringPackageSmoke.test.js`

**Interfaces:**
- `preflightOoxmlArchive(filePath, limits): Promise<OoxmlPreflightResult>`。
- `OoxmlPreflightResult` exposes entry count、declared uncompressed bytes、entry names、detected document kind without extracting entries。

- [ ] **Step 1: Write failing dependency, package-budget, and activation non-load policy tests**

Update test expectations first: exact new production dependencies, 12,000,000-byte package limit, runtime/transitive inclusion strategy, and absence of Mammoth、Cheerio、read-excel-file from normal activation. Verify RED against the current package manifest and `.vscodeignore`.

- [ ] **Step 2: Add dependencies and generate the lockfile mechanically**

Run:

```bash
cd extensions/bob-bazaar-review
npm install --save ajv@^8.17.1 cheerio@^1.0.0 mammoth@^1.8.0 read-excel-file@^9.2.0
```

Then change `package:policy` to `--max-bytes 12000000`, keep high production audit blocking, and change `.vscodeignore` to retain production runtime JS/JSON across direct and transitive dependency trees while excluding dependency docs、tests、maps、TypeScript declarations、examples。Extend `check-vsix-policy.js` so package verification requires the metadata and load entry of each installed production dependency tree, not only `out/extension.js`。

- [ ] **Step 3: Write failing ZIP fixture tests**

Create ZIP32 buffers inside the test; do not commit binary Office fixtures. Tests must cover valid DOCX/XLSX signatures, missing EOCD, truncated central directory, entry count/declared size overflow, `../`、absolute、drive-relative、UNC、device/control-character paths, duplicate entries, encrypted flag, unsupported compression, multi-disk, and ZIP64 marker rejection.

- [ ] **Step 4: Complete the lazy-load contract test**

Spawn Node against `out/extension.js` with a stubbed `vscode` module and assert `require.cache` does not contain Mammoth、Cheerio、read-excel-file before an extractor is invoked. Task 3 extends this test to prove the relevant dependency appears only after its extractor is called.

- [ ] **Step 5: Run focused tests and verify RED**

Run:

```bash
cd extensions/bob-bazaar-review
npm run compile
node --test test/ruleOoxmlPreflight.test.js test/ruleAuthoringHeavyDependencyLoading.test.js test/dependencyPolicy.test.js
```

Expected: preflight module and updated policy assertions fail.

- [ ] **Step 6: Implement bounded asynchronous central-directory parsing**

Read only the bounded EOCD tail and central-directory range. Validate ZIP32 offsets and signatures before iterating entries. Normalize separators for validation but retain original entry names for diagnostics. Never inflate an archive entry in this module.

- [ ] **Step 7: Verify dependency, audit, and package policy inputs**

Run:

```bash
cd extensions/bob-bazaar-review
npm run compile
node --test test/ruleOoxmlPreflight.test.js test/ruleAuthoringHeavyDependencyLoading.test.js test/dependencyPolicy.test.js
npm run audit:prod
npm run package
npm run package:policy
node --test test/ruleAuthoringPackageSmoke.test.js
```

Expected: all focused tests pass, production audit reports no high-or-higher vulnerability, and the VSIX contains every required runtime module within 12,000,000 bytes.

- [ ] **Step 8: Commit and remote checkpoint**

Commit message: `feat: add bounded OOXML preflight`

### Task 3: DOCX, XLSX, and PDF extraction pipeline

**Files:**
- Create: `extensions/bob-bazaar-review/src/ruleAuthoring/extraction/documentExtractor.ts`
- Create: `extensions/bob-bazaar-review/src/ruleAuthoring/extraction/docxExtractor.ts`
- Create: `extensions/bob-bazaar-review/src/ruleAuthoring/extraction/xlsxExtractor.ts`
- Create: `extensions/bob-bazaar-review/src/ruleAuthoring/extraction/pdfExtractor.ts`
- Test: `extensions/bob-bazaar-review/test/ruleDocxExtraction.test.js`
- Test: `extensions/bob-bazaar-review/test/ruleXlsxExtraction.test.js`
- Test: `extensions/bob-bazaar-review/test/rulePdfExtraction.test.js`
- Test: `extensions/bob-bazaar-review/test/ruleDocumentExtraction.test.js`
- Test: `extensions/bob-bazaar-review/test/fixtures/rule-documents/README.md`

**Interfaces:**
- `extractRuleDocument(request): Promise<DocumentExtractionResult>` classifies `.doc/.xls`, fingerprints before/after, preflights OOXML, dispatches by extension, and discards an unstable snapshot。
- `extractRuleDocuments(requests, existingManifest, limits): Promise<RuleDocumentBatchResult>` enforces run-wide file/byte limits and detects full-hash duplicates both within the batch and against approved `rule-sources.json` independent of input order。
- `extractDocx(filePath, context)`, `extractXlsx(filePath, context)`, `extractPdf(filePath, options)` return ordered `DocumentChunkV1[]`, status, warnings, extractor identity。
- PDF execution uses the existing `runExternalProcess` contract with `shell: false`, arguments `[-layout, -enc, UTF-8, absolutePath, -]`, timeout、AbortSignal、32 MiB combined cap。

- [ ] **Step 1: Add generated fixture builders and failing DOCX tests**

Generate minimal OOXML ZIPs during tests. Assert heading path, paragraph/list/table document order, block/table locators, Mammoth warnings, image omission, and split `part_index`.

- [ ] **Step 2: Add failing XLSX tests**

Assert sheet order, preservation of original Excel row numbers including blank rows, minimum/maximum non-empty cell range, saved formula/value handling without execution, and 32 KiB row splitting.

- [ ] **Step 3: Add failing PDF runner tests**

Inject a fake process runner. Assert exact argument array, `shell: false`, form-feed page split, preservation of interior blank pages, removal of only the final trailing blank page, empty output `requires_ocr`, low-density warning, timeout、abort、output overflow mapping.

- [ ] **Step 4: Add failing dispatcher tests**

Assert `.doc/.xls` local-only classification, unsupported extension rejection, 25 MiB source limit, run-wide file/aggregate-limit accounting, pre/post fingerprint mismatch rejection, duplicate full hash reporting within the run and against an existing manifest, and sanitized remote-safe diagnostics.

- [ ] **Step 5: Run extraction tests and verify RED**

Run:

```bash
cd extensions/bob-bazaar-review
npm run compile
node --test test/ruleDocxExtraction.test.js test/ruleXlsxExtraction.test.js test/rulePdfExtraction.test.js test/ruleDocumentExtraction.test.js
```

- [ ] **Step 6: Implement format adapters and dispatcher**

Lazy-load Mammoth/Cheerio/read-excel-file inside the relevant function. Extend the heavy-dependency test to prove each dependency is absent before and present only after its matching extractor call. Disable or ignore images explicitly. Never evaluate formulae or refresh external links. The dispatcher stores no absolute path in `RuleSourceManifestV1`; local source mapping is returned separately, and `.doc/.xls` never enter the shared manifest or AI input.

- [ ] **Step 7: Verify extraction and regression boundaries**

Run:

```bash
cd extensions/bob-bazaar-review
npm run compile
node --test test/ruleDocxExtraction.test.js test/ruleXlsxExtraction.test.js test/rulePdfExtraction.test.js test/ruleDocumentExtraction.test.js test/externalProcessRunner.test.js
npm run architecture:policy
npm run source:policy
```

Expected: all focused tests and policies pass.

- [ ] **Step 8: Commit and remote checkpoint**

Commit message: `feat: extract bounded project rule sources`

This remote checkpoint completes the deterministic extraction foundation.

### Task 4: Source index, evidence validation, and resumable authoring run store

**Files:**
- Create: `extensions/bob-bazaar-review/src/ruleAuthoring/sourceIndex.ts`
- Create: `extensions/bob-bazaar-review/src/ruleAuthoring/evidenceSelection.ts`
- Create: `extensions/bob-bazaar-review/src/ruleAuthoring/ruleAuthoringRunStore.ts`
- Test: `extensions/bob-bazaar-review/test/ruleSourceIndex.test.js`
- Test: `extensions/bob-bazaar-review/test/ruleEvidenceSelection.test.js`
- Test: `extensions/bob-bazaar-review/test/ruleAuthoringRunStore.test.js`
- Test: `extensions/bob-bazaar-review/test/ruleAuthoringRunSymlink.test.js`
- Test: `extensions/bob-bazaar-review/test/ruleAuthoringPrivacy.test.js`

**Interfaces:**
- `buildRuleSourceIndex(manifest, chunks, limitBytes): RuleSourceIndexV1` exposes logical names、locators、titles、bounded previews、byte counts, never full text。
- `parseEvidenceSelection(raw, index)`, `loadSelectedEvidence(selection, chunks, limitBytes)` reject unknown IDs, deduplicate repeated IDs in first-occurrence order, and wrap text in untrusted-evidence delimiters。
- `createRuleAuthoringRun(input)`, `readRuleAuthoringRun(paths)`, `writeRuleAuthoringRun(run, expectedUpdatedAt?)`, `listIncompleteRuleAuthoringRuns(workspaceRoot)`。

- [ ] **Step 1: Write failing index and evidence tests**

Tests must prove deterministic ordering, 1 MiB index hard failure without truncation, preview redaction, strict JSON shape, duplicate removal policy, unknown-ID rejection, source/hash consistency, exact UTF-8 evidence accounting, and 1 MiB evidence hard failure.

- [ ] **Step 2: Write failing run store and privacy tests**

Cover temp-plus-rename, stale `expectedUpdatedAt`, malformed/schema-invalid JSON, phase transitions, incomplete-run listing, restart resume, path containment and symlink rejection, `.gitignore` semantics, and absence of raw text/absolute paths from shareable manifest helpers.

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```bash
cd extensions/bob-bazaar-review
npm run compile
node --test test/ruleSourceIndex.test.js test/ruleEvidenceSelection.test.js test/ruleAuthoringRunStore.test.js test/ruleAuthoringRunSymlink.test.js test/ruleAuthoringPrivacy.test.js
```

- [ ] **Step 4: Implement the pure index/evidence layer and atomic store**

Use explicit phase order `sources -> extraction -> evidence_selection -> proposal -> human_review -> apply -> completed`. A failed phase preserves the last valid deterministic artifacts and records bounded issues without source text.

- [ ] **Step 5: Run focused tests and policies**

Expected: all four tests pass together with architecture/source policies.

- [ ] **Step 6: Commit and remote checkpoint**

Commit message: `feat: persist project rule authoring runs`

### Task 5: Proposal schema, semantic validation, managed Markdown, and stable IDs

**Files:**
- Create: `extensions/bob-bazaar-review/src/ruleAuthoring/ruleProposalSchema.ts`
- Create: `extensions/bob-bazaar-review/src/ruleAuthoring/ruleProposalValidation.ts`
- Create: `extensions/bob-bazaar-review/src/ruleAuthoring/ruleProposalDiff.ts`
- Create: `extensions/bob-bazaar-review/src/ruleAuthoring/ruleIdAllocator.ts`
- Create: `extensions/bob-bazaar-review/src/ruleAuthoring/managedMarkdownSections.ts`
- Test: `extensions/bob-bazaar-review/test/ruleProposalValidation.test.js`
- Test: `extensions/bob-bazaar-review/test/ruleProposalDiff.test.js`
- Test: `extensions/bob-bazaar-review/test/ruleIdAllocator.test.js`
- Test: `extensions/bob-bazaar-review/test/ruleManagedMarkdown.test.js`

**Interfaces:**
- `parseAndValidateRuleProposal(raw, context): RuleProposalValidationResult` enforces 1 MiB、Ajv schema、run ID、base hashes、operation matrix、target existence、citation existence、conflicts。
- `diffRuleProposal(proposal, currentBundle): RuleProposalDiff` returns add/update/retire and context/prompt changes without mutation。
- `allocateRuleIds(existingIds, count)` yields monotonic `PRJ-NNNN`; managed sections use `CTX-NNNN` and `PRM-NNNN`。
- `parseManagedMarkdown(text, kind)`, `applyManagedMarkdownOperations(parsed, decisions)` preserve manual text byte-for-byte outside extension markers。

```ts
export interface RuleProposalOperationV1 {
  candidate_id: string
  operation: "add" | "update" | "retire"
  target_rule_id: string | null
  rule: {
    category: string
    title: string
    description: string
    severity_on_fail: "error" | "warning" | "info"
    applies_when: string[]
    evidence_required: boolean
    review_hint: string
  } | null
  source_refs: Array<{ source_id: string; chunk_id: string }>
  confidence: "high" | "medium" | "low"
  rationale: string
  conflict_ids: string[]
}
```

- [ ] **Step 1: Write failing schema and semantic tests**

Cover valid add/update/retire, unknown properties, duplicate candidate IDs, invalid severity, add with target, update/retire without target, nonexistent citation, chunk/source ownership mismatch, stale base hash, unresolved blocking conflict, oversized raw JSON, fenced Markdown rejection, and strict `JSON.parse` acceptance of a single JSON object only. Locator/text-hash provenance is derived from the matched stored chunk during apply rather than trusted from AI output.

- [ ] **Step 2: Write failing diff, ID, and Markdown tests**

Cover deterministic order, no-op updates, retire history retention, holes in existing IDs, malformed/duplicate/nested markers, marker ID collision, newline preservation, and untouched manual prose.

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```bash
cd extensions/bob-bazaar-review
npm run compile
node --test test/ruleProposalValidation.test.js test/ruleProposalDiff.test.js test/ruleIdAllocator.test.js test/ruleManagedMarkdown.test.js
```

- [ ] **Step 4: Implement validation before transformation**

Compile Ajv once lazily. Return normalized issues as `{ path, code, message, operationId? }` and never interpolate source text. Perform base/citation checks after JSON Schema succeeds; do not coerce AI values.

- [ ] **Step 5: Verify focused tests and policies**

Expected: all tests pass with architecture/source policies.

- [ ] **Step 6: Commit and remote checkpoint**

Commit message: `feat: validate project rule proposals`

### Task 6: Apply planning, recoverable transaction, and startup recovery

**Files:**
- Create: `extensions/bob-bazaar-review/src/ruleAuthoring/ruleApplyPlan.ts`
- Create: `extensions/bob-bazaar-review/src/ruleAuthoring/ruleApplyTransaction.ts`
- Modify: `extensions/bob-bazaar-review/src/projectRules/io.ts`
- Test: `extensions/bob-bazaar-review/test/ruleApplyPlan.test.js`
- Test: `extensions/bob-bazaar-review/test/ruleApplyTransaction.test.js`
- Test: `extensions/bob-bazaar-review/test/ruleApplyRecovery.test.js`

**Interfaces:**
- `buildRuleApplyPlan(bundle, proposal, decisions, evidence): RuleApplyPlan` materializes all five target bytes and expected pre-image hashes without writing。
- `executeRuleApplyTransaction(plan, options): ApplyManifestV1` stages, journals, backs up, atomically replaces each file, verifies post-image, and commits or rolls back。
- `findIncompleteRuleApplyTransactions(workspaceRoot)`, `recoverRuleApplyTransaction(workspaceRoot, validatedTransactionId, action)`; callers cannot supply an arbitrary transaction path。
- Extend `getProjectRulesPaths` additively with context、addendum、sources、provenance paths while preserving existing fields。

- [ ] **Step 1: Write failing apply-plan tests**

Prove selective accept/reject/edit, unresolved conflict blocking, stable ID allocation, manual Markdown preservation, 256 KiB context/addendum hard failures without truncation, source/provenance referential integrity, retire removal from active checklist with retained history, deterministic bytes, and stale pre-image rejection.

- [ ] **Step 2: Write failing transaction and recovery tests**

Inject filesystem operations to fail before first replace, midway, during rollback, and after all replaces before commit. Verify target transitions `prepared -> replaced -> restored`, overall transitions `prepared -> applying -> committed` or `rolling_back -> rolled_back/rollback_failed`, reverse-order restore, backup retention, workspace-level mutual exclusion, symlink rejection, and restart recovery idempotence.

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```bash
cd extensions/bob-bazaar-review
npm run compile
node --test test/ruleApplyPlan.test.js test/ruleApplyTransaction.test.js test/ruleApplyRecovery.test.js
```

- [ ] **Step 4: Implement byte-oriented plan and journal-first transaction**

Every journal write uses temp-plus-rename and fsync where supported. Before each replace, re-hash the live target against the plan. Missing pre-image is represented explicitly, not as an empty hash. A workspace-level mutex prevents overlapping authoring transactions, and physical containment rejects symlink targets. On any failure, stop forward progress and restore replaced targets in reverse order.

- [ ] **Step 5: Run focused tests and existing project-rule tests**

Run the three new tests plus `projectRulesRequiredWiring.test.js`, `projectRulesPath.test.js`, and architecture/source policies.

- [ ] **Step 6: Commit and remote checkpoint**

Commit message: `feat: apply project rules transactionally`

### Task 7: Source selection and extraction Wizard

**Files:**
- Create: `extensions/bob-bazaar-review/src/ui/ruleAuthoringGui.ts`
- Create: `extensions/bob-bazaar-review/src/ui/ruleAuthoringGuiHtml.ts`
- Test: `extensions/bob-bazaar-review/test/ruleAuthoringGui.test.js`
- Modify: `extensions/bob-bazaar-review/test/guiFirstSurfaces.test.js`

**Interfaces:**
- `openRuleAuthoringGui(context, initial?): Promise<RuleAuthoringGuiResult>` opens/resumes a run, detects incomplete transactions first, and holds workflow completion until extraction scope is confirmed。
- Host message allowlist: `chooseSources`, `removeSource`, `extractSources`, `setChunkIncluded`, `confirmAiPayload`, `resumeRun`, `cancelRun`。
- `renderRuleAuthoringGuiHtml(model, nonce)` renders environment、source status、warnings、scope、AI payload logical names/chunk count/UTF-8 bytes、configured Bob model route, with no raw source text in DOM unless the user explicitly opens a bounded preview。

- [ ] **Step 1: Write failing render/security tests**

Assert CSP nonce, no inline handlers, HTML escaping, no absolute-path rendering, no raw text in initial model, exact message allowlist, configured Bob model route display, disabled AI consent for blocked/overflow sources, and separate conversion/OCR guidance.

- [ ] **Step 2: Write failing host orchestration tests with VS Code fakes**

Cover multi-select picker filters including legacy Office classification, cancel, aggregate limits, duplicate source confirmation, partial extraction exclusion approval, resume after restart, and workflow-held completion metadata.

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```bash
cd extensions/bob-bazaar-review
npm run compile
node --test test/ruleAuthoringGui.test.js test/guiFirstSurfaces.test.js
```

- [ ] **Step 4: Implement a thin Webview over tested domain functions**

Resolve selected URIs only in the extension host. Map absolute paths to run-local IDs before posting models. Require a second explicit action for AI payload consent after extraction completes.

- [ ] **Step 5: Verify focused tests and Webview policy tests**

Expected: new tests and existing GUI security/source-layout tests pass.

- [ ] **Step 6: Commit and remote checkpoint**

Commit message: `feat: add project rule source wizard`

### Task 8: Proposal Human Triage, apply preview, and completion verification

**Files:**
- Create: `extensions/bob-bazaar-review/src/ui/ruleProposalTriageGui.ts`
- Create: `extensions/bob-bazaar-review/src/ui/ruleProposalTriageGuiHtml.ts`
- Test: `extensions/bob-bazaar-review/test/ruleProposalTriageGui.test.js`
- Test: `extensions/bob-bazaar-review/test/ruleAuthoringCompletion.test.js`

**Interfaces:**
- `openRuleProposalTriageGui(context, input): Promise<RuleAuthoringDecisionResult>` loads only a validated proposal and persists decision overlays separately。
- Host messages: `setDecision`, `editRule`, `resolveConflict`, `openEvidence`, `previewApply`, `applyApproved`, `recoverTransaction`, `close`。
- `verifyRuleAuthoringApply(input)` validates committed manifest, current target hashes, source/provenance references, and completed run phase。

- [ ] **Step 1: Write failing model/render tests**

Assert operation grouping, add/update/retire display, source count/locator without absolute path, escaped AI text, blocking conflicts, required decision state, edited-rule host validation, and unchanged raw proposal artifact.

- [ ] **Step 2: Write failing apply/recovery orchestration tests**

Cover selective decisions, stale bundle warning, preview regeneration, explicit modal confirmation, transaction result display, rollback recovery before resume, and verification failure when manifest or post-image is missing.

- [ ] **Step 3: Run focused tests and verify RED**

Run the two new tests after compile.

- [ ] **Step 4: Implement triage as decision overlay plus deterministic apply**

Webview never supplies a target path or command ID. The host resolves operation IDs against the stored validated proposal and re-runs all validation immediately before apply.

- [ ] **Step 5: Verify focused and transaction regression tests**

Expected: triage/completion tests plus Task 6 tests pass.

- [ ] **Step 6: Commit and remote checkpoint**

Commit message: `feat: triage and apply authored project rules`

### Task 9: Workflow actions, template, provider registration, workspace readiness, and public command

**Files:**
- Create: `extensions/bob-bazaar-review/src/workflow/ruleAuthoringWorkflowActions.ts`
- Modify: `extensions/bob-bazaar-review/src/workflow/workflowProviders.ts`
- Modify: `extensions/bob-bazaar-review/src/workflow/workflowRegisterBridge.ts`
- Modify: `extensions/bob-bazaar-review/src/workspace/bobWorkspaceInit.ts`
- Modify: `extensions/bob-bazaar-review/src/workspace/workspaceCommands.ts`
- Modify: `extensions/bob-bazaar-review/src/extension.ts`
- Modify: `extensions/bob-bazaar-review/package.json`
- Create: `extensions/bob-bazaar-review/templates/.bob/review/project-context.md`
- Create: `extensions/bob-bazaar-review/templates/.bob/review/review-prompt-addendum.md`
- Create: `extensions/bob-bazaar-review/templates/.bob/review/rule-sources.json`
- Create: `extensions/bob-bazaar-review/templates/.bob/review/rule-provenance.json`
- Create: `extensions/bob-bazaar-review/templates/.bob/review/rule-authoring/.gitignore`
- Create: `extensions/bob-bazaar-review/templates/.bob/workflows/bazaar-project-rule-authoring/WORKFLOW.md`
- Create: `.bob/workflows/bazaar-project-rule-authoring/WORKFLOW.md`
- Modify: `docs/workflows/action-provider-contracts.json`
- Create: `extensions/bob-bazaar-review/test/ruleAuthoringWorkflowActions.test.js`
- Create: `extensions/bob-bazaar-review/test/ruleAuthoringWorkflowTemplate.test.js`
- Modify: `extensions/bob-bazaar-review/test/workflowProviderRegistration.test.js`
- Modify: `extensions/bob-bazaar-review/test/workflowTemplate.test.js`
- Modify: `extensions/bob-bazaar-review/test/templateRefresh.test.js`
- Modify: `extensions/workflow-register/test/workflowContractFiles.test.js`

**Provider IDs:**
- `bobBazaar.openRuleAuthoringGui`
- `bobBazaar.loadRuleSourceIndex`
- `bobBazaar.captureRuleEvidenceSelection`
- `bobBazaar.loadSelectedRuleEvidence`
- `bobBazaar.captureRuleProposal`
- `bobBazaar.openRuleProposalTriageGui`
- `bobBazaar.verifyRuleAuthoringApply`

**Public command:** `bobBazaar.authorProjectRulesFromDocuments` opens the Wizard and, after consent-ready extraction, shows deterministic instructions to start `bazaar-project-rule-authoring` in Bob UI.

- [ ] **Step 1: Write failing workflow action tests**

Cover workflow/run identity resolution, exact artifact paths, idempotent resume, invalid raw JSON, unknown chunk IDs, 1 MiB boundaries, proposal capture validation, `{ status: "error", issues }` failure shape, `$workflow.artifacts`, and final apply verification.

The first GUI command returns `authoringSession` containing the stable `run_id`. Every later provider resolves that same run only from `state.authoringSession` plus workflow context and rejects a mismatched caller-supplied ID.

- [ ] **Step 2: Write the strict workflow template test before the template**

Require exactly these steps in order: `select-and-extract`, `load-source-index`, `select-evidence`, `capture-evidence-selection`, `load-selected-evidence`, `draft-rule-proposal`, `capture-proposal`, `human-review-and-apply`, `verify-authoring-apply`.

The test must assert:

- command/agent types and provider IDs;
- `stepCompletion: manual` plus `stepReview.enabled: false`, `pauseAfter: none`, `requireAcceptBeforeNext: false`;
- `completeOnSuccess: false` on both GUI steps;
- agent result keys `ruleEvidenceSelectionRaw` and `ruleProposalRaw`;
- explicit command args objects `text: "{{state.ruleEvidenceSelectionRaw}}"` and `text: "{{state.ruleProposalRaw}}"`;
- no command-only `maxResultBytes` on agent steps;
- all non-result steps have prompts;
- `guardrails.allowedCommands` contains all seven providers;
- template/root mirror equality and run-scoped artifacts.

- [ ] **Step 3: Run focused workflow tests and verify RED**

Run:

```bash
cd extensions/bob-bazaar-review
npm run compile
node --test test/ruleAuthoringWorkflowActions.test.js test/ruleAuthoringWorkflowTemplate.test.js test/workflowProviderRegistration.test.js test/workflowTemplate.test.js test/templateRefresh.test.js
```

- [ ] **Step 4: Implement actions and owned provider registration**

Keep provider ID strings directly visible in `workflowProviders.ts` for catalog tests. Preserve `sourceId: "local.bob-bazaar-review"`, disposal, retry registration, and old four providers. Do not add `runWorkflow` to the public-command path.

- [ ] **Step 5: Implement separate authoring readiness and missing-only templates**

`getRuleAuthoringWorkspaceStatus()` checks companion assets/workflow independently. Initialization copies empty project-owned files only when missing, refreshes only the managed authoring workflow with confirmation, and leaves existing `getBobWorkspaceStatus()` compatibility unchanged. Refactor `workflowTemplateStaleReason(workflowPath, expectedTitle)` so review and authoring workflows are checked against their own titles. Authoring workflow `requires.files` and preflight must not require optional companion files before the first GUI/provider has initialized them.

- [ ] **Step 6: Register package command/configuration**

Add activation/contribution/palette entries and configuration keys:

- `bobBazaar.ruleAuthoring.pdfToTextPath` default `pdftotext`;
- `maxSourceFiles` default 20;
- `maxSourceBytes` default 26214400;
- `maxAggregateSourceBytes` default 104857600;
- `maxChunkBytes` default 32768;
- `maxSelectedEvidenceBytes` default 1048576.

Validate configuration values against hard maximums in the host; package settings cannot raise ZIP/PDF/proposal safety ceilings.

- [ ] **Step 7: Run extension and cross-extension contract tests**

Run:

```bash
cd extensions/bob-bazaar-review
npm run compile
node --test test/ruleAuthoringWorkflowActions.test.js test/ruleAuthoringWorkflowTemplate.test.js test/workflowProviderRegistration.test.js test/workflowTemplate.test.js test/templateRefresh.test.js
cd ../workflow-register
npm run compile
node --test test/workflowContractFiles.test.js
```

Expected: all workflow, provider-catalog, mirror, and refresh contracts pass.

- [ ] **Step 8: Commit and remote checkpoint**

Commit message: `feat: orchestrate AI project rule authoring`

This remote checkpoint completes workflow and AI handoff.

### Task 10: Approved rule bundle integration, stable Skill, and MCP reads

**Files:**
- Create: `extensions/bob-bazaar-review/src/ruleAuthoring/ruleBundle.ts`
- Modify: `extensions/bob-bazaar-review/src/projectRules/io.ts`
- Modify: `extensions/bob-bazaar-review/src/projectRules/packet.ts`
- Modify: `extensions/bob-bazaar-review/src/workflow/workflowActions.ts`
- Modify: `extensions/bob-bazaar-review/src/bazaar/bazaarReviewCommands.ts`
- Modify: `extensions/bob-bazaar-review/src/ui/reviewGui.ts`
- Modify: `extensions/bob-bazaar-review/src/mcp/projectRulesTools.ts`
- Modify: `extensions/bob-bazaar-review/src/mcp/toolSchemas.ts`
- Modify: `extensions/bob-bazaar-review/src/mcp/tools.ts`
- Modify: `extensions/bob-bazaar-review/templates/.bob/skills/project-review-checklist/SKILL.md`
- Modify: `extensions/bob-bazaar-review/templates/.bob/review/review-prompt-template.md`
- Create: `extensions/bob-bazaar-review/test/projectRuleBundle.test.js`
- Modify: `extensions/bob-bazaar-review/test/projectRulesRequiredWiring.test.js`
- Modify: `extensions/bob-bazaar-review/test/mcpSourceLayout.test.js`
- Modify: `extensions/bob-bazaar-review/test/mcpWriteTools.test.js`

**Interfaces:**
- `loadProjectRuleBundle(workspaceRoot, options): Promise<ProjectRuleBundle>` returns checklist、review schema、optional context/addendum、bounded provenance summary、base hashes。Each optional Markdown file has a 256 KiB hard limit and is rejected rather than truncated。
- `buildProjectRulesSectionFromBundle(bundle, limits)` becomes the shared packet renderer used by direct commands、Review GUI、workflow actions。
- Add read-only MCP tools `project_rules_get_context` and `project_rules_get_provenance`; keep `PROJECT_RULES_WRITE_TOOL_NAMES` unchanged。

- [ ] **Step 1: Write failing bundle compatibility tests**

Cover old workspace with only checklist/schema, optional empty files, exact 256 KiB context/addendum boundaries and overflow rejection, malformed optional JSON, deterministic hashes, provenance summary without document text, and identical rendered section across all three callers.

- [ ] **Step 2: Write failing MCP and Skill contract tests**

Assert both new tools are read-only, workspace-contained, schema-declared, bounded, and preserve old response shapes. Assert the stable Skill and `review-prompt-template.md` read context/addendum only when present and never read ignored authoring artifacts.

- [ ] **Step 3: Run focused tests and verify RED**

Run the bundle test plus existing project-rule/MCP contract tests after compile.

- [ ] **Step 4: Centralize bundle loading and update consumers additively**

Keep `loadReviewRules()` existing checklist/schema fields byte-compatible and append optional fields only. Missing companion assets are empty values, not initialization failure.

- [ ] **Step 5: Run focused regression tests**

Expected: bundle, workflow action, direct command, GUI, MCP, packaged Skill contract, and old-workspace tests pass.

- [ ] **Step 6: Commit and remote checkpoint**

Commit message: `feat: load approved project rule bundle`

### Task 11: Documentation, full gates, package evidence, and Windows UAT runbook

**Files:**
- Modify: `extensions/bob-bazaar-review/README.md`
- Create: `extensions/bob-bazaar-review/docs/project-rule-authoring.md`
- Create: `extensions/bob-bazaar-review/docs/project-rule-authoring-windows-uat.md`
- Modify: `extensions/bob-bazaar-review/test/architectureContracts.test.js`
- Modify: `extensions/bob-bazaar-review/test/extensionSourceLayout.test.js`
- Modify: `extensions/bob-bazaar-review/test/markdownFence.test.js`
- Create: `extensions/bob-bazaar-review/test/ruleAuthoringDocumentation.test.js`

- [ ] **Step 1: Write documentation contract tests**

Require supported/unsupported formats, privacy boundary, Poppler configuration, Bob UI workflow start, AI consent, Human Triage, recovery, project-owned versus ignored artifacts, old-workspace compatibility, and Windows UAT commands. Documentation must not promise one-click Bob task launch.

- [ ] **Step 2: Update operator and UAT documentation**

The UAT runbook records extension version、OS、Bob/workflow-register versions、Poppler version、fixture hashes、selected bytes、rule decisions、transaction ID、final asset hashes, and approved-rule review evidence. Include conversion/OCR cases, conflicting sources, resume, induced write failure, and rollback confirmation.

- [ ] **Step 3: Run complete extension gates**

Run:

```bash
cd extensions/bob-bazaar-review
npm ci
npm test
npm run architecture:policy
npm run source:policy
npm run unused:policy
npm run artifact:policy
npm run dependency:policy
npm run audit:prod
npm run package
npm run package:policy
npm run package:metrics
```

Expected:

- TypeScript compile and every `node:test` pass;
- architecture/source/unused/artifact/dependency policies pass;
- production audit has no high-or-higher finding;
- VSIX is at most 12,000,000 bytes;
- package metrics show required runtime modules and exclude tests/docs/maps/types from bundled dependency trees.

- [ ] **Step 4: Run repository workflow contracts and dirty-artifact checks**

Run:

```bash
cd ../workflow-register
npm ci
npm test
cd ../..
git diff --check
git status --short
```

Expected: workflow-register regression suite passes, `git diff --check` is silent, and only intentional source/docs/tests plus an ignored or removable local VSIX artifact are present.

- [ ] **Step 5: Perform Windows UAT before release readiness**

Follow `docs/project-rule-authoring-windows-uat.md` on Windows with Microsoft Office documents, Poppler, Bob, and workflow-register. Commit only the redacted UAT evidence; never commit documents, extracted text, paths, raw model output, backups, or run-local state.

- [ ] **Step 6: Final commit, remote checkpoint, and remote verification**

Commit message: `docs: complete project rule authoring delivery`

Sync the complete verified branch to `katamor1/bob_builtin_analyze` branch `codex/bazaar-ai-project-rule-authoring`. Fetch the remote plan, workflow template, package manifest, and representative implementation/test files; compare their SHA-256 with local content. Report Windows UAT as pending unless the actual Windows evidence was produced.
