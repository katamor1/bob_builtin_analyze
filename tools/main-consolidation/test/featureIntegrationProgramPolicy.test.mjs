import assert from 'node:assert/strict'
import test from 'node:test'
import { buildProgramIndex, canonicalJson, validateProgramIndex } from '../featureIntegrationProgramPolicy.mjs'

const DESIGN = {
  kind: 'design_spec',
  repositoryPath: 'docs/superpowers/specs/2026-08-23-feature-selection-and-sequential-main-integration-design.md',
  containingCommitSha: '819d6261d52d8dc7037d7fae8b852ad4b6a52e21',
  blobOid: 'ccf3f833e32f48e583a6c6fac4796fa30756e1a4',
  blobSha256: '709872ba8fa3188c666473248bf5196d1131672cfdec388929ecdb8c4c0292f5'
}
const PLAN = {
  kind: 'implementation_plan',
  repositoryPath: 'docs/superpowers/plans/2026-08-23-feature-integration-program-index-and-wave-0a.md',
  containingCommitSha: 'a'.repeat(40), blobOid: 'b'.repeat(40), blobSha256: 'c'.repeat(64)
}
const BASELINE = 'c59db06ecb32eb7a57beeb3e932acdd5b4774de5'
const clone = (value) => structuredClone(value)
function validIndex() { return buildProgramIndex({ designAuthority: clone(DESIGN), planAuthority: clone(PLAN) }) }
function expectReject(mutator, expression = /mismatch|invalid|exact|unknown|dynamic|dependency|canonical/u) {
  const index = validIndex(); mutator(index); assert.throws(() => validateProgramIndex(index), expression)
}

const EXPECTED_PREREQUISITES = [{
  id: 'BASE-WF2-F7-BOB-PROFILE', classification: 'planning_baseline_prerequisite', hardDependsOn: [], baselineMainSha: BASELINE,
  authorityDocumentKind: 'design_spec', authorityEvidence: {
    repositoryPath: 'docs/release-evidence/workflow-contract-v2-foundation-status-2026-07-23.md', containingCommitSha: BASELINE,
    blobOid: '2af57db85d10cc23d0581064f7e74f22d79b4cf6', blobSha256: '78dcc91a09299d5d8f1b7ebe27457fc920cc280778c7c4c45c343a6e40803f4e'
  }, requiresLaterEvidence: true
}]
const B = (id, hardDependsOn, authorizedScope, safetyConstraints, completionGate, finalValidationPolicy) => ({ id, classification: 'mandatory', hardDependsOn, authorizedScope, safetyConstraints, completionGate, ...(finalValidationPolicy ? { finalValidationPolicy } : {}) })
const SLICE_SAFETY = ['ONE_ACTIVE_SLICE', 'PLAN_AUTHORING_REQUEST_HASH_APPROVAL_PER_SLICE', 'IMPLEMENTATION_REQUEST_HASH_APPROVAL_PER_SLICE', 'ONE_CONTINUOUS_SLICE_WORKSPACE']
const FINAL_POLICY = {
  controlSlice: { sliceId: 'FINAL-VALIDATION-CONTROL', classification: 'mandatory_atomic_slice', admission: 'after_processing_integrity_verified', requiredApprovals: ['PROGRAM-SLICE-PLAN-AUTHORING-V1', 'PROGRAM-SLICE-IMPLEMENTATION-V1', 'exact_candidate_campaign'], completion: 'verified_before_product_main_freeze' },
  phaseMode: 'fixed_product_main_repository_non_mutating', orderedPhases: ['exact_main_aggregate_gates', 'three_vsix_build_hash', 'same_artifact_real_machine_uat', 'read_only_final_topology_audit'], repositoryMutationDuringPhases: 'forbidden', externalOutputRoots: 'fresh_attestation_bound_only',
  closure: { cardinality: 'zero_or_one', sliceId: 'FINAL-VALIDATION-CLOSURE', boundaryId: 'FINAL-VALIDATION', ownedScope: ['OPTIONAL_FINAL_VALIDATION_CLOSURE', 'STATUS_PROJECTION_PUBLICATION', 'PRE_MERGE_EVIDENCE_BLOB', 'EVIDENCE_HEAD', 'DURABLE_CAMPAIGN_INDEX'], classification: 'docs_evidence_only_atomic_slice', planRequirement: 'separate_plan_implementation_campaign', immediatePredecessor: { kind: 'slice_terminal', id: 'FINAL-VALIDATION-CONTROL', state: 'VERIFIED' }, admission: 'after_all_ordered_phases_succeeded_only', admissionEvidence: { mandatoryHistory: 'all_twenty_catalog_slices_verified_in_order', phaseAttestation: 'hash_bound_all_exact_ordered_phases_succeeded', productIdentity: 'exact_control_verified_main_tree_payload', priorClosure: 'none_on_first_admission_same_bound_subject_only_on_resume' }, requiredApprovalsWhenPresent: ['PROGRAM-SLICE-PLAN-AUTHORING-V1', 'PROGRAM-SLICE-IMPLEMENTATION-V1', 'exact_candidate_campaign'], productPayloadRule: 'byte_identical_to_fixed_product_main', absentCompletion: 'external_attestation_at_product_main', presentCompletion: 'external_attestation_at_payload_identical_closure_main' }
}
const EXPECTED_BOUNDARIES = [
  B('WAVE-0A-CONTROL-PLANE', [], ['program_authority', 'exact_head_ci', 'topology_audit', 'campaign_evidence'], ['product_source_unchanged', 'archive_read_only'], ['archive_preflight', 'exact_pr_head_ci', 'independent_review_zero', 'exact_main_ci', 'main_only_cleanup']),
  B('WAVE-0B-SELECTION-LEDGER', ['WAVE-0A-CONTROL-PLANE'], ['source_universe', 'static_selection_ledger_json', 'deterministic_selection_ledger_markdown', 'selection_schema_policy_tests', 'recovery_evidence', 'status_projection_publication', 'downstream_admission_protocol', 'workspace_disposition_protocol'], ['no_product_runtime_change', 'wave0a_manifest_hash_bound', ...SLICE_SAFETY], ['all_source_items_uniquely_classified', 'archive_provenance_bound', 'wave0a_status_projected', 'downstream_protocols_integrated_and_replay_tested']),
  B('WORKFLOW-B-GATE-P', ['WAVE-0B-SELECTION-LEDGER'], ['WF2-P4-COMPILER', 'WF2-P5-PLANSTORE', 'WF2-P6-ENTRYPOINT', 'WF2-P7-MANIFEST'], ['WF2-P6-ENTRYPOINT_MAX_SHADOW', 'NO_SAME_SLOT_LEGACY_FALLBACK', 'SOLE_IMMUTABLE_COMPILER', ...SLICE_SAFETY], ['P1_P7_EXACT_MAIN', 'GATE-WF2-P']),
  B('WORKFLOW-C-SAFE-PREFIX', ['WORKFLOW-B-GATE-P'], ['GATE-R-ARCHIVE-INVENTORY', 'GATE-R-ACTIVE-MANIFEST', 'GATE-R-VALIDATOR', 'GATE-R-RUNNER', 'WF2-R1-PROVENANCE', 'WF2-R2-INVOKE', 'REG-BRIDGE-OWNER-VERSION-LIFECYCLE', 'REG-BRIDGE-DISCOVERY-EVIDENCE', 'REG-P1-PREREQUISITE-REMAINDER'], ['WF2-R2-INVOKE_PRODUCT_REACHABILITY_ZERO', 'WF2-R3_TO_R5_INACTIVE', 'WF2-R6_ARCHIVED_ABSENT', 'NO_LEGACY_COMPILER', ...SLICE_SAFETY], ['GATE_R_INVENTORY_COMPLETE', 'RUNTIME_ACTIVE_PATH_ZERO', 'CONTRIBUTION_BRIDGE_CONTRACTS', 'REMAINDER_CLASSIFIED']),
  B('PROCESSING-FOUNDATION', ['WORKFLOW-C-SAFE-PREFIX'], ['PROC-T13-LEDGER', 'PROC-T14-BOUNDED-DOC', 'PROC-T15-AGGREGATE'], ['BASE-OOXML-SNAPSHOT_PARITY', 'CURRENT_GUI_DIAGNOSTIC_PARITY', ...SLICE_SAFETY], ['BUDGET_OOXML_AGGREGATE_PARITY']),
  B('PROCESSING-CONTROL', ['PROCESSING-FOUNDATION'], ['PROC-T16-INPUT-PROCESS', 'PROC-T17-DEADLINE', 'PROC-T17-PATH'], ['ABSOLUTE_MONOTONIC_DEADLINE', 'PHYSICAL_PATH_CONTAINMENT', ...SLICE_SAFETY], ['PROCESS_TREE_PATH_BUDGET_GATES']),
  B('PROCESSING-INTEGRITY', ['PROCESSING-CONTROL'], ['PROC-T18-REPORT', 'PROC-T18-CCR-HANDOFF', 'PROC-T18-BZR-HANDOFF'], ['REPORT_SHADOW_BEFORE_BLOCKING', 'COMPLETE_ONLY_HANDOFF', ...SLICE_SAFETY], ['COMPLETE_ONLY_ATOMIC_HANDOFF']),
  B('FINAL-VALIDATION', ['PROCESSING-INTEGRITY'], ['FINAL-VALIDATION-CONTROL', 'FIXED_PRODUCT_MAIN_VALIDATION', 'EXACT_MAIN_FULL_GATES', 'THREE_VSIX', 'REAL_MACHINE_UAT', 'READ_ONLY_FINAL_TOPOLOGY_AUDIT', 'PRODUCT_MAIN_TREE_IDENTITY', 'PRODUCT_PAYLOAD_MANIFEST', 'UAT_ARTIFACT_BINDING', 'EXTERNAL_FINAL_ATTESTATION', 'OPTIONAL_FINAL_VALIDATION_CLOSURE', 'STATUS_PROJECTION_PUBLICATION', 'PRE_MERGE_EVIDENCE_BLOB', 'EVIDENCE_HEAD', 'DURABLE_CAMPAIGN_INDEX', 'MAIN_ONLY_CLEANUP'], ['FINAL_VALIDATION_CONTROL_VERIFIED_BEFORE_FREEZE', 'FIXED_PRODUCT_MAIN_ALL_PHASES', 'REPOSITORY_MUTATION_FORBIDDEN_DURING_PHASES', 'FRESH_EXTERNAL_OUTPUT_ROOTS_ONLY', 'NO_CIRCULAR_UAT_RERUN', 'FINAL_VALIDATION_CLOSURE_ZERO_OR_ONE', 'OPTIONAL_CLOSURE_APPROVAL_CHAIN', 'EVIDENCE_ONLY_DIFF_ALLOWLIST', 'PRODUCT_PAYLOAD_UNCHANGED', ...SLICE_SAFETY], ['FINAL_VALIDATION_CONTROL_VERIFIED', 'FINAL_PRODUCT_ATTESTATION', 'EXTERNAL_FINAL_ATTESTATION', 'MAIN_ONLY_TOPOLOGY', 'FINAL_VALIDATION_COMPLETION_ARM_VALID'], FINAL_POLICY)
]
const predecessor = (kind, id) => ({ kind, id, state: 'VERIFIED' })
const S = (ordinal, boundaryId, sliceId, ownedScope, immediatePredecessor) => ({ ordinal, boundaryId, sliceId, ownedScope, classification: 'mandatory_mutation_slice', planRequirement: 'separate_plan_implementation_campaign', immediatePredecessor })
const EXPECTED_SLICES = [
  S(1, 'WAVE-0B-SELECTION-LEDGER', 'WAVE-0B-SELECTION-LEDGER', EXPECTED_BOUNDARIES[1].authorizedScope, predecessor('boundary_terminal', 'WAVE-0A-CONTROL-PLANE')),
  S(2, 'WORKFLOW-B-GATE-P', 'WF2-P4-COMPILER', ['WF2-P4-COMPILER'], predecessor('boundary_terminal', 'WAVE-0B-SELECTION-LEDGER')),
  S(3, 'WORKFLOW-B-GATE-P', 'WF2-P5-PLANSTORE', ['WF2-P5-PLANSTORE'], predecessor('slice_terminal', 'WF2-P4-COMPILER')),
  S(4, 'WORKFLOW-B-GATE-P', 'WF2-P6-ENTRYPOINT', ['WF2-P6-ENTRYPOINT'], predecessor('slice_terminal', 'WF2-P5-PLANSTORE')),
  S(5, 'WORKFLOW-B-GATE-P', 'WF2-P7-MANIFEST', ['WF2-P7-MANIFEST'], predecessor('slice_terminal', 'WF2-P6-ENTRYPOINT')),
  S(6, 'WORKFLOW-C-SAFE-PREFIX', 'GATE-R-ARCHIVE-INVENTORY', ['GATE-R-ARCHIVE-INVENTORY', 'GATE-R-ACTIVE-MANIFEST', 'GATE-R-VALIDATOR', 'GATE-R-RUNNER'], predecessor('boundary_terminal', 'WORKFLOW-B-GATE-P')),
  S(7, 'WORKFLOW-C-SAFE-PREFIX', 'WF2-R1-PROVENANCE', ['WF2-R1-PROVENANCE'], predecessor('slice_terminal', 'GATE-R-ARCHIVE-INVENTORY')),
  S(8, 'WORKFLOW-C-SAFE-PREFIX', 'WF2-R2-INVOKE', ['WF2-R2-INVOKE'], predecessor('slice_terminal', 'WF2-R1-PROVENANCE')),
  S(9, 'WORKFLOW-C-SAFE-PREFIX', 'REG-BRIDGE-OWNER-VERSION-LIFECYCLE', ['REG-BRIDGE-OWNER-VERSION-LIFECYCLE'], predecessor('slice_terminal', 'WF2-R2-INVOKE')),
  S(10, 'WORKFLOW-C-SAFE-PREFIX', 'REG-BRIDGE-DISCOVERY-EVIDENCE', ['REG-BRIDGE-DISCOVERY-EVIDENCE', 'REG-P1-PREREQUISITE-REMAINDER'], predecessor('slice_terminal', 'REG-BRIDGE-OWNER-VERSION-LIFECYCLE')),
  S(11, 'PROCESSING-FOUNDATION', 'PROC-T13-LEDGER', ['PROC-T13-LEDGER'], predecessor('boundary_terminal', 'WORKFLOW-C-SAFE-PREFIX')),
  S(12, 'PROCESSING-FOUNDATION', 'PROC-T14-BOUNDED-DOC', ['PROC-T14-BOUNDED-DOC'], predecessor('slice_terminal', 'PROC-T13-LEDGER')),
  S(13, 'PROCESSING-FOUNDATION', 'PROC-T15-AGGREGATE', ['PROC-T15-AGGREGATE'], predecessor('slice_terminal', 'PROC-T14-BOUNDED-DOC')),
  S(14, 'PROCESSING-CONTROL', 'PROC-T16-INPUT-PROCESS', ['PROC-T16-INPUT-PROCESS'], predecessor('boundary_terminal', 'PROCESSING-FOUNDATION')),
  S(15, 'PROCESSING-CONTROL', 'PROC-T17-DEADLINE', ['PROC-T17-DEADLINE'], predecessor('slice_terminal', 'PROC-T16-INPUT-PROCESS')),
  S(16, 'PROCESSING-CONTROL', 'PROC-T17-PATH', ['PROC-T17-PATH'], predecessor('slice_terminal', 'PROC-T17-DEADLINE')),
  S(17, 'PROCESSING-INTEGRITY', 'PROC-T18-REPORT', ['PROC-T18-REPORT'], predecessor('boundary_terminal', 'PROCESSING-CONTROL')),
  S(18, 'PROCESSING-INTEGRITY', 'PROC-T18-CCR-HANDOFF', ['PROC-T18-CCR-HANDOFF'], predecessor('slice_terminal', 'PROC-T18-REPORT')),
  S(19, 'PROCESSING-INTEGRITY', 'PROC-T18-BZR-HANDOFF', ['PROC-T18-BZR-HANDOFF'], predecessor('slice_terminal', 'PROC-T18-CCR-HANDOFF')),
  S(20, 'FINAL-VALIDATION', 'FINAL-VALIDATION-CONTROL', ['FINAL-VALIDATION-CONTROL', 'PRODUCT_PAYLOAD_MANIFEST', 'UAT_ARTIFACT_BINDING', 'EXTERNAL_FINAL_ATTESTATION', 'STATUS_PROJECTION_PUBLICATION', 'DURABLE_CAMPAIGN_INDEX'], predecessor('boundary_terminal', 'PROCESSING-INTEGRITY'))
]
const EXPECTED_PROTOCOL = {
  schemaVersions: { planAuthoring: 'PROGRAM-SLICE-PLAN-AUTHORING-V1', implementation: 'PROGRAM-SLICE-IMPLEMENTATION-V1', workspaceDisposition: 'PROGRAM-SLICE-WORKSPACE-DISPOSITION-V1' },
  gateP: { afterSlice: 'WF2-P7-MANIFEST', classification: 'repository_non_mutating_boundary_completion_observation', mutationAuthority: false },
  sliceAdmission: { descriptorArms: [{ kind: 'mandatory_catalog_row', source: 'programAtomicSlices' }, { kind: 'optional_final_validation_closure', boundaryId: 'FINAL-VALIDATION', source: 'finalValidationPolicy.closure' }], descriptorAuthority: 'validated_static_program_index_only', callerSuppliedSliceIdOrDescriptor: 'forbidden', validationPhaseAsMutationSlice: 'forbidden' },
  workspaceDisposition: { decisions: ['retain_same_workspace', 'dispose_to_main_only'], automaticCleanup: false, disposalOrder: ['preserve_external', 'remove_exact_worktree', 'delete_exact_local_ref', 'verify_main_only'] }
}
const EXPECTED_DEFERRED = [
  { id: 'WF2-R3-WINDOWS-ADAPTER', disposition: 'conditional', hardDependsOn: ['WF2-R2-INVOKE'], sequenceAfter: ['FINAL-VALIDATION'], requiresSeparateCampaignApproval: true, requiredSpecIdentity: 'WF2-R3-WINDOWS-ADAPTER-DESIGN@1' },
  { id: 'WF2-R3-ARTIFACT-TX', disposition: 'conditional', hardDependsOn: ['WF2-R2-INVOKE', 'WF2-R3-WINDOWS-ADAPTER'], sequenceAfter: ['FINAL-VALIDATION'], requiresSeparateCampaignApproval: true },
  { id: 'WF2-R4-EXECUTOR', disposition: 'conditional', hardDependsOn: ['WF2-R3-ARTIFACT-TX'], sequenceAfter: ['FINAL-VALIDATION'], requiresSeparateCampaignApproval: true },
  { id: 'WF2-R5-BOB', disposition: 'conditional', hardDependsOn: ['WF2-R4-EXECUTOR', 'BASE-WF2-F7-BOB-PROFILE'], sequenceAfter: ['FINAL-VALIDATION'], requiresSeparateCampaignApproval: true },
  { id: 'WF2-R6-ARCHIVED', disposition: 'rejected_current_snapshot', hardDependsOn: [] }
]
const EXPECTED_ARCHIVES = [
  { root: 'C:\\Users\\stell\\source\\archives\\bob_builtin_analyze\\2026-08-21-main-consolidation', manifestSha256: '36e477ee9b752ebf7f07a208c166fec24e14a89bf7ba6a7921cf6bdf708c9f31' },
  { root: 'C:\\Users\\stell\\source\\archives\\bob_builtin_analyze\\2026-08-22-local-worktree-cleanup', manifestSha256: 'ad742f4dbd2112c5674da2e3e0ee2046645849e4b3bf3674596df3b868c8bdff' },
  { root: 'C:\\Users\\stell\\source\\archives\\bob_builtin_analyze\\2026-08-22-remote-main-unification', manifestSha256: 'bcdb61aad397ef4c6463eaa789d5d278b9d1bcad34015bc472c1dfc97773e476' }
]
const EXPECTED_TRUST = [
  { id: 'original-repository-bundle', sha256: '55db2865e7795d9192e75bfb3dbaadc47d28366128c241edda512aef4ca599a1' }, { id: 'carrier-manifest', sha256: 'ac5f4e94602e355828a6596be8ab9107f4f34677f0014d97f92eb960ffa539b4' }, { id: 'local-cleanup-bundle', sha256: 'e0e6fd92f1d7504c3271c01b0eae3542d3562a9214b8164957e19b56ac48dc40' }, { id: 'remote-cleanup-execution-plan', sha256: '9e36b465afbba6826556e4d7347ca1c7cb805bdb6280c77ccfeb15f6479046c8d' }, { id: 'remote-cleanup-execution-result', sha256: '3ba79a5536d18dc0fc9ec15ffe41ca6cd37c527f5dd30f02aba4ea399c6faed7' }, { id: 'remote-recovery-bundle', sha256: '06a338f28879218a8cbae247a3b4c5b951f152cd46caca4d81b7b07504cfbf1f' }
]
const EXPECTED_PATCHES = [
  { id: 'workflow-b', sha256: '59eca51331f3c580a63435021e03c05780ffbe6b65db76949cb0d4bff8c428c7' }, { id: 'workflow-c', sha256: '2852e9e0e535bbb63165ae01538dd271bd888afe0b7f7dcbca53d193ef24912f' }, { id: 'processing-a', sha256: '6913ddddcffb150eb207aee99bdbbad158b4ed05e9c3ca8714693d31f6122536' }, { id: 'processing-b', sha256: 'edd675378aa15650b5648308ae1f7621fa830844699ad4d06660463c9d2cb10b' }, { id: 'processing-c', sha256: '294c11760ed94bdddec8f37f6f9517f42f7e9c6442ad23df6041ff9f470bbab5' }
]
const EXPECTED_STATIC_PATHS = [
  { path: 'tools/main-consolidation/feature-integration-program-index.json', earliestBoundary: 'WAVE-0A-CONTROL-PLANE' }, { path: 'tools/main-consolidation/exact-head-ci-contract.json', earliestBoundary: 'WAVE-0A-CONTROL-PLANE' }, { path: 'tools/main-consolidation/feature-selection-source-universe.json', earliestBoundary: 'WAVE-0B-SELECTION-LEDGER' }, { path: 'docs/release-evidence/feature-selection-ledger-2026-08-23.json', earliestBoundary: 'WAVE-0B-SELECTION-LEDGER' }, { path: 'docs/release-evidence/feature-selection-ledger-2026-08-23.md', earliestBoundary: 'WAVE-0B-SELECTION-LEDGER' }, { path: 'docs/release-evidence/feature-integration-status.json', earliestBoundary: 'WAVE-0B-SELECTION-LEDGER' }
]
const EXPECTED_DYNAMIC = { externalCampaignRoot: 'C:\\Users\\stell\\source\\archives\\bob_builtin_analyze\\2026-08-23-feature-integration-campaign', campaignAuthoritySchemaVersion: 'bob-builtin-analyze/feature-integration-campaign-authority/v1', attemptEventSchemaVersion: 'bob-builtin-analyze/feature-integration-campaign-attempt-event/v1', attemptManifestSchemaVersion: 'bob-builtin-analyze/feature-integration-campaign-attempt-manifest/v1', campaignIndexEntrySchemaVersion: 'bob-builtin-analyze/feature-integration-campaign-index-entry/v1', decisionAuthorityKinds: ['program_index', 'selection_ledger'], operatorHandoffSchemaVersion: 'bob-builtin-analyze/feature-integration-operator-handoff/v1', verifiedHandoffSchemaVersion: 'bob-builtin-analyze/feature-integration-verified-handoff/v1', recoveryCheckpointSchemaVersion: 'bob-builtin-analyze/feature-integration-recovery-checkpoint/v1', quarantineSchemaVersion: 'bob-builtin-analyze/feature-integration-quarantine/v1', productPayloadManifestSchemaVersion: 'bob-builtin-analyze/feature-integration-product-payload-manifest/v1', uatArtifactManifestSchemaVersion: 'bob-builtin-analyze/feature-integration-uat-artifact-manifest/v1', closureAttestationSchemaVersion: 'bob-builtin-analyze/feature-integration-final-attestation/v1', campaignIndexDirectory: 'campaign-index', recoveryCheckpointDirectory: 'recovery-checkpoints', recoveryReservationDirectory: 'recovery-reservations', finalAttestationIndexKind: 'final_attestation', trackedProjectionPath: 'docs/release-evidence/feature-integration-status.json', trackedProjectionEarliestBoundary: 'WAVE-0B-SELECTION-LEDGER' }

test('program index binds the approved spec and committed implementation plan by commit, blob, and sha256', () => {
  const validated = validateProgramIndex(validIndex()); assert.deepEqual(validated.authorityDocuments, [DESIGN, PLAN])
})
test('program index has every mandatory boundary, safety constraint, completion gate, scope, and final policy exactly', () => {
  const validated = validateProgramIndex(validIndex()); assert.deepEqual(validated.planBoundaries, EXPECTED_BOUNDARIES); assert.ok(validated.planBoundaries.every(({ classification }) => classification === 'mandatory'))
})
test('program index closes exact baseline prerequisite, static artifacts, archives, trust and carrier identities', () => {
  const validated = validateProgramIndex(validIndex()); assert.deepEqual(validated.baselinePrerequisites, EXPECTED_PREREQUISITES); assert.deepEqual(validated.staticArtifactPaths, EXPECTED_STATIC_PATHS); assert.deepEqual(validated.immutableArchives, EXPECTED_ARCHIVES); assert.deepEqual(validated.trustChainIdentities, EXPECTED_TRUST); assert.deepEqual(validated.carrierPatchIdentities, EXPECTED_PATCHES)
})
test('program index fixes all twenty catalog rows and downstream protocol policy exactly', () => {
  const validated = validateProgramIndex(validIndex()); assert.deepEqual(validated.programAtomicSlices, EXPECTED_SLICES); assert.deepEqual(validated.downstreamProtocolPolicy, EXPECTED_PROTOCOL); assert.equal(validated.programAtomicSlices.some(({ sliceId }) => sliceId === 'GATE-WF2-P' || sliceId === 'FINAL-VALIDATION-CLOSURE'), false)
})
test('program index preserves exact deferred capability policy and exports no selector', async () => {
  const validated = validateProgramIndex(validIndex()); assert.deepEqual(validated.deferredCapabilities, EXPECTED_DEFERRED); const policy = await import('../featureIntegrationProgramPolicy.mjs'); assert.deepEqual(Object.keys(policy).sort(), ['buildProgramIndex', 'canonicalJson', 'validateProgramIndex']); assert.equal(Object.hasOwn(policy, 'selectNextEligibleSubject'), false)
})
test('program index returns deeply independent mutable copies', () => {
  const first = validIndex(); first.planBoundaries[0].authorizedScope.push('changed'); first.deferredCapabilities[0].hardDependsOn[0] = 'changed'; first.dynamicEvidencePolicy.decisionAuthorityKinds.push('changed'); const second = validIndex(); assert.deepEqual(second.planBoundaries, EXPECTED_BOUNDARIES); assert.deepEqual(second.deferredCapabilities, EXPECTED_DEFERRED); assert.deepEqual(second.dynamicEvidencePolicy, EXPECTED_DYNAMIC)
})
test('canonical JSON is deterministic NFC-normalized, ordered, newline terminated, and rejects noncanonical inputs', () => {
  assert.equal(canonicalJson({ z: 1, a: 'e\u0301', zero: -0 }).toString('utf8'), '{"a":"é","z":1,"zero":0}\n'); for (const value of [undefined, 1.5, Infinity, Array(1), Object.assign([], { x: 1 })]) assert.throws(() => canonicalJson(value), /unsupported|noncanonical|sparse|extended|plain/u); const cyclic = {}; cyclic.self = cyclic; assert.throws(() => canonicalJson(cyclic), /cyclic/u)
})
test('validation rejects any top-level dynamic field or unknown key', () => {
  for (const field of ['status', 'approvalRecord', 'implementationHeadSha', 'mergeSha', 'runId', 'jobId', 'uatResult', 'observedActivationStatus', 'unknown']) expectReject((index) => { index[field] = 'forbidden' })
})
test('validation rejects wrong schema repository baseline authority records and escaping authority paths', () => {
  for (const mutate of [i => { i.schemaVersion = 'wrong' }, i => { i.repository = 'wrong/repo' }, i => { i.planningBaselineMainSha = 'a'.repeat(40) }, i => { i.authorityDocuments.pop() }, i => { i.authorityDocuments.push(clone(PLAN)) }, i => { i.authorityDocuments[0].repositoryPath = '../escape.md' }, i => { i.authorityDocuments[1].repositoryPath = 'C:\\escape.md' }, i => { i.authorityDocuments[0].blobSha256 = 'a'.repeat(64) }, i => { i.authorityDocuments[1].containingCommitSha = 'A'.repeat(40) }]) expectReject(mutate)
})
test('validation rejects every baseline prerequisite drift and undeclared prerequisite dependency', () => {
  for (const mutate of [i => { i.baselinePrerequisites = [] }, i => { i.baselinePrerequisites.push(clone(i.baselinePrerequisites[0])) }, i => { i.baselinePrerequisites[0].authorityEvidence.repositoryPath = 'docs/x.md' }, i => { i.baselinePrerequisites[0].authorityEvidence.containingCommitSha = 'a'.repeat(40) }, i => { i.baselinePrerequisites[0].authorityEvidence.blobOid = 'a'.repeat(40) }, i => { i.baselinePrerequisites[0].authorityEvidence.blobSha256 = 'a'.repeat(64) }, i => { i.baselinePrerequisites[0].requiresLaterEvidence = false }, i => { i.deferredCapabilities[3].hardDependsOn.push('MISSING') }]) expectReject(mutate)
})
test('validation rejects missing duplicate reordered or altered boundary policy', () => {
  for (const mutate of [i => { i.planBoundaries.pop() }, i => { i.planBoundaries.push(clone(i.planBoundaries[0])) }, i => { i.planBoundaries.reverse() }, i => { i.planBoundaries[1].authorizedScope.pop() }, i => { i.planBoundaries[3].authorizedScope = i.planBoundaries[3].authorizedScope.filter((x) => !x.startsWith('GATE-R-')) }, i => { i.planBoundaries[7].authorizedScope = i.planBoundaries[7].authorizedScope.filter((x) => x !== 'FINAL-VALIDATION-CONTROL') }, i => { i.planBoundaries[1].hardDependsOn = ['MISSING'] }, i => { i.planBoundaries[0].hardDependsOn = ['FINAL-VALIDATION'] }]) expectReject(mutate)
})
test('validation rejects every catalog row or predecessor edge drift including Gate P and closure-as-row', () => {
  for (const mutate of [i => { i.programAtomicSlices.pop() }, i => { i.programAtomicSlices.reverse() }, i => { i.programAtomicSlices.splice(2, 1) }, i => { i.programAtomicSlices[2].immediatePredecessor.id = 'wrong' }, i => { i.programAtomicSlices[2].immediatePredecessor.state = 'PENDING' }, i => { i.programAtomicSlices[5].sliceId = 'GATE-WF2-P' }, i => { i.programAtomicSlices.push({ ...clone(i.programAtomicSlices[19]), ordinal: 21, sliceId: 'FINAL-VALIDATION-CLOSURE' }) }]) expectReject(mutate)
})
test('validation rejects downstream protocol and external campaign root drift', () => {
  for (const mutate of [i => { i.downstreamProtocolPolicy.gateP.classification = 'mandatory_mutation_slice' }, i => { i.downstreamProtocolPolicy.sliceAdmission.descriptorArms.reverse() }, i => { i.downstreamProtocolPolicy.sliceAdmission.descriptorArms[1].source = 'unknown' }, i => { i.downstreamProtocolPolicy.sliceAdmission.descriptorArms.push({ kind: 'unknown' }) }, i => { i.downstreamProtocolPolicy.workspaceDisposition.automaticCleanup = true }, i => { i.dynamicEvidencePolicy.externalCampaignRoot = 'C:\\wrong' }, i => { i.dynamicEvidencePolicy = null }]) expectReject(mutate)
})
test('validation rejects every final validation phase and closure weakening', () => {
  for (const mutate of [i => { i.planBoundaries[7].finalValidationPolicy.orderedPhases.reverse() }, i => { i.planBoundaries[7].finalValidationPolicy.orderedPhases.push('duplicate') }, i => { i.planBoundaries[7].finalValidationPolicy.closure.cardinality = 'many' }, i => { i.planBoundaries[7].finalValidationPolicy.closure.requiredApprovalsWhenPresent.pop() }, i => { i.planBoundaries[7].finalValidationPolicy.closure.productPayloadRule = 'different' }, i => { delete i.planBoundaries[7].finalValidationPolicy.closure.admissionEvidence.priorClosure }, i => { i.planBoundaries[7].finalValidationPolicy.closure.immediatePredecessor = { kind: 'slice_terminal', id: 'FINAL-VALIDATION-CONTROL', state: 'PENDING' } }]) expectReject(mutate)
})
test('validation rejects every deferred field drift, aliases, order, disposition, dependency, sequence, approval, and wrong V1 spec identity', () => {
  const mutations = [i => { i.deferredCapabilities.pop() }, i => { i.deferredCapabilities.push(clone(i.deferredCapabilities[0])) }, i => { i.deferredCapabilities.reverse() }, i => { i.deferredCapabilities[0].alias = 'alias' }, i => { i.deferredCapabilities[0].id = 'alias' }, i => { i.deferredCapabilities[0].disposition = 'rejected_current_snapshot' }, i => { i.deferredCapabilities[0].hardDependsOn = [] }, i => { i.deferredCapabilities[0].sequenceAfter = ['WORKFLOW-B-GATE-P'] }, i => { i.deferredCapabilities[0].requiresSeparateCampaignApproval = false }, i => { i.deferredCapabilities[0].requiredSpecIdentity = 'WF2-R3-WINDOWS-ADAPTER-DESIGN-V1' }]
  for (const mutate of mutations) expectReject(mutate)
})
test('validation rejects an independent mutation of every deferred capability field', () => {
  for (let row = 0; row < EXPECTED_DEFERRED.length; row += 1) {
    for (const key of Object.keys(EXPECTED_DEFERRED[row])) {
      if (Array.isArray(EXPECTED_DEFERRED[row][key])) {
        expectReject((index) => { index.deferredCapabilities[row][key] = [...index.deferredCapabilities[row][key], 'MUTATED'] })
      } else if (typeof EXPECTED_DEFERRED[row][key] === 'boolean') {
        expectReject((index) => { index.deferredCapabilities[row][key] = !index.deferredCapabilities[row][key] })
      } else {
        expectReject((index) => { index.deferredCapabilities[row][key] = 'MUTATED' })
      }
    }
  }
})
