#!/usr/bin/env node
"use strict"
const fs = require("node:fs")
const path = require("node:path")
const zlib = require("node:zlib")
const crypto = require("node:crypto")
const { compactManifestModule } = require("./lib/compact-manifest-module")
const COMPACT_MODULES = new Set([
  "extension/out/core/contractV2/compiledPlanManifest.js",
  "extension/out/core/contractV2/index.js",
  "extension/out/core/actionRegistry.js",
  "extension/out/core/contractV2/compilerEnvironment.js",
  "extension/out/core/contractV2/runPlanLeaseContext.js",
  "extension/out/core/contractV2/runLeaseExecutionCoordinator.js",
  "extension/out/workflowContractV2LeasedRunStateStore.js",
  "extension/out/core/contractV2/runPlanProvenance.js",
  "extension/out/core/contractV2/runPlanState.js",
  "extension/out/core/runtime/runStateStore.js",
  "extension/out/core/contractV2/providerEnvelopeSnapshot.js",
  "extension/out/core/contractV2/providerAttemptStaging.js",
  "extension/out/core/contractV2/providerInvocation.js",
  "extension/out/core/contractV2/providerRegistry.js",
  "extension/out/core/contractV2/compiledPlan.js",
  "extension/out/core/contractV2/jsonSchemaCatalog.js",
  "extension/out/core/contractV2/jsonSchema.js",
  "extension/out/core/contractV2/jsonValue.js",
  "extension/out/core/contractV2/canonicalJson.js",
  "extension/out/core/contractV2/packageShape.js",
  "extension/out/core/contractV2/predicate.js",
  "extension/out/core/contractV2/diagnostics.js",
  "extension/out/core/contractV2/bobProfile.js",
  "extension/out/core/contractV2/compilerWorkflow.js",
  "extension/out/core/contractV2/packageLoaderInput.js",
  "extension/out/core/contractV2/jsonSchemaRole.js",
  "extension/out/core/contractV2/yamlDocument.js",
  "extension/out/core/contractV2/compiler.js",
  "extension/out/core/contractV2/compilerFiles.js",
  "extension/out/core/contractV2/packageLoaderSnapshot.js",
  "extension/out/core/contractV2/packageFileSystemNode.js",
  "extension/out/core/contractV2/packageLoaderIo.js",
  "extension/out/core/contractV2/workflowLockSnapshotUtilities.js",
  "extension/out/bobStepRuntime.js",
  "extension/out/bobWorkflowRunner.js",
  "extension/out/commands/runRetention.js",
  "extension/out/commands/stepReview.js",
  "extension/out/core/approvalGuardrails.js",
  "extension/out/core/artifacts/artifactManifest.js",
  "extension/out/core/artifacts/taskSnapshotImportPreview.js",
  "extension/out/core/authoring/workflowAuthoringFileTransaction.js",
  "extension/out/core/engine.js",
  "extension/out/core/engine/resultWriters.js",
  "extension/out/core/engine/stepExecutor.js",
  "extension/out/core/heldRunRecovery.js",
  "extension/out/core/mechanicalChecks/config.js",
  "extension/out/core/mechanicalChecks/parser.js",
  "extension/out/core/mechanicalChecks/runner.js",
  "extension/out/core/runDiagnostics.js",
  "extension/out/core/runProvenance.js",
  "extension/out/core/runtime/resultSinkRegistry.js",
  "extension/out/core/runtime/runCleanupLease.js",
  "extension/out/core/runtime/runCleanupTransaction.js",
  "extension/out/core/runtime/runDurabilityPath.js",
  "extension/out/core/runtime/runEventCodecRegistry.js",
  "extension/out/core/runtime/runLock.js",
  "extension/out/core/runtime/runRetentionInventory.js",
  "extension/out/core/runtime/runStateMigrationBackup.js",
  "extension/out/core/runtime/runStatePath.js",
  "extension/out/core/runtime/runStateV2.js",
  "extension/out/core/runtime/workspaceFileTransaction.js",
  "extension/out/core/schema/workflowSchema.js",
  "extension/out/core/snapshots/taskSnapshots.js",
  "extension/out/core/workflowCompiler.js",
  "extension/out/core/workspaceRoots.js",
  "extension/out/gui/operationHubModel.js",
  "extension/out/gui/operationHubProvider.js",
  "extension/out/parse.js",
  "extension/out/reviewTaskRegistry.js",
  "extension/out/template/templateGenerator.js",
  "extension/out/template/templateReadiness.js",
  "extension/out/template/templateStudioModel.js",
  "extension/out/webview/workflowBuilderPanel.js",
  "extension/out/workflowContractV2ProviderLifecycle.js",
  "extension/out/workflowDefinitionLoader.js",
  "extension/out/workflowDiscovery.js",
  "extension/out/workflowRegisterService.js",
  "extension/out/workflowRunCommands.js",
  "extension/out/workflowRuntimeFactory.js"
])
const MAX_ARCHIVE_BYTES = 32 * 1024 * 1024
const MAX_TOTAL_BYTES = 64 * 1024 * 1024
const crcTable = Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  return value >>> 0
})
function crc32(bytes) {
  let value = 0xffffffff
  for (const byte of bytes) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8)
  return (value ^ 0xffffffff) >>> 0
}
function requireZip(condition) { if (!condition) throw new Error("Unsupported or malformed VSIX archive") }
function checkExtra(extra) {
  let index = 0
  while (index < extra.length) {
    requireZip(index + 4 <= extra.length)
    requireZip(extra.readUInt16LE(index) !== 1)
    index += 4 + extra.readUInt16LE(index + 2)
    requireZip(index <= extra.length)
  }
}
function readArchive(bytes) {
  requireZip(bytes.length >= 22 && bytes.length <= MAX_ARCHIVE_BYTES)
  let end = bytes.length - 22
  const minimum = Math.max(0, bytes.length - 65535 - 22)
  while (end >= minimum && (bytes.readUInt32LE(end) !== 0x06054b50 || end + 22 + bytes.readUInt16LE(end + 20) !== bytes.length)) end--
  requireZip(end >= minimum)
  requireZip(bytes.readUInt32LE(end + 4) === 0)
  const count = bytes.readUInt16LE(end + 10), start = bytes.readUInt32LE(end + 16)
  requireZip(count > 0 && count < 10000 && bytes.readUInt16LE(end + 8) === count)
  requireZip(start + bytes.readUInt32LE(end + 12) === end)
  let position = start, total = 0
  const rows = [], ranges = [], names = new Set()
  for (let index = 0; index < count; index++) {
    requireZip(position + 46 <= end && bytes.readUInt32LE(position) === 0x02014b50)
    const flags = bytes.readUInt16LE(position + 8), method = bytes.readUInt16LE(position + 10)
    const packedSize = bytes.readUInt32LE(position + 20), size = bytes.readUInt32LE(position + 24)
    const nameSize = bytes.readUInt16LE(position + 28), extraSize = bytes.readUInt16LE(position + 30), commentSize = bytes.readUInt16LE(position + 32)
    const localOffset = bytes.readUInt32LE(position + 42), headerEnd = position + 46 + nameSize + extraSize + commentSize
    requireZip((flags & ~0x808) === 0 && (method === 0 || method === 8) && packedSize !== 0xffffffff && size !== 0xffffffff)
    requireZip(bytes.readUInt16LE(position + 34) === 0 && localOffset !== 0xffffffff && headerEnd <= end)
    const name = bytes.subarray(position + 46, position + 46 + nameSize)
    requireZip(name.length > 0 && !names.has(name.toString("hex")))
    names.add(name.toString("hex"))
    checkExtra(bytes.subarray(position + 46 + nameSize, position + 46 + nameSize + extraSize))
    requireZip(localOffset + 30 <= start && bytes.readUInt32LE(localOffset) === 0x04034b50)
    requireZip(bytes.readUInt16LE(localOffset + 6) === flags && bytes.readUInt16LE(localOffset + 8) === method)
    const localNameSize = bytes.readUInt16LE(localOffset + 26), localExtraSize = bytes.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + localNameSize + localExtraSize
    requireZip(dataStart + packedSize <= start && bytes.subarray(localOffset + 30, localOffset + 30 + localNameSize).equals(name))
    const localExtra = bytes.subarray(localOffset + 30 + localNameSize, dataStart)
    checkExtra(localExtra)
    total += size
    requireZip(total <= MAX_TOTAL_BYTES)
    const packed = bytes.subarray(dataStart, dataStart + packedSize)
    const raw = method === 8 ? zlib.inflateRawSync(packed, { maxOutputLength: Math.max(1, size) }) : packed
    requireZip(raw.length === size && crc32(raw) === bytes.readUInt32LE(position + 16))
    ranges.push([localOffset, dataStart + packedSize])
    rows.push({ name, raw, localExtra, local: bytes.subarray(localOffset, localOffset + 30), central: bytes.subarray(position, headerEnd) })
    position = headerEnd
  }
  ranges.sort((a, b) => a[0] - b[0])
  for (let index = 1; index < ranges.length; index++) requireZip(ranges[index][0] >= ranges[index - 1][1])
  requireZip(position === end)
  return { rows, end: bytes.subarray(end) }
}
function compress(bytes) {
  const archive = readArchive(bytes), parts = [], directory = [], expected = []
  let offset = 0
  for (const row of archive.rows) {
    const raw = COMPACT_MODULES.has(row.name.toString("utf8")) ? Buffer.from(compactManifestModule(row.raw.toString("utf8")), "utf8") : row.raw
    expected.push(raw)
    const packed = zlib.deflateRawSync(raw, { level: 9 }), checksum = crc32(raw)
    const local = Buffer.from(row.local), central = Buffer.from(row.central)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(local.readUInt16LE(6) & ~8, 6)
    local.writeUInt16LE(8, 8)
    local.writeUInt32LE(checksum, 14)
    local.writeUInt32LE(packed.length, 18)
    local.writeUInt32LE(raw.length, 22)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(central.readUInt16LE(8) & ~8, 8)
    central.writeUInt16LE(8, 10)
    central.writeUInt32LE(checksum, 16)
    central.writeUInt32LE(packed.length, 20)
    central.writeUInt32LE(raw.length, 24)
    central.writeUInt32LE(offset, 42)
    parts.push(local, row.name, row.localExtra, packed)
    directory.push(central)
    offset += local.length + row.name.length + row.localExtra.length + packed.length
  }
  const table = Buffer.concat(directory), end = Buffer.from(archive.end)
  end.writeUInt32LE(table.length, 12)
  end.writeUInt32LE(offset, 16)
  const result = Buffer.concat([...parts, table, end]), checked = readArchive(result)
  requireZip(checked.rows.length === archive.rows.length)
  checked.rows.forEach((row, index) => requireZip(row.name.equals(archive.rows[index].name) && row.raw.equals(expected[index])))
  return result
}
function main() {
  requireZip(process.argv.length === 2)
  const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"))
  requireZip(typeof manifest.name === "string" && /^[a-z0-9][a-z0-9-]*$/.test(manifest.name))
  requireZip(typeof manifest.version === "string" && /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(manifest.version))
  const target = path.join(process.cwd(), manifest.name + "-" + manifest.version + ".vsix")
  const before = fs.readFileSync(target), after = compress(before)
  const temporary = target + "." + crypto.randomUUID() + ".tmp"
  try {
    fs.writeFileSync(temporary, after, { flag: "wx" })
    requireZip(fs.readFileSync(target).equals(before))
    fs.renameSync(temporary, target)
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary) }
  console.log("VSIX compression: " + before.length + " -> " + after.length + " bytes; declared P7/R1/R2 module ASTs and all other entry contents preserved")
}
try { main() } catch (error) { console.error(error.message); process.exitCode = 1 }
