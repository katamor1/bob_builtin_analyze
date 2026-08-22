const assert = require("node:assert/strict")
const { test } = require("node:test")

const DIAGNOSTIC_CODES = [
  "WF2_SCHEMA_VERSION_UNSUPPORTED",
  "WF2_PACKAGE_LAYOUT_INVALID",
  "WF2_UNKNOWN_OR_NOOP_FIELD",
  "WF2_LOCK_MISMATCH",
  "WF2_PROVIDER_CONTRACT_MISMATCH",
  "WF2_BOB_CAPABILITY_MISMATCH",
  "WF2_PREDICATE_INVALID",
  "WF2_PROVIDER_INPUT_INVALID",
  "WF2_PROVIDER_OUTPUT_INVALID",
  "WF2_PROVIDER_ERROR_INVALID",
  "WF2_REQUIRED_ARTIFACT_MISSING",
  "WF2_ARTIFACT_SCHEMA_INVALID"
]

function diagnosticsModule() {
  return require("../out/core/contractV2/diagnostics.js")
}

function diagnostic(overrides = {}) {
  const { createWorkflowContractV2Diagnostic } = diagnosticsModule()
  return createWorkflowContractV2Diagnostic({
    code: "WF2_PACKAGE_LAYOUT_INVALID",
    severity: "error",
    message: "Package layout is invalid.",
    location: { path: "workflow.yaml", pointer: "" },
    ...overrides
  })
}

test("exports the exact frozen workflow contract v2 diagnostic code set", () => {
  const { WORKFLOW_CONTRACT_V2_DIAGNOSTIC_CODES } = diagnosticsModule()

  assert.deepEqual(WORKFLOW_CONTRACT_V2_DIAGNOSTIC_CODES, DIAGNOSTIC_CODES)
  assert.equal(Object.isFrozen(WORKFLOW_CONTRACT_V2_DIAGNOSTIC_CODES), true)
  assert.throws(() => WORKFLOW_CONTRACT_V2_DIAGNOSTIC_CODES.push("WF2_NEW_CODE"), TypeError)
})

test("creates a detached deeply frozen diagnostic with a canonical location", () => {
  const location = { path: "schemas/input.json", pointer: "/properties/a~1b/~0value" }
  const relatedLocation = { path: "workflow.yaml", pointer: "/steps/0" }
  const relatedLocations = [relatedLocation]

  const value = diagnostic({ location, relatedLocations })

  location.path = "changed.json"
  relatedLocation.pointer = "/changed"
  relatedLocations.push({ path: "changed.json", pointer: "" })
  assert.deepEqual(value, {
    code: "WF2_PACKAGE_LAYOUT_INVALID",
    severity: "error",
    message: "Package layout is invalid.",
    location: { path: "schemas/input.json", pointer: "/properties/a~1b/~0value" },
    relatedLocations: [{ path: "workflow.yaml", pointer: "/steps/0" }]
  })
  assert.equal(Object.isFrozen(value), true)
  assert.equal(Object.isFrozen(value.location), true)
  assert.equal(Object.isFrozen(value.relatedLocations), true)
  assert.equal(Object.isFrozen(value.relatedLocations[0]), true)
})

test("rejects unknown codes and severities as programmer errors", () => {
  assert.throws(() => diagnostic({ code: "WF2_NOT_REGISTERED" }), TypeError)
  assert.throws(() => diagnostic({ severity: "fatal" }), TypeError)
  assert.throws(() => diagnostic({ severity: undefined }), TypeError)
})

test("accepts only portable package-relative POSIX locations", () => {
  for (const path of ["workflow.yaml", "schemas/input.schema.json", "prompts/a b.md"]) {
    assert.equal(diagnostic({ location: { path, pointer: "" } }).location.path, path)
  }

  for (const path of [
    "",
    ".",
    "..",
    "./workflow.yaml",
    "../workflow.yaml",
    "schemas/../workflow.yaml",
    "schemas//input.json",
    "schemas/./input.json",
    "schemas/input.json/",
    "/workflow.yaml",
    "C:/workflow.yaml",
    "schemas\\input.json",
    "schemas\u0009input.json",
    "schemas\u000ainput.json",
    "schemas\u007finput.json",
    "schemas\u0085input.json"
  ]) {
    assert.throws(() => diagnostic({ location: { path, pointer: "" } }), TypeError, path)
  }
})

test("accepts only RFC 6901 JSON Pointers without control characters", () => {
  for (const pointer of ["", "/", "/steps/0", "/a~0b", "/a~1b", "/a~01b"]) {
    assert.equal(diagnostic({ location: { path: "workflow.yaml", pointer } }).location.pointer, pointer)
  }

  for (const pointer of ["steps/0", "#", "/a~", "/a~2b", "/a\u0009b", "/a\u000ab", "/a\u007fb", "/a\u0085b"]) {
    assert.throws(() => diagnostic({ location: { path: "workflow.yaml", pointer } }), TypeError, pointer)
  }
})

test("rejects malformed Unicode in every diagnostic string", () => {
  assert.throws(() => diagnostic({ message: "bad\ud800value" }), TypeError)
  assert.throws(() => diagnostic({ location: { path: "bad\udfff.json", pointer: "" } }), TypeError)
  assert.throws(() => diagnostic({ location: { path: "workflow.yaml", pointer: "/bad\ud800" } }), TypeError)
})

test("normalizes message newlines and replaces non-display control characters", () => {
  const value = diagnostic({ message: "a\r\nb\rc\td\ne\u0000f\u001fg\u007fh\u0085i" })

  assert.equal(value.message, "a\nb\nc\td\ne�f�g�h�i")
})

test("redacts quoted POSIX and Windows paths without consuming safe suffix text", () => {
  const value = diagnostic({
    message: "read '/tmp/top secret/token.txt' then \"C:\\Users\\Ada\\secret key.txt\" now"
  })

  assert.equal(value.message, "read '<redacted-path>' then \"<redacted-path>\" now")
})

test("redacts unquoted absolute paths at arbitrary punctuation boundaries through line end", () => {
  const value = diagnostic({
    message: [
      "colon:/tmp/private token suffix",
      "bracket[/var/lib/private.json",
      "semicolon;C:\\Users\\Ada\\secret.txt",
      "control\u0000\\Users\\Ada\\rooted.txt"
    ].join("\n")
  })

  assert.equal(value.message, [
    "<redacted-path>",
    "bracket[<redacted-path>",
    "semicolon;<redacted-path>",
    "control�<redacted-path>"
  ].join("\n"))
})

test("redacts UNC, device, file, custom and opaque local path schemes", () => {
  const value = diagnostic({
    message: [
      "unc '\\\\server\\share\\secret.txt' done",
      "device '\\\\?\\C:\\vault\\secret.txt' done",
      "file file:///tmp/secret.txt",
      "custom custom:///var/private.txt",
      "single custom:/var/private.txt",
      "git git:/tmp/private.txt",
      "opaque custom:private-token",
      "file-drive file:C:\\vault\\secret.txt",
      "opaque local:/etc/private"
    ].join("\n")
  })

  assert.equal(value.message, [
    "unc '<redacted-path>' done",
    "device '<redacted-path>' done",
    "file <redacted-path>",
    "custom <redacted-path>",
    "single <redacted-path>",
    "git <redacted-path>",
    "opaque <redacted-path>",
    "file-drive <redacted-path>",
    "opaque <redacted-path>"
  ].join("\n"))
})

test("preserves only valid HTTP and HTTPS URLs with explicit nonempty authorities", () => {
  const preserved = [
    "https://example.com/private/file?q=1#part",
    "http://127.0.0.1:8080/a/b",
    "HTTPS://example.org/value"
  ]
  assert.equal(diagnostic({ message: preserved.join("\n") }).message, preserved.join("\n"))

  const redacted = diagnostic({
    message: [
      "hostless https:///tmp/private",
      "hostless-query http://?secret=/tmp/private",
      "file file:///tmp/private",
      "custom custom:///tmp/private"
    ].join("\n")
  })
  assert.equal(redacted.message, [
    "hostless <redacted-path>",
    "hostless-query <redacted-path>",
    "file <redacted-path>",
    "custom <redacted-path>"
  ].join("\n"))
})

test("rejects URL-like tokens whose parsed authority is not a real hostname", () => {
  const value = diagnostic({
    message: [
      "punctuation https://example.com;/tmp/private",
      "hyphen https://-/tmp/private",
      "dot https://./tmp/private"
    ].join("\n")
  })

  assert.equal(value.message, [
    "punctuation <redacted-path>",
    "hyphen <redacted-path>",
    "dot <redacted-path>"
  ].join("\n"))
})

test("fails closed for raw HTTP candidates containing local path hazards", () => {
  const value = diagnostic({
    message: [
      "https://example.com/\u0000C:\\Users\\Ada\\secret.txt",
      "quoted \"https://example.com/a /tmp/secret.txt\" done",
      "https://example.com/path;C:\\Users\\Ada\\secret.txt",
      "https://example.com/a\u0085/tmp/secret.txt",
      "https://example.com/a\u007f/tmp/secret.txt"
    ].join("\n")
  })

  assert.equal(value.message, [
    "<redacted-path>",
    "quoted \"<redacted-path>\" done",
    "<redacted-path>",
    "<redacted-path>",
    "<redacted-path>"
  ].join("\n"))
  assert.equal(
    diagnostic({ message: "https://example.com/a;/tmp/remote" }).message,
    "https://example.com/a;/tmp/remote"
  )
})

test("preserves a clean unquoted remote URL and its whitespace-delimited suffix", () => {
  assert.equal(
    diagnostic({ message: "See https://example.com/docs for details" }).message,
    "See https://example.com/docs for details"
  )
  assert.equal(
    diagnostic({ message: "See \"https://example.com/docs\" for details" }).message,
    "See \"https://example.com/docs\" for details"
  )
})

test("rejects forward-slash drive paths after every non-token boundary in clean URLs", () => {
  for (const message of [
    "https://example.com/?p=D:/vault/token.txt",
    "https://example.com/a=C:/Users/Ada/secret.txt",
    "https://example.com/!E:/x",
    "https://example.com/—F:/private"
  ]) {
    assert.equal(diagnostic({ message }).message, "<redacted-path>", message)
  }
  assert.equal(
    diagnostic({ message: "https://example.com/aD:/ordinary-remote-path" }).message,
    "https://example.com/aD:/ordinary-remote-path"
  )
})

test("rejects accessor-backed create inputs and snapshots no getter values", () => {
  const { createWorkflowContractV2Diagnostic } = diagnosticsModule()
  let codeGetterCalls = 0
  let severityGetterCalls = 0
  const input = {
    get code() {
      codeGetterCalls += 1
      return codeGetterCalls === 1 ? "WF2_PACKAGE_LAYOUT_INVALID" : "WF2_NOT_REGISTERED"
    },
    get severity() {
      severityGetterCalls += 1
      return severityGetterCalls === 1 ? "error" : "fatal"
    },
    message: "Package layout is invalid.",
    location: { path: "workflow.yaml", pointer: "" }
  }

  assert.throws(() => createWorkflowContractV2Diagnostic(input), TypeError)
  assert.equal(codeGetterCalls, 0)
  assert.equal(severityGetterCalls, 0)
})

test("rejects location accessors and related array accessors without invoking them", () => {
  let locationGetterCalls = 0
  const location = {
    get path() {
      locationGetterCalls += 1
      return "/tmp/secret"
    },
    pointer: ""
  }
  assert.throws(() => diagnostic({ location }), TypeError)
  assert.equal(locationGetterCalls, 0)

  let relatedGetterCalls = 0
  const relatedLocations = []
  Object.defineProperty(relatedLocations, 0, {
    enumerable: true,
    configurable: true,
    get() {
      relatedGetterCalls += 1
      return { path: "/tmp/secret", pointer: "" }
    }
  })
  assert.throws(() => diagnostic({ relatedLocations }), TypeError)
  assert.equal(relatedGetterCalls, 0)
})

test("rejects sort array and diagnostic accessors without invoking them", () => {
  const { sortWorkflowContractV2Diagnostics } = diagnosticsModule()
  let arrayGetterCalls = 0
  const diagnostics = []
  Object.defineProperty(diagnostics, 0, {
    enumerable: true,
    configurable: true,
    get() {
      arrayGetterCalls += 1
      return diagnostic()
    }
  })
  assert.throws(() => sortWorkflowContractV2Diagnostics(diagnostics), TypeError)
  assert.equal(arrayGetterCalls, 0)

  let recordGetterCalls = 0
  const record = {
    get code() {
      recordGetterCalls += 1
      return "WF2_PACKAGE_LAYOUT_INVALID"
    },
    severity: "error",
    message: "Package layout is invalid.",
    location: { path: "workflow.yaml", pointer: "" },
    relatedLocations: []
  }
  assert.throws(() => sortWorkflowContractV2Diagnostics([record]), TypeError)
  assert.equal(recordGetterCalls, 0)
})

test("rejects hidden, symbol and extra record or array fields", () => {
  const { createWorkflowContractV2Diagnostic, sortWorkflowContractV2Diagnostics } = diagnosticsModule()
  const base = {
    code: "WF2_PACKAGE_LAYOUT_INVALID",
    severity: "error",
    message: "Package layout is invalid.",
    location: { path: "workflow.yaml", pointer: "" }
  }
  for (const decorate of [
    (value) => { value.extra = true },
    (value) => { Object.defineProperty(value, "hidden", { value: true }) },
    (value) => { value[Symbol("secret")] = true }
  ]) {
    const input = { ...base }
    decorate(input)
    assert.throws(() => createWorkflowContractV2Diagnostic(input), TypeError)
  }

  for (const decorate of [
    (value) => { value.extra = true },
    (value) => { Object.defineProperty(value, "hidden", { value: true }) },
    (value) => { value[Symbol("secret")] = true }
  ]) {
    const values = [diagnostic()]
    decorate(values)
    assert.throws(() => sortWorkflowContractV2Diagnostics(values), TypeError)
  }

  assert.throws(() => diagnostic({
    location: { path: "workflow.yaml", pointer: "", extra: true }
  }), TypeError)
  assert.throws(() => diagnostic({
    relatedLocations: [{ path: "workflow.yaml", pointer: "", extra: true }]
  }), TypeError)
  assert.throws(() => sortWorkflowContractV2Diagnostics([{
    ...diagnostic(),
    extra: true
  }]), TypeError)
})

test("rejects record and array proxies without invoking their traps", () => {
  const { createWorkflowContractV2Diagnostic, sortWorkflowContractV2Diagnostics } = diagnosticsModule()
  let recordTrapCalls = 0
  const recordProxy = new Proxy({
    code: "WF2_PACKAGE_LAYOUT_INVALID",
    severity: "error",
    message: "Package layout is invalid.",
    location: { path: "workflow.yaml", pointer: "" }
  }, {
    get() { recordTrapCalls += 1 },
    getPrototypeOf() { recordTrapCalls += 1 },
    ownKeys() { recordTrapCalls += 1 }
  })
  assert.throws(() => createWorkflowContractV2Diagnostic(recordProxy), TypeError)
  assert.equal(recordTrapCalls, 0)

  let arrayTrapCalls = 0
  const arrayProxy = new Proxy([diagnostic()], {
    get() { arrayTrapCalls += 1 },
    getPrototypeOf() { arrayTrapCalls += 1 },
    ownKeys() { arrayTrapCalls += 1 }
  })
  assert.throws(() => sortWorkflowContractV2Diagnostics(arrayProxy), TypeError)
  assert.equal(arrayTrapCalls, 0)
})

test("accepts exact null-prototype data records and detaches their values", () => {
  const { createWorkflowContractV2Diagnostic } = diagnosticsModule()
  const location = Object.assign(Object.create(null), { path: "workflow.yaml", pointer: "" })
  const input = Object.assign(Object.create(null), {
    code: "WF2_PACKAGE_LAYOUT_INVALID",
    severity: "error",
    message: "Package layout is invalid.",
    location
  })

  const value = createWorkflowContractV2Diagnostic(input)

  assert.deepEqual(value.location, { path: "workflow.yaml", pointer: "" })
  assert.equal(Object.isFrozen(value), true)
})

test("truncates sanitized messages to exactly 512 Unicode code points", () => {
  const emoji = "🙂"
  const value = diagnostic({ message: "a".repeat(510) + emoji + "secret-suffix" })

  assert.equal(Array.from(value.message).length, 512)
  assert.equal(value.message, "a".repeat(510) + emoji + "…")
})

test("sorts diagnostics deterministically by severity, location, code, message and related locations", () => {
  const { sortWorkflowContractV2Diagnostics } = diagnosticsModule()
  const values = [
    diagnostic({ severity: "info", message: "A" }),
    diagnostic({ severity: "warning", message: "A" }),
    diagnostic({ message: "b", relatedLocations: [{ path: "z.json", pointer: "" }] }),
    diagnostic({ message: "a", relatedLocations: [{ path: "z.json", pointer: "" }] }),
    diagnostic({ message: "a", relatedLocations: [{ path: "a.json", pointer: "" }] }),
    diagnostic({ message: "a", relatedLocations: [{ path: "a.json", pointer: "" }] }),
    diagnostic({ code: "WF2_ARTIFACT_SCHEMA_INVALID", message: "a" }),
    diagnostic({ location: { path: "Z.json", pointer: "" }, message: "a" }),
    diagnostic({ location: { path: "a.json", pointer: "/b" }, message: "a" })
  ]

  const sorted = sortWorkflowContractV2Diagnostics(values)

  assert.deepEqual(sorted.map((item) => [
    item.severity,
    item.location.path,
    item.location.pointer,
    item.code,
    item.message,
    item.relatedLocations.map((related) => `${related.path}#${related.pointer}`).join(",")
  ]), [
    ["error", "Z.json", "", "WF2_PACKAGE_LAYOUT_INVALID", "a", ""],
    ["error", "a.json", "/b", "WF2_PACKAGE_LAYOUT_INVALID", "a", ""],
    ["error", "workflow.yaml", "", "WF2_ARTIFACT_SCHEMA_INVALID", "a", ""],
    ["error", "workflow.yaml", "", "WF2_PACKAGE_LAYOUT_INVALID", "a", "a.json#"],
    ["error", "workflow.yaml", "", "WF2_PACKAGE_LAYOUT_INVALID", "a", "a.json#"],
    ["error", "workflow.yaml", "", "WF2_PACKAGE_LAYOUT_INVALID", "a", "z.json#"],
    ["error", "workflow.yaml", "", "WF2_PACKAGE_LAYOUT_INVALID", "b", "z.json#"],
    ["warning", "workflow.yaml", "", "WF2_PACKAGE_LAYOUT_INVALID", "A", ""],
    ["info", "workflow.yaml", "", "WF2_PACKAGE_LAYOUT_INVALID", "A", ""]
  ])
  assert.equal(Object.isFrozen(sorted), true)
  assert.notStrictEqual(sorted[0], values[7])
  assert.equal(Object.isFrozen(sorted[0]), true)
})

test("sorts related locations lexicographically and retains duplicates", () => {
  const value = diagnostic({ relatedLocations: [
    { path: "z.json", pointer: "/b" },
    { path: "a.json", pointer: "/z" },
    { path: "a.json", pointer: "/a" },
    { path: "a.json", pointer: "/a" }
  ] })

  assert.deepEqual(value.relatedLocations, [
    { path: "a.json", pointer: "/a" },
    { path: "a.json", pointer: "/a" },
    { path: "a.json", pointer: "/z" },
    { path: "z.json", pointer: "/b" }
  ])
})

test("rejects sparse diagnostic and related-location arrays", () => {
  const { sortWorkflowContractV2Diagnostics } = diagnosticsModule()
  const sparseDiagnostics = new Array(1)
  const sparseRelated = new Array(1)

  assert.throws(() => sortWorkflowContractV2Diagnostics(sparseDiagnostics), TypeError)
  assert.throws(() => diagnostic({ relatedLocations: sparseRelated }), TypeError)
})
