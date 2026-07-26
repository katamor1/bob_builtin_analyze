import { randomUUID } from "node:crypto"
import * as fs from "node:fs/promises"
import * as path from "node:path"

/**
 * Installs a fully written file with one rename operation and never removes the
 * live destination first. If a platform cannot replace the destination, the
 * operation fails while the previous file remains available.
 */
export async function replaceTextFileAtomically(filePath: string, text: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const temporaryPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`
  )
  let handle: fs.FileHandle | undefined
  try {
    handle = await fs.open(temporaryPath, "wx", 0o600)
    await handle.writeFile(text, { encoding: "utf8" })
    await handle.sync()
    await handle.close()
    handle = undefined
    await fs.rename(temporaryPath, filePath)
  } catch (error) {
    if (handle) {
      try { await handle.close() } catch {}
    }
    try { await fs.rm(temporaryPath, { force: true }) } catch {}
    throw error
  }
}
