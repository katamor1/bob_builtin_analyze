import test from 'node:test'
import assert from 'node:assert/strict'
import * as policy from '../featureIntegrationCampaignPolicy.mjs'

const legacyPrimitiveNames = [
  'ApprovalIdentity',
  'TrustedTranscriptMessageIdentity',
  'TrustedApprovalTranscript',
  'ApprovalInstructionIdentity',
  'CampaignAuthority',
  'PreCampaignToolBundlePlan',
  'InstalledPreCampaignToolBundleIdentity',
  'ExpectedAbsentControlAuthorityPaths',
  'ExternalToolAuthority',
  'Wave0aBoundControlAuthority',
  'Wave0aControlAuthorityProvisioningRequest',
  'Wave0aControlAuthorityProvisioningApproval',
  'Wave0aControlAuthorityProvisioningConsumptionClaim',
  'Wave0aControlAuthorityProvisioningResult',
  'Wave0aCampaignExecutionApprovalRequest',
  'Wave0aCampaignExecutionApproval'
]

for (const typeName of legacyPrimitiveNames) {
  test(`legacy approval primitive is unknown: ${typeName}`, () => {
    assert.throws(
      () => policy.validateCampaignPrimitive(typeName, {}),
      error => error instanceof TypeError && error.message === `Unknown campaign primitive: ${typeName}`
    )
  })
}

for (const schemaName of [
  'github-lifecycle-acceptance-approval-request/v2',
  'github-lifecycle-acceptance-approval/v3'
]) {
  const schemaVersion = `bob-builtin-analyze/${schemaName}`
  test(`legacy approval attachment schema is unknown: ${schemaName}`, () => {
    assert.throws(
      () => policy.validateAttachmentPayload({ schemaVersion }, { producer: 'github-lifecycle' }),
      error => error instanceof TypeError && error.message === `Unknown attachment schema: ${schemaVersion}`
    )
  })
}
