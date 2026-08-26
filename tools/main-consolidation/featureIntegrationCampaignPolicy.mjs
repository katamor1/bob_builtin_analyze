import { createHash } from 'node:crypto'

// Phase 2A validates closed JSON types and their intrinsic identity relationships.
// It does not authenticate filesystem observations, approve execution, validate
// attachment payloads, or validate campaign history. Those are separate boundaries.
const S = 'bob-builtin-analyze/'
const MAX_RECORD_BYTES = 1048576
const MAX_PLAN_BYTES = 16777216
const REPOSITORY = 'katamor1/bob_builtin_analyze'
const INDEX_PATH = 'tools/main-consolidation/feature-integration-program-index.json'
const PLAN_PATH = 'docs/superpowers/plans/2026-08-23-feature-integration-program-index-and-wave-0a.md'
const POLICY_PATH = 'tools/main-consolidation/wave0a-first-root-install-policy.json'
const DEADLINE_FENCE = 'native_checked_immediately_before_publish_with_lifecycle_expiry'
const OPERATIONS = Object.freeze(['publish-branch', 'create-pull-request', 'close-pull-request-abort', 'delete-remote-branch-abort', 'prepare-merge-commit', 'integrate-main-exact-lease', 'fetch-after-integration', 'dispatch-extensions-quality', 'dispatch-workflow-contracts', 'dispatch-code-consistency-review-scaffold', 'dispatch-three-extension-ui-contracts', 'cleanup-generated-paths', 'fast-forward-root', 'remove-feature-worktree', 'delete-local-branch'])
const FIRST_POLICY = Object.freeze({ schemaVersion: 'first-root-install-policy/v1', destinationAbsentRequired: true, sameVolumeAtomicRenameRequired: true, noReplaceRequired: true, completeReadyRootRequired: true, noFollowRequired: true, reparsePointFreeRequired: true, maxPlanBytes: 16777216, maxEntries: 16384, maxDepth: 256, maxAggregateRelativePathUtf8Bytes: 67108864, maxFileBytes: 1073741824, maxTotalBytes: 17179869184, maxChunks: 16, maxActionsPerChunk: 1024, maxProgressRecords: 18 })
const fail = message => { throw new TypeError(message) }
const requireThat = (condition, message) => { if (!condition) fail(message) }
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const validUnicode = value => typeof value === 'string' && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)
const codePointCompare = (left, right) => {
  const a = Array.from(left, character => character.codePointAt(0)), b = Array.from(right, character => character.codePointAt(0))
  for (let index = 0; index < Math.min(a.length, b.length); index++) if (a[index] !== b[index]) return a[index] - b[index]
  return a.length - b.length
}
function renderJson(value, normalize = true) {
  const ancestors = new Set()
  function render(current) {
    if (current === null) return 'null'
    if (typeof current === 'boolean') return String(current)
    if (typeof current === 'string') { requireThat(validUnicode(current), 'invalid Unicode'); return JSON.stringify(normalize ? current.normalize('NFC') : current) }
    if (typeof current === 'number') { requireThat(Number.isSafeInteger(current), 'noncanonical number'); if (!normalize) requireThat(!Object.is(current, -0), 'negative zero'); return String(current) }
    requireThat(typeof current === 'object', 'unsupported JSON value')
    requireThat(!ancestors.has(current), 'cyclic JSON value')
    const keys = Reflect.ownKeys(current)
    requireThat(keys.every(key => typeof key === 'string'), 'symbol property')
    ancestors.add(current)
    try {
      if (Array.isArray(current)) {
        requireThat(Object.getPrototypeOf(current) === Array.prototype, 'noncanonical array prototype')
        requireThat(keys.length === current.length + 1, 'sparse or extended array')
        const parts = []
        for (let index = 0; index < current.length; index++) { const descriptor = Object.getOwnPropertyDescriptor(current, String(index)); requireThat(descriptor && descriptor.enumerable && Object.hasOwn(descriptor, 'value'), 'sparse/accessor array'); parts.push(render(descriptor.value)) }
        return `[${parts.join(',')}]`
      }
      requireThat(Object.getPrototypeOf(current) === Object.prototype || Object.getPrototypeOf(current) === null, 'non-plain JSON object')
      const entries = keys.map(key => {
        requireThat(validUnicode(key), 'invalid key Unicode')
        const descriptor = Object.getOwnPropertyDescriptor(current, key)
        requireThat(descriptor.enumerable && Object.hasOwn(descriptor, 'value'), 'accessor or hidden property')
        return [normalize ? key.normalize('NFC') : key, descriptor.value]
      })
      requireThat(new Set(entries.map(([key]) => key)).size === entries.length, 'duplicate normalized key')
      entries.sort(([a], [b]) => normalize ? codePointCompare(a, b) : a < b ? -1 : a > b ? 1 : 0)
      return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${render(child)}`).join(',')}}`
    } finally { ancestors.delete(current) }
  }
  return render(value)
}
function canonicalBytes(value, cap) { const result = Buffer.from(`${renderJson(value)}\n`, 'utf8'); requireThat(result.length <= cap, 'canonical serialized byte cap'); return result }
export function canonicalJson(value) { return canonicalBytes(value, MAX_RECORD_BYTES) }
export function parseCanonicalJson(input) {
  requireThat(Buffer.isBuffer(input) || input instanceof Uint8Array, 'canonical JSON requires bytes')
  requireThat(input.byteLength > 0 && input.byteLength <= MAX_RECORD_BYTES, 'canonical serialized byte cap')
  let text, value
  try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(input); value = JSON.parse(text) } catch { fail('invalid UTF-8 JSON') }
  requireThat(canonicalJson(value).equals(Buffer.from(input)), 'noncanonical JSON bytes')
  return value
}
export function normalizeApprovalMessage(input) {
  requireThat(Buffer.isBuffer(input) || input instanceof Uint8Array, 'message requires UTF-8 bytes')
  let text
  try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(input) } catch { fail('invalid message UTF-8') }
  return text.normalize('NFC').replace(/\r\n?|\n/gu, '\n')
}
const equal = (a, b) => renderJson(a) === renderJson(b)
const same = (a, b, label) => requireThat(equal(a, b), `${label} identity mismatch`)
const hash = value => digest(canonicalBytes(value, MAX_PLAN_BYTES))
const registry = new Map()
const literal = expected => value => requireThat(value === expected, `expected literal ${String(expected)}`)
const enumeration = values => value => requireThat(values.includes(value), 'unknown discriminator')
const nullable = type => value => { if (value !== null) check(type, value) }
const array = (type, min = 0, max = 8192) => value => { requireThat(Array.isArray(value) && value.length >= min && value.length <= max, 'array cardinality'); value.forEach(member => check(type, member)) }
const tuple = types => value => { requireThat(Array.isArray(value) && value.length === types.length, 'tuple cardinality'); types.forEach((type, index) => check(type, value[index])) }
function shape(fields, semantic = () => {}) {
  return value => {
    requireThat(value !== null && typeof value === 'object' && !Array.isArray(value), 'expected closed record')
    const keys = Object.keys(value), expected = Object.keys(fields)
    requireThat(keys.length === expected.length && expected.every(key => Object.hasOwn(value, key)), 'closed record keys')
    for (const [key, type] of Object.entries(fields)) check(type, value[key])
    semantic(value)
  }
}
function check(type, value) { const validator = typeof type === 'function' ? type : registry.get(type); requireThat(typeof validator === 'function', `unknown primitive type ${String(type)}`); validator(value) }
const define = (name, fields, semantic) => registry.set(name, shape(fields, semantic))
const defineValue = (name, validator) => registry.set(name, validator)
const pattern = expression => value => requireThat(typeof value === 'string' && expression.test(value), 'invalid string grammar')
const integer = (min, max = Number.MAX_SAFE_INTEGER) => value => requireThat(Number.isSafeInteger(value) && !Object.is(value, -0) && value >= min && value <= max, 'integer bounds')
const boundedText = (min, max, controls = true) => value => { requireThat(validUnicode(value) && value === value.normalize('NFC') && Buffer.byteLength(value) >= min && Buffer.byteLength(value) <= max && (!controls || !/[\x00-\x1f\x7f-\x9f]/u.test(value)), 'bounded NFC string') }
defineValue('LowercaseSha', pattern(/^[0-9a-f]{40}$/u))
defineValue('LowercaseSha256', pattern(/^[0-9a-f]{64}$/u))
defineValue('DecimalString', pattern(/^(0|[1-9][0-9]*)$/u))
for (const [name, min, max] of [['PositiveSafeInteger', 1], ['NonnegativeSafeInteger', 0], ['SignedInt32', -2147483648, 2147483647], ['OperationClaimOrdinal', 1, 128], ['RootFastForwardProgressOrdinal', 1, 18], ['WorktreeProgressOrdinal', 1, 16], ['HandoffIndexSequence', 2, 5759]]) defineValue(name, integer(min, max))
defineValue('NonzeroSignedInt32', value => { check('SignedInt32', value); requireThat(value !== 0, 'nonzero exit required') })
defineValue('Boolean', value => requireThat(typeof value === 'boolean', 'expected Boolean'))
function utc(value, second = false) { pattern(second ? /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u)(value); const time = Date.parse(value); requireThat(Number.isFinite(time) && new Date(time).toISOString() === (second ? value.replace('Z', '.000Z') : value), 'invalid UTC calendar time') }
defineValue('CanonicalUtc', value => utc(value))
defineValue('CanonicalUtcSecond', value => utc(value, true))
defineValue('CanonicalGitTimestamp', pattern(/^[1-9][0-9]* \+0000$/u))
defineValue('CanonicalGuid', pattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u))
defineValue('SafeId', pattern(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u))
defineValue('SafeLeaf', value => { check('SafeId', value); requireThat(value !== '.' && value !== '..', 'unsafe leaf') })
defineValue('SafeAttemptId', value => { pattern(/^wave-[a-z0-9]{1,97}-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}$/u)(value); requireThat(value.length >= 32 && value.length <= 128, 'attempt length') })
for (const name of ['SafeTransactionId', 'SafeRecoveryId', 'SafeDispatchNonce']) defineValue(name, pattern(/^[0-9a-f]{32}$/u))
defineValue('SafeLabel', pattern(/^[a-z0-9][a-z0-9-]{0,63}$/u))
defineValue('SafeReasonCode', pattern(/^[a-z0-9][a-z0-9_]{0,63}$/u))
defineValue('BoundedString', boundedText(1, 1024))
defineValue('SafeWindowsLeafName', value => {
  boundedText(1, 4096)(value)
  requireThat(!/[\\/:<>"|?*]/u.test(value) && value !== '.' && value !== '..' && !/[. ]$/u.test(value) && !/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/iu.test(value), 'unsafe Windows leaf')
})
defineValue('SafeRepositoryPath', value => { boundedText(1, 4096)(value); requireThat(!/[\\:]/u.test(value) && value.split('/').every(part => part && part !== '.' && part !== '..'), 'unsafe relative path') })
defineValue('SafeRelativePath', value => check('SafeRepositoryPath', value))
defineValue('SafeBranch', value => { requireThat(typeof value === 'string' && /^[\x21-\x7e]{1,200}$/u.test(value) && value !== 'main' && value !== '@' && !value.startsWith('-') && !/[~^:?*\[\\]/u.test(value) && !value.includes('..') && !value.includes('@{') && !value.endsWith('.') && value.split('/').every(part => part && !part.startsWith('.') && !part.endsWith('.lock')), 'unsafe branch') })
function pathKey(path) {
  let result = path.replaceAll('\\', '/')
  if (result.startsWith('//?/UNC/')) result = '//' + result.slice(8)
  else if (result.startsWith('//?/')) result = result.slice(4)
  if (/^[A-Za-z]:\//u.test(result)) result = result[0].toUpperCase() + result.slice(1)
  return result
}
defineValue('AbsolutePath', value => {
  boundedText(1, 4096)(value)
  const normalized = pathKey(value)
  requireThat(/^[A-Z]:\//u.test(normalized) || /^\/\/[^/]+\/[^/]+/u.test(normalized) || normalized.startsWith('/') && !normalized.startsWith('//'), 'path is not absolute')
  const rest = /^[A-Z]:\//u.test(normalized) ? normalized.slice(3) : normalized.startsWith('//') ? normalized.slice(2) : normalized.slice(1)
  requireThat(!rest.includes(':') && (rest === '' || rest.split('/').every(part => part && part !== '.' && part !== '..')), 'noncanonical absolute path')
})
// Simple ordinal casing, captured from the approved native comparison profile:
// PowerShell 7.6.5 / .NET 10.0.11 / Windows ICU 72.1.0.4, non-invariant/non-NLS.
// Each row is [first, last, stride, uppercaseDelta]; unmapped scalars stay exact.
// This is deliberately independent of Node's newer/full Unicode casing tables.
// The BMP ICU and supplementary CharUnicodeInfo ordinal oracle yielded 1,470
// mappings, compressed into 199 ranges (not Rune.ToUpperInvariant's table).
// SHA256(JSON.stringify(expandedMappings)+'\n'):
// 805259bc026d435543160be1a5602ef9c3d83ca5b2ccee16d8a861e67e16d391
// A later native gate must establish host-profile parity before execution;
// this fixed map does not claim equivalence to every future .NET/ICU version.
const ORDINAL_UPPER_RANGES = Object.freeze([
  [0x61,0x7a,0x1,-0x20], [0xb5,0xb5,0x1,0x2e7], [0xe0,0xf6,0x1,-0x20], [0xf8,0xfe,0x1,-0x20],
  [0xff,0xff,0x1,0x79], [0x101,0x12f,0x2,-0x1], [0x133,0x137,0x2,-0x1], [0x13a,0x148,0x2,-0x1],
  [0x14b,0x177,0x2,-0x1], [0x17a,0x17e,0x2,-0x1], [0x180,0x180,0x1,0xc3], [0x183,0x185,0x2,-0x1],
  [0x188,0x188,0x1,-0x1], [0x18c,0x18c,0x1,-0x1], [0x192,0x192,0x1,-0x1], [0x195,0x195,0x1,0x61],
  [0x199,0x199,0x1,-0x1], [0x19a,0x19a,0x1,0xa3], [0x19e,0x19e,0x1,0x82], [0x1a1,0x1a5,0x2,-0x1],
  [0x1a8,0x1a8,0x1,-0x1], [0x1ad,0x1ad,0x1,-0x1], [0x1b0,0x1b0,0x1,-0x1], [0x1b4,0x1b6,0x2,-0x1],
  [0x1b9,0x1b9,0x1,-0x1], [0x1bd,0x1bd,0x1,-0x1], [0x1bf,0x1bf,0x1,0x38], [0x1c5,0x1c5,0x1,-0x1],
  [0x1c6,0x1c6,0x1,-0x2], [0x1c8,0x1c8,0x1,-0x1], [0x1c9,0x1c9,0x1,-0x2], [0x1cb,0x1cb,0x1,-0x1],
  [0x1cc,0x1cc,0x1,-0x2], [0x1ce,0x1dc,0x2,-0x1], [0x1dd,0x1dd,0x1,-0x4f], [0x1df,0x1ef,0x2,-0x1],
  [0x1f2,0x1f2,0x1,-0x1], [0x1f3,0x1f3,0x1,-0x2], [0x1f5,0x1f5,0x1,-0x1], [0x1f9,0x21f,0x2,-0x1],
  [0x223,0x233,0x2,-0x1], [0x23c,0x23c,0x1,-0x1], [0x23f,0x240,0x1,0x2a3f], [0x242,0x242,0x1,-0x1],
  [0x247,0x24f,0x2,-0x1], [0x250,0x250,0x1,0x2a1f], [0x251,0x251,0x1,0x2a1c], [0x252,0x252,0x1,0x2a1e],
  [0x253,0x253,0x1,-0xd2], [0x254,0x254,0x1,-0xce], [0x256,0x257,0x1,-0xcd], [0x259,0x259,0x1,-0xca],
  [0x25b,0x25b,0x1,-0xcb], [0x25c,0x25c,0x1,0xa54f], [0x260,0x260,0x1,-0xcd], [0x261,0x261,0x1,0xa54b],
  [0x263,0x263,0x1,-0xcf], [0x265,0x265,0x1,0xa528], [0x266,0x266,0x1,0xa544], [0x268,0x268,0x1,-0xd1],
  [0x269,0x269,0x1,-0xd3], [0x26a,0x26a,0x1,0xa544], [0x26b,0x26b,0x1,0x29f7], [0x26c,0x26c,0x1,0xa541],
  [0x26f,0x26f,0x1,-0xd3], [0x271,0x271,0x1,0x29fd], [0x272,0x272,0x1,-0xd5], [0x275,0x275,0x1,-0xd6],
  [0x27d,0x27d,0x1,0x29e7], [0x280,0x280,0x1,-0xda], [0x282,0x282,0x1,0xa543], [0x283,0x283,0x1,-0xda],
  [0x287,0x287,0x1,0xa52a], [0x288,0x288,0x1,-0xda], [0x289,0x289,0x1,-0x45], [0x28a,0x28b,0x1,-0xd9],
  [0x28c,0x28c,0x1,-0x47], [0x292,0x292,0x1,-0xdb], [0x29d,0x29d,0x1,0xa515], [0x29e,0x29e,0x1,0xa512],
  [0x345,0x345,0x1,0x54], [0x371,0x373,0x2,-0x1], [0x377,0x377,0x1,-0x1], [0x37b,0x37d,0x1,0x82],
  [0x3ac,0x3ac,0x1,-0x26], [0x3ad,0x3af,0x1,-0x25], [0x3b1,0x3c1,0x1,-0x20], [0x3c2,0x3c2,0x1,-0x1f],
  [0x3c3,0x3cb,0x1,-0x20], [0x3cc,0x3cc,0x1,-0x40], [0x3cd,0x3ce,0x1,-0x3f], [0x3d0,0x3d0,0x1,-0x3e],
  [0x3d1,0x3d1,0x1,-0x39], [0x3d5,0x3d5,0x1,-0x2f], [0x3d6,0x3d6,0x1,-0x36], [0x3d7,0x3d7,0x1,-0x8],
  [0x3d9,0x3ef,0x2,-0x1], [0x3f0,0x3f0,0x1,-0x56], [0x3f1,0x3f1,0x1,-0x50], [0x3f2,0x3f2,0x1,0x7],
  [0x3f3,0x3f3,0x1,-0x74], [0x3f5,0x3f5,0x1,-0x60], [0x3f8,0x3f8,0x1,-0x1], [0x3fb,0x3fb,0x1,-0x1],
  [0x430,0x44f,0x1,-0x20], [0x450,0x45f,0x1,-0x50], [0x461,0x481,0x2,-0x1], [0x48b,0x4bf,0x2,-0x1],
  [0x4c2,0x4ce,0x2,-0x1], [0x4cf,0x4cf,0x1,-0xf], [0x4d1,0x52f,0x2,-0x1], [0x561,0x586,0x1,-0x30],
  [0x10d0,0x10fa,0x1,0xbc0], [0x10fd,0x10ff,0x1,0xbc0], [0x13f8,0x13fd,0x1,-0x8], [0x1c80,0x1c80,0x1,-0x186e],
  [0x1c81,0x1c81,0x1,-0x186d], [0x1c82,0x1c82,0x1,-0x1864], [0x1c83,0x1c84,0x1,-0x1862], [0x1c85,0x1c85,0x1,-0x1863],
  [0x1c86,0x1c86,0x1,-0x185c], [0x1c87,0x1c87,0x1,-0x1825], [0x1c88,0x1c88,0x1,0x89c2], [0x1d79,0x1d79,0x1,0x8a04],
  [0x1d7d,0x1d7d,0x1,0xee6], [0x1d8e,0x1d8e,0x1,0x8a38], [0x1e01,0x1e95,0x2,-0x1], [0x1e9b,0x1e9b,0x1,-0x3b],
  [0x1ea1,0x1eff,0x2,-0x1], [0x1f00,0x1f07,0x1,0x8], [0x1f10,0x1f15,0x1,0x8], [0x1f20,0x1f27,0x1,0x8],
  [0x1f30,0x1f37,0x1,0x8], [0x1f40,0x1f45,0x1,0x8], [0x1f51,0x1f57,0x2,0x8], [0x1f60,0x1f67,0x1,0x8],
  [0x1f70,0x1f71,0x1,0x4a], [0x1f72,0x1f75,0x1,0x56], [0x1f76,0x1f77,0x1,0x64], [0x1f78,0x1f79,0x1,0x80],
  [0x1f7a,0x1f7b,0x1,0x70], [0x1f7c,0x1f7d,0x1,0x7e], [0x1f80,0x1f87,0x1,0x8], [0x1f90,0x1f97,0x1,0x8],
  [0x1fa0,0x1fa7,0x1,0x8], [0x1fb0,0x1fb1,0x1,0x8], [0x1fb3,0x1fb3,0x1,0x9], [0x1fbe,0x1fbe,0x1,-0x1c25],
  [0x1fc3,0x1fc3,0x1,0x9], [0x1fd0,0x1fd1,0x1,0x8], [0x1fe0,0x1fe1,0x1,0x8], [0x1fe5,0x1fe5,0x1,0x7],
  [0x1ff3,0x1ff3,0x1,0x9], [0x214e,0x214e,0x1,-0x1c], [0x2170,0x217f,0x1,-0x10], [0x2184,0x2184,0x1,-0x1],
  [0x24d0,0x24e9,0x1,-0x1a], [0x2c30,0x2c5f,0x1,-0x30], [0x2c61,0x2c61,0x1,-0x1], [0x2c65,0x2c65,0x1,-0x2a2b],
  [0x2c66,0x2c66,0x1,-0x2a28], [0x2c68,0x2c6c,0x2,-0x1], [0x2c73,0x2c73,0x1,-0x1], [0x2c76,0x2c76,0x1,-0x1],
  [0x2c81,0x2ce3,0x2,-0x1], [0x2cec,0x2cee,0x2,-0x1], [0x2cf3,0x2cf3,0x1,-0x1], [0x2d00,0x2d25,0x1,-0x1c60],
  [0x2d27,0x2d27,0x1,-0x1c60], [0x2d2d,0x2d2d,0x1,-0x1c60], [0xa641,0xa66d,0x2,-0x1], [0xa681,0xa69b,0x2,-0x1],
  [0xa723,0xa72f,0x2,-0x1], [0xa733,0xa76f,0x2,-0x1], [0xa77a,0xa77c,0x2,-0x1], [0xa77f,0xa787,0x2,-0x1],
  [0xa78c,0xa78c,0x1,-0x1], [0xa791,0xa793,0x2,-0x1], [0xa794,0xa794,0x1,0x30], [0xa797,0xa7a9,0x2,-0x1],
  [0xa7b5,0xa7c3,0x2,-0x1], [0xa7c8,0xa7ca,0x2,-0x1], [0xa7d1,0xa7d1,0x1,-0x1], [0xa7d7,0xa7d9,0x2,-0x1],
  [0xa7f6,0xa7f6,0x1,-0x1], [0xab53,0xab53,0x1,-0x3a0], [0xab70,0xabbf,0x1,-0x97d0], [0xff41,0xff5a,0x1,-0x20],
  [0x10428,0x1044f,0x1,-0x28], [0x104d8,0x104fb,0x1,-0x28], [0x10597,0x105a1,0x1,-0x27], [0x105a3,0x105b1,0x1,-0x27],
  [0x105b3,0x105b9,0x1,-0x27], [0x105bb,0x105bc,0x1,-0x27], [0x10cc0,0x10cf2,0x1,-0x40], [0x10d70,0x10d85,0x1,-0x20],
  [0x118c0,0x118df,0x1,-0x20],
  [0x16e60,0x16e7f,0x1,-0x20], [0x1e922,0x1e943,0x1,-0x22]
].map(Object.freeze))
function ordinalUpper(codePoint) {
  let first = 0, last = ORDINAL_UPPER_RANGES.length - 1
  while (first <= last) {
    const middle = (first + last) >>> 1
    const [start, end, stride, delta] = ORDINAL_UPPER_RANGES[middle]
    if (codePoint < start) last = middle - 1
    else if (codePoint > end) first = middle + 1
    else return (codePoint - start) % stride === 0 ? codePoint + delta : codePoint
  }
  return codePoint
}
const ordinalFold = value => Array.from(value, character => String.fromCodePoint(ordinalUpper(character.codePointAt(0)))).join('')
const samePath = (a, b) => ordinalFold(pathKey(a)) === ordinalFold(pathKey(b))
const childPath = (parent, leaf) => `${pathKey(parent).replace(/\/$/u, '')}/${leaf}`
const inside = (path, root) => ordinalFold(pathKey(path)).startsWith(`${ordinalFold(pathKey(root).replace(/\/$/u, ''))}/`)
const pathEquals = (actual, expected) => requireThat(samePath(actual, expected), 'derived path mismatch')
for (const name of ['TransactionOrdinal', 'CampaignIndexOrdinal']) defineValue(name, pattern(/^(?!0000)[0-9]{4}$/u))
defineValue('FourDigitEventSequence', pattern(/^[0-9]{4}$/u))
const INDEX_KINDS = ['attempt_started', 'attempt_finalized', 'attempt_quarantined', 'operator_handoff', 'recovery_checkpoint']
defineValue('SafeCampaignIndexPath', pattern(/^campaign-index\/(?!0000)[0-9]{4}-(attempt_started|attempt_finalized|attempt_quarantined|operator_handoff|recovery_checkpoint)\.json$/u))
defineValue('SafeAttemptEventPath', pattern(/^events\/[0-9]{4}-(ready|local|pr_active|merged|post_merge_verified|main_only|verified|failed)\.json$/u))
defineValue('SafeAttemptEvidencePath', pattern(/^attachments\/[0-9]{4}-[a-z0-9][a-z0-9-]{0,63}\.(json|txt|log|sha256|bundle|patch)$/u))
defineValue('Wave0aOperationInstanceId', enumeration(OPERATIONS))
defineValue('Wave0aOperationContractMode', enumeration(['default', 'post_merge_success', 'post_merge_failure_cleanup', 'pre_merge_abort_cleanup', 'main_only_cleanup']))
// Discriminants alone are useful for identity/container validation. They do
// not validate, admit, or authenticate any attachment content.
defineValue('KnownAttachmentSchema', enumeration([
  'feature-integration-archive-preflight', 'protected-clone-baseline', 'slice-topology-evidence', 'slice-topology-recovery-observation',
  'wave0a-local-gates', 'wave0a-generated-paths', 'wave0a-generated-deletion-plan', 'wave0a-generated-cleanup', 'wave0a-cleanup-progress',
  'root-materialization-plan', 'worktree-removal-plan', 'worktree-removal-observation', 'wave0a-dispatch-run-observation',
  'feature-integration-independent-review', 'exact-head-run-set-snapshot', 'exact-head-run-discovery', 'exact-head-run-discovery-failure',
  'exact-head-ci-evidence', 'pull-request-mergeability', 'merge-commit-plan', 'merge-commit-preparation', 'main-integration-reconciliation',
  'main-integration-settlement', 'github-atomic-pr-lifecycle-acceptance', 'github-atomic-pr-lifecycle-validation', 'wave0a-capacity-observation',
  'remote-branch-deletion', 'feature-integration-failure', 'feature-integration-recovery-checkpoint', 'pull-request-observation',
  'remote-ref-observation', 'partial-run-evidence', 'candidate-preservation-manifest', 'wave0a-mutation-request', 'wave0a-mutation-intent',
  'wave0a-operation-claim', 'wave0a-process-result', 'wave0a-job-termination-proof', 'wave0a-mutation-receipt', 'wave0a-operation-inspection',
  'wave0a-supervised-operation-result', 'wave0a-historical-precheckpoint-validation'
].map(name => `${S}${name}/v1`)))
const evidenceCondition = shape({ label: 'SafeLabel', schemaVersion: 'KnownAttachmentSchema' })
const operationEvidenceEntryStructure = shape({ operationInstanceId: 'Wave0aOperationInstanceId', mode: 'Wave0aOperationContractMode', preconditions: array(evidenceCondition, 1, 7), postconditions: array(evidenceCondition, 1, 3) }, value => {
  for (const conditions of [value.preconditions, value.postconditions]) requireThat(new Set(conditions.map(condition => condition.label)).size === conditions.length, 'duplicate evidence label')
})
// This deliberately named structural boundary does not select an eligible
// operation/profile row or check that row's full semantic evidence contract.
export function validateOperationEvidenceContractEntryStructure(value) { canonicalBytes(value, MAX_RECORD_BYTES); operationEvidenceEntryStructure(value); return structuredClone(value) }
function operationPath(value, family, max, requiredOperation) {
  check('SafeRepositoryPath', value)
  const parts = value.split('/')
  requireThat(parts.length === 5 && parts[0] === 'operations' && parts[3] === family, 'operation path family')
  check('SafeAttemptId', parts[1]); check('Wave0aOperationInstanceId', parts[2])
  if (requiredOperation) requireThat(parts[2] === requiredOperation, 'operation path owner')
  requireThat(/^[0-9]{4}\.json$/u.test(parts[4]), 'ordinal leaf')
  integer(1, max)(Number(parts[4].slice(0, 4)))
}
defineValue('SafeOperationClaimPath', value => operationPath(value, 'claims', 128))
defineValue('SafeOperationTerminationProofPath', value => operationPath(value, 'termination-proofs', 128))
defineValue('SafeOperationCleanupProgressPath', value => operationPath(value, 'cleanup-progress', 98, 'cleanup-generated-paths'))
defineValue('SafeOperationWorktreeProgressPath', value => operationPath(value, 'worktree-progress', 16, 'remove-feature-worktree'))
defineValue('SafeOperationProgramProgressPath', value => operationPath(value, 'program-progress', 18, 'fast-forward-root'))
for (const [name, max] of [['OperationClaimOrdinalLeaf', 128], ['CleanupProgressOrdinalLeaf', 98], ['WorktreeProgressOrdinalLeaf', 16], ['RootFastForwardProgressOrdinalLeaf', 18], ['OperationPreconditionOrdinalLeaf', 7], ['OperationPostconditionOrdinalLeaf', 3]]) defineValue(name, value => { pattern(/^[0-9]{4}$/u)(value); integer(1, max)(Number(value)) })
defineValue('SafeAttemptRelativePath', value => check(value?.startsWith('events/') ? 'SafeAttemptEventPath' : 'SafeAttemptEvidencePath', value))
defineValue('SafeRecoveryCheckpointPath', value => { check('SafeRepositoryPath', value); const match = /^recovery-checkpoints\/(.+)-([0-9]{4})\.json$/u.exec(value); requireThat(match !== null, 'checkpoint path'); check('SafeAttemptId', match[1]); check('FourDigitEventSequence', match[2]) })
function transactionRoot(value, kind) {
  check('SafeRepositoryPath', value)
  const parts = value.split('/')
  if (kind === 'Campaign') { requireThat(parts.length === 2 && parts[0] === 'campaign-transactions', 'campaign transaction root'); check('SafeTransactionId', parts[1]) }
  else if (kind === 'Attempt') { requireThat(parts.length === 4 && parts[0] === 'attempts' && parts[2] === 'transactions', 'attempt transaction root'); check('SafeAttemptId', parts[1]); check('SafeTransactionId', parts[3]) }
  else { requireThat(parts.length === 5 && parts[3] === 'transactions', 'operation transaction root'); check('SafeOperationRoot', parts.slice(0, 3).join('/')); check('SafeTransactionId', parts[4]) }
}
for (const kind of ['Campaign', 'Attempt', 'Operation']) {
  defineValue(`Safe${kind}TransactionRoot`, value => transactionRoot(value, kind))
  defineValue(`Safe${kind}TransactionStagedPath`, value => { check('SafeRepositoryPath', value); const match = /^(.*)\/staged\/([0-9]{4})\.bin$/u.exec(value); requireThat(match !== null, 'staged transaction path'); transactionRoot(match[1], kind); check('TransactionOrdinal', match[2]) })
}
defineValue('SafeTransactionReceiptPath', value => { check('SafeRepositoryPath', value); requireThat(value.endsWith('/transaction-receipt.json'), 'transaction receipt leaf'); const root = value.slice(0, -'/transaction-receipt.json'.length); transactionRoot(root, root.startsWith('campaign-transactions/') ? 'Campaign' : root.startsWith('attempts/') ? 'Attempt' : 'Operation') })
defineValue('SafeOperationRoot', value => { check('SafeRepositoryPath', value); const parts = value.split('/'); requireThat(parts.length === 3 && parts[0] === 'operations', 'operation root'); check('SafeAttemptId', parts[1]); check('Wave0aOperationInstanceId', parts[2]) })
for (const [kind, family, ordinal] of [['Precondition', 'preconditions', 'OperationPreconditionOrdinalLeaf'], ['Postcondition', 'postconditions', 'OperationPostconditionOrdinalLeaf']]) defineValue(`SafeOperation${kind}Path`, value => {
  check('SafeRepositoryPath', value); const parts = value.split('/'); requireThat(parts.length === 5 && parts[3] === family, 'operation condition path'); check('SafeOperationRoot', parts.slice(0, 3).join('/'))
  const match = /^([0-9]{4})-(.+)\.json$/u.exec(parts[4]); requireThat(match !== null, 'condition ordinal/label'); check(ordinal, match[1]); check('SafeLabel', match[2])
})
defineValue('SafeOperationEvidencePath', value => {
  check('SafeRepositoryPath', value); const parts = value.split('/'); check('SafeOperationRoot', parts.slice(0, 3).join('/'))
  if (parts.length === 4) requireThat(['request.json', 'intent.json', 'process-result.json', 'receipt.json'].includes(parts[3]), 'operation evidence leaf')
  else { const type = { claims: 'SafeOperationClaimPath', 'termination-proofs': 'SafeOperationTerminationProofPath', preconditions: 'SafeOperationPreconditionPath', postconditions: 'SafeOperationPostconditionPath' }[parts[3]]; requireThat(type !== undefined, 'operation evidence family'); check(type, value) }
})
const repoFields = { repositoryPath: 'SafeRepositoryPath', containingCommitSha: 'LowercaseSha', blobOid: 'LowercaseSha', blobSha256: 'LowercaseSha256' }
const fileFields = { canonicalPath: 'AbsolutePath', dev: 'DecimalString', ino: 'DecimalString', size: 'DecimalString', mtimeNs: 'DecimalString', ctimeNs: 'DecimalString', sha256: 'LowercaseSha256' }
const directoryFields = { canonicalPath: 'AbsolutePath', dev: 'DecimalString', ino: 'DecimalString', mtimeNs: 'DecimalString', ctimeNs: 'DecimalString', entryCount: 'NonnegativeSafeInteger', treeSha256: 'LowercaseSha256' }
const handleFields = { canonicalPath: 'AbsolutePath', dev: 'DecimalString', ino: 'DecimalString', attributes: 'DecimalString', reparseTag: literal('0') }
define('RepoObjectIdentity', repoFields)
define('ExternalFileIdentity', { canonicalPath: 'AbsolutePath', byteSize: 'PositiveSafeInteger', sha256: 'LowercaseSha256' })
define('FileIdentity', fileFields)
for (const type of ['OperationPreconditionSource', 'OperationPostconditionSource']) define(type, { label: 'SafeLabel', source: 'FileIdentity', schemaVersion: 'KnownAttachmentSchema' })
define('TransactionReceiptRef', { transactionId: 'SafeTransactionId', path: 'SafeTransactionReceiptPath', schemaVersion: literal(`${S}feature-integration-transaction-receipt/v1`), byteSize: integer(1, MAX_RECORD_BYTES), sha256: 'LowercaseSha256' }, value => requireThat(value.path.split('/').at(-2) === value.transactionId, 'receipt reference transaction'))
define('ApprovalIdentity', fileFields)
define('DirectoryIdentity', directoryFields)
define('DirectoryHandleIdentity', handleFields)
define('ExecutableIdentity', { logicalName: enumeration(['git', 'gh', 'node', 'pwsh', 'git-credential-manager']), ...fileFields, version: 'BoundedString' })
const namedExecutable = name => value => { check('ExecutableIdentity', value); requireThat(value.logicalName === name, 'executable logical name') }
defineValue('SourceOrigin', value => {
  const common = { kind: literal(value?.kind) }
  if (value?.kind === 'archive') shape({ ...common, archiveManifestIdentity: 'ExternalFileIdentity', fromSha: 'LowercaseSha', toSha: 'LowercaseSha', oldPullRequestNumber: 'PositiveSafeInteger', sourceItemId: 'SafeId' })(value)
  else if (value?.kind === 'current_main') shape({ ...common, baselineSha: 'LowercaseSha', existingEvidenceId: 'SafeId' })(value)
  else if (value?.kind === 'new_design') shape({ ...common, requiredSpecIdentity: 'SafeId', approvedSpecIdentity: 'RepoObjectIdentity', designApprovalId: 'SafeId' })(value)
  else fail('unknown source origin')
})
define('Wave0aSubject', { kind: literal('boundary'), id: literal('WAVE-0A-CONTROL-PLANE'), classification: literal('mandatory') })
define('Wave0aDecisionAuthority', { kind: literal('program_index'), phase: literal('wave0a_candidate'), authorityCommitSha: 'LowercaseSha', programIndexIdentity: 'RepoObjectIdentity' }, value => { requireThat(value.authorityCommitSha === value.programIndexIdentity.containingCommitSha && value.programIndexIdentity.repositoryPath === INDEX_PATH, 'candidate authority binding') })
define('CampaignAuthority', { schemaVersion: literal(`${S}feature-integration-campaign-authority/v1`), programId: literal('feature-selection-and-sequential-main-integration'), repository: literal(REPOSITORY), campaignRootLeaf: literal('2026-08-23-feature-integration-campaign'), programIndexIdentity: 'RepoObjectIdentity', authorityDocuments: tuple([shape({ kind: literal('design_spec'), ...repoFields }), shape({ kind: literal('implementation_plan'), ...repoFields })]), createdAt: 'CanonicalUtc' }, value => {
  requireThat(value.programIndexIdentity.repositoryPath === INDEX_PATH && value.authorityDocuments[1].repositoryPath === PLAN_PATH, 'authority document path')
  same(value.authorityDocuments[0], { kind: 'design_spec', repositoryPath: 'docs/superpowers/specs/2026-08-23-feature-selection-and-sequential-main-integration-design.md', containingCommitSha: '819d6261d52d8dc7037d7fae8b852ad4b6a52e21', blobOid: 'ccf3f833e32f48e583a6c6fac4796fa30756e1a4', blobSha256: '709872ba8fa3188c666473248bf5196d1131672cfdec388929ecdb8c4c0292f5' }, 'design authority')
})
define('IndexHead', { sequence: integer(1, 8192), path: 'SafeCampaignIndexPath', sha256: 'LowercaseSha256' }, value => requireThat(Number(value.path.slice(15, 19)) === value.sequence, 'index head sequence/path'))
define('WindowsBootIdentity', { bootIdentifier: 'CanonicalGuid' })
define('WindowsProcessIdentity', { boot: 'WindowsBootIdentity', pid: 'PositiveSafeInteger', creationFileTime100ns: 'DecimalString' })
define('CoordinationLeaseFileIdentity', { ...fileFields, size: literal('1'), sha256: literal('6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d'), linkCount: literal(1), attributes: 'DecimalString', reparseTag: literal('0') })
define('OperationCoordinationEntry', { operationInstanceId: 'Wave0aOperationInstanceId', coordinationFile: 'CoordinationLeaseFileIdentity' })
define('OperationClaimLink', { ordinal: 'OperationClaimOrdinal', path: 'SafeOperationClaimPath', sha256: 'LowercaseSha256' }, value => requireThat(Number(value.path.split('/').at(-1).slice(0, 4)) === value.ordinal, 'claim ordinal/path'))
define('OperationTerminationProofLink', { ordinal: 'OperationClaimOrdinal', path: 'SafeOperationTerminationProofPath', sha256: 'LowercaseSha256' }, value => requireThat(Number(value.path.split('/').at(-1).slice(0, 4)) === value.ordinal, 'proof ordinal/path'))
const absenceFields = { canonicalPath: 'AbsolutePath', parentDirectory: 'DirectoryHandleIdentity', leaf: 'SafeWindowsLeafName', observation: literal('absent_no_follow'), reparsePointFree: literal(true), observedAt: 'CanonicalUtc' }
const absentChild = value => pathEquals(value.canonicalPath, childPath(value.parentDirectory.canonicalPath, value.leaf))
define('NoFollowPathAbsenceProof', absenceFields, absentChild)
const fenceBase = { commonGitDirectory: 'DirectoryHandleIdentity', worktreesDirectory: 'DirectoryHandleIdentity', rootRegistrationKind: literal('primary'), rootAdminDirectory: 'DirectoryHandleIdentity', rootHeadFile: 'FileIdentity' }
defineValue('WorktreeRegistryFence', value => {
  const mode = value?.registrationSet
  requireThat(mode === 'feature_and_root' || mode === 'root_only', 'worktree registration set')
  shape({ ...fenceBase, registrationSet: literal(mode), ...(mode === 'feature_and_root' ? { featureAdminDirectory: 'DirectoryHandleIdentity', featureWorktreeGitFile: 'FileIdentity', featureAdminGitdirBackpointer: 'FileIdentity', featureHeadFile: 'FileIdentity' } : { featureWorktreePath: 'AbsolutePath', featureWorktreeAbsenceProof: 'NoFollowPathAbsenceProof', featureAdminDirectoryAbsenceProof: 'NoFollowPathAbsenceProof' }) })(value)
  same(value.rootAdminDirectory, value.commonGitDirectory, 'primary admin')
  pathEquals(value.worktreesDirectory.canonicalPath, childPath(value.commonGitDirectory.canonicalPath, 'worktrees'))
  pathEquals(value.rootHeadFile.canonicalPath, childPath(value.rootAdminDirectory.canonicalPath, 'HEAD'))
  if (mode === 'feature_and_root') {
    requireThat(inside(value.featureAdminDirectory.canonicalPath, value.worktreesDirectory.canonicalPath), 'feature admin containment')
    pathEquals(value.featureAdminGitdirBackpointer.canonicalPath, childPath(value.featureAdminDirectory.canonicalPath, 'gitdir'))
    pathEquals(value.featureHeadFile.canonicalPath, childPath(value.featureAdminDirectory.canonicalPath, 'HEAD'))
    requireThat(pathKey(value.featureWorktreeGitFile.canonicalPath).endsWith('/.git') && !samePath(value.featureWorktreeGitFile.canonicalPath, value.featureAdminGitdirBackpointer.canonicalPath), 'feature git file identity')
  } else { pathEquals(value.featureWorktreePath, value.featureWorktreeAbsenceProof.canonicalPath); requireThat(inside(value.featureAdminDirectoryAbsenceProof.canonicalPath, value.worktreesDirectory.canonicalPath), 'absent admin containment') }
})
define('Wave0aApprovedLocalRepositoryScope', { featureWorktree: 'DirectoryHandleIdentity', rootWorktree: 'DirectoryHandleIdentity', commonGitDirectory: 'DirectoryHandleIdentity', objectDirectory: 'DirectoryHandleIdentity', worktreeRegistryFence: 'WorktreeRegistryFence' }, value => {
  requireThat(value.worktreeRegistryFence.registrationSet === 'feature_and_root' && !samePath(value.featureWorktree.canonicalPath, value.rootWorktree.canonicalPath), 'approved local registration')
  same(value.commonGitDirectory, value.worktreeRegistryFence.commonGitDirectory, 'common Git')
  pathEquals(value.objectDirectory.canonicalPath, childPath(value.commonGitDirectory.canonicalPath, 'objects'))
  pathEquals(value.worktreeRegistryFence.featureWorktreeGitFile.canonicalPath, childPath(value.featureWorktree.canonicalPath, '.git'))
})
const messageFields = { source: literal('codex_trusted_transcript_v1'), threadId: 'SafeId', messageId: 'SafeId', role: enumeration(['assistant_announcement', 'assistant_prompt', 'user_approval']), normalizedText: 'BoundedString', normalizedUtf8Sha256: 'LowercaseSha256', observedAt: 'CanonicalUtc', ordinal: 'PositiveSafeInteger' }
define('TrustedTranscriptMessageIdentity', { source: literal('codex_trusted_transcript_v1'), threadId: 'SafeId', messageId: 'SafeId', role: literal('user_approval'), normalizedUtf8Sha256: 'LowercaseSha256', ordinal: 'PositiveSafeInteger' })
function transcriptValidator(value, exactImplementationException = false) {
  const message = shape({ ...messageFields, normalizedText: exactImplementationException ? boundedText(1, 1024, false) : 'BoundedString' })
  shape({ source: literal('codex_trusted_transcript_v1'), threadId: 'SafeId', assistantAnnouncement: message, assistantPrompt: message, userApproval: message })(value)
  const messages = ['assistantAnnouncement', 'assistantPrompt', 'userApproval'].map(key => value[key])
  messages.forEach((entry, index) => {
    requireThat(entry.threadId === value.threadId && entry.role === ['assistant_announcement', 'assistant_prompt', 'user_approval'][index], 'transcript source/thread/role')
    requireThat(entry.normalizedText === normalizeApprovalMessage(Buffer.from(entry.normalizedText)), 'message not normalized')
    requireThat(entry.normalizedUtf8Sha256 === digest(Buffer.from(entry.normalizedText)), 'message digest')
    if (index) requireThat(entry.ordinal > messages[index - 1].ordinal && entry.observedAt > messages[index - 1].observedAt, 'transcript strict order')
  })
  requireThat(new Set(messages.map(message => message.messageId)).size === 3, 'replayed transcript message')
  const userText = exactImplementationException ? value.userApproval.normalizedText.slice(0, -1) : value.userApproval.normalizedText
  requireThat(userText === value.assistantPrompt.normalizedText, 'approval prompt/user mismatch')
}
defineValue('TrustedApprovalTranscript', value => transcriptValidator(value))
const PINNED_APPROVAL_FINGERPRINT = 'a2887ffe421303cf9ebb108dadebd6b7e1aab02fcd2df29bca69da97c19b5a65'
const PINNED_PLAN = { repositoryPath: PLAN_PATH, containingCommitSha: 'f4a9023990cca2774f0e8ea57792d68b4ae9b1c2', blobOid: '8822828c49c94e3aa4d6d3a5ea69527da0f7b8a7', blobSha256: 'da634d96eafe938d730ba2ab7f93fdeced1adb63c0f2bf2b7913330cda91d372' }
defineValue('ApprovalInstructionIdentity', value => {
  const fingerprint = digest(Buffer.from(`BOB-WAVE0A-IMPLEMENTATION-APPROVAL-STRUCTURE-V1\n${renderJson(value, false)}\n`))
  const exception = fingerprint === PINNED_APPROVAL_FINGERPRINT
  shape({ schemaVersion: literal(`${S}feature-integration-approval-instruction/v4`), purpose: literal('implement_committed_wave0a_plan_and_exact_lease_addendum'), mutationAuthority: literal(false), approvedPlanIdentity: 'RepoObjectIdentity', trustedTranscript: transcript => transcriptValidator(transcript, exception), approvalText: 'BoundedString', capturedAt: 'CanonicalUtc' })(value)
  const plan = value.approvedPlanIdentity
  requireThat(plan.repositoryPath === PLAN_PATH, 'implementation plan path')
  if (exception) { same(plan, PINNED_PLAN, 'pinned plan'); requireThat(value.trustedTranscript.assistantAnnouncement.normalizedText.endsWith('\n') && value.trustedTranscript.userApproval.normalizedText.endsWith('\n'), 'pinned LF comparison') }
  const announcement = `Wave 0A plan committed planCommit=${plan.containingCommitSha} planBlob=${plan.blobOid} planSha256=${plan.blobSha256}`
  const approval = `WAVE0A-EXACT-LEASE-MERGE-V1 を承認 planCommit=${plan.containingCommitSha} planBlob=${plan.blobOid} planSha256=${plan.blobSha256}`
  requireThat(value.trustedTranscript.assistantAnnouncement.normalizedText === announcement + (exception ? '\n' : '') && value.trustedTranscript.assistantPrompt.normalizedText === approval && value.approvalText === approval && value.capturedAt >= value.trustedTranscript.userApproval.observedAt, 'implementation approval binding')
})

// The first-root policy has no configurable values. The committed file is its
// byte representation; no filesystem read is needed to construct the authority.
defineValue('FirstRootInstallPolicy', value => same(value, FIRST_POLICY, 'first-root policy'))
export function getFirstRootInstallPolicy() { return FIRST_POLICY }
define('ClosedInitialControlBindingContentIdentity', { schemaVersion: literal('closed-initial-control-binding/v1'), sha256: 'LowercaseSha256', byteLength: integer(1, MAX_RECORD_BYTES) })
define('StagedClosedInitialControlBindingIdentity', { relativePath: literal('local/Candidate/held/closed-initial-control-binding.json'), contentIdentity: 'ClosedInitialControlBindingContentIdentity' })
define('ClosedInitialControlBindingFileIdentity', { fileIdentity: 'FileIdentity', contentIdentity: 'ClosedInitialControlBindingContentIdentity' }, value => requireThat(value.fileIdentity.sha256 === value.contentIdentity.sha256 && value.fileIdentity.size === String(value.contentIdentity.byteLength), 'closed binding content identity'))
const targetFields = { canonicalPath: 'AbsolutePath', parentIdentity: 'DirectoryHandleIdentity', leaf: 'SafeWindowsLeafName', expectedAbsent: literal(true), requiredFileType: literal('regular_file'), requiredLinkCount: literal(1) }
const targetChild = value => pathEquals(value.canonicalPath, childPath(value.parentIdentity.canonicalPath, value.leaf))
define('BeginAdmissionCommitResultTarget', { role: literal('begin_admission_commit_result'), ...targetFields, schemaVersion: literal(`${S}wave0a-begin-admission-commit-result/v1`), byteCap: literal(MAX_RECORD_BYTES) }, targetChild)
define('FirstRootInstallPlanTarget', { role: literal('first_root_install_plan'), ...targetFields, schemaVersion: literal(`${S}wave0a-first-root-install-plan/v1`), byteCap: literal(MAX_PLAN_BYTES) }, targetChild)
define('ExpectedAbsentCampaignRootIdentity', { canonicalPath: 'AbsolutePath', parentIdentity: 'DirectoryHandleIdentity', leaf: 'SafeWindowsLeafName', observation: literal('absent'), observedAt: 'CanonicalUtc' }, targetChild)
const candidateFields = { baseSha: 'LowercaseSha', headSha: 'LowercaseSha', treeOid: 'LowercaseSha', branch: 'SafeBranch' }
define('BeginAdmissionCandidate', candidateFields)
function policyIdentity(value) { check('RepoObjectIdentity', value); requireThat(value.repositoryPath === POLICY_PATH && value.blobSha256 === hash(FIRST_POLICY), 'first-root policy identity') }
const templateBaseFields = { schemaVersion: literal(`${S}wave0a-begin-admission-template/v1`), admissionNonce: 'SafeId', campaignExecutionApprovalIdentity: 'ApprovalIdentity', campaignExecutionRequestSha256: 'LowercaseSha256', approvedPlanIdentity: 'RepoObjectIdentity', programIndexIdentity: 'RepoObjectIdentity', candidate: 'BeginAdmissionCandidate', localRepositoryScope: 'Wave0aApprovedLocalRepositoryScope', campaignRoot: 'AbsolutePath', attemptId: 'SafeAttemptId', attemptStartBefore: 'CanonicalUtc', lifecycleExpiresAt: 'CanonicalUtc', fixedRelativePathPlanSha256: 'LowercaseSha256', initialControlBinding: 'StagedClosedInitialControlBindingIdentity', commitResultTarget: 'BeginAdmissionCommitResultTarget' }
function modeFields(value) { requireThat(value && (value.campaignMode === 'new_campaign' || value.campaignMode === 'existing_campaign_new_attempt'), 'campaign mode'); return { campaignMode: literal(value.campaignMode), rootInstall: literal(value.campaignMode === 'new_campaign' ? 'atomic_first_root' : 'existing_root_transaction') } }
defineValue('BeginAdmissionTemplateRecord', value => {
  const modes = modeFields(value), fresh = value.campaignMode === 'new_campaign'
  shape({ ...templateBaseFields, ...modes, ...(fresh ? { destination: 'ExpectedAbsentCampaignRootIdentity', firstRootInstallPolicyIdentity: policyIdentity, stagedRoot: 'DirectoryHandleIdentity', firstRootInstallPlanTarget: 'FirstRootInstallPlanTarget' } : { campaignRootIdentity: 'DirectoryHandleIdentity', stagedTransactionRoot: 'DirectoryHandleIdentity', priorCampaignIndexHead: 'IndexHead' }) })(value)
  requireThat(value.attemptStartBefore <= value.lifecycleExpiresAt && value.programIndexIdentity.repositoryPath === INDEX_PATH && value.approvedPlanIdentity.repositoryPath === PLAN_PATH && value.candidate.headSha === value.programIndexIdentity.containingCommitSha, 'template authority/deadline')
  requireThat(!inside(value.commitResultTarget.canonicalPath, value.campaignRoot), 'external result target')
  if (fresh) { pathEquals(value.destination.canonicalPath, value.campaignRoot); same(value.commitResultTarget.parentIdentity, value.firstRootInstallPlanTarget.parentIdentity, 'result artifact parent'); requireThat(!samePath(value.commitResultTarget.canonicalPath, value.firstRootInstallPlanTarget.canonicalPath) && !inside(value.stagedRoot.canonicalPath, value.campaignRoot) && !samePath(value.stagedRoot.canonicalPath, value.campaignRoot), 'staging/target collision'); requireThat(value.firstRootInstallPolicyIdentity.containingCommitSha === value.candidate.headSha, 'policy candidate') }
  else { pathEquals(value.campaignRootIdentity.canonicalPath, value.campaignRoot); requireThat(inside(value.stagedTransactionRoot.canonicalPath, childPath(value.campaignRoot, 'campaign-transactions')), 'existing staging containment') }
})
function contentFile(identity, record) { requireThat(identity.sha256 === hash(record) && identity.size === String(canonicalBytes(record, MAX_PLAN_BYTES).length), 'file/content digest or size') }
define('BeginAdmissionTemplateIdentity', { template: 'FileIdentity', record: 'BeginAdmissionTemplateRecord' }, value => contentFile(value.template, value.record))
defineValue('BeginResult', value => { shape({ schemaVersion: literal(`${S}wave0a-begin-result/v1`), kind: literal('begin_result'), mutationAuthority: literal(false), ...modeFields(value), admissionNonce: 'SafeId', admissionTemplate: 'BeginAdmissionTemplateIdentity' })(value); for (const key of ['campaignMode', 'rootInstall', 'admissionNonce']) requireThat(value[key] === value.admissionTemplate.record[key], 'begin/template crossing') })
define('BeginAdmissionInitialControlBindingTransition', { staged: 'StagedClosedInitialControlBindingIdentity', postCommit: 'ClosedInitialControlBindingFileIdentity' }, value => same(value.staged.contentIdentity, value.postCommit.contentIdentity, 'binding transition'))
defineValue('BeginAdmissionCommitBinding', value => {
  shape({ admissionNonce: 'SafeId', approvedAt: 'CanonicalUtc', recordedAt: 'CanonicalUtc', attemptStartBefore: 'CanonicalUtc', lifecycleExpiresAt: 'CanonicalUtc', initialControlBinding: 'BeginAdmissionInitialControlBindingTransition', commitDeadlineFence: literal(DEADLINE_FENCE), ...modeFields(value), admissionTemplate: 'BeginAdmissionTemplateIdentity' })(value)
  const record = value.admissionTemplate.record
  for (const key of ['campaignMode', 'rootInstall', 'admissionNonce', 'attemptStartBefore', 'lifecycleExpiresAt']) requireThat(value[key] === record[key], 'admission template/binding crossing')
  requireThat(value.approvedAt <= value.recordedAt && value.recordedAt < value.attemptStartBefore && value.attemptStartBefore <= value.lifecycleExpiresAt, 'admission time ordering')
  same(value.initialControlBinding.staged, record.initialControlBinding, 'staged binding')
  requireThat(!inside(value.initialControlBinding.postCommit.fileIdentity.canonicalPath, record.campaignRoot), 'external initial binding')
})
const transientNames = ['campaignIndexPublicationLock', 'attemptPublicationLock', 'recoveryFenceRoot']
const transientFields = type => Object.fromEntries(transientNames.map(key => [key, type]))
const tupleHash = value => hash(transientNames.map(key => [key, value[key]]))
define('FirstRootTransientAbsenceProof', { ...transientFields('NoFollowPathAbsenceProof'), tupleSha256: 'LowercaseSha256' }, value => requireThat(value.tupleSha256 === tupleHash(value), 'transient absence tuple'))
const finalizedFiles = ['campaignAuthority', 'campaignAuthorityHash', 'attemptIncompleteMarker', 'attemptStarted', 'readyEvent', 'readyHandoff', 'beginTransactionDescriptor', 'beginTransactionReceipt']
define('FinalizedReadyStagedRootIdentity', { root: 'DirectoryIdentity', ...Object.fromEntries(finalizedFiles.map(key => [key, 'FileIdentity'])), transientAbsence: 'FirstRootTransientAbsenceProof', initialControlBinding: 'StagedClosedInitialControlBindingIdentity', treeSha256: 'LowercaseSha256' }, value => { requireThat(value.root.treeSha256 === value.treeSha256, 'final root tree'); for (const key of finalizedFiles) requireThat(inside(value[key].canonicalPath, value.root.canonicalPath), 'staged file containment'); for (const key of transientNames) requireThat(inside(value.transientAbsence[key].canonicalPath, value.root.canonicalPath), 'staged absence containment') })
define('PlannedRenamedDirectoryIdentity', { destinationPath: 'AbsolutePath', sourceIdentity: 'DirectoryIdentity' })
define('PlannedRenamedFileIdentity', { destinationPath: 'AbsolutePath', sourceIdentity: 'FileIdentity' })
define('PlannedRenamedAbsenceProof', { destinationPath: 'AbsolutePath', sourceProof: 'NoFollowPathAbsenceProof' })
define('PlannedFirstRootTransientAbsenceProof', { ...transientFields('PlannedRenamedAbsenceProof'), tupleSha256: 'LowercaseSha256' }, value => requireThat(value.tupleSha256 === tupleHash(value), 'planned absence tuple'))
define('InstalledRenamedAbsenceIdentity', { disposition: literal('installed_absence_by_atomic_root_rename'), canonicalPath: 'AbsolutePath', parentDirectoryObject: shape({ dev: 'DecimalString', ino: 'DecimalString', attributes: 'DecimalString', reparseTag: literal('0') }), leaf: 'SafeWindowsLeafName', observation: literal('absent_no_follow_at_publish'), reparsePointFree: literal(true) }, value => requireThat(pathKey(value.canonicalPath).split('/').at(-1) === value.leaf, 'installed absence leaf'))
define('InstalledFirstRootTransientAbsenceIdentity', { ...transientFields('InstalledRenamedAbsenceIdentity'), tupleSha256: 'LowercaseSha256' }, value => requireThat(value.tupleSha256 === tupleHash(value), 'installed absence tuple'))
define('PlannedUnchangedExternalClosedInitialControlBindingIdentity', { disposition: literal('unchanged_external'), sourceIdentity: 'FileIdentity', contentIdentity: 'ClosedInitialControlBindingContentIdentity' }, value => check('ClosedInitialControlBindingFileIdentity', { fileIdentity: value.sourceIdentity, contentIdentity: value.contentIdentity }))
define('SameVolumeAtomicRootPublishAction', { kind: literal('rename_directory_no_replace_same_volume'), sourceRoot: 'DirectoryHandleIdentity', destinationParent: 'DirectoryHandleIdentity', destinationLeaf: 'SafeWindowsLeafName', sourceVolumeSerial: 'DecimalString', destinationVolumeSerial: 'DecimalString', expectedDestinationAbsent: literal(true) }, value => requireThat(value.sourceVolumeSerial === value.destinationVolumeSerial && value.sourceRoot.dev === value.sourceVolumeSerial && value.destinationParent.dev === value.destinationVolumeSerial, 'same-volume publish'))
define('FirstRootInstallPlan', { schemaVersion: literal(`${S}wave0a-first-root-install-plan/v1`), mutationAuthority: literal(false), rootInstall: literal('atomic_first_root'), target: 'FirstRootInstallPlanTarget', firstRootInstallPolicyIdentity: policyIdentity, destination: 'ExpectedAbsentCampaignRootIdentity', admissionTemplate: 'BeginAdmissionTemplateIdentity', finalizedReadyRoot: 'FinalizedReadyStagedRootIdentity', publishAction: 'SameVolumeAtomicRootPublishAction', postPublish: shape({ root: 'PlannedRenamedDirectoryIdentity', attemptStarted: 'PlannedRenamedFileIdentity', readyHandoff: 'PlannedRenamedFileIdentity', beginTransactionDescriptor: 'PlannedRenamedFileIdentity', beginTransactionReceipt: 'PlannedRenamedFileIdentity', transientAbsence: 'PlannedFirstRootTransientAbsenceProof', initialControlBinding: 'PlannedUnchangedExternalClosedInitialControlBindingIdentity' }), createdAt: 'CanonicalUtc' }, value => {
  const record = value.admissionTemplate.record, final = value.finalizedReadyRoot
  requireThat(record.campaignMode === 'new_campaign', 'new-root install only')
  same(value.target, record.firstRootInstallPlanTarget, 'install plan target'); same(value.firstRootInstallPolicyIdentity, record.firstRootInstallPolicyIdentity, 'install policy'); same(value.destination, record.destination, 'install destination'); same(value.publishAction.sourceRoot, record.stagedRoot, 'install source handle'); same(value.publishAction.destinationParent, value.destination.parentIdentity, 'install parent'); requireThat(value.publishAction.destinationLeaf === value.destination.leaf, 'install leaf')
  for (const key of ['canonicalPath', 'dev', 'ino']) requireThat(final.root[key] === record.stagedRoot[key], 'finalized source handle')
  same(final.initialControlBinding, record.initialControlBinding, 'finalized binding')
  same(value.postPublish.root.sourceIdentity, final.root, 'planned root source'); pathEquals(value.postPublish.root.destinationPath, value.destination.canonicalPath)
  const project = path => value.destination.canonicalPath + pathKey(path).slice(pathKey(final.root.canonicalPath).length)
  for (const key of ['attemptStarted', 'readyHandoff', 'beginTransactionDescriptor', 'beginTransactionReceipt']) { same(value.postPublish[key].sourceIdentity, final[key], 'planned file source'); pathEquals(value.postPublish[key].destinationPath, project(final[key].canonicalPath)) }
  for (const key of transientNames) { same(value.postPublish.transientAbsence[key].sourceProof, final.transientAbsence[key], 'planned absence source'); pathEquals(value.postPublish.transientAbsence[key].destinationPath, project(final.transientAbsence[key].canonicalPath)) }
  same(value.postPublish.initialControlBinding.contentIdentity, final.initialControlBinding.contentIdentity, 'external binding content')
  requireThat(!inside(value.postPublish.initialControlBinding.sourceIdentity.canonicalPath, value.destination.canonicalPath) && !inside(value.postPublish.initialControlBinding.sourceIdentity.canonicalPath, final.root.canonicalPath), 'unchanged external binding containment')
})
const resultFields = { schemaVersion: literal(`${S}wave0a-begin-admission-commit-result/v1`), mutationAuthority: literal(false), attemptStarted: 'FileIdentity', admissionCommitIndexHead: 'IndexHead', readyHandoff: 'FileIdentity', campaignIndexHead: 'IndexHead', beginTransactionDescriptor: 'FileIdentity', beginTransactionReceipt: 'FileIdentity', initialControlBinding: 'ClosedInitialControlBindingFileIdentity', commitBinding: 'BeginAdmissionCommitBinding', installedRoot: 'DirectoryHandleIdentity' }
defineValue('BeginAdmissionCommitResult', value => {
  const fresh = value?.commitBinding?.campaignMode === 'new_campaign'
  shape({ ...resultFields, ...(fresh ? { firstRootInstallPlan: 'FileIdentity', transientAbsence: 'InstalledFirstRootTransientAbsenceIdentity' } : {}) })(value)
  const record = value.commitBinding.admissionTemplate.record
  pathEquals(value.installedRoot.canonicalPath, record.campaignRoot)
  const sourceRoot = fresh ? record.stagedRoot : record.campaignRootIdentity
  // Atomic rename changes only the path of the held source directory object.
  same(value.installedRoot, fresh ? { ...sourceRoot, canonicalPath: record.campaignRoot } : sourceRoot, 'installed root handle')
  same(value.initialControlBinding, value.commitBinding.initialControlBinding.postCommit, 'committed initial binding')
  pathEquals(value.attemptStarted.canonicalPath, childPath(record.campaignRoot, value.admissionCommitIndexHead.path))
  requireThat(value.campaignIndexHead.sequence === value.admissionCommitIndexHead.sequence + 1 && value.admissionCommitIndexHead.path.endsWith('-attempt_started.json') && value.campaignIndexHead.path.endsWith('-operator_handoff.json'), 'begin index pair')
  if (fresh) { requireThat(value.admissionCommitIndexHead.sequence === 1, 'first-root initial index'); pathEquals(value.firstRootInstallPlan.canonicalPath, record.firstRootInstallPlanTarget.canonicalPath) }
  else requireThat(value.admissionCommitIndexHead.sequence === record.priorCampaignIndexHead.sequence + 1, 'existing admission index successor')
  requireThat(value.attemptStarted.sha256 === value.admissionCommitIndexHead.sha256, 'started index content digest')
  for (const key of ['readyHandoff', 'beginTransactionDescriptor', 'beginTransactionReceipt']) requireThat(inside(value[key].canonicalPath, record.campaignRoot), 'installed file containment')
})
defineValue('BeginAdmissionObservation', value => {
  shape({ schemaVersion: literal(`${S}wave0a-begin-admission-observation/v1`), mutationAuthority: literal(false), beginResult: 'FileIdentity', rootInstallStatus: enumeration(['prepared', 'admission_committed_suffix_pending', 'commit_result_pending', 'committed']), admissionTemplateIdentity: 'BeginAdmissionTemplateIdentity', admissionCommitIndexHead: nullable('IndexHead'), admissionCommitResult: nullable(shape({ identity: nullable('FileIdentity'), result: 'BeginAdmissionCommitResult' })) })(value)
  const status = value.rootInstallStatus, template = value.admissionTemplateIdentity
  const expectedBegin = { schemaVersion: `${S}wave0a-begin-result/v1`, kind: 'begin_result', mutationAuthority: false, campaignMode: template.record.campaignMode, rootInstall: template.record.rootInstall, admissionNonce: template.record.admissionNonce, admissionTemplate: template }
  contentFile(value.beginResult, expectedBegin)
  if (status === 'prepared') requireThat(value.admissionCommitIndexHead === null && value.admissionCommitResult === null, 'prepared observation')
  else if (status === 'admission_committed_suffix_pending') {
    requireThat(template.record.campaignMode === 'existing_campaign_new_attempt' && value.admissionCommitIndexHead !== null && value.admissionCommitResult === null, 'existing suffix observation')
    const sequence = template.record.priorCampaignIndexHead.sequence + 1
    requireThat(value.admissionCommitIndexHead.sequence === sequence && value.admissionCommitIndexHead.path === `campaign-index/${String(sequence).padStart(4, '0')}-attempt_started.json`, 'existing suffix admission successor')
  }
  else {
    requireThat(value.admissionCommitIndexHead !== null && value.admissionCommitResult !== null, 'committed observation result')
    const { identity, result } = value.admissionCommitResult
    same(result.commitBinding.admissionTemplate, template, 'observation template'); same(result.admissionCommitIndexHead, value.admissionCommitIndexHead, 'observation first head')
    if (status === 'commit_result_pending') requireThat(identity === null, 'pending result must lack identity')
    else { requireThat(identity !== null, 'committed result identity missing'); pathEquals(identity.canonicalPath, template.record.commitResultTarget.canonicalPath); contentFile(identity, result) }
  }
})

const commandCommon = { id: 'SafeId', executable: enumeration(['node', 'npm.cmd', 'git', 'gh', 'pwsh']), argv: array(boundedText(0, 4096, false), 0, 4096), cwd: value => {
  if (value?.kind === 'repository_root') shape({ kind: literal('repository_root') })(value)
  else if (value?.kind === 'repository_relative') shape({ kind: literal('repository_relative'), path: 'SafeRepositoryPath' })(value)
  else shape({ kind: literal('absolute'), path: 'AbsolutePath' })(value)
}, stdinBytes: 'NonnegativeSafeInteger', stdinSha256: 'LowercaseSha256', stdoutBytes: 'NonnegativeSafeInteger', stderrBytes: 'NonnegativeSafeInteger', stdoutSha256: 'LowercaseSha256', stderrSha256: 'LowercaseSha256', startedAt: 'CanonicalUtc', finishedAt: 'CanonicalUtc' }
function terminationFields(outcome) {
  if (outcome === 'success') return { outcome: literal(outcome), exitCode: literal(0) }
  if (outcome === 'failure') return { outcome: literal(outcome), exitCode: 'NonzeroSignedInt32' }
  if (outcome === 'spawn_error') return { outcome: literal(outcome), errorCode: 'SafeReasonCode' }
  if (outcome === 'signal') return { outcome: literal(outcome), signal: enumeration(['SIGTERM', 'SIGKILL', 'SIGINT', 'SIGHUP', 'SIGBREAK']) }
  if (outcome === 'timeout' || outcome === 'overflow') return { outcome: literal(outcome), ...(outcome === 'overflow' ? { overflowStream: enumeration(['stdout', 'stderr', 'both']) } : {}), treeTermination: enumeration(['job_closed_and_empty', 'termination_failed']) }
  fail('unknown command outcome')
}
defineValue('CommandObservation', value => { shape({ ...commandCommon, ...terminationFields(value?.outcome) })(value); requireThat(value.finishedAt >= value.startedAt, 'command time order'); for (const [size, sha] of [['stdinBytes', 'stdinSha256'], ['stdoutBytes', 'stdoutSha256'], ['stderrBytes', 'stderrSha256']]) if (value[size] === 0) requireThat(value[sha] === digest(Buffer.alloc(0)), 'empty stream digest') })
define('GitRefTransactionCapability', { schemaVersion: literal(`${S}git-ref-transaction-capability/v1`), gitExecutableSha256: 'LowercaseSha256', probeRepository: 'DirectoryIdentity', stdinSha256: 'LowercaseSha256', command: 'CommandObservation', result: literal('symref_verify_and_ref_cas_atomic'), observedAt: 'CanonicalUtc' }, value => { requireThat(value.command.executable === 'git' && value.command.outcome === 'success' && value.stdinSha256 === value.command.stdinSha256 && value.observedAt >= value.command.finishedAt, 'Git capability identity') })
define('OperationCoordinationAuthority', { entries: array('OperationCoordinationEntry', 15, 15), count: literal(15), tupleSha256: 'LowercaseSha256' }, value => { same(value.entries.map(entry => entry.operationInstanceId), OPERATIONS, 'coordination roster'); requireThat(new Set(value.entries.map(entry => ordinalFold(pathKey(entry.coordinationFile.canonicalPath)))).size === 15 && value.tupleSha256 === hash(value.entries), 'coordination tuple') })
define('ExternalToolAuthority', { gitExecutable: namedExecutable('git'), ghExecutable: namedExecutable('gh'), nodeExecutable: namedExecutable('node'), pwshExecutable: namedExecutable('pwsh'), credentialExecutionAuthority: shape({ canonicalPath: 'AbsolutePath', sha256: 'LowercaseSha256' }), operationCoordination: 'OperationCoordinationAuthority', gitRefTransactionCapability: 'GitRefTransactionCapability' }, value => requireThat(value.gitExecutable.sha256 === value.gitRefTransactionCapability.gitExecutableSha256, 'Git capability executable'))
define('Wave0aBoundControlAuthority', { provisioningApprovalIdentity: 'ApprovalIdentity', controlSourceRecordIdentity: 'FileIdentity', authorityRootIdentity: 'DirectoryHandleIdentity', credentialExecutionAuthorityIdentity: 'FileIdentity', credentialExecutionAuthoritySha256Identity: 'FileIdentity', stageMinusOneLoaderIdentity: 'FileIdentity', bootstrapProgramIdentity: 'FileIdentity', githubLifecycleRetirementRootIdentity: 'DirectoryHandleIdentity', externalTools: 'ExternalToolAuthority' }, value => {
  pathEquals(value.externalTools.credentialExecutionAuthority.canonicalPath, value.credentialExecutionAuthorityIdentity.canonicalPath)
  requireThat(value.externalTools.credentialExecutionAuthority.sha256 === value.credentialExecutionAuthorityIdentity.sha256, 'credential authority digest')
  for (const key of ['credentialExecutionAuthorityIdentity', 'credentialExecutionAuthoritySha256Identity', 'stageMinusOneLoaderIdentity', 'bootstrapProgramIdentity', 'githubLifecycleRetirementRootIdentity']) requireThat(inside(value[key].canonicalPath, value.authorityRootIdentity.canonicalPath), 'control authority containment')
})
const preBundleMemberFields = { ...repoFields, byteSize: integer(1, 4194304) }
define('PreCampaignToolBundlePlan', { candidateHeadSha: 'LowercaseSha', entrypoints: shape({ proposal: 'RepoObjectIdentity', lifecycle: 'RepoObjectIdentity' }), members: array(shape(preBundleMemberFields), 1, 128), memberCount: integer(1, 128), totalBytes: integer(1, 67108864), tupleSha256: 'LowercaseSha256' }, value => {
  const paths = value.members.map(member => member.repositoryPath)
  requireThat(paths.every((path, index) => !index || paths[index - 1] < path) && value.memberCount === value.members.length && value.totalBytes === value.members.reduce((total, member) => total + member.byteSize, 0) && value.tupleSha256 === hash(value.members), 'pre-campaign bundle tuple')
  for (const member of value.members) requireThat(member.containingCommitSha === value.candidateHeadSha, 'bundle candidate head')
  for (const [role, path] of [['proposal', 'tools/main-consolidation/create-wave0a-proposal.mjs'], ['lifecycle', 'tools/main-consolidation/verify-github-atomic-pr-lifecycle.mjs']]) { requireThat(value.entrypoints[role].repositoryPath === path, 'bundle entrypoint path'); const member = value.members.find(entry => entry.repositoryPath === path); requireThat(member !== undefined, 'bundle entrypoint membership'); const { byteSize, ...identity } = member; same(value.entrypoints[role], identity, 'bundle entrypoint identity') }
})
define('InstalledPreCampaignToolBundleIdentity', { root: 'DirectoryHandleIdentity', manifest: 'FileIdentity', proposalEntrypoint: 'FileIdentity', lifecycleEntrypoint: 'FileIdentity', members: array('FileIdentity', 1, 128), memberCount: integer(1, 128), totalBytes: integer(1, 67108864), tupleSha256: 'LowercaseSha256' }, value => {
  requireThat(value.memberCount === value.members.length && BigInt(value.totalBytes) === value.members.reduce((sum, member) => sum + BigInt(member.size), 0n) && value.tupleSha256 === hash(value.members), 'installed bundle tuple')
  value.members.forEach((member, index) => { requireThat(inside(member.canonicalPath, value.root.canonicalPath) && BigInt(member.size) > 0n && BigInt(member.size) <= 4194304n, 'installed member containment/cap'); if (index) requireThat(pathKey(value.members[index - 1].canonicalPath) < pathKey(member.canonicalPath), 'installed member order') })
  for (const key of ['proposalEntrypoint', 'lifecycleEntrypoint']) requireThat(value.members.filter(member => equal(member, value[key])).length === 1, 'installed entrypoint membership')
  requireThat(!samePath(value.proposalEntrypoint.canonicalPath, value.lifecycleEntrypoint.canonicalPath) && inside(value.manifest.canonicalPath, value.root.canonicalPath), 'installed bundle paths')
})
const outputSpecs = [
  ['provisioningConsumptionClaim', 'provisioning_consumption_claim_directory'], ['seedRoot', 'seed_root'], ['controlSourceRecord', 'control_source_record', `${S}wave0a-control-source-record/v1`], ['authorityRoot', 'authority_root'], ['credentialExecutionAuthority', 'credential_execution_authority', `${S}wave0a-credential-execution-authority/v1`], ['credentialExecutionAuthoritySha256', 'credential_execution_authority_sha256', 'sha256-sidecar/v1'], ['provisioningResult', 'provisioning_result', `${S}wave0a-control-authority-provisioning-result/v1`]
]
define('ExpectedAbsentControlAuthorityPaths', Object.fromEntries(outputSpecs.map(([key, role, schema]) => [key, shape({ role: literal(role), ...absenceFields, expectedKind: literal(schema ? 'regular_file' : 'directory'), ...(schema ? { requiredLinkCount: literal(1), schemaVersion: literal(schema) } : {}) }, absentChild)])), value => requireThat(new Set(Object.values(value).map(target => ordinalFold(pathKey(target.canonicalPath)))).size === 7, 'provision target collision'))
const provisioningBlob = path => shape({ repositoryPath: literal(path), blobOid: 'LowercaseSha', blobSha256: 'LowercaseSha256' })
define('Wave0aControlAuthorityProvisioningRequest', { schemaVersion: literal(`${S}wave0a-control-authority-provisioning-request/v1`), taskId: 'SafeId', requestId: 'SafeId', purpose: literal('provision_final_h_wave0a_control_authority'), mutationAuthority: literal('external_seed_and_control_authority_only'), targetRepository: literal(REPOSITORY), approvedPlanIdentity: 'RepoObjectIdentity', programIndexIdentity: 'RepoObjectIdentity', candidate: 'BeginAdmissionCandidate', localRepositoryScope: 'Wave0aApprovedLocalRepositoryScope', reviewedControlBlobs: tuple([provisioningBlob('tools/main-consolidation/wave0a-bootstrap.ps1'), provisioningBlob('tools/main-consolidation/wave0a-stage-minus-one.ps1')]), preCampaignToolBundle: 'PreCampaignToolBundlePlan', seedContractSha256: 'LowercaseSha256', seedProcedureIdentity: 'FileIdentity', pwshExecutable: namedExecutable('pwsh'), gitExecutable: namedExecutable('git'), ghExecutable: namedExecutable('gh'), nodeExecutable: namedExecutable('node'), credentialHelper: namedExecutable('git-credential-manager'), ghConfigDirectory: 'DirectoryIdentity', outputs: 'ExpectedAbsentControlAuthorityPaths', expiresAt: 'CanonicalUtc' }, value => { requireThat(value.candidate.headSha === value.preCampaignToolBundle.candidateHeadSha && value.candidate.headSha === value.programIndexIdentity.containingCommitSha && value.programIndexIdentity.repositoryPath === INDEX_PATH && value.approvedPlanIdentity.repositoryPath === PLAN_PATH, 'provisioning authority candidate'); for (const target of Object.values(value.outputs)) requireThat(target.observedAt < value.expiresAt, 'expired target observation') })
const userMessageIdentity = transcript => { const { source, threadId, messageId, role, normalizedUtf8Sha256, ordinal } = transcript.userApproval; return { source, threadId, messageId, role, normalizedUtf8Sha256, ordinal } }
define('Wave0aControlAuthorityProvisioningApproval', { schemaVersion: literal(`${S}wave0a-control-authority-provisioning-approval/v1`), requestIdentity: 'ApprovalIdentity', requestSha256: 'LowercaseSha256', trustedTranscript: 'TrustedApprovalTranscript', approvedAt: 'CanonicalUtc', expiresAt: 'CanonicalUtc', provisioningAuthorityIdentity: 'TrustedTranscriptMessageIdentity', maxUses: literal(1) }, value => {
  requireThat(value.requestIdentity.sha256 === value.requestSha256 && value.approvedAt === value.trustedTranscript.userApproval.observedAt && value.approvedAt < value.expiresAt, 'provision approval identity/time')
  same(value.provisioningAuthorityIdentity, userMessageIdentity(value.trustedTranscript), 'provisioning user identity')
  requireThat(value.trustedTranscript.assistantAnnouncement.normalizedText === `Wave 0A control authority provisioning requested requestSha256=${value.requestSha256}` && value.trustedTranscript.assistantPrompt.normalizedText === `WAVE0A-CONTROL-AUTHORITY-PROVISIONING-V1 を承認 requestSha256=${value.requestSha256}`, 'provision approval purpose/request')
})
define('Wave0aControlAuthorityProvisioningConsumptionClaim', { schemaVersion: literal(`${S}wave0a-control-authority-provisioning-consumption-claim/v1`), mutationAuthority: literal('consume_exact_provisioning_approval_once'), requestIdentity: 'ApprovalIdentity', requestSha256: 'LowercaseSha256', provisioningApprovalIdentity: 'ApprovalIdentity', provisioningAuthorityIdentity: 'TrustedTranscriptMessageIdentity', maxUses: literal(1), candidate: shape({ headSha: 'LowercaseSha', treeOid: 'LowercaseSha' }), seedProcedureIdentity: 'FileIdentity', preCampaignToolBundle: 'PreCampaignToolBundlePlan', outputs: 'ExpectedAbsentControlAuthorityPaths', ordinalLayout: tuple([shape({ ordinal: literal(1), role: literal('seed_and_control_source') }), shape({ ordinal: literal(2), role: literal('credential_authority') })]), claimDirectoryIdentity: 'DirectoryHandleIdentity', claimedAt: 'CanonicalUtc' }, value => { requireThat(value.requestIdentity.sha256 === value.requestSha256 && value.candidate.headSha === value.preCampaignToolBundle.candidateHeadSha, 'provision claim binding'); pathEquals(value.claimDirectoryIdentity.canonicalPath, value.outputs.provisioningConsumptionClaim.canonicalPath) })
const ordinalResult = (ordinal, role) => shape({ ordinal: literal(ordinal), role: literal(role), journalHeadIdentity: 'FileIdentity', resultIdentity: 'FileIdentity' })
define('Wave0aControlAuthorityProvisioningResult', { schemaVersion: literal(`${S}wave0a-control-authority-provisioning-result/v1`), mutationAuthority: literal(false), requestIdentity: 'ApprovalIdentity', provisioningApprovalIdentity: 'ApprovalIdentity', consumptionClaimDirectoryIdentity: 'DirectoryHandleIdentity', consumptionClaimIdentity: 'FileIdentity', ordinalResults: tuple([ordinalResult(1, 'seed_and_control_source'), ordinalResult(2, 'credential_authority')]), completedOrdinals: tuple([literal(1), literal(2)]), controlAuthority: 'Wave0aBoundControlAuthority', preCampaignToolBundle: 'InstalledPreCampaignToolBundleIdentity', completedAt: 'CanonicalUtc' }, value => { same(value.provisioningApprovalIdentity, value.controlAuthority.provisioningApprovalIdentity, 'provision result approval'); requireThat(inside(value.consumptionClaimIdentity.canonicalPath, value.consumptionClaimDirectoryIdentity.canonicalPath), 'claim file containment') })
defineValue('ExistingCampaignPredecessor', value => {
  if (value?.kind === 'attempt_finalized') shape({ kind: literal(value.kind), attemptId: 'SafeAttemptId', terminalState: literal('FAILED'), indexEntry: 'FileIdentity', attemptManifest: 'FileIdentity', attemptManifestHash: 'FileIdentity' })(value)
  else shape({ kind: literal('attempt_quarantined'), attemptId: 'SafeAttemptId', recoveryId: 'SafeRecoveryId', indexEntry: 'FileIdentity' })(value)
})
function campaignStartFields(value) { return { ...modeFields(value), ...(value.campaignMode === 'new_campaign' ? { expectedCampaignRoot: literal('absent'), firstRootInstallPolicyIdentity: policyIdentity } : { campaignRootIdentity: 'DirectoryHandleIdentity', campaignAuthority: 'FileIdentity', campaignAuthorityHash: 'FileIdentity', priorCampaignIndexHead: 'IndexHead', predecessor: 'ExistingCampaignPredecessor' }) } }
defineValue('Wave0aCampaignExecutionApprovalRequest', value => {
  shape({ schemaVersion: literal(`${S}wave0a-campaign-execution-approval-request/v2`), taskId: 'SafeId', requestId: 'SafeId', purpose: literal('execute_committed_wave0a_control_plane_plan'), targetRepository: literal(REPOSITORY), approvedPlanIdentity: 'RepoObjectIdentity', programIndexIdentity: 'RepoObjectIdentity', ...candidateFields, localRepositoryScope: 'Wave0aApprovedLocalRepositoryScope', operationContractIdentity: 'RepoObjectIdentity', operationSerializationRoster: tuple(OPERATIONS.map(literal)), operationExecutionDagSha256: 'LowercaseSha256', controlAuthority: 'Wave0aBoundControlAuthority', githubLifecycleAcceptanceApprovalIdentity: 'ApprovalIdentity', githubLifecycleAcceptanceIdentity: 'FileIdentity', lifecycleExpiresAt: 'CanonicalUtc', attemptId: 'SafeAttemptId', campaignRoot: 'AbsolutePath', attemptStartBefore: 'CanonicalUtc', ...campaignStartFields(value) })(value)
  requireThat(value.programIndexIdentity.repositoryPath === INDEX_PATH && value.programIndexIdentity.containingCommitSha === value.headSha && value.operationContractIdentity.repositoryPath === 'tools/main-consolidation/wave0a-mutations.json' && value.operationContractIdentity.containingCommitSha === value.headSha && value.approvedPlanIdentity.repositoryPath === PLAN_PATH && value.attemptStartBefore <= value.lifecycleExpiresAt, 'campaign request authority/time')
  if (value.campaignMode === 'new_campaign') requireThat(value.firstRootInstallPolicyIdentity.containingCommitSha === value.headSha, 'campaign policy head')
  else { pathEquals(value.campaignRootIdentity.canonicalPath, value.campaignRoot); requireThat(value.predecessor.attemptId !== value.attemptId, 'predecessor attempt reuse') }
})
define('Wave0aCampaignExecutionApproval', { schemaVersion: literal(`${S}wave0a-campaign-execution-approval/v2`), requestIdentity: 'ApprovalIdentity', request: 'Wave0aCampaignExecutionApprovalRequest', requestSha256: 'LowercaseSha256', trustedTranscript: 'TrustedApprovalTranscript', approvalText: 'BoundedString', approvedAt: 'CanonicalUtc', capturedAt: 'CanonicalUtc', maxUses: literal(1) }, value => {
  contentFile(value.requestIdentity, value.request); requireThat(value.requestSha256 === value.requestIdentity.sha256, 'campaign request digest')
  const prompt = `WAVE0A-CONTROL-PLANE-V1 を承認 requestSha256=${value.requestSha256}`
  requireThat(value.approvalText === prompt && value.trustedTranscript.assistantPrompt.normalizedText === prompt && value.trustedTranscript.assistantAnnouncement.normalizedText === `Wave 0A campaign execution requested requestSha256=${value.requestSha256}` && value.approvedAt === value.trustedTranscript.userApproval.observedAt && value.capturedAt >= value.approvedAt && value.approvedAt < value.request.attemptStartBefore, 'campaign approval transcript')
})

const memberRoles = ['attempt_incomplete_marker', 'raw_artifact', 'attachment', 'run_discovery', 'event', 'handoff', 'checkpoint', 'manifest', 'manifest_hash', 'campaign_index', 'cleanup_progress', 'worktree_removal_progress', 'operation_request', 'operation_precondition', 'operation_intent', 'operation_claim', 'operation_process_result', 'operation_termination_proof', 'operation_program_progress', 'operation_postcondition', 'operation_receipt', 'campaign_quarantine_preflight', 'campaign_quarantine_approval', 'campaign_quarantine_owner_termination_proof', 'campaign_quarantine_recovery_reservation', 'campaign_quarantine_raw_file', 'campaign_quarantine_preservation_manifest', 'campaign_quarantine_recovery_fence', 'campaign_quarantine_recovery_record']
const memberFields = { memberOrdinal: 'TransactionOrdinal', role: enumeration(memberRoles), byteSize: 'PositiveSafeInteger', sha256: 'LowercaseSha256' }
define('TransactionMemberPlan', memberFields)
define('ExternalResultPlan', { role: literal('handoff_result'), canonicalPath: 'AbsolutePath', byteSize: 'PositiveSafeInteger', sha256: 'LowercaseSha256' })
define('CampaignPublicationSubject', { kind: literal('attempt_publication'), attemptId: 'SafeAttemptId', phase: enumeration(['begin_zero_prefix', 'active']) })
define('CampaignPublicationRecoveryLocator', { recoveryId: 'SafeRecoveryId', path: 'SafeRepositoryPath', schemaVersion: literal(`${S}feature-integration-campaign-publication-recovery/v1`), byteSize: 'PositiveSafeInteger', sha256: 'LowercaseSha256' }, value => requireThat(value.path === `campaign-quarantines/${value.recoveryId}/recovery-record.json`, 'publication recovery path'))
const transactionBase = { schemaVersion: literal(`${S}feature-integration-transaction/v1`), transactionId: 'SafeTransactionId', inputRecordSha256: 'LowercaseSha256', members: array('TransactionMemberPlan', 1, 9999), createdAt: 'CanonicalUtc' }
const attemptTransaction = { scope: literal('attempt'), attemptId: 'SafeAttemptId', priorEventSha256: 'LowercaseSha256', priorCampaignIndexHead: 'IndexHead' }
const operationTransaction = { ...attemptTransaction, scope: literal('operation'), operationInstanceId: 'Wave0aOperationInstanceId' }
const nativeTransaction = { ...operationTransaction, publicationReservationSha256: 'LowercaseSha256', intentSha256: 'LowercaseSha256', expectedAbsent: literal(true) }
const nativeVariants = {
  publish_progress: { fields: { operationInstanceId: literal('fast-forward-root'), recordKind: literal('program_progress'), effectiveClaim: 'OperationClaimLink', completedPrefix: 'RootFastForwardProgressOrdinal', priorProgressSha256: nullable('LowercaseSha256') }, role: 'operation_program_progress' },
  publish_claim: { fields: { recordKind: literal('claim'), claimOrdinal: 'OperationClaimOrdinal', priorClaim: nullable('OperationClaimLink'), priorTerminationProof: nullable('OperationTerminationProofLink'), coordinationEntry: 'OperationCoordinationEntry' }, role: 'operation_claim' },
  publish_process_result: { fields: { recordKind: literal('process_result'), effectiveClaim: 'OperationClaimLink' }, role: 'operation_process_result' },
  publish_termination_proof: { fields: { recordKind: literal('termination_proof'), provedClaim: 'OperationClaimLink', coordinationEntry: 'OperationCoordinationEntry' }, role: 'operation_termination_proof' },
  publish_cleanup_progress: { fields: { operationInstanceId: literal('cleanup-generated-paths'), recordKind: literal('cleanup_progress'), effectiveClaim: 'OperationClaimLink', chunkOrdinal: integer(1, 98), completedPrefixCount: 'PositiveSafeInteger', priorProgressSha256: nullable('LowercaseSha256'), deletionPlanSha256: 'LowercaseSha256' }, role: 'cleanup_progress' },
  publish_worktree_progress: { fields: { operationInstanceId: literal('remove-feature-worktree'), recordKind: literal('worktree_progress'), effectiveClaim: 'OperationClaimLink', chunkOrdinal: 'WorktreeProgressOrdinal', completedPrefixCount: 'PositiveSafeInteger', priorProgressSha256: nullable('LowercaseSha256'), planSha256: 'LowercaseSha256' }, role: 'worktree_removal_progress' }
}
function requireRoles(value, roles) { same(value.members.map(member => member.role), roles, 'transaction member roles') }
function dynamicRoles(value, prefixRole, suffix) { const count = value.members.length - suffix.length; requireThat(count >= 0, 'transaction role cardinality'); requireRoles(value, [...Array(count).fill(prefixRole), ...suffix]) }
function ownedLink(link, owner) { if (link !== null && link !== undefined) requireThat(link.path.startsWith(`operations/${owner.attemptId}/${owner.operationInstanceId}/`), 'claim/proof owner crossing') }
function claimPredecessor(value) {
  if (value.claimOrdinal === 1) requireThat(value.priorClaim === null && value.priorTerminationProof === null, 'first claim predecessors')
  else { requireThat(value.priorClaim !== null && value.priorTerminationProof !== null && value.priorClaim.ordinal === value.claimOrdinal - 1 && value.priorTerminationProof.ordinal === value.claimOrdinal - 1, 'later claim predecessors'); ownedLink(value.priorClaim, value); ownedLink(value.priorTerminationProof, value) }
}
defineValue('TransactionDescriptor', value => {
  const operation = value?.operation
  let fields
  if (operation === 'begin_with_handoff') fields = { scope: literal('campaign'), operation: literal(operation), ...modeFields(value), attemptId: 'SafeAttemptId', priorCampaignIndexHead: value.campaignMode === 'new_campaign' ? literal(null) : 'IndexHead', readyEventSha256: 'LowercaseSha256', beginAdmission: 'BeginAdmissionCommitBinding' }
  else if (['append', 'append_and_finalize', 'checkpoint', 'create_handoff'].includes(operation)) fields = { ...attemptTransaction, operation: literal(operation), ...(operation === 'append_and_finalize' ? { terminalState: enumeration(['VERIFIED', 'FAILED']) } : operation === 'create_handoff' ? { externalResult: 'ExternalResultPlan' } : {}) }
  else if (operation === 'publish_run_discovery') fields = { ...attemptTransaction, operation: literal(operation), verifiedHandoffSha256: 'LowercaseSha256', expectedHeadSha: 'LowercaseSha', phase: phase => { if (phase?.kind === 'pr') shape({ kind: literal('pr'), expectedEvent: literal('pull_request'), expectedRef: 'SafeBranch' })(phase); else shape({ kind: literal('main'), expectedEvent: literal('workflow_dispatch'), expectedRef: literal('main') })(phase) } }
  else if (operation === 'reserve_intent' || operation === 'publish_receipt') fields = { ...operationTransaction, operation: literal(operation) }
  else if (Object.hasOwn(nativeVariants, operation ?? '')) fields = { ...nativeTransaction, operation: literal(operation), ...nativeVariants[operation].fields }
  else if (operation === 'quarantine') fields = { scope: literal('campaign'), operation: literal(operation), attemptId: 'SafeAttemptId', recoveryId: 'SafeRecoveryId', priorCampaignIndexHead: 'IndexHead', exactDamagedTreeSha256: 'LowercaseSha256', approvalRecordSha256: 'LowercaseSha256', recoveryReservationSha256: 'LowercaseSha256' }
  else if (operation === 'recover_campaign_publication') fields = { scope: literal('campaign'), operation: literal(operation), recoveryId: 'SafeRecoveryId', subject: 'CampaignPublicationSubject', priorCampaignIndexHead: nullable('IndexHead'), recoveryIntentSha256: 'LowercaseSha256', approvalRecordSha256: 'LowercaseSha256', ownerTerminationProofSha256: 'LowercaseSha256', exactDamagedTreeSha256: 'LowercaseSha256', publicationRecovery: 'CampaignPublicationRecoveryLocator', replacementKind: literal('attempt_quarantined') }
  else fail('unknown transaction operation')
  shape({ ...transactionBase, ...fields })(value)
  value.members.forEach((member, index) => requireThat(member.memberOrdinal === String(index + 1).padStart(4, '0'), 'contiguous transaction ordinal'))
  if (operation === 'begin_with_handoff') {
    const fresh = value.campaignMode === 'new_campaign', record = value.beginAdmission.admissionTemplate.record
    requireRoles(value, fresh ? ['attempt_incomplete_marker', ...Array(5).fill('attachment'), 'event', 'campaign_index', 'handoff', 'campaign_index'] : ['campaign_index', 'attempt_incomplete_marker', ...Array(5).fill('attachment'), 'event', 'handoff', 'campaign_index'])
    requireThat(value.readyEventSha256 === value.members.find(member => member.role === 'event').sha256, 'begin READY event digest')
    requireThat(value.campaignMode === value.beginAdmission.campaignMode && value.rootInstall === value.beginAdmission.rootInstall && value.attemptId === record.attemptId && value.createdAt === value.beginAdmission.recordedAt, 'begin descriptor binding')
    if (!fresh) same(value.priorCampaignIndexHead, record.priorCampaignIndexHead, 'existing admission prior head')
  } else if (operation === 'append') dynamicRoles(value, 'attachment', ['event'])
  else if (operation === 'append_and_finalize') dynamicRoles(value, 'attachment', ['event', 'manifest', 'manifest_hash', 'campaign_index'])
  else if (operation === 'checkpoint') dynamicRoles(value, 'attachment', ['checkpoint', 'campaign_index'])
  else if (operation === 'create_handoff') requireRoles(value, ['handoff', 'campaign_index'])
  else if (operation === 'publish_run_discovery') requireRoles(value, ['run_discovery'])
  else if (operation === 'reserve_intent') { integer(1, 7)(value.members.length - 2); requireRoles(value, ['operation_request', ...Array(value.members.length - 2).fill('operation_precondition'), 'operation_intent']) }
  else if (operation === 'publish_receipt') { integer(1, 3)(value.members.length - 1); requireRoles(value, [...Array(value.members.length - 1).fill('operation_postcondition'), 'operation_receipt']) }
  else if (Object.hasOwn(nativeVariants, operation)) {
    requireRoles(value, [nativeVariants[operation].role]); requireThat(value.inputRecordSha256 === value.publicationReservationSha256, 'native reservation/input binding')
    for (const key of ['effectiveClaim', 'provedClaim']) ownedLink(value[key], value)
    if (value.coordinationEntry) requireThat(value.coordinationEntry.operationInstanceId === value.operationInstanceId, 'coordination operation binding')
    if (operation === 'publish_claim') claimPredecessor(value)
    if (Object.hasOwn(value, 'priorProgressSha256')) requireThat((value.completedPrefix ?? value.chunkOrdinal) === 1 ? value.priorProgressSha256 === null : value.priorProgressSha256 !== null, 'progress predecessor nullability')
  } else if (operation === 'quarantine') dynamicRoles(value, 'raw_artifact', ['manifest', 'campaign_index'])
  else { requireRoles(value, ['campaign_quarantine_recovery_record', 'campaign_index']); requireThat(value.publicationRecovery.recoveryId === value.recoveryId && (value.subject.phase === 'begin_zero_prefix') === (value.priorCampaignIndexHead === null), 'publication recovery owner/head') }
  if (value.recoveryId) requireThat(value.recoveryId !== value.transactionId, 'recovery/transaction identity reuse')
  if (operation === 'reserve_intent' || operation === 'publish_receipt') requireThat(value.inputRecordSha256 === value.members.at(-1).sha256, 'primary operation input digest')
})
export function validateTransactionDescriptor(value) { return validateCampaignPrimitive('TransactionDescriptor', value) }
const publishedMember = shape({ memberOrdinal: 'TransactionOrdinal', byteSize: 'PositiveSafeInteger', sha256: 'LowercaseSha256' })
function receiptShape(value, admission) {
  const fields = { schemaVersion: literal(`${S}feature-integration-transaction-receipt/v1`), transactionId: 'SafeTransactionId', descriptorSha256: 'LowercaseSha256', commitMemberOrdinal: 'TransactionOrdinal', publishedMembers: array(publishedMember, 1, 9999), completionMode: admission ? literal('admission_canonical') : enumeration(['initial', 'recovered']), outcome: literal('committed'), recordedAt: 'CanonicalUtc' }
  if (admission) Object.assign(fields, modeFields(value), { commitDeadlineFence: literal(DEADLINE_FENCE) }, value.campaignMode === 'existing_campaign_new_attempt' ? { admissionCommitMemberOrdinal: literal('0001') } : {})
  shape(fields)(value)
  value.publishedMembers.forEach((member, index) => requireThat(member.memberOrdinal === String(index + 1).padStart(4, '0'), 'receipt ordinal'))
  requireThat(value.commitMemberOrdinal === value.publishedMembers.at(-1).memberOrdinal, 'receipt commit ordinal')
}
defineValue('TransactionReceipt', value => receiptShape(value, false))
defineValue('BeginWithHandoffTransactionReceipt', value => receiptShape(value, true))
export function validateTransactionReceipt(value, descriptor) {
  validateTransactionDescriptor(descriptor)
  validateCampaignPrimitive(descriptor.operation === 'begin_with_handoff' ? 'BeginWithHandoffTransactionReceipt' : 'TransactionReceipt', value)
  requireThat(value.transactionId === descriptor.transactionId && value.descriptorSha256 === hash(descriptor) && value.recordedAt >= descriptor.createdAt, 'transaction receipt descriptor binding')
  same(value.publishedMembers, descriptor.members.map(({ role, ...member }) => member), 'published member tuple')
  if (descriptor.operation === 'begin_with_handoff') requireThat(value.campaignMode === descriptor.campaignMode && value.rootInstall === descriptor.rootInstall && value.recordedAt === descriptor.beginAdmission.recordedAt, 'admission canonical receipt')
  return structuredClone(value)
}
define('AttemptIncompleteMarker', { schemaVersion: literal(`${S}feature-integration-attempt-incomplete/v1`), attemptId: 'SafeAttemptId', beginTransactionId: 'SafeTransactionId', readyEventSha256: 'LowercaseSha256', createdAt: 'CanonicalUtc' })
define('RecoveryReservation', { schemaVersion: literal(`${S}feature-integration-recovery-reservation/v1`), recoveryId: 'SafeRecoveryId', attemptId: 'SafeAttemptId', transactionId: 'SafeTransactionId', priorCampaignIndexHead: 'IndexHead', reasonCode: 'SafeReasonCode', exactDamagedTreeSha256: 'LowercaseSha256', approvalRecordSha256: 'LowercaseSha256', createdAt: 'CanonicalUtc' }, value => requireThat(value.recoveryId !== value.transactionId, 'recovery/transaction identity reuse'))
const attemptLockBase = { schemaVersion: literal(`${S}feature-integration-attempt-publication-lock/v1`), attemptId: 'SafeAttemptId', transactionId: 'SafeTransactionId', inputRecordSha256: 'LowercaseSha256', priorEventSha256: 'LowercaseSha256', priorCampaignIndexHead: 'IndexHead', createdAt: 'CanonicalUtc' }
const nativeLock = { operationInstanceId: 'Wave0aOperationInstanceId', publicationReservationSha256: 'LowercaseSha256' }
const lockVariants = {
  publish_claim: { fields: { ...nativeLock, claimOrdinal: 'OperationClaimOrdinal', finalPath: 'SafeOperationClaimPath' }, path: value => `claims/${String(value.claimOrdinal).padStart(4, '0')}.json` },
  publish_process_result: { fields: { ...nativeLock, effectiveClaim: 'OperationClaimLink', finalPath: 'SafeRepositoryPath' }, path: () => 'process-result.json' },
  publish_termination_proof: { fields: { ...nativeLock, provedClaim: 'OperationClaimLink', finalPath: 'SafeOperationTerminationProofPath' }, path: value => `termination-proofs/${String(value.provedClaim.ordinal).padStart(4, '0')}.json` },
  publish_cleanup_progress: { fields: { ...nativeLock, operationInstanceId: literal('cleanup-generated-paths'), effectiveClaim: 'OperationClaimLink', chunkOrdinal: integer(1, 98), finalPath: 'SafeOperationCleanupProgressPath' }, path: value => `cleanup-progress/${String(value.chunkOrdinal).padStart(4, '0')}.json` },
  publish_progress: { fields: { ...nativeLock, operationInstanceId: literal('fast-forward-root'), effectiveClaim: 'OperationClaimLink', completedPrefix: 'RootFastForwardProgressOrdinal', finalPath: 'SafeOperationProgramProgressPath' }, path: value => `program-progress/${String(value.completedPrefix).padStart(4, '0')}.json` },
  publish_worktree_progress: { fields: { ...nativeLock, operationInstanceId: literal('remove-feature-worktree'), effectiveClaim: 'OperationClaimLink', chunkOrdinal: 'WorktreeProgressOrdinal', finalPath: 'SafeOperationWorktreeProgressPath' }, path: value => `worktree-progress/${String(value.chunkOrdinal).padStart(4, '0')}.json` }
}
defineValue('AttemptPublicationLock', value => {
  const operation = value?.operation
  let fields
  if (['append', 'append_and_finalize', 'checkpoint', 'create_handoff', 'create_root_handoff'].includes(operation)) fields = {}
  else if (operation === 'publish_run_discovery') fields = { phase: enumeration(['pr', 'main']), verifiedHandoffSha256: 'LowercaseSha256' }
  else if (operation === 'reserve_intent' || operation === 'publish_receipt') fields = { operationInstanceId: 'Wave0aOperationInstanceId' }
  else if (Object.hasOwn(lockVariants, operation ?? '')) fields = lockVariants[operation].fields
  else fail('unknown attempt lock operation')
  shape({ ...attemptLockBase, operation: literal(operation), ...fields })(value)
  if (value.finalPath) { requireThat(value.finalPath === `operations/${value.attemptId}/${value.operationInstanceId}/${lockVariants[operation].path(value)}`, 'lock final path owner/ordinal'); requireThat(value.inputRecordSha256 === value.publicationReservationSha256, 'lock reservation/input binding'); for (const key of ['effectiveClaim', 'provedClaim']) ownedLink(value[key], value) }
})
defineValue('CampaignIndexPublicationLock', value => {
  const operation = value?.operation
  const base = { schemaVersion: literal(`${S}feature-integration-campaign-index-publication-lock/v1`), transactionId: 'SafeTransactionId', publisherInvocationId: 'SafeId', publisherProcess: 'WindowsProcessIdentity', publisherSupervisorClaimSha256: 'LowercaseSha256', createdAt: 'CanonicalUtc', operation: literal(operation), inputRecordSha256: 'LowercaseSha256' }
  let fields
  if (operation === 'begin_with_handoff') fields = { ...modeFields(value), attemptId: 'SafeAttemptId', priorCampaignIndexHead: value.campaignMode === 'new_campaign' ? literal(null) : 'IndexHead' }
  else if (['checkpoint', 'create_handoff', 'create_root_handoff', 'append_and_finalize'].includes(operation)) fields = { attemptId: 'SafeAttemptId', priorCampaignIndexHead: 'IndexHead' }
  else if (operation === 'quarantine') fields = { attemptId: 'SafeAttemptId', recoveryId: 'SafeRecoveryId', priorCampaignIndexHead: 'IndexHead' }
  else if (operation === 'recover_campaign_publication') fields = { recoveryId: 'SafeRecoveryId', subject: 'CampaignPublicationSubject', priorCampaignIndexHead: nullable('IndexHead'), recoveryIntentSha256: 'LowercaseSha256', approvalRecordSha256: 'LowercaseSha256', ownerTerminationProofSha256: 'LowercaseSha256', exactDamagedTreeSha256: 'LowercaseSha256', publicationRecoverySha256: 'LowercaseSha256', replacementKind: literal('attempt_quarantined') }
  else fail('unknown campaign lock operation')
  shape({ ...base, ...fields })(value)
  if (value.recoveryId) requireThat(value.recoveryId !== value.transactionId, 'lock recovery/transaction identity reuse')
  if (operation === 'recover_campaign_publication') requireThat((value.subject.phase === 'begin_zero_prefix') === (value.priorCampaignIndexHead === null), 'lock recovery prior head')
})

export function validateCampaignPrimitive(type, value) {
  requireThat(typeof type === 'string' && registry.has(type), 'unknown primitive type name')
  canonicalBytes(value, type === 'FirstRootInstallPlan' ? MAX_PLAN_BYTES : MAX_RECORD_BYTES)
  check(type, value)
  return structuredClone(value)
}
