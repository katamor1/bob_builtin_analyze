import { randomUUID } from "node:crypto"
import * as fs from "node:fs/promises"
import * as path from "node:path"

/**
 * Installs a fully written file with one platform rename operation.
 *
 * Node's rename maps to the platform replacement primitive. If Windows cannot
 * replace an open destination, the operation fails and the old destination is
 * left intact; this function never unlinks or renames away the live path first.
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
