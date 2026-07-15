const fsp = require("node:fs/promises")

const [workspaceRoot, runId, encodedContent] = process.argv.slice(2)
const content = Buffer.from(encodedContent, "base64").toString("utf8")
const originalLink = fsp.link

fsp.link = async (existingPath, newPath) => {
  await originalLink(existingPath, newPath)
  if (String(newPath).endsWith("run-state-v0.backup.json")) {
    process.stdout.write("LINKED\n")
    await new Promise(() => undefined)
  }
}

const { ensureContainedRunStateMigrationBackup } = require("../../out/core/runtime/runStateMigrationBackup.js")

ensureContainedRunStateMigrationBackup(workspaceRoot, runId, content).then(
  () => process.exit(0),
  (error) => {
    process.stderr.write(`${error?.stack ?? error}\n`)
    process.exit(1)
  }
)
