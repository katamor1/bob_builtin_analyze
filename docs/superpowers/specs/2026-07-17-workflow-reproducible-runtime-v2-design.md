Replaced: `workflowRegister.openOperationHub` and `workflowRegister.openWorkflowBuilder` are the current workflow operator routes; the legacy Operation Hub references below are retained only as historical reproducible-runtime v2 design evidence.

# Workflow Reproducible Runtime v2 Design

- Date: 2026-07-17
- Repository: katamor1/bob_builtin_analyze
- Component: extensions/workflow-register
- Base: main at f4f9d3308361333e02ab1af732706b7a9e5fc952
- Status: Approved design
- Replaces: the remaining scope beyond Workflow Reproducible Runtime Through Phase 4
- Related: Contract v2 and Operator UX plans

## 1. Purpose

This design closes the remaining Reproducible Runtime work while preserving the Phase 4 durability implementation already integrated into main.

The target runtime has one authoritative append-only event stream, deterministic projections, attempt-isolated artifacts, explicit side-effect and idempotency contracts, enforceable resource budgets, complete metadata provenance, hash-bound approvals, safe legacy import, deterministic failure recovery, and immutable retry/fork lineage.

The design uses a staged migration. It does not replace all persistence in one change and does not rewrite existing v1 event bytes.

## 2. Current baseline and gap classification

The current main branch already contains valuable Phase 4 foundations:

- hash-chained full-snapshot events in src/core/runtime/runEventLog.ts;
- crash journal recovery in src/core/runtime/runStateJournal.ts;
- cross-process run lease, heartbeat, stale-owner recovery, and token-checked release in src/core/runtime/runLock.ts;
- exact run.json revision CAS in src/core/runtime/runStateStore.ts;
- file and directory durability barriers in src/core/runtime/runDurabilityPath.ts;
- transactional file batches and artifact hashes in src/core/engine/resultWriters.ts and src/core/artifacts/artifactManifest.ts;
- run-state v0 backup and v1 migration;
- fault hooks for the existing journal, run, and event commit points.

The remaining gaps are:

| Requirement | Current status | Required v2 closure |
| --- | --- | --- |
| Append-only store and deterministic projection | Partial | Make events authoritative and rebuild run.json from verified events |
| Run lease and CAS | Implemented | Rebase CAS on authoritative event head |
| Attempt staging and atomic artifact commit | Partial | Add immutable attempt directories and event-gated publication |
| Timeout, cancel, output, AI-call, token budgets | Partial | Add compiled limits, capability checks, counters, and terminal outcomes |
| Idempotency and side-effect policy | Missing | Persist intent before invocation and forbid unsafe blind retry |
| Execution manifest and complete provenance | Partial | Project one deterministic metadata-only manifest |
| Approval evidence | Partial | Bind actor, reason, plan, artifacts, diff, and pending action |
| Legacy importer and projection rebuild | Partial | Import v0/v1 safely and rebuild projections from events |
| Failure injection | Partial | Cover every durability and external-effect boundary |
| Retry/fork lineage and parent immutability | Missing | Model attempts and child-run forks explicitly |

## 3. Goals

- Exactly one authoritative source exists after v2 cutover: events.ndjson.
- Replaying a verified event stream produces byte-identical run.json and execution-manifest.json projections.
- Every durable state transition appends exactly one event.
- Projection failure cannot cause duplicate workflow or provider execution.
- External effects are preceded by a durable intent record.
- Non-idempotent effects with unknown outcomes are never retried automatically.
- Artifacts become reusable only after attempt-scoped validation, atomic promotion, and an authoritative commit event.
- All hard limits are fixed by the compiled plan and enforced consistently across standalone, Bob, and Operation Hub entry points.
- Approval evidence is invalid when the plan, artifacts, attempt diff, or pending action changes.
- Legacy import is idempotent and never destroys the original evidence.
- Retry creates a new immutable attempt. Rewind creates a child run rather than mutating history.
- Existing Phase 4 path containment, lease, fsync, and future-schema fail-closed rules remain in force.

## 4. Non-goals

- Rewriting or compacting the original event stream.
- Semantic-delta-only event sourcing in the first v2 release.
- Distributed consensus across machines.
- Guaranteeing hard cancellation when a provider does not advertise and honor cancellation capability.
- Rolling back arbitrary external systems.
- Storing prompt bodies, artifact bodies, credentials, or sensitive provider payloads in events or the execution manifest.
- Cross-volume atomic artifact promotion.
- In-place rewind of a run.
- Automatic reconciliation of an unknown non-idempotent external outcome.
- A global database shared by multiple workspaces.

## 5. Approaches considered

### 5.1 Keep run.json authoritative

This would add missing fields and policies around the Phase 4 materialized state.

Rejected because replay equality would remain secondary, projection rebuild would remain impossible, and run.json plus events would continue to behave as two competing records.

### 5.2 Big-bang conversion to semantic delta events

This would replace every run and event contract at once and derive state through a reducer.

Rejected for the first v2 release because reducer-version migration, broad engine rewrites, and historical conversion would multiply risk. The current full-snapshot event structure provides a safer path.

### 5.3 Staged event authority with full post-state events

Selected.

Existing v1 events remain an immutable prefix. A verified v2 boundary event establishes authority. Every v2 event contains a full canonical post-state plus kind-specific evidence. This uses more disk than semantic deltas, but it keeps projection deterministic, migration auditable, and the existing save-oriented engine adaptable.

Semantic deltas, checkpoints, indexes, and compaction may be introduced later without rewriting the original chain.

## 6. Authority model

Before cutover, existing Phase 4 rules remain unchanged.

After the first valid v2 boundary event:

- events.ndjson is authoritative;
- run.json is a deterministic projection and cache;
- execution-manifest.json is a deterministic metadata-only projection;
- artifact manifest data is projected from committed artifact events;
- Bob Todo and GUI state are presentation projections;
- control.json remains an independent operator-signal file until the runtime consumes the signal and records the resulting domain event;
- no caller may mutate run.json directly.

A missing, stale, or corrupt projection may be rebuilt only from a fully verified event chain. An invalid event chain never falls back to run.json.

## 7. Persisted layout

Each v2 run may contain:

    .bob/workflows/runs/<runId>/
      events.ndjson
      run.json
      execution-manifest.json
      run-state.journal.json
      run.lock.json
      control.json
      run-state-v0.backup.json
      attempts/
        <attemptId>/
          committed/
            artifact files
            artifact-set.json
      orphaned/
        attempt promotion quarantine when required

The runtime may create owned temporary files and staging directories during a transaction. They must have random ownership tokens, remain under the physical run directory, and be removed or quarantined only after identity revalidation.

The committed attempt directory is immutable. Existing destinations are never replaced.

## 8. Version separation

The following versions evolve independently:

- workflow-register/run-state/v2
- workflow-register/run-event/v2
- workflow-register/run-journal/v2
- workflow-register/execution-manifest/v1
- workflow-register/artifact-set/v2
- workflow-register/canonical-json/v1
- projector implementation version
- legacy importer implementation version

Unknown versions fail closed. A hard token budget or cancellation requirement also fails preflight if the bound provider contract does not expose the required capability.

Writing run-state v2 into run.json provides an old-runtime safety fence. Existing binaries classify the projection as future/read-only. The mixed event codec also rejects a v1 append after a v2 boundary.

## 9. Event v2 envelope

Each event line is one canonical JSON object followed by one newline.

The logical envelope is:

    interface WorkflowRunEventV2 {
      schemaVersion: "workflow-register/run-event/v2"
      canonicalizationVersion: "workflow-register/canonical-json/v1"
      sequence: number
      eventId: string
      runId: string
      kind: WorkflowRunEventKindV2
      occurredAt: string
      actor: WorkflowActor
      correlationId?: string
      causationEventId?: string
      previousEventHash?: string
      previousStateHash?: string
      stateHash: string
      projectionHash: string
      state: WorkflowRunStateV2
      evidence: WorkflowRunEventEvidence
      hash: string
    }

The event hash is SHA-256 over canonical JSON of every field except hash.

Canonical JSON v1 preserves array order, sorts object keys by Unicode code-unit order, omits properties whose value is undefined, rejects non-finite numbers and non-JSON values, and emits UTF-8 JSON without insignificant whitespace. Event lines use that canonical form plus one newline. run.json and execution-manifest.json use JSON.stringify(value, null, 2) plus one newline, with every array already sorted by its contract-defined stable key.

stateHash is SHA-256 over canonical state JSON. projectionHash is SHA-256 over the exact deterministic run.json bytes represented by state.

For a v1-prefix cutover event, previousEventHash equals the verified v1 head hash. For a v2-native run genesis it is absent. No v1 event is valid after the first v2 event.

previousStateHash is absent for run.created, run.imported, and stream.cutover because none of those events has a prior authoritative v2 state. Every later v2 event requires previousStateHash to equal the preceding v2 event stateHash. run.imported and stream.cutover evidence instead records sourceRunHash, optional sourceEventHash, source schema, canonical upgraded source-state hash, and importer version.

Every event contains the complete post-state. Kind-specific evidence is still mandatory so that approval, side effects, artifacts, budgets, and lineage remain directly auditable without diffing arbitrary snapshots.

## 10. Event kinds

Initial v2 kinds are:

| Kind | Purpose |
| --- | --- |
| run.created | Native v2 genesis |
| run.imported | Genesis from legacy run.json without a v1 event prefix |
| stream.cutover | Authority boundary after a verified v1 prefix |
| run.transitioned | Ordinary internal status/state transition |
| attempt.started | New step attempt |
| attempt.retry-started | Retry linked to an earlier attempt |
| attempt.completed | Attempt completed with known outcome |
| attempt.failed | Attempt failed with known outcome |
| effect.intent-recorded | Durable intent before external invocation |
| effect.succeeded | Known successful external outcome |
| effect.failed | Known failed external outcome |
| effect.cancelled | Provider confirmed cancellation |
| effect.in-doubt | External outcome is unknown |
| effect.reconciled | Human/provider reconciliation of an in-doubt effect |
| artifact.committed | Verified immutable artifact set became visible |
| approval.recorded | Hash-bound approve or reject decision |
| budget.exhausted | A compiled hard limit stopped further work |
| cancel.requested | Durable cancellation request |
| run.forked | Child-run genesis referencing an immutable parent point |

Additional kinds require a schema change or a compatible codec update with deterministic tests. Generic run.transitioned must not be used to hide effect, artifact, approval, budget, or lineage evidence that belongs to a dedicated kind.

## 11. Core components and boundaries

### 11.1 RunEventCodecRegistry

Responsibilities:

- parse v1 and v2 records without reserializing v1 for hash verification;
- validate schema, canonicalization version, sequence, ancestry, IDs, state and evidence;
- enforce one optional v1 prefix followed by one v2 suffix;
- reject v1 records after the v2 boundary;
- return exact line bytes and verified typed records.

### 11.2 RunEventStore

Responsibilities:

- read and validate the complete stream;
- expose the authoritative head hash and sequence;
- prepare exact event-line bytes;
- append with expected-head, expected-sequence, and expected-log-length CAS;
- fsync the event file and run directory;
- never replace the committed stream.

The only permitted truncation is a journal-proven uncommitted torn tail at the exact recorded byte offset. Committed event bytes are never truncated or rewritten.

### 11.3 RunProjector

A pure function:

    projectWorkflowRun(events, projectorVersion) -> {
      runState,
      runJsonBytes,
      executionManifest,
      executionManifestBytes
    }

The projector has no filesystem, clock, random, provider, Bob, or VS Code dependency.

Replaying the same verified bytes with the same projector version must produce identical bytes.

### 11.4 RunProjectionStore

Responsibilities:

- compare projection bytes against the authoritative head projection hashes;
- atomically replace stale or missing projections;
- rebuild under the run lease;
- report projection repairs without appending a domain event;
- preserve a diagnostic when event authority is valid but projection repair fails.

### 11.5 RunCommitCoordinator

Responsibilities:

- acquire or re-enter the existing cross-process lease;
- recover pending v1 or v2 journals;
- compare the caller expected event-head hash;
- validate the proposed state and evidence;
- prepare the next event and projection;
- write and recover the v2 journal;
- append the authoritative event;
- refresh projections;
- return a typed commit outcome.

FileRunStateStore remains the compatibility facade. Its loaded-object revision changes from exact run.json hash to authoritative event-head hash after cutover.

### 11.6 LegacyRunImporter

Responsibilities:

- classify v0, v1 without events, v1 with events, current v2, future, corrupt, and conflicting states;
- finish any pending v1 journal before classification;
- preserve exact legacy bytes;
- produce a dry-run report and deterministic upgraded state;
- perform the cutover under the lease;
- make re-entry idempotent.

### 11.7 AttemptWorkspace

Responsibilities:

- allocate one immutable attempt ID;
- provide runtime-owned staging paths to provider v2;
- import and label legacy provider-owned files when necessary;
- validate containment, direct-file identity, schemas, hashes, sizes, producer, input digest, and plan digest;
- atomically promote a complete staged set to a unique committed attempt directory;
- never overwrite a committed attempt.

### 11.8 EffectLedger

Responsibilities:

- derive stable logical effect identity and idempotency key;
- append intent before invocation;
- classify outcome as succeeded, failed, cancelled, in-doubt, or reconciled;
- decide whether retry is permitted;
- expose effect evidence to the execution manifest and approval UI.

### 11.9 ExecutionManifestProjector

This is part of RunProjector but has an independently testable output contract. It emits metadata only and uses stable ordering.

### 11.10 FaultController

Production defaults to no injected fault. Tests may inject named failures at exact boundaries without changing business code or relying on sleeps.

## 12. Event-authoritative commit protocol

A v2 state commit runs under the existing run lease:

1. Recover any pending v1 or v2 journal.
2. Validate the complete event stream.
3. Verify the caller expected authoritative head hash, sequence, and stream length.
4. Build the exact next event line and deterministic projections.
5. Atomically write and fsync journal v2.
6. Fsync the run directory.
7. Append and fsync the event line. This is the commit point.
8. Atomically replace and fsync run.json.
9. Atomically replace and fsync execution-manifest.json.
10. Remove the journal and fsync the run directory.

Journal v2 records:

- transaction ID and run ID;
- expected prior head hash and sequence;
- expected prior event-file byte length;
- exact next-event line bytes and next event hash;
- exact next projection bytes and hashes;
- created timestamp and codec/projector versions.

If event append succeeds but a projection write fails, the returned result is explicitly committed with stale projection. It is not a generic failure and must not cause the caller to repeat provider execution.

## 13. Torn-tail and journal recovery

Recovery examines the journal and exact event-file length.

- Prior head and unchanged length: append the journaled line.
- Complete next event already present: do not append again; continue projection.
- Tail at the recorded offset is an exact prefix of the journaled line: truncate only that journal-proven uncommitted prefix and append the exact complete line.
- Any unrelated bytes, unexpected head, sequence, or length: preserve the journal and fail closed.
- Matching event but stale projection: rebuild projection.
- Matching event and projection: remove the journal.

Recovery never invents a replacement event and never changes occurredAt, eventId, effect ID, idempotency key, artifact digest, or approval evidence.

## 14. Attempt lifecycle

Every executable step creates a unique attemptId.

An attempt record includes:

- attemptId, stepId, ordinal, and status;
- retryOfAttemptId when applicable;
- compiled plan and input digests;
- start and terminal timestamps;
- effect IDs;
- committed artifact-set digest;
- known usage and budget observations;
- terminal error digest when applicable.

Past attempts are immutable. Retry creates attempt.retry-started with a new attemptId. It never edits the prior attempt or its artifacts.

## 15. Artifact staging and publication

Provider v2 receives only runtime-owned staging destinations for declared artifacts.

Legacy providers may continue to own their canonical external path during migration. The runtime treats that path as an external reference, revalidates identity, copies bytes into the attempt staging area, validates the copy, and labels the source as legacy-provider-import. The external canonical path itself is never a reusable authoritative artifact.

Publication sequence:

1. Write only inside the owned attempt staging directory.
2. Validate the complete required set.
3. Validate schema, size, checksum, producer, plan, inputs, and path identity.
4. Write and fsync artifact-set.json.
5. Fsync files and staging directory.
6. Rename staging to the unique committed destination on the same filesystem.
7. Fsync the attempts parent directory.
8. Commit artifact.committed with artifact-set digest and exact entries.

The event makes the promoted directory visible to the runtime. A promoted directory without a matching event is an orphan and is ignored. A matching event without the exact committed directory is corruption and fails closed.

Reuse is allowed only when:

- the source attempt has a terminal successful state;
- artifact.committed exists;
- the artifact-set digest matches;
- every selected file hash, size, schema, producer, plan/input compatibility rule, and identity check passes;
- no entry is staged, orphaned, failed, cancelled, or in-doubt.

## 16. Side-effect and idempotency policy

Each provider or command effect declares one policy:

- pure: no external side effect;
- idempotent: repeated invocation with the same idempotency key is contractually deduplicated;
- non-idempotent: repeated invocation may duplicate an external change.

The stable idempotency key is derived from:

- run ID;
- step ID;
- logical effect identity or ordinal;
- canonical input digest;
- compiled plan digest.

The same logical retry uses the same key. A changed input or plan creates a different logical effect and key.

The runtime commits effect.intent-recorded before invocation. The provider receives the key in its versioned contract.

After invocation, the runtime commits exactly one known result when possible. If the process crashes or loses contact after intent and before a trustworthy receipt, replay derives effect.in-doubt.

Retry rules:

| Policy and outcome | Automatic retry |
| --- | --- |
| pure with no known success | Allowed |
| idempotent with stable key | Allowed through the provider idempotency contract |
| non-idempotent with known pre-invocation failure | Allowed |
| non-idempotent with in-doubt outcome | Forbidden |
| any effect after budget exhaustion | Forbidden |
| any effect after terminal cancel | Forbidden |

An in-doubt non-idempotent effect requires effect.reconciled, with actor, reason, evidence digest, and resolved outcome, before execution can continue.

## 17. Budgets and cancellation

Limits are part of the immutable CompiledWorkflowPlan and its lockfile binding.

Initial hard limits are:

- maximum run duration and deadline;
- maximum step duration and deadline;
- maximum output bytes per effect;
- maximum output bytes per run;
- maximum AI calls;
- maximum input tokens;
- maximum output tokens;
- maximum total tokens;
- optional provider- or step-specific stricter limits.

The stricter applicable limit wins. Counters are derived from events and never decremented by retry or fork.

Before effect intent:

- validate remaining call, token, byte, and time budgets;
- validate provider capability for requested hard limits;
- record the budget snapshot in effect intent;
- pass deadline, AbortSignal, maximum output bytes, and maximum output tokens to the provider contract.

During streaming output, the runtime stops accepting bytes beyond the hard cap and requests cancellation.

After the call, the provider usage receipt is recorded. If a hard token budget is configured and the provider cannot enforce a maximum or report trustworthy usage, preflight fails rather than estimating silently.

Cancellation states are distinct:

- cancel requested;
- provider confirmed cancelled;
- provider returned success or failure before cancellation won;
- cancellation unsupported or outcome unknown, producing in-doubt.

Only one terminal outcome is projected. Unsupported hard cancellation is never displayed as confirmed cancellation.

Command providers that advertise process cancellation must terminate the process tree and prove no residual child remains in Ubuntu and Windows tests.

## 18. Execution manifest

execution-manifest.json is a deterministic metadata-only projection containing:

- run, workflow, package, and lineage identity;
- compiled plan, workflow definition, lockfile, inputs, and prompt digests;
- engine, Node, OS, VS Code, Bob, and projector versions;
- Bob capability digest;
- provider owner, contract version, implementation version, model identity, and capabilities;
- attempts and retry links;
- effects, policies, idempotency keys, input/output/error digests, known outcomes, and usage;
- artifacts, schemas, hashes, sizes, producer attempt, source, and verification status;
- approvals and their target digests;
- budget limits, observations, exhaustion, and overrides if supported;
- parent run ID, parent event hash, fork reason, and selected inherited evidence;
- authoritative event head hash and sequence.

The manifest never contains credentials, prompt bodies, artifact bodies, raw provider payloads, or unrestricted assistant transcript text.

## 19. Approval evidence

Before approval, the runtime canonicalizes:

- compiled plan digest;
- artifact-set digest;
- attempt-diff digest;
- pending-action digest.

Their combination is approvalTargetDigest.

approval.recorded requires:

- actor kind and stable actor ID;
- approve or reject decision;
- non-empty reason;
- approval target digest;
- plan digest;
- artifact-set digest;
- attempt-diff digest;
- pending-action digest;
- observed event-head hash;
- timestamp;
- optional expiry and policy version.

Execution recomputes the target immediately before the approved action. Any change to the plan, artifacts, attempt diff, or pending action invalidates the approval.

The approval event itself advances the event head, so authorization compares the target digest rather than requiring the head to remain equal to the pre-approval head. The observed head remains audit evidence.

## 20. Retry and fork lineage

Retry stays within the same run and creates a new immutable attempt linked by retryOfAttemptId.

The runtime provides no in-place rollback or event deletion.

Restarting from an earlier point creates a child run. The child genesis run.forked event records:

- parentRunId;
- parentEventHash and sequence;
- fork reason and actor;
- selected state/artifact evidence digests;
- child compiled plan and input digests.

The parent receives no new event. Its event bytes, projections, and artifacts remain unchanged. Reverse parent-to-child navigation is a derived index, not a parent mutation.

## 21. Legacy import

The importer classifies a run as:

| Class | Action |
| --- | --- |
| Unversioned or v0 run.json | Preserve exact backup and emit run.imported |
| v1 run.json without events | Validate state and emit run.imported |
| v1 event chain plus run.json | Require exact v1 head runHash match and emit stream.cutover |
| Existing valid v2 boundary | No-op plus optional projection repair |
| Future schema | Read-only; no import |
| Corrupt or conflicting evidence | Fail closed; preserve all evidence |

Import algorithm:

1. Acquire the existing run lease.
2. Recover any pending v1 journal.
3. Read exact source bytes and validate containment and stable identity.
4. Validate the complete v1 event chain when present.
5. Require v1 head and run.json agreement.
6. Preserve the existing exact v0 backup contract or create the required backup without replacing one.
7. Deterministically upgrade state to v2 without altering historical business timestamps or content.
8. Produce a dry-run report and shadow projection.
9. Verify projected semantic state against the source.
10. Commit run.imported or stream.cutover using journal v2.
11. Write v2 projections.
12. Record importer version and source hashes in the boundary evidence.

A failure before the boundary event leaves run.json and the v1 stream unchanged. An extra exact backup is safe evidence. Re-entry after a committed boundary is idempotent.

The shared v1 lock prevents an old writer from racing cutover. If the old writer commits first, its event is included in import. After cutover, old code sees future state/event versions and fails closed.

## 22. Projection rebuild

Projection rebuild is not a domain transition and does not append an event.

The rebuild operation:

1. validates the complete event stream;
2. projects into owned temporary files;
3. verifies exact hashes;
4. acquires or revalidates the lease and head CAS;
5. atomically replaces stale projection files;
6. reports repaired, already-current, or failed diagnostics.

A corrupt event stream is never repaired from projection files.

## 23. Diagnostics

New stable diagnostic categories include:

- v2-shadow-divergence;
- v2-cutover-required;
- v2-import-blocked;
- event-tail-torn;
- event-stream-corrupt;
- projection-stale;
- projection-rebuilt;
- projection-repair-failed;
- effect-in-doubt;
- idempotency-contract-missing;
- artifact-orphaned;
- artifact-verification-failed;
- approval-stale;
- budget-exhausted;
- cancel-unconfirmed;
- lineage-invalid.

Diagnostics contain metadata and digests only. They do not expose raw state values, prompts, provider payloads, or artifact content.

## 24. Failure injection

FaultController supports named failpoints at:

- before and after journal creation and fsync;
- before, during, and after event append;
- before and after each projection replace;
- before and after attempt staging writes;
- before and after artifact-set fsync and promotion rename;
- after promotion and before artifact event commit;
- before and after effect intent;
- after external success and before receipt;
- before and after effect terminal event;
- lease acquisition, heartbeat expiry, reclaim, and release;
- CAS comparison and append race;
- cancel request, timeout, provider result, and terminal-event races;
- Bob sync target write, observed read, repair, and restart boundaries.

Tests use injected clocks, IDs, sleeps, providers, and usage receipts. Cross-process fixtures use readiness handshakes instead of fixed delays.

In addition to throw-based unit faults, child-process tests forcibly terminate the writer at durable boundaries and reopen the store.

Every injected case must yield one of:

- deterministic recovery to the committed event;
- explicit committed-with-stale-projection followed by repair;
- safe orphan that is never visible or reused;
- explicit in-doubt external effect;
- fail-closed diagnostic preserving all evidence.

## 25. Phased delivery

### Phase 0: Characterization

- Preserve exact v0 and Phase 4 v1 fixtures.
- Add deterministic fake clock, ID, provider, child-process, and failpoint harnesses.
- Make no production behavior change.

### Phase 1: Read-only v2 and shadow projection

- Add v1/v2 codecs, state v2 codec, pure projector, manifest projector, and corruption fixtures.
- Compare shadow projection to current run.json.
- Do not repair or switch authority.

### Phase 2: Authority cutover

- Add journal v2, event-head CAS, projection store, native v2 run creation, legacy importer, and projection rebuild.
- Enable new v2 runs behind a canary setting.
- Keep existing runs lazy-imported only on explicit mutation or operator-approved batch import.

### Phase 3: Attempts, effects, and artifacts

- Add attempt workspace, effect ledger, idempotency policy, artifact-set v2, atomic promotion, and verified reuse.
- Require provider v2 for fully managed staging.
- Keep legacy providers restricted to copied and verified imported artifacts.

### Phase 4: Provenance, approval, and lineage

- Add the complete execution manifest, hash-bound approval events, immutable retry history, and child-run fork.

### Phase 5: Budgets and cancellation

- Add hard duration, byte, call, and token limits.
- Add capability-negotiated cancellation and process-tree termination evidence.

### Phase 6: Failure campaign and default enablement

- Run the full crash, corruption, lease, CAS, artifact, side-effect, budget, cancel, Bob-sync, and fork matrix.
- Enable event authority by default only after zero shadow divergence and all gates pass.

Each phase is independently reviewable and mergeable. A later phase must not be stacked on an unmerged, unverified branch.

## 26. Test suites and fixtures

Focused suites:

- test/reproducibleRuntimeReplay.test.js
- test/reproducibleRuntimeCorruption.test.js
- test/reproducibleRuntimeEffectLedger.test.js
- test/reproducibleRuntimeLineage.test.js
- test/reproducibleRuntimeArtifacts.test.js
- test/reproducibleRuntimeEvidence.test.js
- test/reproducibleRuntimeRunControl.test.js
- test/reproducibleRuntimeLegacyRebuild.test.js
- test/reproducibleRuntimeBobSync.test.js
- test/reproducibleRuntimeCrossProcess.test.js

Exact-byte fixtures:

    test/fixtures/reproducible-runtime/
      v0/
      phase4-v1/
      future/
      corrupt/
      journals/
      effect-in-doubt/
      artifact-orphans/
      bob-sync/

Required test properties:

- replaying the same exact event bytes twice produces identical projection bytes;
- full replay and prefix/checkpoint replay agree;
- unknown schemas and canonicalization versions fail closed;
- duplicate and gapped sequences, wrong ancestry, wrong state hashes, blank lines, and truncated unrelated tails fail;
- journal-proven torn tails recover exactly once;
- two processes racing the same append have one winner;
- every committed effect intent has one known outcome or explicit in-doubt state;
- crash after external success does not automatically reinvoke a non-idempotent effect;
- artifact promotion is all-or-none from the projection point of view;
- unverified, orphaned, failed, cancelled, and in-doubt artifacts are never reused;
- approval cannot authorize changed evidence;
- retry preserves earlier attempt bytes;
- fork preserves every parent byte;
- Bob projection failure cannot change canonical completion or repeat an effect.

## 27. CI and release gates

For every implementation phase, run from extensions/workflow-register:

- npm run test
- npm run dependency:policy
- npm run architecture:policy
- npm run source:policy
- npm run schema:policy
- npm run unused:report
- npm run audit:prod
- npm run package
- npm run package:policy
- git diff --check

The focused failure-injection suite and full suite run on Ubuntu and Windows at the same commit. VSIX install and Extension Host activation smoke also run on both platforms.

Independent review must report Critical 0 and Important 0 for event integrity, recovery, path containment, side-effect safety, artifact publication, budget enforcement, approval binding, and lineage.

Product release additionally requires real IBM Bob, Bazaar/Git, multi-root, and workspace-alias evidence:

- approve, reject, retry, pause/resume, command approval, and checkpoint;
- provider re-registration and capability binding;
- timeout/cancel with no residual process tree where supported;
- interrupted Bob synchronization;
- artifact publication and reuse;
- legacy import and projection rebuild;
- child fork and parent immutability;
- evidence capture of event head, plan/prompt/artifact hashes, provider invocation count, Bob Todo, run.json, and execution manifest.

## 28. Final acceptance criteria

The Reproducible Runtime v2 scope is complete only when all of the following are checked on one accepted commit:

1. Event replay produces byte-identical run.json and execution-manifest.json.
2. A valid event stream remains authoritative when either projection is missing or corrupt.
3. An invalid event stream never falls back to projections.
4. Concurrent writers are serialized by the lease and stale writers fail event-head CAS.
5. Crash recovery never appends the same event twice.
6. Runtime-controlled duplicate external invocations are zero across the fault matrix.
7. A non-idempotent in-doubt effect is never retried automatically.
8. An unverified or uncommitted artifact is never reused.
9. Attempt publication is atomic from the authoritative event perspective.
10. Approval actor, reason, plan digest, artifact-set digest, attempt-diff digest, and pending-action digest are preserved.
11. Stale approval is rejected before the approved action.
12. Budgets stop new work at exact deterministic boundaries.
13. Unsupported cancellation is never reported as confirmed cancellation.
14. Legacy import is idempotent and preserves exact source evidence.
15. Projection rebuild changes no domain history.
16. Retry preserves prior attempt and artifact bytes.
17. Fork preserves every parent run byte and records parent lineage in the child.
18. Crash, corrupt event, expired lease, CAS conflict, and Bob-sync interruption deterministically recover or fail closed.
19. Ubuntu and Windows full quality gates pass at the same head.
20. Real-environment evidence is complete before product release.

## 29. Relationship to adjacent plans

Contract v2 supplies:

- immutable CompiledWorkflowPlan;
- provider input/output/error and capability contracts;
- workflow package and lockfile digests;
- required artifact schemas;
- Bob version/capability binding.

Reproducible Runtime consumes those immutable digests and contracts. The event-authority core may be developed first, but managed provider staging, hard token budgets, and capability-negotiated cancellation cannot become release-ready until Contract v2 is integrated.

Operator UX consumes:

- operation idempotency and durable pending state;
- effect-in-doubt reconciliation;
- approval target evidence;
- Bob target/observed/confidence/repair projection;
- child-run fork.

GUI code must not become another source of runtime truth. All mutations route through the authoritative operation and commit services defined by these plans.
