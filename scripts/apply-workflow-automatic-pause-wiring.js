const fs = require("node:fs")
const path = require("node:path")

const root = path.resolve(__dirname, "..")

function updateText(relativePath, transform) {
  const file = path.join(root, relativePath)
  const source = fs.readFileSync(file, "utf8")
  const next = transform(source)
  if (next === source) throw new Error(`Patch did not change ${relativePath}`)
  fs.writeFileSync(file, next, "utf8")
}

function replaceOnce(source, expected, replacement, label) {
  const count = source.split(expected).length - 1
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`)
  return source.replace(expected, replacement)
}

function patchPackage() {
  const file = path.join(root, "extensions/workflow-register/package.json")
  const manifest = JSON.parse(fs.readFileSync(file, "utf8"))
  const properties = manifest.contributes.configuration.properties
  properties["workflowRegister.runControl.maxRunMinutes"] = {
    type: "number",
    default: 0,
    minimum: 0,
    description: "次の安全な checkpoint で run を自動停止するまでの最大実行時間（分）。0 は無効。"
  }
  properties["workflowRegister.runControl.maxAgentStepsPerRun"] = {
    type: "integer",
    default: 0,
    minimum: 0,
    description: "1 run で開始できる agent step 呼び出し回数の上限。0 は無効。"
  }
  properties["workflowRegister.runControl.pauseAtLocalTime"] = {
    type: "string",
    default: "",
    pattern: "^$|^(?:[01]\\d|2[0-3]):[0-5]\\d$",
    description: "指定したローカル時刻以降、新しい step を開始せず自動停止します。空文字は無効。"
  }
  properties["workflowRegister.runControl.timezone"] = {
    type: "string",
    default: "Asia/Tokyo",
    description: "pauseAtLocalTime の判定に使う IANA timezone。"
  }
  fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`, "utf8")
}

function patchRuntimeFactory() {
  updateText("extensions/workflow-register/src/workflowRuntimeFactory.ts", (initial) => {
    let source = initial
    source = replaceOnce(
      source,
      'import type { ActionRegistry } from "./core/actionRegistry"\n',
      'import type { ActionRegistry } from "./core/actionRegistry"\nimport { normalizeAutomaticPauseSettings } from "./core/automaticPauseSettings"\n',
      "runtime factory settings import"
    )
    source = replaceOnce(
      source,
      'import { FileRunStateStore, RunStateStore } from "./core/runStateStore"\n',
      'import { FileRunControlStore, RunControlStore } from "./core/runControlStore"\nimport { FileRunStateStore, RunStateStore } from "./core/runStateStore"\n',
      "runtime factory control import"
    )
    source = replaceOnce(
      source,
      '      runStore: this.createRunStore(workspaceRoot),\n      agentProvider:',
      '      runStore: this.createRunStore(workspaceRoot),\n      runControlStore: this.createRunControlStore(workspaceRoot),\n      agentProvider:',
      "standalone engine run control wiring"
    )
    source = replaceOnce(
      source,
      '      runStore: (workspaceRoot) => this.createRunStore(workspaceRoot),\n      taskSnapshotStore:',
      '      runStore: (workspaceRoot) => this.createRunStore(workspaceRoot),\n      runControlStore: (workspaceRoot) => this.createRunControlStore(workspaceRoot),\n      taskSnapshotStore:',
      "Bob runner control factory wiring"
    )
    source = replaceOnce(
      source,
      '  createRunStore(workspaceRoot: string): RunStateStore {\n    return new FileRunStateStore({ workspaceRoot, engineVersion: this.options.engineVersion })\n  }\n\n',
      '  createRunStore(workspaceRoot: string): RunStateStore {\n    return new FileRunStateStore({ workspaceRoot, engineVersion: this.options.engineVersion })\n  }\n\n  createRunControlStore(workspaceRoot: string): RunControlStore {\n    const settings = this.automaticPauseSettings()\n    for (const diagnostic of settings.diagnostics) console.warn(`[workflow-register] ${diagnostic}`)\n    return new FileRunControlStore({\n      workspaceRoot,\n      workspaceAutomaticPauseLimits: settings.limits\n    })\n  }\n\n',
      "runtime factory control method"
    )
    source = replaceOnce(
      source,
      '  private taskSnapshotSettings(): TaskSnapshotSettings {\n',
      '  private automaticPauseSettings(): ReturnType<typeof normalizeAutomaticPauseSettings> {\n    const config = vscode.workspace.getConfiguration("workflowRegister")\n    return normalizeAutomaticPauseSettings({\n      maxRunMinutes: config.get<number>("runControl.maxRunMinutes", 0),\n      maxAgentStepsPerRun: config.get<number>("runControl.maxAgentStepsPerRun", 0),\n      pauseAtLocalTime: config.get<string>("runControl.pauseAtLocalTime", ""),\n      timezone: config.get<string>("runControl.timezone", "Asia/Tokyo")\n    })\n  }\n\n  private taskSnapshotSettings(): TaskSnapshotSettings {\n',
      "runtime factory settings method"
    )
    return source
  })
}

function patchBobRunner() {
  updateText("extensions/workflow-register/src/bobWorkflowRunner.ts", (initial) => {
    let source = initial
    source = replaceOnce(
      source,
      'import type { ResultSinkRegistry } from "./core/resultSinkRegistry"\nimport type { RunStateStore } from "./core/runStateStore"\n',
      'import type { ResultSinkRegistry } from "./core/resultSinkRegistry"\nimport type { RunControlStore } from "./core/runControlStore"\nimport type { RunStateStore } from "./core/runStateStore"\n',
      "Bob runner control import"
    )
    source = replaceOnce(
      source,
      '  runStore: (workspaceRoot: string) => RunStateStore\n  taskSnapshotStore:',
      '  runStore: (workspaceRoot: string) => RunStateStore\n  runControlStore: (workspaceRoot: string) => RunControlStore\n  taskSnapshotStore:',
      "Bob runner control option"
    )
    source = replaceOnce(
      source,
      '      runStore,\n      agentProvider:',
      '      runStore,\n      runControlStore: this.options.runControlStore(workspaceRoot),\n      agentProvider:',
      "Bob runner engine control wiring"
    )
    return source
  })
}

patchPackage()
patchRuntimeFactory()
patchBobRunner()
fs.rmSync(__filename)
fs.rmSync(path.join(root, ".github/workflows/workflow-automatic-pause-wiring-patch.yml"))
