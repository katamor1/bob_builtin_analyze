import { createHash } from "node:crypto"
import * as path from "node:path"
import {
  ProcessingBudgetLedger,
  readBoundedDocumentFile,
  type SharedProcessingBudgetLedger
} from "../sharedProcessingBudgetRuntime"
import { DEFAULT_RULE_AUTHORING_LIMITS } from "./ruleAuthoringLimits"

export interface SourceFingerprint {
  byteSize: string
  mtimeNs: string
  device: string
  inode: string
  sha256: string
}

export interface SourceFingerprintOptions {
  maximumBytes?: number
  rootPath?: string
  target?: string
  ledger?: SharedProcessingBudgetLedger
}

const FINGERPRINT_FIELDS: ReadonlyArray<keyof SourceFingerprint> = [
  "byteSize",
  "mtimeNs",
  "device",
  "inode",
  "sha256"
]

export async function fingerprintSource(
  filePath: string,
  options: SourceFingerprintOptions = {}
): Promise<SourceFingerprint> {
  const maximumBytes = boundedMaximumBytes(options.maximumBytes)
  const absolutePath = path.resolve(filePath)
  const ledger = options.ledger ?? new ProcessingBudgetLedger({
    limits: {
      single_document_bytes: maximumBytes,
      total_document_bytes: maximumBytes,
      total_operation_input_bytes: maximumBytes
    }
  })
  const snapshot = await readBoundedDocumentFile({
    filePath: absolutePath,
    rootPath: options.rootPath ?? path.dirname(absolutePath),
    target: options.target ?? sourceTarget(absolutePath),
    ledger,
    maximumFileBytes: maximumBytes
  })

  return {
    byteSize: String(snapshot.byteLength),
    mtimeNs: snapshot.identity.modified_ns,
    device: snapshot.identity.device,
    inode: snapshot.identity.inode,
    sha256: snapshot.sha256
  }
}

export function assertStableSourceFingerprint(before: SourceFingerprint, after: SourceFingerprint): void {
  assertCompleteFileIdentity(before)
  assertCompleteFileIdentity(after)

  for (const field of FINGERPRINT_FIELDS) {
    if (before[field] !== after[field]) {
      throw new Error(`Rule source changed during extraction: fingerprint field ${field} differs`)
    }
  }
}

function boundedMaximumBytes(value: number | undefined): number {
  if (value === undefined) return DEFAULT_RULE_AUTHORING_LIMITS.maxSourceBytes
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Rule source byte limit must be a positive safe integer")
  return Math.min(value, DEFAULT_RULE_AUTHORING_LIMITS.maxSourceBytes)
}

function sourceTarget(absolutePath: string): string {
  return `rule-source:${createHash("sha256").update(absolutePath, "utf8").digest("hex").slice(0, 24)}`
}

function assertCompleteFileIdentity(fingerprint: SourceFingerprint): void {
  for (const field of ["device", "inode"] as const) {
    const value = fingerprint[field]
    if (typeof value !== "string" || !/^\d+$/.test(value)) {
      throw new Error(`Rule source fingerprint ${field} must be a decimal string`)
    }
  }
}
