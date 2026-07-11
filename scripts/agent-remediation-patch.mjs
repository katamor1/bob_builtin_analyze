import fs from "node:fs"

function replaceIdempotent(filePath, before, after) {
  const source = fs.readFileSync(filePath, "utf8")
  if (source.includes(after)) return
  if (!source.includes(before)) {
    throw new Error(`Expected remediation pattern was not found in ${filePath}`)
  }
  fs.writeFileSync(filePath, source.replace(before, after), "utf8")
}

replaceIdempotent(
  "extensions/bob-code-consistency-review/src/webview/traceabilityPrepWebviewAssets.ts",
  '  return JSON.stringify(model).replace(/</g, "\\u003c")',
  '  return JSON.stringify(model).replace(/</g, "\\\\u003c")'
)
