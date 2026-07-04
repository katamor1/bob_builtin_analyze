import { randomUUID } from "node:crypto"
import * as fs from "node:fs/promises"
import * as path from "node:path"

export interface TemplateRefreshResult {
  refreshed: boolean
  backupPath?: string
}

export async function refreshTemplateFile(source: string, target: string): Promise<TemplateRefreshResult> {
  const sourceContent = await fs.readFile(source)
  await fs.mkdir(path.dirname(target), { recursive: true })

  if (await exists(target)) {
    const targetContent = await fs.readFile(target)
    if (sourceContent.equals(targetContent)) {
      return { refreshed: false }
    }
    const backupPath = await nextBackupPath(target)
    await fs.copyFile(target, backupPath)
    await fs.writeFile(target, sourceContent)
    return { refreshed: true, backupPath }
  }

  await fs.writeFile(target, sourceContent)
  return { refreshed: true }
}

async function nextBackupPath(filePath: string): Promise<string> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  for (let index = 0; index < 1000; index += 1) {
    const suffix = index === 0 ? "" : `-${index}`
    const candidate = `${filePath}.bak-${stamp}-${randomUUID()}${suffix}`
    if (!(await exists(candidate))) return candidate
  }
  throw new Error(`Unable to allocate backup path for ${filePath}`)
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}
