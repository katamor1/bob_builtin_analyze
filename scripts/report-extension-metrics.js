#!/usr/bin/env node

const fs = require("node:fs")
const path = require("node:path")

const DEFAULT_EXTENSIONS = [
  "extensions/workflow-register",
  "extensions/bob-bazaar-review",
  "extensions/bob-code-consistency-review"
]

function parseArgs(argv) {
  let output
  const targets = []
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === "--output") {
      output = argv[index + 1]
      if (!output) throw new Error("Missing --output path")
      index += 1
    } else {
      targets.push(value)
    }
  }
  return { output, targets: targets.length > 0 ? targets : DEFAULT_EXTENSIONS }
}

function collectFiles(root, dirName) {
  const dirPath = path.join(root, dirName)
  if (!fs.existsSync(dirPath)) return []
  const files = []
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const childPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) files.push(...collectFiles(childPath, ""))
    else if (entry.isFile()) files.push(childPath)
  }
  return files
}

function countLines(filePath) {
  const text = fs.readFileSync(filePath, "utf8")
  if (!text) return 0
  return text.split(/\r?\n/).length
}

function extensionMetrics(extensionPath, label) {
  const srcFiles = collectFiles(extensionPath, "src").filter((filePath) => filePath.endsWith(".ts"))
  const testFiles = collectFiles(extensionPath, "test").filter((filePath) => filePath.endsWith(".js") || filePath.endsWith(".ts"))
  const packageJsonPath = path.join(extensionPath, "package.json")
  const packageJson = fs.existsSync(packageJsonPath) ? JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) : {}
  return {
    extension: label.replace(/\\/g, "/"),
    srcFiles: srcFiles.length,
    srcLoc: srcFiles.reduce((total, filePath) => total + countLines(filePath), 0),
    testFiles: testFiles.length,
    testLoc: testFiles.reduce((total, filePath) => total + countLines(filePath), 0),
    dependencies: Object.keys(packageJson.dependencies ?? {}).length,
    devDependencies: Object.keys(packageJson.devDependencies ?? {}).length
  }
}

function renderMarkdown(rows) {
  const lines = [
    "## Extension Source Metrics",
    "",
    "| extension | src files | src LOC | test files | test LOC | dependencies | dev dependencies |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |"
  ]
  for (const row of rows) {
    lines.push(`| ${row.extension} | ${row.srcFiles} | ${row.srcLoc} | ${row.testFiles} | ${row.testLoc} | ${row.dependencies} | ${row.devDependencies} |`)
  }
  return `${lines.join("\n")}\n`
}

function main() {
  const { output, targets } = parseArgs(process.argv.slice(2))
  const rows = targets.map((target) => extensionMetrics(path.resolve(process.cwd(), target), target))
  const markdown = renderMarkdown(rows)
  if (output) fs.writeFileSync(path.resolve(process.cwd(), output), markdown)
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown)
  process.stdout.write(markdown)
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
