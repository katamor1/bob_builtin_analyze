const assert = require("node:assert/strict")
const { spawn } = require("node:child_process")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const { getRuleAuthoringPaths } = require("../out/ruleAuthoring/ruleAuthoringPaths")
const {
  createRuleAuthoringRun,
  listIncompleteRuleAuthoringRuns,
  readRuleAuthoringRun,
  writeRuleAuthoringRun
} = require("../out/ruleAuthoring/ruleAuthoringRunStore")

async function roots(t) {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "bob-rule-run-link-"))
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), "bob-rule-run-outside-"))
  t.after(() => Promise.all([
    fs.rm(workspaceRoot, { recursive: true, force: true }),
    fs.rm(outside, { recursive: true, force: true })
  ]))
  return { workspaceRoot, outside }
}

test("rejects a symlinked authoring directory before creating a run", async (t) => {
  const { workspaceRoot, outside } = await roots(t)
  await fs.mkdir(path.join(workspaceRoot, ".bob", "review"), { recursive: true })
  if (!await createLinkOrSkip(
    t,
    outside,
    path.join(workspaceRoot, ".bob", "review", "rule-authoring"),
    "dir"
  )) return

  await assert.rejects(
    createRuleAuthoringRun({ workspaceRoot, runId: "run-link" }),
    /symbolic link|physical containment/
  )
})

test("rejects symlinked run files for read and write", async (t) => {
  const { workspaceRoot, outside } = await roots(t)
  const run = await createRuleAuthoringRun({ workspaceRoot, runId: "run-file-link" })
  const paths = getRuleAuthoringPaths(workspaceRoot, run.runId)
  const outsideFile = path.join(outside, "authoring-run.json")
  await fs.writeFile(outsideFile, JSON.stringify(run), "utf8")
  await fs.rm(paths.authoringRunPath)
  if (!await createLinkOrSkip(t, outsideFile, paths.authoringRunPath, "file")) return

  await assert.rejects(readRuleAuthoringRun(paths), /symbolic link/)
  const nextUpdatedAt = new Date(Date.parse(run.updatedAt) + 1_000).toISOString()
  await assert.rejects(
    writeRuleAuthoringRun({ ...run, updatedAt: nextUpdatedAt }),
    /symbolic link/
  )
})

test("rejects a symlinked runs base but skips symlinked child runs", async (t) => {
  const first = await roots(t)
  const firstPaths = getRuleAuthoringPaths(first.workspaceRoot, "run-base")
  await fs.mkdir(firstPaths.authoringDirectory, { recursive: true })
  if (!await createLinkOrSkip(t, first.outside, firstPaths.runsDirectory, "dir")) return
  await assert.rejects(listIncompleteRuleAuthoringRuns(first.workspaceRoot), /symbolic link/)

  const second = await roots(t)
  await createRuleAuthoringRun({ workspaceRoot: second.workspaceRoot, runId: "run-real" })
  const secondPaths = getRuleAuthoringPaths(second.workspaceRoot, "run-child")
  if (!await createLinkOrSkip(t, second.outside, secondPaths.runDirectory, "dir")) return
  const runs = await listIncompleteRuleAuthoringRuns(second.workspaceRoot)
  assert.deepEqual(runs.map((run) => run.runId), ["run-real"])
})

test("listing rejects a symlinked ancestor of the runs directory", async (t) => {
  const { workspaceRoot, outside } = await roots(t)
  await fs.mkdir(path.join(outside, "review", "rule-authoring", "runs"), { recursive: true })
  if (!await createLinkOrSkip(t, outside, path.join(workspaceRoot, ".bob"), "dir")) return

  await assert.rejects(listIncompleteRuleAuthoringRuns(workspaceRoot), /symbolic link/)
})

test("rejects a parent swap restored after opening a different run file", async (t) => {
  const { workspaceRoot, outside } = await roots(t)
  if (!await supportsDirectoryLinks(t, workspaceRoot, outside)) return
  const run = await createRuleAuthoringRun({ workspaceRoot, runId: "run-open-swap" })
  const paths = getRuleAuthoringPaths(workspaceRoot, run.runId)
  const injected = { ...run, warnings: ["source.outside_injection"] }
  await fs.writeFile(path.join(outside, "authoring-run.json"), JSON.stringify(injected), "utf8")

  const exit = await runParentSwapReader(paths, outside)
  assert.equal(exit.code, 2, exit.stderr)
  assert.match(exit.stderr, /changed while it was opened/)
  assert.deepEqual(await readRuleAuthoringRun(paths), run)
})

test("rejects a restored parent swap when rename did not install the synced temporary inode", async (t) => {
  const { workspaceRoot, outside } = await roots(t)
  if (!await supportsDirectoryLinks(t, workspaceRoot, outside)) return
  const run = await createRuleAuthoringRun({ workspaceRoot, runId: "run-rename-swap" })
  const paths = getRuleAuthoringPaths(workspaceRoot, run.runId)
  const nextUpdatedAt = new Date(Date.parse(run.updatedAt) + 1_000).toISOString()
  const next = { ...run, warnings: ["source.should_not_install"], updatedAt: nextUpdatedAt }
  await fs.writeFile(path.join(outside, "authoring-run.json"), "outside original\n", "utf8")

  const exit = await runParentSwapWriter(paths, outside, next, run.updatedAt)
  assert.equal(exit.code, 2, exit.stderr)
  assert.match(exit.stderr, /changed during atomic replacement/)
  assert.deepEqual(await readRuleAuthoringRun(paths), run)
  assert.equal(await fs.readFile(path.join(outside, "authoring-run.json"), "utf8"), "outside replacement\n")
  assert.deepEqual(
    (await fs.readdir(paths.runDirectory)).filter((name) => name.endsWith(".tmp")),
    []
  )
})

function runParentSwapReader(paths, outside) {
  const script = [
    "const fs = require('node:fs/promises')",
    "const originalOpen = fs.open",
    "let swapped = false",
    "fs.open = async (target, ...args) => {",
    "  if (swapped || target !== process.env.RUN_PATH) return originalOpen(target, ...args)",
    "  swapped = true",
    "  await fs.rename(process.env.RUN_DIRECTORY, process.env.PARKED_DIRECTORY)",
    "  await fs.symlink(process.env.OUTSIDE_DIRECTORY, process.env.RUN_DIRECTORY, process.env.DIRECTORY_LINK_TYPE)",
    "  let handle",
    "  try { handle = await originalOpen(target, ...args) } finally {",
    "    await fs.rm(process.env.RUN_DIRECTORY, { force: true })",
    "    await fs.rename(process.env.PARKED_DIRECTORY, process.env.RUN_DIRECTORY)",
    "  }",
    "  return handle",
    "}",
    "const pathsModule = require(process.env.PATHS_MODULE)",
    "const store = require(process.env.STORE_MODULE)",
    "const paths = pathsModule.getRuleAuthoringPaths(process.env.WORKSPACE_ROOT, process.env.RUN_ID)",
    "store.readRuleAuthoringRun(paths)",
    "  .then(() => process.stdout.write('unexpected success'))",
    "  .catch((error) => { process.stderr.write(error.message); process.exitCode = 2 })"
  ].join("\n")
  return runSwapChild(script, paths, outside)
}

function runParentSwapWriter(paths, outside, run, expectedUpdatedAt) {
  const script = [
    "const path = require('node:path')",
    "const fs = require('node:fs/promises')",
    "const originalRename = fs.rename",
    "let swapped = false",
    "fs.rename = async (source, destination) => {",
    "  if (swapped || destination !== process.env.RUN_PATH) return originalRename(source, destination)",
    "  swapped = true",
    "  await originalRename(process.env.RUN_DIRECTORY, process.env.PARKED_DIRECTORY)",
    "  await fs.symlink(process.env.OUTSIDE_DIRECTORY, process.env.RUN_DIRECTORY, process.env.DIRECTORY_LINK_TYPE)",
    "  await fs.writeFile(path.join(process.env.OUTSIDE_DIRECTORY, path.basename(source)), 'outside replacement\\n')",
    "  try { await originalRename(source, destination) } finally {",
    "    await fs.rm(process.env.RUN_DIRECTORY, { force: true })",
    "    await originalRename(process.env.PARKED_DIRECTORY, process.env.RUN_DIRECTORY)",
    "  }",
    "}",
    "const store = require(process.env.STORE_MODULE)",
    "const run = JSON.parse(Buffer.from(process.env.RUN_BASE64, 'base64').toString('utf8'))",
    "store.writeRuleAuthoringRun(run, process.env.EXPECTED_UPDATED_AT)",
    "  .then(() => process.stdout.write('unexpected success'))",
    "  .catch((error) => { process.stderr.write(error.message); process.exitCode = 2 })"
  ].join("\n")
  return runSwapChild(script, paths, outside, {
    RUN_BASE64: Buffer.from(JSON.stringify(run), "utf8").toString("base64"),
    EXPECTED_UPDATED_AT: expectedUpdatedAt
  })
}

function runSwapChild(script, paths, outside, extraEnv = {}) {
  const parkedDirectory = `${paths.runDirectory}.parked`
  const child = spawn(process.execPath, ["-e", script], {
    cwd: __dirname,
    env: {
      ...process.env,
      PATHS_MODULE: require.resolve("../out/ruleAuthoring/ruleAuthoringPaths"),
      STORE_MODULE: require.resolve("../out/ruleAuthoring/ruleAuthoringRunStore"),
      WORKSPACE_ROOT: path.resolve(paths.reviewDirectory, "..", ".."),
      RUN_ID: path.basename(paths.runDirectory),
      RUN_PATH: paths.authoringRunPath,
      RUN_DIRECTORY: paths.runDirectory,
      PARKED_DIRECTORY: parkedDirectory,
      OUTSIDE_DIRECTORY: outside,
      DIRECTORY_LINK_TYPE: directoryLinkType(),
      ...extraEnv
    },
    stdio: ["ignore", "pipe", "pipe"]
  })
  return new Promise((resolve, reject) => {
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk) => { stdout += chunk })
    child.stderr.on("data", (chunk) => { stderr += chunk })
    child.on("error", reject)
    child.on("close", (code) => resolve({ code, stdout, stderr }))
  })
}

const UNSUPPORTED_LINK_CODES = new Set(["EPERM", "EACCES", "ENOTSUP"])

function directoryLinkType() {
  return process.platform === "win32" ? "junction" : "dir"
}

async function createLinkOrSkip(t, target, linkPath, kind) {
  try {
    await fs.symlink(target, linkPath, kind === "dir" ? directoryLinkType() : kind)
    return true
  } catch (error) {
    if (!UNSUPPORTED_LINK_CODES.has(error.code)) throw error
    t.skip(`symbolic links are unavailable in this environment (${error.code})`)
    return false
  }
}

async function supportsDirectoryLinks(t, workspaceRoot, target) {
  const probe = path.join(workspaceRoot, ".rule-authoring-link-probe")
  if (!await createLinkOrSkip(t, target, probe, "dir")) return false
  await fs.rm(probe, { force: true })
  return true
}
