import assert from 'node:assert/strict'
import test from 'node:test'
import { carrierPatchName, validateCarrier } from '../carrierPatchPolicy.mjs'

const SHA_A = 'a'.repeat(40)
const SHA_B = 'b'.repeat(40)

test('carrier IDs map to fixed safe patch names', () => {
  assert.equal(carrierPatchName('workflow-a'), 'workflow-a.patch')
  assert.equal(carrierPatchName('processing-c'), 'processing-c.patch')
  for (const invalid of ['../escape', 'workflow/a', 'Workflow-a', '', 'workflow-a.patch']) {
    assert.throws(() => carrierPatchName(invalid), /invalid carrier id/u)
  }
})

test('carrier requires distinct exact SHAs and a non-empty PR or prerequisite mapping', () => {
  assert.throws(() => validateCarrier({ id: 'workflow-a', fromSha: SHA_A, toSha: SHA_A, pullRequests: [1] }), /distinct/u)
  assert.throws(() => validateCarrier({ id: 'workflow-a', fromSha: 'a', toSha: SHA_B, pullRequests: [1] }), /invalid.*SHA/u)
  assert.throws(() => validateCarrier({ id: 'workflow-a', fromSha: SHA_A, toSha: SHA_B, pullRequests: [] }), /mapping/u)
  assert.equal(validateCarrier({ id: 'workflow-a', fromSha: SHA_A, toSha: SHA_B, pullRequests: [143] }), true)
  assert.equal(validateCarrier({ id: 'processing-a', fromSha: SHA_A, toSha: SHA_B, prerequisiteBranches: ['codex/prerequisite'] }), true)
})
