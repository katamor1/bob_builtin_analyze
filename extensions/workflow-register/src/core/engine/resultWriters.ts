import { createHash } from "crypto"
import type {
  CoreWorkflowDefinition,
  EngineStep,
  ResultSourceDefinition,
  WorkflowArtifactDefinition,
  WorkflowRunState
} from "../model"
import type { ResultSinkRegistry } from "../resultSinkRegistry"
import type { WorkflowEngineEventInput, WorkflowEngineOptions } from "../engineTypes"
import { assertUserWritableStateKey } from "../stateKeys"
import { markResultHandoffFailed } from "./recoveryState"
import {
  renderArtifactPath,
  replacementResultText
} from "./templateRenderer"

type RecoverResultText = NonNullable<WorkflowEngineOptions["recoverResultText"]>
type HandoffEmitter = (input: WorkflowEngineEventInput) => Promise<void>

const ARTIFACT_MANIFEST_STATE_KEY = "workflow.artifactManifest"
const ARTIFACT_MANIFEST_PATH = ".bob/workflows/runs/{{run.id}}/artifacts/manifest.json"

interface WorkflowArtifactManifestEntry {
  id: string
  stateKey: string
  producedBy: string
  path: string
  schema?: string
  sha256: string
  bytes: number
  source: "workflow-artifact"
  updatedAt: string
}

interface WorkflowArtifactManifest {
  schemaVersion: "workflow-register/artifact-manifest/v1"
  workflowId: string
  logicalWorkflowId?: string
  workflowDefinitionHash?: string
  workflowFile?: string
  runId: string
  inputsHash: string
  createdAt: string
  updatedAt: string
  artifacts: WorkflowArtifactManifestEntry[]
}

export async function writeResultSinks(input: {
  workflow: CoreWorkflowDefinition
  run: WorkflowRunState
  step: EngineStep
  result: ResultSourceDefinition
  resultSinks: ResultSinkRegistry
  recoverResultText?: RecoverResultText
  emitHandoffFailed: HandoffEmitter
  agentText?: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { workflow, run, step, result, resultSinks, recoverResultText, emitHandoffFailed, agentText } = input
  try {
    if ("resultKey" in step && step.resultKey) assertUserWritableStateKey(step.resultKey, "workflow resultKey")
    const text = await resultText({ workflow, run, step, result, recoverResultText, agentText })
    for (const sink of result.sinks) {
      // result sink はファイル書き込みやコマンド連携を含む副作用境界なので、失敗は run state に記録して再開可能にする。
      const write = await resultSinks.write(sink, {
        workflowId: workflow.id,
        logicalWorkflowId: workflow.logicalWorkflowId,
        workflowRoot: workflow.workflowRoot,
        workflowFile: workflow.workflowFile,
        workflowFolderName: workflow.workflowFolderName,
        runId: run.runId,
        stepId: step.id,
        inputs: run.inputs,
        state: run.state,
        text
      })
      if (!write.ok) {
        const error = write.error ?? `Result sink failed: ${sink.type}`
        markResultHandoffFailed(run, step, error)
        await emitHandoffFailed({ workflow, run, step, agentText: text, error })
        return { ok: false, error }
      }
      const replacementText = replacementResultText(write.value)
      if (replacementText !== undefined && "resultKey" in step && step.resultKey) {
        run.state[step.resultKey] = replacementText
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    markResultHandoffFailed(run, step, message)
    await emitHandoffFailed({ workflow, run, step, agentText, error: message })
    return { ok: false, error: message }
  }
  return { ok: true }
}

export async function writeProducedArtifacts(input: {
  workflow: CoreWorkflowDefinition
  run: WorkflowRunState
  step: EngineStep
  resultSinks: ResultSinkRegistry
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { workflow, run, step, resultSinks } = input
  const artifacts = workflow.artifacts ?? []
  const manifestEntries: WorkflowArtifactManifestEntry[] = []
  for (const artifact of artifacts.filter((item) => item.producedBy === step.id)) {
    const value = run.state[artifact.id]
    if (value === undefined) continue
    const path = renderArtifactPath(artifact, { inputs: run.inputs, state: run.state, run, workflow, step })
    // artifact path に未解決テンプレートが残る場合は、誤った literal path への生成物書き込みを避ける。
    if (path.includes("{{")) continue
    const write = await resultSinks.write({ type: "file", path }, {
      workflowId: workflow.id,
      logicalWorkflowId: workflow.logicalWorkflowId,
      workflowRoot: workflow.workflowRoot,
      workflowFile: workflow.workflowFile,
      workflowFolderName: workflow.workflowFolderName,
      runId: run.runId,
      stepId: step.id,
      inputs: run.inputs,
      state: run.state,
      text: value
    })
    if (!write.ok) return { ok: false, error: write.error ?? `Failed to write artifact: ${artifact.id}` }
    manifestEntries.push(artifactManifestEntry(artifact, step, path, value))
  }
  if (manifestEntries.length > 0) {
    const manifest = updateArtifactManifest(workflow, run, manifestEntries)
    const manifestWrite = await resultSinks.write({ type: "file", path: ARTIFACT_MANIFEST_PATH }, {
      workflowId: workflow.id,
      logicalWorkflowId: workflow.logicalWorkflowId,
      workflowRoot: workflow.workflowRoot,
      workflowFile: workflow.workflowFile,
      workflowFolderName: workflow.workflowFolderName,
      runId: run.runId,
      stepId: step.id,
      inputs: run.inputs,
      state: run.state,
      text: `${JSON.stringify(manifest, null, 2)}\n`
    })
    if (!manifestWrite.ok) return { ok: false, error: manifestWrite.error ?? "Failed to write artifact manifest." }
  }
  return { ok: true }
}

async function resultText(input: {
  workflow: CoreWorkflowDefinition
  run: WorkflowRunState
  step: EngineStep
  result: ResultSourceDefinition
  recoverResultText?: RecoverResultText
  agentText?: string
}): Promise<string> {
  const { workflow, run, step, result, recoverResultText, agentText } = input
  if (result.source === "literal") return result.text
  if (result.source === "agent") {
    const recovered = agentText ?? await recoverResultText?.({
      workflow,
      run,
      step,
      reason: "missing-result-text"
    })
    if (recovered === undefined) throw new Error("Agent result source is not available for this step.")
    return recovered
  }
  const value = run.state[result.stateKey]
  if (value === undefined) throw new Error(`Workflow state is missing: ${result.stateKey}`)
  return value
}

function artifactManifestEntry(
  artifact: WorkflowArtifactDefinition,
  step: EngineStep,
  path: string,
  value: string
): WorkflowArtifactManifestEntry {
  const bytes = Buffer.byteLength(value, "utf8")
  return {
    id: artifact.id,
    stateKey: artifact.id,
    producedBy: step.id,
    path,
    schema: artifact.schema,
    sha256: sha256(value),
    bytes,
    source: "workflow-artifact",
    updatedAt: new Date().toISOString()
  }
}

function updateArtifactManifest(
  workflow: CoreWorkflowDefinition,
  run: WorkflowRunState,
  entries: WorkflowArtifactManifestEntry[]
): WorkflowArtifactManifest {
  const now = new Date().toISOString()
  const current = parseArtifactManifest(run.state[ARTIFACT_MANIFEST_STATE_KEY])
  const artifacts = new Map<string, WorkflowArtifactManifestEntry>()
  for (const entry of current?.artifacts ?? []) artifacts.set(artifactEntryKey(entry), entry)
  for (const entry of entries) artifacts.set(artifactEntryKey(entry), entry)
  const manifest: WorkflowArtifactManifest = {
    schemaVersion: "workflow-register/artifact-manifest/v1",
    workflowId: workflow.id,
    logicalWorkflowId: workflow.logicalWorkflowId,
    workflowDefinitionHash: workflow.definitionHash,
    workflowFile: workflow.filePath,
    runId: run.runId,
    inputsHash: `sha256:${sha256(stableJson(run.inputs))}`,
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
    artifacts: Array.from(artifacts.values()).sort((left, right) => {
      const byStep = left.producedBy.localeCompare(right.producedBy)
      return byStep !== 0 ? byStep : left.id.localeCompare(right.id)
    })
  }
  run.state[ARTIFACT_MANIFEST_STATE_KEY] = JSON.stringify(manifest)
  return manifest
}

function parseArtifactManifest(value: string | undefined): WorkflowArtifactManifest | undefined {
  if (!value) return undefined
  try {
    const parsed = JSON.parse(value)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined
    const record = parsed as Partial<WorkflowArtifactManifest>
    if (record.schemaVersion !== "workflow-register/artifact-manifest/v1") return undefined
    if (!Array.isArray(record.artifacts)) return undefined
    return record as WorkflowArtifactManifest
  } catch {
    return undefined
  }
}

function artifactEntryKey(entry: WorkflowArtifactManifestEntry): string {
  return `${entry.producedBy}\u0000${entry.id}`
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

function stableJson(value: unknown): string {
  return JSON.stringify(canonicalJson(value))
}

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson)
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(
    Object.keys(value as Record<string, unknown>)
      .sort()
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .map((key) => [key, canonicalJson((value as Record<string, unknown>)[key])])
  )
}
