import { TextDecoder } from "node:util"
import { boundedDiagnosticText } from "./diagnosticText"
import type { ContributionOwner } from "./contributionManifest"

export interface ExtensionProductCommand {
  owner: string
  id: string
  package_path: string
}

export interface ExtensionCommandCatalog {
  owner: ContributionOwner
  packagePath: string
  commands: ExtensionProductCommand[]
}

const COMMAND_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/

/** Parse one immutable package.json byte snapshot into contributed VS Code commands. */
export function readExtensionCommandCatalog(
  packagePath: string,
  packageContent: Buffer,
  expectedOwner: ContributionOwner
): ExtensionCommandCatalog {
  const displayedPackagePath = boundedDiagnosticText(packagePath)
  if (!Buffer.isBuffer(packageContent)) {
    throw new Error(`${displayedPackagePath}: package manifest content must be a Buffer`)
  }
  const contentSnapshot = Buffer.from(packageContent)
  const value = parsePackageContent(packagePath, contentSnapshot)
  if (!isPlainDataObject(value)) throw new Error(`${displayedPackagePath}: package manifest must be an object`)

  const publisher = value.publisher
  const name = value.name
  const version = value.version
  if (typeof publisher !== "string" || typeof name !== "string" || typeof version !== "string") {
    throw new Error(`${displayedPackagePath}: package manifest must declare publisher, name, and version`)
  }
  const owner = `${publisher}.${name}`
  if (owner !== expectedOwner.id || version !== expectedOwner.version) {
    throw new Error(
      `${displayedPackagePath}: package owner '${boundedDiagnosticText(owner)}' version '${boundedDiagnosticText(version)}' `
      + `does not match contribution owner '${boundedDiagnosticText(expectedOwner.id)}' version '${boundedDiagnosticText(expectedOwner.version)}'`
    )
  }

  const contributes = value.contributes
  if (contributes !== undefined && !isPlainDataObject(contributes)) {
    throw new Error(`${displayedPackagePath}: package manifest contributes must be an object`)
  }
  const commandValues = contributes?.commands ?? []
  if (!Array.isArray(commandValues)) throw new Error(`${displayedPackagePath}: contributes.commands must be an array`)

  const seen = new Set<string>()
  const commands: ExtensionProductCommand[] = []
  for (const [index, commandValue] of commandValues.entries()) {
    if (!isPlainDataObject(commandValue)) {
      throw new Error(`${displayedPackagePath}: contributes.commands[${index}] must be an object`)
    }
    const id = commandValue.command
    if (typeof id !== "string" || !COMMAND_ID_PATTERN.test(id)) {
      throw new Error(`${displayedPackagePath}: contributes.commands[${index}].command is invalid`)
    }
    if (seen.has(id)) {
      throw new Error(`${displayedPackagePath}: duplicate product command '${boundedDiagnosticText(id)}'`)
    }
    seen.add(id)
    commands.push({ owner, id, package_path: packagePath })
  }

  commands.sort((left, right) => compareText(left.id, right.id))
  return {
    owner: { id: owner, version },
    packagePath,
    commands
  }
}

function parsePackageContent(packagePath: string, content: Buffer): unknown {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(content)
    return JSON.parse(text)
  } catch {
    throw new Error(`${boundedDiagnosticText(packagePath)}: package manifest content must be valid UTF-8 JSON`)
  }
}

function isPlainDataObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
