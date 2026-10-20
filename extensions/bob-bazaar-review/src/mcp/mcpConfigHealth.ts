import * as fs from "node:fs/promises"
import * as path from "node:path"

// Static readiness only. A valid file is not evidence of an MCP connection.
export async function inspectMcpConfig(mcpPath: string, serverName: string, workspaceRoot: string): Promise<string[]> {
  let config: unknown
  try {
    config = JSON.parse((await fs.readFile(mcpPath, "utf8")).replace(/^\uFEFF/, ""))
  } catch {
    return ["invalid-json"]
  }
  const servers = isRecord(config) && isRecord(config.mcpServers) ? config.mcpServers : {}
  const server = servers[serverName]
  if (!isRecord(server)) return [`mcpServers.${serverName}`]
  const issues: string[] = []
  const env = isRecord(server.env) ? server.env : {}
  if (server.disabled === true) issues.push("server-disabled")
  if (typeof server.command !== "string" || !await commandExists(server.command)) issues.push("command-not-found")
  const script = Array.isArray(server.args) ? server.args[0] : undefined
  if (typeof script !== "string" || !path.isAbsolute(script) || !await isFile(script)) {
    issues.push("server-script-not-found")
  } else {
    try {
      if (path.relative(await fs.realpath(path.join(__dirname, "server.js")), await fs.realpath(script)) !== "") {
        issues.push("server-script-outdated")
      }
    } catch {
      issues.push("server-script-not-found")
    }
  }
  if (typeof server.command === "string"
    && /^(?:IBM Bob|Code(?: - Insiders)?|electron)(?:\.exe)?$/i.test(path.basename(server.command))
    && env.ELECTRON_RUN_AS_NODE !== "1") issues.push("electron-node-mode-missing")
  const roots = typeof env.BOB_BAZAAR_ALLOWED_ROOTS === "string"
    ? env.BOB_BAZAAR_ALLOWED_ROOTS.split(path.delimiter).map(root => root.trim()).filter(Boolean)
    : []
  if (!roots.length) {
    issues.push("allowed-roots-missing")
  } else {
    let realWorkspace: string | undefined
    try { realWorkspace = await fs.realpath(workspaceRoot) } catch { issues.push("workspace-root-unavailable") }
    let workspaceAllowed = false
    if (roots.some(root => !path.isAbsolute(root))) issues.push("allowed-roots-invalid")
    for (const root of roots) {
      try {
        if (!(await fs.stat(root)).isDirectory()) issues.push("allowed-roots-not-found")
        else if (path.isAbsolute(root) && realWorkspace && isWithin(await fs.realpath(root), realWorkspace)) workspaceAllowed = true
      } catch {
        issues.push("allowed-roots-not-found")
      }
    }
    if (!workspaceAllowed) issues.push("workspace-not-allowed")
  }
  return [...new Set(issues)]
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

async function commandExists(command: string): Promise<boolean> {
  if (path.isAbsolute(command)) return isFile(command)
  if (!command || command.includes(path.sep) || command.includes("/")) return false
  const extensions = process.platform === "win32" && !path.extname(command)
    ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";") : [""]
  for (const directory of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!directory) continue
    for (const extension of extensions) {
      if (await isFile(path.join(directory, command + extension))) return true
    }
  }
  return false
}

async function isFile(file: string): Promise<boolean> {
  try { return (await fs.stat(file)).isFile() } catch { return false }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
