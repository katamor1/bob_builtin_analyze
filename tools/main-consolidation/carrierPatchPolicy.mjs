const SHA = /^[0-9a-f]{40}$/u
const CARRIER_IDS = new Set([
  'workflow-a',
  'workflow-b',
  'workflow-c',
  'processing-a',
  'processing-b',
  'processing-c'
])

export function carrierPatchName(id) {
  if (!CARRIER_IDS.has(id)) throw new Error('invalid carrier id')
  return `${id}.patch`
}

export function validateCarrier(carrier) {
  carrierPatchName(carrier?.id)
  if (!SHA.test(carrier?.fromSha ?? '') || !SHA.test(carrier?.toSha ?? '')) throw new Error('invalid carrier SHA')
  if (carrier.fromSha === carrier.toSha) throw new Error('carrier SHAs must be distinct')

  const pullRequests = carrier.pullRequests ?? []
  const prerequisiteBranches = carrier.prerequisiteBranches ?? (carrier.branches ?? [])
    .filter((entry) => entry?.pullRequest === undefined)
    .map((entry) => entry?.branch)
  if (!Array.isArray(pullRequests) || !pullRequests.every((number) => Number.isInteger(number) && number > 0) ||
      new Set(pullRequests).size !== pullRequests.length) {
    throw new Error('invalid carrier pull request mapping')
  }
  if (!Array.isArray(prerequisiteBranches) || !prerequisiteBranches.every((branch) => typeof branch === 'string' && branch.length > 0) ||
      new Set(prerequisiteBranches).size !== prerequisiteBranches.length) {
    throw new Error('invalid carrier prerequisite mapping')
  }
  if (pullRequests.length === 0 && prerequisiteBranches.length === 0) throw new Error('carrier requires a non-empty PR or prerequisite mapping')
  return true
}
