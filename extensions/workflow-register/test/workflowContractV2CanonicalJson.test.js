const assert = require("node:assert/strict")
const { createHash } = require("node:crypto")
const test = require("node:test")

function contractJson() {
  return require("../out/core/contractV2/canonicalJson.js")
}

function jsonValue() {
  return require("../out/core/contractV2/jsonValue.js")
}

test("cloneAndFreezeJsonValue returns a detached recursively frozen JSON value", () => {
  const { cloneAndFreezeJsonValue } = jsonValue()
  const source = { nested: { count: 1 }, values: [true, null, "ok"] }

  const clone = cloneAndFreezeJsonValue(source)

  assert.notEqual(clone, source)
  assert.equal(Object.getPrototypeOf(clone), null)
  assert.notEqual(clone.nested, source.nested)
  assert.notEqual(clone.values, source.values)
  assert.equal(Object.isFrozen(clone), true)
  assert.equal(Object.isFrozen(clone.nested), true)
  assert.equal(Object.isFrozen(clone.values), true)
  source.nested.count = 2
  source.values[0] = false
  assert.equal(clone.nested.count, 1)
  assert.deepEqual([...clone.values], [true, null, "ok"])
})

test("cloneAndFreezeJsonValue accepts and safely clones null-prototype records", () => {
  const { cloneAndFreezeJsonValue } = jsonValue()
  const source = Object.create(null)
  Object.defineProperty(source, "__proto__", {
    configurable: true,
    enumerable: true,
    value: "data",
    writable: true
  })
  source.safe = 1

  const clone = cloneAndFreezeJsonValue(source)

  assert.equal(Object.getPrototypeOf(clone), null)
  assert.equal(clone.__proto__, "data")
  assert.equal(clone.safe, 1)
  assert.equal(Object.isFrozen(clone), true)
})

test("ordinary and null-prototype records produce identical canonical evidence", () => {
  const { canonicalJsonBytes, canonicalJsonDigest } = contractJson()
  const ordinary = { b: 2, a: 1 }
  const withoutPrototype = Object.create(null)
  withoutPrototype.a = 1
  withoutPrototype.b = 2

  assert.deepEqual(canonicalJsonBytes(ordinary), canonicalJsonBytes(withoutPrototype))
  assert.equal(canonicalJsonDigest(ordinary), canonicalJsonDigest(withoutPrototype))
})

test("canonical JSON recursively sorts object keys by UTF-16 code units", () => {
  const { canonicalJsonText } = contractJson()
  const value = {
    z: 0,
    "\uE000": 2,
    "\u{10000}": 1,
    nested: { c: 3, a: 1, b: 2 }
  }

  assert.equal(
    canonicalJsonText(value),
    '{"nested":{"a":1,"b":2,"c":3},"z":0,"𐀀":1,"":2}'
  )
})

test("canonical JSON is independent of object insertion order", () => {
  const { canonicalJsonBytes, canonicalJsonDigest, canonicalJsonText } = contractJson()
  const first = { beta: { two: 2, one: 1 }, alpha: true }
  const second = { alpha: true, beta: { one: 1, two: 2 } }

  assert.equal(canonicalJsonText(first), canonicalJsonText(second))
  assert.deepEqual(canonicalJsonBytes(first), canonicalJsonBytes(second))
  assert.equal(canonicalJsonDigest(first), canonicalJsonDigest(second))
})

test("canonical JSON preserves array order", () => {
  const { canonicalJsonText } = contractJson()

  assert.equal(canonicalJsonText({ values: [3, 1, 2] }), '{"values":[3,1,2]}')
})

test("canonicalJsonBytes is compact UTF-8 for the canonical text", () => {
  const { canonicalJsonBytes, canonicalJsonText } = contractJson()
  const value = { emoji: "😀", message: "日本語", lines: "a\r\nb\n" }
  const text = canonicalJsonText(value)
  const bytes = canonicalJsonBytes(value)

  assert.equal(text, '{"emoji":"😀","lines":"a\\r\\nb\\n","message":"日本語"}')
  assert.deepEqual(bytes, Buffer.from(text, "utf8"))
  assert.equal(bytes.toString("utf8"), text)
})

test("canonicalJsonDigest is a prefixed lowercase SHA-256 of canonical bytes", () => {
  const { canonicalJsonBytes, canonicalJsonDigest } = contractJson()
  const value = { b: 2, a: 1 }
  const expected = createHash("sha256").update(canonicalJsonBytes(value)).digest("hex")

  assert.equal(canonicalJsonDigest(value), `sha256:${expected}`)
  assert.match(canonicalJsonDigest(value), /^sha256:[0-9a-f]{64}$/)
})

test("canonicalJsonDigest uses crypto intrinsics captured at module initialization", () => {
  const { canonicalJsonBytes, canonicalJsonDigest } = contractJson()
  const crypto = require("node:crypto")
  const value = { b: 2, a: 1 }
  const expected = `sha256:${createHash("sha256").update(canonicalJsonBytes(value)).digest("hex")}`
  const originalCreateHash = crypto.createHash
  const originalUpdate = crypto.Hash.prototype.update
  const originalDigest = crypto.Hash.prototype.digest
  crypto.createHash = () => {
    throw new Error("patched createHash must not run")
  }
  crypto.Hash.prototype.update = () => {
    throw new Error("patched Hash.update must not run")
  }
  crypto.Hash.prototype.digest = () => {
    throw new Error("patched Hash.digest must not run")
  }
  try {
    assert.equal(canonicalJsonDigest(value), expected)
  } finally {
    crypto.createHash = originalCreateHash
    crypto.Hash.prototype.update = originalUpdate
    crypto.Hash.prototype.digest = originalDigest
  }
})

test("canonical JSON captures its strict clone dependency at module initialization", () => {
  const { canonicalJsonBytes, canonicalJsonDigest, canonicalJsonText } = contractJson()
  const json = jsonValue()
  const descriptor = Object.getOwnPropertyDescriptor(json, "cloneAndFreezeJsonValue")
  const value = { b: 2, a: 1 }
  const invalid = { value: undefined }
  const expectedText = '{"a":1,"b":2}'
  const expectedBytes = Buffer.from(expectedText, "utf8")
  const expectedDigest = `sha256:${createHash("sha256").update(expectedBytes).digest("hex")}`
  let replacementCalls = 0
  let text
  let bytes
  let digest
  const invalidErrors = []
  Object.defineProperty(json, "cloneAndFreezeJsonValue", {
    configurable: true,
    enumerable: true,
    value() {
      replacementCalls += 1
      return null
    },
    writable: true
  })
  try {
    text = canonicalJsonText(value)
    bytes = canonicalJsonBytes(value)
    digest = canonicalJsonDigest(value)
    for (const operation of [canonicalJsonText, canonicalJsonBytes, canonicalJsonDigest]) {
      try {
        operation(invalid)
      } catch (error) {
        invalidErrors.push(error)
      }
    }
  } finally {
    if (descriptor === undefined) delete json.cloneAndFreezeJsonValue
    else Object.defineProperty(json, "cloneAndFreezeJsonValue", descriptor)
  }

  assert.equal(text, expectedText)
  assert.deepEqual(bytes, expectedBytes)
  assert.equal(digest, expectedDigest)
  assert.equal(invalidErrors.length, 3)
  for (const error of invalidErrors) assert.match(String(error), /undefined|JSON/i)
  assert.equal(replacementCalls, 0)
})

test("canonical JSON accepts every JSON primitive", () => {
  const { canonicalJsonText } = contractJson()

  assert.equal(canonicalJsonText(null), "null")
  assert.equal(canonicalJsonText(true), "true")
  assert.equal(canonicalJsonText(false), "false")
  assert.equal(canonicalJsonText(0), "0")
  assert.equal(canonicalJsonText(1.5), "1.5")
  assert.equal(canonicalJsonText("value"), '"value"')
})

test("strict JSON cloning rejects undefined at every position", () => {
  const { cloneAndFreezeJsonValue } = jsonValue()

  assert.throws(() => cloneAndFreezeJsonValue(undefined), /undefined|JSON/i)
  assert.throws(() => cloneAndFreezeJsonValue({ value: undefined }), /undefined|JSON/i)
  assert.throws(() => cloneAndFreezeJsonValue([undefined]), /undefined|JSON/i)
})

test("strict JSON cloning rejects bigint, function, and symbol values", async (t) => {
  const { cloneAndFreezeJsonValue } = jsonValue()
  const cases = [
    ["bigint", 1n],
    ["function", () => undefined],
    ["symbol", Symbol("value")]
  ]

  for (const [name, value] of cases) {
    await t.test(name, () => {
      assert.throws(() => cloneAndFreezeJsonValue({ value }), new RegExp(`${name}|JSON`, "i"))
    })
  }
})

test("strict JSON cloning rejects non-finite numbers and negative zero", async (t) => {
  const { cloneAndFreezeJsonValue } = jsonValue()
  const cases = [NaN, Infinity, -Infinity, -0]

  for (const value of cases) {
    await t.test(String(value), () => {
      assert.throws(() => cloneAndFreezeJsonValue(value), /finite|negative zero|JSON/i)
    })
  }
})

test("strict JSON cloning rejects sparse arrays", () => {
  const { cloneAndFreezeJsonValue } = jsonValue()
  const sparse = []
  sparse.length = 2
  sparse[1] = "present"

  assert.throws(() => cloneAndFreezeJsonValue(sparse), /sparse|JSON/i)
})

test("strict JSON cloning accepts shared aliases but rejects cycles", () => {
  const { cloneAndFreezeJsonValue } = jsonValue()
  const shared = { value: 1 }
  const accepted = cloneAndFreezeJsonValue({ left: shared, right: shared })
  const cycle = {}
  cycle.self = cycle

  assert.equal(accepted.left.value, 1)
  assert.equal(accepted.right.value, 1)
  assert.throws(() => cloneAndFreezeJsonValue(cycle), /cyclic|cycle|JSON/i)
})

test("strict JSON cloning rejects custom prototypes and exotic objects", async (t) => {
  const { cloneAndFreezeJsonValue } = jsonValue()
  class Custom {
    constructor() {
      this.value = 1
    }
  }
  const cases = [
    ["inherited object", Object.create({ inherited: true })],
    ["class instance", new Custom()],
    ["date", new Date(0)],
    ["map", new Map([["value", 1]])],
    ["set", new Set([1])],
    ["typed array", new Uint8Array([1])],
    ["buffer", Buffer.from([1])]
  ]

  for (const [name, value] of cases) {
    await t.test(name, () => {
      assert.throws(() => cloneAndFreezeJsonValue(value), /prototype|ordinary|JSON/i)
    })
  }
})

test("strict JSON cloning rejects Array subclasses", () => {
  const { cloneAndFreezeJsonValue } = jsonValue()
  class CustomArray extends Array {}

  assert.throws(() => cloneAndFreezeJsonValue(new CustomArray(1, 2)), /Array prototype|ordinary|JSON/i)
})

test("strict JSON cloning rejects object accessors without invoking them", () => {
  const { cloneAndFreezeJsonValue } = jsonValue()
  let reads = 0
  const value = {}
  Object.defineProperty(value, "secret", {
    enumerable: true,
    get() {
      reads += 1
      return "leaked"
    }
  })

  assert.throws(() => cloneAndFreezeJsonValue(value), /accessor|JSON/i)
  assert.equal(reads, 0)
})

test("strict JSON cloning rejects array accessors without invoking them", () => {
  const { cloneAndFreezeJsonValue } = jsonValue()
  let reads = 0
  const value = [1]
  Object.defineProperty(value, "0", {
    configurable: true,
    enumerable: true,
    get() {
      reads += 1
      return 1
    }
  })

  assert.throws(() => cloneAndFreezeJsonValue(value), /accessor|JSON/i)
  assert.equal(reads, 0)
})

test("strict JSON cloning rejects non-enumerable data properties", () => {
  const { cloneAndFreezeJsonValue } = jsonValue()
  const object = { visible: true }
  Object.defineProperty(object, "hidden", { enumerable: false, value: true })
  const array = [1]
  Object.defineProperty(array, "0", { configurable: true, enumerable: false, value: 1 })

  assert.throws(() => cloneAndFreezeJsonValue(object), /enumerable|JSON/i)
  assert.throws(() => cloneAndFreezeJsonValue(array), /enumerable|JSON/i)
})

test("strict JSON cloning rejects symbol properties", () => {
  const { cloneAndFreezeJsonValue } = jsonValue()
  const symbol = Symbol("secret")
  const object = { visible: true }
  const array = [1]
  object[symbol] = true
  array[symbol] = true

  assert.throws(() => cloneAndFreezeJsonValue(object), /symbol|JSON/i)
  assert.throws(() => cloneAndFreezeJsonValue(array), /symbol|JSON/i)
})

test("strict JSON cloning rejects non-index array properties", () => {
  const { cloneAndFreezeJsonValue } = jsonValue()
  const value = [1]
  value.extra = true

  assert.throws(() => cloneAndFreezeJsonValue(value), /array propert|index|JSON/i)
})

test("strict JSON cloning rejects object and array proxies before invoking traps", async (t) => {
  const { cloneAndFreezeJsonValue } = jsonValue()

  for (const array of [false, true]) {
    await t.test(array ? "array proxy" : "object proxy", () => {
      const calls = []
      const target = array ? [1] : { value: 1 }
      const proxy = new Proxy(target, {
        get() {
          calls.push("get")
          throw new Error("proxy get trap must not run")
        },
        getOwnPropertyDescriptor() {
          calls.push("getOwnPropertyDescriptor")
          throw new Error("proxy descriptor trap must not run")
        },
        getPrototypeOf() {
          calls.push("getPrototypeOf")
          throw new Error("proxy prototype trap must not run")
        },
        ownKeys() {
          calls.push("ownKeys")
          throw new Error("proxy ownKeys trap must not run")
        }
      })

      assert.throws(() => cloneAndFreezeJsonValue(proxy), /proxy|JSON/i)
      assert.deepEqual(calls, [])
    })
  }
})

test("strict JSON cloning rejects nested and revoked proxies before invoking traps", () => {
  const { cloneAndFreezeJsonValue } = jsonValue()
  let calls = 0
  const nested = new Proxy({ value: 1 }, {
    get() {
      calls += 1
      throw new Error("must not run")
    },
    getOwnPropertyDescriptor() {
      calls += 1
      throw new Error("must not run")
    },
    getPrototypeOf() {
      calls += 1
      throw new Error("must not run")
    },
    ownKeys() {
      calls += 1
      throw new Error("must not run")
    }
  })
  const revocable = Proxy.revocable({ value: 1 }, {})
  revocable.revoke()

  assert.throws(() => cloneAndFreezeJsonValue({ nested }), /proxy|JSON/i)
  assert.throws(() => cloneAndFreezeJsonValue(revocable.proxy), /proxy|JSON/i)
  assert.equal(calls, 0)
})

test("strict JSON cloning uses proxy detection captured at module initialization", () => {
  const { cloneAndFreezeJsonValue } = jsonValue()
  const util = require("node:util")
  const originalIsProxy = util.types.isProxy
  let trapCalls = 0
  const proxy = new Proxy({ value: 1 }, {
    getPrototypeOf() {
      trapCalls += 1
      throw new Error("proxy trap must not run")
    }
  })
  util.types.isProxy = () => false
  try {
    assert.throws(() => cloneAndFreezeJsonValue(proxy), /proxy|JSON/i)
    assert.equal(trapCalls, 0)
  } finally {
    util.types.isProxy = originalIsProxy
  }
})

test("strict JSON cloning rejects lone UTF-16 surrogates in values and keys", () => {
  const { cloneAndFreezeJsonValue } = jsonValue()

  assert.throws(() => cloneAndFreezeJsonValue("\uD800"), /surrogate|Unicode|JSON/i)
  assert.throws(() => cloneAndFreezeJsonValue("\uDC00"), /surrogate|Unicode|JSON/i)
  assert.throws(() => cloneAndFreezeJsonValue({ ["bad\uD800"]: true }), /surrogate|Unicode|JSON/i)
})

test("strict JSON cloning accepts valid surrogate pairs", () => {
  const { cloneAndFreezeJsonValue } = jsonValue()

  assert.equal(cloneAndFreezeJsonValue("😀"), "😀")
  assert.equal(cloneAndFreezeJsonValue({ "😀": "𐀀" })["😀"], "𐀀")
})

test("invalid surrogate property paths are rendered safely without JSON.stringify", () => {
  const { cloneAndFreezeJsonValue } = jsonValue()
  const originalStringify = JSON.stringify
  JSON.stringify = () => {
    throw new Error("JSON.stringify must not render validation paths")
  }
  try {
    assert.throws(
      () => cloneAndFreezeJsonValue({ ["bad\uD800"]: true }),
      (error) => {
        assert.doesNotMatch(error.message, /JSON\.stringify must not/)
        assert.match(error.message, /\\ud800/i)
        return true
      }
    )
  } finally {
    JSON.stringify = originalStringify
  }
})

test("canonical functions use captured JSON serialization intrinsics", () => {
  const { canonicalJsonText } = contractJson()
  const originalStringify = JSON.stringify
  JSON.stringify = () => {
    throw new Error("patched JSON.stringify must not run")
  }
  try {
    assert.equal(canonicalJsonText({ quote: 'a"b', value: 1 }), '{"quote":"a\\\"b","value":1}')
  } finally {
    JSON.stringify = originalStringify
  }
})

test("clone and canonicalization use captured object reflection intrinsics", () => {
  const { canonicalJsonText } = contractJson()
  const originalDescriptors = Object.getOwnPropertyDescriptors
  const originalGetPrototypeOf = Object.getPrototypeOf
  const originalOwnKeys = Reflect.ownKeys
  Object.getOwnPropertyDescriptors = () => {
    throw new Error("patched descriptors must not run")
  }
  Object.getPrototypeOf = () => {
    throw new Error("patched prototype must not run")
  }
  Reflect.ownKeys = () => {
    throw new Error("patched ownKeys must not run")
  }
  try {
    assert.equal(canonicalJsonText({ b: [2, 1], a: true }), '{"a":true,"b":[2,1]}')
  } finally {
    Object.getOwnPropertyDescriptors = originalDescriptors
    Object.getPrototypeOf = originalGetPrototypeOf
    Reflect.ownKeys = originalOwnKeys
  }
})

test("clone and canonicalization do not dispatch through patched Array helpers", () => {
  const { canonicalJsonText } = contractJson()
  const originalPush = Array.prototype.push
  const originalSort = Array.prototype.sort
  Array.prototype.push = () => {
    throw new Error("patched push must not run")
  }
  Array.prototype.sort = () => {
    throw new Error("patched sort must not run")
  }
  try {
    assert.equal(canonicalJsonText({ z: [3, 1], a: { b: 2, a: 1 } }), '{"a":{"a":1,"b":2},"z":[3,1]}')
  } finally {
    Array.prototype.push = originalPush
    Array.prototype.sort = originalSort
  }
})

test("Object.prototype pollution is neither read nor copied", () => {
  const { cloneAndFreezeJsonValue } = jsonValue()
  Object.defineProperty(Object.prototype, "contractV2Poison", {
    configurable: true,
    get() {
      throw new Error("prototype poison must not run")
    }
  })
  try {
    const clone = cloneAndFreezeJsonValue({ safe: true })
    assert.equal(clone.safe, true)
    assert.equal(Object.hasOwn(clone, "contractV2Poison"), false)
  } finally {
    delete Object.prototype.contractV2Poison
  }
})

test("own toJSON is treated only as JSON data", () => {
  const { canonicalJsonText } = contractJson()

  assert.equal(canonicalJsonText({ toJSON: "data", value: 1 }), '{"toJSON":"data","value":1}')
  assert.throws(() => canonicalJsonText({ toJSON() { return "changed" } }), /function|JSON/i)
})

test("canonical numeric rendering follows JSON number syntax after strict validation", () => {
  const { canonicalJsonText } = contractJson()

  assert.equal(canonicalJsonText({ exponent: 1e+30, integer: 1, small: 0.000001 }), '{"exponent":1e+30,"integer":1,"small":0.000001}')
})

test("canonicalJsonBytes returns a fresh detached Buffer", () => {
  const { canonicalJsonBytes } = contractJson()
  const first = canonicalJsonBytes({ value: 1 })
  const second = canonicalJsonBytes({ value: 1 })

  assert.notEqual(first, second)
  first[0] = 0
  assert.equal(second.toString("utf8"), '{"value":1}')
})

test("clone uses its descriptor snapshot when the source changes immediately afterward", () => {
  const modulePath = require.resolve("../out/core/contractV2/jsonValue.js")
  const originalModule = require.cache[modulePath]
  const source = { value: 1 }
  const originalGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors
  let snapshotTaken = false
  Object.getOwnPropertyDescriptors = (candidate) => {
    const snapshot = originalGetOwnPropertyDescriptors(candidate)
    if (candidate === source) {
      snapshotTaken = true
      source.value = 2
    }
    return snapshot
  }
  delete require.cache[modulePath]

  try {
    const { cloneAndFreezeJsonValue } = require(modulePath)
    const clone = cloneAndFreezeJsonValue(source)
    assert.equal(snapshotTaken, true)
    assert.equal(source.value, 2)
    assert.equal(clone.value, 1)
  } finally {
    Object.getOwnPropertyDescriptors = originalGetOwnPropertyDescriptors
    delete require.cache[modulePath]
    if (originalModule !== undefined) require.cache[modulePath] = originalModule
  }
})

test("frozen and sealed ordinary JSON containers remain valid inputs", () => {
  const { canonicalJsonText } = contractJson()
  const frozen = Object.freeze({ nested: Object.freeze([1, 2]) })
  const sealed = Object.seal({ b: 2, a: 1 })

  assert.equal(canonicalJsonText(frozen), '{"nested":[1,2]}')
  assert.equal(canonicalJsonText(sealed), '{"a":1,"b":2}')
})
