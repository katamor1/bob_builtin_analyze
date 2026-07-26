const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const COLLECTION = "extensions/workflow-register/test/fixtures/workflow-contract-v2/manifest-collection"
const PROVIDERS = "extensions/workflow-register/test/fixtures/workflow-contract-v2/manifest-provider-catalog.json"

test("committed manifest package fixture compiles to byte-identical evidence", async (t) => {
  const repositoryRoot = path.resolve(__dirname, "../../..")
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-contract-v2-manifest-fixture-"))
  t.after(() => fs.rmSync(outputRoot, { recursive: true, force: true }))
  const outputA = path.join(outputRoot, "a.json")
  const outputB = path.join(outputRoot, "b.json")
  const cli = require("../scripts/compile-workflow-contract-v2-packages.js")
  const args = [
    "--root", repositoryRoot,
    "--collection", COLLECTION,
    "--provider-catalog", PROVIDERS
  ]
  await cli.main([...args, "--manifest", outputA])
  await cli.main([...args, "--manifest", outputB])
  const bytes = fs.readFileSync(outputA)
  assert.deepEqual(fs.readFileSync(outputB), bytes)
  const manifest = JSON.parse(bytes.toString("utf8"))
  assert.equal(manifest.schemaVersion, "workflow-compiled-plan-manifest/v1")
  assert.equal(manifest.packages.length, 1)
  assert.equal(manifest.packages[0].collection, COLLECTION)
  assert.equal(manifest.packages[0].slot, "minimal")
  assert.equal(manifest.packages[0].generation, "sha256:f63effff0027607a3f0443e787c3055bf60394f5eb2a2fd256581db90d6528cc")
})
