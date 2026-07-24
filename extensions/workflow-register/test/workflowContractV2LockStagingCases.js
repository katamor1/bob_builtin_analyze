const assert = require("node:assert/strict")
const { test } = require("node:test")
const {
  generationInput,
  rawPackageFromFiles,
  sourceFiles,
  subject
} = require("./workflowContractV2LockTestSupport")

test("owned staging packages can generate and verify the same deterministic lock before publication", () => {
  const lockModule = subject()
  const placeholderFiles = sourceFiles()
  const publishedInput = generationInput({ files: placeholderFiles })
  const publishedLock = lockModule.generateWorkflowPackageLock(publishedInput)
  const lockBytes = lockModule.encodeWorkflowPackageLock(publishedLock)
  const files = sourceFiles(lockBytes)
  const publishedRaw = rawPackageFromFiles(files)
  const stagingRaw = rawPackageFromFiles(files, {
    publication: "staging",
    generation: ".staging-authoring-abc123"
  })

  const published = lockModule.generateWorkflowPackageLock(generationInput({
    files,
    rawPackage: publishedRaw
  }))
  const stagingInput = generationInput({ files, rawPackage: stagingRaw })
  const staging = lockModule.generateWorkflowPackageLock(stagingInput)

  assert.deepEqual(staging, published)
  const verified = lockModule.verifyWorkflowPackageLock(stagingInput)
  assert.equal(verified.ok, true)
  assert.deepEqual(verified.lock, staging)
})

test("staging generation names remain closed and published generations still require digest identity", () => {
  const lockModule = subject()
  const files = sourceFiles()
  for (const generation of ["staging", ".staging-", ".staging-../escape", "sha256:not-a-digest"]) {
    const rawPackage = rawPackageFromFiles(files, { publication: "staging", generation })
    assert.throws(
      () => lockModule.generateWorkflowPackageLock(generationInput({ files, rawPackage })),
      /generation|staging|evidence|inconsistent/i
    )
  }

  const published = rawPackageFromFiles(files, {
    generation: `sha256:${"0".repeat(64)}`
  })
  assert.throws(
    () => lockModule.generateWorkflowPackageLock(generationInput({ files, rawPackage: published })),
    /generation|digest|evidence|inconsistent/i
  )
})
