import { withBoundedDocumentSnapshot } from "./boundedDocumentFile"
import { documentLedger, fileMaximum, ownData, type BoundedDocumentFingerprint, type BoundedDocumentIdentity, type BoundedDocumentReadInput } from "./boundedDocumentRequest"

export type { BoundedDocumentFingerprint, BoundedDocumentIdentity, BoundedDocumentReadInput } from "./boundedDocumentRequest"
export interface BoundedDocumentSnapshot {
  readonly byteLength: number
  readonly sha256: string
  readonly identity: BoundedDocumentIdentity
  copyBytes(): Buffer
}

export async function readBoundedDocumentFile(input: BoundedDocumentReadInput): Promise<BoundedDocumentSnapshot> {
  return withBoundedDocumentSnapshot(input, async ({ bytes, fingerprint }) => {
    const owned = Buffer.from(bytes)
    const { sha256, ...identity } = fingerprint
    return Object.freeze({ byteLength: bytes.length, sha256, identity: Object.freeze(identity), copyBytes: () => Buffer.from(owned) })
  })
}

export async function fingerprintBoundedDocumentFile(input: { filePath: string, rootPath: string, maximumFileBytes: number, signal?: AbortSignal }): Promise<BoundedDocumentFingerprint> {
  const data = ownData(input, ["filePath", "rootPath", "maximumFileBytes"], ["signal"])
  const maximumFileBytes = fileMaximum(data.maximumFileBytes)
  // No path coercion or filesystem access precedes the shared owner's closed request validation.
  const request = { filePath: data.filePath, rootPath: data.rootPath, maximumFileBytes, signal: data.signal, ledger: documentLedger(maximumFileBytes), target: "fingerprint" } as BoundedDocumentReadInput
  return withBoundedDocumentSnapshot(request, async ({ fingerprint }) => Object.freeze({ ...fingerprint }))
}
