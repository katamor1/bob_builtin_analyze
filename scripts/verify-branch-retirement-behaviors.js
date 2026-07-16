#!/usr/bin/env node
"use strict"

const { spawnSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")

const root = path.resolve(__dirname, "..")
const outputIndex = process.argv.indexOf("--json")
const outputPath = outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined
if (!outputPath) throw new Error("Usage: node scripts/verify-branch-retirement-behaviors.js --json <path>")

const checks = {
  "workflow-builder-skip-resume-readiness": false,
  "workflow-runtime-phase4": false,
  "workflow-automatic-pause": false,
  "workflow-run-retention": false,
  "evidence-scope-phase5": false,
  "bazaar-campaign-dashboard": false,
  "bazaar-project-rule-authoring": false
}

verifyExtension("workflow-register", [
  ["workflow-builder-skip-resume-readiness", /workflow(?:Builder)?SkipResumeReadiness.*\.test\.js$/],
  ["workflow-runtime-phase4", /workflowRun(?:Journal|StateMigration).*\.test\.js$/],
  ["workflow-automatic-pause", /workflowAutomaticPause.*\.test\.js$/],
  ["workflow-run-retention", /workflowRun(?:Retention|Cleanup|Storage).*\.test\.js$/]
])
verifyExtension("bob-code-consistency-review", [
  ["evidence-scope-phase5", /^(?:repositorySymbolIndexProducer|artifactLedger)\.test\.js$/]
])
verifyExtension("bob-bazaar-review", [
  ["bazaar-campaign-dashboard", /^campaignDashboard.*\.test\.js$/],
  ["bazaar-project-rule-authoring", /^ruleAuthoring.*\.test\.js$/]
])

const failed = Object.entries(checks).filter(([, value]) => value !== true).map(([name]) => name)
if (failed.length > 0) throw new Error(`Behavior verification did not complete: ${failed.join(", ")}`)
const target = path.resolve(root, outputPath)
fs.mkdirSync(path.dirname(target), { recursive: true })
const temporary = `${target}.tmp-${process.pid}`
fs.writeFileSync(temporary, `${JSON.stringify(checks, null, 2)}\n`, { encoding: "utf8", flag: "wx" })
fs.renameSync(temporary, target)
process.stdout.write(`${JSON.stringify(checks, null, 2)}\n`)

function verifyExtension(extension, groups) {
  const directory = path.join(root, "extensions", extension)
  run(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "compile"], directory)
  const testDirectory = path.join(directory, "test")
  const names = fs.readdirSync(testDirectory).filter((name) => name.endsWith(".test.js"))
  const selected = new Set()
  for (const [checkName, pattern] of groups) {
    const matches = names.filter((name) => pattern.test(name)).sort()
    if (matches.length === 0) throw new Error(`No focused tests matched ${checkName} in ${extension}.`)
    matches.forEach((name) => selected.add(path.join("test", name)))
    checks[checkName] = true
  }
  run(process.execPath, ["--test", ...selected], directory)
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", shell: false })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with exit ${result.status}.`)
}
