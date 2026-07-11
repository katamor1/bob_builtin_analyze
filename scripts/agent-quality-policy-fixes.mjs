import fs from "node:fs"

// This temporary deterministic patch is kept idempotent so remote verification can re-run safely.
const operationHubPath = "extensions/workflow-register/src/gui/operationHubProvider.ts"
let operationHub = fs.readFileSync(operationHubPath, "utf8")
operationHub = replaceOnce(
  operationHub,
  'import type { WorkflowRegisterApi } from "../extension"\n',
  'import type { CoreWorkflowDefinition } from "../core/model"\n',
  "Operation Hub API import"
)
operationHub = replaceOnce(
  operationHub,
  `interface OperationHubProviderOptions {\n  api: WorkflowRegisterApi\n  extensionUri: vscode.Uri\n}\n`,
  `interface OperationHubWorkflowApi {\n  listWorkflows: () => CoreWorkflowDefinition[]\n}\n\ninterface OperationHubProviderOptions {\n  api: OperationHubWorkflowApi\n  extensionUri: vscode.Uri\n}\n`,
  "Operation Hub API interface"
)
fs.writeFileSync(operationHubPath, operationHub, "utf8")

const bazaarPackagePath = "extensions/bob-bazaar-review/package.json"
const bazaarPackage = JSON.parse(fs.readFileSync(bazaarPackagePath, "utf8"))
bazaarPackage.knip = {
  entry: ["src/extension.ts", "src/mcp/server.ts"],
  project: ["src/**/*.ts"]
}
fs.writeFileSync(bazaarPackagePath, `${JSON.stringify(bazaarPackage, null, 2)}\n`, "utf8")

function replaceOnce(text, before, after, label) {
  if (text.includes(after)) return text
  const first = text.indexOf(before)
  if (first < 0) throw new Error(`Expected ${label} source was not found`)
  if (text.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Expected exactly one ${label} source occurrence`)
  }
  return text.replace(before, after)
}
