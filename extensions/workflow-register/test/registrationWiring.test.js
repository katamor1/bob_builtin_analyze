const assert = require("node:assert/strict")
const { test } = require("node:test")
const { readSourceSet } = require("./helpers/sourceReader")

function registrationSource() {
  return readSourceSet([
    "extension.ts",
    "workflowRegisterService.ts",
    "workflowRegistrationService.ts",
    "bobApi.ts",
    "core/contractV2/bobProfile.ts",
    "reports.ts"
  ])
}

test("Bob registration deactivates the previous audited source before replacing workflows", () => {
  const source = registrationSource()

  assert.match(source, /export type BobSourceLike = BoundBobSource/)
  assert.match(source, /export interface BoundBobSource \{[\s\S]*readonly deactivate: \(\) => unknown[\s\S]*readonly log: \(message: string\) => unknown[\s\S]*readonly registerWorkflow: \(workflow: unknown\) => unknown[\s\S]*\}/)
  assert.doesNotMatch(source, /deactivate\?: \(\) => unknown/)
  assert.match(source, /private registeredSource\?: BobSourceLike/)
  assert.match(source, /dispose\(\): void \{[\s\S]*void deactivateRegisteredSource\(source\)[\s\S]*\}/)
  assert.match(
    source,
    new RegExp([
      "if \\(loaded\\.workflows\\.length === 0\\) \\{",
      "[\\s\\S]*await deactivateRegisteredSource\\(input\\.previousSource, lines\\)",
      "[\\s\\S]*\"setContext\", \"bob-code\\.hasWorkflows\", false",
      "[\\s\\S]*\\}"
    ].join(""))
  )
  assert.match(
    source,
    /await deactivateRegisteredSource\(input\.previousSource, lines\)[\s\S]*const sourceResult = await runAttempt\(\s*"registerSource\(sourceId, sourceName\)"/
  )
  assert.match(source, /if \(update\.sourceChanged\) this\.registeredSource = update\.registeredSource/)
})

test("Bob registration binds the exact audited profile before source registration", () => {
  const source = registrationSource()

  assert.match(source, /const BOB_EXTENSION_ID = "IBM\.bob-code"/)
  assert.match(source, /"sha256:aea18a3b1d19f2a1231c7d5e6ac7a416f0ace09ffa823fe4ceb0f43733492b73"/)
  assert.match(source, /extensionVersion !== "2\.0\.1"/)
  assert.match(source, /const api = bindBobCapabilities\(\{/)
  assert.match(source, /extensionId: ext\.id/)
  assert.match(source, /extensionVersion: packageJson\?\.version/)
  assert.match(source, /expectedProfileDigest: BOB_2_0_1_PROFILE_DIGEST/)
  assert.match(source, /requiredCapabilities: BOB_2_0_1_CAPABILITIES/)
  assert.match(source, /liveExport: exportsValue/)
  assert.doesNotMatch(source, /as BobWorkflowApi/)
  assert.doesNotMatch(source, /asSource\(/)
})

test("Bob registration treats a false registerWorkflow return as failed", () => {
  const source = registrationSource()

  assert.match(source, /return \{ label, ok: value !== false, message: describeReturn\(value\), value \}/)
  assert.match(source, /const attempt = await runAttempt\([\s\S]*`source\.registerWorkflow\(\$\{workflow\.id\}\)`/)
  assert.match(source, /if \(attempt\.ok\) \{[\s\S]*registeredIds\.add\(workflow\.id\)[\s\S]*registeredCount \+= 1[\s\S]*\}/)
})

test("workflow reload re-registers current workflows and clears Bob context when none remain", () => {
  const source = registrationSource()

  assert.doesNotMatch(source, /this\.registeredIds\.has\(workflow\.id\)/)
  assert.doesNotMatch(source, /already registered in this extension host session/)
  assert.match(source, /if \(loaded\.workflows\.length === 0\) \{[\s\S]*"setContext", "bob-code\.hasWorkflows", false[\s\S]*\}/)
  assert.match(source, /this\.registeredIds\.clear\(\)[\s\S]*for \(const id of update\.registeredIds \?\? \[\]\) this\.registeredIds\.add\(id\)/)
  assert.match(source, /"setContext", "bob-code\.hasWorkflows", registeredIds\.size > 0/)
})

test("workflow service removes manually disposed action providers from its lifecycle store", () => {
  const source = registrationSource()

  assert.match(source, /import \{ ActionProviderRegistrationStore \} from "\.\/core\/actionProviderRegistrationStore"/)
  assert.match(source, /private readonly actionProviderRegistrations = new ActionProviderRegistrationStore\(\)/)
  assert.match(source, /return this\.actionProviderRegistrations\.track\(this\.actionRegistry\.register\(provider\)\)/)
  assert.match(source, /this\.actionProviderRegistrations\.dispose\(\)/)
  assert.doesNotMatch(source, /actionProviderRegistrations: ActionProviderRegistration\[\]/)
  assert.doesNotMatch(source, /actionProviderRegistrations\.push\(/)
})

test("workflow service closes the manual step panel during deactivation", () => {
  const source = registrationSource()

  assert.match(source, /dispose\(\): void \{[\s\S]*this\.watcher\.dispose\(\)[\s\S]*this\.manualStepPanel\.dispose\(\)/)
})
