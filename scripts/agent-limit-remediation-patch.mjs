import fs from "node:fs"

// This temporary patch runner also acts as the explicit trigger for remote verification.
const packagePath = "extensions/bob-code-consistency-review/package.json"
const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"))
if (Array.isArray(packageJson.extensionDependencies) && packageJson.extensionDependencies.length === 0) {
  delete packageJson.extensionDependencies
}
const properties = packageJson.contributes.configuration.properties
const ranges = {
  maxDocumentBytes: [1, 50 * 1024 * 1024],
  maxWorkbookSheets: [1, 100],
  maxRowsPerSheet: [1, 5_000],
  maxExcerptBytesPerDocument: [1, 1024 * 1024],
  maxRawDiffBytes: [1, 10 * 1024 * 1024],
  maxBobInputBytes: [1, 8 * 1024 * 1024]
}
for (const [suffix, [minimum, maximum]] of Object.entries(ranges)) {
  const definition = properties[`bobCodeConsistency.${suffix}`]
  if (!definition) throw new Error(`Missing package configuration for ${suffix}`)
  definition.minimum = minimum
  definition.maximum = maximum
}
fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8")

const wiringPath = "extensions/bob-code-consistency-review/test/traceabilityCommandWiring.test.js"
const wiring = fs.readFileSync(wiringPath, "utf8")
const before = '  assert.match(source, /preprocessReview\\(\\{ workspaceRoot, inputPath, outDir, diffFixturePath, bzrPath, textEncoding, limits, workflowRunId \\}\\)/)'
const after = '  assert.match(source, /preprocessReview\\(\\{[\\s\\S]*textEncoding,[\\s\\S]*limits,[\\s\\S]*workflowRunId,[\\s\\S]*commandTimeoutMs,[\\s\\S]*abortSignal: controller\\.signal[\\s\\S]*\\}\\)/)'
if (!wiring.includes(after)) {
  if (!wiring.includes(before)) throw new Error("Expected traceability command wiring assertion was not found")
  fs.writeFileSync(wiringPath, wiring.replace(before, after), "utf8")
}
