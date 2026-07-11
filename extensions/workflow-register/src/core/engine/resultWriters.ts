import * as fs from "fs/promises"
import * as nodePath from "path"
import type {
  CoreWorkflowDefinition,
  EngineStep,
  ResultSourceDefinition,
  WorkflowProviderArtifactMetadata,
  WorkflowRunState
} from "../model"
import {
  ARTIFACT_MANIFEST_PATH,
  createWorkflowArtifactManifestEntry,
  updateWorkflowArtifactManifest,
  type WorkflowArtifactManifestEntry
} from "../artifacts/artifactManifest"
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
  providerArtifacts?: WorkflowProviderArtifactMetadata[]
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { workflow, run, step, resultSinks } = input
  const artifacts = workflow.artifacts ?? []
  const providerEntries = await validateProviderArtifacts({
    workflow,
    run,
    step,
    providerArtifacts: input.providerArtifacts ?? []
  })
  if (!providerEntries.ok) return providerEntries
  const manifestEntries: WorkflowArtifactManifestEntry[] = [...providerEntries.entries.values()]
  for (const artifact of artifacts.filter((item) => item.producedBy === step.id)) {
    if (providerEntries.entries.has(artifact.id)) continue
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
    manifestEntries.push(createWorkflowArtifactManifestEntry({ artifact, step, path, text: value }))
  }
  if (manifestEntries.length > 0) {
    const manifest = updateWorkflowArtifactManifest({ workflow, run, entries: manifestEntries })
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

async function validateProviderArtifacts(input: {
  workflow: CoreWorkflowDefinition
  run: WorkflowRunState
  step: EngineStep
  providerArtifacts: WorkflowProviderArtifactMetadata[]
}): Promise<
  | { ok: true; entries: Map<string, WorkflowArtifactManifestEntry> }
  | { ok: false; error: string }
> {
  const entries = new Map<string, WorkflowArtifactManifestEntry>()
  if (input.providerArtifacts.length === 0) return { ok: true, entries }
  if (!input.workflow.workflowRoot) {
    return { ok: false, error: "Provider artifact metadata requires a workflow root." }
  }
  const root = nodePath.resolve(input.workflow.workflowRoot)
  for (const metadata of input.providerArtifacts) {
    const declarations = (input.workflow.artifacts ?? []).filter((artifact) => artifact.id === metadata.id)
    if (declarations.length === 0) {
      return { ok: false, error: `Provider artifact '${metadata.id}' is not declared by the workflow.` }
    }
    if (declarations.length > 1) {
      return { ok: false, error: `Provider artifact '${metadata.id}' has duplicate workflow declarations.` }
    }
    const artifact = declarations[0]
    if (artifact.producedBy !== input.step.id) {
      return {
        ok: false,
        error: `Provider artifact '${metadata.id}' is declared for step '${artifact.producedBy ?? "<missing>"}', not '${input.step.id}'.`
      }
    }
    const renderedPath = renderArtifactPath(artifact, {
      inputs: input.run.inputs,
      state: input.run.state,
      run: input.run,
      workflow: input.workflow,
      step: input.step
    })
    if (normalizeArtifactPath(metadata.path) !== normalizeArtifactPath(renderedPath)) {
      return { ok: false, error: `Provider artifact '${metadata.id}' path does not match declared artifact path.` }
    }
    if (!isWorkspaceRelativePath(metadata.path)) {
      return { ok: false, error: `Provider artifact '${metadata.id}' path escapes the workspace.` }
    }
    const target = nodePath.resolve(root, metadata.path)
    const relative = nodePath.relative(root, target)
    if (relative.startsWith("..") || nodePath.isAbsolute(relative)) {
      return { ok: false, error: `Provider artifact '${metadata.id}' path escapes the workspace.` }
    }
    let stat
    try {
      stat = await fs.stat(target)
    } catch (error) {
      if (isMissingFileError(error)) {
        return { ok: false, error: `Provider artifact '${metadata.id}' file does not exist.` }
      }
      return { ok: false, error: `Provider artifact '${metadata.id}' could not be inspected: ${error instanceof Error ? error.message : String(error)}` }
    }
    if (!stat.isFile()) {
      return { ok: false, error: `Provider artifact '${metadata.id}' path is not a file.` }
    }
    try {
      const [rootRealPath, targetRealPath, content] = await Promise.all([
        fs.realpath(root),
        fs.realpath(target),
        fs.readFile(target)
      ])
      const realRelative = nodePath.relative(rootRealPath, targetRealPath)
      if (realRelative.startsWith("..") || nodePath.isAbsolute(realRelative)) {
        return { ok: false, error: `Provider artifact '${metadata.id}' path escapes the workspace.` }
      }
      entries.set(metadata.id, createWorkflowArtifactManifestEntry({
        artifact,
        step: input.step,
        path: renderedPath,
        text: content,
        source: "provider-artifact"
      }))
    } catch (error) {
      return { ok: false, error: `Provider artifact '${metadata.id}' could not be read: ${error instanceof Error ? error.message : String(error)}` }
    }
  }
  return { ok: true, entries }
}

function normalizeArtifactPath(value: string): string {
  return value.replace(/\\/g, "/")
}

function isWorkspaceRelativePath(value: string): boolean {
  if (!value.trim() || nodePath.isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value)) return false
  return !normalizeArtifactPath(value).split("/").some((segment) => segment === "..")
}

function isMissingFileError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "ENOENT")
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
