const assert = require("node:assert/strict")
const { test } = require("node:test")
const {
  canonicalText,
  digestBytes,
  generationInput,
  sourceFiles,
  subject
} = require("./workflowContractV2LockTestSupport")

test("raw schema file evidence and provider canonical schema identity remain independent", () => {
  const lockModule = subject()
  const files = sourceFiles()
  const schemaPath = "schemas/request.json"
  const schema = JSON.parse(Buffer.from(files[schemaPath]).toString("utf8"))
  const canonicalBytes = Buffer.from(canonicalText(schema), "utf8")
  const formattedBytes = Buffer.from(`${JSON.stringify(schema, null, 2)}\n`, "utf8")
  files[schemaPath] = formattedBytes

  const input = generationInput({ files })
  input.providers[0].inputSchema = {
    id: schemaPath,
    bytes: canonicalBytes.byteLength,
    digest: digestBytes(canonicalBytes)
  }
  const lock = lockModule.generateWorkflowPackageLock(input)
  const rawSchema = lock.schemas.find((entry) => entry.path === schemaPath)

  assert.equal(rawSchema.bytes, formattedBytes.byteLength)
  assert.equal(rawSchema.digest, digestBytes(formattedBytes))
  assert.equal(lock.providers[0].inputSchema.bytes, canonicalBytes.byteLength)
  assert.equal(lock.providers[0].inputSchema.digest, digestBytes(canonicalBytes))
  assert.notEqual(rawSchema.digest, lock.providers[0].inputSchema.digest)
})
