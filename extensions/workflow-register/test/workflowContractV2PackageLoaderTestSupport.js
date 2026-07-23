const crypto = require("node:crypto")
const fs = require("node:fs")
const path = require("node:path")

const FIXTURE = JSON.parse(fs.readFileSync(
  path.join(__dirname, "fixtures", "workflow-contract-v2", "packages", "minimal-source", "files.json"),
  "utf8"
))

function digestBytes(bytes) {
  return `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`
}

function canonicalText(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalText).join(",")}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalText(value[key])}`).join(",")}}`
}

function packageDigest(files) {
  const evidence = Object.entries(files)
    .map(([logicalPath, bytes]) => ({ path: logicalPath, digest: digestBytes(bytes) }))
    .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0)
  return digestBytes(Buffer.from(canonicalText({ files: evidence })))
}

function fixtureBytes(overrides = {}) {
  const result = {}
  for (const [logicalPath, text] of Object.entries({ ...FIXTURE, ...overrides })) {
    result[logicalPath] = Buffer.isBuffer(text) ? Buffer.from(text) : Buffer.from(text, "utf8")
  }
  return result
}

function currentPointer(workflowId, digest) {
  return Buffer.from(JSON.stringify({
    schemaVersion: "workflow-package-pointer/v1",
    workflowId,
    generation: digest,
    packageDigest: digest
  }), "utf8")
}

class MemoryPackageFileSystem {
  constructor() {
    this.entries = new Map()
    this.calls = []
    this.hooks = Object.create(null)
    this.rootPrefix = "/collection"
    this.addDirectory([])
  }

  key(segments) {
    return segments.join("/")
  }

  addDirectory(segments, options = {}) {
    this.entries.set(this.key(segments), {
      segments: [...segments],
      kind: options.kind ?? "directory",
      identity: options.identity ?? `dir:${this.key(segments)}:0`,
      version: options.version ?? 0,
      physical: options.physical ?? `${this.rootPrefix}/${this.key(segments)}`
    })
    if (segments.length > 0) this.ensureParents(segments)
  }

  addFile(segments, bytes, options = {}) {
    const buffer = Buffer.from(bytes)
    this.entries.set(this.key(segments), {
      segments: [...segments],
      kind: options.kind ?? "file",
      bytes: buffer,
      size: options.size ?? buffer.length,
      identity: options.identity ?? `file:${this.key(segments)}:${options.version ?? 0}`,
      version: options.version ?? 0,
      physical: options.physical ?? `${this.rootPrefix}/${this.key(segments)}`,
      readThrows: options.readThrows
    })
    this.ensureParents(segments)
  }

  ensureParents(segments) {
    for (let index = 0; index < segments.length; index += 1) {
      const parent = segments.slice(0, index)
      const key = this.key(parent)
      if (!this.entries.has(key)) this.addDirectory(parent)
    }
  }

  remove(segments) {
    this.entries.delete(this.key(segments))
  }

  mutate(segments, bytes) {
    const entry = this.entries.get(this.key(segments))
    if (!entry) throw new Error("missing entry")
    entry.bytes = Buffer.from(bytes)
    entry.size = entry.bytes.length
    entry.version += 1
    entry.identity = `${entry.kind}:${this.key(segments)}:${entry.version}`
  }

  setKind(segments, kind) {
    const entry = this.entries.get(this.key(segments))
    entry.kind = kind
    entry.version += 1
    entry.identity = `${kind}:${this.key(segments)}:${entry.version}`
  }

  async lstat(_root, segments) {
    this.calls.push(["lstat", this.key(segments)])
    this.hooks.beforeLstat?.(segments, this)
    const entry = this.entries.get(this.key(segments))
    if (!entry) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" })
    return Object.freeze({
      kind: entry.kind,
      size: entry.kind === "file" ? entry.size : 0,
      identity: entry.identity
    })
  }

  async readDirectory(_root, segments) {
    this.calls.push(["readDirectory", this.key(segments)])
    this.hooks.beforeReadDirectory?.(segments, this)
    const entry = this.entries.get(this.key(segments))
    if (!entry || entry.kind !== "directory") throw new Error("not directory")
    const names = new Set()
    for (const child of this.entries.values()) {
      if (child.segments.length !== segments.length + 1) continue
      let matches = true
      for (let index = 0; index < segments.length; index += 1) {
        if (child.segments[index] !== segments[index]) {
          matches = false
          break
        }
      }
      if (matches) names.add(child.segments[segments.length])
    }
    return [...names]
  }

  async readFile(_root, segments) {
    this.calls.push(["readFile", this.key(segments)])
    this.hooks.beforeReadFile?.(segments, this)
    const entry = this.entries.get(this.key(segments))
    if (!entry || entry.kind !== "file") throw new Error("not file")
    if (entry.readThrows) throw entry.readThrows
    const bytes = Buffer.from(entry.bytes)
    this.hooks.afterReadFile?.(segments, this)
    return bytes
  }

  async realpath(_root, segments) {
    this.calls.push(["realpath", this.key(segments)])
    const entry = this.entries.get(this.key(segments))
    if (!entry) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" })
    return entry.physical
  }

  isWithin(rootPhysical, candidatePhysical) {
    return candidatePhysical === rootPhysical || candidatePhysical.startsWith(`${rootPhysical}/`)
  }
}

function installPublished(fsAdapter, workflowId = "minimal", files = fixtureBytes()) {
  const digest = packageDigest(files)
  const base = [workflowId, "versions", digest]
  fsAdapter.addDirectory([workflowId])
  fsAdapter.addDirectory([workflowId, "versions"])
  fsAdapter.addDirectory(base)
  for (const [logicalPath, bytes] of Object.entries(files)) {
    fsAdapter.addFile([...base, ...logicalPath.split("/")], bytes)
  }
  fsAdapter.addFile([workflowId, "current.json"], currentPointer(workflowId, digest))
  return { base, digest, files }
}

function installStaging(fsAdapter, workflowId = "minimal", name = ".staging-abc123", token = "owner-token", files = fixtureBytes()) {
  const base = [workflowId, "versions", name]
  fsAdapter.addDirectory([workflowId])
  fsAdapter.addDirectory([workflowId, "versions"])
  fsAdapter.addDirectory(base)
  fsAdapter.addFile([...base, "owner.json"], Buffer.from(JSON.stringify({
    schemaVersion: "workflow-package-staging-owner/v1",
    ownershipToken: token
  })))
  fsAdapter.addDirectory([...base, "package"])
  for (const [logicalPath, bytes] of Object.entries(files)) {
    fsAdapter.addFile([...base, "package", ...logicalPath.split("/")], bytes)
  }
  return { base, digest: packageDigest(files), files, name, token }
}

function subject() {
  return require("../out/core/contractV2/packageLoader.js")
}

function rootSubject() {
  return require("../out/core/contractV2/packageRoot.js")
}

module.exports = {
  MemoryPackageFileSystem,
  currentPointer,
  fixtureBytes,
  installPublished,
  installStaging,
  packageDigest,
  rootSubject,
  subject
}
