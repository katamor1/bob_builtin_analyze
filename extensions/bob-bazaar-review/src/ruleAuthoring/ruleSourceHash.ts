import { createHash } from "node:crypto"
import * as fs from "node:fs/promises"

export interface SourceFingerprint {
  byteSize: string
  mtimeNs: string
  device: string
  inode: string
  sha256: string
}

const FINGERPRINT_FIELDS: ReadonlyArray<keyof SourceFingerprint> = [
  "byteSize",
  "mtimeNs",
  "device",
  "inode",
  "sha256"
]

export async function fingerprintSource(filePath: string): Promise<SourceFingerprint> {
  const file = await fs.open(filePath, "r")
  try {
    const stats = await file.stat({ bigint: true })
    if (!stats.isFile()) throw new Error(`Rule source must be a regular file: ${filePath}`)

    const hash = createHash("sha256")
    const stream = file.createReadStream({ autoClose: false })
    for await (const chunk of stream) hash.update(chunk)

    return {
      byteSize: stats.size.toString(10),
      mtimeNs: stats.mtimeNs.toString(10),
      device: stats.dev.toString(10),
      inode: stats.ino.toString(10),
      sha256: hash.digest("hex")
    }
  } finally {
    await file.close()
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

function assertCompleteFileIdentity(fingerprint: SourceFingerprint): void {
  for (const field of ["device", "inode"] as const) {
    const value = fingerprint[field]
    if (typeof value !== "string" || !/^\d+$/.test(value)) {
      throw new Error(`Rule source fingerprint ${field} must be a decimal string`)
    }
  }
}
