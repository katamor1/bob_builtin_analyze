const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

const {
  RunEventCodecError,
  RunEventCodecRegistry
} = require("../out/core/runtime/runEventCodecRegistry.js")
const {
  RUN_EVENT_KIND_V2_VALUES
} = require("../out/core/runtime/runEventV2.js")
const {
  canonicalizeJsonV1,
  hashCanonicalJsonV1
} = require("../out/core/runtime/canonicalJsonV1.js")
const {
  upgradeWorkflowRunStateV1
} = require("../out/core/runtime/runStateV2.js")
const {
  buildWorkflowRunEvent
} = require("../out/core/runtime/runEventLog.js")

const FIXTURE_ROOT = path.join(__dirname, "fixtures", "reproducible-runtime")
const EVENT_V1 = "workflow-register/run-event/v1"
const EVENT_V2 = "workflow-register/run-event/v2"
const CANONICAL_V1 = "workflow-register/canonical-json/v1"
const HASH_A = `sha256:${"a".repeat(64)}`
const HASH_B = `sha256:${"b".repeat(64)}`
const HASH_C = `sha256:${"c".repeat(64)}`
const RUN_ID = "20260717T000000Z-reproducible-runtime-phase4-000000010000"

function exactLines(bytes) {
  const lines = []
  let start = 0
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] !== 0x0a) continue
    lines.push(Buffer.from(bytes.subarray(start, index + 1)))
    start = index + 1
  }
  assert.equal(start, bytes.length, "fixture must end at an exact LF boundary")
  return lines
}

function phase4() {
  const eventBytes = fs.readFileSync(path.join(FIXTURE_ROOT, "phase4-v1", "events.jsonl"))
  const v1Lines = exactLines(eventBytes)
  const v1Head = JSON.parse(v1Lines.at(-1).subarray(0, -1).toString("utf8"))
  const sourceState = JSON.parse(fs.readFileSync(path.join(FIXTURE_ROOT, "phase4-v1", "run.json"), "utf8"))
  const state = upgradeWorkflowRunStateV1(sourceState)
  return { eventBytes, sourceState, state, v1Head, v1Lines }
}

function actor() {
  return { id: "runtime-importer", kind: "system" }
}

function transitionEvidence(fixture, overrides = {}) {
  return {
    sourceRunHash: fixture.v1Head.runHash,
    sourceEventHash: fixture.v1Head.hash,
    sourceSchemaVersion: fixture.v1Head.snapshot.schemaVersion,
    upgradedSourceStateHash: hashCanonicalJsonV1(fixture.state),
    importerVersion: "workflow-register/legacy-importer/v1",
    ...overrides
  }
}

function cutoverDraft(fixture, overrides = {}) {
  return {
    sequence: fixture.v1Head.sequence + 1,
    eventId: "event-cutover",
    runId: fixture.state.runId,
    kind: "stream.cutover",
    occurredAt: "2026-07-17T00:04:00.000Z",
    actor: actor(),
    previousEventHash: fixture.v1Head.hash,
    projectionHash: HASH_A,
    state: fixture.state,
    evidence: transitionEvidence(fixture),
    ...overrides
  }
}

function nativeDraft(state, overrides = {}) {
  return {
    sequence: 1,
    eventId: "event-created",
    runId: state.runId,
    kind: "run.created",
    occurredAt: "2026-07-17T00:04:00.000Z",
    actor: actor(),
    projectionHash: HASH_A,
    state,
    evidence: {},
    ...overrides
  }
}

function nextDraft(previous, overrides = {}) {
  return {
    sequence: previous.sequence + 1,
    eventId: `event-${previous.sequence + 1}`,
    runId: previous.runId,
    kind: "run.transitioned",
    occurredAt: new Date(Date.parse(previous.occurredAt) + 1_000).toISOString(),
    actor: actor(),
    previousEventHash: previous.hash,
    previousStateHash: previous.stateHash,
    projectionHash: HASH_B,
    state: previous.state,
    evidence: {},
    ...overrides
  }
}

function decodeCanonicalLine(line) {
  return JSON.parse(line.subarray(0, -1).toString("utf8"))
}

function lineWithEventHash(record) {
  const { hash: _ignored, ...withoutHash } = record
  return canonicalizeJsonV1({ ...withoutHash, hash: hashCanonicalJsonV1(withoutHash) })
}

function mutateLine(line, mutation, rehash = true) {
  const record = decodeCanonicalLine(line)
  mutation(record)
  return rehash ? lineWithEventHash(record) : canonicalizeJsonV1(record)
}

function success(result) {
  assert.equal(result.ok, true, result.ok ? undefined : result.failure.message)
  return result
}

function failure(result, category, lineNumber) {
  assert.deepEqual(Object.keys(result).sort(), ["failure", "ok"])
  assert.equal(result.ok, false)
  assert.equal(result.failure.category, category)
  assert.equal(result.failure.lineNumber, lineNumber)
  assert.equal(typeof result.failure.message, "string")
  assert.ok(result.failure.message.length > 0)
  assert.equal("events" in result, false)
  assert.equal("head" in result, false)
}

test("mixed registry preserves the exact Phase 4 v1 prefix and verifies a cutover plus v2 suffix", () => {
  const fixture = phase4()
  const registry = new RunEventCodecRegistry()
  const cutoverLine = registry.encodeV2(cutoverDraft(fixture))
  const cutover = decodeCanonicalLine(cutoverLine)
  const transitionLine = registry.encodeV2(nextDraft(cutover))

  const verified = success(registry.verifyStream([...fixture.v1Lines, cutoverLine, transitionLine]))
  assert.equal(verified.events.length, 5)
  assert.deepEqual(verified.events.map((entry) => entry.version), ["v1", "v1", "v1", "v2", "v2"])
  for (let index = 0; index < fixture.v1Lines.length; index += 1) {
    assert.deepEqual(verified.events[index].exactLine, fixture.v1Lines[index])
  }
  assert.deepEqual(Buffer.concat(verified.events.slice(0, 3).map((entry) => entry.exactLine)), fixture.eventBytes)
  assert.deepEqual(verified.head, {
    version: "v2",
    sequence: 5,
    eventHash: decodeCanonicalLine(transitionLine).hash,
    stateHash: hashCanonicalJsonV1(fixture.state),
    runId: RUN_ID
  })
  assert.equal(cutover.previousStateHash, undefined)
  assert.deepEqual(cutover.evidence, transitionEvidence(fixture))
})

test("registry verifies an unchanged all-v1 Phase 4 stream without re-encoding its lines", () => {
  const fixture = phase4()
  const registry = new RunEventCodecRegistry()
  const empty = success(registry.verifyStream([]))
  assert.deepEqual(empty, { ok: true, events: [] })

  const result = success(registry.verifyStream(fixture.v1Lines))
  assert.deepEqual(result.events.map((entry) => entry.exactLine), fixture.v1Lines)
  assert.deepEqual(result.head, {
    version: "v1",
    sequence: fixture.v1Head.sequence,
    eventHash: fixture.v1Head.hash,
    runId: RUN_ID
  })
})

test("registry supports v2-native run.created genesis", () => {
  const fixture = phase4()
  const registry = new RunEventCodecRegistry()
  const createdLine = registry.encodeV2(nativeDraft(fixture.state))
  const created = decodeCanonicalLine(createdLine)
  const verified = success(registry.verifyStream([createdLine]))

  assert.equal(created.schemaVersion, EVENT_V2)
  assert.equal(created.canonicalizationVersion, CANONICAL_V1)
  assert.equal(created.previousEventHash, undefined)
  assert.equal(created.previousStateHash, undefined)
  assert.equal(created.stateHash, hashCanonicalJsonV1(fixture.state))
  assert.equal(verified.events[0].event.hash, created.hash)
  assert.deepEqual(verified.head, {
    version: "v2",
    sequence: 1,
    eventHash: created.hash,
    stateHash: created.stateHash,
    runId: RUN_ID
  })
})

test("registry accepts all 19 exhaustive v2 event kinds", () => {
  assert.deepEqual(RUN_EVENT_KIND_V2_VALUES, [
    "run.created",
    "run.imported",
    "stream.cutover",
    "run.transitioned",
    "attempt.started",
    "attempt.retry-started",
    "attempt.completed",
    "attempt.failed",
    "effect.intent-recorded",
    "effect.succeeded",
    "effect.failed",
    "effect.cancelled",
    "effect.in-doubt",
    "effect.reconciled",
    "artifact.committed",
    "approval.recorded",
    "budget.exhausted",
    "cancel.requested",
    "run.forked"
  ])

  const fixture = phase4()
  const registry = new RunEventCodecRegistry()
  const createdLine = registry.encodeV2(nativeDraft(fixture.state))
  const lines = [createdLine]
  let previous = decodeCanonicalLine(createdLine)
  for (const kind of RUN_EVENT_KIND_V2_VALUES.slice(3)) {
    const line = registry.encodeV2(nextDraft(previous, {
      eventId: `event-${kind}`,
      kind
    }))
    lines.push(line)
    previous = decodeCanonicalLine(line)
  }
  const native = success(registry.verifyStream(lines))
  assert.deepEqual(native.events.map((entry) => entry.event.kind), [
    "run.created",
    ...RUN_EVENT_KIND_V2_VALUES.slice(3)
  ])

  const importedLine = registry.encodeV2({
    ...nativeDraft(fixture.state),
    eventId: "event-imported",
    kind: "run.imported",
    evidence: {
      sourceRunHash: fixture.v1Head.runHash,
      sourceSchemaVersion: fixture.sourceState.schemaVersion,
      upgradedSourceStateHash: hashCanonicalJsonV1(fixture.state),
      importerVersion: "workflow-register/legacy-importer/v1"
    }
  })
  const imported = success(registry.verifyStream([importedLine]))
  assert.equal(imported.events[0].event.kind, "run.imported")
  assert.equal(imported.events[0].event.previousStateHash, undefined)

  const cutoverLine = registry.encodeV2(cutoverDraft(fixture))
  const cutover = success(registry.verifyStream([...fixture.v1Lines, cutoverLine]))
  assert.equal(cutover.events.at(-1).event.kind, "stream.cutover")
})

test("inspectVersion and decodeLine consume and return one exact LF-terminated Buffer", () => {
  const fixture = phase4()
  const registry = new RunEventCodecRegistry()
  assert.deepEqual(registry.inspectVersion(fixture.v1Lines[0]), { schemaVersion: EVENT_V1 })

  const line = registry.encodeV2(nativeDraft(fixture.state))
  assert.equal(Buffer.isBuffer(line), true)
  assert.equal(line.at(-1), 0x0a)
  assert.deepEqual(registry.inspectVersion(line), {
    schemaVersion: EVENT_V2,
    canonicalizationVersion: CANONICAL_V1
  })
  const decoded = registry.decodeLine(line, { expectedSequence: 1, lineNumber: 9 })
  assert.equal(decoded.version, "v2")
  assert.deepEqual(decoded.exactLine, line)
  assert.notEqual(decoded.exactLine, line)

  for (const bytes of [Buffer.alloc(0), Buffer.from("\n"), line.subarray(0, -1), Buffer.concat([line, line])]) {
    assert.throws(
      () => registry.inspectVersion(bytes),
      (error) => error instanceof RunEventCodecError && error.category === "malformed"
    )
  }
})

test("run.imported and stream.cutover require hash-bound transition evidence", async (t) => {
  const fixture = phase4()
  const registry = new RunEventCodecRegistry()
  const validCutover = registry.encodeV2(cutoverDraft(fixture))
  const imported = registry.encodeV2({
    ...nativeDraft(fixture.state),
    eventId: "event-imported",
    kind: "run.imported",
    evidence: {
      sourceRunHash: fixture.v1Head.runHash,
      sourceEventHash: fixture.v1Head.hash,
      sourceSchemaVersion: fixture.sourceState.schemaVersion,
      upgradedSourceStateHash: hashCanonicalJsonV1(fixture.state),
      importerVersion: "workflow-register/legacy-importer/v1"
    }
  })
  assert.equal(success(registry.verifyStream([imported])).events[0].event.kind, "run.imported")

  await t.test("cutover may omit optional sourceEventHash", () => {
    const evidence = transitionEvidence(fixture)
    delete evidence.sourceEventHash
    const line = registry.encodeV2(cutoverDraft(fixture, { evidence }))
    const verified = success(registry.verifyStream([...fixture.v1Lines, line]))
    assert.equal(verified.events.at(-1).event.kind, "stream.cutover")
    assert.equal(verified.events.at(-1).event.evidence.sourceEventHash, undefined)
  })

  const cases = [
    ["wrong cutover sourceEventHash", (record) => { record.evidence.sourceEventHash = HASH_C }],
    ["wrong sourceRunHash", (record) => { record.evidence.sourceRunHash = HASH_C }],
    ["wrong sourceSchemaVersion", (record) => { record.evidence.sourceSchemaVersion = "workflow-register/run-state/v0" }],
    ["wrong upgradedSourceStateHash", (record) => { record.evidence.upgradedSourceStateHash = HASH_C }],
    ["missing importerVersion", (record) => { delete record.evidence.importerVersion }]
  ]
  for (const [name, mutation] of cases) {
    await t.test(name, () => {
      const line = mutateLine(validCutover, mutation)
      failure(registry.verifyStream([...fixture.v1Lines, line]), "transition-evidence", 4)
    })
  }

  await t.test("self-consistent state that is not the deterministic v1 upgrade", () => {
    const line = mutateLine(validCutover, (record) => {
      record.state.workflowName = "tampered-after-v1"
      record.stateHash = hashCanonicalJsonV1(record.state)
      record.evidence.upgradedSourceStateHash = record.stateHash
    })
    failure(registry.verifyStream([...fixture.v1Lines, line]), "transition-evidence", 4)
  })
})

test("public v1 decodeLine binds an omitted or explicit run id to the verified previous event", () => {
  const fixture = phase4()
  const registry = new RunEventCodecRegistry()
  const previous = registry.decodeLine(fixture.v1Lines[0], {
    expectedSequence: 1,
    lineNumber: 1
  })
  const runB = structuredClone(previous.event.snapshot)
  runB.runId = "run-B"
  runB.updatedAt = "2026-07-17T00:02:00.000Z"
  const crossRunEvent = buildWorkflowRunEvent({
    run: runB,
    kind: "run.updated",
    occurredAt: "2026-07-17T00:02:00.000Z",
    eventId: "event-run-B",
    previousEvent: previous.event,
    previousRunHash: previous.event.runHash
  })
  const crossRunLine = Buffer.from(`${JSON.stringify(crossRunEvent)}\n`, "utf8")

  for (const context of [
    { expectedSequence: 2, previous, lineNumber: 2 },
    { expectedRunId: "run-B", expectedSequence: 2, previous, lineNumber: 2 }
  ]) {
    assert.throws(
      () => registry.decodeLine(crossRunLine, context),
      (error) => {
        assert.equal(error instanceof RunEventCodecError, true)
        assert.equal(error.category, "run-id")
        assert.equal(error.lineNumber, 2)
        assert.equal("event" in error, false)
        assert.equal("state" in error, false)
        assert.equal("head" in error, false)
        return true
      }
    )
  }
  failure(registry.verifyStream([fixture.v1Lines[0], crossRunLine]), "run-id", 2)
})

test("corruption failures use stable categories and return no partially trusted stream", async (t) => {
  const fixture = phase4()
  const registry = new RunEventCodecRegistry()
  const firstLine = registry.encodeV2(nativeDraft(fixture.state))
  const first = decodeCanonicalLine(firstLine)
  const secondLine = registry.encodeV2(nextDraft(first))
  const { schemaVersion, ...canonicalRemainder } = first
  const noncanonicalLine = Buffer.from(`${JSON.stringify({ schemaVersion, ...canonicalRemainder })}\n`, "utf8")
  assert.notDeepEqual(noncanonicalLine, firstLine)

  const cases = [
    ["duplicate sequence", [firstLine, mutateLine(secondLine, (record) => { record.sequence = 1 })], "sequence", 2],
    ["gapped sequence", [firstLine, mutateLine(secondLine, (record) => { record.sequence = 3 })], "sequence", 2],
    ["duplicate event id", [firstLine, mutateLine(secondLine, (record) => { record.eventId = first.eventId })], "sequence", 2],
    ["wrong previous event hash", [firstLine, mutateLine(secondLine, (record) => { record.previousEventHash = HASH_C })], "ancestry", 2],
    ["wrong previous state hash", [firstLine, mutateLine(secondLine, (record) => { record.previousStateHash = HASH_C })], "ancestry", 2],
    ["wrong state hash", [mutateLine(firstLine, (record) => { record.stateHash = HASH_C })], "state-hash", 1],
    ["wrong event hash", [mutateLine(firstLine, (record) => { record.hash = HASH_C }, false)], "event-hash", 1],
    ["blank middle line", [firstLine, Buffer.from("\n"), secondLine], "malformed", 2],
    ["torn unrelated tail", [firstLine, Buffer.from('{"unrelated":true}')], "malformed", 2],
    ["unknown schema", [mutateLine(firstLine, (record) => { record.schemaVersion = "workflow-register/run-event/v99" })], "unknown-schema", 1],
    ["unknown canonicalization", [mutateLine(firstLine, (record) => { record.canonicalizationVersion = "workflow-register/canonical-json/v99" })], "unknown-canonicalization", 1],
    ["mismatched run id", [firstLine, mutateLine(secondLine, (record) => { record.runId = "other-run" })], "run-id", 2],
    ["noncanonical v2 bytes", [noncanonicalLine], "malformed", 1]
  ]
  for (const [name, lines, category, lineNumber] of cases) {
    await t.test(name, () => failure(registry.verifyStream(lines), category, lineNumber))
  }
})

test("canonical run.created and run.imported sequence gaps take precedence as sequence failures", async (t) => {
  const fixture = phase4()
  const registry = new RunEventCodecRegistry()
  const createdLine = registry.encodeV2(nativeDraft(fixture.state))
  const importedLine = registry.encodeV2({
    ...nativeDraft(fixture.state),
    eventId: "event-imported-gap",
    kind: "run.imported",
    evidence: {
      sourceRunHash: fixture.v1Head.runHash,
      sourceSchemaVersion: fixture.sourceState.schemaVersion,
      upgradedSourceStateHash: hashCanonicalJsonV1(fixture.state),
      importerVersion: "workflow-register/legacy-importer/v1"
    }
  })

  for (const [kind, validLine] of [
    ["run.created", createdLine],
    ["run.imported", importedLine]
  ]) {
    await t.test(kind, () => {
      const line = mutateLine(validLine, (record) => { record.sequence = 2 })
      assert.throws(
        () => registry.decodeLine(line, { expectedSequence: 1, lineNumber: 1 }),
        (error) => error instanceof RunEventCodecError
          && error.category === "sequence"
          && error.lineNumber === 1
      )
      failure(registry.verifyStream([line]), "sequence", 1)
    })
  }
})

test("the stream transition is one-way and genesis/cutover placement fails closed", async (t) => {
  const fixture = phase4()
  const registry = new RunEventCodecRegistry()
  const nativeLine = registry.encodeV2(nativeDraft(fixture.state))
  const cutoverLine = registry.encodeV2(cutoverDraft(fixture))
  const importedLine = registry.encodeV2({
    ...nativeDraft(fixture.state),
    kind: "run.imported",
    eventId: "event-imported",
    evidence: {
      sourceRunHash: fixture.v1Head.runHash,
      sourceSchemaVersion: fixture.sourceState.schemaVersion,
      upgradedSourceStateHash: hashCanonicalJsonV1(fixture.state),
      importerVersion: "workflow-register/legacy-importer/v1"
    }
  })

  const cases = [
    ["v1 after v2", [nativeLine, fixture.v1Lines[0]], "ancestry", 2],
    ["cutover without v1 prefix", [mutateLine(cutoverLine, (record) => { record.sequence = 1 })], "ancestry", 1],
    ["run.created after v1 prefix", [...fixture.v1Lines, mutateLine(cutoverLine, (record) => {
      record.kind = "run.created"
      delete record.previousEventHash
    })], "sequence", 4],
    ["run.imported after v1 prefix", [...fixture.v1Lines, mutateLine(importedLine, (record) => { record.sequence = 4 })], "sequence", 4]
  ]
  for (const [name, lines, category, lineNumber] of cases) {
    await t.test(name, () => failure(registry.verifyStream(lines), category, lineNumber))
  }
})

test("v2 rejects invalid canonical fields, actors, timestamps, hashes, and event kinds", async (t) => {
  const fixture = phase4()
  const registry = new RunEventCodecRegistry()
  const line = registry.encodeV2(nativeDraft(fixture.state))
  const cases = [
    ["unknown event kind", (record) => { record.kind = "effect.future" }],
    ["noncanonical timestamp", (record) => { record.occurredAt = "2026-07-17T09:04:00+09:00" }],
    ["actor kind missing", (record) => { delete record.actor.kind }],
    ["actor kind blank", (record) => { record.actor.kind = "" }],
    ["actor id unstable", (record) => { record.actor.id = " actor " }],
    ["actor unknown field", (record) => { record.actor.role = "admin" }],
    ["projection hash malformed", (record) => { record.projectionHash = "sha256:not-a-hash" }],
    ["unknown envelope field", (record) => { record.future = true }]
  ]
  for (const [name, mutation] of cases) {
    await t.test(name, () => failure(registry.verifyStream([mutateLine(line, mutation)]), "malformed", 1))
  }
})

test("encode and decode reject Proxies and accessors without invoking caller code", () => {
  const fixture = phase4()
  const registry = new RunEventCodecRegistry()
  let calls = 0
  const traps = {
    get() { calls += 1; throw new Error("get trap ran") },
    getOwnPropertyDescriptor() { calls += 1; throw new Error("descriptor trap ran") },
    getPrototypeOf() { calls += 1; throw new Error("prototype trap ran") },
    ownKeys() { calls += 1; throw new Error("ownKeys trap ran") }
  }
  const rootProxy = new Proxy(nativeDraft(fixture.state), traps)
  assert.throws(() => registry.encodeV2(rootProxy), /Proxy values are not supported/)
  assert.equal(calls, 0)

  const nestedProxy = new Proxy({}, traps)
  assert.throws(
    () => registry.encodeV2(nativeDraft(fixture.state, { evidence: nestedProxy })),
    /Proxy values are not supported/
  )
  assert.equal(calls, 0)

  const accessorDraft = nativeDraft(fixture.state)
  Object.defineProperty(accessorDraft, "eventId", {
    enumerable: true,
    get() { calls += 1; throw new Error("getter ran") }
  })
  assert.throws(() => registry.encodeV2(accessorDraft), /accessor properties are not supported/)
  assert.equal(calls, 0)

  const line = registry.encodeV2(nativeDraft(fixture.state))
  const lineProxy = new Proxy(line, traps)
  assert.throws(
    () => registry.decodeLine(lineProxy, { expectedSequence: 1 }),
    (error) => error instanceof RunEventCodecError && error.category === "malformed"
  )
  assert.equal(calls, 0)

  const previousWithAccessor = {}
  Object.defineProperty(previousWithAccessor, "version", {
    enumerable: true,
    get() { calls += 1; throw new Error("previous getter ran") }
  })
  assert.throws(
    () => registry.decodeLine(line, {
      expectedSequence: 2,
      previous: previousWithAccessor
    }),
    (error) => error instanceof RunEventCodecError && error.category === "malformed"
  )
  assert.equal(calls, 0)
})
