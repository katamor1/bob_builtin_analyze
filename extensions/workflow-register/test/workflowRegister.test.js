const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

const extensionRoot = path.resolve(__dirname, "..")
const repoRoot = path.resolve(extensionRoot, "..", "..")

test("package entry points at the compiled workflow implementation", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(extensionRoot, "package.json"), "utf8"))
  const tsconfig = JSON.parse(fs.readFileSync(path.join(extensionRoot, "tsconfig.json"), "utf8"))

  assert.equal(packageJson.main, "./out/extension.js")
  assert.deepEqual(tsconfig.include, ["src/**/*.ts"])
})

test("Bazaar workflow template sends collect-context and load-rules command results", () => {
  const workflowPath = path.join(
    repoRoot,
    "extensions",
    "bob-bazaar-review",
    "templates",
    ".bob",
    "workflows",
    "bazaar-project-rule-review",
    "WORKFLOW.md"
  )
  const workflow = fs.readFileSync(workflowPath, "utf8")

  assert.match(workflow, /^stepCompletion: manual$/m)
  assert.match(workflow, /^stepMessage: step$/m)
  assert.doesNotMatch(workflow, /```workflow-step/)
  assert.doesNotMatch(workflow, /^## Step:/m)
  assert.match(workflow, /^steps:$/m)
  assert.match(workflow, /id: review-input[\s\S]*?provider: bobBazaar\.openReviewGui[\s\S]*?sendResult: false[\s\S]*?completeOnSuccess: false/)
  assert.match(workflow, /id: collect-context[\s\S]*?provider: bobBazaar\.collectReviewContext[\s\S]*?sendResult: true[\s\S]*?required: true[\s\S]*?completeOnSuccess: true/)
  assert.match(workflow, /id: load-rules[\s\S]*?provider: bobBazaar\.loadReviewRules[\s\S]*?sendResult: true[\s\S]*?required: true[\s\S]*?completeOnSuccess: true/)
})

test("completeStep command can be called silently by companion extensions", () => {
  const source = fs.readFileSync(path.join(extensionRoot, "src", "extension.ts"), "utf8")

  assert.match(source, /interface StepCompletionOptions \{[\s\S]*silent\?: boolean[\s\S]*\}/)
  assert.match(source, /registerCommand\("workflowRegister\.completeStep", \(options\?: StepCompletionOptions\) => service\.completeCurrentStep\(options\)\)/)
  assert.match(source, /async completeCurrentStep\(options: StepCompletionOptions = \{\}\): Promise<string>/)
  assert.match(source, /if \(!options\.silent\) await vscode\.window\.showInformationMessage\(message\)/)
  assert.match(source, /return message/)
})

test("activation schedules delayed workflow reload retries after Bob finishes startup", () => {
  const source = fs.readFileSync(path.join(extensionRoot, "src", "extension.ts"), "utf8")

  assert.match(source, /const retryDelaysMs = \[3000, 10000\]/)
  assert.match(source, /setTimeout\(\(\) => service\.reload\(\{ showReport: false \}\)/)
})

test("package contributes standalone workflow launcher commands without a hard Bob dependency", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(extensionRoot, "package.json"), "utf8"))
  const commandIds = packageJson.contributes.commands.map((command) => command.command)
  const source = fs.readFileSync(path.join(extensionRoot, "src", "extension.ts"), "utf8")

  assert.equal(packageJson.extensionDependencies, undefined)
  assert.ok(packageJson.activationEvents.includes("onCommand:workflowRegister.runWorkflow"))
  assert.ok(packageJson.activationEvents.includes("onCommand:workflowRegister.inspectRuns"))
  assert.ok(packageJson.activationEvents.includes("onCommand:workflowRegister.resumeRun"))
  assert.ok(packageJson.activationEvents.includes("onCommand:workflowRegister.retryCurrentStep"))
  assert.ok(commandIds.includes("workflowRegister.runWorkflow"))
  assert.ok(commandIds.includes("workflowRegister.inspectRuns"))
  assert.ok(commandIds.includes("workflowRegister.resumeRun"))
  assert.ok(commandIds.includes("workflowRegister.retryCurrentStep"))
  assert.match(source, /new WorkflowRegisterService\(String\(context\.extension\.packageJSON\.version \?\? "unknown"\)\)/)
  assert.match(source, /new FileRunStateStore\(\{ workspaceRoot, engineVersion: this\.engineVersion \}\)/)
})

test("standalone workflow launcher wires an AgentProvider through API or configured command", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(extensionRoot, "package.json"), "utf8"))
  const source = fs.readFileSync(path.join(extensionRoot, "src", "extension.ts"), "utf8")

  assert.equal(packageJson.contributes.configuration.properties["workflowRegister.agentCommand"].type, "string")
  assert.match(source, /import \{ createCommandAgentProvider \} from "\.\/core\/agentProvider"/)
  assert.match(source, /registerAgentProvider: \(provider: AgentProvider\) => void/)
  assert.match(source, /registerAgentProvider: \(provider\) => service\.registerAgentProvider\(provider\)/)
  assert.match(source, /agentProvider: this\.agentProvider \?\? this\.createCommandAgentProvider\(\)/)
  assert.match(source, /createCommandAgentProvider\(\{[\s\S]*command: config\.get<string>\("agentCommand", ""\),[\s\S]*vscode\.commands\.executeCommand\(command, input\)/)
})

test("standalone workflow launcher uses the shared input resolver for conditional prompts", () => {
  const source = fs.readFileSync(path.join(extensionRoot, "src", "extension.ts"), "utf8")

  assert.match(source, /import \{ collectWorkflowInputsWithResolver \} from "\.\/core\/inputCollector"/)
  assert.match(source, /return collectWorkflowInputsWithResolver\(\{[\s\S]*inputs: workflow\.inputs,[\s\S]*provided,[\s\S]*prompt: \(key, definition, required\) => this\.promptForInput\(key, definition, required\)[\s\S]*\}\)/)
  assert.doesNotMatch(source, /for \(const \[key, definition\] of Object\.entries\(workflow\.inputs\)\)/)
})

test("Bob registration uses CoreWorkflowDefinition as the only parsed workflow source", () => {
  const source = fs.readFileSync(path.join(extensionRoot, "src", "extension.ts"), "utf8")

  assert.match(source, /parseWorkflowMarkdown\(\{ sourceId, filePath: relativePath, text \}\)/)
  assert.match(source, /adaptCoreWorkflowForBob\(/)
  assert.doesNotMatch(source, /loadCoreWorkspaceWorkflows/)
  assert.doesNotMatch(source, /parseYamlFrontMatter\(split\.frontMatter\)/)
})

test("runtime dependencies are not excluded from VSIX packaging", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(extensionRoot, "package.json"), "utf8"))
  const vscodeIgnore = fs.readFileSync(path.join(extensionRoot, ".vscodeignore"), "utf8")

  assert.equal(packageJson.scripts.package, "vsce package")
  assert.match(vscodeIgnore, /^node_modules\/\*\*$/m)
  for (const moduleName of [
    "ajv",
    "fast-deep-equal",
    "fast-uri",
    "json-schema-traverse",
    "require-from-string",
    "js-yaml",
    "argparse"
  ]) {
    assert.match(vscodeIgnore, new RegExp(`^!node_modules/${moduleName}/\\*\\*$`, "m"))
  }
})
