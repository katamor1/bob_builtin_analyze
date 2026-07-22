import { createHash } from "node:crypto"

/** Return the lowercase SHA-256 digest for the exact supplied content. */
export function sha256Content(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex")
}
