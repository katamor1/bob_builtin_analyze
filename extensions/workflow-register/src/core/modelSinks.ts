export interface CommandResultSinkDefinition {
  type: "command"
  command: string
  args?: unknown[]
}

export interface FileResultSinkDefinition {
  type: "file"
  path: string
  encoding?: BufferEncoding
}

export interface CustomResultSinkDefinition {
  type: string
  contractVersion: string
  payload: Record<string, unknown>
}

export type ResultSinkDefinition =
  | CommandResultSinkDefinition
  | FileResultSinkDefinition
  | CustomResultSinkDefinition

export function isCommandResultSink(sink: ResultSinkDefinition): sink is CommandResultSinkDefinition {
  const candidate = sink as Partial<CommandResultSinkDefinition>
  return sink.type === "command"
    && typeof candidate.command === "string"
    && (candidate.args === undefined || Array.isArray(candidate.args))
}

export function isFileResultSink(sink: ResultSinkDefinition): sink is FileResultSinkDefinition {
  const candidate = sink as Partial<FileResultSinkDefinition>
  return sink.type === "file"
    && typeof candidate.path === "string"
    && (candidate.encoding === undefined || typeof candidate.encoding === "string")
}

export interface ResultSinkWriteInput {
  workflowId: string
  logicalWorkflowId?: string
  workflowRoot?: string
  workflowFile?: string
  workflowFolderName?: string
  runId: string
  stepId: string
  inputs?: Record<string, unknown>
  state?: Record<string, string>
  text: string
}

export interface ResultSinkWriteResult {
  ok: boolean
  value?: unknown
  path?: string
  error?: string
}
