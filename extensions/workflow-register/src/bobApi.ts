import * as vscode from "vscode"
import {
  BOB_2_0_1_PROFILE_DIGEST,
  bindBobCapabilities,
  type BoundBobCapabilities,
  type BoundBobSource
} from "./core/contractV2/bobProfile"

export type BobWorkflowApi = BoundBobCapabilities
export type BobSourceLike = BoundBobSource

export interface LoadedBobApi {
  found: boolean
  active: boolean
  activationError: string
  api?: BoundBobCapabilities
}

export async function loadBobApi(extensionId: string): Promise<LoadedBobApi> {
  const ext = vscode.extensions.getExtension<unknown>(extensionId)
  let activationError = "none"
  if (!ext) return { found: false, active: false, activationError }

  let exportsValue: unknown
  try {
    exportsValue = ext.isActive ? ext.exports : await ext.activate()
  } catch (error) {
    activationError = error instanceof Error ? error.message : String(error)
    return { found: true, active: Boolean(ext.isActive), activationError }
  }

  try {
    const packageJson = ext.packageJSON as { version?: unknown } | undefined
    const api = bindBobCapabilities({
      extensionId: ext.id,
      extensionVersion: packageJson?.version,
      expectedProfileDigest: BOB_2_0_1_PROFILE_DIGEST,
      liveExport: exportsValue
    })
    return { found: true, active: Boolean(ext.isActive), activationError, api }
  } catch (error) {
    activationError = error instanceof Error ? error.message : String(error)
    return { found: true, active: Boolean(ext.isActive), activationError }
  }
}
