const assert = require("node:assert/strict")
const { readFileSync } = require("node:fs")
const { join } = require("node:path")
const { describe, test } = require("node:test")

const FIXTURE_ROOT = join(__dirname, "fixtures", "workflow-contract-v2", "yaml")

function yamlModule() {
  return require("../out/core/contractV2/yamlDocument.js")
}

function shapeModule() {
  return require("../out/core/contractV2/packageShape.js")
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function plain(value) {
  return JSON.parse(JSON.stringify(value))
}

function minimalDocument() {
  return {
    schemaVersion: "workflow-register/v2",
    id: "minimal",
    name: "Minimal workflow",
    description: "A minimal Contract v2 workflow.",
    inputs: [],
    steps: [{
      id: "finish",
      title: "Finish",
      type: "result",
      required: true,
      source: { source: "literal", value: null },
      artifacts: []
    }],
    requiredArtifacts: [],
    resumePolicy: {
      mode: "fail-closed",
      maxAttempts: 1,
      retainCommittedOutputs: false,
      allowArtifactReuse: false
    },
    providers: [],
    bob: {
      profile: "bob/2.0.1",
      requiredCapabilities: [],
      taskCapabilities: []
    }
  }
}

function parse(bytes, path = "workflow.yaml") {
  return yamlModule().parseWorkflowContractV2Yaml({ bytes, path })
}

function validate(document, path = "workflow.yaml") {
  return shapeModule().validateWorkflowContractV2PackageShape({ document, path })
}

function oneDiagnostic(result, code, pointer) {
  assert.equal(result.ok, false)
  assert.equal(result.diagnostics.length, 1)
  assert.equal(result.diagnostics[0].code, code)
  assert.equal(result.diagnostics[0].severity, "error")
  assert.deepEqual(result.diagnostics[0].location, { path: "workflow.yaml", pointer })
  assert.equal(Object.isFrozen(result), true)
  assert.equal(Object.isFrozen(result.diagnostics), true)
  return result.diagnostics[0]
}

function expectLayout(document, pointer) {
  oneDiagnostic(validate(document), "WF2_PACKAGE_LAYOUT_INVALID", pointer)
}

function expectUnknown(document, pointer) {
  oneDiagnostic(validate(document), "WF2_UNKNOWN_OR_NOOP_FIELD", pointer)
}

function replaceAt(document, pointer, value) {
  const parts = pointer.split("/").slice(1)
  let current = document
  for (let index = 0; index < parts.length - 1; index += 1) {
    current = current[parts[index]]
  }
  current[parts.at(-1)] = value
  return document
}

function richDocument() {
  const document = minimalDocument()
  document.inputs = [{
    id: "request",
    title: "Request",
    description: "The request to process.",
    schema: "schemas/request.json",
    required: true,
    default: { topic: "release" },
    requiredWhen: {
      kind: "exists",
      left: { source: "input", id: "request", pointer: "/topic" }
    }
  }]
  document.providers = [{
    id: "builder",
    version: "^1.2.3",
    inputSchema: "schemas/request.json",
    output: { kind: "value", schema: "schemas/result.json" },
    errorSchema: "schemas/error.json",
    sideEffect: "workspace-write",
    idempotency: "key-required",
    requiredCapabilities: ["workflow.effect.workspace-write"]
  }]
  document.requiredArtifacts = [{
    id: "report",
    producedBy: "build",
    path: "reports/result.json",
    mediaType: "application/json",
    schema: "schemas/report.json",
    maxBytes: 1024,
    owner: "provider",
    required: true
  }]
  document.steps = [{
    id: "build",
    title: "Build",
    type: "command",
    required: true,
    provider: "builder",
    input: {
      source: "object",
      properties: {
        request: { source: "input", id: "request", pointer: "" },
        tags: {
          source: "array",
          items: [{ source: "literal", value: "contract-v2" }]
        }
      }
    },
    output: {
      kind: "value",
      id: "buildOutput",
      schema: "schemas/result.json",
      maxBytes: 4096
    },
    artifacts: ["report"],
    transition: {
      decisions: [{
        id: "retry",
        when: {
          kind: "equals",
          left: { source: "committedOutput", id: "buildOutput", pointer: "/retry" },
          right: true
        },
        goto: "build",
        loop: {
          id: "buildLoop",
          maxIterations: 3,
          extensionSize: 1,
          checkpoint: { title: "Retry build", message: "Retry the build." }
        }
      }],
      default: { goto: "draft" }
    }
  }, {
    id: "draft",
    title: "Draft",
    type: "agent",
    required: true,
    prompt: "prompts/draft.md",
    context: [{ source: "committedOutput", id: "buildOutput", pointer: "" }],
    output: {
      kind: "value",
      id: "draftOutput",
      schema: "schemas/draft.json",
      maxBytes: 4096
    },
    artifacts: []
  }, {
    id: "review",
    title: "Review",
    type: "manual",
    required: false,
    prompt: "prompts/review.md",
    form: {
      fields: [{
        id: "summary",
        title: "Summary",
        type: "string",
        required: true,
        default: "Ready",
        multiline: true
      }, {
        id: "score",
        title: "Score",
        type: "number",
        required: false,
        default: 1
      }, {
        id: "confirmed",
        title: "Confirmed",
        type: "boolean",
        required: false,
        default: false
      }, {
        id: "channel",
        title: "Channel",
        type: "select",
        required: true,
        default: "stable",
        options: ["preview", "stable"]
      }]
    },
    approval: {
      message: "Approve this release?",
      approveLabel: "Approve",
      rejectLabel: "Reject"
    },
    output: {
      kind: "value",
      id: "reviewOutput",
      schema: "schemas/review.json",
      maxBytes: 4096
    }
  }, {
    id: "finish",
    title: "Finish",
    type: "result",
    required: true,
    when: {
      kind: "not",
      predicate: {
        kind: "equals",
        left: { source: "committedOutput", id: "reviewOutput", pointer: "/decision" },
        right: "rejected"
      }
    },
    source: { source: "committedOutput", id: "reviewOutput", pointer: "" },
    artifacts: ["report"]
  }]
  document.resumePolicy = {
    mode: "restart-step",
    maxAttempts: 3,
    retainCommittedOutputs: true,
    allowArtifactReuse: false
  }
  document.bob = {
    profile: "bob/2.0.1",
    requiredCapabilities: ["source.log", "task.sendMessage"],
    taskCapabilities: ["task.sendMessage"]
  }
  return document
}

describe("strict YAML document boundary", () => {
  test("exports exact policy literals and parses the minimal fixture into detached frozen JSON", () => {
    const bytes = readFileSync(join(FIXTURE_ROOT, "valid-minimal.yaml"))
    const parsed = parse(bytes)

    assert.equal(yamlModule().WORKFLOW_CONTRACT_V2_YAML_POLICY, "workflow-contract-yaml/v2")
    assert.equal(shapeModule().WORKFLOW_CONTRACT_V2_PACKAGE_SHAPE_POLICY, "workflow-contract-package-shape/v2")
    assert.equal(parsed.ok, true)
    assert.deepEqual(plain(parsed.document), minimalDocument())
    assert.equal(Object.getPrototypeOf(parsed.document), null)
    assert.equal(Object.isFrozen(parsed), true)
    assert.equal(Object.isFrozen(parsed.document), true)
    assert.equal(Object.isFrozen(parsed.document.steps), true)
    assert.equal(Object.isFrozen(parsed.document.steps[0]), true)
    assert.deepEqual(parsed.diagnostics, [])
    assert.equal(Object.isFrozen(parsed.diagnostics), true)

    const validated = validate(parsed.document)
    assert.equal(validated.ok, true)
    assert.deepEqual(plain(validated.value), minimalDocument())
    assert.notEqual(validated.value, parsed.document)
    assert.equal(Object.isFrozen(validated.value), true)
  })

  test("rejects BOM and malformed UTF-8 before YAML construction", () => {
    oneDiagnostic(
      parse(Buffer.from([0xef, 0xbb, 0xbf, 0x61, 0x3a, 0x20, 0x31, 0x0a])),
      "WF2_PACKAGE_LAYOUT_INVALID",
      ""
    )
    oneDiagnostic(
      parse(Buffer.from([0x61, 0x3a, 0x20, 0xc3, 0x28, 0x0a])),
      "WF2_PACKAGE_LAYOUT_INVALID",
      ""
    )
  })

  test("rejects every forbidden YAML construction from the fixture table", async (t) => {
    const cases = JSON.parse(readFileSync(join(FIXTURE_ROOT, "invalid-cases.json"), "utf8"))
    for (const entry of cases) {
      await t.test(entry.name, () => {
        oneDiagnostic(parse(Buffer.from(entry.text, "utf8")), entry.code, entry.pointer)
      })
    }
  })

  test("does not mistake quoted or block-scalar marker text for YAML features", () => {
    const source = [
      "quoted: \"&anchor *alias !tag 2026-07-22\"",
      "single: '&anchor *alias !tag 2026-07-22'",
      "block: |",
      "  &anchor *alias !tag 2026-07-22",
      ""
    ].join("\n")
    const result = parse(Buffer.from(source))
    assert.equal(result.ok, true)
    assert.deepEqual(plain(result.document), {
      block: "&anchor *alias !tag 2026-07-22\n",
      quoted: "&anchor *alias !tag 2026-07-22",
      single: "&anchor *alias !tag 2026-07-22"
    })
  })

  test("tracks quoted scalars across physical lines while scanning forbidden syntax", () => {
    const source = [
      "double: \"first line",
      "  &anchor *alias !tag 2026-07-22\"",
      "single: 'first line",
      "  &anchor *alias !tag 2026-07-22'",
      ""
    ].join("\n")
    const result = parse(Buffer.from(source))
    assert.equal(result.ok, true)
    assert.deepEqual(plain(result.document), {
      double: "first line &anchor *alias !tag 2026-07-22",
      single: "first line &anchor *alias !tag 2026-07-22"
    })
  })

  test("does not reject timestamp-like and non-finite-like text inside a larger plain scalar", () => {
    const result = parse(Buffer.from([
      "description: Released 2026-07-22",
      "note: Treat .inf as text here",
      ""
    ].join("\n")))

    assert.equal(result.ok, true)
    assert.deepEqual(plain(result.document), {
      description: "Released 2026-07-22",
      note: "Treat .inf as text here"
    })
  })

  test("rejects flow-style sequence and mapping keys before js-yaml can stringify them", () => {
    oneDiagnostic(parse(Buffer.from("{ [a, b]: value }\n")), "WF2_PACKAGE_LAYOUT_INVALID", "")
    oneDiagnostic(parse(Buffer.from("{ {a: b}: value }\n")), "WF2_PACKAGE_LAYOUT_INVALID", "")
  })

  test("snapshots the outer YAML API record without invoking accessors", () => {
    let getterCalls = 0
    const hostile = {}
    Object.defineProperty(hostile, "bytes", {
      enumerable: true,
      get() {
        getterCalls += 1
        return Buffer.from("value: 1\n")
      }
    })
    Object.defineProperty(hostile, "path", { enumerable: true, value: "workflow.yaml" })
    oneDiagnostic(yamlModule().parseWorkflowContractV2Yaml(hostile), "WF2_PACKAGE_LAYOUT_INVALID", "")
    assert.equal(getterCalls, 0)

    oneDiagnostic(
      yamlModule().parseWorkflowContractV2Yaml(new Proxy({
        bytes: Buffer.from("value: 1\n"),
        path: "workflow.yaml"
      }, {})),
      "WF2_PACKAGE_LAYOUT_INVALID",
      ""
    )
  })
})

describe("closed package shape", () => {
  test("accepts every step, field, output, template, provider, artifact, resume, and Bob variant", () => {
    const document = richDocument()
    const result = validate(document)

    assert.equal(result.ok, true)
    assert.deepEqual(plain(result.value), document)
    assert.notEqual(result.value, document)
    assert.equal(Object.getPrototypeOf(result.value), null)
    assert.equal(Object.isFrozen(result.value.steps[0].input), true)
    document.steps[0].title = "mutated"
    assert.equal(result.value.steps[0].title, "Build")
  })

  test("requires the exact schema version and all closed top-level fields", async (t) => {
    const unsupported = minimalDocument()
    unsupported.schemaVersion = "workflow-register/v1"
    oneDiagnostic(validate(unsupported), "WF2_SCHEMA_VERSION_UNSUPPORTED", "/schemaVersion")

    for (const key of Object.keys(minimalDocument())) {
      await t.test(`missing ${key}`, () => {
        const document = minimalDocument()
        delete document[key]
        expectLayout(document, "")
      })
    }

    const extra = minimalDocument()
    extra.compatibility = "v1"
    expectUnknown(extra, "/compatibility")
  })

  test("reports unknown, no-op, and step-inapplicable fields at exact escaped pointers", () => {
    const unknownNested = minimalDocument()
    unknownNested.resumePolicy["ignored/value~"] = true
    expectUnknown(unknownNested, "/resumePolicy/ignored~1value~0")

    const wrongVariant = minimalDocument()
    wrongVariant.steps[0].prompt = "prompts/noop.md"
    expectUnknown(wrongVariant, "/steps/0/prompt")

    const wrongFieldVariant = richDocument()
    wrongFieldVariant.steps[2].form.fields[1].multiline = false
    expectUnknown(wrongFieldVariant, "/steps/2/form/fields/1/multiline")
  })

  test("validates identifiers, human text, booleans, enums, typed defaults, and numeric bounds", async (t) => {
    const cases = [
      ["/id", "not valid", "/id"],
      ["/name", "", "/name"],
      ["/description", "x".repeat(8193), "/description"],
      ["/steps/0/required", "true", "/steps/0/required"],
      ["/resumePolicy/mode", "continue", "/resumePolicy/mode"],
      ["/resumePolicy/maxAttempts", 0, "/resumePolicy/maxAttempts"],
      ["/resumePolicy/maxAttempts", 101, "/resumePolicy/maxAttempts"],
      ["/resumePolicy/maxAttempts", 1.5, "/resumePolicy/maxAttempts"]
    ]
    for (const [pointer, value, expected] of cases) {
      await t.test(pointer, () => expectLayout(replaceAt(minimalDocument(), pointer, value), expected))
    }

    const wrongDefault = richDocument()
    wrongDefault.steps[2].form.fields[1].default = "1"
    expectLayout(wrongDefault, "/steps/2/form/fields/1/default")

    const selectDefault = richDocument()
    selectDefault.steps[2].form.fields[3].default = "nightly"
    expectLayout(selectDefault, "/steps/2/form/fields/3/default")

    const decisionField = richDocument()
    decisionField.steps[2].form.fields[0].id = "decision"
    expectLayout(decisionField, "/steps/2/form/fields/0/id")
  })

  test("requires manual form or approval and exact output/provider compatibility", () => {
    const emptyManual = richDocument()
    delete emptyManual.steps[2].form
    delete emptyManual.steps[2].approval
    expectLayout(emptyManual, "/steps/2")

    const unitMismatch = richDocument()
    unitMismatch.providers[0].output = { kind: "unit" }
    expectLayout(unitMismatch, "/steps/0/output")

    const schemaMismatch = richDocument()
    schemaMismatch.providers[0].output.schema = "schemas/other.json"
    expectLayout(schemaMismatch, "/steps/0/output/schema")

    const duplicateOutput = richDocument()
    duplicateOutput.steps[1].output.id = "buildOutput"
    expectLayout(duplicateOutput, "/steps/1/output/id")

    const unit = minimalDocument()
    unit.providers = [{
      id: "checker",
      version: "1.0.0",
      inputSchema: "schemas/input.json",
      output: { kind: "unit" },
      errorSchema: "schemas/error.json",
      sideEffect: "none",
      idempotency: "idempotent",
      requiredCapabilities: []
    }]
    unit.steps.unshift({
      id: "check",
      title: "Check",
      type: "command",
      required: true,
      provider: "checker",
      input: { source: "literal", value: null },
      output: { kind: "unit" },
      artifacts: []
    })
    assert.equal(validate(unit).ok, true)
  })

  test("accepts the supported SemVer range grammar without requiring provider binding", () => {
    for (const version of [
      "*",
      "=1.2.3",
      "1.2.x",
      ">=1.2.3 <2.0.0",
      "1.2.3 - 2.0.0",
      "1.2.3-beta.1+build.5",
      "<= 1.2.3",
      "^1.2.3 || ^2.0.0"
    ]) {
      const document = richDocument()
      document.providers[0].version = version
      assert.equal(validate(document).ok, true, version)
    }
  })

  test("validates package references, JSON Pointers, capabilities, paths, media types, and semantic ownership", async (t) => {
    const cases = [
      ["/steps/1/prompt", "inline prompt", "/steps/1/prompt"],
      ["/steps/0/output/schema", "/absolute.json", "/steps/0/output/schema"],
      ["/steps/1/context/0/pointer", "not/a/pointer", "/steps/1/context/0/pointer"],
      ["/providers/0/version", "not a range", "/providers/0/version"],
      ["/requiredArtifacts/0/path", "../escape.json", "/requiredArtifacts/0/path"],
      ["/requiredArtifacts/0/mediaType", "Application/JSON", "/requiredArtifacts/0/mediaType"],
      ["/requiredArtifacts/0/maxBytes", 67108865, "/requiredArtifacts/0/maxBytes"]
    ]
    for (const [pointer, value, expected] of cases) {
      await t.test(pointer, () => expectLayout(replaceAt(richDocument(), pointer, value), expected))
    }

    const unsortedProvider = richDocument()
    unsortedProvider.providers[0].requiredCapabilities = ["z", "a"]
    expectLayout(unsortedProvider, "/providers/0/requiredCapabilities")

    const missingEffect = richDocument()
    missingEffect.providers[0].requiredCapabilities = []
    expectLayout(missingEffect, "/providers/0/requiredCapabilities")

    const noneWithEffect = richDocument()
    noneWithEffect.providers[0].sideEffect = "none"
    expectLayout(noneWithEffect, "/providers/0/requiredCapabilities/0")

    const invalidBob = richDocument()
    invalidBob.bob.taskCapabilities = ["source.log"]
    expectLayout(invalidBob, "/bob/taskCapabilities/0")

    const providerOwnedByAgent = richDocument()
    providerOwnedByAgent.requiredArtifacts[0].producedBy = "draft"
    expectLayout(providerOwnedByAgent, "/requiredArtifacts/0/owner")

    for (const version of [
      "1..2",
      "1.2.3.4",
      "1 ||",
      "=>1.0.0",
      "01.2.3",
      "1.2.3-01",
      "1.2.3-alpha..1",
      "1.x-beta",
      "1.x.3",
      "x.2.3",
      ">=1.*.3"
    ]) {
      const invalidRange = richDocument()
      invalidRange.providers[0].version = version
      expectLayout(invalidRange, "/providers/0/version")
    }

    const longSchemaReference = richDocument()
    longSchemaReference.steps[0].output.schema = `schemas/${"a".repeat(232)}.json`
    longSchemaReference.providers[0].output.schema = longSchemaReference.steps[0].output.schema
    expectLayout(longSchemaReference, "/providers/0/output/schema")

    const workspaceWithExternalCapability = richDocument()
    workspaceWithExternalCapability.providers[0].requiredCapabilities = [
      "workflow.effect.external",
      "workflow.effect.workspace-write"
    ]
    expectLayout(workspaceWithExternalCapability, "/providers/0/requiredCapabilities/0")

    const externalWithWorkspaceCapability = richDocument()
    externalWithWorkspaceCapability.providers[0].sideEffect = "external"
    externalWithWorkspaceCapability.providers[0].requiredCapabilities = [
      "workflow.effect.external",
      "workflow.effect.workspace-write"
    ]
    expectLayout(externalWithWorkspaceCapability, "/providers/0/requiredCapabilities/1")

    const nestedSchemaReference = richDocument()
    nestedSchemaReference.providers[0].output.schema = "schemas/nested/result.json"
    nestedSchemaReference.steps[0].output.schema = "schemas/nested/result.json"
    expectLayout(nestedSchemaReference, "/providers/0/output/schema")

    const nestedPromptReference = richDocument()
    nestedPromptReference.steps[1].prompt = "prompts/nested/draft.md"
    expectLayout(nestedPromptReference, "/steps/1/prompt")

    const orphanArtifact = richDocument()
    orphanArtifact.steps[0].artifacts = []
    expectLayout(orphanArtifact, "/requiredArtifacts/0/producedBy")
  })
})

describe("references, predicates, and control flow", () => {
  test("accepts forward/terminal defaults and loop-marked same/backward decisions", () => {
    assert.equal(validate(richDocument()).ok, true)

    const terminal = richDocument()
    terminal.steps[0].transition.default.goto = "$end"
    assert.equal(validate(terminal).ok, true)

    const fail = richDocument()
    fail.steps[0].transition.default.goto = "$fail"
    assert.equal(validate(fail).ok, true)
  })

  test("rejects invalid transition targets and loop placement", () => {
    const unknown = richDocument()
    unknown.steps[0].transition.default.goto = "missing"
    expectLayout(unknown, "/steps/0/transition/default/goto")

    const backwardWithoutLoop = richDocument()
    backwardWithoutLoop.steps[1].transition = {
      decisions: [{
        id: "back",
        when: { kind: "exists", left: { source: "input", id: "request", pointer: "" } },
        goto: "build"
      }],
      default: { goto: "review" }
    }
    expectLayout(backwardWithoutLoop, "/steps/1/transition/decisions/0/loop")

    const forwardWithLoop = richDocument()
    forwardWithLoop.steps[0].transition.decisions[0].goto = "draft"
    expectLayout(forwardWithLoop, "/steps/0/transition/decisions/0/loop")

    const backwardDefault = richDocument()
    backwardDefault.steps[1].transition = { decisions: [], default: { goto: "build" } }
    expectLayout(backwardDefault, "/steps/1/transition/default/goto")
  })

  test("enforces input, earlier-output, current-transition, and future-output visibility", () => {
    const inputUsesOutput = richDocument()
    inputUsesOutput.inputs[0].requiredWhen.left.source = "committedOutput"
    inputUsesOutput.inputs[0].requiredWhen.left.id = "buildOutput"
    expectLayout(inputUsesOutput, "/inputs/0/requiredWhen/left/source")

    const sameStepEntry = richDocument()
    sameStepEntry.steps[0].when = {
      kind: "exists",
      left: { source: "committedOutput", id: "buildOutput", pointer: "" }
    }
    expectLayout(sameStepEntry, "/steps/0/when/left/id")

    const futureContext = richDocument()
    futureContext.steps[1].context[0].id = "reviewOutput"
    expectLayout(futureContext, "/steps/1/context/0/id")

    const currentTransition = richDocument()
    assert.equal(validate(currentTransition).ok, true)

    const futureTransition = richDocument()
    futureTransition.steps[0].transition.decisions[0].when.left.id = "draftOutput"
    expectLayout(futureTransition, "/steps/0/transition/decisions/0/when/left/id")
  })

  test("rejects predicates outside allowed placements and invalid predicate shapes", () => {
    const misplaced = richDocument()
    misplaced.steps[0].input.when = { kind: "exists", left: { source: "input", id: "request", pointer: "" } }
    expectUnknown(misplaced, "/steps/0/input/when")

    const emptyAll = richDocument()
    emptyAll.steps[1].when = { kind: "all", predicates: [] }
    oneDiagnostic(validate(emptyAll), "WF2_PREDICATE_INVALID", "/steps/1/when/predicates")

    const unknownPredicate = richDocument()
    unknownPredicate.steps[1].when = { kind: "script", code: "return true" }
    oneDiagnostic(validate(unknownPredicate), "WF2_PREDICATE_INVALID", "/steps/1/when/kind")
  })
})

describe("fixed resource bounds and hostile inputs", () => {
  test("enforces every top-level and nested collection limit", async (t) => {
    const cases = [
      ["inputs", 257, (index) => ({
        id: `input.${index}`,
        title: `Input ${index}`,
        schema: "schemas/input.json",
        required: false
      }), "/inputs"],
      ["steps", 513, (index) => ({
        id: `step.${index}`,
        title: `Step ${index}`,
        type: "result",
        required: true,
        source: { source: "literal", value: null },
        artifacts: []
      }), "/steps"],
      ["requiredArtifacts", 513, (index) => ({
        id: `artifact.${index}`,
        producedBy: "finish",
        path: `artifacts/${index}.json`,
        mediaType: "application/json",
        schema: "schemas/artifact.json",
        maxBytes: 1,
        owner: "runtime",
        required: false
      }), "/requiredArtifacts"],
      ["providers", 257, (index) => ({
        id: `provider.${index}`,
        version: "1.0.0",
        inputSchema: "schemas/input.json",
        output: { kind: "unit" },
        errorSchema: "schemas/error.json",
        sideEffect: "none",
        idempotency: "idempotent",
        requiredCapabilities: []
      }), "/providers"]
    ]
    for (const [field, count, factory, pointer] of cases) {
      await t.test(`${field} one over`, () => {
        const document = minimalDocument()
        document[field] = Array.from({ length: count }, (_, index) => factory(index))
        expectLayout(document, pointer)
      })
    }

    const artifacts = richDocument()
    artifacts.steps[0].artifacts = Array.from({ length: 129 }, (_, index) => `artifact.${index}`)
    expectLayout(artifacts, "/steps/0/artifacts")

    const context = richDocument()
    context.steps[1].context = Array.from({ length: 257 }, () => ({
      source: "committedOutput", id: "buildOutput", pointer: ""
    }))
    expectLayout(context, "/steps/1/context")

    const decisions = richDocument()
    decisions.steps[0].transition.decisions = Array.from({ length: 129 }, (_, index) => ({
      id: `decision.${index}`,
      when: { kind: "exists", left: { source: "input", id: "request", pointer: "" } },
      goto: "$end"
    }))
    expectLayout(decisions, "/steps/0/transition/decisions")

    const fields = richDocument()
    fields.steps[2].form.fields = Array.from({ length: 129 }, (_, index) => ({
      id: `field.${index}`,
      title: `Field ${index}`,
      type: "boolean",
      required: false
    }))
    expectLayout(fields, "/steps/2/form/fields")

    const options = richDocument()
    options.steps[2].form.fields[3].options = Array.from({ length: 257 }, (_, index) => `option-${index}`)
    expectLayout(options, "/steps/2/form/fields/3/options")

    const capabilities = richDocument()
    capabilities.providers[0].requiredCapabilities = Array.from({ length: 129 }, (_, index) => `capability.${String(index).padStart(3, "0")}`)
    expectLayout(capabilities, "/providers/0/requiredCapabilities")
  })

  test("rejects duplicate identities and aliases at their second declaration", () => {
    const duplicateInput = richDocument()
    duplicateInput.inputs.push(clone(duplicateInput.inputs[0]))
    expectLayout(duplicateInput, "/inputs/1/id")

    const duplicateStep = richDocument()
    duplicateStep.steps[1].id = "build"
    expectLayout(duplicateStep, "/steps/1/id")

    const duplicateProvider = richDocument()
    duplicateProvider.providers.push(clone(duplicateProvider.providers[0]))
    expectLayout(duplicateProvider, "/providers/1/id")

    const duplicateArtifact = richDocument()
    duplicateArtifact.requiredArtifacts.push(clone(duplicateArtifact.requiredArtifacts[0]))
    expectLayout(duplicateArtifact, "/requiredArtifacts/1/id")

    const duplicateField = richDocument()
    duplicateField.steps[2].form.fields[1].id = "summary"
    expectLayout(duplicateField, "/steps/2/form/fields/1/id")

    const pathAlias = richDocument()
    pathAlias.requiredArtifacts.push({
      ...clone(pathAlias.requiredArtifacts[0]),
      id: "alias",
      path: "REPORTS/RESULT.JSON",
      owner: "runtime"
    })
    expectLayout(pathAlias, "/requiredArtifacts/1/path")
  })

  test("enforces template depth, template nodes, and constructed document bounds", () => {
    const deep = richDocument()
    let template = { source: "literal", value: null }
    for (let index = 0; index < 33; index += 1) template = { source: "array", items: [template] }
    deep.steps[0].input = template
    expectLayout(deep, "/steps/0/input")

    const wide = richDocument()
    wide.steps[0].input = {
      source: "array",
      items: Array.from({ length: 257 }, () => ({ source: "literal", value: null }))
    }
    expectLayout(wide, "/steps/0/input/items")

    const tooManyNodes = minimalDocument()
    tooManyNodes.steps[0].source.value = Array.from({ length: 65536 }, () => null)
    expectLayout(tooManyNodes, "")

    const templateNodeLimit = richDocument()
    const groups = Array.from({ length: 16 }, (_, groupIndex) => ({
      source: "array",
      items: Array.from(
        { length: groupIndex === 15 ? 254 : 255 },
        () => ({ source: "literal", value: null })
      )
    }))
    templateNodeLimit.steps[0].input = { source: "array", items: groups }
    assert.equal(validate(templateNodeLimit).ok, true)
    groups[15].items.push({ source: "literal", value: null })
    expectLayout(templateNodeLimit, "/steps/0/input")

    const documentDepth = minimalDocument()
    let nested = null
    for (let index = 0; index < 60; index += 1) nested = [nested]
    documentDepth.steps[0].source.value = nested
    expectLayout(documentDepth, "")
  })

  test("enforces predicate node and literal-byte budgets before semantic resolution", () => {
    const leaf = () => ({
      kind: "equals",
      left: { source: "input", id: "request", pointer: "" },
      right: true
    })
    const exact = richDocument()
    exact.steps[1].when = {
      kind: "all",
      predicates: Array.from({ length: 8 }, (_, groupIndex) => ({
        kind: "all",
        predicates: Array.from({ length: groupIndex === 7 ? 126 : 127 }, leaf)
      }))
    }
    assert.equal(validate(exact).ok, true)
    exact.steps[1].when.predicates[7].predicates.push(leaf())
    oneDiagnostic(validate(exact), "WF2_PREDICATE_INVALID", "/steps/1/when")

    const literalBudget = richDocument()
    literalBudget.steps[1].when = {
      kind: "equals",
      left: { source: "input", id: "request", pointer: "" },
      right: "x".repeat(262143)
    }
    oneDiagnostic(validate(literalBudget), "WF2_PREDICATE_INVALID", "/steps/1/when/right")
  })

  test("rejects sparse, exotic, accessor, proxy, and cyclic input without invoking user code", () => {
    const sparse = minimalDocument()
    sparse.inputs = new Array(1)
    expectLayout(sparse, "")

    const exotic = minimalDocument()
    exotic.inputs = Object.assign(Object.create(Array.prototype), { length: 0 })
    expectLayout(exotic, "")

    let getterCalls = 0
    const accessor = minimalDocument()
    Object.defineProperty(accessor, "id", {
      enumerable: true,
      get() {
        getterCalls += 1
        return "stolen"
      }
    })
    expectLayout(accessor, "")
    assert.equal(getterCalls, 0)

    expectLayout(new Proxy(minimalDocument(), {}), "")

    const cyclic = minimalDocument()
    cyclic.steps[0].source.value = cyclic
    expectLayout(cyclic, "")
  })

  test("does not depend on mutable source objects or live CommonJS helper exports", () => {
    const jsonValue = require("../out/core/contractV2/jsonValue.js")
    const originalClone = jsonValue.cloneAndFreezeJsonValue
    const loaded = shapeModule()
    jsonValue.cloneAndFreezeJsonValue = () => minimalDocument()
    try {
      const invalid = minimalDocument()
      invalid.schemaVersion = "workflow-register/v1"
      oneDiagnostic(loaded.validateWorkflowContractV2PackageShape({
        document: invalid,
        path: "workflow.yaml"
      }), "WF2_SCHEMA_VERSION_UNSUPPORTED", "/schemaVersion")
    } finally {
      jsonValue.cloneAndFreezeJsonValue = originalClone
    }
  })

  test("rejects hostile outer API records before getters or proxies can run", () => {
    let getterCalls = 0
    const hostile = {}
    Object.defineProperty(hostile, "document", {
      enumerable: true,
      get() {
        getterCalls += 1
        return minimalDocument()
      }
    })
    Object.defineProperty(hostile, "path", {
      enumerable: true,
      value: "workflow.yaml"
    })
    oneDiagnostic(shapeModule().validateWorkflowContractV2PackageShape(hostile), "WF2_PACKAGE_LAYOUT_INVALID", "")
    assert.equal(getterCalls, 0)

    oneDiagnostic(
      shapeModule().validateWorkflowContractV2PackageShape(new Proxy({
        document: minimalDocument(),
        path: "workflow.yaml"
      }, {})),
      "WF2_PACKAGE_LAYOUT_INVALID",
      ""
    )
  })
})
