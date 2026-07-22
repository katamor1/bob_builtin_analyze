import type { JsonValue } from "./jsonValue"

export type Sha256Digest = `sha256:${string}`

export interface WorkflowProviderRegistrationInput {
  readonly sourceId: string
  readonly contract: WorkflowProviderContractInput
}

export interface WorkflowProviderRegistration {
  dispose(): void
}

export interface WorkflowProviderSchemaEvidence {
  readonly id: string
  readonly bytes: number
  readonly digest: Sha256Digest
}

export type WorkflowProviderOutputEvidence =
  | { readonly kind: "unit" }
  | { readonly kind: "value"; readonly schema: WorkflowProviderSchemaEvidence }

export interface WorkflowProviderArtifactWriter {
  writeArtifact(input: {
    readonly id: string
    readonly bytes: Uint8Array
  }): Promise<void>
}

export type WorkflowProviderIdempotencyInput =
  | { readonly mode: "idempotent" }
  | { readonly mode: "key-required"; readonly key: string }
  | { readonly mode: "non-idempotent" }

export type WorkflowProviderEffectInput =
  | { readonly kind: "none" }
  | {
      readonly kind: "workspace-write"
      readonly artifacts: WorkflowProviderArtifactWriter
    }
  | { readonly kind: "external" }

export interface WorkflowProviderDispatchInput {
  readonly value: JsonValue
  readonly signal: AbortSignal
  readonly idempotency: WorkflowProviderIdempotencyInput
  readonly effect: WorkflowProviderEffectInput
}

export type WorkflowProviderDispatch = (
  input: WorkflowProviderDispatchInput
) => Promise<unknown> | unknown

export interface WorkflowProviderContractInput {
  readonly id: string
  readonly version: string
  readonly inputSchema: WorkflowProviderSchemaEvidence
  readonly output: WorkflowProviderOutputEvidence
  readonly errorSchema: WorkflowProviderSchemaEvidence
  readonly sideEffect: "none" | "workspace-write" | "external"
  readonly idempotency: "idempotent" | "key-required" | "non-idempotent"
  readonly requiredCapabilities: readonly string[]
  readonly dispatch: WorkflowProviderDispatch
}
