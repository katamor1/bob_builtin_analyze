import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import * as policy from '../featureIntegrationCampaignPolicy.mjs'

// Synthetic, non-authorizing identities. Content hashes identify these literal
// in-memory bytes, never a purported physical file or an external archive.
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const ordered = value => Array.isArray(value) ? value.map(ordered) : value !== null && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])])) : value
const bytes = value => Buffer.from(`${JSON.stringify(ordered(value))}\n`, 'utf8')
const hash = value => digest(bytes(value))
// JSON fixtures model serialized trees, not JavaScript alias graphs. Expand
// shared leaves so a one-field mutation cannot silently alter its counterpart.
const clone = value => JSON.parse(JSON.stringify(value))
const S = 'bob-builtin-analyze/'
const B = '1'.repeat(40), H = '2'.repeat(40), TREE = '3'.repeat(40)
const AT = '2026-08-23T00:00:00.100Z'
const ATTEMPT = 'wave-0a-20260823T000000Z-4f8a1c2d'
const TX = '4'.repeat(32), RECOVERY = '5'.repeat(32)
const HASH = digest(Buffer.from('synthetic identity input\n'))
const ROOT = 'C:/wave0a/campaign'
const fileBytes = new Map()
const file = (path, content = Buffer.from('synthetic file\n')) => {
  fileBytes.set(path, content)
  return { canonicalPath: path, dev: '1', ino: String(fileBytes.size + 100), size: String(content.length), mtimeNs: '1', ctimeNs: '1', sha256: digest(content) }
}
const dir = path => ({ canonicalPath: path, dev: '1', ino: String(path.length + 100), attributes: '16', reparseTag: '0' })
const directory = path => ({ canonicalPath: path, dev: '1', ino: String(path.length + 100), mtimeNs: '1', ctimeNs: '1', entryCount: 0, treeSha256: hash([]) })
const repo = path => ({ repositoryPath: path, containingCommitSha: H, blobOid: B, blobSha256: HASH })
const PLAN = repo('docs/superpowers/plans/2026-08-23-feature-integration-program-index-and-wave-0a.md')
const INDEX = repo('tools/main-consolidation/feature-integration-program-index.json')
const INDEX_HEAD = { sequence: 2, path: 'campaign-index/0002-operator_handoff.json', sha256: HASH }
const SUBJECT = { kind: 'boundary', id: 'WAVE-0A-CONTROL-PLANE', classification: 'mandatory' }
const DECISION = { kind: 'program_index', phase: 'wave0a_candidate', authorityCommitSha: H, programIndexIdentity: INDEX }
const AUTHORITY = { schemaVersion: `${S}feature-integration-campaign-authority/v1`, programId: 'feature-selection-and-sequential-main-integration', repository: 'katamor1/bob_builtin_analyze', campaignRootLeaf: '2026-08-23-feature-integration-campaign', programIndexIdentity: INDEX, authorityDocuments: [
  { kind: 'design_spec', repositoryPath: 'docs/superpowers/specs/2026-08-23-feature-selection-and-sequential-main-integration-design.md', containingCommitSha: '819d6261d52d8dc7037d7fae8b852ad4b6a52e21', blobOid: 'ccf3f833e32f48e583a6c6fac4796fa30756e1a4', blobSha256: '709872ba8fa3188c666473248bf5196d1131672cfdec388929ecdb8c4c0292f5' },
  { kind: 'implementation_plan', ...PLAN }
], createdAt: AT }
const FIRST_POLICY = { schemaVersion: 'first-root-install-policy/v1', destinationAbsentRequired: true, sameVolumeAtomicRenameRequired: true, noReplaceRequired: true, completeReadyRootRequired: true, noFollowRequired: true, reparsePointFreeRequired: true, maxPlanBytes: 16777216, maxEntries: 16384, maxDepth: 256, maxAggregateRelativePathUtf8Bytes: 67108864, maxFileBytes: 1073741824, maxTotalBytes: 17179869184, maxChunks: 16, maxActionsPerChunk: 1024, maxProgressRecords: 18 }
const FIRST_POLICY_ID = { ...repo('tools/main-consolidation/wave0a-first-root-install-policy.json'), blobSha256: hash(FIRST_POLICY) }
const scope = (() => {
  const common = dir('C:/wave0a/repo/.git')
  return { featureWorktree: dir('C:/wave0a/feature'), rootWorktree: dir('C:/wave0a/repo'), commonGitDirectory: common, objectDirectory: dir(`${common.canonicalPath}/objects`), worktreeRegistryFence: { registrationSet: 'feature_and_root', commonGitDirectory: common, worktreesDirectory: dir(`${common.canonicalPath}/worktrees`), featureAdminDirectory: dir(`${common.canonicalPath}/worktrees/feature`), featureWorktreeGitFile: file('C:/wave0a/feature/.git'), featureAdminGitdirBackpointer: file(`${common.canonicalPath}/worktrees/feature/gitdir`), featureHeadFile: file(`${common.canonicalPath}/worktrees/feature/HEAD`), rootRegistrationKind: 'primary', rootAdminDirectory: common, rootHeadFile: file(`${common.canonicalPath}/HEAD`) } }
})()
const absence = path => ({ canonicalPath: path, parentDirectory: dir(path.slice(0, path.lastIndexOf('/'))), leaf: path.slice(path.lastIndexOf('/') + 1), observation: 'absent_no_follow', reparsePointFree: true, observedAt: AT })
const rootFence = { registrationSet: 'root_only', commonGitDirectory: scope.commonGitDirectory, worktreesDirectory: scope.worktreeRegistryFence.worktreesDirectory, rootRegistrationKind: 'primary', rootAdminDirectory: scope.commonGitDirectory, rootHeadFile: scope.worktreeRegistryFence.rootHeadFile, featureWorktreePath: scope.featureWorktree.canonicalPath, featureWorktreeAbsenceProof: absence(scope.featureWorktree.canonicalPath), featureAdminDirectoryAbsenceProof: absence(scope.worktreeRegistryFence.featureAdminDirectory.canonicalPath) }
const processIdentity = { boot: { bootIdentifier: '11111111-2222-3333-4444-555555555555' }, pid: 100, creationFileTime100ns: '1' }
const coordination = { operationInstanceId: 'publish-branch', coordinationFile: { ...file('C:/wave0a/coordination/publish-branch', Buffer.from([0])), linkCount: 1, attributes: '128', reparseTag: '0' } }
const claim = (operation = 'publish-branch', ordinal = 1) => ({ ordinal, path: `operations/${ATTEMPT}/${operation}/claims/${String(ordinal).padStart(4, '0')}.json`, sha256: HASH })
const proof = (operation = 'publish-branch', ordinal = 1) => ({ ordinal, path: `operations/${ATTEMPT}/${operation}/termination-proofs/${String(ordinal).padStart(4, '0')}.json`, sha256: HASH })
const contentIdentity = { schemaVersion: 'closed-initial-control-binding/v1', byteLength: 3, sha256: digest(Buffer.from('{}\n')) }
const stagedBinding = { relativePath: 'local/Candidate/held/closed-initial-control-binding.json', contentIdentity }
const installedBinding = { fileIdentity: file('C:/wave0a/controller/local/Candidate/held/closed-initial-control-binding.json', Buffer.from('{}\n')), contentIdentity }
const target = (role, leaf, version, cap) => ({ role, canonicalPath: `C:/wave0a/result/${leaf}`, parentIdentity: dir('C:/wave0a/result'), leaf, schemaVersion: `${S}${version}/v1`, byteCap: cap, expectedAbsent: true, requiredFileType: 'regular_file', requiredLinkCount: 1 })
const resultTarget = target('begin_admission_commit_result', 'commit.json', 'wave0a-begin-admission-commit-result', 1048576)
const planTarget = target('first_root_install_plan', 'plan.json', 'wave0a-first-root-install-plan', 16777216)
const candidate = { baseSha: B, headSha: H, treeOid: TREE, branch: 'codex/wave0a-candidate' }
const templateBase = { schemaVersion: `${S}wave0a-begin-admission-template/v1`, admissionNonce: 'synthetic-nonce', campaignExecutionApprovalIdentity: file('C:/wave0a/approval.json'), campaignExecutionRequestSha256: HASH, approvedPlanIdentity: PLAN, programIndexIdentity: INDEX, candidate, localRepositoryScope: scope, campaignRoot: ROOT, attemptId: ATTEMPT, attemptStartBefore: '2026-08-23T00:00:00.900Z', lifecycleExpiresAt: '2026-08-23T01:00:00.000Z', fixedRelativePathPlanSha256: HASH, initialControlBinding: stagedBinding, commitResultTarget: resultTarget }
const destination = { canonicalPath: ROOT, parentIdentity: dir('C:/wave0a'), leaf: 'campaign', observation: 'absent', observedAt: AT }
const templateNewRecord = { ...templateBase, campaignMode: 'new_campaign', rootInstall: 'atomic_first_root', destination, firstRootInstallPolicyIdentity: FIRST_POLICY_ID, stagedRoot: dir('C:/wave0a/staged'), firstRootInstallPlanTarget: planTarget }
const templateExistingRecord = { ...templateBase, campaignMode: 'existing_campaign_new_attempt', rootInstall: 'existing_root_transaction', campaignRootIdentity: dir(ROOT), stagedTransactionRoot: dir(`${ROOT}/campaign-transactions/${TX}`), priorCampaignIndexHead: INDEX_HEAD }
const templateNew = { template: file('C:/wave0a/new-template.json', bytes(templateNewRecord)), record: templateNewRecord }
const templateExisting = { template: file('C:/wave0a/existing-template.json', bytes(templateExistingRecord)), record: templateExistingRecord }
const begin = template => ({ schemaVersion: `${S}wave0a-begin-result/v1`, kind: 'begin_result', mutationAuthority: false, admissionNonce: template.record.admissionNonce, campaignMode: template.record.campaignMode, rootInstall: template.record.rootInstall, admissionTemplate: template })
const binding = template => ({ admissionNonce: template.record.admissionNonce, approvedAt: '2026-08-23T00:00:00.000Z', recordedAt: AT, attemptStartBefore: template.record.attemptStartBefore, lifecycleExpiresAt: template.record.lifecycleExpiresAt, initialControlBinding: { staged: stagedBinding, postCommit: installedBinding }, commitDeadlineFence: 'native_checked_immediately_before_publish_with_lifecycle_expiry', campaignMode: template.record.campaignMode, rootInstall: template.record.rootInstall, admissionTemplate: template })
const transient = { campaignIndexPublicationLock: absence('C:/wave0a/staged/campaign-index-publication.lock'), attemptPublicationLock: absence(`C:/wave0a/staged/attempts/${ATTEMPT}/.publication-lock`), recoveryFenceRoot: absence('C:/wave0a/staged/campaign-publication-recovery.lock') }
transient.tupleSha256 = hash(Object.entries(transient).map(([key, value]) => [key, value]))
const finalized = { root: directory('C:/wave0a/staged'), campaignAuthority: file('C:/wave0a/staged/campaign.json'), campaignAuthorityHash: file('C:/wave0a/staged/campaign.sha256'), attemptIncompleteMarker: file(`C:/wave0a/staged/attempts/${ATTEMPT}/.attempt-incomplete`), attemptStarted: file('C:/wave0a/staged/campaign-index/0001-attempt_started.json'), readyEvent: file(`C:/wave0a/staged/attempts/${ATTEMPT}/events/0001-ready.json`), readyHandoff: file(`C:/wave0a/staged/handoffs/${ATTEMPT}-0002-ready.json`), beginTransactionDescriptor: file(`C:/wave0a/staged/campaign-transactions/${TX}/transaction.json`), beginTransactionReceipt: file(`C:/wave0a/staged/campaign-transactions/${TX}/transaction-receipt.json`), transientAbsence: transient, initialControlBinding: stagedBinding, treeSha256: hash([]) }
const projectPath = path => ROOT + path.slice('C:/wave0a/staged'.length)
const plannedAbsences = Object.fromEntries(Object.entries(transient).filter(([key]) => key !== 'tupleSha256').map(([key, value]) => [key, { destinationPath: projectPath(value.canonicalPath), sourceProof: value }]))
plannedAbsences.tupleSha256 = hash(Object.entries(plannedAbsences).map(([key, value]) => [key, value]))
const installedAbsences = Object.fromEntries(Object.entries(transient).filter(([key]) => key !== 'tupleSha256').map(([key, value]) => [key, { disposition: 'installed_absence_by_atomic_root_rename', canonicalPath: projectPath(value.canonicalPath), parentDirectoryObject: { dev: value.parentDirectory.dev, ino: value.parentDirectory.ino, attributes: value.parentDirectory.attributes, reparseTag: '0' }, leaf: value.leaf, observation: 'absent_no_follow_at_publish', reparsePointFree: true }]))
installedAbsences.tupleSha256 = hash(Object.entries(installedAbsences).map(([key, value]) => [key, value]))
const installPlan = { schemaVersion: `${S}wave0a-first-root-install-plan/v1`, mutationAuthority: false, rootInstall: 'atomic_first_root', target: planTarget, firstRootInstallPolicyIdentity: FIRST_POLICY_ID, destination, admissionTemplate: templateNew, finalizedReadyRoot: finalized, publishAction: { kind: 'rename_directory_no_replace_same_volume', sourceRoot: templateNewRecord.stagedRoot, destinationParent: destination.parentIdentity, destinationLeaf: destination.leaf, sourceVolumeSerial: '1', destinationVolumeSerial: '1', expectedDestinationAbsent: true }, postPublish: { root: { destinationPath: ROOT, sourceIdentity: finalized.root }, ...Object.fromEntries(['attemptStarted', 'readyHandoff', 'beginTransactionDescriptor', 'beginTransactionReceipt'].map(key => [key, { destinationPath: projectPath(finalized[key].canonicalPath), sourceIdentity: finalized[key] }])), transientAbsence: plannedAbsences, initialControlBinding: { disposition: 'unchanged_external', sourceIdentity: installedBinding.fileIdentity, contentIdentity } }, createdAt: AT }
const commitResult = template => {
  const sequence = template.record.campaignMode === 'new_campaign' ? 1 : template.record.priorCampaignIndexHead.sequence + 1
  const path = `campaign-index/${String(sequence).padStart(4, '0')}-attempt_started.json`
  const attemptStarted = file(`${ROOT}/${path}`)
  return { schemaVersion: `${S}wave0a-begin-admission-commit-result/v1`, mutationAuthority: false, attemptStarted, admissionCommitIndexHead: { sequence, path, sha256: attemptStarted.sha256 }, readyHandoff: file(`${ROOT}/handoffs/${ATTEMPT}-${String(sequence + 1).padStart(4, '0')}-ready.json`), campaignIndexHead: { sequence: sequence + 1, path: `campaign-index/${String(sequence + 1).padStart(4, '0')}-operator_handoff.json`, sha256: HASH }, beginTransactionDescriptor: file(`${ROOT}/campaign-transactions/${TX}/transaction.json`), beginTransactionReceipt: file(`${ROOT}/campaign-transactions/${TX}/transaction-receipt.json`), initialControlBinding: installedBinding, commitBinding: binding(template), installedRoot: dir(ROOT), ...(template.record.campaignMode === 'new_campaign' ? { firstRootInstallPlan: file(planTarget.canonicalPath, bytes(installPlan)), transientAbsence: installedAbsences } : {}) }
}
const observation = (template, status) => {
  const result = commitResult(template)
  return { schemaVersion: `${S}wave0a-begin-admission-observation/v1`, mutationAuthority: false, beginResult: file(`C:/wave0a/${template.record.campaignMode}-begin.json`, bytes(begin(template))), rootInstallStatus: status, admissionTemplateIdentity: template, admissionCommitIndexHead: status === 'prepared' ? null : result.admissionCommitIndexHead, admissionCommitResult: ['prepared', 'admission_committed_suffix_pending'].includes(status) ? null : { identity: status === 'committed' ? file(resultTarget.canonicalPath, bytes(result)) : null, result } }
}
const members = roles => roles.map((role, index) => ({ memberOrdinal: String(index + 1).padStart(4, '0'), role, byteSize: 3, sha256: digest(Buffer.from('{}\n')) }))
const descriptor = (operation, extra, roles) => ({ schemaVersion: `${S}feature-integration-transaction/v1`, transactionId: TX, inputRecordSha256: ['reserve_intent', 'publish_receipt'].includes(operation) ? digest(Buffer.from('{}\n')) : HASH, members: members(roles), createdAt: AT, scope: 'attempt', operation, attemptId: ATTEMPT, priorEventSha256: HASH, priorCampaignIndexHead: INDEX_HEAD, ...extra })
const descriptors = [
  ['new begin', { schemaVersion: `${S}feature-integration-transaction/v1`, transactionId: TX, inputRecordSha256: HASH, members: members(['attempt_incomplete_marker', ...Array(5).fill('attachment'), 'event', 'campaign_index', 'handoff', 'campaign_index']), createdAt: AT, scope: 'campaign', operation: 'begin_with_handoff', campaignMode: 'new_campaign', rootInstall: 'atomic_first_root', attemptId: ATTEMPT, priorCampaignIndexHead: null, readyEventSha256: HASH, beginAdmission: binding(templateNew) }],
  ['existing begin', { schemaVersion: `${S}feature-integration-transaction/v1`, transactionId: TX, inputRecordSha256: HASH, members: members(['campaign_index', 'attempt_incomplete_marker', ...Array(5).fill('attachment'), 'event', 'handoff', 'campaign_index']), createdAt: AT, scope: 'campaign', operation: 'begin_with_handoff', campaignMode: 'existing_campaign_new_attempt', rootInstall: 'existing_root_transaction', attemptId: ATTEMPT, priorCampaignIndexHead: INDEX_HEAD, readyEventSha256: HASH, beginAdmission: binding(templateExisting) }],
  ['append', descriptor('append', {}, ['attachment', 'event'])],
  ['finalize', descriptor('append_and_finalize', { terminalState: 'FAILED' }, ['attachment', 'event', 'manifest', 'manifest_hash', 'campaign_index'])],
  ['checkpoint', descriptor('checkpoint', {}, ['attachment', 'checkpoint', 'campaign_index'])],
  ['handoff', descriptor('create_handoff', { externalResult: { role: 'handoff_result', canonicalPath: 'C:/wave0a/result/handoff.json', byteSize: 3, sha256: digest(Buffer.from('{}\n')) } }, ['handoff', 'campaign_index'])],
  ['run discovery', descriptor('publish_run_discovery', { verifiedHandoffSha256: HASH, expectedHeadSha: H, phase: { kind: 'pr', expectedEvent: 'pull_request', expectedRef: candidate.branch } }, ['run_discovery'])],
  ['reserve intent', descriptor('reserve_intent', { scope: 'operation', operationInstanceId: 'publish-branch' }, ['operation_request', 'operation_precondition', 'operation_intent'])],
  ['publish receipt', descriptor('publish_receipt', { scope: 'operation', operationInstanceId: 'publish-branch' }, ['operation_postcondition', 'operation_receipt'])],
  ['root progress', descriptor('publish_progress', { scope: 'operation', operationInstanceId: 'fast-forward-root', publicationReservationSha256: HASH, recordKind: 'program_progress', effectiveClaim: claim('fast-forward-root'), completedPrefix: 1, priorProgressSha256: null, intentSha256: HASH, expectedAbsent: true }, ['operation_program_progress'])],
  ['claim', descriptor('publish_claim', { scope: 'operation', operationInstanceId: 'publish-branch', publicationReservationSha256: HASH, recordKind: 'claim', claimOrdinal: 1, priorClaim: null, priorTerminationProof: null, coordinationEntry: coordination, intentSha256: HASH, expectedAbsent: true }, ['operation_claim'])],
  ['process result', descriptor('publish_process_result', { scope: 'operation', operationInstanceId: 'publish-branch', publicationReservationSha256: HASH, recordKind: 'process_result', effectiveClaim: claim(), intentSha256: HASH, expectedAbsent: true }, ['operation_process_result'])],
  ['termination proof', descriptor('publish_termination_proof', { scope: 'operation', operationInstanceId: 'publish-branch', publicationReservationSha256: HASH, recordKind: 'termination_proof', provedClaim: claim(), coordinationEntry: coordination, intentSha256: HASH, expectedAbsent: true }, ['operation_termination_proof'])],
  ['cleanup progress', descriptor('publish_cleanup_progress', { scope: 'operation', operationInstanceId: 'cleanup-generated-paths', publicationReservationSha256: HASH, recordKind: 'cleanup_progress', effectiveClaim: claim('cleanup-generated-paths'), chunkOrdinal: 1, completedPrefixCount: 1, priorProgressSha256: null, intentSha256: HASH, deletionPlanSha256: HASH, expectedAbsent: true }, ['cleanup_progress'])],
  ['worktree progress', descriptor('publish_worktree_progress', { scope: 'operation', operationInstanceId: 'remove-feature-worktree', publicationReservationSha256: HASH, recordKind: 'worktree_progress', effectiveClaim: claim('remove-feature-worktree'), chunkOrdinal: 1, completedPrefixCount: 1, priorProgressSha256: null, intentSha256: HASH, planSha256: HASH, expectedAbsent: true }, ['worktree_removal_progress'])],
  ['attempt quarantine', { schemaVersion: `${S}feature-integration-transaction/v1`, transactionId: TX, inputRecordSha256: HASH, members: members(['raw_artifact', 'manifest', 'campaign_index']), createdAt: AT, scope: 'campaign', operation: 'quarantine', attemptId: ATTEMPT, recoveryId: RECOVERY, priorCampaignIndexHead: INDEX_HEAD, exactDamagedTreeSha256: HASH, approvalRecordSha256: HASH, recoveryReservationSha256: HASH }],
  ['publication recovery', { schemaVersion: `${S}feature-integration-transaction/v1`, transactionId: TX, inputRecordSha256: HASH, members: members(['campaign_quarantine_recovery_record', 'campaign_index']), createdAt: AT, scope: 'campaign', operation: 'recover_campaign_publication', recoveryId: RECOVERY, subject: { kind: 'attempt_publication', attemptId: ATTEMPT, phase: 'begin_zero_prefix' }, priorCampaignIndexHead: null, recoveryIntentSha256: HASH, approvalRecordSha256: HASH, ownerTerminationProofSha256: HASH, exactDamagedTreeSha256: HASH, publicationRecovery: { recoveryId: RECOVERY, path: `campaign-quarantines/${RECOVERY}/recovery-record.json`, schemaVersion: `${S}feature-integration-campaign-publication-recovery/v1`, byteSize: 3, sha256: digest(Buffer.from('{}\n')) }, replacementKind: 'attempt_quarantined' }]
]
const receipt = desc => ({ schemaVersion: `${S}feature-integration-transaction-receipt/v1`, transactionId: desc.transactionId, descriptorSha256: hash(desc), commitMemberOrdinal: desc.members.at(-1).memberOrdinal, publishedMembers: desc.members.map(({ role, ...member }) => member), completionMode: 'initial', outcome: 'committed', recordedAt: AT, ...(desc.operation === 'begin_with_handoff' ? { completionMode: 'admission_canonical', campaignMode: desc.campaignMode, rootInstall: desc.rootInstall, commitDeadlineFence: 'native_checked_immediately_before_publish_with_lifecycle_expiry', ...(desc.campaignMode === 'existing_campaign_new_attempt' ? { admissionCommitMemberOrdinal: '0001' } : {}) } : {}) })
const marker = { schemaVersion: `${S}feature-integration-attempt-incomplete/v1`, attemptId: ATTEMPT, beginTransactionId: TX, readyEventSha256: HASH, createdAt: AT }
const reservation = { schemaVersion: `${S}feature-integration-recovery-reservation/v1`, recoveryId: RECOVERY, attemptId: ATTEMPT, transactionId: TX, priorCampaignIndexHead: INDEX_HEAD, reasonCode: 'damaged_publication', exactDamagedTreeSha256: HASH, approvalRecordSha256: HASH, createdAt: AT }
const lockBase = { schemaVersion: `${S}feature-integration-attempt-publication-lock/v1`, attemptId: ATTEMPT, transactionId: TX, inputRecordSha256: HASH, priorEventSha256: HASH, priorCampaignIndexHead: INDEX_HEAD, createdAt: AT }
const locks = [
  ...['append', 'append_and_finalize', 'checkpoint', 'create_handoff', 'create_root_handoff'].map(operation => ({ ...lockBase, operation })),
  ...['pr', 'main'].map(phase => ({ ...lockBase, operation: 'publish_run_discovery', phase, verifiedHandoffSha256: HASH })),
  ...['reserve_intent', 'publish_receipt'].map(operation => ({ ...lockBase, operation, operationInstanceId: 'publish-branch' })),
  { ...lockBase, operation: 'publish_claim', operationInstanceId: 'publish-branch', publicationReservationSha256: HASH, claimOrdinal: 1, finalPath: claim().path },
  { ...lockBase, operation: 'publish_process_result', operationInstanceId: 'publish-branch', publicationReservationSha256: HASH, effectiveClaim: claim(), finalPath: `operations/${ATTEMPT}/publish-branch/process-result.json` },
  { ...lockBase, operation: 'publish_termination_proof', operationInstanceId: 'publish-branch', publicationReservationSha256: HASH, provedClaim: claim(), finalPath: proof().path },
  { ...lockBase, operation: 'publish_cleanup_progress', operationInstanceId: 'cleanup-generated-paths', publicationReservationSha256: HASH, effectiveClaim: claim('cleanup-generated-paths'), chunkOrdinal: 1, finalPath: `operations/${ATTEMPT}/cleanup-generated-paths/cleanup-progress/0001.json` },
  { ...lockBase, operation: 'publish_progress', operationInstanceId: 'fast-forward-root', publicationReservationSha256: HASH, effectiveClaim: claim('fast-forward-root'), completedPrefix: 1, finalPath: `operations/${ATTEMPT}/fast-forward-root/program-progress/0001.json` },
  { ...lockBase, operation: 'publish_worktree_progress', operationInstanceId: 'remove-feature-worktree', publicationReservationSha256: HASH, effectiveClaim: claim('remove-feature-worktree'), chunkOrdinal: 1, finalPath: `operations/${ATTEMPT}/remove-feature-worktree/worktree-progress/0001.json` }
]
const campaignLockBase = { schemaVersion: `${S}feature-integration-campaign-index-publication-lock/v1`, transactionId: TX, publisherInvocationId: 'publisher-1', publisherProcess: processIdentity, publisherSupervisorClaimSha256: HASH, createdAt: AT }
const campaignLocks = [
  ...[templateNew, templateExisting].map(template => ({ ...campaignLockBase, operation: 'begin_with_handoff', campaignMode: template.record.campaignMode, rootInstall: template.record.rootInstall, attemptId: ATTEMPT, inputRecordSha256: HASH, priorCampaignIndexHead: template === templateNew ? null : INDEX_HEAD })),
  ...['checkpoint', 'create_handoff', 'create_root_handoff', 'append_and_finalize'].map(operation => ({ ...campaignLockBase, operation, attemptId: ATTEMPT, inputRecordSha256: HASH, priorCampaignIndexHead: INDEX_HEAD })),
  { ...campaignLockBase, operation: 'quarantine', attemptId: ATTEMPT, recoveryId: RECOVERY, inputRecordSha256: HASH, priorCampaignIndexHead: INDEX_HEAD },
  { ...campaignLockBase, operation: 'recover_campaign_publication', recoveryId: RECOVERY, subject: { kind: 'attempt_publication', attemptId: ATTEMPT, phase: 'begin_zero_prefix' }, inputRecordSha256: HASH, priorCampaignIndexHead: null, recoveryIntentSha256: HASH, approvalRecordSha256: HASH, ownerTerminationProofSha256: HASH, exactDamagedTreeSha256: HASH, publicationRecoverySha256: HASH, replacementKind: 'attempt_quarantined' }
]
const announcement = `Wave 0A plan committed planCommit=${PLAN.containingCommitSha} planBlob=${PLAN.blobOid} planSha256=${PLAN.blobSha256}`
const approvalText = `WAVE0A-EXACT-LEASE-MERGE-V1 を承認 planCommit=${PLAN.containingCommitSha} planBlob=${PLAN.blobOid} planSha256=${PLAN.blobSha256}`
const transcript = { source: 'codex_trusted_transcript_v1', threadId: 'synthetic-thread', ...Object.fromEntries([['assistantAnnouncement', 'assistant_announcement', announcement], ['assistantPrompt', 'assistant_prompt', approvalText], ['userApproval', 'user_approval', approvalText]].map(([key, role, text], index) => [key, { source: 'codex_trusted_transcript_v1', threadId: 'synthetic-thread', messageId: `message-${index}`, role, normalizedText: text, normalizedUtf8Sha256: digest(Buffer.from(text)), observedAt: `2026-08-23T00:00:00.00${index}Z`, ordinal: index + 1 }])) }
const approval = { schemaVersion: `${S}feature-integration-approval-instruction/v4`, purpose: 'implement_committed_wave0a_plan_and_exact_lease_addendum', mutationAuthority: false, approvedPlanIdentity: PLAN, trustedTranscript: transcript, approvalText, capturedAt: '2026-08-23T00:00:00.003Z' }
const OPERATIONS = ['publish-branch', 'create-pull-request', 'close-pull-request-abort', 'delete-remote-branch-abort', 'prepare-merge-commit', 'integrate-main-exact-lease', 'fetch-after-integration', 'dispatch-extensions-quality', 'dispatch-workflow-contracts', 'dispatch-code-consistency-review-scaffold', 'dispatch-three-extension-ui-contracts', 'cleanup-generated-paths', 'fast-forward-root', 'remove-feature-worktree', 'delete-local-branch']
const executable = name => ({ logicalName: name, ...file(`C:/wave0a/tools/${name}.exe`), version: 'synthetic-version-1' })
const gitExecutable = executable('git')
const command = { id: 'capability-probe', executable: 'git', argv: ['-c', 'core.hooksPath=NUL', 'version'], cwd: { kind: 'absolute', path: 'C:/wave0a/probe' }, stdinBytes: 0, stdinSha256: digest(Buffer.alloc(0)), stdoutBytes: 0, stderrBytes: 0, stdoutSha256: digest(Buffer.alloc(0)), stderrSha256: digest(Buffer.alloc(0)), startedAt: AT, finishedAt: AT, outcome: 'success', exitCode: 0 }
const coordinationEntries = OPERATIONS.map(operationInstanceId => ({ operationInstanceId, coordinationFile: { ...file(`C:/wave0a/coordination/${operationInstanceId}`, Buffer.from([0])), linkCount: 1, attributes: '128', reparseTag: '0' } }))
const externalTools = { gitExecutable, ghExecutable: executable('gh'), nodeExecutable: executable('node'), pwshExecutable: executable('pwsh'), credentialExecutionAuthority: { canonicalPath: 'C:/wave0a/authority/credentials.json', sha256: HASH }, operationCoordination: { entries: coordinationEntries, count: 15, tupleSha256: hash(coordinationEntries) }, gitRefTransactionCapability: { schemaVersion: `${S}git-ref-transaction-capability/v1`, gitExecutableSha256: gitExecutable.sha256, probeRepository: directory('C:/wave0a/probe'), stdinSha256: command.stdinSha256, command, result: 'symref_verify_and_ref_cas_atomic', observedAt: AT } }
const controlAuthority = { provisioningApprovalIdentity: file('C:/wave0a/provisioning-approval.json'), controlSourceRecordIdentity: file('C:/wave0a/authority/control-source.json'), authorityRootIdentity: dir('C:/wave0a/authority'), credentialExecutionAuthorityIdentity: file('C:/wave0a/authority/credentials.json'), credentialExecutionAuthoritySha256Identity: file('C:/wave0a/authority/credentials.sha256'), stageMinusOneLoaderIdentity: file('C:/wave0a/authority/wave0a-stage-minus-one.ps1'), bootstrapProgramIdentity: file('C:/wave0a/authority/wave0a-bootstrap.ps1'), githubLifecycleRetirementRootIdentity: dir('C:/wave0a/authority/lifecycle-retirement'), externalTools }
controlAuthority.externalTools.credentialExecutionAuthority.sha256 = controlAuthority.credentialExecutionAuthorityIdentity.sha256
const provisionOutputs = Object.fromEntries([
  ['provisioningConsumptionClaim', 'provisioning_consumption_claim_directory', 'claim', null], ['seedRoot', 'seed_root', 'seed', null], ['controlSourceRecord', 'control_source_record', 'control-source.json', `${S}wave0a-control-source-record/v1`], ['authorityRoot', 'authority_root', 'authority', null], ['credentialExecutionAuthority', 'credential_execution_authority', 'credentials.json', `${S}wave0a-credential-execution-authority/v1`], ['credentialExecutionAuthoritySha256', 'credential_execution_authority_sha256', 'credentials.sha256', 'sha256-sidecar/v1'], ['provisioningResult', 'provisioning_result', 'provisioning-result.json', `${S}wave0a-control-authority-provisioning-result/v1`]
].map(([key, role, leaf, schemaVersion]) => [key, { role, ...absence(`C:/wave0a/provision/${leaf}`), expectedKind: schemaVersion ? 'regular_file' : 'directory', ...(schemaVersion ? { requiredLinkCount: 1, schemaVersion } : {}) }]))
const preBundleMembers = ['tools/main-consolidation/create-wave0a-proposal.mjs', 'tools/main-consolidation/verify-github-atomic-pr-lifecycle.mjs'].map(repositoryPath => ({ ...repo(repositoryPath), blobSha256: digest(Buffer.from('export {}\n')), byteSize: 10 }))
const preBundlePlan = { candidateHeadSha: H, entrypoints: { proposal: (({ byteSize, ...identity }) => identity)(preBundleMembers[0]), lifecycle: (({ byteSize, ...identity }) => identity)(preBundleMembers[1]) }, members: preBundleMembers, memberCount: 2, totalBytes: 20, tupleSha256: hash(preBundleMembers) }
const installedMembers = preBundleMembers.map(member => file(`C:/wave0a/authority/bundle/${member.repositoryPath}`, Buffer.from('export {}\n')))
const installedBundle = { root: dir('C:/wave0a/authority/bundle'), manifest: file('C:/wave0a/authority/bundle/manifest.json', bytes(preBundlePlan)), proposalEntrypoint: installedMembers[0], lifecycleEntrypoint: installedMembers[1], members: installedMembers, memberCount: 2, totalBytes: 20, tupleSha256: hash(installedMembers) }
const provisionRequest = { schemaVersion: `${S}wave0a-control-authority-provisioning-request/v1`, taskId: 'synthetic-task', requestId: 'synthetic-request', purpose: 'provision_final_h_wave0a_control_authority', mutationAuthority: 'external_seed_and_control_authority_only', targetRepository: 'katamor1/bob_builtin_analyze', approvedPlanIdentity: PLAN, programIndexIdentity: INDEX, candidate, localRepositoryScope: scope, reviewedControlBlobs: ['tools/main-consolidation/wave0a-bootstrap.ps1', 'tools/main-consolidation/wave0a-stage-minus-one.ps1'].map(repositoryPath => ({ repositoryPath, blobOid: B, blobSha256: HASH })), preCampaignToolBundle: preBundlePlan, seedContractSha256: HASH, seedProcedureIdentity: file('C:/wave0a/provisioning/reviewed-seed-procedure.ps1'), pwshExecutable: externalTools.pwshExecutable, gitExecutable, ghExecutable: externalTools.ghExecutable, nodeExecutable: externalTools.nodeExecutable, credentialHelper: executable('git-credential-manager'), ghConfigDirectory: directory('C:/wave0a/gh'), outputs: provisionOutputs, expiresAt: '2026-08-23T01:00:00.000Z' }
const userIdentity = (({ source, threadId, messageId, role, normalizedUtf8Sha256, ordinal }) => ({ source, threadId, messageId, role, normalizedUtf8Sha256, ordinal }))(transcript.userApproval)
const provisionTranscript = clone(transcript)
for (const key of ['assistantAnnouncement', 'assistantPrompt', 'userApproval']) {
  const text = key === 'assistantAnnouncement' ? `Wave 0A control authority provisioning requested requestSha256=${hash(provisionRequest)}` : `WAVE0A-CONTROL-AUTHORITY-PROVISIONING-V1 を承認 requestSha256=${hash(provisionRequest)}`
  provisionTranscript[key].normalizedText = text
  provisionTranscript[key].normalizedUtf8Sha256 = digest(Buffer.from(text))
}
const provisionUserIdentity = { ...userIdentity, normalizedUtf8Sha256: provisionTranscript.userApproval.normalizedUtf8Sha256 }
const provisionApproval = { schemaVersion: `${S}wave0a-control-authority-provisioning-approval/v1`, requestIdentity: file('C:/wave0a/provision-request.json', bytes(provisionRequest)), requestSha256: hash(provisionRequest), trustedTranscript: provisionTranscript, approvedAt: provisionTranscript.userApproval.observedAt, expiresAt: provisionRequest.expiresAt, provisioningAuthorityIdentity: provisionUserIdentity, maxUses: 1 }
const provisionClaim = { schemaVersion: `${S}wave0a-control-authority-provisioning-consumption-claim/v1`, mutationAuthority: 'consume_exact_provisioning_approval_once', requestIdentity: provisionApproval.requestIdentity, requestSha256: provisionApproval.requestSha256, provisioningApprovalIdentity: file('C:/wave0a/provisioning-approval.json', bytes(provisionApproval)), provisioningAuthorityIdentity: userIdentity, maxUses: 1, candidate: { headSha: H, treeOid: TREE }, seedProcedureIdentity: provisionRequest.seedProcedureIdentity, preCampaignToolBundle: preBundlePlan, outputs: provisionOutputs, ordinalLayout: [{ ordinal: 1, role: 'seed_and_control_source' }, { ordinal: 2, role: 'credential_authority' }], claimDirectoryIdentity: dir(provisionOutputs.provisioningConsumptionClaim.canonicalPath), claimedAt: AT }
const provisionResult = { schemaVersion: `${S}wave0a-control-authority-provisioning-result/v1`, mutationAuthority: false, requestIdentity: provisionApproval.requestIdentity, provisioningApprovalIdentity: provisionClaim.provisioningApprovalIdentity, consumptionClaimDirectoryIdentity: provisionClaim.claimDirectoryIdentity, consumptionClaimIdentity: file('C:/wave0a/provision/claim/claim.json', bytes(provisionClaim)), ordinalResults: [{ ordinal: 1, role: 'seed_and_control_source', journalHeadIdentity: file('C:/wave0a/provision/claim/1/journal.json'), resultIdentity: file('C:/wave0a/provision/claim/1/result.json') }, { ordinal: 2, role: 'credential_authority', journalHeadIdentity: file('C:/wave0a/provision/claim/2/journal.json'), resultIdentity: file('C:/wave0a/provision/claim/2/result.json') }], completedOrdinals: [1, 2], controlAuthority: { ...controlAuthority, provisioningApprovalIdentity: provisionClaim.provisioningApprovalIdentity }, preCampaignToolBundle: installedBundle, completedAt: AT }
const campaignStart = { campaignMode: 'new_campaign', rootInstall: 'atomic_first_root', expectedCampaignRoot: 'absent', firstRootInstallPolicyIdentity: FIRST_POLICY_ID }
const campaignRequest = { schemaVersion: `${S}wave0a-campaign-execution-approval-request/v2`, taskId: 'synthetic-task', requestId: 'synthetic-request', purpose: 'execute_committed_wave0a_control_plane_plan', targetRepository: 'katamor1/bob_builtin_analyze', approvedPlanIdentity: PLAN, programIndexIdentity: INDEX, ...candidate, localRepositoryScope: scope, operationContractIdentity: repo('tools/main-consolidation/wave0a-mutations.json'), operationSerializationRoster: OPERATIONS, operationExecutionDagSha256: '65a86b0d8d76956070439a1824be0874f45cc99ef17dbf32bca96ba08b25132f', controlAuthority, githubLifecycleAcceptanceApprovalIdentity: file('C:/wave0a/lifecycle-approval.json'), githubLifecycleAcceptanceIdentity: file('C:/wave0a/lifecycle-acceptance.json'), lifecycleExpiresAt: templateBase.lifecycleExpiresAt, attemptId: ATTEMPT, campaignRoot: ROOT, attemptStartBefore: templateBase.attemptStartBefore, ...campaignStart }
const campaignApprovalText = `WAVE0A-CONTROL-PLANE-V1 を承認 requestSha256=${hash(campaignRequest)}`
const campaignTranscript = clone(transcript)
for (const key of ['assistantAnnouncement', 'assistantPrompt', 'userApproval']) { campaignTranscript[key].normalizedText = key === 'assistantAnnouncement' ? `Wave 0A campaign execution requested requestSha256=${hash(campaignRequest)}` : campaignApprovalText; campaignTranscript[key].normalizedUtf8Sha256 = digest(Buffer.from(campaignTranscript[key].normalizedText)) }
const campaignApproval = { schemaVersion: `${S}wave0a-campaign-execution-approval/v2`, requestIdentity: file('C:/wave0a/campaign-request.json', bytes(campaignRequest)), request: campaignRequest, requestSha256: hash(campaignRequest), trustedTranscript: campaignTranscript, approvalText: campaignApprovalText, approvedAt: campaignTranscript.userApproval.observedAt, capturedAt: approval.capturedAt, maxUses: 1 }
const fixtures = [
  ['ExecutableIdentity', gitExecutable], ['CommandObservation', command], ['PreCampaignToolBundlePlan', preBundlePlan], ['InstalledPreCampaignToolBundleIdentity', installedBundle], ['Wave0aBoundControlAuthority', controlAuthority], ['Wave0aControlAuthorityProvisioningRequest', provisionRequest], ['Wave0aControlAuthorityProvisioningApproval', provisionApproval], ['Wave0aControlAuthorityProvisioningConsumptionClaim', provisionClaim], ['Wave0aControlAuthorityProvisioningResult', provisionResult], ['Wave0aCampaignExecutionApprovalRequest', campaignRequest], ['Wave0aCampaignExecutionApproval', campaignApproval],
  ['RepoObjectIdentity', INDEX], ['ExternalFileIdentity', { canonicalPath: 'C:/wave0a/external.json', byteSize: 3, sha256: digest(Buffer.from('{}\n')) }], ['FileIdentity', installedBinding.fileIdentity], ['DirectoryIdentity', finalized.root], ['DirectoryHandleIdentity', scope.rootWorktree],
  ['SourceOrigin', { kind: 'archive', archiveManifestIdentity: { canonicalPath: 'C:/wave0a/manifest.json', byteSize: 3, sha256: digest(Buffer.from('{}\n')) }, fromSha: B, toSha: H, oldPullRequestNumber: 1, sourceItemId: 'item-1' }], ['SourceOrigin', { kind: 'current_main', baselineSha: B, existingEvidenceId: 'BASE-WAVE0A-MAIN' }], ['SourceOrigin', { kind: 'new_design', requiredSpecIdentity: 'SPEC-V1', approvedSpecIdentity: PLAN, designApprovalId: 'approval-1' }],
  ['Wave0aSubject', SUBJECT], ['Wave0aDecisionAuthority', DECISION], ['CampaignAuthority', AUTHORITY], ['IndexHead', INDEX_HEAD], ['TrustedApprovalTranscript', transcript], ['ApprovalInstructionIdentity', approval], ['Wave0aApprovedLocalRepositoryScope', scope], ['WorktreeRegistryFence', scope.worktreeRegistryFence], ['WorktreeRegistryFence', rootFence], ['NoFollowPathAbsenceProof', absence('C:/wave0a/absent')], ['WindowsProcessIdentity', processIdentity], ['OperationCoordinationEntry', coordination], ['OperationClaimLink', claim()], ['OperationTerminationProofLink', proof()], ['ClosedInitialControlBindingFileIdentity', installedBinding], ['StagedClosedInitialControlBindingIdentity', stagedBinding], ['BeginAdmissionTemplateIdentity', templateNew], ['BeginAdmissionTemplateIdentity', templateExisting], ['BeginResult', begin(templateNew)], ['BeginResult', begin(templateExisting)], ['BeginAdmissionCommitBinding', binding(templateNew)], ['BeginAdmissionCommitBinding', binding(templateExisting)], ['FirstRootInstallPlan', installPlan], ['BeginAdmissionCommitResult', commitResult(templateNew)], ['BeginAdmissionCommitResult', commitResult(templateExisting)],
  ...[templateNew, templateExisting].flatMap(template => ['prepared', 'commit_result_pending', 'committed', ...(template === templateExisting ? ['admission_committed_suffix_pending'] : [])].map(status => ['BeginAdmissionObservation', observation(template, status)])),
  ['AttemptIncompleteMarker', marker], ['RecoveryReservation', reservation], ...locks.map(value => ['AttemptPublicationLock', value]), ...campaignLocks.map(value => ['CampaignIndexPublicationLock', value])
]

// Each mutation catches removal of a nested exact-key check, not fixture drift.
function objectPaths(value, path = []) {
  if (!value || typeof value !== 'object') return []
  return [...(Array.isArray(value) ? [] : [path]), ...Object.entries(value).flatMap(([key, child]) => objectPaths(child, [...path, key]))]
}
function atPath(value, path) { return path.reduce((current, key) => current[key], value) }
for (const [index, [type, fixture]] of fixtures.entries()) test(`campaign primitives: ${type} literal ${index} rejects open nested schemas`, () => {
  assert.deepEqual(policy.validateCampaignPrimitive(type, fixture), fixture)
  for (const path of objectPaths(fixture)) {
    let changed = clone(fixture)
    atPath(changed, path).unknown = true
    assert.throws(() => policy.validateCampaignPrimitive(type, changed), TypeError, `${type} unknown at ${path.join('.')}`)
    for (const key of Object.keys(atPath(fixture, path))) {
      changed = clone(fixture)
      delete atPath(changed, path)[key]
      assert.throws(() => policy.validateCampaignPrimitive(type, changed), TypeError, `${type} missing ${[...path, key].join('.')}`)
    }
  }
  assert.throws(() => policy.validateCampaignPrimitive(type, null), TypeError)
})
for (const [name, desc] of descriptors) test(`campaign primitives: transaction ${name} exact keys roles ordinals receipt closure`, () => {
  assert.deepEqual(policy.validateTransactionDescriptor(desc), desc)
  assert.deepEqual(policy.validateTransactionReceipt(receipt(desc), desc), receipt(desc))
  for (const key of Object.keys(desc)) { const bad = clone(desc); delete bad[key]; assert.throws(() => policy.validateTransactionDescriptor(bad), TypeError) }
  for (const key of ['unknown', 'stagedPath', 'finalPath']) { const bad = clone(desc); bad[key] = 'forbidden'; assert.throws(() => policy.validateTransactionDescriptor(bad), TypeError) }
  for (const change of [d => { d.members[0].memberOrdinal = '0000' }, d => { d.members[0].role = 'unknown' }, d => { d.members[0].byteSize = 0 }, d => { d.members[0].sha256 = 'A'.repeat(64) }, d => { d.members[0].finalPath = 'outside' }, d => { d.members = [] }, d => { d.members.push(clone(d.members[0])) }]) { const bad = clone(desc); change(bad); assert.throws(() => policy.validateTransactionDescriptor(bad), TypeError) }
  if (desc.members.length > 1) { const bad = clone(desc); bad.members.reverse(); assert.throws(() => policy.validateTransactionDescriptor(bad), TypeError) }
  for (const change of [r => { r.transactionId = RECOVERY }, r => { r.descriptorSha256 = '0'.repeat(64) }, r => { r.commitMemberOrdinal = '0000' }, r => { r.publishedMembers[0].byteSize++ }, r => { r.publishedMembers[0].path = 'forbidden' }, r => { r.publishedMembers.pop() }, r => { r.outcome = 'pending' }]) { const bad = receipt(desc); change(bad); assert.throws(() => policy.validateTransactionReceipt(bad, desc), TypeError) }
})

test('campaign primitives: canonical JSON has stable Unicode ordering and exact LF bytes', () => {
  assert.equal(policy.canonicalJson({ z: 'e\u0301', a: [true, null, -0] }).toString(), '{"a":[true,null,0],"z":"é"}\n')
  assert.equal(policy.canonicalJson({ '\u{10000}': 1, '\ue000': 2 }).toString(), '{"":2,"𐀀":1}\n')
  assert.deepEqual(policy.parseCanonicalJson(Buffer.from('{"a":1}\n')), { a: 1 })
  for (const input of ['{"a":1}', '{ "a":1}\n', '{"a":1,"a":1}\n', '{"z":1,"a":2}\n', '{"a":1}\r\n', '\ufeff{"a":1}\n', '{"a":-0}\n', '{"a":1.0}\n', '{"a":"e\\u0301"}\n']) assert.throws(() => policy.parseCanonicalJson(Buffer.from(input)), TypeError)
  assert.throws(() => policy.parseCanonicalJson(Buffer.from([0xc0, 0xaf])), TypeError)
})
test('campaign primitives: canonicalization never invokes accessors and rejects non-JSON data', () => {
  let calls = 0
  const accessor = Object.defineProperty({}, 'x', { enumerable: true, get() { calls++; return 1 } })
  const cycle = {}; cycle.self = cycle
  const array = [1]; array.extra = true
  for (const value of [undefined, 1n, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1, () => {}, Symbol(), new Date(), Object.create({ inherited: true }), accessor, cycle, array, Array(1), { [Symbol()]: 1 }, Object.defineProperty({}, 'x', { value: 1 }), { '\u00e9': 1, 'e\u0301': 2 }, '\ud800']) assert.throws(() => policy.canonicalJson(value), TypeError)
  assert.equal(calls, 0)
})
test('campaign primitives: serialized input and output cap N-1 N N+1 before parse', () => {
  for (const length of [1048575, 1048576]) { const value = 'x'.repeat(length - 3); assert.equal(policy.canonicalJson(value).length, length); assert.equal(policy.parseCanonicalJson(Buffer.from(`"${value}"\n`)), value) }
  assert.throws(() => policy.canonicalJson('x'.repeat(1048574)), TypeError)
  assert.throws(() => policy.parseCanonicalJson(Buffer.alloc(1048577, 0x78)), TypeError)
})
const grammarCases = [
  ['LowercaseSha', [B], ['', B.toUpperCase().replace(/1/g, 'A'), B + '0', B.slice(1)]], ['LowercaseSha256', [HASH], [HASH.toUpperCase(), HASH.slice(1), HASH + '0']],
  ['DecimalString', ['0', '1', '9007199254740993'], ['', '01', '-1', '+1', '1.0', 1]], ['PositiveSafeInteger', [1, Number.MAX_SAFE_INTEGER], [0, -1, 1.1, Infinity, Number.MAX_SAFE_INTEGER + 1]], ['NonnegativeSafeInteger', [0, 1], [-1, NaN, '0']],
  ['CanonicalUtc', [AT, '2024-02-29T00:00:00.000Z'], ['2026-02-29T00:00:00.000Z', '2026-08-23T24:00:00.000Z', AT.replace('.100', ''), AT.replace('Z', '+00:00')]], ['CanonicalUtcSecond', ['2026-08-23T00:00:00Z'], [AT, '2026-13-01T00:00:00Z']], ['CanonicalGitTimestamp', ['1 +0000'], ['0 +0000', '01 +0000', '1 -0000']],
  ['CanonicalGuid', [processIdentity.boot.bootIdentifier], ['A'.repeat(36), processIdentity.boot.bootIdentifier.replaceAll('-', '')]], ['SafeId', ['a', 'A'.repeat(128)], ['', 'a'.repeat(129), '日本語', 'a/b']], ['SafeAttemptId', [ATTEMPT], [ATTEMPT.toUpperCase(), 'wave-0a-short', `${ATTEMPT}a`]], ['SafeTransactionId', [TX], [TX.slice(1), TX.toUpperCase().replaceAll('4', 'A')]], ['SafeRecoveryId', [RECOVERY], ['invalid']],
  ['SafeLabel', ['a', 'a'.repeat(64)], ['a_b', 'A', 'a'.repeat(65)]], ['SafeReasonCode', ['a_1', 'a'.repeat(64)], ['a-b', 'A', 'a'.repeat(65)]], ['SafeLeaf', ['a', 'x.json'], ['.', '..', '../a']],
  ['SafeWindowsLeafName', ['日本語.txt', '.git', 'a'.repeat(128)], ['.', '..', 'a/b', 'a\\b', 'x:', 'a.', 'a ', 'NUL', 'con.txt', 'COM1', 'lpt9.log', 'x\u0000']],
  ['SafeBranch', ['codex/a', 'feature-a', 'a'.repeat(200)], ['main', '-x', 'a'.repeat(201), 'a..b', 'a@{b', '@', 'a.lock', '.x', 'a//b', 'a/', 'a\\b', 'a b', 'a~b', 'a:b', 'a?b']],
  ['SafeRepositoryPath', ['tools/file.mjs', '日本語/仕様.json', 'a'.repeat(4096)], ['', '/a', '../a', 'a/./b', 'a//b', 'a\\b', 'a:b', 'x\u0000', 'a'.repeat(4097)]], ['AbsolutePath', ['C:/wave0a/file', 'C:\\wave0a\\file'], ['relative', 'C:file', 'C:/a/../b', 'C:/a\u0000']],
  ['BoundedString', ['日本語', 'a'.repeat(1024)], ['', 'a'.repeat(1025), 'e\u0301', 'a\n', 'x\u0085']], ['TransactionOrdinal', ['0001', '9999'], ['0000', '1', '10000']],
  ['OperationClaimOrdinal', [1, 127, 128], [0, 129]], ['RootFastForwardProgressOrdinal', [1, 2, 3, 17, 18], [0, 19]], ['WorktreeProgressOrdinal', [1, 15, 16], [0, 17]], ['HandoffIndexSequence', [2, 5758, 5759], [1, 5760, 8192]],
  ['SafeOperationClaimPath', [claim().path], [claim().path.replace('0001', '0000'), claim().path.replace('0001', '0129'), claim().path + '/tail']], ['SafeOperationWorktreeProgressPath', [locks.at(-1).finalPath], [locks.at(-1).finalPath.replace('0001', '0017')]], ['SafeOperationProgramProgressPath', [locks.at(-2).finalPath.replace('0001', '0018')], [locks.at(-2).finalPath.replace('0001', '0019')]], ['SafeAttemptEvidencePath', ['attachments/0001-a.json', 'attachments/0001-a.bundle'], ['attachments/0001-a.bin', 'attachments/0001-a.vsix', '../attachments/0001-a.json']], ['SafeAttemptEventPath', ['events/0001-ready.json'], ['events/0001-READY.json', 'events/0001-not_applicable.json']]
]
for (const [type, valid, invalid] of grammarCases) test(`campaign primitives: ${type} grammar boundaries`, () => { for (const value of valid) assert.equal(policy.validateCampaignPrimitive(type, value), value); for (const value of invalid) assert.throws(() => policy.validateCampaignPrimitive(type, value), TypeError, `${type} ${String(value)}`) })
test('campaign primitives: first-root policy is immutable exact sixteen-key canonical authority', async () => {
  assert.deepEqual(policy.getFirstRootInstallPolicy(), FIRST_POLICY)
  assert.ok(Object.isFrozen(policy.getFirstRootInstallPolicy()))
  assert.deepEqual(policy.validateCampaignPrimitive('FirstRootInstallPolicy', FIRST_POLICY), FIRST_POLICY)
  // Only the source asset's Git checkout EOL transformation is tolerated.
  // Production canonical parsing still rejects CRLF (tested above), and this
  // comparison preserves every key, space, value and byte except CR before LF.
  const checkoutBytes = await readFile(new URL('../wave0a-first-root-install-policy.json', import.meta.url))
  assert.deepEqual(Buffer.from(checkoutBytes.toString('utf8').replaceAll('\r\n', '\n')), bytes(FIRST_POLICY))
  for (const [key, value] of Object.entries(FIRST_POLICY)) { const missing = clone(FIRST_POLICY); delete missing[key]; assert.throws(() => policy.validateCampaignPrimitive('FirstRootInstallPolicy', missing), TypeError); for (const replacement of typeof value === 'number' ? [value - 1, value + 1] : typeof value === 'boolean' ? [false] : ['unknown']) assert.throws(() => policy.validateCampaignPrimitive('FirstRootInstallPolicy', { ...FIRST_POLICY, [key]: replacement }), TypeError) }
  assert.throws(() => policy.validateCampaignPrimitive('FirstRootInstallPolicy', { ...FIRST_POLICY, other: true }), TypeError)
})
test('campaign primitives: future authority and subject runtime variants never validate', () => {
  for (const value of [{ kind: 'program_index', phase: 'wave0b_accepted_main', authorityMainSha: H, predecessorVerifiedAttemptId: ATTEMPT, programIndexIdentity: INDEX }, { kind: 'selection_ledger', phase: 'post_wave0b', authorityMainSha: H, predecessorVerifiedAttemptId: ATTEMPT, programIndexIdentity: INDEX, sourceUniverseIdentity: INDEX, selectionLedgerJsonIdentity: INDEX, selectionLedgerMarkdownIdentity: INDEX }]) assert.throws(() => policy.validateCampaignPrimitive('Wave0aDecisionAuthority', value), TypeError)
  for (const value of [{ kind: 'gate', id: 'GATE-P' }, { kind: 'capability', id: 'CAP', disposition: 'selected' }, { ...SUBJECT, id: 'WAVE-0B-SELECTION-LEDGER' }]) assert.throws(() => policy.validateCampaignPrimitive('Wave0aSubject', value), TypeError)
  assert.throws(() => policy.validateCampaignPrimitive('Wave0aDecisionAuthority', { ...DECISION, authorityCommitSha: B }), TypeError)
  assert.throws(() => policy.validateCampaignPrimitive('DecisionAuthority', DECISION), TypeError)
})
test('campaign primitives: index nullability sequence path and first-root mode cannot cross', () => {
  assert.throws(() => policy.validateCampaignPrimitive('IndexHead', { ...INDEX_HEAD, path: 'campaign-index/0003-operator_handoff.json' }), TypeError)
  for (const [name, desc] of descriptors) if ('priorCampaignIndexHead' in desc) { const bad = clone(desc); bad.priorCampaignIndexHead = desc.priorCampaignIndexHead === null ? INDEX_HEAD : null; assert.throws(() => policy.validateTransactionDescriptor(bad), TypeError, name) }
  for (const template of [templateNew, templateExisting]) { const bad = begin(template); bad.rootInstall = template === templateNew ? 'existing_root_transaction' : 'atomic_first_root'; assert.throws(() => policy.validateCampaignPrimitive('BeginResult', bad), TypeError) }
})
test('campaign primitives: transcript strict message identities hashes order text and replay', () => {
  for (const change of [a => { a.trustedTranscript.userApproval.role = 'assistant_prompt' }, a => { a.trustedTranscript.userApproval.threadId = 'other' }, a => { a.trustedTranscript.userApproval.messageId = a.trustedTranscript.assistantPrompt.messageId }, a => { a.trustedTranscript.userApproval.ordinal = 2 }, a => { a.trustedTranscript.userApproval.observedAt = a.trustedTranscript.assistantPrompt.observedAt }, a => { a.trustedTranscript.userApproval.normalizedUtf8Sha256 = HASH }, a => { a.approvalText += ' ' }, a => { a.approvedPlanIdentity.blobOid = H }, a => { a.mutationAuthority = true }, a => { a.schemaVersion = `${S}feature-integration-approval-instruction/v3` }, a => { a.capturedAt = AT.replace('.100', '.001') }]) { const bad = clone(approval); change(bad); assert.throws(() => policy.validateCampaignPrimitive('ApprovalInstructionIdentity', bad), TypeError) }
  const bad = clone(approval); for (const key of ['assistantAnnouncement', 'userApproval']) { bad.trustedTranscript[key].normalizedText += '\n'; bad.trustedTranscript[key].normalizedUtf8Sha256 = digest(Buffer.from(bad.trustedTranscript[key].normalizedText)) } assert.throws(() => policy.validateCampaignPrimitive('ApprovalInstructionIdentity', bad), TypeError)
  assert.equal(policy.normalizeApprovalMessage(Buffer.from('e\u0301\r\n日本語\r')), 'é\n日本語\n')
  assert.throws(() => policy.normalizeApprovalMessage(Buffer.from([0xff])), TypeError)
})
test('campaign primitives: worktree registry and no-follow child identity cannot cross', () => {
  for (const change of [s => { [s.worktreeRegistryFence.featureWorktreeGitFile, s.worktreeRegistryFence.featureAdminGitdirBackpointer] = [s.worktreeRegistryFence.featureAdminGitdirBackpointer, s.worktreeRegistryFence.featureWorktreeGitFile] }, s => { s.worktreeRegistryFence.rootAdminDirectory = s.worktreeRegistryFence.featureAdminDirectory }, s => { s.worktreeRegistryFence.featureHeadFile.canonicalPath += '-other' }, s => { s.objectDirectory.canonicalPath = 'C:/outside' }, s => { s.worktreeRegistryFence.commonGitDirectory.ino = '999' }]) { const bad = clone(scope); change(bad); assert.throws(() => policy.validateCampaignPrimitive('Wave0aApprovedLocalRepositoryScope', bad), TypeError) }
  const bad = clone(rootFence); bad.featureWorktreeAbsenceProof.canonicalPath += '-other'; assert.throws(() => policy.validateCampaignPrimitive('WorktreeRegistryFence', bad), TypeError)
})
test('campaign primitives: result-first template nonce hash target and staging handle remain bound', () => {
  for (const change of [b => { b.admissionNonce = 'other' }, b => { b.admissionTemplate.template.sha256 = HASH }, b => { b.admissionTemplate.record.stagedRoot = finalized.root }, b => { b.admissionTemplate.record.recordedAt = AT }, b => { b.admissionTemplate.record.firstRootInstallPlanTarget.parentIdentity.ino = '999' }, b => { b.admissionTemplate.record.commitResultTarget.leaf = 'other.json' }, b => { b.admissionTemplate.record.attemptStartBefore = '2026-08-23T02:00:00.000Z' }, b => { b.firstRootInstallPlan = installedBinding.fileIdentity }]) { const bad = clone(begin(templateNew)); change(bad); assert.throws(() => policy.validateCampaignPrimitive('BeginResult', bad), TypeError) }
})
test('campaign primitives: admission plan rejects fabricated destinations volume crossing and changed sources', () => {
  for (const change of [p => { p.publishAction.destinationVolumeSerial = '2' }, p => { p.postPublish.readyHandoff.destinationPath = 'C:/outside/ready.json' }, p => { p.postPublish.readyHandoff.sourceIdentity.ino = '999' }, p => { p.finalizedReadyRoot.root.ino = '999' }, p => { p.postPublish.root = dir(ROOT) }, p => { p.postPublish.initialControlBinding.sourceIdentity.canonicalPath = `${ROOT}/binding.json` }, p => { p.postPublish.transientAbsence.attemptPublicationLock.destinationPath = p.postPublish.transientAbsence.campaignIndexPublicationLock.destinationPath }]) { const bad = clone(installPlan); change(bad); assert.throws(() => policy.validateCampaignPrimitive('FirstRootInstallPlan', bad), TypeError) }
})
test('campaign primitives: admission observations enforce each mode status result identity correlation', () => {
  const cases = [observation(templateNew, 'prepared'), observation(templateExisting, 'admission_committed_suffix_pending'), observation(templateNew, 'commit_result_pending'), observation(templateExisting, 'committed')]
  for (const [index, fixture] of cases.entries()) { const bad = clone(fixture); if (index === 0) bad.admissionCommitIndexHead = INDEX_HEAD; if (index === 1) bad.admissionTemplateIdentity = templateNew; if (index === 2) bad.admissionCommitResult.identity = installedBinding.fileIdentity; if (index === 3) bad.admissionCommitResult.identity = null; assert.throws(() => policy.validateCampaignPrimitive('BeginAdmissionObservation', bad), TypeError) }
})
test('campaign primitives: native transaction linkage and per-journal ordinal bounds', () => {
  for (const [, fixture] of descriptors.filter(([, d]) => d.publicationReservationSha256)) { const bad = clone(fixture); bad.inputRecordSha256 = '0'.repeat(64); assert.throws(() => policy.validateTransactionDescriptor(bad), TypeError) }
  for (const [operation, key, max] of [['publish_progress', 'completedPrefix', 18], ['publish_cleanup_progress', 'chunkOrdinal', 98], ['publish_worktree_progress', 'chunkOrdinal', 16]]) { const fixture = descriptors.find(([, d]) => d.operation === operation)[1]; for (const n of [max - 1, max]) { const good = clone(fixture); good[key] = n; good.priorProgressSha256 = HASH; assert.deepEqual(policy.validateTransactionDescriptor(good), good) } for (const n of [0, max + 1]) { const bad = clone(fixture); bad[key] = n; assert.throws(() => policy.validateTransactionDescriptor(bad), TypeError) } }
  const bad = clone(reservation); bad.recoveryId = TX; assert.throws(() => policy.validateCampaignPrimitive('RecoveryReservation', bad), TypeError)
  for (const lock of locks.filter(lock => lock.finalPath)) { const bad = clone(lock); bad.finalPath = bad.finalPath.replace(ATTEMPT, ATTEMPT.replace('4f8a1c2d', '4f8a1c2e')); assert.throws(() => policy.validateCampaignPrimitive('AttemptPublicationLock', bad), TypeError) }
})
test('campaign primitives: aggregate transaction cardinalities and singleton roles remain closed', () => {
  for (const operation of ['reserve_intent', 'publish_receipt']) { const source = descriptors.find(([, d]) => d.operation === operation)[1]; const maximum = operation === 'reserve_intent' ? 7 : 3; for (const count of [maximum - 1, maximum]) { const good = clone(source); good.members = members(operation === 'reserve_intent' ? ['operation_request', ...Array(count).fill('operation_precondition'), 'operation_intent'] : [...Array(count).fill('operation_postcondition'), 'operation_receipt']); assert.deepEqual(policy.validateTransactionDescriptor(good), good) } for (const count of [0, maximum + 1]) { const bad = clone(source); bad.members = members(operation === 'reserve_intent' ? ['operation_request', ...Array(count).fill('operation_precondition'), 'operation_intent'] : [...Array(count).fill('operation_postcondition'), 'operation_receipt']); assert.throws(() => policy.validateTransactionDescriptor(bad), TypeError) } }
  for (const [, fixture] of descriptors.filter(([, d]) => d.operation === 'begin_with_handoff')) { const bad = clone(fixture); bad.externalResult = { role: 'handoff_result', canonicalPath: 'C:/wave0a/result.json', byteSize: 3, sha256: HASH }; assert.throws(() => policy.validateTransactionDescriptor(bad), TypeError); const wrong = receipt(fixture); wrong.completionMode = 'recovered'; assert.throws(() => policy.validateTransactionReceipt(wrong, fixture), TypeError) }
})

test('campaign primitives: primary operation input digest equals the final planned member', () => {
  for (const operation of ['reserve_intent', 'publish_receipt']) {
    const bad = clone(descriptors.find(([, value]) => value.operation === operation)[1])
    bad.inputRecordSha256 = HASH
    assert.throws(() => policy.validateTransactionDescriptor(bad), TypeError)
  }
})

test('campaign primitives: existing admission advances the prior index and binds started bytes', () => {
  for (const change of [value => { value.admissionCommitIndexHead.sha256 = HASH }, value => {
    value.admissionCommitIndexHead.sequence = 1
    value.admissionCommitIndexHead.path = 'campaign-index/0001-attempt_started.json'
    value.attemptStarted.canonicalPath = `${ROOT}/campaign-index/0001-attempt_started.json`
    value.campaignIndexHead = INDEX_HEAD
  }]) {
    const bad = commitResult(templateExisting); change(bad)
    assert.throws(() => policy.validateCampaignPrimitive('BeginAdmissionCommitResult', bad), TypeError)
  }
})

test('campaign primitives: provisioning approval rejects a valid transcript from another purpose', () => {
  const bad = clone(provisionApproval)
  bad.trustedTranscript = transcript
  bad.provisioningAuthorityIdentity = userIdentity
  assert.throws(() => policy.validateCampaignPrimitive('Wave0aControlAuthorityProvisioningApproval', bad), TypeError)
})

const operationRoot = `operations/${ATTEMPT}/publish-branch`
const extraPaths = [
  ['SafeAttemptRelativePath', 'events/0001-ready.json', 'events/0001-future.json'],
  ['SafeRecoveryCheckpointPath', `recovery-checkpoints/${ATTEMPT}-0001.json`, `recovery-checkpoints/${ATTEMPT}-1.json`],
  ['SafeCampaignTransactionRoot', `campaign-transactions/${TX}`, `campaign-transactions/${TX}/extra`],
  ['SafeAttemptTransactionRoot', `attempts/${ATTEMPT}/transactions/${TX}`, `attempts/${ATTEMPT}/transactions/unknown`],
  ['SafeOperationTransactionRoot', `${operationRoot}/transactions/${TX}`, `${operationRoot}/transaction/${TX}`],
  ['SafeCampaignTransactionStagedPath', `campaign-transactions/${TX}/staged/0001.bin`, `campaign-transactions/${TX}/staged/0000.bin`],
  ['SafeAttemptTransactionStagedPath', `attempts/${ATTEMPT}/transactions/${TX}/staged/0001.bin`, `attempts/${ATTEMPT}/transactions/${TX}/staged/0001.json`],
  ['SafeOperationTransactionStagedPath', `${operationRoot}/transactions/${TX}/staged/0001.bin`, `${operationRoot}/transactions/${TX}/staged/1.bin`],
  ['SafeTransactionReceiptPath', `${operationRoot}/transactions/${TX}/transaction-receipt.json`, `${operationRoot}/transactions/${TX}/receipt.json`],
  ['SafeOperationRoot', operationRoot, `${operationRoot}/tail`],
  ['SafeOperationPreconditionPath', `${operationRoot}/preconditions/0007-exact-head.json`, `${operationRoot}/preconditions/0008-exact-head.json`],
  ['SafeOperationPostconditionPath', `${operationRoot}/postconditions/0003-exact-head.json`, `${operationRoot}/postconditions/0004-exact-head.json`],
  ['SafeOperationEvidencePath', `${operationRoot}/request.json`, `${operationRoot}/program-progress/0001.json`],
  ['OperationClaimOrdinalLeaf', '0128', '0129'], ['CleanupProgressOrdinalLeaf', '0098', '0099'],
  ['WorktreeProgressOrdinalLeaf', '0016', '0017'], ['RootFastForwardProgressOrdinalLeaf', '0018', '0019'],
  ['OperationPreconditionOrdinalLeaf', '0007', '0008'], ['OperationPostconditionOrdinalLeaf', '0003', '0004']
]
for (const [type, good, bad] of extraPaths) test(`campaign primitives: remaining path and ordinal grammar ${type}`, () => {
  assert.equal(policy.validateCampaignPrimitive(type, good), good)
  for (const invalid of [bad, '', null, `${good}/extra`, `${good}\n`]) assert.throws(() => policy.validateCampaignPrimitive(type, invalid), TypeError)
})

test('campaign primitives: repeated command tokens are ordered data not a set', () => {
  const good = clone(command); good.argv = ['-f', 'head_sha=H', '-f', 'nonce=N']
  assert.deepEqual(policy.validateCampaignPrimitive('CommandObservation', good), good)
})

test('campaign primitives: path comparison is Windows ordinal ignore case without expanding Unicode', () => {
  const good = clone(absence('C:/wave0a/child'))
  good.canonicalPath = '\\\\?\\c:\\WAVE0A\\child'
  assert.deepEqual(policy.validateCampaignPrimitive('NoFollowPathAbsenceProof', good), good)
  const bad = clone(absence('C:/wave0a/straße'))
  bad.canonicalPath = 'C:/wave0a/STRASSE'
  assert.throws(() => policy.validateCampaignPrimitive('NoFollowPathAbsenceProof', bad), TypeError)
})

const attachmentDiscriminants = [
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
].map(name => `${S}${name}/v1`)

test('campaign primitives: attachment references use only the forty-two closed discriminants', () => {
  assert.equal(attachmentDiscriminants.length, 42)
  for (const schema of attachmentDiscriminants) assert.equal(policy.validateCampaignPrimitive('KnownAttachmentSchema', schema), schema)
  for (const schema of ['final-validation/v1', `${S}wave0a-mutation-summary/v1`, `${S}closed-initial-control-binding/v1`, `${S}product-acceptance/v1`]) assert.throws(() => policy.validateCampaignPrimitive('KnownAttachmentSchema', schema), TypeError)
  assert.throws(() => policy.validateCampaignPrimitive('AttachmentPayload', { schemaVersion: attachmentDiscriminants[0] }), TypeError)
})

test('campaign primitives: operation tuple containers enforce cardinality exact keys and label uniqueness only', () => {
  const condition = n => ({ label: `condition-${n}`, schemaVersion: `${S}remote-ref-observation/v1` })
  for (const mode of ['default', 'post_merge_success', 'post_merge_failure_cleanup', 'pre_merge_abort_cleanup', 'main_only_cleanup']) {
    for (const [pre, post] of [[1, 1], [6, 2], [7, 3]]) {
      const good = { operationInstanceId: 'publish-branch', mode, preconditions: Array.from({ length: pre }, (_, n) => condition(n)), postconditions: Array.from({ length: post }, (_, n) => condition(n)) }
      assert.deepEqual(policy.validateOperationEvidenceContractEntryStructure(good), good)
      for (const change of [v => { v.preconditions = [] }, v => { v.preconditions = Array.from({ length: 8 }, (_, n) => condition(n)) }, v => { v.postconditions = [] }, v => { v.postconditions = Array.from({ length: 4 }, (_, n) => condition(n)) }, v => { v.mode = 'later' }, v => { v.operationInstanceId = 'delete-main' }, v => { v.preconditions[0].unknown = true }, v => { v.postconditions[0].schemaVersion = `${S}final-validation/v1` }, v => { v.preconditions = [condition(1), condition(1)] }]) {
        const bad = clone(good); change(bad); assert.throws(() => policy.validateOperationEvidenceContractEntryStructure(bad), TypeError)
      }
    }
  }
  for (const name of ['getWave0aOperationEvidenceContract', 'getWave0aOperationExecutionDag', 'validateAttachmentPayload']) assert.equal(Object.hasOwn(policy, name), false, `${name} must not be a phase-2A stub`)
})

test('campaign primitives: operation source and receipt locator identities remain closed', () => {
  for (const type of ['OperationPreconditionSource', 'OperationPostconditionSource']) {
    const good = { label: 'exact-head', source: file('C:/wave0a/source.json'), schemaVersion: `${S}remote-ref-observation/v1` }
    assert.deepEqual(policy.validateCampaignPrimitive(type, good), good)
    assert.throws(() => policy.validateCampaignPrimitive(type, { ...good, path: 'other' }), TypeError)
  }
  const good = { transactionId: TX, path: `${operationRoot}/transactions/${TX}/transaction-receipt.json`, schemaVersion: `${S}feature-integration-transaction-receipt/v1`, byteSize: 3, sha256: digest(Buffer.from('{}\n')) }
  assert.deepEqual(policy.validateCampaignPrimitive('TransactionReceiptRef', good), good)
  assert.throws(() => policy.validateCampaignPrimitive('TransactionReceiptRef', { ...good, transactionId: RECOVERY }), TypeError)
})

test('campaign primitives: public type selection never accepts executable validators', () => {
  let invoked = false
  assert.throws(() => policy.validateCampaignPrimitive(() => { invoked = true }, {}), TypeError)
  assert.equal(invoked, false)
  for (const type of [null, {}, [], 'toString', '__proto__', 'AttachmentPayload']) assert.throws(() => policy.validateCampaignPrimitive(type, {}), TypeError)
})

test('campaign primitives: path sets use the same nonexpanding ordinal comparison', () => {
  const good = clone(externalTools.operationCoordination)
  good.entries[0].coordinationFile.canonicalPath = 'C:/wave0a/coordination/straße'
  good.entries[1].coordinationFile.canonicalPath = 'C:/wave0a/coordination/STRASSE'
  good.tupleSha256 = hash(good.entries)
  assert.deepEqual(policy.validateCampaignPrimitive('OperationCoordinationAuthority', good), good)
  const bad = clone(good)
  bad.entries[1].coordinationFile.canonicalPath = good.entries[0].coordinationFile.canonicalPath.toLowerCase()
  bad.tupleSha256 = hash(bad.entries)
  assert.throws(() => policy.validateCampaignPrimitive('OperationCoordinationAuthority', bad), TypeError)
})
