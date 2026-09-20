import * as vscode from "vscode"
import {
  BOB_REQUIRED_CAPABILITIES,
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
  extensionVersion?: string
  api?: BoundBobCapabilities
}

export async function loadBobApi(extensionId: string): Promise<LoadedBobApi> {
  const ext = vscode.extensions.getExtension<unknown>(extensionId)
  let activationError = "none"
  if (!ext) return { found: false, active: false, activationError }

  let exportsValue: unknown
  let version: unknown
  let extensionVersion: string | undefined
  try {
    version = (ext.packageJSON as { version?: unknown } | undefined)?.version
    extensionVersion = typeof version === "string" ? version : undefined
    exportsValue = ext.isActive ? ext.exports : await ext.activate()
  } catch (error) {
    activationError = error instanceof Error ? error.message : String(error)
    return { found: true, active: Boolean(ext.isActive), activationError, extensionVersion }
  }

  try {
    const api = bindBobCapabilities({
      extensionId: ext.id,
      extensionVersion: version,
      expectedProfileDigest: BOB_2_0_1_PROFILE_DIGEST,
      requiredCapabilities: BOB_REQUIRED_CAPABILITIES,
      liveExport: exportsValue
    })
    return { found: true, active: Boolean(ext.isActive), activationError, extensionVersion, api }
  } catch (error) {
    activationError = error instanceof Error ? error.message : String(error)
    return { found: true, active: Boolean(ext.isActive), activationError, extensionVersion }
  }
}
