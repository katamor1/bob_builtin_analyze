import { readFileSync, lstatSync, realpathSync } from "node:fs";
import { createHash } from "node:crypto";
import { types as utilTypes } from "node:util";
import { resolve, relative, isAbsolute, sep } from "node:path";
import { canonicalJson } from "./featureIntegrationProgramPolicy.mjs";
const isProxy = utilTypes.isProxy;
const fail = reason => { throw new TypeError("Gate R: " + reason); };
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
export const gateRDigest = bytes => createHash("sha256").update(bytes).digest("hex");
// The existing canonicalizer rejects accessors, sparse arrays and non-plain data.
// Add global alias/prototype-key rejection before it can inspect any values.
export function gateRCanonicalJson(value) {
  const seen = new Set();
  function guard(v) {
    if (isProxy(v)) fail("proxy object data");
    if (v === null || typeof v !== 'object') return;
    if (seen.has(v)) fail('object alias or cycle');
    seen.add(v);
    const proto = Object.getPrototypeOf(v);
    if (!Array.isArray(v) && proto !== null && proto !== Object.prototype) fail('non-plain object');
    for (const key of Reflect.ownKeys(v)) {
      if (typeof key !== 'string' || ['__proto__', 'prototype', 'constructor'].includes(key)) fail('prototype or symbol key');
      const descriptor = Object.getOwnPropertyDescriptor(v, key);
      if (!Object.hasOwn(descriptor, 'value')) fail('accessor object data');
      guard(descriptor.value);
    }
  }
  guard(value);
  return Buffer.from(JSON.stringify(JSON.parse(canonicalJson(value)), null, 2) + '\n');
}
function inputData(input, label) {
  if (isProxy(input)) fail('proxy object data');
  if (Buffer.isBuffer(input) || input instanceof Uint8Array || typeof input === 'string') {
    const bytes = Buffer.from(input);
    let value; try { value = JSON.parse(bytes); } catch { fail(label + ' invalid canonical JSON'); }
    if (!bytes.equals(gateRCanonicalJson(value))) fail(label + ' noncanonical bytes');
    return value;
  }
  gateRCanonicalJson(input); return input;
}
export function validateGateRPath(value) {
  if (typeof value !== 'string' || !value || value.startsWith('/') || /[:\\\x00-\x1f\x7f]/.test(value) || value.split('/').some(p => !p || p === '.' || p === '..')) fail('invalid repository path');
  return value;
}
function orderedUnique(rows, key, label) {
  const values = rows.map(r => key ? r[key] : r);
  if (values.some((v, i) => i && compare(values[i - 1], v) >= 0)) fail(label + ' duplicate or order');
}
function pathRows(rows, label) {
  orderedUnique(rows, 'path', label);
  const folded = new Set();
  for (const row of rows) { validateGateRPath(row.path); const fold = row.path.toLowerCase(); if (folded.has(fold)) fail(label + ' case alias'); folded.add(fold); }
}
// This reader has no executable authority. Production callers always use the
// fixed module repository root; tests may supply an owned data-fixture root.
export function readGateRContainedFile(dataRoot, repositoryPath) {
  validateGateRPath(repositoryPath);
  const base = resolve(dataRoot), target = resolve(base, ...repositoryPath.split('/'));
  const rel = relative(base, target);
  if (!rel || isAbsolute(rel) || rel === '..' || rel.startsWith('..' + sep)) fail('path escapes repository');
  const physicalEqual = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
  if (lstatSync(base).isSymbolicLink() || !physicalEqual(realpathSync(base), base)) fail('root alias');
  let current = base;
  for (const part of repositoryPath.split('/')) {
    current = resolve(current, part);
    const stat = lstatSync(current);
    if (stat.isSymbolicLink() || !physicalEqual(realpathSync(current), current)) fail('path alias');
  }
  const stat = lstatSync(target);
  if (!stat.isFile() || stat.nlink !== 1) fail('nonregular or linked file');
  return readFileSync(target);
}

export { inputData as gateRInputData, orderedUnique as gateROrderedUnique, pathRows as gateRPathRows };
