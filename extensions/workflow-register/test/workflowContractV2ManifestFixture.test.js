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
  t.after(() => { assert.ok(path.resolve(outputRoot).startsWith(path.resolve(os.tmpdir()) + path.sep)); assert.equal(fs.lstatSync(outputRoot).isSymbolicLink(), false); fs.rmSync(outputRoot, { recursive: true, force: true }) })
  const outputA = path.join(outputRoot, "a.json")
  const outputB = path.join(outputRoot, "b.json")
  const cli = require("../scripts/compile-workflow-contract-v2-packages.js")
  const args = [
    "--root", repositoryRoot,
    "--collection", COLLECTION,
    "--provider-catalog", PROVIDERS
  ]
  assert.equal(fs.existsSync(path.join(repositoryRoot, COLLECTION, "minimal/current.json")), true, "P7 committed fixture has not been installed");
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
  const crypto = require("node:crypto")
  const hash = (value) => crypto.createHash("sha256").update(value).digest("hex")
  const generation = "sha256-f63effff0027607a3f0443e787c3055bf60394f5eb2a2fd256581db90d6528cc"
  const inputs = [PROVIDERS, `${COLLECTION}/minimal/current.json`, `${COLLECTION}/minimal/versions/${generation}/workflow.lock.json`, `${COLLECTION}/minimal/versions/${generation}/workflow.yaml`].sort()
  const inputHash = crypto.createHash("sha256")
  for (const file of inputs) { inputHash.update(file, "utf8"); inputHash.update(Buffer.from([0])); inputHash.update(fs.readFileSync(path.join(repositoryRoot, ...file.split("/")))) }
  const actualHeadSha = require("node:child_process").execFileSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8", windowsHide: true }).trim()
  t.diagnostic(JSON.stringify({ event: "wf2_p7_manifest_fixture", actualHeadSha, fixtureInputSha256: inputHash.digest("hex"), manifestSha256: hash(bytes), manifestBase64: bytes.toString("base64") }))
})
