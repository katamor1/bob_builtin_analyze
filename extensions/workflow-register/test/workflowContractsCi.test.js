"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")
const yaml = require("js-yaml")

const repositoryRoot = path.resolve(__dirname, "..", "..", "..")
const workflowPath = path.join(repositoryRoot, ".github", "workflows", "workflow-contracts.yml")
const owners = ["workflow-register", "bob-bazaar-review", "bob-code-consistency-review"]

function ciSource() { return fs.readFileSync(workflowPath, "utf8") }

function assertCiContract(source) {
  const document = yaml.load(source)
  const steps = document?.jobs?.validate?.steps
  assert.ok(Array.isArray(steps), "validate steps")
  const runs = steps.filter((step) => typeof step.run === "string").map((step) => step.run)
  const allRuns = runs.join("\n")
  const runLines = runs.flatMap((run) => run.split("\n").map((line) => line.trim()).filter(Boolean))
  for (const owner of owners) {
    for (const command of ["compile", "package", "package:policy"]) {
      const exact = `npm --prefix extensions/${owner} run ${command} --silent`
      assert.equal(runLines.filter((line) => line === exact).length, 1, `${owner} ${command}`)
    }
  }
  const generate = runs.find((run) => run.includes("run report:generate"))
  const validate = runs.find((run) => run.includes("run report:validate"))
  assert.ok(generate, "report generation")
  assert.ok(validate, "authoritative report validation")
  for (const owner of ["local.workflow-register", "local.bob-bazaar-review", "local.bob-code-consistency-review"]) {
    assert.match(generate, new RegExp(`--archive\\s+${owner.replaceAll(".", "\\.") }=`), `generate ${owner}`)
    assert.match(validate, new RegExp(`--archive\\s+${owner.replaceAll(".", "\\.") }=`), `validate ${owner}`)
  }
  assert.match(generate, /--expected-commit\s+"?\$GITHUB_SHA"?/)
  assert.match(validate, /--expected-commit\s+"?\$GITHUB_SHA"?/)
  assert.match(allRuns, /test "\$\(git rev-parse HEAD\)" = "\$GITHUB_SHA"/)
  const upload = steps.find((step) => String(step.uses).startsWith("actions/upload-artifact@"))
  assert.equal(upload?.with?.["retention-days"], 90)
  assert.match(String(upload?.with?.path), /workflow-contract-report\.json/)
  assert.equal(source.includes("continue-on-error: true"), false)
  assert.doesNotMatch(source, /\.(?:skip|todo|only)\s*\(|--test-name-pattern/i)
  assert.doesNotMatch(source, /(?:inventory|workflows?|claims?|exclusions?)\.length\s*(?:!==?|===?|[<>]=?)\s*\d+|(?:wc\s+-l|grep\s+-c)[^\n]*(?:-eq|==|!=)\s*\d+/i)
}

test("CI structurally enforces all owner packages and authoritative three-archive report replay", () => {
  assertCiContract(ciSource())
})

test("CI contract test detects deletion of every exact build, package, and policy command", () => {
  const source = ciSource()
  for (const owner of owners) {
    for (const command of ["compile", "package", "package:policy"]) {
      const exact = `npm --prefix extensions/${owner} run ${command} --silent`
      assert.ok(source.includes(exact), `${owner} ${command} fixture`)
      assert.throws(() => assertCiContract(source.replace(exact, `${exact} --injected-removed`)), new RegExp(`${owner} ${command.replace(":", "\\:")}`))
    }
  }
})

test("CI contract test detects fixed workflow-count assertions in JavaScript and shell", () => {
  const source = ciSource()
  for (const injected of [
    "node -e 'if (inventory.length !== 6) process.exit(1)'",
    "test \"$(grep -c WORKFLOW.md inventory.txt)\" -eq 27"
  ]) {
    const step = `      - name: Injected fixed count\n        run: ${injected}\n\n`
    assert.throws(() => assertCiContract(source.replace("      - name: Upload workflow contract evidence", `${step}      - name: Upload workflow contract evidence`)), /length|fixed|match/i)
  }
})

test("workflow-register exposes report generation and validation package scripts", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"))
  assert.equal(typeof packageJson.scripts["report:generate"], "string")
  assert.equal(typeof packageJson.scripts["report:validate"], "string")
})
