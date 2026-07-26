const assert = require("node:assert/strict")
const fs = require("node:fs")
const fsp = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

test("non-Linux hosts fail closed before artifact filesystem mutation", async (t) => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform")
  const modulePath = require.resolve("../out/core/contractV2/attemptArtifactWorkspace.js")
  const runRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "workflow-artifact-platform-"))
  t.after(async () => {
    if (originalPlatform !== undefined) Object.defineProperty(process, "platform", originalPlatform)
    delete require.cache[modulePath]
    await fsp.rm(runRoot, { recursive: true, force: true })
  })

  Object.defineProperty(process, "platform", {
    configurable: true,
    enumerable: true,
    value: "win32",
    writable: false
  })
  delete require.cache[modulePath]
  const subject = require(modulePath)

  await assert.rejects(
    () => subject.allocateAttemptArtifactWorkspace(runRoot, "attempt-win"),
    /secure artifact filesystem operations.*unsupported|fail(?:ing)? closed/i
  )
  assert.equal(fs.existsSync(path.join(runRoot, "attempts")), false)
})

test("the public artifact workspace module is the only importer-facing surface", () => {
  const sourceRoot = path.join(__dirname, "..", "src", "core", "contractV2")
  const wrapper = fs.readFileSync(path.join(sourceRoot, "attemptArtifactWorkspace.ts"), "utf8")
  assert.match(wrapper, /runtimePlatform !== "linux"/)
  assert.match(wrapper, /attemptArtifactWorkspaceLinux/)

  const importers = fs.readdirSync(sourceRoot)
    .filter((name) => name.endsWith(".ts"))
    .filter((name) => name !== "attemptArtifactWorkspace.ts" && name !== "attemptArtifactWorkspaceLinux.ts")
    .filter((name) => fs.readFileSync(path.join(sourceRoot, name), "utf8").includes("attemptArtifactWorkspaceLinux"))
  assert.deepEqual(importers, [])
})
