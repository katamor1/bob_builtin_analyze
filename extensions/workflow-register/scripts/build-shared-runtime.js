"use strict"
const fs = require("node:fs")
const path = require("node:path")
const cp = require("node:child_process")
const extensionRoot = path.resolve(__dirname, "..")
const packageRoot = path.resolve(extensionRoot, "../../packages/processing-budget-runtime")

function buildExtension() {
  const { buildRuntime } = require(path.join(packageRoot, "scripts/build-runtime.js"))
  const { copyExtensionRuntime } = require(path.join(packageRoot, "scripts/copy-extension-runtime.js"))
  const compilerRoot = path.join(extensionRoot, "node_modules/typescript")
  if (JSON.parse(fs.readFileSync(path.join(compilerRoot, "package.json"), "utf8")).version !== "5.9.3") throw new Error("Extension TypeScript 5.9.3 required; run npm ci.")
  buildRuntime()
  const result = cp.spawnSync(process.execPath, [path.join(compilerRoot, "bin/tsc"), "-p", extensionRoot, "--newLine", "lf"], { cwd: extensionRoot, stdio: "inherit" })
  if (result.error || result.status !== 0) throw new Error("Extension compile failed.")
  return copyExtensionRuntime(extensionRoot)
}
if (require.main === module) {
  try {
    if (process.argv.length !== 2) throw new Error("Unexpected build arguments.")
    const receipt = buildExtension()
    console.log(JSON.stringify({ state: "passed", sourceInputDigest: receipt.sourceInputDigest, files: receipt.payload.length }))
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
module.exports = { buildExtension }
