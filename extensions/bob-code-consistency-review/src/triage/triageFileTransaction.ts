import * as fs from "node:fs/promises"
import * as path from "node:path"
import { randomUUID } from "node:crypto"
import YAML from "yaml"

export interface TriageFileTransactionResult {
  backups: Record<string, string>
}

export async function replaceTriageFilesAtomically(
  outDir: string,
  files: Record<string, string>,
  now = new Date()
): Promise<TriageFileTransactionResult> {
  const entries = Object.entries(files)
  if (entries.length === 0) return { backups: {} }
  for (const [fileName] of entries) assertSafeFileName(fileName)

  await fs.mkdir(outDir, { recursive: true })
  const token = randomUUID()
  const stagingDir = path.join(outDir, `.triage-stage-${token}`)
  const backupSuffix = `${timestamp(now)}-${token.slice(0, 8)}`
  const backups: Record<string, string> = {}
  const installed: string[] = []
  await fs.mkdir(stagingDir, { recursive: false })

  try {
    for (const [fileName, text] of entries) {
      const stagedPath = path.join(stagingDir, fileName)
      await fs.writeFile(stagedPath, text, "utf8")
      if (/\.ya?ml$/i.test(fileName)) YAML.parse(text)
    }

    for (const [fileName] of entries) {
      const targetPath = path.join(outDir, fileName)
      if (!(await fileExists(targetPath))) continue
      const backupPath = path.join(outDir, `${fileName}.bak-${backupSuffix}`)
      await fs.rename(targetPath, backupPath)
      backups[fileName] = backupPath
    }

    for (const [fileName] of entries) {
      await fs.rename(path.join(stagingDir, fileName), path.join(outDir, fileName))
      installed.push(fileName)
    }
    return { backups }
  } catch (error) {
    for (const fileName of installed.reverse()) {
      await fs.rm(path.join(outDir, fileName), { force: true }).catch(() => undefined)
    }
    for (const [fileName, backupPath] of Object.entries(backups)) {
      if (await fileExists(backupPath)) {
        await fs.rename(backupPath, path.join(outDir, fileName)).catch(() => undefined)
      }
    }
    throw error
  } finally {
    await fs.rm(stagingDir, { recursive: true, force: true }).catch(() => undefined)
  }
}

function assertSafeFileName(fileName: string): void {
  if (!fileName || path.basename(fileName) !== fileName || fileName === "." || fileName === "..") {
    throw new Error(`Invalid triage transaction file name: ${fileName}`)
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

function timestamp(value: Date): string {
  return value.toISOString().replace(/[:.]/g, "-")
}
