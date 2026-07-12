const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

const { normalizeAutomaticPauseSettings } = require("../out/core/automaticPauseSettings")

test("workspace automatic pause settings normalize valid limits", () => {
  assert.deepEqual(normalizeAutomaticPauseSettings({
    maxRunMinutes: 60,
    maxAgentStepsPerRun: 8,
    pauseAtLocalTime: "18:30",
    timezone: "Asia/Tokyo"
  }), {
    limits: {
      maxRunMinutes: 60,
      maxAgentStepsPerRun: 8,
      pauseAtLocalTime: "18:30",
      timezone: "Asia/Tokyo"
    },
    diagnostics: []
  })
})

test("zero and empty workspace settings disable automatic limits", () => {
  assert.deepEqual(normalizeAutomaticPauseSettings({
    maxRunMinutes: 0,
    maxAgentStepsPerRun: 0,
    pauseAtLocalTime: "",
    timezone: "Asia/Tokyo"
  }), { limits: undefined, diagnostics: [] })
})

test("invalid workspace fields are disabled independently with diagnostics", () => {
  const result = normalizeAutomaticPauseSettings({
    maxRunMinutes: -1,
    maxAgentStepsPerRun: 2.5,
    pauseAtLocalTime: "25:00",
    timezone: "Mars/Olympus"
  })
  assert.equal(result.limits, undefined)
  assert.deepEqual(result.diagnostics, [
    "workflowRegister.runControl.maxRunMinutes must be zero or greater than zero.",
    "workflowRegister.runControl.maxAgentStepsPerRun must be a non-negative integer.",
    "workflowRegister.runControl.pauseAtLocalTime must use HH:mm in 24-hour time."
  ])
})

test("invalid timezone disables only the local-time cutoff", () => {
  const result = normalizeAutomaticPauseSettings({
    maxRunMinutes: 30,
    pauseAtLocalTime: "18:00",
    timezone: "Mars/Olympus"
  })
  assert.deepEqual(result.limits, { maxRunMinutes: 30 })
  assert.deepEqual(result.diagnostics, [
    "workflowRegister.runControl.timezone 'Mars/Olympus' is not a valid IANA timezone."
  ])
})

test("package contributions expose automatic pause settings with disabled defaults", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"))
  const properties = manifest.contributes.configuration.properties

  assert.deepEqual(properties["workflowRegister.runControl.maxRunMinutes"], {
    type: "number",
    default: 0,
    minimum: 0,
    description: "次の安全な checkpoint で run を自動停止するまでの最大実行時間（分）。0 は無効。"
  })
  assert.deepEqual(properties["workflowRegister.runControl.maxAgentStepsPerRun"], {
    type: "integer",
    default: 0,
    minimum: 0,
    description: "1 run で開始できる agent step 呼び出し回数の上限。0 は無効。"
  })
  assert.equal(properties["workflowRegister.runControl.pauseAtLocalTime"].default, "")
  assert.equal(properties["workflowRegister.runControl.timezone"].default, "Asia/Tokyo")
})
