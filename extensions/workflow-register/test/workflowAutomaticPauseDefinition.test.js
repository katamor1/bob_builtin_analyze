const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

const { parseWorkflowMarkdown } = require("../out/core/parser")
const { validateWorkflowText } = require("../out/core/workflowValidator")

function workflowText(runControl) {
  return `---
schemaVersion: workflow-register/v1
name: automatic-pause
 description: Automatic pause workflow.
runControl:
${runControl}
steps:
  - id: analyze
    title: Analyze
    type: agent
    prompt: Analyze.
---
# Automatic Pause
`
}

function validate(text) {
  return validateWorkflowText({
    sourceId: "workflow-register",
    filePath: "C:/repo/.bob/workflows/automatic-pause/WORKFLOW.md",
    text
  })
}

test("workflow parser normalizes deterministic automatic pause limits", () => {
  const text = workflowText(`  limits:
    maxRunMinutes: 45
    maxAgentStepsPerRun: 6
    pauseAtLocalTime: "18:00"
    timezone: Asia/Tokyo`)
  const parsed = parseWorkflowMarkdown({
    sourceId: "workflow-register",
    filePath: "C:/repo/.bob/workflows/automatic-pause/WORKFLOW.md",
    text
  })

  assert.equal(parsed.ok, true, parsed.diagnostics.join("\n"))
  assert.deepEqual(parsed.workflow.runControl, {
    limits: {
      maxRunMinutes: 45,
      maxAgentStepsPerRun: 6,
      pauseAtLocalTime: "18:00",
      timezone: "Asia/Tokyo"
    }
  })
})

test("workflow validation rejects invalid automatic pause limit values", () => {
  const cases = [
    {
      label: "non-positive run duration",
      limits: `  limits:\n    maxRunMinutes: 0`,
      expected: /maxRunMinutes must be greater than zero/
    },
    {
      label: "non-positive agent count",
      limits: `  limits:\n    maxAgentStepsPerRun: -1`,
      expected: /maxAgentStepsPerRun must be greater than zero/
    },
    {
      label: "malformed local time",
      limits: `  limits:\n    pauseAtLocalTime: "24:01"\n    timezone: Asia\/Tokyo`,
      expected: /pauseAtLocalTime must use HH:mm/
    },
    {
      label: "missing timezone",
      limits: `  limits:\n    pauseAtLocalTime: "18:00"`,
      expected: /timezone is required when pauseAtLocalTime is set/
    },
    {
      label: "unknown timezone",
      limits: `  limits:\n    pauseAtLocalTime: "18:00"\n    timezone: Mars\/Olympus`,
      expected: /timezone 'Mars\/Olympus' is not a valid IANA timezone/
    }
  ]

  for (const item of cases) {
    const result = validate(workflowText(item.limits))
    assert.equal(result.ok, false, `${item.label}: ${result.diagnostics.map((diagnostic) => diagnostic.message).join("\n")}`)
    assert.match(result.diagnostics.map((diagnostic) => diagnostic.message).join("\n"), item.expected, item.label)
  }
})

test("public workflow schema exposes the same automatic pause contract", () => {
  const schema = JSON.parse(fs.readFileSync(
    path.join(__dirname, "..", "schema", "workflow-register.v1.schema.json"),
    "utf8"
  ))
  const limits = schema.properties.runControl.properties.limits

  assert.equal(limits.additionalProperties, false)
  assert.equal(limits.properties.maxRunMinutes.exclusiveMinimum, 0)
  assert.equal(limits.properties.maxAgentStepsPerRun.exclusiveMinimum, 0)
  assert.equal(limits.properties.pauseAtLocalTime.pattern, "^(?:[01]\\d|2[0-3]):[0-5]\\d$")
  assert.equal(limits.properties.timezone.type, "string")
})
