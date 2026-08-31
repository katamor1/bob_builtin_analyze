import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { deflateSync } from 'node:zlib'
import * as policy from '../featureIntegrationCampaignPolicy.mjs'
import { classifyRisk } from '../featureIntegrationRiskPolicy.mjs'

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
const templateBase = { schemaVersion: `${S}wave0a-begin-admission-template/v1`, admissionNonce: 'synthetic-nonce', implementationPlanIdentity: PLAN, programIndexIdentity: INDEX, candidate, localRepositoryScope: scope, campaignRoot: ROOT, attemptId: ATTEMPT, attemptStartBefore: '2026-08-23T00:00:00.900Z', lifecycleExpiresAt: '2026-08-23T01:00:00.000Z', fixedRelativePathPlanSha256: HASH, initialControlBinding: stagedBinding, commitResultTarget: resultTarget }
const destination = { canonicalPath: ROOT, parentIdentity: dir('C:/wave0a'), leaf: 'campaign', observation: 'absent', observedAt: AT }
const templateNewRecord = { ...templateBase, campaignMode: 'new_campaign', rootInstall: 'atomic_first_root', destination, firstRootInstallPolicyIdentity: FIRST_POLICY_ID, stagedRoot: dir('C:/wave0a/staged'), firstRootInstallPlanTarget: planTarget }
const templateExistingRecord = { ...templateBase, campaignMode: 'existing_campaign_new_attempt', rootInstall: 'existing_root_transaction', campaignRootIdentity: dir(ROOT), stagedTransactionRoot: dir(`${ROOT}/campaign-transactions/${TX}`), priorCampaignIndexHead: INDEX_HEAD }
const templateNew = { template: file('C:/wave0a/new-template.json', bytes(templateNewRecord)), record: templateNewRecord }
const templateExisting = { template: file('C:/wave0a/existing-template.json', bytes(templateExistingRecord)), record: templateExistingRecord }
const begin = template => ({ schemaVersion: `${S}wave0a-begin-result/v1`, kind: 'begin_result', mutationAuthority: false, admissionNonce: template.record.admissionNonce, campaignMode: template.record.campaignMode, rootInstall: template.record.rootInstall, admissionTemplate: template })
const binding = template => ({ admissionNonce: template.record.admissionNonce, recordedAt: AT, attemptStartBefore: template.record.attemptStartBefore, lifecycleExpiresAt: template.record.lifecycleExpiresAt, initialControlBinding: { staged: stagedBinding, postCommit: installedBinding }, commitDeadlineFence: 'native_checked_immediately_before_publish_with_lifecycle_expiry', campaignMode: template.record.campaignMode, rootInstall: template.record.rootInstall, admissionTemplate: template })
const transient = { campaignIndexPublicationLock: absence('C:/wave0a/staged/campaign-index-publication.lock'), attemptPublicationLock: absence(`C:/wave0a/staged/attempts/${ATTEMPT}/.publication-lock`), recoveryFenceRoot: absence('C:/wave0a/staged/campaign-publication-recovery.lock') }
transient.tupleSha256 = hash(Object.entries(transient).map(([key, value]) => [key, value]))
const finalized = { root: directory('C:/wave0a/staged'), attemptIncompleteMarker: file(`C:/wave0a/staged/attempts/${ATTEMPT}/.attempt-incomplete`), attemptStarted: file('C:/wave0a/staged/campaign-index/0001-attempt_started.json'), readyEvent: file(`C:/wave0a/staged/attempts/${ATTEMPT}/events/0001-ready.json`), readyHandoff: file(`C:/wave0a/staged/handoffs/${ATTEMPT}-0002-ready.json`), beginTransactionDescriptor: file(`C:/wave0a/staged/campaign-transactions/${TX}/transaction.json`), beginTransactionReceipt: file(`C:/wave0a/staged/campaign-transactions/${TX}/transaction-receipt.json`), transientAbsence: transient, initialControlBinding: stagedBinding, treeSha256: hash([]) }
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
  const installedRoot = template.record.campaignMode === 'new_campaign' ? { ...template.record.stagedRoot, canonicalPath: template.record.campaignRoot } : { ...template.record.campaignRootIdentity }
  return { schemaVersion: `${S}wave0a-begin-admission-commit-result/v1`, mutationAuthority: false, attemptStarted, admissionCommitIndexHead: { sequence, path, sha256: attemptStarted.sha256 }, readyHandoff: file(`${ROOT}/handoffs/${ATTEMPT}-${String(sequence + 1).padStart(4, '0')}-ready.json`), campaignIndexHead: { sequence: sequence + 1, path: `campaign-index/${String(sequence + 1).padStart(4, '0')}-operator_handoff.json`, sha256: HASH }, beginTransactionDescriptor: file(`${ROOT}/campaign-transactions/${TX}/transaction.json`), beginTransactionReceipt: file(`${ROOT}/campaign-transactions/${TX}/transaction-receipt.json`), initialControlBinding: installedBinding, commitBinding: binding(template), installedRoot, ...(template.record.campaignMode === 'new_campaign' ? { firstRootInstallPlan: file(planTarget.canonicalPath, bytes(installPlan)), transientAbsence: installedAbsences } : {}) }
}
const observation = (template, status) => {
  const result = commitResult(template)
  return { schemaVersion: `${S}wave0a-begin-admission-observation/v1`, mutationAuthority: false, beginResult: file(`C:/wave0a/${template.record.campaignMode}-begin.json`, bytes(begin(template))), rootInstallStatus: status, admissionTemplateIdentity: template, admissionCommitIndexHead: status === 'prepared' ? null : result.admissionCommitIndexHead, admissionCommitResult: ['prepared', 'admission_committed_suffix_pending'].includes(status) ? null : { identity: status === 'committed' ? file(resultTarget.canonicalPath, bytes(result)) : null, result } }
}
const members = roles => roles.map((role, index) => ({ memberOrdinal: String(index + 1).padStart(4, '0'), role, byteSize: 3, sha256: digest(Buffer.from('{}\n')) }))
const descriptor = (operation, extra, roles) => ({ schemaVersion: `${S}feature-integration-transaction/v1`, transactionId: TX, inputRecordSha256: ['reserve_intent', 'publish_receipt'].includes(operation) ? digest(Buffer.from('{}\n')) : HASH, members: members(roles), createdAt: AT, scope: 'attempt', operation, attemptId: ATTEMPT, priorEventSha256: HASH, priorCampaignIndexHead: INDEX_HEAD, ...extra })
const descriptors = [
  ['new begin', { schemaVersion: `${S}feature-integration-transaction/v1`, transactionId: TX, inputRecordSha256: HASH, members: members(['attempt_incomplete_marker', ...Array(5).fill('attachment'), 'event', 'campaign_index', 'handoff', 'campaign_index']), createdAt: AT, scope: 'campaign', operation: 'begin_with_handoff', campaignMode: 'new_campaign', rootInstall: 'atomic_first_root', attemptId: ATTEMPT, priorCampaignIndexHead: null, readyEventSha256: digest(Buffer.from('{}\n')), beginAdmission: binding(templateNew) }],
  ['existing begin', { schemaVersion: `${S}feature-integration-transaction/v1`, transactionId: TX, inputRecordSha256: HASH, members: members(['campaign_index', 'attempt_incomplete_marker', ...Array(5).fill('attachment'), 'event', 'handoff', 'campaign_index']), createdAt: AT, scope: 'campaign', operation: 'begin_with_handoff', campaignMode: 'existing_campaign_new_attempt', rootInstall: 'existing_root_transaction', attemptId: ATTEMPT, priorCampaignIndexHead: INDEX_HEAD, readyEventSha256: digest(Buffer.from('{}\n')), beginAdmission: binding(templateExisting) }],
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
  ['attempt quarantine', { schemaVersion: `${S}feature-integration-transaction/v1`, transactionId: TX, inputRecordSha256: HASH, members: members(['raw_artifact', 'manifest', 'campaign_index']), createdAt: AT, scope: 'campaign', operation: 'quarantine', attemptId: ATTEMPT, recoveryId: RECOVERY, priorCampaignIndexHead: INDEX_HEAD, exactDamagedTreeSha256: HASH, ownerTerminationProofSha256: HASH, recoveryReservationSha256: HASH }],
  ['publication recovery', { schemaVersion: `${S}feature-integration-transaction/v1`, transactionId: TX, inputRecordSha256: HASH, members: members(['campaign_quarantine_recovery_record', 'campaign_index']), createdAt: AT, scope: 'campaign', operation: 'recover_campaign_publication', recoveryId: RECOVERY, subject: { kind: 'attempt_publication', attemptId: ATTEMPT, phase: 'begin_zero_prefix' }, priorCampaignIndexHead: null, recoveryIntentSha256: HASH, recoveryReservationSha256: HASH, ownerTerminationProofSha256: HASH, exactDamagedTreeSha256: HASH, publicationRecovery: { recoveryId: RECOVERY, path: `campaign-quarantines/${RECOVERY}/recovery-record.json`, schemaVersion: `${S}feature-integration-campaign-publication-recovery/v1`, byteSize: 3, sha256: digest(Buffer.from('{}\n')) }, replacementKind: 'attempt_quarantined' }]
]
const receipt = desc => ({ schemaVersion: `${S}feature-integration-transaction-receipt/v1`, transactionId: desc.transactionId, descriptorSha256: hash(desc), commitMemberOrdinal: desc.members.at(-1).memberOrdinal, publishedMembers: desc.members.map(({ role, ...member }) => member), completionMode: 'initial', outcome: 'committed', recordedAt: AT, ...(desc.operation === 'begin_with_handoff' ? { completionMode: 'admission_canonical', campaignMode: desc.campaignMode, rootInstall: desc.rootInstall, commitDeadlineFence: 'native_checked_immediately_before_publish_with_lifecycle_expiry', ...(desc.campaignMode === 'existing_campaign_new_attempt' ? { admissionCommitMemberOrdinal: '0001' } : {}) } : {}) })
const marker = { schemaVersion: `${S}feature-integration-attempt-incomplete/v1`, attemptId: ATTEMPT, beginTransactionId: TX, readyEventSha256: HASH, createdAt: AT }
const reservation = { schemaVersion: `${S}feature-integration-recovery-reservation/v1`, recoveryId: RECOVERY, attemptId: ATTEMPT, transactionId: TX, priorCampaignIndexHead: INDEX_HEAD, reasonCode: 'damaged_publication', exactDamagedTreeSha256: HASH, ownerTerminationProofSha256: HASH, createdAt: AT }
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
  { ...campaignLockBase, operation: 'recover_campaign_publication', recoveryId: RECOVERY, subject: { kind: 'attempt_publication', attemptId: ATTEMPT, phase: 'begin_zero_prefix' }, inputRecordSha256: HASH, priorCampaignIndexHead: null, recoveryIntentSha256: HASH, recoveryReservationSha256: HASH, ownerTerminationProofSha256: HASH, exactDamagedTreeSha256: HASH, publicationRecoverySha256: HASH, replacementKind: 'attempt_quarantined' }
]
const OPERATIONS = ['publish-branch', 'create-pull-request', 'close-pull-request-abort', 'delete-remote-branch-abort', 'prepare-merge-commit', 'integrate-main-exact-lease', 'fetch-after-integration', 'dispatch-extensions-quality', 'dispatch-workflow-contracts', 'dispatch-code-consistency-review-scaffold', 'dispatch-three-extension-ui-contracts', 'cleanup-generated-paths', 'fast-forward-root', 'remove-feature-worktree', 'delete-local-branch']
const executable = name => ({ logicalName: name, ...file(`C:/wave0a/tools/${name}.exe`), version: 'synthetic-version-1' })
const gitExecutable = executable('git')
const command = { id: 'capability-probe', executable: 'git', argv: ['-c', 'core.hooksPath=NUL', 'version'], cwd: { kind: 'absolute', path: 'C:/wave0a/probe' }, stdinBytes: 0, stdinSha256: digest(Buffer.alloc(0)), stdoutBytes: 0, stderrBytes: 0, stdoutSha256: digest(Buffer.alloc(0)), stderrSha256: digest(Buffer.alloc(0)), startedAt: AT, finishedAt: AT, outcome: 'success', exitCode: 0 }
const coordinationEntries = OPERATIONS.map(operationInstanceId => ({ operationInstanceId, coordinationFile: { ...file(`C:/wave0a/coordination/${operationInstanceId}`, Buffer.from([0])), linkCount: 1, attributes: '128', reparseTag: '0' } }))
const externalTools = { gitExecutable, ghExecutable: executable('gh'), nodeExecutable: executable('node'), pwshExecutable: executable('pwsh'), credentialExecutionAuthority: { canonicalPath: 'C:/wave0a/authority/credentials.json', sha256: HASH }, operationCoordination: { entries: coordinationEntries, count: 15, tupleSha256: hash(coordinationEntries) }, gitRefTransactionCapability: { schemaVersion: `${S}git-ref-transaction-capability/v1`, gitExecutableSha256: gitExecutable.sha256, probeRepository: directory('C:/wave0a/probe'), stdinSha256: command.stdinSha256, command, result: 'symref_verify_and_ref_cas_atomic', observedAt: AT } }
const fixtures = [
  ['ExecutableIdentity', gitExecutable], ['CommandObservation', command],
  ['RepoObjectIdentity', INDEX], ['ExternalFileIdentity', { canonicalPath: 'C:/wave0a/external.json', byteSize: 3, sha256: digest(Buffer.from('{}\n')) }], ['FileIdentity', installedBinding.fileIdentity], ['DirectoryIdentity', finalized.root], ['DirectoryHandleIdentity', scope.rootWorktree],
  ['SourceOrigin', { kind: 'archive', archiveManifestIdentity: { canonicalPath: 'C:/wave0a/manifest.json', byteSize: 3, sha256: digest(Buffer.from('{}\n')) }, fromSha: B, toSha: H, oldPullRequestNumber: 1, sourceItemId: 'item-1' }], ['SourceOrigin', { kind: 'current_main', baselineSha: B, existingEvidenceId: 'BASE-WAVE0A-MAIN' }], ['SourceOrigin', { kind: 'new_design', requiredSpecIdentity: 'SPEC-V1', designSpecIdentity: PLAN }],
  ['Wave0aSubject', SUBJECT], ['Wave0aDecisionAuthority', DECISION], ['IndexHead', INDEX_HEAD], ['Wave0aLocalRepositoryScope', scope], ['WorktreeRegistryFence', scope.worktreeRegistryFence], ['WorktreeRegistryFence', rootFence], ['NoFollowPathAbsenceProof', absence('C:/wave0a/absent')], ['WindowsProcessIdentity', processIdentity], ['OperationCoordinationEntry', coordination], ['OperationClaimLink', claim()], ['OperationTerminationProofLink', proof()], ['ClosedInitialControlBindingFileIdentity', installedBinding], ['StagedClosedInitialControlBindingIdentity', stagedBinding], ['BeginAdmissionTemplateIdentity', templateNew], ['BeginAdmissionTemplateIdentity', templateExisting], ['BeginResult', begin(templateNew)], ['BeginResult', begin(templateExisting)], ['BeginAdmissionCommitBinding', binding(templateNew)], ['BeginAdmissionCommitBinding', binding(templateExisting)], ['FirstRootInstallPlan', installPlan], ['BeginAdmissionCommitResult', commitResult(templateNew)], ['BeginAdmissionCommitResult', commitResult(templateExisting)],
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
test('campaign primitives: worktree registry and no-follow child identity cannot cross', () => {
  for (const change of [s => { [s.worktreeRegistryFence.featureWorktreeGitFile, s.worktreeRegistryFence.featureAdminGitdirBackpointer] = [s.worktreeRegistryFence.featureAdminGitdirBackpointer, s.worktreeRegistryFence.featureWorktreeGitFile] }, s => { s.worktreeRegistryFence.rootAdminDirectory = s.worktreeRegistryFence.featureAdminDirectory }, s => { s.worktreeRegistryFence.featureHeadFile.canonicalPath += '-other' }, s => { s.objectDirectory.canonicalPath = 'C:/outside' }, s => { s.worktreeRegistryFence.commonGitDirectory.ino = '999' }]) { const bad = clone(scope); change(bad); assert.throws(() => policy.validateCampaignPrimitive('Wave0aLocalRepositoryScope', bad), TypeError) }
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
})

test('campaign primitives: export surface is exact and excludes legacy authority entrypoints', () => {
  assert.deepEqual(Object.keys(policy).sort(), [
    'buildAttachmentFixture', 'buildFullArchivePreflightFixture', 'canonicalJson', 'decodeArchiveFixtureLiteral',
    'getAttachmentSchemaRegistry', 'getFirstRootInstallPolicy', 'parseAttachmentBytes', 'parseCanonicalJson',
    'validateAttachmentByteSize', 'validateAttachmentPayload', 'validateCampaignPrimitive',
    'validateFullArchivePreflightFixture', 'validateOperationEvidenceContractEntryStructure',
    'validateRawCandidateByteSize', 'validateRawCandidatePayload', 'validateTransactionDescriptor',
    'validateTransactionReceipt'
  ].sort())
  for (const name of ['normalizeApprovalMessage', 'getWave0aOperationEvidenceContract', 'getWave0aOperationExecutionDag']) assert.equal(Object.hasOwn(policy, name), false)
})

test('campaign primitives: active policy source excludes legacy authorization vocabulary', async () => {
  const source = await readFile(new URL('../featureIntegrationCampaignPolicy.mjs', import.meta.url), 'utf8')
  for (const forbidden of [
    'codex_trusted_transcript_v1', 'terminal LF', 'approvalText', 'requestSha256=',
    'approvalRecordSha256', 'campaignExecutionApprovalIdentity', 'provisioningApprovalIdentity'
  ]) assert.equal(source.includes(forbidden), false, forbidden)
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

// Literal expectations independently checked against StringComparer.OrdinalIgnoreCase.
const reviewOrdinalCases = [
  ['ı', 'I', false], ['ſ', 'S', false], ['ß', 'SS', false], ['ß', 'ẞ', false],
  ['日本語', '日本語', true], ['a', 'A', true], ['é', 'É', true], ['σ', 'ς', true], ['µ', 'Μ', true],
  ['\u1f80', '\u1f88', true], ['\u1fb3', '\u1fbc', true], ['\u{10428}', '\u{10400}', true], ['\u{10d50}', '\u{10d70}', true],
  ['\u019b', '\ua7dc', false], ['\u0264', '\ua7cb', false], ['\u1c89', '\u1c8a', false],
  ['\ua7d2', '\ua7d3', false], ['\u{16ea0}', '\u{16ebb}', false]
]
for (const [left, right, equivalent] of reviewOrdinalCases) test(`campaign primitives: review regression ordinal ${left}/${right}`, () => {
  const original = absence(`C:/wave0a/${left}`)
  assert.deepEqual(policy.validateCampaignPrimitive('NoFollowPathAbsenceProof', original), original)
  const candidate = { ...original, canonicalPath: `C:/wave0a/${right}` }
  if (equivalent) assert.deepEqual(policy.validateCampaignPrimitive('NoFollowPathAbsenceProof', candidate), candidate)
  else assert.throws(() => policy.validateCampaignPrimitive('NoFollowPathAbsenceProof', candidate), TypeError)
  const coordinationSet = clone(externalTools.operationCoordination)
  coordinationSet.entries[0].coordinationFile.canonicalPath = `C:/wave0a/coordination/${left}`
  coordinationSet.entries[1].coordinationFile.canonicalPath = `C:/wave0a/coordination/${right}`
  coordinationSet.tupleSha256 = hash(coordinationSet.entries)
  if (equivalent) assert.throws(() => policy.validateCampaignPrimitive('OperationCoordinationAuthority', coordinationSet), TypeError)
  else assert.deepEqual(policy.validateCampaignPrimitive('OperationCoordinationAuthority', coordinationSet), coordinationSet)
  const staged = clone(finalized)
  staged.root.canonicalPath = `C:/wave0a/${left}`
  for (const key of ['attemptIncompleteMarker', 'attemptStarted', 'readyEvent', 'readyHandoff', 'beginTransactionDescriptor', 'beginTransactionReceipt']) staged[key].canonicalPath = staged[key].canonicalPath.replace('C:/wave0a/staged', `C:/wave0a/${right}`)
  for (const key of ['campaignIndexPublicationLock', 'attemptPublicationLock', 'recoveryFenceRoot']) staged.transientAbsence[key] = absence(staged.transientAbsence[key].canonicalPath.replace('C:/wave0a/staged', `C:/wave0a/${right}`))
  staged.transientAbsence.tupleSha256 = hash(['campaignIndexPublicationLock', 'attemptPublicationLock', 'recoveryFenceRoot'].map(key => [key, staged.transientAbsence[key]]))
  if (equivalent) assert.deepEqual(policy.validateCampaignPrimitive('FinalizedReadyStagedRootIdentity', staged), staged)
  else assert.throws(() => policy.validateCampaignPrimitive('FinalizedReadyStagedRootIdentity', staged), TypeError)
})

test('campaign primitives: review regression suffix-pending requires exact successor attempt-start head', () => {
  const good = observation(templateExisting, 'admission_committed_suffix_pending')
  assert.deepEqual(policy.validateCampaignPrimitive('BeginAdmissionObservation', good), good)
  for (const head of [INDEX_HEAD, { sequence: 9, path: 'campaign-index/0009-attempt_finalized.json', sha256: HASH }, { sequence: 3, path: 'campaign-index/0003-operator_handoff.json', sha256: HASH }, { sequence: 9, path: 'campaign-index/0009-attempt_started.json', sha256: HASH }]) {
    assert.throws(() => policy.validateCampaignPrimitive('BeginAdmissionObservation', { ...good, admissionCommitIndexHead: head }), TypeError)
  }
  for (const template of [templateNew, templateExisting]) {
    const prepared = observation(template, 'prepared')
    assert.deepEqual(policy.validateCampaignPrimitive('BeginAdmissionObservation', prepared), prepared)
  }
  assert.throws(() => policy.validateCampaignPrimitive('BeginAdmissionObservation', observation(templateNew, 'admission_committed_suffix_pending')), TypeError)
})

for (const template of [templateNew, templateExisting]) test(`campaign primitives: review regression installed root invariant identity ${template.record.campaignMode}`, () => {
  const good = commitResult(template)
  assert.deepEqual(policy.validateCampaignPrimitive('BeginAdmissionCommitResult', good), good)
  for (const key of ['dev', 'ino', 'attributes']) {
    const bad = clone(good); bad.installedRoot[key] = String(BigInt(bad.installedRoot[key]) + 1n)
    assert.throws(() => policy.validateCampaignPrimitive('BeginAdmissionCommitResult', bad), TypeError, `changed ${key}`)
  }
  const badPath = clone(good); badPath.installedRoot.canonicalPath += '-other'
  assert.throws(() => policy.validateCampaignPrimitive('BeginAdmissionCommitResult', badPath), TypeError)
  if (template.record.campaignMode === 'new_campaign') assert.notEqual(good.installedRoot.canonicalPath, template.record.stagedRoot.canonicalPath)
})

for (const [name, fixture] of descriptors.filter(([, value]) => value.operation === 'begin_with_handoff')) test(`campaign primitives: review regression READY event digest ${name}`, () => {
  assert.deepEqual(policy.validateTransactionDescriptor(fixture), fixture)
  for (const target of ['descriptor', 'event']) {
    const bad = clone(fixture)
    if (target === 'descriptor') bad.readyEventSha256 = HASH
    else bad.members.find(member => member.role === 'event').sha256 = HASH
    assert.throws(() => policy.validateTransactionDescriptor(bad), TypeError)
  }
})

// Phase 2B: these in-memory producer observations are test-owned, not a claim
// that Git/GitHub/native commands were executed or a filesystem was inspected.
const A_BRANCH = 'codex/feature-integration-selection-design'
const M = '0bd4d0e461bfbf5e2df13f6f483accc3ef464005'
const EMPTY_SHA = digest(Buffer.alloc(0))
const WF = ['extensions-quality', 'workflow-contracts', 'code-consistency-review-scaffold', 'three-extension-ui-contracts']
const A_PR = { repository: 'katamor1/bob_builtin_analyze', number: 123, headRepository: 'katamor1/bob_builtin_analyze', isCrossRepository: false, headRef: A_BRANCH, headSha: H, baseRef: 'main', baseSha: B }
const prObserved = (state = 'OPEN', main = B) => ({ repository: A_PR.repository, number: A_PR.number, headRepository: A_PR.headRepository, isCrossRepository: false, headRefName: A_BRANCH, headRefOid: H, baseRefName: 'main', originalBaseSha: B, observedBaseRefOid: main, state, ...(state === 'MERGED' ? { mergeCommitOid: M, mergedAt: AT } : {}) })
const A_STATE = { headSha: H, treeOid: TREE, statusSha256: EMPTY_SHA }
const A_EXTERNAL = new Map(), A_CAMPAIGN = new Map()
const externalAttachment = (name, payload) => { const content = bytes(payload), path = `C:/wave0a/evidence/${name}.json`; A_EXTERNAL.set(path, content); return { canonicalPath: path, byteSize: content.length, sha256: digest(content), schemaVersion: payload.schemaVersion } }
const attemptAttachment = (label, payload, ordinal = 1) => { const content = bytes(payload), path = `attachments/${String(ordinal).padStart(4, '0')}-${label}.json`; A_CAMPAIGN.set(`attempts/${ATTEMPT}/${path}`, content); return { owner: 'attempt', attemptId: ATTEMPT, label, path, schemaVersion: payload.schemaVersion, byteSize: content.length, sha256: digest(content) } }
const operationAttachment = (operationInstanceId, recordKind, label, payload, ordinal = 1) => {
  const leaf = ['precondition', 'postcondition'].includes(recordKind) ? `${recordKind}s/${String(ordinal).padStart(4, '0')}-${label}.json` : recordKind === 'claim' ? `claims/${String(ordinal).padStart(4, '0')}.json` : recordKind === 'termination_proof' ? `termination-proofs/${String(ordinal).padStart(4, '0')}.json` : `${recordKind.replaceAll('_', '-')}.json`
  const content = bytes(payload), path = `operations/${ATTEMPT}/${operationInstanceId}/${leaf}`; A_CAMPAIGN.set(path, content)
  return { owner: 'operation', attemptId: ATTEMPT, operationInstanceId, recordKind, label, path, schemaVersion: payload.schemaVersion, byteSize: content.length, sha256: digest(content) }
}
const A_PROTECTED = { schemaVersion: `${S}protected-clone-baseline/v1`, literalPath: 'C:\\Users\\stell\\source\\repos\\bob_builtin_analyze\\.integration-xlsx-on-prereq', canonicalPath: 'C:/Users/stell/source/repos/bob_builtin_analyze/.integration-xlsx-on-prereq', lstat: { dev: '1', ino: '42', size: '0', mtimeNs: '1', ctimeNs: '1', attributes: '16', reparseTag: '0' }, tree: { algorithm: 'sha256-canonical-no-follow-v1', entryCount: 1, regularFileCount: 1, totalRegularFileBytes: '10', canonicalTupleStreamSha256: digest(Buffer.from('test-owned protected tree tuple stream\n')) }, capturedAt: AT }
const A_TOPOLOGY_REQUEST = { schemaVersion: `${S}slice-topology-request/v1`, repository: 'katamor1/bob_builtin_analyze', expectedLiveMainSha: B, expectedOriginMainSha: B, expectedRootMainSha: B, rootWorktreePath: scope.rootWorktree.canonicalPath, protectedCloneBaseline: externalAttachment('protected', A_PROTECTED), snapshotProfile: 'READY', activeWorktreePath: scope.featureWorktree.canonicalPath, activeBranch: A_BRANCH, expectedFeatureHeadSha: H }
const A_WORKTREES = [{ canonicalPath: scope.featureWorktree.canonicalPath, headSha: H, branch: A_BRANCH, detached: false, bare: false, locked: false, prunable: false }, { canonicalPath: scope.rootWorktree.canonicalPath, headSha: B, branch: 'main', detached: false, bare: false, locked: false, prunable: false }]
const A_TOPOLOGY_OBSERVATION = { liveMainSha: B, originMainSha: B, rootMainSha: B, repositorySettings: { nameWithOwner: 'katamor1/bob_builtin_analyze', defaultBranchRef: { name: 'main' }, deleteBranchOnMerge: false }, remoteHeads: [{ ref: 'main', sha: B }], localHeads: [{ ref: A_BRANCH, sha: H }, { ref: 'main', sha: B }], archiveRefs: [], worktrees: A_WORKTREES, worktreesSha256: hash(A_WORKTREES), worktreePruneDryRun: { lines: [], normalizedUtf8Sha256: EMPTY_SHA }, activeWorktreeStatus: { lines: [], normalizedUtf8Sha256: EMPTY_SHA }, rootWorktreeStatus: { lines: ['?? .integration-xlsx-on-prereq/'], normalizedUtf8Sha256: digest(Buffer.from('?? .integration-xlsx-on-prereq/\n')) }, openPullRequests: [], namedPullRequest: { observation: 'absent', pullRequest: null }, protectedCloneTreeSha256: A_PROTECTED.tree.canonicalTupleStreamSha256 }
const A_TOPOLOGY = { schemaVersion: `${S}slice-topology-evidence/v1`, request: A_TOPOLOGY_REQUEST, before: clone(A_TOPOLOGY_OBSERVATION), after: clone(A_TOPOLOGY_OBSERVATION), result: 'accepted', observedAt: AT, diagnostics: [] }
const A_GENERATED = { schemaVersion: `${S}wave0a-generated-paths/v1`, phase: 'before', ...A_STATE, roots: [{ repositoryPath: 'extensions/workflow-register/out', kind: 'absent', entryCount: 0, totalBytes: '0' }], observedAt: AT, diagnostics: [] }
const A_DELETION = { schemaVersion: `${S}wave0a-generated-deletion-plan/v1`, mode: 'main_only_cleanup', headSha: H, treeOid: TREE, repositoryRoot: scope.featureWorktree, retainedParentAnchors: [], parentAnchorCount: 0, parentAnchorAggregateSha256: hash([]), baselineInventorySha256: hash(A_GENERATED), generatedInventorySha256: hash(A_GENERATED), entries: [], entriesSha256: hash([]), totalEntryCount: 0, maxDepth: 0, totalPathBytes: 0, totalFileBytes: '0', createdAt: AT, diagnostics: [] }
const A_CLEANUP = { schemaVersion: `${S}wave0a-generated-cleanup/v1`, mode: 'main_only_cleanup', headSha: H, before: A_STATE, after: A_STATE, beforeInventorySha256: hash(A_GENERATED), afterInventorySha256: hash(A_GENERATED), deletionPlanSha256: hash(A_DELETION), operationIntentSha256: HASH, acknowledgementAggregateSha256: hash([]), nativeResultSha256: HASH, progressAggregateSha256: hash([]), removedRoots: [], finalStatusSha256: EMPTY_SHA, observedAt: AT, diagnostics: [] }
const fixedDirectoryHandle = (path, ino) => ({ ...dir(path), ino })
const A_ROOT_KEEP = fixedDirectoryHandle(`${scope.rootWorktree.canonicalPath}/keep`, '201')
const fixedFileIdentity = (path, content, ino) => ({ canonicalPath: path, dev: '1', ino, size: String(content.length), mtimeNs: '1', ctimeNs: '1', sha256: digest(content) })
const A_ROOT_OLD = fixedFileIdentity(`${scope.rootWorktree.canonicalPath}/obsolete/old.txt`, Buffer.from('old!!'), '143')
const A_ROOT_OBSOLETE = fixedDirectoryHandle(`${scope.rootWorktree.canonicalPath}/obsolete`, '202')
const A_ROOT_CHANGED = fixedFileIdentity(`${scope.rootWorktree.canonicalPath}/keep/change.txt`, Buffer.from('old!'), '144')
const A_ROOT_ACTIONS = [
  { actionOrdinal: 1, chunkOrdinal: 1, repositoryPath: 'keep', leaf: 'keep', depth: 1, parentActionOrdinal: 0, rootAnchor: 'root_worktree', kind: 'retain_directory', sourceTreeOid: B, targetTreeOid: H, expectedTarget: A_ROOT_KEEP },
  { actionOrdinal: 2, chunkOrdinal: 1, repositoryPath: 'obsolete/old.txt', parentRelativePath: 'obsolete', leaf: 'old.txt', depth: 2, parentActionOrdinal: 3, kind: 'delete_regular_file', sourceObjectOid: B, sourceGitMode: '100644', sourceByteSize: 5, sourceBlobSha256: A_ROOT_OLD.sha256, expectedTarget: A_ROOT_OLD },
  { actionOrdinal: 3, chunkOrdinal: 1, repositoryPath: 'obsolete', leaf: 'obsolete', depth: 1, parentActionOrdinal: 0, rootAnchor: 'root_worktree', kind: 'delete_empty_directory', sourceTreeOid: B, expectedTarget: A_ROOT_OBSOLETE, expectedEmptyAtDeleteOrdinal: true },
  { actionOrdinal: 4, chunkOrdinal: 1, repositoryPath: 'newdir', leaf: 'newdir', depth: 1, parentActionOrdinal: 0, rootAnchor: 'root_worktree', kind: 'create_directory', targetTreeOid: H, expectedAbsent: true },
  { actionOrdinal: 5, chunkOrdinal: 1, repositoryPath: 'newdir/new.txt', parentRelativePath: 'newdir', leaf: 'new.txt', depth: 2, parentActionOrdinal: 4, kind: 'install_regular_file', targetObjectOid: H, targetGitMode: '100644', targetByteSize: 6, targetBlobSha256: digest(Buffer.from('new!!!')), expectedAbsent: true, scratchLeaf: '0005-new.txt' },
  { actionOrdinal: 6, chunkOrdinal: 1, repositoryPath: 'keep/change.txt', parentRelativePath: 'keep', leaf: 'change.txt', depth: 2, parentActionOrdinal: 1, kind: 'delete_regular_file', sourceObjectOid: B, sourceGitMode: '100644', sourceByteSize: 4, sourceBlobSha256: A_ROOT_CHANGED.sha256, expectedTarget: A_ROOT_CHANGED },
  { actionOrdinal: 7, chunkOrdinal: 1, repositoryPath: 'keep/change.txt', parentRelativePath: 'keep', leaf: 'change.txt', depth: 2, parentActionOrdinal: 1, kind: 'install_regular_file', targetObjectOid: H, targetGitMode: '100755', targetByteSize: 7, targetBlobSha256: digest(Buffer.from('changed')), expectedAbsent: true, scratchLeaf: '0007-change.txt' }
]
const A_MATERIALIZATION = { schemaVersion: `${S}root-materialization-plan/v1`, attemptId: ATTEMPT, operationInstanceId: 'fast-forward-root', baseSha: B, mergeSha: M, baseTreeOid: TREE, mergeTreeOid: TREE, rootWorktree: scope.rootWorktree, worktreeRegistryFence: scope.worktreeRegistryFence, actions: A_ROOT_ACTIONS, actionCount: 7, maxDepth: 2, totalPathBytes: 100, maxFileBytes: 7, totalBlobBytes: '22', chunkCount: 1, actionsSha256: hash(A_ROOT_ACTIONS), createdAt: AT, diagnostics: [] }
const A_EMPTY_MATERIALIZATION = { ...A_MATERIALIZATION, actions: [], actionCount: 0, maxDepth: 0, totalPathBytes: 0, maxFileBytes: 0, totalBlobBytes: '0', chunkCount: 0, actionsSha256: '37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570' }
const A_RUN = (index, event = 'pull_request') => ({ runId: 101 + index, workflowPath: `.github/workflows/${WF[index]}.yml`, headSha: event === 'pull_request' ? H : M, runAttempt: 1, createdAt: '2026-08-23T00:00:00Z', displayTitle: event === 'pull_request' ? 'test-owned PR run' : `wave0a-${M}-${TX}`, event, headBranch: event === 'pull_request' ? A_BRANCH : 'main', ...(event === 'workflow_dispatch' ? { dispatchNonce: TX } : {}) })
const A_BOUNDARY = event => ({ schemaVersion: `${S}exact-head-trigger-boundary/v1`, headSha: event === 'pull_request' ? H : M, triggerNotBefore: '2026-08-23T00:00:00Z', recordedAt: AT, event, headBranch: event === 'pull_request' ? A_BRANCH : 'main', triggerIntents: (event === 'pull_request' ? ['create-pull-request'] : OPERATIONS.slice(7, 11)).map(id => operationAttachment(id, 'intent', 'intent', { schemaVersion: `${S}wave0a-mutation-intent/v1` })), triggerNotBeforeByWorkflow: Object.fromEntries((event === 'pull_request' ? ['pull-request'] : WF).map(id => [id, '2026-08-23T00:00:00Z'])), ...(event === 'workflow_dispatch' ? { dispatchNonceByWorkflow: Object.fromEntries(WF.map(id => [id, TX])) } : {}) })
const A_SNAPSHOT = event => ({ schemaVersion: `${S}exact-head-run-set-snapshot/v1`, request: { repository: 'katamor1/bob_builtin_analyze', event, expectedHeadSha: event === 'pull_request' ? H : M, expectedRef: event === 'pull_request' ? A_BRANCH : 'main' }, runIdsByWorkflow: Object.fromEntries(WF.map(id => [id, []])), observedAt: '2026-08-22T23:59:59.000Z', diagnostics: [] })
const A_DISCOVERY = event => { const boundary = A_BOUNDARY(event); return { schemaVersion: `${S}exact-head-run-discovery/v1`, request: { schemaVersion: `${S}exact-head-run-discovery-request/v1`, ...A_SNAPSHOT(event).request, triggerBoundarySha256: hash(boundary) }, beforeSnapshotSha256: hash(A_SNAPSHOT(event)), triggerBoundary: boundary, triggerNotBefore: boundary.triggerNotBefore, triggerNotBeforeByWorkflow: boundary.triggerNotBeforeByWorkflow, ...(event === 'workflow_dispatch' ? { dispatchNonceByWorkflow: boundary.dispatchNonceByWorkflow } : {}), selectedRuns: Object.fromEntries(WF.map((id, i) => [id, A_RUN(i, event)])), observedAt: AT, diagnostics: [] } }
const JOB_ROWS = [['workflow-register', 0, 'ubuntu-latest'], ['bob-bazaar-review', 0, 'ubuntu-latest'], ['bob-code-consistency-review', 0, 'ubuntu-latest'], ['Windows / workflow-register', 0, 'windows-latest'], ['Windows / bob-bazaar-review', 0, 'windows-latest'], ['Windows / bob-code-consistency-review', 0, 'windows-latest'], ['Real-machine environment contracts', 0, 'windows-latest'], ['Extension source metrics', 0, 'ubuntu-latest'], ['Strict workflow validation', 1, 'ubuntu-latest'], ['Validate scaffold', 2, 'ubuntu-latest'], ['Validate VS Code extension', 2, 'ubuntu-latest'], ['UI and documentation contracts', 3, 'ubuntu-latest']]
const A_CI = (event = 'pull_request') => ({ schemaVersion: `${S}exact-head-ci-evidence/v1`, repository: 'katamor1/bob_builtin_analyze', mode: event === 'pull_request' ? 'wave0a_pr_head' : 'post_merge_main', event, headSha: event === 'pull_request' ? H : M, ...(event === 'pull_request' ? { baseSha: B, pullRequest: A_PR } : { expectedSkippedJobs: ['Extension source metrics'] }), requiredJobCount: event === 'pull_request' ? 12 : 11, runs: WF.map((_, i) => A_RUN(i, event)), jobs: JOB_ROWS.map(([name, workflowIndex, label], i) => ({ runId: 101 + workflowIndex, jobId: 201 + i, name, labels: [label], headSha: event === 'pull_request' ? H : M, ...(event === 'workflow_dispatch' && name === 'Extension source metrics' ? { conclusion: 'skipped' } : { conclusion: 'success', verificationStep: { name: 'Verify exact checked-out commit', conclusion: 'success' } }) })), result: 'success', observedAt: AT, diagnostics: [] })
const A_MERGEABILITY = { schemaVersion: `${S}pull-request-mergeability/v1`, pullRequest: A_PR, observations: [{ pullRequest: { observation: 'present', pullRequest: prObserved() }, liveMainSha: B, mergeable: 'MERGEABLE', observedAt: AT }], observedAt: AT, diagnostics: [], pollCount: 1, result: 'mergeable' }
const A_SIGNATURE = { name: 'bob-builtin-analyze integration', email: 'noreply@localhost', timestamp: '1787443200 +0000' }
const A_RAW_COMMIT = Buffer.from(`tree ${TREE}\nparent ${B}\nparent ${H}\nauthor ${A_SIGNATURE.name} <${A_SIGNATURE.email}> ${A_SIGNATURE.timestamp}\ncommitter ${A_SIGNATURE.name} <${A_SIGNATURE.email}> ${A_SIGNATURE.timestamp}\n\nMerge Wave 0A integration control plane\n`)
const A_COMMIT_PLAN = { schemaVersion: `${S}merge-commit-plan/v1`, pullRequest: A_PR, treeOid: TREE, firstParentSha: B, secondParentSha: H, author: A_SIGNATURE, committer: A_SIGNATURE, message: 'Merge Wave 0A integration control plane', rawCommitBase64Url: A_RAW_COMMIT.toString('base64url'), rawCommitByteSize: A_RAW_COMMIT.length, rawCommitSha256: digest(A_RAW_COMMIT), expectedMergeSha: createHash('sha1').update(`commit ${A_RAW_COMMIT.length}\0`).update(A_RAW_COMMIT).digest('hex'), createdAt: AT }
const A_COMMAND = { ...command, id: 'test-owned-process-observation' }
const A_PREPARATION = { schemaVersion: `${S}merge-commit-preparation/v1`, pullRequest: A_PR, treeOid: TREE, firstParentSha: B, secondParentSha: H, author: A_SIGNATURE, committer: A_SIGNATURE, messageSha256: digest(Buffer.from('Merge Wave 0A integration control plane\n')), rawCommitByteSize: A_RAW_COMMIT.length, rawCommitSha256: digest(A_RAW_COMMIT), expectedMergeSha: A_COMMIT_PLAN.expectedMergeSha, writeCommand: A_COMMAND, verifiedObjectSha256: digest(A_RAW_COMMIT), result: 'prepared', observedAt: AT, diagnostics: [] }
const A_RECONCILIATION = { schemaVersion: `${S}main-integration-reconciliation/v1`, pullRequest: A_PR, integrationCommand: A_COMMAND, commandPacketSha256: digest(Buffer.from('test-owned atomic two-ref packet\n')), commandRefs: ['refs/heads/main', A_BRANCH], observations: [{ pullRequest: { observation: 'present', pullRequest: prObserved('MERGED', M) }, liveMainSha: M, liveFeatureSha: null, observedAt: AT }], pollCount: 1, classification: { kind: 'integrated_pr_merged', integratedMainSha: M, featureRefDisposition: 'absent' }, observedAt: AT, diagnostics: [] }
const A_REVIEW = { schemaVersion: `${S}feature-integration-independent-review/v1`, baseSha: B, headSha: H, treeOid: TREE, changedPathsSha256: hash([]), exactHeadCiSha256: hash(A_CI()), exactHeadCiObservedAt: AT, reviewRequestSha256: HASH, reviewAttestationSha256: HASH, reviewerTaskId: 'independent-reviewer', reviewerIdentity: 'test-reviewer', reviewMessageSha256: digest(Buffer.from('Critical 0 Important 0\n')), reviewedAt: '2026-08-23T00:00:01.000Z', result: 'approved_zero', criticalCount: 0, importantCount: 0 }
const A_ATTACHMENT_FIXTURES = new Map([
  ['protected-clone-baseline', A_PROTECTED], ['slice-topology-evidence', A_TOPOLOGY],
  ['slice-topology-recovery-observation', { ...A_TOPOLOGY, schemaVersion: `${S}slice-topology-recovery-observation/v1`, request: (({ snapshotProfile, ...request }) => request)(A_TOPOLOGY_REQUEST), result: 'observed_recovery' }],
  ['wave0a-generated-paths', A_GENERATED], ['wave0a-generated-deletion-plan', A_DELETION], ['wave0a-generated-cleanup', A_CLEANUP], ['root-materialization-plan', A_MATERIALIZATION],
  ['wave0a-cleanup-progress', { schemaVersion: `${S}wave0a-cleanup-progress/v1`, journal: 'main_only_cleanup', authoritySha256: HASH, runPublicationReservationSha256: HASH, effectiveClaim: claim('cleanup-generated-paths'), deletionPlanSha256: HASH, chunkOrdinal: 1, firstDeleteOrdinal: 1, lastDeleteOrdinal: 1, completedPrefixCount: 1, rollingPrefixSha256: HASH, absenceAndSuffixObservationSha256: HASH, nativeAcknowledgementSha256: HASH, recordedAt: AT }],
  ['wave0a-dispatch-run-observation', { schemaVersion: `${S}wave0a-dispatch-run-observation/v1`, intentSha256: HASH, beforeSnapshotSha256: hash(A_SNAPSHOT('workflow_dispatch')), observedAt: AT, diagnostics: [], result: 'observed', run: A_RUN(0, 'workflow_dispatch'), operationInstanceId: 'dispatch-extensions-quality', workflowId: 'extensions-quality' }],
  ['feature-integration-independent-review', A_REVIEW], ['exact-head-run-set-snapshot', A_SNAPSHOT('pull_request')], ['exact-head-run-discovery', A_DISCOVERY('pull_request')],
  ['exact-head-run-discovery-failure', { schemaVersion: `${S}exact-head-run-discovery-failure/v1`, request: A_DISCOVERY('pull_request').request, beforeSnapshotSha256: hash(A_SNAPSHOT('pull_request')), triggerBoundarySha256: hash(A_BOUNDARY('pull_request')), candidatesByWorkflow: Object.fromEntries(WF.map(id => [id, []])), reason: 'missing_workflow', observedAt: AT, diagnostics: [] }],
  ['exact-head-ci-evidence', A_CI()], ['pull-request-mergeability', A_MERGEABILITY], ['merge-commit-plan', A_COMMIT_PLAN], ['merge-commit-preparation', A_PREPARATION], ['main-integration-reconciliation', A_RECONCILIATION],
  ['wave0a-capacity-observation', { schemaVersion: `${S}wave0a-capacity-observation/v1`, phase: 'pre_main_closure', attemptId: ATTEMPT, currentEventSha256: HASH, requiredProjectionSha256: HASH, limitingCounters: [], canProceed: true, observedAt: AT, diagnostics: [] }],
  ['remote-branch-deletion', { schemaVersion: `${S}remote-branch-deletion/v1`, branch: A_BRANCH, expectedHeadSha: H, observedMainBefore: B, observedMainAfter: B, before: [{ ref: A_BRANCH, sha: H }, { ref: 'main', sha: B }], operation: A_COMMAND, after: [{ ref: 'main', sha: B }], result: 'deleted', observedAt: AT }],
  ['pull-request-observation', { schemaVersion: `${S}pull-request-observation/v1`, observedAt: AT, observation: 'present', pullRequest: prObserved() }],
  ['remote-ref-observation', { schemaVersion: `${S}remote-ref-observation/v1`, refs: [{ ref: 'main', sha: B }], observedAt: AT }],
  ['partial-run-evidence', { schemaVersion: `${S}partial-run-evidence/v1`, assessment: 'poll_exhausted', runs: WF.map(id => ({ workflowPath: `.github/workflows/${id}.yml`, event: 'pull_request', headSha: H, headBranch: A_BRANCH, observation: 'missing' })), jobs: JOB_ROWS.map(([name, wi]) => ({ workflowPath: `.github/workflows/${WF[wi]}.yml`, name, observation: 'run_missing' })), observedAt: AT, diagnostics: [] }]
])

const A_ENVIRONMENT = { SystemRoot: 'C:/Windows', ComSpec: 'C:/Windows/System32/cmd.exe', USERPROFILE: 'C:/wave0a/profile', APPDATA: 'C:/wave0a/profile/AppData/Roaming', LOCALAPPDATA: 'C:/wave0a/profile/AppData/Local', TEMP: 'C:/wave0a/temp', TMP: 'C:/wave0a/temp', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_SYSTEM: 'NUL', GIT_CONFIG_GLOBAL: 'C:/wave0a/global.gitconfig', GIT_OPTIONAL_LOCKS: '0', GIT_PAGER: 'cat', GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never', GH_CONFIG_DIR: 'C:/wave0a/gh', GH_HOST: 'github.com', GH_PROMPT_DISABLED: '1', NO_COLOR: '1' }
const A_COMMAND_PLAN = { executableIdentity: gitExecutable, argv: ['version'], argvSha256: hash(['version']), stdin: { kind: 'none' }, environment: A_ENVIRONMENT, environmentSha256: hash(A_ENVIRONMENT), cwd: { kind: 'absolute', path: scope.featureWorktree.canonicalPath }, deadlineMs: 1000, stdoutBytes: 1024, stderrBytes: 1024 }
const A_REQUEST = { schemaVersion: `${S}wave0a-mutation-request/v1`, attemptId: ATTEMPT, subject: SUBJECT, decisionAuthority: DECISION, predecessorState: 'LOCAL', currentEventSha256: HASH, topology: operationAttachment('publish-branch', 'precondition', 'topology', { ...A_TOPOLOGY, request: { ...A_TOPOLOGY_REQUEST, snapshotProfile: 'LOCAL_PRE_PUBLISH' } }), evidence: [], operationInstanceId: 'publish-branch', operationId: 'publish_branch', branch: A_BRANCH, headSha: H, baseSha: B }
const A_INTENT = { schemaVersion: `${S}wave0a-mutation-intent/v1`, attemptId: ATTEMPT, subject: SUBJECT, decisionAuthority: DECISION, predecessorState: 'LOCAL', currentEventSha256: HASH, requestEvidence: operationAttachment('publish-branch', 'request', 'request', A_REQUEST), mutationContractIdentity: repo('tools/main-consolidation/wave0a-mutations.json'), preconditionEvidence: [A_REQUEST.topology], executionPlan: { kind: 'single_command', command: A_COMMAND_PLAN }, executionPlanSha256: hash({ kind: 'single_command', command: A_COMMAND_PLAN }), repositoryExecutionIdentity: { repositoryRoot: scope.featureWorktree.canonicalPath, commonGitDirectory: directory(scope.commonGitDirectory.canonicalPath), objectDirectory: directory(scope.objectDirectory.canonicalPath), originUrl: 'https://github.com/katamor1/bob_builtin_analyze.git', effectiveConfigSha256: HASH, sanitizedGlobalConfig: file(A_ENVIRONMENT.GIT_CONFIG_GLOBAL), credentialHelper: executable('git-credential-manager'), ghConfigDirectory: directory(A_ENVIRONMENT.GH_CONFIG_DIR), gitRefTransactionCapabilitySha256: hash(externalTools.gitRefTransactionCapability), hooksDisabled: true }, pathArgumentIdentities: [], createdAt: AT, operationInstanceId: 'publish-branch', operationId: 'publish_branch' }
const A_CLAIM = { schemaVersion: `${S}wave0a-operation-claim/v1`, operationInstanceId: 'publish-branch', intentSha256: hash(A_INTENT), runPublicationReservationSha256: hash(reservation), claimOrdinal: 1, claimPath: claim().path, priorClaim: null, priorTerminationProof: null, coordinationFile: coordination.coordinationFile, coordinationLease: 'shared_supervisor', supervisorProcess: processIdentity, childProcess: { ...processIdentity, pid: 101 }, jobContract: 'kill_on_close_single_noninheritable_supervisor_handle', executionPlanSha256: A_INTENT.executionPlanSha256, deadlineAt: '2026-08-23T00:00:01.100Z', deadlineBoot: processIdentity.boot, deadlineUnbiased100ns: '10000000', processResultPath: `operations/${ATTEMPT}/publish-branch/process-result.json`, recordedAt: AT, kind: 'supervisor' }
const A_CLAIM_REF = operationAttachment('publish-branch', 'claim', 'claim', A_CLAIM)
const A_PROCESS_RESULT = { schemaVersion: `${S}wave0a-process-result/v1`, operationInstanceId: 'publish-branch', intentSha256: hash(A_INTENT), runPublicationReservationSha256: hash(reservation), claim: { ...claim(), sha256: hash(A_CLAIM) }, execution: { kind: 'single_command', command: A_COMMAND }, recordedAt: AT }
const A_FENCE = { coordinationFile: coordination.coordinationFile, lease: 'exclusive_owner_death_observation', byteOffset: 0, byteLength: 1, acquiredAt: AT }
const A_PROOF = { schemaVersion: `${S}wave0a-job-termination-proof/v1`, operationInstanceId: 'publish-branch', intentSha256: hash(A_INTENT), proofPublicationReservationSha256: HASH, claim: A_PROCESS_RESULT.claim, supervisorExit: { expectedProcess: A_CLAIM.supervisorProcess, state: 'signaled' }, childExit: { expectedProcess: A_CLAIM.childProcess, state: 'not_found' }, jobContract: A_CLAIM.jobContract, coordinationFence: A_FENCE, observation: 'exclusive_fence_supervisor_and_child_exited', observedAt: AT }
const A_PUBLISHED_TOPOLOGY = { ...clone(A_TOPOLOGY), request: { ...clone(A_TOPOLOGY_REQUEST), snapshotProfile: 'LOCAL_PUBLISHED' }, before: { ...clone(A_TOPOLOGY_OBSERVATION), remoteHeads: [{ ref: A_BRANCH, sha: H }, { ref: 'main', sha: B }] }, after: { ...clone(A_TOPOLOGY_OBSERVATION), remoteHeads: [{ ref: A_BRANCH, sha: H }, { ref: 'main', sha: B }] } }
const A_RECEIPT = { schemaVersion: `${S}wave0a-mutation-receipt/v1`, operationInstanceId: 'publish-branch', intentSha256: hash(A_INTENT), postconditionEvidence: [operationAttachment('publish-branch', 'postcondition', 'topology', A_PUBLISHED_TOPOLOGY)], recordedAt: AT, diagnostics: [], receiptMode: 'supervisor', execution: A_PROCESS_RESULT.execution, effectiveClaim: A_CLAIM_REF, reconciliation: 'applied', requiresManualDecision: false }
const A_INTENT_LOCATOR = { operationInstanceId: 'publish-branch', intentPath: `operations/${ATTEMPT}/publish-branch/intent.json`, intentSha256: hash(A_INTENT) }
const A_RECEIPT_LOCATOR = { status: 'receipted', ...A_INTENT_LOCATOR, receiptPath: `operations/${ATTEMPT}/publish-branch/receipt.json`, receiptSha256: hash(A_RECEIPT) }
const A_LOCAL_COMMAND = { ...A_COMMAND, ordinal: 1, executable: 'node', argv: ['--test', 'tools/main-consolidation/test/featureIntegrationCampaignPolicy.test.mjs'] }
const A_LOCAL_GATES = { schemaVersion: `${S}wave0a-local-gates/v1`, request: { repository: 'katamor1/bob_builtin_analyze', baseSha: B, headSha: H, treeOid: TREE, contractIdentity: repo('tools/main-consolidation/wave0a-local-gates.json') }, runtimeIdentities: [{ logicalName: 'node', identity: externalTools.nodeExecutable }, { logicalName: 'npm.cmd', identity: file('C:/wave0a/bin/npm.cmd') }, { logicalName: 'npm-cli.js', identity: file('C:/wave0a/bin/npm-cli.js'), npmVersion: '10.0.0' }], before: A_STATE, commands: [A_LOCAL_COMMAND], repositoryCheckpoints: [{ ordinal: 0, ...A_STATE, observedAt: AT }, { ordinal: 1, ...A_STATE, observedAt: AT }], testCounts: [{ commandId: A_LOCAL_COMMAND.id, total: 1, passed: 1, failed: 0, skipped: 0 }], artifacts: [{ repositoryPath: 'reports/test.json', byteSize: 3, sha256: digest(Buffer.from('{}\n')) }], protectedPathHashes: [{ repositoryPath: 'extensions/workflow-register/src/extension.ts', sha256: HASH }], changedPaths: [], changedPathsSha256: hash([]), after: A_STATE, status: 'success', diagnostics: [] }
const A_REMOVAL_PACKAGE = fixedFileIdentity(`${scope.featureWorktree.canonicalPath}/package.json`, Buffer.from('{}\n'), '149')
const A_REMOVAL_SRC = dir(`${scope.featureWorktree.canonicalPath}/src`)
const A_REMOVAL_RULE = fixedFileIdentity(`${scope.featureWorktree.canonicalPath}/src/rule.md`, Buffer.from('rule\n'), '150')
const A_REMOVAL_INDEX = fixedFileIdentity(`${scope.worktreeRegistryFence.featureAdminDirectory.canonicalPath}/index`, Buffer.from('index'), '151')
const removalFileEntry = (ordinal, deleteOrdinal, owner, relativePath, parentOrdinal, identity, extra = {}) => ({ ordinal, deleteOrdinal, owner, entryScope: 'descendant', parentOrdinal, relativePath, ...(parentOrdinal === 0 ? {} : { parentRelativePath: relativePath.slice(0, relativePath.lastIndexOf('/')) }), leaf: relativePath.split('/').at(-1), depth: relativePath.split('/').length, volumeSerial: identity.dev, fileId: identity.ino, attributes: '128', reparseTag: '0', kind: 'file', byteSize: Number(identity.size), sha256: identity.sha256, ...extra })
const removalRootEntry = (ordinal, deleteOrdinal, owner, root, leaf) => ({ ordinal, deleteOrdinal, owner, entryScope: 'owner_root', leaf, volumeSerial: root.dev, fileId: root.ino, attributes: root.attributes, reparseTag: '0', kind: 'directory', depth: 0, byteSize: 0, sha256: null })
const A_REMOVAL_ENTRIES = [
  removalRootEntry(1, 5, 'target', scope.featureWorktree, 'feature'),
  removalFileEntry(2, 2, 'target', '.git', 0, scope.worktreeRegistryFence.featureWorktreeGitFile),
  removalFileEntry(3, 3, 'target', 'package.json', 0, A_REMOVAL_PACKAGE),
  { ordinal: 4, deleteOrdinal: 4, owner: 'target', entryScope: 'descendant', parentOrdinal: 0, relativePath: 'src', leaf: 'src', depth: 1, volumeSerial: A_REMOVAL_SRC.dev, fileId: A_REMOVAL_SRC.ino, attributes: A_REMOVAL_SRC.attributes, reparseTag: '0', kind: 'directory', byteSize: 0, sha256: null },
  removalFileEntry(5, 1, 'target', 'src/rule.md', 4, A_REMOVAL_RULE),
  removalRootEntry(6, 9, 'admin', scope.worktreeRegistryFence.featureAdminDirectory, 'feature'),
  removalFileEntry(7, 6, 'admin', 'HEAD', 0, scope.worktreeRegistryFence.featureHeadFile),
  removalFileEntry(8, 7, 'admin', 'gitdir', 0, scope.worktreeRegistryFence.featureAdminGitdirBackpointer),
  removalFileEntry(9, 8, 'admin', 'index', 0, A_REMOVAL_INDEX)
]
const A_REMOVAL_TOTAL_FILE_BYTES = A_REMOVAL_ENTRIES.reduce((sum, entry) => sum + (entry.kind === 'file' ? BigInt(entry.byteSize) : 0n), 0n).toString()
const A_REMOVAL_PLAN = { schemaVersion: `${S}worktree-removal-plan/v1`, attemptId: ATTEMPT, operationInstanceId: 'remove-feature-worktree', featureWorktree: scope.featureWorktree, featureParent: dir('C:/wave0a'), featureRootLeaf: 'feature', gitFile: scope.worktreeRegistryFence.featureWorktreeGitFile, gitFileCanonicalBytesSha256: scope.worktreeRegistryFence.featureWorktreeGitFile.sha256, commonGitDirectory: scope.commonGitDirectory, adminDirectory: scope.worktreeRegistryFence.featureAdminDirectory, adminParent: scope.worktreeRegistryFence.worktreesDirectory, adminRootLeaf: 'feature', adminGitdirBackpointer: scope.worktreeRegistryFence.featureAdminGitdirBackpointer, adminGitdirBackpointerCanonicalBytesSha256: scope.worktreeRegistryFence.featureAdminGitdirBackpointer.sha256, branch: A_BRANCH, headSha: H, headTreeOid: TREE, trackedModificationCount: 0, untrackedCount: 0, ignoredCount: 0, entries: A_REMOVAL_ENTRIES, entryCount: 9, maxDepth: 2, totalFileBytes: A_REMOVAL_TOTAL_FILE_BYTES, tupleSha256: hash(A_REMOVAL_ENTRIES), observedAt: AT }
const A_REMOVAL_OBSERVATION = { schemaVersion: `${S}worktree-removal-observation/v1`, attemptId: ATTEMPT, operationInstanceId: 'remove-feature-worktree', planSha256: hash(A_REMOVAL_PLAN), beforeRootState: 'present_exact', beforeCompletedPrefixCount: 0, afterRootState: 'present_exact', missingEntryOrdinals: [], unexpectedTupleSha256: hash([]), worktrees: A_WORKTREES, worktreePruneDryRun: { lines: [], normalizedUtf8Sha256: EMPTY_SHA }, classification: 'not_applied', observedAt: AT, diagnostics: [] }
const A_DISPOSABLE = 'test-owner/bob-wave0a-acceptance-unit'
const A_REPOSITORY_ID = { hostingClass: 'github.com', repositoryDatabaseId: '12345', nodeId: 'R_test_owned', fullNameLowercase: A_DISPOSABLE }
const A_LIFECYCLE_PATH = 'C:/wave0a/lifecycle/acceptance.json'
const A_REPOSITORY_POLICY = repository => ({ repository, hostingClass: 'github.com', defaultBranch: 'main', normalizedIntegrationPolicySha256: HASH, atomicReceivePackAllowed: true, deleteRefsAllowed: true, observedAt: AT })
const A_TARGET = { repository: 'katamor1/bob_builtin_analyze', mainSha: B, remoteHeadTupleSha256: hash([{ ref: 'main', sha: B }]), openPullRequestTupleSha256: hash([]), policy: A_REPOSITORY_POLICY('katamor1/bob_builtin_analyze'), observedAt: AT }
const A_ACCEPTANCE_PR = { ...A_PR, repository: A_DISPOSABLE, headRepository: A_DISPOSABLE, headRef: 'codex-wave0a-acceptance' }
const A_LIFECYCLE_OPERATIONS = ['publish_acceptance_head_exact_absent_lease', 'create_same_repository_acceptance_pr', 'atomic_update_main_and_delete_acceptance_head']
const A_ACCEPTANCE = { schemaVersion: `${S}github-atomic-pr-lifecycle-acceptance/v1`, repositoryIdentity: A_REPOSITORY_ID, sourceRef: { repository: A_REPOSITORY_ID, ref: 'refs/heads/codex-wave0a-acceptance', expectedOldSha: H }, targetRef: { repository: A_REPOSITORY_ID, ref: 'refs/heads/main', expectedOldSha: B }, operationSet: A_LIFECYCLE_OPERATIONS, gitExecutable, ghExecutable: externalTools.ghExecutable, targetBefore: A_TARGET, targetAfter: A_TARGET, disposablePolicy: A_REPOSITORY_POLICY(A_DISPOSABLE), before: { mainSha: B, featureSha: H, pullRequest: { ...A_ACCEPTANCE_PR, state: 'OPEN' } }, mergeSha: M, mergeParents: [B, H], mergeTreeOid: TREE, commandPacket: { sha256: HASH, commands: [{ oldSha: B, newSha: M, ref: 'refs/heads/main' }, { oldSha: H, newSha: null, ref: 'refs/heads/codex-wave0a-acceptance' }] }, settlement: [{ liveMainSha: M, liveFeatureSha: null, pullRequest: { ...A_ACCEPTANCE_PR, state: 'MERGED', mergeCommitOid: M }, observedAt: AT }], after: { mainSha: M, featureRef: 'absent', pullRequest: { ...A_ACCEPTANCE_PR, state: 'MERGED', mergeCommitOid: M } }, mergeTopologyVerified: true, observedAt: AT, expiresAt: '2026-08-23T01:00:00.000Z' }
const A_LIFECYCLE_RISK_SCOPE = { purpose: 'Verify an atomic two-ref pull-request lifecycle in one disposable repository', repository: 'C:/wave0a', worktree: scope.featureWorktree.canonicalPath, branch: A_BRANCH, allowedActions: ['push_remote', 'create_or_update_pr', 'update_main', 'delete_branch', 'use_credentials', 'write_external_service'], allowedPaths: [], outputRoots: [], freshResources: { branches: [], worktrees: [], fixtureRoots: [], requireAbsent: false, requireIsolated: false }, allowedPublicEndpoints: [], effects: { repository: 'main_or_history', filesystem: 'none', network: 'external_write', credentials: 'use_secret', publication: 'none', cost: 'none', nonPublicData: 'none' }, exclusions: ['target repository mutation', 'unleased ref update', 'cross-repository pull request'], source: { kind: 'git_revision', canonicalId: H, displayFingerprint: H.slice(0, 12), verification: 'verified' }, targetSet: { kind: 'external_resources', canonicalIds: [`github.com/${A_DISPOSABLE}/refs/heads/main`, `github.com/${A_DISPOSABLE}/refs/heads/codex-wave0a-acceptance`], displayExpectedVersions: [B, H], targetCount: 2 }, impact: { operations: ['push_remote', 'create_or_update_pr', 'update_main', 'delete_branch', 'use_credentials', 'write_external_service'], primaryDiffSummary: 'Create a disposable PR, atomically update main, and delete its feature ref', primaryDiffFingerprint: HASH, affectedCount: 2, totalBytes: '0', byteCap: '0', irreversible: false }, rollback: { mode: 'compensating', summary: 'Delete the disposable repository after recording the lifecycle observation' } }
test('campaign attachment: lifecycle operation descriptor classifies as Tier C evidence only', () => {
  assert.equal(classifyRisk(A_LIFECYCLE_RISK_SCOPE), 'C')
})
const operationRecord = id => ({ status: 'receipted', operationInstanceId: id, intentPath: `operations/${ATTEMPT}/${id}/intent.json`, intentSha256: HASH, receiptPath: `operations/${ATTEMPT}/${id}/receipt.json`, receiptSha256: HASH })
const A_SETTLEMENT = { schemaVersion: `${S}main-integration-settlement/v1`, pullRequest: A_PR, mergePreparationMutation: operationRecord('prepare-merge-commit'), integrationMutation: operationRecord('integrate-main-exact-lease'), mergePreparation: operationAttachment('prepare-merge-commit', 'postcondition', 'merge-preparation', A_PREPARATION), integrationReconciliation: operationAttachment('integrate-main-exact-lease', 'postcondition', 'integration-reconciliation', A_RECONCILIATION), lifecycleAcceptance: attemptAttachment('github-pr-lifecycle-acceptance', A_ACCEPTANCE), observations: [{ pullRequest: prObserved('MERGED', M), liveMainSha: M, liveFeatureSha: null, observedAt: AT }], pollCount: 1, integratedMainSha: M, observedAt: AT, diagnostics: [], result: 'settled_merged', mergeCommitOid: M }
for (const [name, payload] of [
  ['wave0a-local-gates', A_LOCAL_GATES], ['worktree-removal-plan', A_REMOVAL_PLAN], ['worktree-removal-observation', A_REMOVAL_OBSERVATION],
  ['github-atomic-pr-lifecycle-acceptance', A_ACCEPTANCE], ['github-atomic-pr-lifecycle-validation', { schemaVersion: `${S}github-atomic-pr-lifecycle-validation/v1`, acceptance: file(A_LIFECYCLE_PATH, bytes(A_ACCEPTANCE)), currentTarget: A_TARGET, result: 'expired', reason: 'acceptance_expired', observedAt: '2026-08-23T02:00:00.000Z', diagnostics: [] }], ['main-integration-settlement', A_SETTLEMENT],
  ['wave0a-mutation-request', A_REQUEST], ['wave0a-mutation-intent', A_INTENT], ['wave0a-operation-claim', A_CLAIM], ['wave0a-process-result', A_PROCESS_RESULT], ['wave0a-job-termination-proof', A_PROOF], ['wave0a-mutation-receipt', A_RECEIPT],
  ['wave0a-operation-inspection', { schemaVersion: `${S}wave0a-operation-inspection/v1`, operationInstanceId: 'publish-branch', inspectedAt: AT, diagnostics: [], classification: 'receipted', intent: A_INTENT_LOCATOR, receipt: A_RECEIPT_LOCATOR, executionChainState: 'result_durable', claimChain: [A_CLAIM_REF], terminationProofChain: [], effectiveClaim: A_CLAIM_REF, processResult: operationAttachment('publish-branch', 'process_result', 'process-result', A_PROCESS_RESULT), terminationProof: null }],
  ['wave0a-supervised-operation-result', { schemaVersion: `${S}wave0a-supervised-operation-result/v1`, attemptId: ATTEMPT, intentSha256: hash(A_INTENT), reservationSha256: hash(reservation), observedAt: AT, program: 'ordinary', operationInstanceId: 'publish-branch', progress: [], outcome: 'settled_with_result', claim: A_PROCESS_RESULT.claim, processResult: file('C:/wave0a/result/process.json', bytes(A_PROCESS_RESULT)), termination: { outcome: 'success', exitCode: 0 } }],
  ['wave0a-historical-precheckpoint-validation', { schemaVersion: `${S}wave0a-historical-precheckpoint-validation/v1`, historicalBootstrapIdentity: file('C:/wave0a/historical.json'), sourceHandoff: file('C:/wave0a/handoff.json'), intentSha256: hash(A_INTENT), priorCampaignIndexHead: INDEX_HEAD, currentCampaignIndexHead: INDEX_HEAD, currentEvent: { sequence: 2, path: 'events/0002-local.json', sha256: HASH }, priorOperationPrefixSha256: hash([A_INTENT_LOCATOR]), currentOperationPrefixSha256: hash([A_INTENT_LOCATOR]), observedProgramStateSha256: HASH, validatedAt: AT, operationInstanceId: 'publish-branch', program: 'observe_only_no_spawn', priorOwnerState: 'result_durable', currentOwnerState: 'result_durable', allowedDelta: 'none' }]
]) A_ATTACHMENT_FIXTURES.set(name, payload)

// Independently rehashed actual manifest/patch/header literals. The successful
// verify/object flags below are test-owned command observations, not live proof.
const A_ARCHIVE = {"schemaVersion":"bob-builtin-analyze/feature-integration-archive-preflight/v1","repository":"katamor1/bob_builtin_analyze","programIndexBlobSha256":"2879a50f4c2690d73323497fe02f340ca92ec5481f98bb4bd536381b0c20ba48","observedAt":"2026-08-23T00:00:00.100Z","archives":[{"rootLeaf":"2026-08-21-main-consolidation","manifestSha256":"36e477ee9b752ebf7f07a208c166fec24e14a89bf7ba6a7921cf6bdf708c9f31","exactTreeVerified":true},{"rootLeaf":"2026-08-22-local-worktree-cleanup","manifestSha256":"ad742f4dbd2112c5674da2e3e0ee2046645849e4b3bf3674596df3b868c8bdff","exactTreeVerified":true},{"rootLeaf":"2026-08-22-remote-main-unification","manifestSha256":"bcdb61aad397ef4c6463eaa789d5d278b9d1bcad34015bc472c1dfc97773e476","exactTreeVerified":true}],"bundles":[{"archiveRootLeaf":"2026-08-21-main-consolidation","relativePath":"bundles/accepted-main-all-refs.bundle","sha256":"919c8e7ff8c6860bb27a467b6c8acc2577003e3c7e87e519a65600d1d2950a30","bundleVerify":"passed","headsSha256":"70b2cfc6ad0420214ed3f07de0827fbc8c8c58fcfdea320d857ee81e6911373c"},{"archiveRootLeaf":"2026-08-21-main-consolidation","relativePath":"bundles/integration-xlsx-on-prereq-all-refs.bundle","sha256":"22035ffd528db4e306867ae3a6aec988a04fcac30a73fe1e638ed8a1b27739cc","bundleVerify":"passed","headsSha256":"aa5d3e128d5e957a4164c62fc2c6088e25b5003b5bb25ec6891265baa1435d63"},{"archiveRootLeaf":"2026-08-21-main-consolidation","relativePath":"bundles/repository-all-refs.bundle","sha256":"55db2865e7795d9192e75bfb3dbaadc47d28366128c241edda512aef4ca599a1","bundleVerify":"passed","headsSha256":"87b833f81e7a35ee660eebf154078f1243b50681ec374178f2ee9211c5e0b59c"},{"archiveRootLeaf":"2026-08-22-local-worktree-cleanup","relativePath":"bundles/local-branches-before-cleanup.bundle","sha256":"e0e6fd92f1d7504c3271c01b0eae3542d3562a9214b8164957e19b56ac48dc40","bundleVerify":"passed","headsSha256":"232cbb56054784d26ff58a9c2202390f25ed27e244b82b5f4e1402c15be4fb0e"},{"archiveRootLeaf":"2026-08-22-remote-main-unification","relativePath":"bundles/remote-heads-before-main-unification.bundle","sha256":"06a338f28879218a8cbae247a3b4c5b951f152cd46caca4d81b7b07504cfbf1f","bundleVerify":"passed","headsSha256":"0f36e2d9aeb91e6e8e3eb83167e9f4a582ac7c29ab31f65dd9bfab10c60a3244"}],"carrierPatches":[{"id":"processing-a","sha256":"6913ddddcffb150eb207aee99bdbbad158b4ed05e9c3ca8714693d31f6122536"},{"id":"processing-b","sha256":"edd675378aa15650b5648308ae1f7621fa830844699ad4d06660463c9d2cb10b"},{"id":"processing-c","sha256":"294c11760ed94bdddec8f37f6f9517f42f7e9c6442ad23df6041ff9f470bbab5"},{"id":"workflow-b","sha256":"59eca51331f3c580a63435021e03c05780ffbe6b65db76949cb0d4bff8c428c7"},{"id":"workflow-c","sha256":"2852e9e0e535bbb63165ae01538dd271bd888afe0b7f7dcbca53d193ef24912f"}],"dualBundleObjects":[{"objectSha":"2d8a570fa1c0646fd662346744449b1abc1142b2","originalRepositoryBundle":true,"remoteRecoveryBundle":true},{"objectSha":"49f39e1a6ec35e5db98e9ef698d4ce43369c9760","originalRepositoryBundle":true,"remoteRecoveryBundle":true},{"objectSha":"4d0fb728763db9d13c87d000790a88c45900733e","originalRepositoryBundle":true,"remoteRecoveryBundle":true},{"objectSha":"56ba084d07f1641fa0454fe1da024f14fe99fd37","originalRepositoryBundle":true,"remoteRecoveryBundle":true},{"objectSha":"683e794eb4a39eea7bc3630bedbd2a557f4af8af","originalRepositoryBundle":true,"remoteRecoveryBundle":true},{"objectSha":"8793804f2f99fd1d545cb496064bcbdc7df4bf40","originalRepositoryBundle":true,"remoteRecoveryBundle":true},{"objectSha":"a18c09b10fa51702d312e34940a694ad971a48cc","originalRepositoryBundle":true,"remoteRecoveryBundle":true},{"objectSha":"e860d1ebbafe7068fc6871b16c9586a11b4fe19d","originalRepositoryBundle":true,"remoteRecoveryBundle":true}]}
A_ATTACHMENT_FIXTURES.set('feature-integration-archive-preflight', A_ARCHIVE)

const packObjectHeader = (type, byteSize) => { let n = byteSize; const out = [(type << 4) | (n & 15)]; n >>>= 4; while (n) { out[out.length - 1] |= 128; out.push(n & 127); n >>>= 7 } return Buffer.from(out) }
const packHeader = count => { const header = Buffer.alloc(12); header.write('PACK'); header.writeUInt32BE(2, 4); header.writeUInt32BE(count, 8); return header }
const packBaseObject = (type, data) => Buffer.concat([packObjectHeader(type, data.length), deflateSync(data)])
const deltaSize = value => { const out = []; do { let byte = value % 128; value = Math.floor(value / 128); if (value > 0) byte |= 128; out.push(byte) } while (value > 0); return Buffer.from(out) }
const copyWholeBaseDelta = (byteSize, appendByte) => {
  let command = 0x80
  const sizeBytes = []
  for (const [mask, shift] of [[0x10, 0], [0x20, 8], [0x40, 16]]) if (((byteSize >>> shift) & 0xff) !== 0) { command |= mask; sizeBytes.push((byteSize >>> shift) & 0xff) }
  const resultByteSize = byteSize + (appendByte === undefined ? 0 : 1)
  return Buffer.concat([deltaSize(byteSize), deltaSize(resultByteSize), Buffer.from([command, ...sizeBytes]), ...(appendByte === undefined ? [] : [Buffer.from([1, appendByte])])])
}
const offsetDeltaDistance = value => { const out = [value & 0x7f]; while ((value = Math.floor(value / 128)) > 0) { value--; out.unshift(0x80 | (value & 0x7f)) } return Buffer.from(out) }
const retainedBudgetPack = (rawCommit, blobByteSize, useOffsetDelta, finalExtraByte) => {
  const commitEntry = packBaseObject(1, rawCommit)
  const blob = Buffer.alloc(blobByteSize, 0x61)
  const blobEntry = packBaseObject(3, blob)
  const blobOffset = 12 + commitEntry.length
  let finalEntry
  if (useOffsetDelta) {
    const delta = copyWholeBaseDelta(blobByteSize, finalExtraByte)
    const deltaOffset = blobOffset + blobEntry.length
    finalEntry = Buffer.concat([packObjectHeader(6, delta.length), offsetDeltaDistance(deltaOffset - blobOffset), deflateSync(delta)])
  } else finalEntry = packBaseObject(3, finalExtraByte === undefined ? blob : Buffer.concat([blob, Buffer.from([finalExtraByte])]))
  return Buffer.concat([packHeader(3), commitEntry, blobEntry, finalEntry])
}
const bundleWithPack = pack => Buffer.concat([Buffer.from(`# v2 git bundle\n-${B} test-owned prerequisite\n${A_COMMIT_PLAN.expectedMergeSha} refs/heads/${A_BRANCH}\n\n`), pack, createHash('sha1').update(pack).digest()])
const packForCommit = rawCommit => Buffer.concat([Buffer.from('5041434b0000000200000001', 'hex'), packObjectHeader(1, rawCommit.length), deflateSync(rawCommit)])
const bundleForCommit = (baseSha, branch, rawCommit) => {
  const headSha = createHash('sha1').update(`commit ${rawCommit.length}\0`).update(rawCommit).digest('hex')
  const pack = packForCommit(rawCommit)
  return { headSha, bytes: Buffer.concat([Buffer.from(`# v2 git bundle\n-${baseSha} test-owned prerequisite\n${headSha} refs/heads/${branch}\n\n`), pack, createHash('sha1').update(pack).digest()]) }
}
const A_PACK_CONTENT = packForCommit(A_RAW_COMMIT)
const A_BUNDLE_BYTES = bundleForCommit(B, A_BRANCH, A_RAW_COMMIT).bytes
const A_PATCH_BYTES = Buffer.from('diff --git a/fixture.txt b/fixture.txt\nnew file mode 100644\nindex 0000000000000000000000000000000000000000..ce013625030ba8dba906f756967f9e9ca394464a\n--- /dev/null\n+++ b/fixture.txt\n@@ -0,0 +1 @@\n+hello\n')
const A_LOG_BYTES = Buffer.from(`baseSha=${B}\nheadSha=${A_COMMIT_PLAN.expectedMergeSha}\ntreeOid=${TREE}\nbundleVerifyExitCode=0\napplyCheckExitCode=0\n`)
const A_RAW_CANDIDATES = new Map([['git_bundle', A_BUNDLE_BYTES], ['git_binary_patch', A_PATCH_BYTES], ['diagnostic_log', A_LOG_BYTES]])
const A_RAW_REF = (kind, leaf, mediaType) => ({ kind, path: `attachments/0002-${leaf}`, mediaType, byteSize: A_RAW_CANDIDATES.get(kind).length, sha256: digest(A_RAW_CANDIDATES.get(kind)) })
const A_PRESERVATION = { schemaVersion: `${S}candidate-preservation-manifest/v1`, baseSha: B, headSha: A_COMMIT_PLAN.expectedMergeSha, treeOid: TREE, gitBundle: { ...A_RAW_REF('git_bundle', 'candidate.bundle', 'application/x-git-bundle'), verifiedHeadSha: A_COMMIT_PLAN.expectedMergeSha, bundleVerifyExitCode: 0 }, patch: { ...A_RAW_REF('git_binary_patch', 'candidate.patch', 'text/x-diff'), fromSha: B, toSha: A_COMMIT_PLAN.expectedMergeSha, applyCheckExitCode: 0 }, diagnosticLog: { ...A_RAW_REF('diagnostic_log', 'candidate-diagnostic.log', 'text/plain'), redactionPolicy: 'fixed_fields_and_hashes_only', lineCount: 5 }, createdAt: AT }
const A_FAILURE = { schemaVersion: `${S}feature-integration-failure/v1`, failureCode: 'authority_drift', messageDigestSha256: digest(Buffer.from('test-owned authority observation\n')), candidatePreservation: attemptAttachment('candidate-preservation', A_PRESERVATION, 2), observedAt: AT, diagnostics: [], commandObservation: 'absent' }
const A_CHECKPOINT = { schemaVersion: `${S}feature-integration-recovery-checkpoint/v1`, attemptId: ATTEMPT, currentEventSha256: HASH, operationProgress: [], latestTopology: attemptAttachment('topology', A_TOPOLOGY, 3), recordedAt: AT, expectedState: 'READY', resumeProfile: 'READY', checkpointProfile: 'normal', failureCode: 'authority_drift', attachments: { candidatePreservation: A_FAILURE.candidatePreservation, failure: attemptAttachment('failure', A_FAILURE, 4), diagnostics: [attemptAttachment('authority-observation', A_ATTACHMENT_FIXTURES.get('wave0a-capacity-observation'), 5)] } }
for (const [name, payload] of [['candidate-preservation-manifest', A_PRESERVATION], ['feature-integration-failure', A_FAILURE], ['feature-integration-recovery-checkpoint', A_CHECKPOINT]]) A_ATTACHMENT_FIXTURES.set(name, payload)

const A_SCHEMA_ROWS = [
  ['feature-integration-archive-preflight', '1C', 4194304], ['protected-clone-baseline', '5B', 16777216], ['slice-topology-evidence', '5B', 4194304], ['slice-topology-recovery-observation', '5B', 4194304], ['wave0a-local-gates', '6C', 16777216], ['wave0a-generated-paths', '6D', 4194304], ['wave0a-generated-deletion-plan', '6D', 134217728], ['wave0a-generated-cleanup', '6D', 4194304], ['wave0a-cleanup-progress', '6D', 4096], ['root-materialization-plan', '6G', 16777216], ['worktree-removal-plan', '6G', 16777216], ['worktree-removal-observation', '6G', 4194304], ['wave0a-dispatch-run-observation', '6G', 1048576], ['feature-integration-independent-review', '6F', 1048576], ['exact-head-run-set-snapshot', '4A', 1048576], ['exact-head-run-discovery', '4A', 4194304], ['exact-head-run-discovery-failure', '4A', 4194304], ['exact-head-ci-evidence', '4B', 4194304], ['pull-request-mergeability', '5B', 4194304], ['merge-commit-plan', '6F', 1048576], ['merge-commit-preparation', '6G', 1048576], ['main-integration-reconciliation', '5B', 4194304], ['main-integration-settlement', '5B', 4194304], ['github-atomic-pr-lifecycle-acceptance', 'github-lifecycle', 1048576], ['github-atomic-pr-lifecycle-validation', 'github-lifecycle', 1048576], ['wave0a-capacity-observation', '6A', 1048576], ['remote-branch-deletion', '6G', 1048576], ['feature-integration-failure', '6F', 1048576], ['feature-integration-recovery-checkpoint', '6F', 1048576], ['pull-request-observation', '5B', 1048576], ['remote-ref-observation', '5B', 1048576], ['partial-run-evidence', '4B', 1048576], ['candidate-preservation-manifest', '6F', 4194304], ['wave0a-mutation-request', '6G', 1048576], ['wave0a-mutation-intent', '6G', 1048576], ['wave0a-operation-claim', '6G', 1048576], ['wave0a-process-result', '6G', 1048576], ['wave0a-job-termination-proof', '6G', 1048576], ['wave0a-mutation-receipt', '6G', 1048576], ['wave0a-operation-inspection', '6B', 1048576], ['wave0a-supervised-operation-result', '6E', 1048576], ['wave0a-historical-precheckpoint-validation', 'historical-recovery', 1048576]
]
const attachmentOptions = name => ({ producer: A_SCHEMA_ROWS.find(row => row[0] === name)[1] })
const validateAttachment = (name, payload = A_ATTACHMENT_FIXTURES.get(name)) => policy.validateAttachmentPayload(payload, attachmentOptions(name))
test('campaign attachment: complete literal corpus has every one of the 42 closed producer schemas', () => {
  assert.equal(A_ATTACHMENT_FIXTURES.size, 42)
  assert.deepEqual([...A_ATTACHMENT_FIXTURES.keys()].sort(), A_SCHEMA_ROWS.map(row => row[0]).sort())
  assert.deepEqual(policy.getAttachmentSchemaRegistry().map(row => [row.schemaVersion.slice(S.length, -3), row.producer, row.byteCap]), A_SCHEMA_ROWS)
})
test('campaign attachment: fresh valid timestamps identities hashes and refs are not fixture allowlisted', () => {
  const protectedBaseline = clone(A_PROTECTED)
  protectedBaseline.capturedAt = '2026-08-24T01:02:03.004Z'
  assert.deepEqual(validateAttachment('protected-clone-baseline', protectedBaseline), protectedBaseline)

  const capacity = clone(A_ATTACHMENT_FIXTURES.get('wave0a-capacity-observation'))
  capacity.attemptId = 'wave-0a-20260824T010203Z-a1b2c3d4'
  capacity.currentEventSha256 = 'a'.repeat(64)
  capacity.requiredProjectionSha256 = 'b'.repeat(64)
  capacity.observedAt = '2026-08-24T01:02:03.004Z'
  assert.deepEqual(validateAttachment('wave0a-capacity-observation', capacity), capacity)

  const remoteRefs = clone(A_ATTACHMENT_FIXTURES.get('remote-ref-observation'))
  remoteRefs.refs[0].sha = 'a'.repeat(40)
  remoteRefs.observedAt = '2026-08-24T01:02:03.004Z'
  assert.deepEqual(validateAttachment('remote-ref-observation', remoteRefs), remoteRefs)

  const partialRuns = clone(A_ATTACHMENT_FIXTURES.get('partial-run-evidence'))
  for (const run of partialRuns.runs) { run.headSha = 'b'.repeat(40); run.headBranch = 'codex/fresh-candidate' }
  partialRuns.observedAt = '2026-08-24T01:02:03.004Z'
  assert.deepEqual(validateAttachment('partial-run-evidence', partialRuns), partialRuns)
})
for (const [name, payload] of A_ATTACHMENT_FIXTURES) test(`campaign attachment: ${name} accepts a fresh valid top-level observation time`, () => {
  const fresh = clone(payload)
  const field = ['capturedAt', 'observedAt', 'createdAt', 'recordedAt', 'reviewedAt', 'inspectedAt', 'validatedAt'].find(key => Object.hasOwn(fresh, key))
  if (field === undefined && name === 'wave0a-local-gates') fresh.repositoryCheckpoints.at(-1).observedAt = '2026-08-23T00:00:00.200Z'
  else if (field === undefined && name === 'wave0a-mutation-request') fresh.currentEventSha256 = 'c'.repeat(64)
  else {
    assert.notEqual(field, undefined)
    fresh[field] = '2026-08-23T00:00:00.200Z'
  }
  assert.deepEqual(validateAttachment(name, fresh), fresh)
})
for (const [name, producer, cap] of A_SCHEMA_ROWS) {
  test(`campaign attachment: ${name} literal content and canonical producer equality`, () => {
    const fixture = A_ATTACHMENT_FIXTURES.get(name)
    assert.deepEqual(policy.validateAttachmentPayload(fixture, { producer }), fixture)
    assert.deepEqual(policy.parseAttachmentBytes(bytes(fixture), { schemaVersion: fixture.schemaVersion, producer, byteSize: bytes(fixture).length, sha256: digest(bytes(fixture)) }), fixture)
    assert.deepEqual(policy.buildAttachmentFixture(fixture.schemaVersion), fixture)
  })
  test(`campaign attachment: ${name} recursively closed keys and null rejection`, () => {
    const fixture = A_ATTACHMENT_FIXTURES.get(name)
    assert.deepEqual(policy.validateAttachmentPayload(fixture, { producer }), fixture)
    for (const path of objectPaths(fixture)) {
      for (const mutation of ['unknown', ...Object.keys(atPath(fixture, path))]) {
        const bad = clone(fixture), target = atPath(bad, path)
        if (mutation === 'unknown') target.unrecognizedKey = true
        else delete target[mutation]
        assert.throws(() => policy.validateAttachmentPayload(bad, { producer }), TypeError, `${name}:${path.join('.')}:${mutation}`)
      }
    }
    assert.throws(() => policy.validateAttachmentPayload(null, { producer }), TypeError)
  })
  test(`campaign attachment: ${name} schema producer raw-size SHA and canonical-byte crossings`, () => {
    const fixture = A_ATTACHMENT_FIXTURES.get(name), content = bytes(fixture), metadata = { schemaVersion: fixture.schemaVersion, producer, byteSize: content.length, sha256: digest(content) }
    assert.deepEqual(policy.parseAttachmentBytes(content, metadata), fixture)
    for (const change of [{ schemaVersion: `${S}feature-integration-product-payload-manifest/v1` }, { producer: 'caller' }, { byteSize: content.length + 1 }, { sha256: HASH }]) assert.throws(() => policy.parseAttachmentBytes(content, { ...metadata, ...change }), TypeError)
    for (const bad of [Buffer.from(content.toString().replace(/\n$/u, '\r\n')), Buffer.from(' ' + content), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), content])]) assert.throws(() => policy.parseAttachmentBytes(bad, { ...metadata, byteSize: bad.length, sha256: digest(bad) }), TypeError)
    assert.throws(() => policy.validateAttachmentPayload({ ...fixture, schemaVersion: `${S}wave0a-mutation-summary/v1` }, { producer }), TypeError)
  })
  test(`campaign attachment: ${name} producer and campaign byte-cap boundary`, () => {
    for (const value of [cap - 1, cap]) assert.equal(policy.validateAttachmentByteSize(`${S}${name}/v1`, value), value)
    for (const value of [0, -1, cap + 1, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => policy.validateAttachmentByteSize(`${S}${name}/v1`, value), TypeError)
  })
}

const A_SEMANTIC_MUTATIONS = [
  ['protected-clone-baseline', 'fixed path', v => { v.canonicalPath += '-other' }], ['protected-clone-baseline', 'reparse metadata', v => { v.lstat.reparseTag = '1' }], ['protected-clone-baseline', 'file count exceeds entries', v => { v.tree.regularFileCount = 2 }],
  ['slice-topology-evidence', 'before after drift', v => { v.after.liveMainSha = M }], ['slice-topology-evidence', 'request main', v => { v.request.expectedLiveMainSha = M }], ['slice-topology-evidence', 'worktree digest', v => { v.before.worktreesSha256 = HASH }], ['slice-topology-evidence', 'status digest', v => { v.before.rootWorktreeStatus.normalizedUtf8Sha256 = HASH }], ['slice-topology-evidence', 'remote unexpected feature', v => { v.before.remoteHeads.push({ ref: A_BRANCH, sha: H }); v.after = clone(v.before) }],
  ['slice-topology-recovery-observation', 'success profile forbidden', v => { v.request.snapshotProfile = 'READY' }],
  ['wave0a-local-gates', 'head checkpoint', v => { v.repositoryCheckpoints[1].headSha = B }], ['wave0a-local-gates', 'tree after', v => { v.after.treeOid = H }], ['wave0a-local-gates', 'runtime name', v => { v.runtimeIdentities[0].identity.logicalName = 'git' }], ['wave0a-local-gates', 'test total', v => { v.testCounts[0].total++ }], ['wave0a-local-gates', 'test failure success', v => { v.testCounts[0].failed = 1; v.testCounts[0].passed = 0 }], ['wave0a-local-gates', 'changed paths hash', v => { v.changedPathsSha256 = HASH }],
  ['wave0a-generated-paths', 'absent bytes', v => { v.roots[0].totalBytes = '1' }], ['wave0a-generated-paths', 'duplicate root', v => { v.roots.push(clone(v.roots[0])) }], ['wave0a-generated-deletion-plan', 'entry count', v => { v.totalEntryCount = 1 }], ['wave0a-generated-deletion-plan', 'anchor count', v => { v.parentAnchorCount = 1 }], ['wave0a-generated-deletion-plan', 'entry digest', v => { v.entriesSha256 = HASH }], ['wave0a-generated-cleanup', 'state crossing', v => { v.after.headSha = B }], ['wave0a-generated-cleanup', 'final status', v => { v.finalStatusSha256 = HASH }],
  ['wave0a-cleanup-progress', 'chunk range', v => { v.firstDeleteOrdinal = 2 }], ['wave0a-cleanup-progress', 'foreign effective claim', v => { v.effectiveClaim = claim('publish-branch') }],
  ['root-materialization-plan', 'aggregate count', v => { v.actionCount = 1 }], ['root-materialization-plan', 'chunk count', v => { v.chunkCount = 2 }], ['root-materialization-plan', 'tuple digest', v => { v.actionsSha256 = HASH }], ['worktree-removal-plan', 'parent leaf crossing', v => { v.featureRootLeaf = 'other' }], ['worktree-removal-plan', 'entry count', v => { v.entryCount = 1 }], ['worktree-removal-observation', 'classification crossing', v => { v.classification = 'applied' }],
  ['wave0a-dispatch-run-observation', 'workflow mapping', v => { v.workflowId = 'workflow-contracts' }], ['wave0a-dispatch-run-observation', 'run workflow mapping', v => { v.run.workflowPath = '.github/workflows/workflow-contracts.yml' }], ['wave0a-dispatch-run-observation', 'dispatch title nonce', v => { v.run.dispatchNonce = RECOVERY }],
  ['feature-integration-independent-review', 'approved counts', v => { v.importantCount = 1 }], ['feature-integration-independent-review', 'review before CI', v => { v.reviewedAt = '2026-08-22T00:00:00.000Z' }],
  ['exact-head-run-set-snapshot', 'duplicate ids', v => { v.runIdsByWorkflow['extensions-quality'] = [1, 1] }], ['exact-head-run-set-snapshot', 'unordered ids', v => { v.runIdsByWorkflow['extensions-quality'] = [2, 1] }],
  ['exact-head-run-discovery', 'request head crossing', v => { v.selectedRuns['workflow-contracts'].headSha = B }], ['exact-head-run-discovery', 'trigger digest crossing', v => { v.request.triggerBoundarySha256 = HASH }], ['exact-head-run-discovery', 'run duplicate', v => { v.selectedRuns['workflow-contracts'].runId = 101 }], ['exact-head-run-discovery', 'causal timestamp', v => { v.selectedRuns['extensions-quality'].createdAt = '2026-08-22T00:00:00Z' }],
  ['exact-head-run-discovery-failure', 'trigger hash mismatch', v => { v.triggerBoundarySha256 = HASH }],
  ['exact-head-ci-evidence', 'three runs', v => { v.runs.pop() }], ['exact-head-ci-evidence', 'five runs', v => { v.runs.push(clone(v.runs[0])) }], ['exact-head-ci-evidence', 'reordered workflow', v => { v.runs.reverse() }], ['exact-head-ci-evidence', 'job duplicate', v => { v.jobs[1].jobId = v.jobs[0].jobId }], ['exact-head-ci-evidence', 'job wrong workflow', v => { v.jobs[0].runId = 102 }], ['exact-head-ci-evidence', 'job runner', v => { v.jobs[3].labels = ['ubuntu-latest'] }], ['exact-head-ci-evidence', 'job name', v => { v.jobs[3].name = 'unknown' }], ['exact-head-ci-evidence', 'job head', v => { v.jobs[0].headSha = B }], ['exact-head-ci-evidence', 'count consequence', v => { v.requiredJobCount = 11 }], ['exact-head-ci-evidence', 'run ref crossing', v => { v.runs[0].headBranch = 'other' }],
  ['pull-request-mergeability', 'PR identity', v => { v.observations[0].pullRequest.pullRequest.headRefOid = B }], ['pull-request-mergeability', 'unknown is not merged', v => { v.observations[0].mergeable = 'UNKNOWN' }], ['pull-request-mergeability', 'poll count', v => { v.pollCount = 2 }],
  ['merge-commit-plan', 'raw digest', v => { v.rawCommitSha256 = HASH }], ['merge-commit-plan', 'Git object hash', v => { v.expectedMergeSha = B }], ['merge-commit-plan', 'raw parent', v => { v.secondParentSha = B }], ['merge-commit-plan', 'raw byte size', v => { v.rawCommitByteSize++ }], ['merge-commit-plan', 'Base64 padding', v => { v.rawCommitBase64Url += '=' }], ['merge-commit-preparation', 'parent PR binding', v => { v.secondParentSha = B }], ['merge-commit-preparation', 'verified object hash', v => { v.verifiedObjectSha256 = HASH }],
  ['main-integration-reconciliation', 'feature still present', v => { v.observations[0].liveFeatureSha = H }], ['main-integration-reconciliation', 'integrated main crossing', v => { v.classification.integratedMainSha = B }], ['main-integration-reconciliation', 'command ref branch', v => { v.commandRefs[1] = 'other' }], ['main-integration-settlement', 'merge oid mismatch', v => { v.mergeCommitOid = B }], ['main-integration-settlement', 'main mismatch', v => { v.observations[0].liveMainSha = B }], ['main-integration-settlement', 'wrong owning mutation', v => { v.mergePreparationMutation.operationInstanceId = 'publish-branch' }],
  ['github-atomic-pr-lifecycle-acceptance', 'disposable identity', v => { v.repositoryIdentity.fullNameLowercase = 'other-owner/bob-wave0a-acceptance-unit' }], ['github-atomic-pr-lifecycle-acceptance', 'target mutated', v => { v.targetAfter.mainSha = M }], ['github-atomic-pr-lifecycle-acceptance', 'delete packet', v => { v.commandPacket.commands[1].newSha = H }], ['github-atomic-pr-lifecycle-acceptance', 'merge parents', v => { v.mergeParents.reverse() }], ['github-atomic-pr-lifecycle-acceptance', 'expired at observation', v => { v.expiresAt = v.observedAt }], ['github-atomic-pr-lifecycle-validation', 'expiry result reason', v => { v.reason = 'target_policy_drift' }],
  ['wave0a-capacity-observation', 'can proceed counters', v => { v.limitingCounters = ['attempt_members'] }], ['remote-branch-deletion', 'branch remains', v => { v.after.unshift({ ref: A_BRANCH, sha: H }) }], ['remote-branch-deletion', 'main drift classification', v => { v.observedMainAfter = M; v.after[0].sha = M }],
  ['feature-integration-failure', 'wrong preservation schema', v => { v.candidatePreservation.schemaVersion = `${S}wave0a-local-gates/v1` }], ['feature-integration-recovery-checkpoint', 'diagnostic label', v => { v.attachments.diagnostics[0].label = 'source-observation' }], ['feature-integration-recovery-checkpoint', 'missing diagnostic', v => { v.attachments.diagnostics = [] }], ['feature-integration-recovery-checkpoint', 'mutation normal arm', v => { v.failureCode = 'mutation_reconciliation_required' }],
  ['pull-request-observation', 'merged shape', v => { v.pullRequest.state = 'MERGED' }], ['remote-ref-observation', 'duplicate refs', v => { v.refs.push(clone(v.refs[0])) }], ['partial-run-evidence', 'duplicate workflow', v => { v.runs.push(clone(v.runs[0])) }], ['partial-run-evidence', 'wrong job workflow', v => { v.jobs[0].workflowPath = '.github/workflows/workflow-contracts.yml' }],
  ['candidate-preservation-manifest', 'bundle head', v => { v.gitBundle.verifiedHeadSha = B }], ['candidate-preservation-manifest', 'patch from', v => { v.patch.fromSha = H }], ['candidate-preservation-manifest', 'raw locator crossing', v => { v.patch.path = v.gitBundle.path }], ['candidate-preservation-manifest', 'binary media crossing', v => { v.gitBundle.mediaType = 'text/plain' }],
  ['wave0a-mutation-request', 'operation discriminator', v => { v.operationId = 'create_pull_request' }], ['wave0a-mutation-request', 'topology producer', v => { v.topology.schemaVersion = `${S}remote-ref-observation/v1` }], ['wave0a-mutation-request', 'foreign attempt', v => { v.topology.attemptId = 'wave-0a-20260824T000000Z-4f8a1c2d' }], ['wave0a-mutation-intent', 'execution digest', v => { v.executionPlanSha256 = HASH }], ['wave0a-mutation-intent', 'argv digest', v => { v.executionPlan.command.argvSha256 = HASH }], ['wave0a-mutation-intent', 'environment digest', v => { v.executionPlan.command.environmentSha256 = HASH }], ['wave0a-mutation-intent', 'request foreign operation', v => { v.requestEvidence.operationInstanceId = 'create-pull-request' }], ['wave0a-mutation-intent', 'precondition label leaf', v => { v.preconditionEvidence[0].label = 'other' }],
  ['wave0a-operation-claim', 'claim ordinal', v => { v.claimOrdinal = 2 }], ['wave0a-operation-claim', 'same child supervisor', v => { v.childProcess = clone(v.supervisorProcess) }], ['wave0a-operation-claim', 'deadline boot crossing', v => { v.deadlineBoot.bootIdentifier = '99999999-2222-3333-4444-555555555555' }], ['wave0a-process-result', 'claim owner', v => { v.claim = claim('create-pull-request') }], ['wave0a-job-termination-proof', 'PID reused same creation', v => { v.childExit.state = 'pid_reused'; v.childExit.observedCreationFileTime100ns = v.childExit.expectedProcess.creationFileTime100ns }],
  ['wave0a-mutation-receipt', 'manual decision consequence', v => { v.requiresManualDecision = true }], ['wave0a-mutation-receipt', 'effective claim kind', v => { v.effectiveClaim.recordKind = 'receipt' }], ['wave0a-mutation-receipt', 'foreign postcondition', v => { v.postconditionEvidence[0].operationInstanceId = 'create-pull-request' }], ['wave0a-operation-inspection', 'effective claim not terminal', v => { v.effectiveClaim.sha256 = HASH }], ['wave0a-operation-inspection', 'empty durable chain', v => { v.claimChain = [] }], ['wave0a-supervised-operation-result', 'program operation', v => { v.program = 'root_fast_forward' }], ['wave0a-supervised-operation-result', 'unsettled termination', v => { v.termination = { outcome: 'timeout', treeTermination: 'termination_failed' } }], ['wave0a-historical-precheckpoint-validation', 'program operation', v => { v.program = 'generated_cleanup' }], ['wave0a-historical-precheckpoint-validation', 'unapproved owner delta', v => { v.currentOwnerState = 'terminated_without_result' }]
]
for (const [name, reason, change] of A_SEMANTIC_MUTATIONS) test(`campaign attachment: ${name} rejects ${reason}`, () => { const good = A_ATTACHMENT_FIXTURES.get(name); assert.deepEqual(validateAttachment(name), good); const bad = clone(good); change(bad); assert.throws(() => validateAttachment(name, bad), TypeError) })

function refreshMaterialization(plan) {
  plan.actionCount = plan.actions.length
  plan.maxDepth = Math.max(0, ...plan.actions.map(action => action.depth))
  plan.totalPathBytes = plan.actions.reduce((sum, action) => sum + Buffer.byteLength(action.repositoryPath) + (Object.hasOwn(action, 'parentRelativePath') ? Buffer.byteLength(action.parentRelativePath) : 0), 0)
  const fileSizes = plan.actions.flatMap(action => Object.hasOwn(action, 'sourceByteSize') ? [action.sourceByteSize] : Object.hasOwn(action, 'targetByteSize') ? [action.targetByteSize] : [])
  plan.maxFileBytes = Math.max(0, ...fileSizes)
  plan.totalBlobBytes = fileSizes.reduce((sum, size) => sum + BigInt(size), 0n).toString()
  plan.chunkCount = Math.ceil(plan.actions.length / 1024)
  plan.actionsSha256 = hash(plan.actions)
  return plan
}
function refreshRemoval(plan) {
  plan.entryCount = plan.entries.length
  plan.maxDepth = Math.max(...plan.entries.map(entry => entry.depth))
  plan.totalFileBytes = plan.entries.reduce((sum, entry) => sum + (entry.kind === 'file' ? BigInt(entry.byteSize) : 0n), 0n).toString()
  plan.tupleSha256 = hash(plan.entries)
  return plan
}
test('campaign attachment: root-contract materialization root parent union', () => {
  assert.deepEqual(validateAttachment('root-materialization-plan', A_MATERIALIZATION), A_MATERIALIZATION)
  assert.deepEqual(A_MATERIALIZATION.actions.map(action => action.kind), ['retain_directory', 'delete_regular_file', 'delete_empty_directory', 'create_directory', 'install_regular_file', 'delete_regular_file', 'install_regular_file'])
  for (const action of A_MATERIALIZATION.actions) {
    if (action.parentActionOrdinal === 0) { assert.equal(Object.hasOwn(action, 'parentRelativePath'), false); assert.equal(action.rootAnchor, 'root_worktree') }
    else { assert.equal(Object.hasOwn(action, 'rootAnchor'), false); assert.equal(typeof action.parentRelativePath, 'string') }
  }
  for (const change of [
    plan => { plan.actions[0].parentRelativePath = 'root' },
    plan => { plan.actions[1].rootAnchor = 'root_worktree' },
    plan => { plan.actions[0].parentActionOrdinal = 1; plan.actions[0].parentRelativePath = 'keep'; delete plan.actions[0].rootAnchor },
    plan => { plan.actions[4].parentActionOrdinal = 2; plan.actions[4].parentRelativePath = 'obsolete/old.txt'; plan.actions[4].repositoryPath = 'obsolete/old.txt/new.txt' },
    plan => { plan.actions[4].parentActionOrdinal = 99 },
    plan => { [plan.actions[3], plan.actions[4]] = [plan.actions[4], plan.actions[3]] },
    plan => { plan.actions[0].expectedTarget.canonicalPath += '-crossed' },
    plan => { plan.actions[0].expectedTarget.reparseTag = '1' }
  ]) { const bad = clone(A_MATERIALIZATION); change(bad); refreshMaterialization(bad); assert.throws(() => validateAttachment('root-materialization-plan', bad), TypeError) }
})
test('campaign attachment: root-contract accepts exact empty materialization plan', () => {
  assert.deepEqual(validateAttachment('root-materialization-plan', A_EMPTY_MATERIALIZATION), A_EMPTY_MATERIALIZATION)
  for (const change of [plan => { plan.actionCount = 1 }, plan => { plan.maxDepth = 1 }, plan => { plan.actionsSha256 = HASH }, plan => { plan.unrecognized = true }]) { const bad = clone(A_EMPTY_MATERIALIZATION); change(bad); assert.throws(() => validateAttachment('root-materialization-plan', bad), TypeError) }
})
test('campaign attachment: delete empty directory uses stable identity and exact empty literal', () => {
  const action = A_MATERIALIZATION.actions.find(row => row.kind === 'delete_empty_directory')
  assert.deepEqual(Object.keys(action.expectedTarget).sort(), ['attributes', 'canonicalPath', 'dev', 'ino', 'reparseTag'])
  assert.equal(action.expectedEmptyAtDeleteOrdinal, true)
  for (const change of [row => { row.expectedTarget.mtimeNs = '1' }, row => { delete row.expectedEmptyAtDeleteOrdinal }, row => { row.expectedEmptyAtDeleteOrdinal = false }, row => { row.expectedEmptyAtDeleteOrdinal = null }, row => { row.expectedEmptyAtDeleteOrdinal = 'true' }]) {
    const bad = clone(A_MATERIALIZATION), selected = bad.actions.find(row => row.kind === 'delete_empty_directory'); change(selected); refreshMaterialization(bad); assert.throws(() => validateAttachment('root-materialization-plan', bad), TypeError)
  }
})
test('campaign attachment: root materialization independently derives every aggregate', () => {
  for (const change of [plan => { plan.totalPathBytes++ }, plan => { plan.maxFileBytes++ }, plan => { plan.totalBlobBytes = '23' }, plan => { plan.maxDepth++ }, plan => { plan.actionCount++ }, plan => { plan.chunkCount++ }, plan => { plan.actionsSha256 = HASH }]) {
    const bad = clone(A_MATERIALIZATION); change(bad); assert.throws(() => validateAttachment('root-materialization-plan', bad), TypeError)
  }
})
test('campaign attachment: root materialization rejects Git metadata paths and registry identity aliases', () => {
  const metadata = clone(A_EMPTY_MATERIALIZATION)
  metadata.actions = [{ actionOrdinal: 1, chunkOrdinal: 1, repositoryPath: '.git', leaf: '.git', depth: 1, parentActionOrdinal: 0, rootAnchor: 'root_worktree', kind: 'create_directory', targetTreeOid: H, expectedAbsent: true }]
  refreshMaterialization(metadata)
  assert.throws(() => validateAttachment('root-materialization-plan', metadata), TypeError)
  const alias = clone(A_MATERIALIZATION)
  alias.actions[0].expectedTarget.dev = alias.worktreeRegistryFence.featureAdminDirectory.dev
  alias.actions[0].expectedTarget.ino = alias.worktreeRegistryFence.featureAdminDirectory.ino
  refreshMaterialization(alias)
  assert.throws(() => validateAttachment('root-materialization-plan', alias), TypeError)
})
test('campaign attachment: root-contract removal root and descendant graph', () => {
  assert.deepEqual(validateAttachment('worktree-removal-plan', A_REMOVAL_PLAN), A_REMOVAL_PLAN)
  assert.deepEqual(A_REMOVAL_PLAN.entries.map(entry => entry.deleteOrdinal), [5, 2, 3, 4, 1, 9, 6, 7, 8])
  assert.deepEqual(A_REMOVAL_PLAN.entries.filter(entry => entry.entryScope === 'owner_root').map(entry => entry.owner), ['target', 'admin'])
  for (const change of [
    plan => { plan.entries[0].parentOrdinal = 0 },
    plan => { plan.entries[4].owner = 'admin' },
    plan => { plan.entries[4].parentOrdinal = 5 },
    plan => { plan.entries[4].parentOrdinal = 2; plan.entries[4].parentRelativePath = '.git'; plan.entries[4].relativePath = '.git/rule.md' },
    plan => { plan.entries[4].fileId = plan.entries[2].fileId; plan.entries[4].volumeSerial = plan.entries[2].volumeSerial },
    plan => { plan.entries[1].reparseTag = '1' },
    plan => { plan.entries[4].deleteOrdinal = 2; plan.entries[1].deleteOrdinal = 1 },
    plan => { plan.adminParent.ino = plan.featureParent.ino; plan.adminParent.dev = plan.featureParent.dev },
    plan => { plan.entries.splice(5, 1) }
  ]) { const bad = clone(A_REMOVAL_PLAN); change(bad); refreshRemoval(bad); assert.throws(() => validateAttachment('worktree-removal-plan', bad), TypeError) }
})
test('campaign attachment: worktree removal descendants cannot alias outer directory identities', () => {
  const bad = clone(A_REMOVAL_PLAN)
  bad.entries[2].volumeSerial = bad.featureParent.dev
  bad.entries[2].fileId = bad.featureParent.ino
  refreshRemoval(bad)
  assert.throws(() => validateAttachment('worktree-removal-plan', bad), TypeError)
})
function removalByteBoundary(first, second = 0) {
  const plan = clone(A_REMOVAL_PLAN)
  for (const entry of plan.entries) if (entry.kind === 'file') entry.byteSize = 0
  plan.gitFile.size = '0'; plan.adminGitdirBackpointer.size = '0'
  plan.entries[2].byteSize = first; plan.entries[4].byteSize = second
  return refreshRemoval(plan)
}
test('campaign attachment: worktree removal total file bytes inclusive boundary', () => {
  for (const size of [4294967295, 4294967296]) assert.deepEqual(validateAttachment('worktree-removal-plan', removalByteBoundary(size)), removalByteBoundary(size))
  assert.throws(() => validateAttachment('worktree-removal-plan', removalByteBoundary(4294967297)), TypeError)
  assert.deepEqual(validateAttachment('worktree-removal-plan', removalByteBoundary(4294967295, 1)), removalByteBoundary(4294967295, 1))
  assert.throws(() => validateAttachment('worktree-removal-plan', removalByteBoundary(4294967296, 1)), TypeError)
})
test('campaign attachment: worktree removal rejects noncanonical total file bytes', () => {
  for (const totalFileBytes of ['00', '+0', '-0', '', ' 0', '0 ', '0e0']) { const bad = removalByteBoundary(0); bad.totalFileBytes = totalFileBytes; assert.throws(() => validateAttachment('worktree-removal-plan', bad), TypeError) }
  const mismatch = removalByteBoundary(1); mismatch.totalFileBytes = '0'; assert.throws(() => validateAttachment('worktree-removal-plan', mismatch), TypeError)
})

function materializationCountBoundary(actionCount) {
  const plan = clone(A_EMPTY_MATERIALIZATION)
  plan.actions = Array.from({ length: actionCount }, (_, index) => { const leaf = `d${String(index).padStart(5, '0')}`; return { actionOrdinal: index + 1, chunkOrdinal: Math.floor(index / 1024) + 1, repositoryPath: leaf, leaf, depth: 1, parentActionOrdinal: 0, rootAnchor: 'root_worktree', kind: 'create_directory', targetTreeOid: H, expectedAbsent: true } })
  return refreshMaterialization(plan)
}
test('campaign attachment: root materialization action count inclusive boundary', () => {
  for (const count of [16383, 16384]) assert.equal(validateAttachment('root-materialization-plan', materializationCountBoundary(count)).actionCount, count)
  assert.throws(() => validateAttachment('root-materialization-plan', materializationCountBoundary(16385)), TypeError)
})

function rootFileBoundary(sizes) {
  const plan = clone(A_EMPTY_MATERIALIZATION)
  plan.actions = sizes.map((size, index) => { const leaf = `f${String(index).padStart(4, '0')}`; return { actionOrdinal: index + 1, chunkOrdinal: 1, repositoryPath: leaf, leaf, depth: 1, parentActionOrdinal: 0, rootAnchor: 'root_worktree', kind: 'install_regular_file', targetObjectOid: H, targetGitMode: '100644', targetByteSize: size, targetBlobSha256: HASH, expectedAbsent: true, scratchLeaf: `${String(index + 1).padStart(4, '0')}-${leaf}` } })
  return refreshMaterialization(plan)
}
test('campaign attachment: root file and total blob byte caps are inclusive', () => {
  for (const size of [1073741823, 1073741824]) assert.equal(validateAttachment('root-materialization-plan', rootFileBoundary([size])).maxFileBytes, size)
  assert.throws(() => validateAttachment('root-materialization-plan', rootFileBoundary([1073741825])), TypeError)
  assert.equal(validateAttachment('root-materialization-plan', rootFileBoundary(Array(16).fill(1073741824))).totalBlobBytes, '17179869184')
  assert.throws(() => validateAttachment('root-materialization-plan', rootFileBoundary([...Array(16).fill(1073741824), 1])), TypeError)
})
function rootDepthBoundary(depth) {
  const plan = clone(A_EMPTY_MATERIALIZATION), actions = []
  let repositoryPath = ''
  for (let index = 0; index < depth; index++) {
    const leaf = `d${index}`; repositoryPath = repositoryPath === '' ? leaf : `${repositoryPath}/${leaf}`
    actions.push({ actionOrdinal: index + 1, chunkOrdinal: 1, repositoryPath, ...(index === 0 ? { parentActionOrdinal: 0, rootAnchor: 'root_worktree' } : { parentActionOrdinal: index, parentRelativePath: actions.at(-1).repositoryPath }), leaf, depth: index + 1, kind: 'create_directory', targetTreeOid: H, expectedAbsent: true })
  }
  plan.actions = actions
  return refreshMaterialization(plan)
}
test('campaign attachment: root materialization depth cap is inclusive', () => {
  for (const depth of [255, 256]) assert.equal(validateAttachment('root-materialization-plan', rootDepthBoundary(depth)).maxDepth, depth)
  assert.throws(() => validateAttachment('root-materialization-plan', rootDepthBoundary(257)), TypeError)
})

function removalCountBoundary(entryCount) {
  const plan = clone(A_REMOVAL_PLAN), fillerCount = entryCount - 9
  const targetRoot = clone(plan.entries[0]), target = plan.entries.slice(1, 5).map(clone), adminRoot = clone(plan.entries[5]), admin = plan.entries.slice(6).map(clone)
  const fillers = Array.from({ length: fillerCount }, (_, index) => ({ ordinal: 0, deleteOrdinal: 0, owner: 'target', entryScope: 'descendant', parentOrdinal: 0, relativePath: `z${String(index).padStart(5, '0')}`, leaf: `z${String(index).padStart(5, '0')}`, depth: 1, volumeSerial: '9', fileId: String(index + 1000), attributes: '128', reparseTag: '0', kind: 'file', byteSize: 0, sha256: HASH }))
  plan.entries = [targetRoot, ...target, ...fillers, adminRoot, ...admin]
  plan.entries.forEach((entry, index) => { entry.ordinal = index + 1 })
  plan.entries.find(entry => entry.owner === 'target' && entry.relativePath === 'src/rule.md').parentOrdinal = plan.entries.find(entry => entry.owner === 'target' && entry.relativePath === 'src').ordinal
  const targetDescendants = plan.entries.filter(entry => entry.owner === 'target' && entry.entryScope === 'descendant').sort((left, right) => right.depth - left.depth || Buffer.compare(Buffer.from(left.relativePath), Buffer.from(right.relativePath)))
  const adminDescendants = plan.entries.filter(entry => entry.owner === 'admin' && entry.entryScope === 'descendant').sort((left, right) => right.depth - left.depth || Buffer.compare(Buffer.from(left.relativePath), Buffer.from(right.relativePath)))
  ;[...targetDescendants, targetRoot, ...adminDescendants, adminRoot].forEach((entry, index) => { entry.deleteOrdinal = index + 1 })
  return refreshRemoval(plan)
}
test('campaign attachment: worktree removal entry count inclusive boundary', () => {
  for (const count of [16383, 16384]) assert.equal(validateAttachment('worktree-removal-plan', removalCountBoundary(count)).entryCount, count)
  assert.throws(() => validateAttachment('worktree-removal-plan', removalCountBoundary(16385)), TypeError)
})
function removalDepthBoundary(depth) {
  const plan = clone(A_REMOVAL_PLAN), targetRoot = clone(plan.entries[0]), adminRoot = clone(plan.entries[5])
  const targetGit = clone(plan.entries[1]), adminGitdir = clone(plan.entries[7]), chain = []
  let relativePath = ''
  for (let index = 0; index < depth; index++) {
    const leaf = `d${index}`; relativePath = relativePath === '' ? leaf : `${relativePath}/${leaf}`
    chain.push({ ordinal: 0, deleteOrdinal: 0, owner: 'target', entryScope: 'descendant', parentOrdinal: index === 0 ? 0 : 0, relativePath, ...(index === 0 ? {} : { parentRelativePath: chain.at(-1).relativePath }), leaf, depth: index + 1, volumeSerial: '9', fileId: String(10000 + index), attributes: '16', reparseTag: '0', kind: 'directory', byteSize: 0, sha256: null })
  }
  plan.entries = [targetRoot, targetGit, ...chain, adminRoot, adminGitdir]
  plan.entries.forEach((entry, index) => { entry.ordinal = index + 1 })
  chain.forEach((entry, index) => { if (index > 0) entry.parentOrdinal = chain[index - 1].ordinal })
  const targetDescendants = [targetGit, ...chain].sort((left, right) => right.depth - left.depth || Buffer.compare(Buffer.from(left.relativePath), Buffer.from(right.relativePath)))
  ;[...targetDescendants, targetRoot, adminGitdir, adminRoot].forEach((entry, index) => { entry.deleteOrdinal = index + 1 })
  return refreshRemoval(plan)
}
test('campaign attachment: worktree removal depth cap is inclusive', () => {
  for (const depth of [255, 256]) assert.equal(validateAttachment('worktree-removal-plan', removalDepthBoundary(depth)).maxDepth, depth)
  assert.throws(() => validateAttachment('worktree-removal-plan', removalDepthBoundary(257)), TypeError)
})

for (const event of ['pull_request', 'workflow_dispatch']) test(`campaign attachment: run discovery and exact CI ${event} complete positive controls`, () => {
  const discovery = A_DISCOVERY(event), ci = A_CI(event)
  assert.deepEqual(validateAttachment('exact-head-run-discovery', discovery), discovery)
  assert.deepEqual(validateAttachment('exact-head-ci-evidence', ci), ci)
  if (event === 'workflow_dispatch') {
    for (const change of [v => { v.dispatchNonceByWorkflow['workflow-contracts'] = RECOVERY }, v => { v.selectedRuns['workflow-contracts'].displayTitle += '-other' }, v => { delete v.selectedRuns['extensions-quality'].dispatchNonce }]) { const bad = clone(discovery); change(bad); assert.throws(() => validateAttachment('exact-head-run-discovery', bad), TypeError) }
    const bad = clone(ci); bad.jobs[7] = { ...bad.jobs[7], conclusion: 'success', verificationStep: { name: 'Verify exact checked-out commit', conclusion: 'success' } }; assert.throws(() => validateAttachment('exact-head-ci-evidence', bad), TypeError)
  }
})

for (const [kind, content] of A_RAW_CANDIDATES) test(`campaign attachment: raw ${kind} format hash size and identity`, () => {
  const ref = kind === 'git_bundle' ? A_PRESERVATION.gitBundle : kind === 'git_binary_patch' ? A_PRESERVATION.patch : A_PRESERVATION.diagnosticLog
  assert.deepEqual(policy.validateRawCandidatePayload(content, ref, A_PRESERVATION), ref)
  for (const badRef of [{ ...ref, sha256: HASH }, { ...ref, byteSize: ref.byteSize + 1 }, { ...ref, path: '../escape' }]) assert.throws(() => policy.validateRawCandidatePayload(content, badRef, A_PRESERVATION), TypeError)
  for (const bad of [Buffer.from('{}\n'), content.subarray(0, content.length - 1), Buffer.concat([content, Buffer.from('unexpected')])]) assert.throws(() => policy.validateRawCandidatePayload(bad, { ...ref, byteSize: bad.length, sha256: digest(bad) }, A_PRESERVATION), TypeError)
  for (const n of [16777215, 16777216]) assert.equal(policy.validateRawCandidateByteSize(kind, n), n)
  assert.throws(() => policy.validateRawCandidateByteSize(kind, 16777217), TypeError)
})
test('campaign attachment: raw candidate diagnostic secrets and binary patch traversal reject', () => {
  assert.deepEqual(policy.validateRawCandidatePayload(A_LOG_BYTES, A_PRESERVATION.diagnosticLog, A_PRESERVATION), A_PRESERVATION.diagnosticLog)
  for (const value of ['token=ghp_secret\n', `headSha=${H}\n`, 'message=arbitrary free text\n']) { const raw = Buffer.from(value); assert.throws(() => policy.validateRawCandidatePayload(raw, { ...A_PRESERVATION.diagnosticLog, byteSize: raw.length, sha256: digest(raw) }, A_PRESERVATION), TypeError) }
  const bad = Buffer.from(A_PATCH_BYTES.toString().replaceAll('b/fixture.txt', 'b/../escape')); assert.throws(() => policy.validateRawCandidatePayload(bad, { ...A_PRESERVATION.patch, byteSize: bad.length, sha256: digest(bad) }, A_PRESERVATION), TypeError)
})
const validatePatchFixture = raw => {
  const manifest = clone(A_PRESERVATION)
  manifest.patch = { ...manifest.patch, byteSize: raw.length, sha256: digest(raw) }
  return policy.validateRawCandidatePayload(raw, manifest.patch, manifest)
}
test('campaign attachment: raw patch accepts closed rename and copy path pairs', () => {
  const rename = Buffer.from('diff --git a/old-name.txt b/new-name.txt\nsimilarity index 100%\nrename from old-name.txt\nrename to new-name.txt\n')
  const copy = Buffer.from('diff --git a/source.txt b/copied.txt\nsimilarity index 100%\ncopy from source.txt\ncopy to copied.txt\n')
  const binary = Buffer.from('diff --git a/image.bin b/image.bin\nGIT binary patch\nliteral 1\nIc${MZ000310RR91\n\n')
  assert.equal(validatePatchFixture(rename).kind, 'git_binary_patch')
  assert.equal(validatePatchFixture(copy).kind, 'git_binary_patch')
  assert.equal(validatePatchFixture(binary).kind, 'git_binary_patch')
})
test('campaign attachment: raw patch rejects marker-only and truncated binary sections', () => {
  const markerOnly = Buffer.from('diff --git a/image.bin b/image.bin\nGIT binary patch\n')
  const truncatedBlock = Buffer.from('diff --git a/image.bin b/image.bin\nGIT binary patch\nliteral 3\n')
  const truncatedSecondBlock = Buffer.from('diff --git a/image.bin b/image.bin\nGIT binary patch\nliteral 1\nIc${MZ000310RR91\n\nliteral 1\n\n')
  const invalidCompressedData = Buffer.from('diff --git a/image.bin b/image.bin\nGIT binary patch\nliteral 1\nA00000\n\n')
  const wrongLiteralSize = Buffer.from('diff --git a/image.bin b/image.bin\nGIT binary patch\nliteral 2\nIc${MZ000310RR91\n\n')
  assert.throws(() => validatePatchFixture(markerOnly), TypeError)
  assert.throws(() => validatePatchFixture(truncatedBlock), TypeError)
  assert.throws(() => validatePatchFixture(truncatedSecondBlock), TypeError)
  assert.throws(() => validatePatchFixture(invalidCompressedData), TypeError)
  assert.throws(() => validatePatchFixture(wrongLiteralSize), TypeError)
})
test('campaign attachment: raw manifest and reference coordinated tampering fails closed', () => {
  for (const change of [
    ref => { ref.unrecognized = true },
    ref => { ref.mediaType = 'application/octet-stream' },
    ref => { ref.path = 'attachments/9999-other.log' }
  ]) {
    const manifest = clone(A_PRESERVATION), ref = manifest.diagnosticLog
    change(ref)
    assert.throws(() => policy.validateRawCandidatePayload(A_LOG_BYTES, ref, manifest), TypeError)
  }
})
test('campaign attachment: fresh valid bundle patch and diagnostic bytes are semantic not corpus members', () => {
  const baseSha = '4'.repeat(40), treeOid = '6'.repeat(40)
  const rawCommit = Buffer.from(`tree ${treeOid}\nparent ${baseSha}\nauthor Fresh Evidence <fresh@example.test> 1787529600 +0000\ncommitter Fresh Evidence <fresh@example.test> 1787529600 +0000\n\nFresh runtime candidate\n`)
  const { headSha, bytes: bundle } = bundleForCommit(baseSha, A_BRANCH, rawCommit)
  const patch = Buffer.from('diff --git a/fresh.txt b/fresh.txt\nnew file mode 100644\nindex 0000000000000000000000000000000000000000..ce013625030ba8dba906f756967f9e9ca394464a\n--- /dev/null\n+++ b/fresh.txt\n@@ -0,0 +1 @@\n+fresh\n')
  const diagnosticLog = Buffer.from(`baseSha=${baseSha}\nheadSha=${headSha}\ntreeOid=${treeOid}\nbundleVerifyExitCode=0\napplyCheckExitCode=0\n`)
  const bind = (reference, raw) => ({ ...reference, byteSize: raw.length, sha256: digest(raw) })
  const manifest = {
    ...clone(A_PRESERVATION), baseSha, headSha, treeOid, createdAt: '2026-08-24T01:02:03.004Z',
    gitBundle: { ...bind(A_PRESERVATION.gitBundle, bundle), verifiedHeadSha: headSha },
    patch: { ...bind(A_PRESERVATION.patch, patch), fromSha: baseSha, toSha: headSha },
    diagnosticLog: bind(A_PRESERVATION.diagnosticLog, diagnosticLog)
  }
  assert.deepEqual(validateAttachment('candidate-preservation-manifest', manifest), manifest)
  for (const [kind, raw, ref] of [['git_bundle', bundle, manifest.gitBundle], ['git_binary_patch', patch, manifest.patch], ['diagnostic_log', diagnosticLog, manifest.diagnosticLog]]) assert.deepEqual(policy.validateRawCandidatePayload(raw, ref, manifest), ref, kind)
})
test('campaign attachment: raw bundle parses declared pack objects and binds commit tree and parent', () => {
  const manifestFor = (baseSha, treeOid, rawCommit, bundle) => {
    const headSha = createHash('sha1').update(`commit ${rawCommit.length}\0`).update(rawCommit).digest('hex')
    const manifest = clone(A_PRESERVATION)
    manifest.baseSha = baseSha; manifest.headSha = headSha; manifest.treeOid = treeOid
    manifest.gitBundle = { ...manifest.gitBundle, byteSize: bundle.length, sha256: digest(bundle), verifiedHeadSha: headSha }
    manifest.patch.toSha = headSha
    return manifest
  }
  const corruptPack = Buffer.from(A_PACK_CONTENT)
  corruptPack.writeUInt32BE(2, 8)
  const countMismatch = Buffer.concat([A_BUNDLE_BYTES.subarray(0, A_BUNDLE_BYTES.indexOf(Buffer.from('\n\n')) + 2), corruptPack, createHash('sha1').update(corruptPack).digest()])
  const countManifest = clone(A_PRESERVATION)
  countManifest.gitBundle = { ...countManifest.gitBundle, byteSize: countMismatch.length, sha256: digest(countMismatch) }
  assert.throws(() => policy.validateRawCandidatePayload(countMismatch, countManifest.gitBundle, countManifest), TypeError)

  for (const [treeOid, parentSha] of [['7'.repeat(40), B], [TREE, '8'.repeat(40)]]) {
    const rawCommit = Buffer.from(`tree ${treeOid}\nparent ${parentSha}\nauthor Fresh Evidence <fresh@example.test> 1787529600 +0000\ncommitter Fresh Evidence <fresh@example.test> 1787529600 +0000\n\nCrossed runtime candidate\n`)
    const built = bundleForCommit(B, A_BRANCH, rawCommit)
    const manifest = manifestFor(B, TREE, rawCommit, built.bytes)
    assert.throws(() => policy.validateRawCandidatePayload(built.bytes, manifest.gitBundle, manifest), TypeError)
  }
})
test('campaign attachment: raw pack aggregate retained bytes cap includes resolved deltas once', () => {
  assert.equal(A_RAW_COMMIT.length, 338)
  const retainedBaseCap = 8388439
  const manifestFor = bundle => {
    const manifest = clone(A_PRESERVATION)
    manifest.gitBundle = { ...manifest.gitBundle, byteSize: bundle.length, sha256: digest(bundle) }
    return manifest
  }
  const baseOverflow = bundleWithPack(retainedBudgetPack(A_RAW_COMMIT, retainedBaseCap, false, 0x62))
  assert.throws(() => policy.validateRawCandidatePayload(baseOverflow, manifestFor(baseOverflow).gitBundle, manifestFor(baseOverflow)), TypeError)
  const exactDelta = bundleWithPack(retainedBudgetPack(A_RAW_COMMIT, retainedBaseCap, true))
  assert.deepEqual(policy.validateRawCandidatePayload(exactDelta, manifestFor(exactDelta).gitBundle, manifestFor(exactDelta)), manifestFor(exactDelta).gitBundle)
  const deltaOverflow = bundleWithPack(retainedBudgetPack(A_RAW_COMMIT, retainedBaseCap, true, 0x62))
  assert.throws(() => policy.validateRawCandidatePayload(deltaOverflow, manifestFor(deltaOverflow).gitBundle, manifestFor(deltaOverflow)), TypeError)
})

test('campaign attachment: mergeability result is a closed exact union', () => {
  const drift = clone(A_MERGEABILITY); drift.result = 'identity_drift'; drift.driftReason = 'pr_head'
  assert.deepEqual(validateAttachment('pull-request-mergeability', drift), drift)
  const unknown = clone(A_MERGEABILITY); unknown.result = 'caller_selected'
  assert.throws(() => validateAttachment('pull-request-mergeability', unknown), TypeError)
  const extra = clone(A_MERGEABILITY); extra.driftReason = 'pr_head'
  assert.throws(() => validateAttachment('pull-request-mergeability', extra), TypeError)
  const missing = clone(drift); delete missing.driftReason
  assert.throws(() => validateAttachment('pull-request-mergeability', missing), TypeError)
})

const checkpointDiagnostic = label => ({ ...clone(A_CHECKPOINT.attachments.diagnostics[0]), label, path: `attachments/0005-${label}.json` })
const checkpointEvidence = (label, schemaVersion, ordinal) => ({ owner: 'attempt', attemptId: ATTEMPT, label, path: `attachments/${String(ordinal).padStart(4, '0')}-${label}.json`, schemaVersion, byteSize: 1, sha256: HASH })
test('campaign attachment: recovery checkpoint closes cleanup progress and reconciliation origins', () => {
  const locator = { owner: 'operation', journal: 'main_only_cleanup', operationInstanceId: 'cleanup-generated-paths', path: `operations/${ATTEMPT}/cleanup-generated-paths/cleanup-progress/0001.json`, byteSize: 1, sha256: HASH }
  const partial = clone(A_CHECKPOINT)
  Object.assign(partial, { checkpointProfile: 'partial_cleanup', failureCode: 'generated_cleanup_failed', cleanupJournalProgress: { authoritySha256: HASH, deletionPlanSha256: HASH, journal: 'main_only_cleanup', completedPrefixCount: 1, rollingPrefixSha256: HASH, lastProgressLocator: locator } })
  partial.attachments.diagnostics = [checkpointDiagnostic('cleanup-progress-inspection')]
  assert.deepEqual(validateAttachment('feature-integration-recovery-checkpoint', partial), partial)
  for (const change of [v => { delete v.cleanupJournalProgress.authoritySha256 }, v => { v.cleanupJournalProgress.extra = true }, v => { delete v.cleanupJournalProgress.lastProgressLocator.owner }, v => { v.cleanupJournalProgress.lastProgressLocator.extra = true }, v => { v.cleanupJournalProgress.lastProgressLocator.schemaVersion = `${S}root-fast-forward-progress/v1` }]) {
    const bad = clone(partial); change(bad); assert.throws(() => validateAttachment('feature-integration-recovery-checkpoint', bad), TypeError)
  }

  const controllerOrigin = { kind: 'controller_preclaim_spawn_failure', operationInstanceId: 'publish-branch', intentSha256: HASH, failedSupervisorLaunch: checkpointEvidence('failed-supervisor-launch', `${S}wave0a-supervised-operation-result/v1`, 6), authorizedAction: 'observe_only_no_spawn' }
  const mutation = clone(A_CHECKPOINT)
  Object.assign(mutation, { checkpointProfile: 'mutation_reconciliation', failureCode: 'mutation_reconciliation_required', reconciliationOrigin: controllerOrigin })
  mutation.attachments.diagnostics = [checkpointDiagnostic('operation-inspection')]
  assert.deepEqual(validateAttachment('feature-integration-recovery-checkpoint', mutation), mutation)
  for (const change of [v => { delete v.reconciliationOrigin.authorizedAction }, v => { v.reconciliationOrigin.extra = true }, v => { v.reconciliationOrigin.failedSupervisorLaunch.schemaVersion = `${S}wave0a-local-gates/v1` }]) {
    const bad = clone(mutation); change(bad); assert.throws(() => validateAttachment('feature-integration-recovery-checkpoint', bad), TypeError)
  }

  const historical = clone(mutation)
  historical.reconciliationOrigin = { kind: 'historical_precheckpoint', historicalBootstrapSha256: HASH, sourceHandoffSha256: HASH, intentSha256: HASH, historicalValidation: checkpointEvidence('historical-validation', `${S}wave0a-historical-precheckpoint-validation/v1`, 7), window: 'operation_precheckpoint', operationClass: 'observe_only', operationInstanceId: 'publish-branch', program: 'observe_only_no_spawn', ownerState: 'unclaimed', authorizedAction: 'observe_only_no_spawn' }
  assert.deepEqual(validateAttachment('feature-integration-recovery-checkpoint', historical), historical)
  for (const change of [v => { delete v.reconciliationOrigin.window }, v => { v.reconciliationOrigin.extra = true }, v => { v.reconciliationOrigin.program = 'generated_cleanup' }]) {
    const bad = clone(historical); change(bad); assert.throws(() => validateAttachment('feature-integration-recovery-checkpoint', bad), TypeError)
  }
})

test('campaign attachment: cleanup checkpoint prefix count is capped and equals locator ordinal', () => {
  const checkpointAt = (completedPrefixCount, locatorOrdinal) => {
    const value = clone(A_CHECKPOINT)
    const locator = { owner: 'operation', journal: 'main_only_cleanup', operationInstanceId: 'cleanup-generated-paths', path: `operations/${ATTEMPT}/cleanup-generated-paths/cleanup-progress/${String(locatorOrdinal).padStart(4, '0')}.json`, byteSize: 1, sha256: HASH }
    Object.assign(value, { checkpointProfile: 'partial_cleanup', failureCode: 'generated_cleanup_failed', cleanupJournalProgress: { authoritySha256: HASH, deletionPlanSha256: HASH, journal: 'main_only_cleanup', completedPrefixCount, rollingPrefixSha256: HASH, lastProgressLocator: locator } })
    value.attachments.diagnostics = [checkpointDiagnostic('cleanup-progress-inspection')]
    return value
  }
  const inclusiveCap = checkpointAt(98, 98)
  assert.deepEqual(validateAttachment('feature-integration-recovery-checkpoint', inclusiveCap), inclusiveCap)
  for (const [completedPrefixCount, locatorOrdinal] of [[99, 1], [2, 1], [1, 2]]) {
    assert.throws(() => validateAttachment('feature-integration-recovery-checkpoint', checkpointAt(completedPrefixCount, locatorOrdinal)), TypeError)
  }
})

test('campaign attachment: supervised progress locators close every program arm', () => {
  const base = A_ATTACHMENT_FIXTURES.get('wave0a-supervised-operation-result')
  const cases = [
    ['generated_cleanup', 'cleanup-generated-paths', { owner: 'operation', journal: 'main_only_cleanup', operationInstanceId: 'cleanup-generated-paths', path: `operations/${ATTEMPT}/cleanup-generated-paths/cleanup-progress/0001.json`, byteSize: 1, sha256: HASH }],
    ['root_fast_forward', 'fast-forward-root', { path: `operations/${ATTEMPT}/fast-forward-root/program-progress/0001.json`, schemaVersion: `${S}root-fast-forward-progress/v1`, byteSize: 1, sha256: HASH }],
    ['worktree_removal', 'remove-feature-worktree', { path: `operations/${ATTEMPT}/remove-feature-worktree/worktree-progress/0001.json`, schemaVersion: `${S}worktree-removal-progress/v1`, byteSize: 1, sha256: HASH }]
  ]
  for (const [program, operationInstanceId, locator] of cases) {
    const value = clone(base); Object.assign(value, { program, operationInstanceId, progress: [locator], claim: claim(operationInstanceId) })
    assert.deepEqual(validateAttachment('wave0a-supervised-operation-result', value), value, program)
    for (const change of [v => { delete v.progress[0].sha256 }, v => { v.progress[0].extra = true }, v => { v.progress[0].path = v.progress[0].path.replace('0001.json', '0002.json') }]) {
      const bad = clone(value); change(bad); assert.throws(() => validateAttachment('wave0a-supervised-operation-result', bad), TypeError, program)
    }
  }
  const ordinary = clone(base); ordinary.progress = [{}]
  assert.throws(() => validateAttachment('wave0a-supervised-operation-result', ordinary), TypeError)
})
test('campaign attachment: full archive fixture preserves actual bytes membership and all endpoint observations', () => {
  const fixture = policy.buildFullArchivePreflightFixture()
  assert.deepEqual(fixture.attachment, A_ARCHIVE)
  assert.deepEqual(policy.validateFullArchivePreflightFixture(fixture), fixture.attachment)
  assert.equal(fixture.sourceFiles.length, 17)
  assert.equal(fixture.bundleObservations.length, 5)
  assert.equal(fixture.requiredObjects.length, 8)
  assert.equal(digest(fixture.programIndexBytes), '2879a50f4c2690d73323497fe02f340ca92ec5481f98bb4bd536381b0c20ba48')
  for (const source of fixture.sourceFiles) { assert.equal(source.bytes.length, source.byteSize); assert.equal(digest(source.bytes), source.sha256) }
  for (const observation of fixture.bundleObservations) { assert.equal(observation.origin, 'test_owned_command_observation'); assert.equal(digest(observation.listHeadsBytes), observation.listHeadsSha256); assert.equal(observation.objectChecks.every(row => row.origin === 'test_owned_command_observation'), true) }
  for (const change of [v => { v.sourceFiles[0].bytes[0] ^= 1 }, v => { v.sourceFiles.pop() }, v => { v.bundleObservations.pop() }, v => { v.bundleObservations[0].verifyExitCode = 1 }, v => { v.bundleObservations[0].listHeadsBytes[0] ^= 1 }, v => { v.bundleObservations[2].objectChecks.pop() }, v => { v.requiredObjects.push(v.requiredObjects[0]) }, v => { v.attachment.carrierPatches.pop() }, v => { v.programIndexBytes[0] ^= 1 }]) { const bad = structuredClone(fixture); change(bad); assert.throws(() => policy.validateFullArchivePreflightFixture(bad), TypeError) }
})

const A_TOPOLOGY_ROWS = [
  ['READY', 'B/B/B', false, 'absent', 2, true, 'none'], ['LOCAL_PRE_PUBLISH', 'B/B/B', false, 'absent', 2, true, 'none'], ['LOCAL_PUBLISHED', 'B/B/B', true, 'absent', 2, true, 'none'], ['PR_ACTIVE', 'B/B/B', true, 'OPEN', 2, true, 'none'],
  ['PREMERGE_PR_CLOSED', 'B/B/B', true, 'CLOSED', 2, true, 'after'], ['PREMERGE_READY_RESTORED', 'B/B/B', false, 'absent', 2, true, 'after'], ['PREMERGE_BRANCH_DELETED_MAIN_DRIFT', 'K/B/B', false, 'absent', 2, true, 'after'], ['PREMERGE_GENERATED_PATHS_CLEANED', 'B/B/B', false, 'absent', 2, true, 'clean'],
  ['MERGE_COMMIT_PREPARED', 'B/B/B', true, 'OPEN', 2, true, 'none'], ['MAIN_INTEGRATED_PR_PENDING', 'M/B/B', false, 'OPEN', 2, true, 'none'], ['POST_MERGE_PR_SETTLEMENT_CLOSED', 'M/B/B', false, 'CLOSED', 2, true, 'none'], ['POST_MERGE_PR_SETTLEMENT_TIMEOUT', 'M/B/B', false, 'OPEN', 2, true, 'none'], ['POST_INTEGRATION_MAIN_DRIFT', 'K/B/B', false, 'MERGED', 2, true, 'none'], ['MERGED_PRE_FETCH', 'M/B/B', false, 'MERGED', 2, true, 'none'],
  ['MERGED', 'M/M/B', false, 'MERGED', 2, true, 'none'], ['POST_MERGE_VERIFIED', 'M/M/B', false, 'MERGED', 2, true, 'none'], ['POST_MERGE_CI_AMBIGUOUS', 'M/M/B', false, 'MERGED', 2, true, 'none'], ['POST_MERGE_CI_FAILED', 'M/M/B', false, 'MERGED', 2, true, 'none'], ['POST_MERGE_DISPATCH_FAILED', 'M/M/B', false, 'MERGED', 2, true, 'none'], ['POST_MERGE_RUN_DISCOVERY_FAILED', 'M/M/B', false, 'MERGED', 2, true, 'none'],
  ['POST_MERGE_FAILURE_GENERATED_PATHS_CLEANED', 'M/M/B', false, 'MERGED', 2, true, 'clean'], ['POST_MERGE_FAILURE_ROOT_FAST_FORWARDED', 'M/M/M', false, 'MERGED', 2, true, 'clean'], ['POST_MERGE_FAILURE_FEATURE_WORKTREE_REMOVED', 'M/M/M', false, 'MERGED', 1, true, 'clean'], ['POST_MERGE_FAILURE_LOCAL_MAIN_ONLY', 'M/M/M', false, 'MERGED', 1, false, 'clean'],
  ['MAIN_ONLY', 'M/M/B', false, 'MERGED', 2, true, 'after'], ['GENERATED_PATHS_CLEANED', 'M/M/B', false, 'MERGED', 2, true, 'clean'], ['ROOT_FAST_FORWARDED', 'M/M/M', false, 'MERGED', 2, true, 'clean'], ['FEATURE_WORKTREE_REMOVED', 'M/M/M', false, 'MERGED', 1, true, 'clean'], ['VERIFIED', 'M/M/M', false, 'MERGED', 1, false, 'clean']
]
function topologyFixture(row) {
  const [profile, roles, remoteFeature, prState, worktreeCount, localFeature, generated] = row
  const [live, origin, root] = roles.split('/').map(role => ({ B, M, K: '7'.repeat(40) })[role])
  const request = clone(A_TOPOLOGY_REQUEST)
  Object.assign(request, { snapshotProfile: profile, expectedLiveMainSha: live, expectedOriginMainSha: origin, expectedRootMainSha: root })
  if (prState !== 'absent') request.pullRequestNumber = A_PR.number
  if (!['READY', 'LOCAL_PRE_PUBLISH', 'LOCAL_PUBLISHED', 'PR_ACTIVE'].includes(profile) && !profile.startsWith('PREMERGE_')) Object.assign(request, { expectedBaseSha: B, expectedMergeSha: M, mergePreparation: externalAttachment('preparation', A_PREPARATION) })
  if (roles.includes('K')) request.expectedDriftedLiveMainSha = live
  if (profile.startsWith('POST_MERGE_PR_SETTLEMENT_') || profile === 'POST_INTEGRATION_MAIN_DRIFT') request.integrationReconciliation = externalAttachment('reconciliation', A_RECONCILIATION)
  if (profile.startsWith('POST_MERGE_PR_SETTLEMENT_')) request.integrationSettlement = externalAttachment('settlement', A_SETTLEMENT)
  if (generated !== 'none') request.generatedAfter = externalAttachment('generated-after', { ...A_GENERATED, phase: 'after' })
  if (generated === 'clean') request.generatedCleanup = externalAttachment('cleanup', A_CLEANUP)
  if (worktreeCount === 1) delete request.activeWorktreePath
  if (!localFeature) { delete request.activeBranch; delete request.expectedFeatureHeadSha }
  const observation = clone(A_TOPOLOGY_OBSERVATION)
  Object.assign(observation, { liveMainSha: live, originMainSha: origin, rootMainSha: root, remoteHeads: [...(remoteFeature ? [{ ref: A_BRANCH, sha: H }] : []), { ref: 'main', sha: live }], localHeads: [...(localFeature ? [{ ref: A_BRANCH, sha: H }] : []), { ref: 'main', sha: root }], worktrees: [...(worktreeCount === 2 ? [A_WORKTREES[0]] : []), { ...A_WORKTREES[1], headSha: root }], activeWorktreeStatus: worktreeCount === 2 ? { lines: [], normalizedUtf8Sha256: EMPTY_SHA } : null, namedPullRequest: prState === 'absent' ? { observation: 'absent', pullRequest: null } : { observation: 'present', pullRequest: prObserved(prState, live) } })
  observation.openPullRequests = prState === 'OPEN' ? [observation.namedPullRequest.pullRequest] : []
  observation.worktreesSha256 = hash(observation.worktrees)
  return { ...A_TOPOLOGY, request, before: clone(observation), after: clone(observation) }
}
for (const row of A_TOPOLOGY_ROWS) test(`campaign attachment: topology profile ${row[0]} closed fields and stable role sets`, () => {
  const good = topologyFixture(row)
  assert.deepEqual(validateAttachment('slice-topology-evidence', good), good)
  for (const change of [v => { v.request.expectedRootMainSha = H }, v => { v.after.liveMainSha = H }, v => { v.after.worktrees = [] }, v => { v.after.openPullRequests.push(prObserved()) }, v => { v.request.unrecognizedField = true }]) { const bad = clone(good); change(bad); assert.throws(() => validateAttachment('slice-topology-evidence', bad), TypeError) }
})
for (const index of [0, 1, 2, 3]) for (const outcome of ['observed', 'not_observed', 'ambiguous']) test(`campaign attachment: dispatch ${WF[index]} ${outcome} correlated outcome`, () => {
  const base = clone(A_ATTACHMENT_FIXTURES.get('wave0a-dispatch-run-observation')); delete base.run
  Object.assign(base, { operationInstanceId: `dispatch-${WF[index]}`, workflowId: WF[index], result: outcome })
  if (outcome === 'observed') base.run = A_RUN(index, 'workflow_dispatch')
  else { base.reason = outcome === 'not_observed' ? 'no_causal_candidate' : 'multiple_causal_candidates'; base.candidates = outcome === 'not_observed' ? [] : [A_RUN(index, 'workflow_dispatch'), { ...A_RUN(index, 'workflow_dispatch'), runId: 999 }] }
  assert.deepEqual(validateAttachment('wave0a-dispatch-run-observation', base), base)
  const bad = clone(base); bad.workflowId = WF[(index + 1) % 4]; assert.throws(() => validateAttachment('wave0a-dispatch-run-observation', bad), TypeError)
})
for (const [criticalCount, importantCount] of [[1, 0], [0, 1]]) test(`campaign attachment: review changes requested ${criticalCount}/${importantCount}`, () => {
  const good = { ...A_REVIEW, result: 'changes_requested', criticalCount, importantCount }; assert.deepEqual(validateAttachment('feature-integration-independent-review', good), good)
  assert.throws(() => validateAttachment('feature-integration-independent-review', { ...good, criticalCount: 0, importantCount: 0 }), TypeError)
})
for (const state of ['absent', 'OPEN', 'CLOSED', 'MERGED']) test(`campaign attachment: named PR ${state} exact state union`, () => {
  const good = { schemaVersion: `${S}pull-request-observation/v1`, observedAt: AT, ...(state === 'absent' ? { observation: 'absent', pullRequest: null } : { observation: 'present', pullRequest: prObserved(state, state === 'MERGED' ? M : B) }) }
  assert.deepEqual(validateAttachment('pull-request-observation', good), good)
  if (state === 'absent') assert.throws(() => validateAttachment('pull-request-observation', { ...good, pullRequest: prObserved() }), TypeError)
  else { const bad = clone(good); bad.pullRequest.observedBaseRefOid = H; assert.throws(() => validateAttachment('pull-request-observation', bad), TypeError) }
})
for (const size of [99999, 100000, 100001]) test(`campaign attachment: protected tree entry bound ${size}`, () => { const good = clone(A_PROTECTED); good.tree.entryCount = size; if (size <= 100000) assert.deepEqual(validateAttachment('protected-clone-baseline', good), good); else { assert.deepEqual(validateAttachment('protected-clone-baseline'), A_PROTECTED); assert.throws(() => validateAttachment('protected-clone-baseline', good), TypeError) } })
for (const size of ['17179869183', '17179869184', '17179869185']) test(`campaign attachment: protected tree aggregate bound ${size}`, () => { const good = clone(A_PROTECTED); good.tree.entryCount = 100; good.tree.regularFileCount = 100; good.tree.totalRegularFileBytes = size; if (BigInt(size) <= 17179869184n) assert.deepEqual(validateAttachment('protected-clone-baseline', good), good); else { assert.deepEqual(validateAttachment('protected-clone-baseline'), A_PROTECTED); assert.throws(() => validateAttachment('protected-clone-baseline', good), TypeError) } })
test('campaign attachment: generic checkpoint labels retain the known-payload union but reject noncampaign inspections', () => {
  assert.deepEqual(validateAttachment('feature-integration-recovery-checkpoint'), A_CHECKPOINT)
  const bad = clone(A_CHECKPOINT); bad.attachments.diagnostics[0].schemaVersion = `${S}wave0a-cleanup-progress-inspection/v1`
  assert.throws(() => validateAttachment('feature-integration-recovery-checkpoint', bad), TypeError)
  assert.throws(() => policy.validateAttachmentPayload({ schemaVersion: `${S}wave0a-cleanup-progress-inspection/v1` }, { producer: '6D' }), TypeError)
})
test('campaign attachment: bounded pinned archive literal decoding rejects corrupt truncated or excess input', () => {
  const fixture = policy.buildFullArchivePreflightFixture()
  for (let index = 0; index < fixture.sourceFiles.length; index++) assert.equal(digest(policy.decodeArchiveFixtureLiteral(index)), fixture.sourceFiles[index].sha256)
  for (const data of [Buffer.alloc(0), Buffer.from('not-zlib'), deflateSync(Buffer.alloc(16777217, 0x61))]) assert.throws(() => policy.decodeArchiveFixtureLiteral(0, data), TypeError)
  assert.throws(() => policy.decodeArchiveFixtureLiteral(17), TypeError)
})
