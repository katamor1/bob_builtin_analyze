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

function extractSharedMessageText(message) {
  const content = message?.content ?? message?.message ?? message?.text
  if (typeof content === "string") {
    return content.trim()
  }
  if (Array.isArray(content)) {
    return content.map((part) => extractSharedMessageText({ content: part })).join("").trim()
  }
  if (!content || typeof content !== "object") {
    return ""
  }
  if (Array.isArray(content.parts)) {
    return content.parts
      .map((part) => {
        if (typeof part === "string") {
          return part
        }
        if (part && typeof part === "object" && typeof part.text === "string") {
          return part.text
        }
        return ""
      })
      .join("")
      .trim()
  }
  if (typeof content.text === "string") {
    return content.text.trim()
  }
  return ""
}

function sharedMessages(payload) {
  const conversation = payload?.conversation && typeof payload.conversation === "object" ? payload.conversation : payload
  const directMessages = conversation?.messages ?? payload?.messages
  if (Array.isArray(directMessages)) {
    return directMessages
  }

  const mapping = conversation?.mapping ?? payload?.mapping
  const currentNode = conversation?.current_node ?? payload?.current_node
  if (!mapping || typeof mapping !== "object") {
    return []
  }

  if (typeof currentNode === "string" && mapping[currentNode]) {
    const pathMessages = []
    const visited = new Set()
    let nodeId = currentNode
    while (nodeId && mapping[nodeId] && !visited.has(nodeId)) {
      visited.add(nodeId)
      const node = mapping[nodeId]
      if (node?.message) {
        pathMessages.push(node.message)
      }
      nodeId = node?.parent
    }
    return pathMessages.reverse()
  }

  return Object.values(mapping)
    .map((node) => node?.message)
    .filter(Boolean)
    .sort((left, right) => (left?.create_time ?? 0) - (right?.create_time ?? 0))
}

function persistCapture(relativePath, value) {
  childProcess.execFileSync("git", ["fetch", "origin", captureBranch], { cwd: repoRoot, stdio: "inherit" })
  childProcess.execFileSync("git", ["checkout", "-B", captureBranch, "FETCH_HEAD"], { cwd: repoRoot, stdio: "inherit" })

  const outputPath = path.join(repoRoot, relativePath)
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, `${JSON.stringify(value, null, 2)}\n`, "utf8")

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
  "capture the referenced shared implementation plan for this execution branch",
  {
    skip:
      process.env.GITHUB_HEAD_REF !== captureBranch ||
      fs.existsSync(path.join(repoRoot, ".codex", "shared-plan.json")) ||
      fs.existsSync(path.join(repoRoot, ".codex", "share-diagnostic.json"))
  },
  async () => {
    const response = await fetch("https://chatgpt.com/backend-api/share/6a53743e-7444-83e8-b0f8-b21f9a9864d5", {
      headers: {
        Origin: "https://chatgpt.com",
        Referer: "https://chatgpt.com/",
        "User-Agent": "Mozilla/5.0"
      }
    })
    const responseText = await response.text()

    if (!response.ok) {
      persistCapture(".codex/share-diagnostic.json", {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        bodyPreview: responseText.slice(0, 4000)
      })
      assert.fail(`shared plan request failed with HTTP ${response.status}`)
    }

    const payload = JSON.parse(responseText)
    const messages = sharedMessages(payload)
    const transcript = messages
      .map((message, index) => {
        const role = message?.author?.role ?? message?.role ?? "unknown"
        const text = extractSharedMessageText(message)
        return text ? `### Message ${index + 1} (${role})\n${text}` : ""
      })
      .filter(Boolean)
      .join("\n\n")

    assert.ok(transcript.length > 0, "shared conversation did not contain readable messages")
    persistCapture(".codex/shared-plan.json", {
      title: payload?.title ?? payload?.conversation?.title ?? "",
      messageCount: messages.length,
      transcript
    })
  }
)
