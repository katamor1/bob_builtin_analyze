#!/usr/bin/env node
"use strict"

const fs = require("node:fs")
const path = require("node:path")

const packageRoot = path.resolve(__dirname, "..")
const sourceDirectory = path.join(packageRoot, "out")
const argument = process.argv[2]
if (typeof argument !== "string" || argument.length === 0) {
  throw new Error("copy-extension-runtime requires an output directory")
}

const callerRoot = fs.realpathSync(process.cwd())
const destination = path.resolve(callerRoot, argument)
const relative = path.relative(callerRoot, destination)
if (
  relative === "" ||
  relative === ".." ||
  relative.startsWith(`..${path.sep}`) ||
  path.isAbsolute(relative) ||
  relative.split(path.sep)[0] !== "out" ||
  path.basename(destination) !== "shared-processing-budget-runtime"
) {
  throw new Error("extension runtime destination must be out/shared-processing-budget-runtime")
}

const allowed = /(?:\.js|\.js\.map|\.d\.ts)$/
const entries = fs.readdirSync(sourceDirectory, { withFileTypes: true })
if (entries.some((entry) => entry.isSymbolicLink() || !entry.isFile())) {
  throw new Error("compiled shared runtime must be a flat regular-file set")
}
const files = entries.filter((entry) => allowed.test(entry.name))
if (!files.some((entry) => entry.name === "index.js") || !files.some((entry) => entry.name === "bounded-document-runtime.js")) {
  throw new Error("compiled shared runtime is incomplete")
}

fs.rmSync(destination, { recursive: true, force: true })
fs.mkdirSync(destination, { recursive: true })
for (const entry of files.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)) {
  fs.copyFileSync(path.join(sourceDirectory, entry.name), path.join(destination, entry.name), fs.constants.COPYFILE_EXCL)
}
