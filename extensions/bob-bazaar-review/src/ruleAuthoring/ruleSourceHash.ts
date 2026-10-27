import { fingerprintBoundedDocumentFile, assertDocumentNotCancelled, type BoundedDocumentFingerprint } from "../sharedProcessingBudgetRuntime"

export type SourceFingerprint = BoundedDocumentFingerprint

const FINGERPRINT_FIELDS: ReadonlyArray<keyof SourceFingerprint> = [
  "byteSize",
  "mtimeNs",
  "device",
  "inode",
  "sha256"
]

export async function fingerprintSource(filePath: string, options: { maximumBytes: number; rootPath: string; signal?: AbortSignal }): Promise<SourceFingerprint> {
  assertDocumentNotCancelled(options.signal)
  try {
    const result = await fingerprintBoundedDocumentFile({ filePath, rootPath: options.rootPath, maximumFileBytes: options.maximumBytes, signal: options.signal })
    assertDocumentNotCancelled(options.signal)
    return result
  } catch (error) { assertDocumentNotCancelled(options.signal); throw error }
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

function assertCompleteFileIdentity(fingerprint: SourceFingerprint): void {
  for (const field of ["device", "inode"] as const) {
    const value = fingerprint[field]
    if (typeof value !== "string" || !/^\d+$/.test(value)) {
      throw new Error(`Rule source fingerprint ${field} must be a decimal string`)
    }
  }
}
