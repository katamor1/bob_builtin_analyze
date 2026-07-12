import { regenerateHumanTriageWorkspace } from "./humanTriageWorkspace"
import type { HumanTriageResult } from "./triageTypes"

export type { HumanTriageResult } from "./triageTypes"

export async function generateHumanTriage(input: {
  workspaceRoot: string
  packageDir: string
  bobOutputPath: string
  outDir: string
}): Promise<HumanTriageResult> {
  return regenerateHumanTriageWorkspace(input)
}
