# Workflow Reproducible Runtime v2 Foundation and Authority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Phase 4 の既存 run/event/journal/lease を壊さずに、v1 不変 prefix と v2 authoritative event、deterministic projection、event-head CAS、journal v2、legacy import、projection rebuild を導入する。

**Architecture:** 最初に現在の exact bytes を fixture 化し、canonical-json/v1、run-state/v2、run-event/v2 の codec と pure projector を read-only で追加する。shadow comparison が一致した後だけ、既存 lease proof と event-head CAS を要求する RunCommitCoordinator を canary run に接続する。run.json と execution-manifest.json は event stream から再生成できる projection とし、legacy run は explicit mutation または operator-approved import 時に一度だけ cutover/import event を append する。

**Tech Stack:** TypeScript、Node.js fs/promises、JSONL、SHA-256、node:test、既存 RunLock/RunStateStore/RunStateJournal。

## Global Constraints

- Canonical design: ../specs/2026-07-17-workflow-reproducible-runtime-v2-design.md。
- v1 stream の既存 line、whitespace、timestamp、ID、hash は更新しない。
- canonical-json/v1 は array order 保持、object key の Unicode code-unit sort、undefined property 省略、non-finite/非 JSON 値拒否、compact UTF-8、末尾 LF とする。
- projection JSON は deterministic array sort 後、JSON.stringify(value, null, 2) と末尾 LF を使う。
- run.created、run.imported、stream.cutover では previousStateHash を持たない。それ以外の v2 event は直前 v2 event の stateHash と一致させる。
- corrupt stream、unknown schema、unknown canonicalization version は projection へ fallback せず fail closed とする。
- final torn line は journal が exact bytes と expected offset を証明した場合だけ recovery 対象とする。
- read-only shadow phase では production bytes を変更しない。
- authoritative write は lease proof と event-head CAS の両方が必要で、projection failure は canonical event を rollback しない。
- pure projector は filesystem、clock、random、environment、VS Code API、Bob API を参照しない。

---

## Task 1: Freeze Phase 4 behavior with exact-byte characterization fixtures

**Files:**

- Create: extensions/workflow-register/test/helpers/reproducibleRuntimeHarness.js
- Create: extensions/workflow-register/test/reproducibleRuntimePhase4Characterization.test.js
- Create: extensions/workflow-register/test/fixtures/reproducible-runtime/v0/run.json
- Create: extensions/workflow-register/test/fixtures/reproducible-runtime/phase4-v1/run.json
- Create: extensions/workflow-register/test/fixtures/reproducible-runtime/phase4-v1/events.jsonl
- Create: extensions/workflow-register/test/fixtures/reproducible-runtime/phase4-v1/artifact-manifest.json
- Create: extensions/workflow-register/test/fixtures/reproducible-runtime/future/events.jsonl
- Create: extensions/workflow-register/test/fixtures/reproducible-runtime/corrupt/events-middle-bitflip.jsonl
- Modify: extensions/workflow-register/test/workflowRunEventLog.test.js
- Modify: extensions/workflow-register/test/workflowRunJournal.test.js

**Interface:** The harness produces deterministic clock values, UUIDs, temp run roots, exact-byte readers, child-process readiness handshakes, and SHA-256 helpers. It must not normalize fixture bytes.

- [ ] Add characterization tests that create a run through the current v1 APIs and compare run.json, events.jsonl, and artifact manifest byte-for-byte with committed fixtures.
- [ ] Add negative fixtures for future schema and middle-event corruption, but assert only current read behavior in this task.
- [ ] Run npm run compile && node --test test/reproducibleRuntimePhase4Characterization.test.js test/workflowRunEventLog.test.js test/workflowRunJournal.test.js and confirm the new exact-byte assertions fail before fixtures/harness are complete.
- [ ] Implement the deterministic harness using injected clock/ID values and copy the observed, reviewed Phase 4 bytes into the fixtures without editing their formatting.
- [ ] Add a fixture integrity table in the test containing file path, byte length, and SHA-256; fail if a fixture is silently regenerated.
- [ ] Re-run the focused command twice and confirm identical results and no fixture mutation.
- [ ] Commit with message test: freeze reproducible runtime phase4 bytes.

## Task 2: Implement canonical-json/v1 and run-state/v2 codecs

**Files:**

- Create: extensions/workflow-register/src/core/runtime/canonicalJsonV1.ts
- Create: extensions/workflow-register/src/core/runtime/runStateV2.ts
- Create: extensions/workflow-register/test/reproducibleRuntimeReplay.test.js
- Modify: extensions/workflow-register/src/core/modelRuntime.ts

**Interface:**

    canonicalizeJsonV1(value: unknown): Buffer
    hashCanonicalJsonV1(value: unknown): string
    decodeWorkflowRunStateV2(value: unknown): WorkflowRunStateV2
    encodeWorkflowRunStateV2(state: WorkflowRunStateV2): Buffer
    upgradeWorkflowRunStateV1(source: WorkflowRunState): WorkflowRunStateV2

WorkflowRunStateV2 is a closed, versioned domain state. Volatile projection metadata and filesystem paths are excluded from stateHash.

- [ ] Write failing tests for object insertion-order independence, Unicode code-unit key order, preserved array order, undefined property omission, trailing LF, UTF-8 bytes, and rejection of NaN, Infinity, bigint, function, symbol, sparse array, undefined array element, and cyclic input.
- [ ] Write failing tests that upgrade the Phase 4 fixture twice and obtain byte-identical run-state/v2 bytes and hash.
- [ ] Run npm run compile && node --test test/reproducibleRuntimeReplay.test.js and confirm failures are caused by missing codec exports.
- [ ] Implement canonicalizeJsonV1 without localeCompare or JSON replacer side effects; recursively validate values before serialization.
- [ ] Define WorkflowRunStateV2 and explicit v1-to-v2 upgrade functions in runStateV2.ts. Keep current WorkflowRunState readable until authority cutover is complete.
- [ ] Add compile-time exhaustive checks for version and discriminated unions.
- [ ] Re-run the focused test plus node --test test/workflowRunStateSchema.test.js if present, and confirm existing schema behavior remains green.
- [ ] Commit with message feat: add canonical runtime state codec.

## Task 3: Add run-event/v2 and a mixed-version codec registry

**Files:**

- Create: extensions/workflow-register/src/core/runtime/runEventV2.ts
- Create: extensions/workflow-register/src/core/runtime/runEventCodecRegistry.ts
- Create: extensions/workflow-register/test/reproducibleRuntimeCorruption.test.js
- Modify: extensions/workflow-register/src/core/runtime/runEventLog.ts
- Modify: extensions/workflow-register/test/workflowRunEventLog.test.js

**Interface:**

    type RunEventKindV2 =
      run.created | run.imported | stream.cutover | run.transitioned |
      attempt.started | attempt.retry-started | attempt.completed | attempt.failed |
      effect.intent-recorded | effect.succeeded | effect.failed |
      effect.cancelled | effect.in-doubt | effect.reconciled |
      artifact.committed | approval.recorded | budget.exhausted |
      cancel.requested | run.forked

    RunEventCodecRegistry.decodeLine(bytes, context)
    RunEventCodecRegistry.encodeV2(input)
    RunEventCodecRegistry.verifyStream(lines)
    RunEventCodecRegistry.inspectVersion(bytes)

The v2 envelope includes schemaVersion, canonicalizationVersion, sequence, eventId, runId, kind, occurredAt, actor, optional correlation/causation, previousEventHash, previousStateHash, stateHash, projectionHash, full state, evidence, and hash.

- [ ] Add failing tests for a valid exact v1 prefix followed by stream.cutover and v2 events; duplicate/gapped sequence; wrong previousEventHash; wrong previousStateHash; wrong stateHash; wrong event hash; blank middle line; torn unrelated tail; unknown schema; unknown canonicalization version; mismatched runId.
- [ ] Assert run.imported and stream.cutover omit previousStateHash and include sourceRunHash, optional sourceEventHash, source schema version, upgradedSourceStateHash, and importerVersion.
- [ ] Run npm run compile && node --test test/reproducibleRuntimeCorruption.test.js test/workflowRunEventLog.test.js and capture the expected missing-registry failures.
- [ ] Implement RunEventV2 decode/validate/encode with exact canonical byte generation and exhaustive event-kind validation.
- [ ] Wrap the existing v1 decoder as the immutable v1 codec; do not re-encode v1 lines during verification.
- [ ] Make RunEventCodecRegistry enforce one-way v1-prefix-to-v2 transition and reject v1 after the first v2 event.
- [ ] Return structured verification results with verified head sequence/hash/stateHash and stable failure category, never a partially trusted state.
- [ ] Re-run focused tests and the Phase 4 characterization test.
- [ ] Commit with message feat: add versioned runtime event codecs.

## Task 4: Build the pure projector and deterministic projection serializers

**Files:**

- Create: extensions/workflow-register/src/core/runtime/runProjector.ts
- Create: extensions/workflow-register/src/core/runtime/runProjectionSerializer.ts
- Create: extensions/workflow-register/src/core/runtime/executionManifestProjector.ts
- Modify: extensions/workflow-register/test/reproducibleRuntimeReplay.test.js
- Modify: extensions/workflow-register/test/workflowRunProvenance.test.js
- Modify: extensions/workflow-register/src/core/runProvenance.ts

**Interface:**

    RunProjector.initial(event): ProjectedRuntime
    RunProjector.apply(current, event): ProjectedRuntime
    RunProjector.replay(verifiedEvents): ProjectedRuntime
    serializeRunProjection(projected): Buffer
    serializeExecutionManifestProjection(projected): Buffer

ProjectedRuntime contains WorkflowRunStateV2 and the metadata-only execution manifest input. The full manifest is enriched by later plans, but the serializer and hash boundary become stable here.

- [ ] Add failing tests showing two replays of identical event bytes produce byte-identical run.json and execution-manifest.json.
- [ ] Add prefix/checkpoint equivalence, object insertion-order perturbation, timezone/locale-independent timestamps, and deterministic array sorting tests.
- [ ] Add a test that a missing/corrupt projection never changes replay output from a valid event stream.
- [ ] Run npm run compile && node --test test/reproducibleRuntimeReplay.test.js test/workflowRunProvenance.test.js and confirm the projector tests fail.
- [ ] Implement RunProjector as a total switch over event kind with no I/O. Validate that envelope state and the reducer-computed next state are identical before accepting an event.
- [ ] Implement stable projection serializers with two-space JSON and one trailing LF. Sort only sets defined as unordered by schema; preserve domain-ordered arrays.
- [ ] Adapt runProvenance.ts to consume projected evidence instead of independently reading mutable state where possible, while retaining v1 compatibility.
- [ ] Add a dependency test that rejects imports of fs, vscode, child_process, Date.now, Math.random, and process.env from the pure projector module.
- [ ] Re-run focused tests plus npm run architecture:policy.
- [ ] Commit with message feat: add deterministic runtime projector.

## Task 5: Add read-only shadow verification and fail-closed diagnostics

**Files:**

- Create: extensions/workflow-register/src/core/runtime/runShadowVerifier.ts
- Create: extensions/workflow-register/src/core/runtime/runtimeDiagnostics.ts
- Create: extensions/workflow-register/test/reproducibleRuntimeShadow.test.js
- Modify: extensions/workflow-register/src/core/runtime/runStateStore.ts
- Modify: extensions/workflow-register/src/commands/runDiagnostics.ts
- Modify: extensions/workflow-register/src/workflowRuntimeFactory.ts

**Interface:**

    RunShadowVerifier.compare(runRoot): ShadowVerificationResult
    RuntimeDiagnostic = { code, runId, sequence?, expectedHash?, actualHash?, occurredAt }

Initial codes used here are v2-cutover-required, v2-import-blocked, event-tail-torn, event-stream-corrupt, projection-stale, projection-rebuilt, and projection-repair-failed. Diagnostics contain digests/metadata only.

- [ ] Write failing tests for match, stale run.json, missing run.json, corrupt event, future schema, and v1 run requiring cutover.
- [ ] Assert shadow mode performs no writes by comparing directory tree hashes and mtimes before/after verification.
- [ ] Run npm run compile && node --test test/reproducibleRuntimeShadow.test.js and confirm missing verifier failures.
- [ ] Implement read-only verification and redacted diagnostics. Never include raw prompts, state values, provider payloads, or artifact content.
- [ ] Add a disabled-by-default configuration path in workflowRuntimeFactory.ts for off/shadow/canary/authoritative authority modes; only shadow is enabled in this task.
- [ ] Surface diagnostics through the existing inspect-run diagnostics path without repairing data.
- [ ] Re-run the focused test and existing run diagnostics tests.
- [ ] Commit with message feat: add runtime shadow replay diagnostics.

## Task 6: Implement the append-only RunEventStore with lease-bound head CAS

**Files:**

- Create: extensions/workflow-register/src/core/runtime/runEventStore.ts
- Create: extensions/workflow-register/src/core/runtime/runEventHead.ts
- Create: extensions/workflow-register/test/reproducibleRuntimeEventStore.test.js
- Modify: extensions/workflow-register/src/core/runtime/runLock.ts
- Modify: extensions/workflow-register/test/workflowRunCrossProcessCas.test.js
- Modify: extensions/workflow-register/test/workflowRunLock.test.js

**Interface:**

    inspectHead(runRoot): VerifiedEventHead
    readVerifiedStream(runRoot): VerifiedRunEventStream
    appendWithCas({
      runRoot,
      leaseProof,
      expectedSequence,
      expectedEventHash,
      expectedLogLength,
      exactEventLine
    }): AppendResult

AppendResult returns the exact committed head. It never retries with a recomputed event.

- [ ] Add failing tests for successful append, stale sequence, stale event hash, stale log length, missing lease, expired lease, wrong lease owner/token, and two processes racing the same expected head.
- [ ] Assert exactly one racing process appends, the loser returns a typed CAS conflict, and the final stream has no duplicate/partial line.
- [ ] Run npm run compile && node --test test/reproducibleRuntimeEventStore.test.js test/workflowRunCrossProcessCas.test.js test/workflowRunLock.test.js and confirm failures.
- [ ] Extend the existing lease API with an opaque LeaseProof carrying runId, owner/token, acquiredAt, expiresAt, and observed generation; validate it immediately before append.
- [ ] Implement head inspection from verified bytes, compare expected values while holding the existing run lock, append one prebuilt line, fsync file and containing directory where supported, then re-read the committed head.
- [ ] Map expected-head mismatch to typed conflict; do not truncate, merge, or auto-replay.
- [ ] Preserve current RunStateStore CAS tests and adapt them to delegate event-head authority only in canary mode.
- [ ] Re-run focused tests on repeated iterations to expose race flakiness.
- [ ] Commit with message feat: add lease-bound event head cas.

## Task 7: Implement journal v2 and exact crash recovery

**Files:**

- Create: extensions/workflow-register/src/core/runtime/runStateJournalV2.ts
- Create: extensions/workflow-register/test/reproducibleRuntimeJournalV2.test.js
- Create: extensions/workflow-register/test/fixtures/reproducible-runtime/journals/before-append.json
- Create: extensions/workflow-register/test/fixtures/reproducible-runtime/journals/after-append.json
- Modify: extensions/workflow-register/src/core/runtime/runStateJournal.ts
- Modify: extensions/workflow-register/test/workflowRunJournal.test.js
- Modify: extensions/workflow-register/test/workflowRunDurableStore.test.js

**Interface:** Journal v2 records expected prior sequence/hash/log length, exact event line/hash, and exact bytes/hash for each target projection. Recovery decisions are prepare-not-committed, event-committed-projection-stale, fully-committed-journal-stale, or corrupt/inconsistent.

- [ ] Add failing tests for crash before journal fsync, after journal fsync, during event append, after event fsync, between projection replaces, after all projection replaces, and before journal removal.
- [ ] Add explicit torn-tail tests: journal-proven exact tail completes once; mismatched or unrelated torn tail fails with event-stream-corrupt.
- [ ] Run npm run compile && node --test test/reproducibleRuntimeJournalV2.test.js test/workflowRunJournal.test.js test/workflowRunDurableStore.test.js and confirm failures.
- [ ] Implement canonical journal v2 encoding and checksum validation. Persist exact prepared bytes rather than domain objects that would be reserialized on recovery.
- [ ] Implement recovery that compares actual log length/head/hash and projection hashes before taking action; reuse the recorded eventId, occurredAt, and bytes.
- [ ] Keep the v1 journal recovery reader for existing fixtures. Never reinterpret v1 journals as v2.
- [ ] Make corrupt/inconsistent journal recovery fail closed with projection-repair-failed and preserve forensic files.
- [ ] Re-run focused tests twice and assert crash recovery does not append the same event twice.
- [ ] Commit with message feat: add exact runtime journal recovery v2.

## Task 8: Add projection storage and the authoritative commit coordinator

**Files:**

- Create: extensions/workflow-register/src/core/runtime/runProjectionStore.ts
- Create: extensions/workflow-register/src/core/runtime/runCommitCoordinator.ts
- Create: extensions/workflow-register/test/reproducibleRuntimeCommitCoordinator.test.js
- Modify: extensions/workflow-register/src/core/runtime/runStateStore.ts
- Modify: extensions/workflow-register/src/core/runStateStore.ts
- Modify: extensions/workflow-register/src/workflowRuntimeFactory.ts

**Interface:**

    RunCommitCoordinator.commit({
      runRoot,
      leaseProof,
      expectedHead,
      eventDraft,
      projectionDrafts
    }): CommittedRunRevision

    RunProjectionStore.replaceExact(target, bytes, expectedHash?): ProjectionWriteResult
    RunProjectionStore.rebuildFromEvents(runRoot): RebuildResult

Commit order is durable journal → exact event append → exact projection replace(s) → journal removal.

- [ ] Add failing tests that instrument operation order and assert no projection is published before event fsync.
- [ ] Add tests for projection replace failure after canonical event commit: commit returns committed-with-stale-projection, subsequent open repairs projections, and no event is appended again.
- [ ] Add tests that direct v2 run.json mutation is detected as projection-stale and repaired only from a valid stream.
- [ ] Run npm run compile && node --test test/reproducibleRuntimeCommitCoordinator.test.js and confirm failures.
- [ ] Implement RunProjectionStore with temp file, file fsync, atomic replace, and directory fsync where supported. Use exact prepared bytes.
- [ ] Implement RunCommitCoordinator using RunEventStore and RunStateJournalV2; keep all ID/time generation outside the recovery portion.
- [ ] Route canary-mode RunStateStore saves through the coordinator. Retain the legacy implementation for off/shadow and prevent mixed direct/coordinator writes within one run.
- [ ] Add runtime assertions that authoritative mode rejects direct projection mutation APIs.
- [ ] Re-run focused tests plus current durable store/CAS/coordinator tests.
- [ ] Commit with message feat: add authoritative runtime commit coordinator.

## Task 9: Create native v2 runs behind a canary setting

**Files:**

- Create: extensions/workflow-register/test/reproducibleRuntimeNativeV2.test.js
- Modify: extensions/workflow-register/src/core/engine/runState.ts
- Modify: extensions/workflow-register/src/core/engine.ts
- Modify: extensions/workflow-register/src/workflowRuntimeFactory.ts
- Modify: extensions/workflow-register/package.json

**Interface:** A new run in canary mode begins with one run.created v2 event. Its run.json and baseline execution-manifest.json are generated from that event, and every later mutation goes through RunCommitCoordinator.

- [ ] Add failing end-to-end tests for create, transition, close, reopen, replay, and projection deletion/rebuild of a native v2 run.
- [ ] Assert off/shadow modes still produce exact Phase 4 v1 bytes.
- [ ] Run npm run compile && node --test test/reproducibleRuntimeNativeV2.test.js test/reproducibleRuntimePhase4Characterization.test.js and confirm canary behavior is missing.
- [ ] Add an internal authority mode setting with off as the package default. Avoid a public default-on setting in this phase.
- [ ] Build run.created from deterministic injected clock/ID and commit it before exposing the run to engine consumers.
- [ ] Replace canary run state mutations with event drafts plus projected next state; eliminate direct run.json writes for canary run IDs.
- [ ] Add activation/restart tests proving runtime factory reopens v2 authority from the event stream.
- [ ] Re-run focused tests and existing engine/state tests.
- [ ] Commit with message feat: enable native v2 runtime canary.

## Task 10: Implement idempotent legacy import and cutover

**Files:**

- Create: extensions/workflow-register/src/core/runtime/legacyRunImporter.ts
- Create: extensions/workflow-register/test/reproducibleRuntimeLegacyRebuild.test.js
- Create: extensions/workflow-register/test/fixtures/reproducible-runtime/future/run.json
- Create: extensions/workflow-register/test/fixtures/reproducible-runtime/corrupt/run.json
- Modify: extensions/workflow-register/src/core/runtime/runStateStore.ts
- Modify: extensions/workflow-register/src/commands/runStorage.ts
- Modify: extensions/workflow-register/src/extensionWithAuthoring.ts

**Interface:**

    LegacyRunImporter.inspect(runRoot): ImportClassification
    LegacyRunImporter.importOne(runRoot, leaseProof, expectedSourceHashes): ImportResult
    LegacyRunImporter.importBatch(selection, operatorActor): BatchImportReport

Classifications are native-v2, phase4-v1-cutover, v0-import, already-imported, future-schema-blocked, corrupt-source-blocked, and source-changed-conflict.

- [ ] Add failing tests for v0 run.json only, Phase 4 v1 stream, already imported stream, future schema, corrupt event, missing source, source hash change during import, and concurrent double import.
- [ ] Assert import event evidence contains sourceRunHash, optional sourceEventHash, source schema version, upgradedSourceStateHash, and importerVersion.
- [ ] Assert repeated import returns the existing cutover/import event and does not append a second one.
- [ ] Run npm run compile && node --test test/reproducibleRuntimeLegacyRebuild.test.js and confirm failures.
- [ ] Implement read-only classification and explicit import. Phase 4 v1 uses stream.cutover after exact v1 prefix; v0 uses run.imported as the first authoritative event without inventing v1 history.
- [ ] Re-hash source bytes under lease immediately before commit and fail with v2-import-blocked on mismatch, corruption, or unsupported future schema.
- [ ] Add an operator command that previews classifications and requires explicit confirmation for batch import. Lazy import occurs only on an explicit mutation request.
- [ ] Keep source evidence files untouched and make import reports metadata-only.
- [ ] Re-run focused tests and existing storage/retention tests.
- [ ] Commit with message feat: add idempotent legacy runtime importer.

## Task 11: Implement projection rebuild without domain mutation

**Files:**

- Modify: extensions/workflow-register/src/core/runtime/runProjectionStore.ts
- Modify: extensions/workflow-register/src/commands/runStorage.ts
- Modify: extensions/workflow-register/test/reproducibleRuntimeLegacyRebuild.test.js
- Modify: extensions/workflow-register/test/workflowRunDurableStore.test.js
- Modify: extensions/workflow-register/package.json

**Interface:** rebuildFromEvents verifies the complete event stream first, computes projection bytes in memory, optionally performs a dry-run hash report, then atomically replaces projections. It never appends a domain event.

- [ ] Add failing tests for missing, stale, corrupt, and already-current projections with a valid event stream.
- [ ] Add negative tests proving corrupt/unknown event streams do not use run.json as fallback and do not write anything.
- [ ] Record event file byte hash and directory tree hash of immutable history before rebuild; assert both remain unchanged afterward.
- [ ] Run npm run compile && node --test test/reproducibleRuntimeLegacyRebuild.test.js test/workflowRunDurableStore.test.js and confirm failures.
- [ ] Implement dry-run and apply rebuild modes with expected event-head CAS between verification and projection replace.
- [ ] Emit projection-rebuilt only as an operational diagnostic/audit record outside domain history; emit projection-repair-failed on failure.
- [ ] Register a storage inspection/rebuild command with explicit run selection and confirmation.
- [ ] Re-run focused tests and package schema tests for the new command contribution.
- [ ] Commit with message feat: add deterministic runtime projection rebuild.

## Task 12: Complete foundation gates and documentation

**Files:**

- Modify: extensions/workflow-register/docs/detailed-design-ja.md
- Create: extensions/workflow-register/docs/reproducible-runtime-v2-operations-ja.md
- Modify: docs/superpowers/plans/2026-07-17-workflow-reproducible-runtime-v2-foundation-authority.md
- Modify: extensions/workflow-register/test/reproducibleRuntimeReplay.test.js
- Modify: extensions/workflow-register/test/reproducibleRuntimeCorruption.test.js
- Modify: extensions/workflow-register/test/reproducibleRuntimeLegacyRebuild.test.js

- [ ] Add an acceptance table covering byte-identical replay, valid-stream authority over missing/corrupt projections, invalid-stream fail-closed behavior, lease plus CAS serialization, no duplicate append on recovery, idempotent import, and history-preserving rebuild.
- [ ] Document authority modes, v1 prefix preservation, diagnostics, operator import/rebuild procedures, and rollback to read-only compatibility mode without event deletion.
- [ ] Run npm run compile && node --test test/reproducibleRuntimePhase4Characterization.test.js test/reproducibleRuntimeReplay.test.js test/reproducibleRuntimeCorruption.test.js test/reproducibleRuntimeShadow.test.js test/reproducibleRuntimeEventStore.test.js test/reproducibleRuntimeJournalV2.test.js test/reproducibleRuntimeCommitCoordinator.test.js test/reproducibleRuntimeNativeV2.test.js test/reproducibleRuntimeLegacyRebuild.test.js.
- [ ] Run npm run dependency:policy, npm run architecture:policy, npm run source:policy, npm run schema:policy, npm run unused:report, npm run audit:prod, npm run test, npm run package, and npm run package:policy.
- [ ] Run git diff --check and inspect the generated VSIX to ensure fixtures/test helpers are excluded.
- [ ] Perform an independent review focused on event integrity, recovery, deterministic serialization, and path containment; resolve all Critical and Important findings.
- [ ] Mark this plan complete only after shadow replay divergence is zero for committed fixtures and canary tests.
- [ ] Commit with message docs: complete runtime authority foundation gates.

## Foundation Exit Criteria

- [ ] Phase 4 exact bytes remain unchanged in off/shadow mode.
- [ ] Mixed v1-prefix/v2 streams verify and replay deterministically.
- [ ] Native v2 events are authoritative for canary runs.
- [ ] run.json and baseline execution-manifest.json are rebuildable byte-for-byte.
- [ ] stale writers fail lease or event-head CAS before projection publication.
- [ ] journal recovery never duplicates an event.
- [ ] corrupt or future streams fail closed.
- [ ] legacy import is explicit, idempotent, and source-hash bound.
- [ ] projection rebuild appends no domain history.
