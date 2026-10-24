const assert = require("node:assert/strict")
const { spawnSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const { extensionRoot, readJson } = require("./helpers/sourceReader")
const { createStoredZip } = require("./helpers/storedZipFixture")

function assertLocalScript(packageJson, scriptName, expectedCommand) {
  const command = packageJson.scripts[scriptName]
  assert.equal(command, expectedCommand)
  assert.doesNotMatch(command, /\.\./, `${scriptName} must stay within the extension root`)
  const scriptPath = command.match(/node\s+(scripts\/[^\s]+)/)?.[1]
  if (scriptPath) assert.ok(fs.existsSync(path.join(extensionRoot, scriptPath)), `${scriptName} target must exist locally`)
}

function runSyntheticVsixPolicy(runtimeMetadata) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "bob-vsix-policy-"))
  const packageJson = {
    name: "policy-fixture",
    version: "1.0.0",
    main: "./out/extension.js"
  }
  const lock = {
    lockfileVersion: 3,
    packages: {
      "": { dependencies: { "missing-runtime": "^1.0.0" } },
      "node_modules/missing-runtime": { version: "1.0.0", ...runtimeMetadata }
    }
  }
  try {
    fs.writeFileSync(path.join(directory, "package.json"), JSON.stringify(packageJson))
    fs.writeFileSync(path.join(directory, "package-lock.json"), JSON.stringify(lock))
    fs.writeFileSync(
      path.join(directory, "policy-fixture-1.0.0.vsix"),
      createStoredZip([
        { name: "extension/package.json" },
        { name: "extension/out/extension.js" }
      ])
    )
    return spawnSync(
      process.execPath,
      [path.join(extensionRoot, "scripts", "check-vsix-policy.js"), "--max-bytes", "100000"],
      { cwd: directory, encoding: "utf8" }
    )
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
}

test("bob-bazaar-review declares the exact rule authoring production dependencies", () => {
  const packageJson = readJson("package.json")
  assert.deepEqual(packageJson.dependencies, {
    ajv: "^8.17.1",
    cheerio: "^1.0.0",
    fflate: "^0.8.3",
    "js-yaml": "^4.3.0",
    mammoth: "^1.8.0",
    "read-excel-file": "^9.2.0"
  })
})

test("bob-bazaar-review dependency policy requires a committed lockfile and local release scripts", () => {
  const packageJson = readJson("package.json")
  const lockPath = path.join(extensionRoot, "package-lock.json")
  assert.ok(fs.existsSync(lockPath), "package-lock.json must be committed for reproducible VSIX builds")

  assert.equal(packageJson.scripts["dependency:policy"], "node --test test/dependencyPolicy.test.js")
  assertLocalScript(packageJson, "compile", "node scripts/build-shared-runtime.js")
  assertLocalScript(packageJson, "architecture:policy", "node scripts/check-import-cycles.js src")
  assertLocalScript(packageJson, "source:policy", "node scripts/check-export-star-policy.js src")
  assertLocalScript(packageJson, "unused:policy", "node scripts/run-unused-policy.js")
  assertLocalScript(packageJson, "unused:report", "node scripts/run-unused-checks.js")
  assertLocalScript(packageJson, "artifact:policy", "node scripts/check-artifact-size-policy.js --max-bytes 12000 templates")
  assert.equal(packageJson.scripts["audit:prod"], "npm audit --omit=dev --audit-level=high")
  assert.equal(packageJson.scripts["vscode:prepublish"], "npm run compile")
  assertLocalScript(packageJson, "package:policy", "node scripts/check-vsix-policy.js --max-bytes 12000000")
  assert.equal(packageJson.scripts["package:smoke"], "node --test test/package/ruleAuthoringPackageSmoke.test.js")
  assert.ok(
    fs.existsSync(path.join(extensionRoot, "test", "package", "ruleAuthoringPackageSmoke.test.js")),
    "package smoke must live outside the default top-level test glob"
  )
  assert.ok(
    !fs.existsSync(path.join(extensionRoot, "test", "ruleAuthoringPackageSmoke.test.js")),
    "package smoke must not make npm test depend on a prebuilt ignored VSIX"
  )
  assertLocalScript(packageJson, "package:metrics", "node scripts/report-vsix-metrics.js .")

  for (const [scriptName, command] of Object.entries(packageJson.scripts)) {
    assert.doesNotMatch(command, /\.\.\//, `${scriptName} must not reference parent folders`)
  }

  assert.equal(packageJson.devDependencies.knip, "^5.0.0")
  assert.equal(packageJson.devDependencies.depcheck, "^1.4.7")
  assert.equal(packageJson.devDependencies["ts-prune"], "^0.10.3")

  const yamlRuntimeSource = fs.readFileSync(path.join(extensionRoot, "src", "records", "reviewRecordYaml.ts"), "utf8")
  const proposalRuntimeSource = fs.readFileSync(
    path.join(extensionRoot, "src", "ruleAuthoring", "ruleProposalSchema.ts"),
    "utf8"
  )
  const docxRuntimeSource = fs.readFileSync(
    path.join(extensionRoot, "src", "ruleAuthoring", "extraction", "docxExtractor.ts"),
    "utf8"
  )
  const xlsxRuntimeSource = fs.readFileSync(
    path.join(extensionRoot, "src", "ruleAuthoring", "extraction", "xlsxExtractor.ts"),
    "utf8"
  )
  const ooxmlArchiveRuntimeSource = fs.readFileSync(
    path.join(extensionRoot, "src", "ruleAuthoring", "extraction", "ooxmlArchive.ts"),
    "utf8"
  )
  assert.match(yamlRuntimeSource, /from "js-yaml"/, "review record runtime must keep the js-yaml import")
  assert.match(proposalRuntimeSource, /require\("ajv"\)/, "proposal validation must keep the lazy Ajv load")
  assert.match(docxRuntimeSource, /import\("cheerio"\)/, "DOCX extraction must keep the lazy Cheerio load")
  assert.match(docxRuntimeSource, /import\("mammoth"\)/, "DOCX extraction must keep the lazy Mammoth load")
  assert.match(
    xlsxRuntimeSource,
    /import\("read-excel-file\/node"\)/,
    "XLSX extraction must keep the lazy read-excel-file load"
  )
  assert.doesNotMatch(
    xlsxRuntimeSource,
    /import\("fflate"\)/,
    "the XLSX parser adapter must not own the extension-direct fflate load"
  )
  assert.match(
    ooxmlArchiveRuntimeSource,
    /return\s+import\("fflate"\)/,
    "OOXML missing-both XLSX compatibility must keep the lazy extension-direct fflate load"
  )
  assert.deepEqual(
    packageJson.knip?.ignoreDependencies,
    ["ajv", "cheerio", "fflate", "js-yaml", "mammoth", "read-excel-file"],
    "Knip exceptions must be an exact reviewed set whose runtime loads are verified above and by depcheck"
  )

  const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"))
  const rootPackage = lock.packages?.[""]
  assert.deepEqual(Object.keys(rootPackage?.dependencies ?? {}).sort(), Object.keys(packageJson.dependencies ?? {}).sort())
  assert.equal(lock.packages?.["node_modules/fflate"]?.version, "0.8.3")
  assert.equal(lock.packages?.["node_modules/read-excel-file"]?.version, "9.3.1")
  assert.equal(
    lock.packages?.["node_modules/read-excel-file"]?.dependencies?.fflate,
    "^0.8.3",
    "parser-transitive fflate loading must stay distinct from the extension-direct lazy import"
  )
  assert.equal(packageJson.scripts.package, "vsce package", "runtime dependencies must be collected by vsce")
})

test("bob-bazaar-review VSIX ignore policy keeps direct and transitive runtime code", () => {
  const vscodeignore = fs.readFileSync(path.join(extensionRoot, ".vscodeignore"), "utf8").split(/\r?\n/)

  assert.ok(vscodeignore.includes("out/**/*.map"), "compiled source maps must be excluded from the VSIX")
  assert.ok(vscodeignore.includes("docs/**"), "development docs must be excluded from the VSIX")
  assert.ok(vscodeignore.includes(".vscode-test.json"), "generated VS Code test config must be excluded from the VSIX")
  assert.ok(!vscodeignore.includes("node_modules/**"), "runtime dependency trees must not be excluded wholesale")
  assert.ok(
    !vscodeignore.some((line) => line.startsWith("!node_modules/")),
    "runtime inclusion must not rely on an incomplete direct dependency allowlist"
  )

  for (const pattern of [
    "node_modules/**/test/**",
    "node_modules/**/tests/**",
    "node_modules/**/examples/**",
    "node_modules/**/*.d.ts",
    "node_modules/**/*.map",
    "node_modules/**/README*"
  ]) {
    assert.ok(vscodeignore.includes(pattern), `development-only dependency content must be excluded: ${pattern}`)
  }
})

test("bob-bazaar-review VSIX policy rejects production lock entries missing from the install", () => {
  const result = runSyntheticVsixPolicy({})
  assert.notEqual(result.status, 0, "a missing production package must fail package verification")
  assert.match(`${result.stdout}\n${result.stderr}`, /missing installed production dependency.*missing-runtime/i)
})

test("bob-bazaar-review VSIX policy allows an incompatible platform-optional lock entry to be absent", () => {
  const otherPlatform = ["darwin", "linux", "win32"].find((platform) => platform !== process.platform)
  assert.ok(otherPlatform)
  const result = runSyntheticVsixPolicy({ optional: true, os: [otherPlatform] })
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
})

test("bob-bazaar-review README documents generated artifacts, package budget, dependencies, CLI, and trust boundary", () => {
  const packageJson = readJson("package.json")
  const readme = fs.readFileSync(path.join(extensionRoot, "README.md"), "utf8")
  const packageBudget = packageJson.scripts["package:policy"].match(/--max-bytes\s+(\d+)/)?.[1]

  for (const phrase of [
    "生成物",
    ".bob/mcp.json",
    ".bob/review",
    "review-result",
    "VSIX サイズ",
    packageBudget,
    "暗黙依存",
    "IBM.bob-code",
    "workflow-register",
    "必要 CLI",
    "Node.js",
    "npm ci",
    "bzr --no-aliases",
    "npm run dependency:policy",
    "npm run architecture:policy",
    "npm run unused:policy",
    "npm run unused:report",
    "npm run artifact:policy",
    "npm run audit:prod",
    "npm run package:policy",
    "npm run package:smoke",
    "npm run package:metrics",
    "Trusted Workspace"
  ]) {
    assert.ok(readme.includes(phrase), `README must document: ${phrase}`)
  }

  for (const dependencyName of Object.keys(packageJson.dependencies ?? {})) {
    assert.ok(readme.includes(`\`${dependencyName}\``), `README must document runtime dependency: ${dependencyName}`)
  }
})
