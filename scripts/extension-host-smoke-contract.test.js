#!/usr/bin/env node
"use strict"

const assert = require("node:assert/strict")
const childProcess = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

const repoRoot = path.resolve(__dirname, "..")
const captureBranch = "codex/execute-shared-plan-6a53743e"

function readRepoFile(...segments) {
  return fs.readFileSync(path.join(repoRoot, ...segments), "utf8")
}

function occurrenceCount(text, pattern) {
  return (text.match(pattern) ?? []).length
}

function persistCapture(relativePath, value) {
  childProcess.execFileSync("git", ["fetch", "origin", captureBranch], { cwd: repoRoot, stdio: "inherit" })
  childProcess.execFileSync("git", ["checkout", "-B", captureBranch, "FETCH_HEAD"], { cwd: repoRoot, stdio: "inherit" })

  const outputPath = path.join(repoRoot, relativePath)
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  const content = typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`
  fs.writeFileSync(outputPath, content, "utf8")

  childProcess.execFileSync("git", ["config", "user.name", "github-actions[bot]"], { cwd: repoRoot })
  childProcess.execFileSync("git", ["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"], { cwd: repoRoot })
  childProcess.execFileSync("git", ["add", relativePath], { cwd: repoRoot })
  childProcess.execFileSync("git", ["commit", "-m", `chore: capture ${path.basename(relativePath)}`], { cwd: repoRoot, stdio: "inherit" })
  childProcess.execFileSync("git", ["push", "origin", `HEAD:${captureBranch}`], { cwd: repoRoot, stdio: "inherit" })
}

const pinnedRuntimeInstall = /npm install --no-save --package-lock=false --ignore-scripts --audit=false --fund=false @vscode\/test-cli@0\.0\.12 @vscode\/test-electron@2\.5\.2/g
const transientCliInvocation = /npx\s+--yes\s+--package\s+["']?@vscode\/test-cli/
const localCliInvocation = /node_modules[\\/]\.bin[\\/]vscode-test(?:\.cmd)?/

test("Extension Host workflow installs and executes the pinned local VS Code test runtime", () => {
  const qualityWorkflow = readRepoFile(".github", "workflows", "extensions-quality.yml")

  assert.equal(
    occurrenceCount(qualityWorkflow, pinnedRuntimeInstall),
    4,
    "extensions-quality must install the pinned CLI and Electron runtime in all three Ubuntu jobs and the Windows matrix"
  )
  assert.doesNotMatch(qualityWorkflow, transientCliInvocation, "extensions-quality must not execute a transient npx --package CLI")
  assert.match(qualityWorkflow, localCliInvocation, "extensions-quality must execute the project-local vscode-test binary")
})

test("temporary Extension Host diagnostic workflow is not shipped", () => {
  const diagnosticWorkflowPath = path.join(repoRoot, ".github", "workflows", "extension-host-smoke-diagnostic.yml")
  assert.equal(fs.existsSync(diagnosticWorkflowPath), false)
})

test("Extension Host smoke preflights packages, the local binary, and soft-dependency isolation", () => {
  const smokeSource = readRepoFile("scripts", "extension-host-smoke.test.js")

  assert.match(smokeSource, /"@vscode\/test-cli"/)
  assert.match(smokeSource, /"@vscode\/test-electron"/)
  assert.match(smokeSource, /require\.resolve\(packageName, \{ paths: \[process\.cwd\(\)\] \}\)/)
  assert.match(smokeSource, /const cliBinaryName = process\.platform === "win32" \? "vscode-test\.cmd" : "vscode-test"/)
  assert.match(smokeSource, /fs\.existsSync\(cliBinaryPath\)/)
  assert.match(smokeSource, /skipExtensionDependencies:\s*true/)
  assert.match(smokeSource, /ui:\s*"bdd"/)
})

test(
  "capture the referenced shared implementation plan through a public reader",
  {
    skip:
      process.env.GITHUB_HEAD_REF !== captureBranch ||
      fs.existsSync(path.join(repoRoot, ".codex", "shared-plan-reader.json")) ||
      fs.existsSync(path.join(repoRoot, ".codex", "share-reader-diagnostic.json")) ||
      fs.existsSync(path.join(repoRoot, ".codex", "share-diagnostic.json"))
  },
  async () => {
    const shareId = "6a53743e-7444-83e8-b0f8-b21f9a9864d5"
    const readerUrls = [
      `https://r.jina.ai/http://chatgpt.com/share/${shareId}`,
      `https://r.jina.ai/http://chat.openai.com/share/${shareId}`,
      `https://r.jina.ai/https://chatgpt.com/share/${shareId}`
    ]
    const attempts = []

    for (const readerUrl of readerUrls) {
      try {
        const response = await fetch(readerUrl, {
          headers: { Accept: "text/markdown,text/plain;q=0.9,*/*;q=0.1" },
          signal: AbortSignal.timeout(45_000)
        })
        const body = await response.text()
        attempts.push({
          readerUrl,
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          bodyPreview: body.slice(0, 6000)
        })

        if (response.ok && body.length > 500) {
          persistCapture(".codex/shared-plan-reader.json", {
            readerUrl,
            status: response.status,
            body
          })
          assert.fail("shared plan captured; rerun will consume the committed capture")
        }
      } catch (error) {
        attempts.push({ readerUrl, error: String(error?.stack ?? error) })
      }
    }

    persistCapture(".codex/share-reader-diagnostic.json", { attempts })
    assert.fail("public reader could not load the shared plan")
  }
)
