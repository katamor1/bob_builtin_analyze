const assert = require("node:assert/strict")
const { readFileSync } = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")
const {
  INVALID_CASES,
  VALID,
  DIGEST,
  assertDeepFrozen,
  lockModule,
  pointerModule,
  replaceAt,
  validLock,
  validPointerInput
} = require("./workflowContractV2PackageSchemaTestSupport")

test("P1 composes F4's document type without defining or decoding a second package document", () => {
  const source = readFileSync(
    path.join(__dirname, "..", "src", "core", "contractV2", "workflowLockShape.ts"),
    "utf8"
  )
  assert.match(source, /import type \{ WorkflowPackageDocumentV2 \} from "\.\/packageShape"/)
  assert.match(source, /interface WorkflowPackageSchemaV2[\s\S]*document: WorkflowPackageDocumentV2[\s\S]*pointer: WorkflowPackagePointer[\s\S]*lock: WorkflowPackageLock/)
  assert.doesNotMatch(source, /interface WorkflowPackageDocumentV2/)
  assert.doesNotMatch(source, /validateWorkflowContractV2PackageShape/)
  assert.doesNotMatch(source, /parseWorkflowContractV2Yaml/)
})

test("pointer decoder returns detached deeply frozen evidence and checks the caller slot id", () => {
  const { decodeWorkflowPackagePointer } = pointerModule()
  const input = validPointerInput()
  const decoded = decodeWorkflowPackagePointer(input)
  assert.deepEqual(decoded, VALID.pointer)
  assert.notEqual(decoded, input.pointer)
  assertDeepFrozen(decoded)

  input.pointer.workflowId = "changed"
  input.pointer.generation = DIGEST("f")
  assert.deepEqual(decoded, VALID.pointer)
  assert.throws(
    () => decodeWorkflowPackagePointer({ ...validPointerInput(), workflowId: "other" }),
    /workflowId/
  )
})

test("pointer decoder rejects aliases, mismatches, hostile wrappers, accessors, and unknown fields without invoking behavior", () => {
  const { decodeWorkflowPackagePointer } = pointerModule()
  let getterCalls = 0
  const accessor = validPointerInput()
  Object.defineProperty(accessor.pointer, "workflowId", {
    enumerable: true,
    get() {
      getterCalls += 1
      return "minimal"
    }
  })
  assert.throws(() => decodeWorkflowPackagePointer(accessor), TypeError)
  assert.equal(getterCalls, 0)

  let trapCalls = 0
  const proxied = new Proxy(validPointerInput(), {
    ownKeys() {
      trapCalls += 1
      throw new Error("must not run")
    }
  })
  assert.throws(() => decodeWorkflowPackagePointer(proxied), TypeError)
  assert.equal(trapCalls, 0)

  assert.throws(() => decodeWorkflowPackagePointer({ ...validPointerInput(), extra: true }), TypeError)
  assert.throws(() => decodeWorkflowPackagePointer({ workflowId: "minimal", pointer: { ...VALID.pointer, extra: true } }), TypeError)
  assert.throws(() => decodeWorkflowPackagePointer({ workflowId: "minimal", pointer: { ...VALID.pointer, generation: DIGEST("2") } }), /digest/)
  assert.throws(() => decodeWorkflowPackagePointer({ workflowId: "SECRET-VALUE", pointer: VALID.pointer }), (error) => {
    assert.equal(error instanceof TypeError, true)
    assert.doesNotMatch(error.message, /SECRET-VALUE/)
    return true
  })
})

test("fixture invalid cases fail closed", async (t) => {
  const { decodeWorkflowPackagePointer } = pointerModule()
  const { decodeWorkflowPackageLock } = lockModule()
  for (const entry of INVALID_CASES) await t.test(entry.name, () => {
    if (entry.target === "pointer") {
      const input = validPointerInput()
      replaceAt(input.pointer, entry.path, entry.value)
      assert.throws(() => decodeWorkflowPackagePointer(input), TypeError)
    } else {
      const input = validLock()
      replaceAt(input, entry.path, entry.value)
      assert.throws(() => decodeWorkflowPackageLock(input), TypeError)
    }
  })
})
