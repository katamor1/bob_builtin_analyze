#!/usr/bin/env node
"use strict"

const fs = require("node:fs")
const path = require("node:path")

const packageRoot = path.resolve(__dirname, "..")
const sourceDirectory = path.join(packageRoot, "runtime")
const outputDirectory = path.join(packageRoot, "out")
const entries = fs.readdirSync(sourceDirectory, { withFileTypes: true })
if (entries.some((entry) => !entry.isFile() || entry.isSymbolicLink() || !entry.name.endsWith(".js"))) {
  throw new Error("bounded document runtime source must be a flat JavaScript file set")
}
fs.mkdirSync(outputDirectory, { recursive: true })
for (const entry of entries.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)) {
  const source = path.join(sourceDirectory, entry.name)
  const destination = path.join(outputDirectory, entry.name)
  const temporary = `${destination}.${process.pid}.tmp`
  try {
    fs.writeFileSync(temporary, fs.readFileSync(source), { flag: "wx", mode: 0o600 })
    fs.renameSync(temporary, destination)
  } catch (error) {
    try { fs.unlinkSync(temporary) } catch {}
    throw error
  }
}
