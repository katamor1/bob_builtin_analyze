#!/usr/bin/env node
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync, readdirSync } from "node:fs"
import { gunzipSync } from "node:zlib"

const directory = "tools/branch-retirement/bootstrap-patch-chunks"
const chunks = readdirSync(directory).sort()
if (chunks.length !== 2 || chunks.some((name, index) => name !== `part-${String(index).padStart(2, "0")}`)) {
  throw new Error(`unexpected bootstrap patch chunks: ${chunks.join(",")}`)
}
const encoded = chunks.map((name) => readFileSync(`${directory}/${name}`, "utf8")).join("")
const compressed = Buffer.from(encoded, "base64")
const compressedHash = createHash("sha256").update(compressed).digest("hex")
if (compressedHash !== "bb465f93125604849d875dc22cfab1793f3f90dbe5ba2c359755ddda162153de") {
  throw new Error(`bootstrap patch gzip hash mismatch: ${compressedHash}`)
}
const patch = gunzipSync(compressed)
const patchHash = createHash("sha256").update(patch).digest("hex")
if (patchHash !== "fa02b4b486e2149c0bb2c2cf4afbcf8963fea9659969b1409d177d5304c316ed") {
  throw new Error(`bootstrap patch hash mismatch: ${patchHash}`)
}
execFileSync("git", ["apply", "--check", "--whitespace=nowarn", "-"], { input: patch, stdio: ["pipe", "inherit", "inherit"] })
execFileSync("git", ["apply", "--whitespace=nowarn", "-"], { input: patch, stdio: ["pipe", "inherit", "inherit"] })
process.stdout.write(`Applied exact-SHA main-guard patch ${patchHash}.\n`)
