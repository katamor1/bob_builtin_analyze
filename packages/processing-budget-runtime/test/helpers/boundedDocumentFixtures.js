"use strict"

const assert = require("node:assert/strict")
const { deflateRawSync } = require("node:zlib")

class FakeLedger {
  constructor({ perTarget = Number.MAX_SAFE_INTEGER, total = Number.MAX_SAFE_INTEGER } = {}) {
    this.perTarget = perTarget
    this.total = total
    this.targets = new Map()
    this.committed = 0
    this.reserved = 0
    this.events = []
  }

  reserveForTarget(category, target, amount) {
    assert.equal(category, "single_document_bytes")
    const state = this.targets.get(target) ?? { committed: 0, reserved: 0 }
    if (amount > this.perTarget - state.committed - state.reserved || amount > this.total - this.committed - this.reserved) {
      const error = new Error("processing budget exceeded")
      error.code = "processing_budget_exceeded"
      throw error
    }
    state.reserved += amount
    this.targets.set(target, state)
    this.reserved += amount
    this.events.push(["reserve", target, amount])
    let open = true
    return Object.freeze({
      category,
      target,
      amount,
      commit: (actual = amount) => {
        assert.equal(open, true)
        assert.ok(Number.isSafeInteger(actual) && actual >= 0 && actual <= amount)
        state.reserved -= amount
        state.committed += actual
        this.reserved -= amount
        this.committed += actual
        open = false
        this.events.push(["commit", target, actual])
      },
      release: () => {
        assert.equal(open, true)
        state.reserved -= amount
        this.reserved -= amount
        open = false
        this.events.push(["release", target, amount])
      }
    })
  }
}

function entry(name, content, method = 8, overrides = {}) {
  return { name, content: Buffer.from(content), method, ...overrides }
}

function buildZip(entries, crc32) {
  const localParts = []
  const centralParts = []
  let localOffset = 0
  for (const item of entries) {
    const name = Buffer.from(item.name, "utf8")
    const content = Buffer.from(item.content)
    let compressed = item.method === 0 ? Buffer.from(content) : deflateRawSync(content)
    if (item.truncateCompressedBytes) compressed = compressed.subarray(0, Math.max(0, compressed.length - item.truncateCompressedBytes))
    const declaredCompressed = item.declaredCompressedSize ?? compressed.length
    const declaredExpanded = item.declaredUncompressedSize ?? content.length
    const checksum = item.crc32 ?? crc32(content)
    const flags = item.flags ?? 0x0800
    const extra = Buffer.from(item.extra ?? [])

    const local = Buffer.alloc(30 + name.length + extra.length)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(flags, 6)
    local.writeUInt16LE(item.method, 8)
    local.writeUInt32LE(checksum >>> 0, 14)
    local.writeUInt32LE(declaredCompressed, 18)
    local.writeUInt32LE(declaredExpanded, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(extra.length, 28)
    name.copy(local, 30)
    extra.copy(local, 30 + name.length)
    localParts.push(local, compressed)

    const central = Buffer.alloc(46 + name.length + extra.length)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(flags, 8)
    central.writeUInt16LE(item.method, 10)
    central.writeUInt32LE(checksum >>> 0, 16)
    central.writeUInt32LE(declaredCompressed, 20)
    central.writeUInt32LE(declaredExpanded, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt16LE(extra.length, 30)
    central.writeUInt32LE(localOffset, 42)
    name.copy(central, 46)
    extra.copy(central, 46 + name.length)
    centralParts.push(central)
    localOffset += local.length + compressed.length
  }

  const directory = Buffer.concat(centralParts)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(localOffset, 16)
  return Buffer.concat([...localParts, directory, end])
}

module.exports = { FakeLedger, buildZip, entry }
