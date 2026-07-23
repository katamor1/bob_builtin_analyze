import type { JsonValue } from "./jsonValue"
import { freezeEvidence } from "./workflowLockIntrinsics"
import {
  WORKFLOW_COMPILER_POLICY_VERSIONS,
  type LockedFileEvidence,
  type WorkflowCompilerPolicyVersions,
  type WorkflowPackageLock
} from "./workflowLockContract"
import { bytes, digest, identifier, packagePath, record } from "./workflowLockValidation"

export function policy(value: JsonValue): WorkflowCompilerPolicyVersions {
  const item = record(value, Object.keys(WORKFLOW_COMPILER_POLICY_VERSIONS), "Workflow package lock.policyVersions")
  for (const key of Object.keys(WORKFLOW_COMPILER_POLICY_VERSIONS) as (keyof WorkflowCompilerPolicyVersions)[]) {
    if (item[key] !== WORKFLOW_COMPILER_POLICY_VERSIONS[key]) {
      throw new TypeError(`Workflow package lock.policyVersions.${key} is invalid.`)
    }
  }
  return freezeEvidence({ ...WORKFLOW_COMPILER_POLICY_VERSIONS })
}

export function workflow(value: JsonValue): WorkflowPackageLock["workflow"] {
  const item = record(value, ["path", "bytes", "digest"], "Workflow package lock.workflow")
  if (item.path !== "workflow.yaml") throw new TypeError("Workflow package lock.workflow.path is invalid.")
  return freezeEvidence({
    path: "workflow.yaml" as const,
    bytes: bytes(item.bytes, 1_048_576, "Workflow package lock.workflow.bytes"),
    digest: digest(item.digest, "Workflow package lock.workflow.digest")
  })
}

export function files(
  values: readonly JsonValue[],
  kind: "prompt" | "schema",
  label: string
): readonly LockedFileEvidence[] {
  const result: LockedFileEvidence[] = []
  for (let index = 0; index < values.length; index += 1) {
    const entryLabel = `${label}[${index}]`
    const item = record(values[index], ["id", "path", "bytes", "digest"], entryLabel)
    result.push(freezeEvidence({
      id: identifier(item.id, `${entryLabel}.id`),
      path: packagePath(item.path, kind, `${entryLabel}.path`),
      bytes: bytes(item.bytes, 4_194_304, `${entryLabel}.bytes`),
      digest: digest(item.digest, `${entryLabel}.digest`)
    }))
  }
  for (let index = 0; index < result.length; index += 1) {
    for (let prior = 0; prior < index; prior += 1) {
      if (result[prior].id === result[index].id || result[prior].path === result[index].path) {
        throw new TypeError(`${label} contains a duplicate id or path.`)
      }
    }
    if (index > 0) {
      const previous = result[index - 1]
      const current = result[index]
      if (previous.id > current.id || (previous.id === current.id && previous.path >= current.path)) {
        throw new TypeError(`${label} must be sorted by id and path.`)
      }
    }
  }
  return freezeEvidence(result)
}
