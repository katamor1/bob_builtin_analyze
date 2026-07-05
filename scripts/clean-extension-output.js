#!/usr/bin/env node
"use strict"

const fs = require("node:fs")
const path = require("node:path")

function main() {
  const relativeTarget = process.argv[2]
  if (!relativeTarget) throw new Error("Usage: clean-extension-output.js <relative-output-dir>")
  if (path.isAbsolute(relativeTarget)) throw new Error("Output directory must be workspace-relative")

  const cwd = fs.realpathSync(process.cwd())
  const target = path.resolve(cwd, relativeTarget)
  const parent = path.dirname(target)
  if (parent !== cwd || path.basename(target) !== relativeTarget) {
    throw new Error(`Refusing to clean nested or escaped output directory: ${relativeTarget}`)
  }
  if (!target.startsWith(`${cwd}${path.sep}`)) {
    throw new Error(`Refusing to clean outside current working directory: ${target}`)
  }

  fs.rmSync(target, { recursive: true, force: true })
  console.log(`[clean-extension-output] removed ${path.relative(cwd, target)}`)
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
