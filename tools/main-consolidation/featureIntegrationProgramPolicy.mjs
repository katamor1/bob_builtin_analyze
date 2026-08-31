const SCHEMA = 'bob-builtin-analyze/feature-integration-program-index/v2'
const REPOSITORY = 'katamor1/bob_builtin_analyze'
const BASELINE = 'c59db06ecb32eb7a57beeb3e932acdd5b4774de5'
const FORBIDDEN_DYNAMIC_KEYS = new Set(['status', 'approvalRecord', 'implementationHeadSha', 'mergeSha', 'runId', 'jobId', 'uatResult', 'observedActivationStatus'])
const FORBIDDEN_LEGACY_AUTHORIZATION_TOKENS = new Set(['authorityDocuments', 'requiredApprovals', 'requiredApprovalsWhenPresent', 'PLAN_AUTHORING_REQUEST_HASH_APPROVAL_PER_SLICE', 'IMPLEMENTATION_REQUEST_HASH_APPROVAL_PER_SLICE', 'requiresSeparateCampaignApproval', 'separate_plan_implementation_campaign', 'campaignAuthoritySchemaVersion', 'externalCampaignRoot', 'operatorHandoffSchemaVersion', 'verifiedHandoffSchemaVersion'])
const PROGRAM_INDEX_KEYS = ['schemaVersion', 'programId', 'repository', 'planningBaselineMainSha', 'governance', 'baselinePrerequisites', 'planBoundaries', 'programAtomicSlices', 'downstreamProtocolPolicy', 'deferredCapabilities', 'immutableArchives', 'trustChainIdentities', 'carrierPatchIdentities', 'staticArtifactPaths']
const GOVERNANCE = { designSpecPath: 'docs/superpowers/specs/2026-08-31-wave0a-risk-tiered-approval-and-evidence-design.md', riskModelSchemaVersion: 'bob-builtin-analyze/feature-integration-risk-model/v1', legacyAuthorization: 'historical_only', localMutationTier: 'B', protectedMutationTier: 'C' }

const BASELINE_PREREQUISITES = [{ id: 'BASE-WF2-F7-BOB-PROFILE', classification: 'planning_baseline_prerequisite', hardDependsOn: [], baselineMainSha: BASELINE, authorityDocumentKind: 'design_spec', authorityEvidence: { repositoryPath: 'docs/release-evidence/workflow-contract-v2-foundation-status-2026-07-23.md', containingCommitSha: BASELINE, blobOid: '2af57db85d10cc23d0581064f7e74f22d79b4cf6', blobSha256: '78dcc91a09299d5d8f1b7ebe27457fc920cc280778c7c4c45c343a6e40803f4e' }, requiresLaterEvidence: true }]
const SLICE_SAFETY = ['ONE_ACTIVE_SLICE', 'ONE_CONTINUOUS_SLICE_WORKSPACE']
const finalValidationPolicy = {
  controlSlice: { sliceId: 'FINAL-VALIDATION-CONTROL', classification: 'mandatory_atomic_slice', admission: 'after_processing_integrity_verified', completion: 'verified_before_product_main_freeze' },
  phaseMode: 'fixed_product_main_repository_non_mutating', orderedPhases: ['exact_main_aggregate_gates', 'three_vsix_build_hash', 'same_artifact_real_machine_uat', 'read_only_final_topology_audit'], repositoryMutationDuringPhases: 'forbidden', externalOutputRoots: 'fresh_attestation_bound_only',
  closure: { cardinality: 'zero_or_one', sliceId: 'FINAL-VALIDATION-CLOSURE', boundaryId: 'FINAL-VALIDATION', ownedScope: ['OPTIONAL_FINAL_VALIDATION_CLOSURE', 'STATUS_PROJECTION_PUBLICATION', 'PRE_MERGE_EVIDENCE_BLOB', 'EVIDENCE_HEAD', 'DURABLE_CAMPAIGN_INDEX'], classification: 'docs_evidence_only_atomic_slice', immediatePredecessor: { kind: 'slice_terminal', id: 'FINAL-VALIDATION-CONTROL', state: 'VERIFIED' }, admission: 'after_all_ordered_phases_succeeded_only', admissionEvidence: { mandatoryHistory: 'all_twenty_catalog_slices_verified_in_order', phaseAttestation: 'hash_bound_all_exact_ordered_phases_succeeded', productIdentity: 'exact_control_verified_main_tree_payload', priorClosure: 'none_on_first_admission_same_bound_subject_only_on_resume' }, productPayloadRule: 'byte_identical_to_fixed_product_main', absentCompletion: 'external_attestation_at_product_main', presentCompletion: 'external_attestation_at_payload_identical_closure_main' }
}
const boundary = (id, hardDependsOn, authorizedScope, safetyConstraints, completionGate, policy) => ({ id, classification: 'mandatory', hardDependsOn, authorizedScope, safetyConstraints, completionGate, ...(policy ? { finalValidationPolicy: policy } : {}) })
const PROGRAM_BOUNDARIES = [
  boundary('WAVE-0A-CONTROL-PLANE', [], ['program_authority', 'exact_head_ci', 'topology_audit', 'campaign_evidence'], ['product_source_unchanged', 'archive_read_only'], ['archive_preflight', 'exact_pr_head_ci', 'independent_review_zero', 'exact_main_ci', 'main_only_cleanup']),
  boundary('WAVE-0B-SELECTION-LEDGER', ['WAVE-0A-CONTROL-PLANE'], ['source_universe', 'static_selection_ledger_json', 'deterministic_selection_ledger_markdown', 'selection_schema_policy_tests', 'recovery_evidence', 'status_projection_publication', 'downstream_admission_protocol', 'workspace_disposition_protocol'], ['no_product_runtime_change', 'wave0a_manifest_hash_bound', ...SLICE_SAFETY], ['all_source_items_uniquely_classified', 'archive_provenance_bound', 'wave0a_status_projected', 'downstream_protocols_integrated_and_replay_tested']),
  boundary('WORKFLOW-B-GATE-P', ['WAVE-0B-SELECTION-LEDGER'], ['WF2-P4-COMPILER', 'WF2-P5-PLANSTORE', 'WF2-P6-ENTRYPOINT', 'WF2-P7-MANIFEST'], ['WF2-P6-ENTRYPOINT_MAX_SHADOW', 'NO_SAME_SLOT_LEGACY_FALLBACK', 'SOLE_IMMUTABLE_COMPILER', ...SLICE_SAFETY], ['P1_P7_EXACT_MAIN', 'GATE-WF2-P']),
  boundary('WORKFLOW-C-SAFE-PREFIX', ['WORKFLOW-B-GATE-P'], ['GATE-R-ARCHIVE-INVENTORY', 'GATE-R-ACTIVE-MANIFEST', 'GATE-R-VALIDATOR', 'GATE-R-RUNNER', 'WF2-R1-PROVENANCE', 'WF2-R2-INVOKE', 'REG-BRIDGE-OWNER-VERSION-LIFECYCLE', 'REG-BRIDGE-DISCOVERY-EVIDENCE', 'REG-P1-PREREQUISITE-REMAINDER'], ['WF2-R2-INVOKE_PRODUCT_REACHABILITY_ZERO', 'WF2-R3_TO_R5_INACTIVE', 'WF2-R6_ARCHIVED_ABSENT', 'NO_LEGACY_COMPILER', ...SLICE_SAFETY], ['GATE_R_INVENTORY_COMPLETE', 'RUNTIME_ACTIVE_PATH_ZERO', 'CONTRIBUTION_BRIDGE_CONTRACTS', 'REMAINDER_CLASSIFIED']),
  boundary('PROCESSING-FOUNDATION', ['WORKFLOW-C-SAFE-PREFIX'], ['PROC-T13-LEDGER', 'PROC-T14-BOUNDED-DOC', 'PROC-T15-AGGREGATE'], ['BASE-OOXML-SNAPSHOT_PARITY', 'CURRENT_GUI_DIAGNOSTIC_PARITY', ...SLICE_SAFETY], ['BUDGET_OOXML_AGGREGATE_PARITY']),
  boundary('PROCESSING-CONTROL', ['PROCESSING-FOUNDATION'], ['PROC-T16-INPUT-PROCESS', 'PROC-T17-DEADLINE', 'PROC-T17-PATH'], ['ABSOLUTE_MONOTONIC_DEADLINE', 'PHYSICAL_PATH_CONTAINMENT', ...SLICE_SAFETY], ['PROCESS_TREE_PATH_BUDGET_GATES']),
  boundary('PROCESSING-INTEGRITY', ['PROCESSING-CONTROL'], ['PROC-T18-REPORT', 'PROC-T18-CCR-HANDOFF', 'PROC-T18-BZR-HANDOFF'], ['REPORT_SHADOW_BEFORE_BLOCKING', 'COMPLETE_ONLY_HANDOFF', ...SLICE_SAFETY], ['COMPLETE_ONLY_ATOMIC_HANDOFF']),
  boundary('FINAL-VALIDATION', ['PROCESSING-INTEGRITY'], ['FINAL-VALIDATION-CONTROL', 'FIXED_PRODUCT_MAIN_VALIDATION', 'EXACT_MAIN_FULL_GATES', 'THREE_VSIX', 'REAL_MACHINE_UAT', 'READ_ONLY_FINAL_TOPOLOGY_AUDIT', 'PRODUCT_MAIN_TREE_IDENTITY', 'PRODUCT_PAYLOAD_MANIFEST', 'UAT_ARTIFACT_BINDING', 'EXTERNAL_FINAL_ATTESTATION', 'OPTIONAL_FINAL_VALIDATION_CLOSURE', 'STATUS_PROJECTION_PUBLICATION', 'PRE_MERGE_EVIDENCE_BLOB', 'EVIDENCE_HEAD', 'DURABLE_CAMPAIGN_INDEX', 'MAIN_ONLY_CLEANUP'], ['FINAL_VALIDATION_CONTROL_VERIFIED_BEFORE_FREEZE', 'FIXED_PRODUCT_MAIN_ALL_PHASES', 'REPOSITORY_MUTATION_FORBIDDEN_DURING_PHASES', 'FRESH_EXTERNAL_OUTPUT_ROOTS_ONLY', 'NO_CIRCULAR_UAT_RERUN', 'FINAL_VALIDATION_CLOSURE_ZERO_OR_ONE', 'OPTIONAL_CLOSURE_APPROVAL_CHAIN', 'EVIDENCE_ONLY_DIFF_ALLOWLIST', 'PRODUCT_PAYLOAD_UNCHANGED', ...SLICE_SAFETY], ['FINAL_VALIDATION_CONTROL_VERIFIED', 'FINAL_PRODUCT_ATTESTATION', 'EXTERNAL_FINAL_ATTESTATION', 'MAIN_ONLY_TOPOLOGY', 'FINAL_VALIDATION_COMPLETION_ARM_VALID'], finalValidationPolicy)
]
const predecessor = (kind, id) => ({ kind, id, state: 'VERIFIED' })
const slice = (ordinal, boundaryId, sliceId, ownedScope, immediatePredecessor) => ({ ordinal, boundaryId, sliceId, ownedScope, classification: 'mandatory_mutation_slice', minimumRiskTier: 'B', effectBasedEscalation: true, immediatePredecessor })
const PROGRAM_ATOMIC_SLICES = [
  slice(1, 'WAVE-0B-SELECTION-LEDGER', 'WAVE-0B-SELECTION-LEDGER', PROGRAM_BOUNDARIES[1].authorizedScope, predecessor('boundary_terminal', 'WAVE-0A-CONTROL-PLANE')),
  slice(2, 'WORKFLOW-B-GATE-P', 'WF2-P4-COMPILER', ['WF2-P4-COMPILER'], predecessor('boundary_terminal', 'WAVE-0B-SELECTION-LEDGER')),
  slice(3, 'WORKFLOW-B-GATE-P', 'WF2-P5-PLANSTORE', ['WF2-P5-PLANSTORE'], predecessor('slice_terminal', 'WF2-P4-COMPILER')),
  slice(4, 'WORKFLOW-B-GATE-P', 'WF2-P6-ENTRYPOINT', ['WF2-P6-ENTRYPOINT'], predecessor('slice_terminal', 'WF2-P5-PLANSTORE')),
  slice(5, 'WORKFLOW-B-GATE-P', 'WF2-P7-MANIFEST', ['WF2-P7-MANIFEST'], predecessor('slice_terminal', 'WF2-P6-ENTRYPOINT')),
  slice(6, 'WORKFLOW-C-SAFE-PREFIX', 'GATE-R-ARCHIVE-INVENTORY', ['GATE-R-ARCHIVE-INVENTORY', 'GATE-R-ACTIVE-MANIFEST', 'GATE-R-VALIDATOR', 'GATE-R-RUNNER'], predecessor('boundary_terminal', 'WORKFLOW-B-GATE-P')),
  slice(7, 'WORKFLOW-C-SAFE-PREFIX', 'WF2-R1-PROVENANCE', ['WF2-R1-PROVENANCE'], predecessor('slice_terminal', 'GATE-R-ARCHIVE-INVENTORY')),
  slice(8, 'WORKFLOW-C-SAFE-PREFIX', 'WF2-R2-INVOKE', ['WF2-R2-INVOKE'], predecessor('slice_terminal', 'WF2-R1-PROVENANCE')),
  slice(9, 'WORKFLOW-C-SAFE-PREFIX', 'REG-BRIDGE-OWNER-VERSION-LIFECYCLE', ['REG-BRIDGE-OWNER-VERSION-LIFECYCLE'], predecessor('slice_terminal', 'WF2-R2-INVOKE')),
  slice(10, 'WORKFLOW-C-SAFE-PREFIX', 'REG-BRIDGE-DISCOVERY-EVIDENCE', ['REG-BRIDGE-DISCOVERY-EVIDENCE', 'REG-P1-PREREQUISITE-REMAINDER'], predecessor('slice_terminal', 'REG-BRIDGE-OWNER-VERSION-LIFECYCLE')),
  slice(11, 'PROCESSING-FOUNDATION', 'PROC-T13-LEDGER', ['PROC-T13-LEDGER'], predecessor('boundary_terminal', 'WORKFLOW-C-SAFE-PREFIX')),
  slice(12, 'PROCESSING-FOUNDATION', 'PROC-T14-BOUNDED-DOC', ['PROC-T14-BOUNDED-DOC'], predecessor('slice_terminal', 'PROC-T13-LEDGER')),
  slice(13, 'PROCESSING-FOUNDATION', 'PROC-T15-AGGREGATE', ['PROC-T15-AGGREGATE'], predecessor('slice_terminal', 'PROC-T14-BOUNDED-DOC')),
  slice(14, 'PROCESSING-CONTROL', 'PROC-T16-INPUT-PROCESS', ['PROC-T16-INPUT-PROCESS'], predecessor('boundary_terminal', 'PROCESSING-FOUNDATION')),
  slice(15, 'PROCESSING-CONTROL', 'PROC-T17-DEADLINE', ['PROC-T17-DEADLINE'], predecessor('slice_terminal', 'PROC-T16-INPUT-PROCESS')),
  slice(16, 'PROCESSING-CONTROL', 'PROC-T17-PATH', ['PROC-T17-PATH'], predecessor('slice_terminal', 'PROC-T17-DEADLINE')),
  slice(17, 'PROCESSING-INTEGRITY', 'PROC-T18-REPORT', ['PROC-T18-REPORT'], predecessor('boundary_terminal', 'PROCESSING-CONTROL')),
  slice(18, 'PROCESSING-INTEGRITY', 'PROC-T18-CCR-HANDOFF', ['PROC-T18-CCR-HANDOFF'], predecessor('slice_terminal', 'PROC-T18-REPORT')),
  slice(19, 'PROCESSING-INTEGRITY', 'PROC-T18-BZR-HANDOFF', ['PROC-T18-BZR-HANDOFF'], predecessor('slice_terminal', 'PROC-T18-CCR-HANDOFF')),
  slice(20, 'FINAL-VALIDATION', 'FINAL-VALIDATION-CONTROL', ['FINAL-VALIDATION-CONTROL', 'PRODUCT_PAYLOAD_MANIFEST', 'UAT_ARTIFACT_BINDING', 'EXTERNAL_FINAL_ATTESTATION', 'STATUS_PROJECTION_PUBLICATION', 'DURABLE_CAMPAIGN_INDEX'], predecessor('boundary_terminal', 'PROCESSING-INTEGRITY'))
]
const DOWNSTREAM_PROTOCOL_POLICY = { schemaVersions: { workspaceDisposition: 'PROGRAM-SLICE-WORKSPACE-DISPOSITION-V1' }, gateP: { afterSlice: 'WF2-P7-MANIFEST', classification: 'repository_non_mutating_boundary_completion_observation', mutationAuthority: false }, sliceAdmission: { descriptorArms: [{ kind: 'mandatory_catalog_row', source: 'programAtomicSlices' }, { kind: 'optional_final_validation_closure', boundaryId: 'FINAL-VALIDATION', source: 'finalValidationPolicy.closure' }], descriptorAuthority: 'validated_static_program_index_only', callerSuppliedSliceIdOrDescriptor: 'forbidden', validationPhaseAsMutationSlice: 'forbidden' }, workspaceDisposition: { decisions: ['retain_same_workspace', 'dispose_to_main_only'], automaticCleanup: false, disposalOrder: ['preserve_external', 'remove_exact_worktree', 'delete_exact_local_ref', 'verify_main_only'] } }
const DEFERRED_CAPABILITIES = [
  { id: 'WF2-R3-WINDOWS-ADAPTER', disposition: 'conditional', hardDependsOn: ['WF2-R2-INVOKE'], sequenceAfter: ['FINAL-VALIDATION'], requiredSpecIdentity: 'WF2-R3-WINDOWS-ADAPTER-DESIGN@1' },
  { id: 'WF2-R3-ARTIFACT-TX', disposition: 'conditional', hardDependsOn: ['WF2-R2-INVOKE', 'WF2-R3-WINDOWS-ADAPTER'], sequenceAfter: ['FINAL-VALIDATION'] },
  { id: 'WF2-R4-EXECUTOR', disposition: 'conditional', hardDependsOn: ['WF2-R3-ARTIFACT-TX'], sequenceAfter: ['FINAL-VALIDATION'] },
  { id: 'WF2-R5-BOB', disposition: 'conditional', hardDependsOn: ['WF2-R4-EXECUTOR', 'BASE-WF2-F7-BOB-PROFILE'], sequenceAfter: ['FINAL-VALIDATION'] },
  { id: 'WF2-R6-ARCHIVED', disposition: 'rejected_current_snapshot', hardDependsOn: [] }
]
const IMMUTABLE_ARCHIVES = [{ root: 'C:\\Users\\stell\\source\\archives\\bob_builtin_analyze\\2026-08-21-main-consolidation', manifestSha256: '36e477ee9b752ebf7f07a208c166fec24e14a89bf7ba6a7921cf6bdf708c9f31' }, { root: 'C:\\Users\\stell\\source\\archives\\bob_builtin_analyze\\2026-08-22-local-worktree-cleanup', manifestSha256: 'ad742f4dbd2112c5674da2e3e0ee2046645849e4b3bf3674596df3b868c8bdff' }, { root: 'C:\\Users\\stell\\source\\archives\\bob_builtin_analyze\\2026-08-22-remote-main-unification', manifestSha256: 'bcdb61aad397ef4c6463eaa789d5d278b9d1bcad34015bc472c1dfc97773e476' }]
const TRUST_CHAIN_IDENTITIES = [{ id: 'original-repository-bundle', sha256: '55db2865e7795d9192e75bfb3dbaadc47d28366128c241edda512aef4ca599a1' }, { id: 'carrier-manifest', sha256: 'ac5f4e94602e355828a6596be8ab9107f4f34677f0014d97f92eb960ffa539b4' }, { id: 'local-cleanup-bundle', sha256: 'e0e6fd92f1d7504c3271c01b0eae3542d3562a9214b8164957e19b56ac48dc40' }, { id: 'remote-cleanup-execution-plan', sha256: '9e36b465afbba6826556e4d7347ca1c7cb805bdb6280c77cceb15f6479046c8d' }, { id: 'remote-cleanup-execution-result', sha256: '3ba79a5536d18dc0fc9ec15ffe41ca6cd37c527f5dd30f02aba4ea399c6faed7' }, { id: 'remote-recovery-bundle', sha256: '06a338f28879218a8cbae247a3b4c5b951f152cd46caca4d81b7b07504cfbf1f' }]
const CARRIER_PATCH_IDENTITIES = [{ id: 'workflow-b', sha256: '59eca51331f3c580a63435021e03c05780ffbe6b65db76949cb0d4bff8c428c7' }, { id: 'workflow-c', sha256: '2852e9e0e535bbb63165ae01538dd271bd888afe0b7f7dcbca53d193ef24912f' }, { id: 'processing-a', sha256: '6913ddddcffb150eb207aee99bdbbad158b4ed05e9c3ca8714693d31f6122536' }, { id: 'processing-b', sha256: 'edd675378aa15650b5648308ae1f7621fa830844699ad4d06660463c9d2cb10b' }, { id: 'processing-c', sha256: '294c11760ed94bdddec8f37f6f9517f42f7e9c6442ad23df6041ff9f470bbab5' }]
const STATIC_ARTIFACT_PATHS = [{ path: 'tools/main-consolidation/feature-integration-program-index.json', earliestBoundary: 'WAVE-0A-CONTROL-PLANE' }, { path: 'tools/main-consolidation/exact-head-ci-contract.json', earliestBoundary: 'WAVE-0A-CONTROL-PLANE' }, { path: 'tools/main-consolidation/feature-selection-source-universe.json', earliestBoundary: 'WAVE-0B-SELECTION-LEDGER' }, { path: 'docs/release-evidence/feature-selection-ledger-2026-08-23.json', earliestBoundary: 'WAVE-0B-SELECTION-LEDGER' }, { path: 'docs/release-evidence/feature-selection-ledger-2026-08-23.md', earliestBoundary: 'WAVE-0B-SELECTION-LEDGER' }, { path: 'docs/release-evidence/feature-integration-status.json', earliestBoundary: 'WAVE-0B-SELECTION-LEDGER' }]

function deepFreeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { for (const child of Object.values(value)) deepFreeze(child); Object.freeze(value) } return value }
for (const oracle of [GOVERNANCE, BASELINE_PREREQUISITES, PROGRAM_BOUNDARIES, PROGRAM_ATOMIC_SLICES, DOWNSTREAM_PROTOCOL_POLICY, DEFERRED_CAPABILITIES, IMMUTABLE_ARCHIVES, TRUST_CHAIN_IDENTITIES, CARRIER_PATCH_IDENTITIES, STATIC_ARTIFACT_PATHS]) deepFreeze(oracle)
const cloneOracle = (value) => structuredClone(value)

function compareCodePoints(left, right) { const a = Array.from(left, (character) => character.codePointAt(0)); const b = Array.from(right, (character) => character.codePointAt(0)); for (let index = 0; index < Math.min(a.length, b.length); index += 1) if (a[index] !== b[index]) return a[index] - b[index]; return a.length - b.length }
export function canonicalJson(value) {
  const ancestors = new Set()
  function render(current) {
    if (current === null) return 'null'
    if (typeof current === 'boolean') return current ? 'true' : 'false'
    if (typeof current === 'string') return JSON.stringify(current.normalize('NFC'))
    if (typeof current === 'number') { if (!Number.isSafeInteger(current)) throw new TypeError('noncanonical number'); return Object.is(current, -0) ? '0' : String(current) }
    if (typeof current !== 'object') throw new TypeError('unsupported JSON value')
    if (ancestors.has(current)) throw new TypeError('cyclic JSON value')
    if (Reflect.ownKeys(current).some((key) => typeof key === 'symbol')) throw new TypeError('symbol key')
    ancestors.add(current)
    try {
      if (Array.isArray(current)) {
        const ownKeys = Reflect.ownKeys(current); const expectedKeys = Array.from({ length: current.length }, (_, index) => String(index)).concat('length')
        if (ownKeys.length !== expectedKeys.length || expectedKeys.some((key) => !ownKeys.includes(key))) throw new TypeError('sparse or extended array')
        return `[${expectedKeys.slice(0, -1).map((key) => { const descriptor = Object.getOwnPropertyDescriptor(current, key); if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) throw new TypeError('accessor or hidden array item'); return render(descriptor.value) }).join(',')}]`
      }
      const prototype = Object.getPrototypeOf(current); if (prototype !== null && prototype !== Object.prototype) throw new TypeError('non-plain object')
      const entries = Object.entries(Object.getOwnPropertyDescriptors(current)).map(([key, descriptor]) => { if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw new TypeError('accessor or hidden property'); return [key.normalize('NFC'), descriptor] })
      if (new Set(entries.map(([key]) => key)).size !== entries.length) throw new TypeError('duplicate normalized key')
      entries.sort(([left], [right]) => compareCodePoints(left, right)); return `{${entries.map(([key, descriptor]) => `${JSON.stringify(key)}:${render(descriptor.value)}`).join(',')}}`
    } finally { ancestors.delete(current) }
  }
  return Buffer.from(`${render(value)}\n`, 'utf8')
}
function assertExactKeys(value, keys, label = 'record') { if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`invalid ${label}`); const actual = Object.keys(value); if (actual.length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) throw new TypeError(`${label} exact keys mismatch`) }
function assertCanonicalOracle(actual, expected, label) { if (!canonicalJson(actual).equals(canonicalJson(expected))) throw new TypeError(`${label} oracle mismatch`) }
function assertExactBaselinePrerequisites(actual, expected) { assertCanonicalOracle(actual, expected, 'baseline prerequisite') }
function assertExactProgramAtomicSlices(actual, expected) { assertCanonicalOracle(actual, expected, 'program atomic slices') }
function assertExactDownstreamProtocolPolicy(actual, expected) { assertCanonicalOracle(actual, expected, 'downstream protocol policy') }
function assertExactDeferredCapabilities(actual, expected) { assertCanonicalOracle(actual, expected, 'deferred capabilities') }
function assertExactGovernance(actual) { assertCanonicalOracle(actual, GOVERNANCE, 'governance') }
function rejectForbiddenDynamicKeysRecursively(value, ancestors = new Set()) { if (value === null || typeof value !== 'object') return; if (ancestors.has(value)) return; ancestors.add(value); for (const key of Object.keys(value)) { if (FORBIDDEN_DYNAMIC_KEYS.has(key)) throw new TypeError(`dynamic field ${key}`); rejectForbiddenDynamicKeysRecursively(value[key], ancestors) }; ancestors.delete(value) }
function rejectLegacyAuthorizationRecursively(value, ancestors = new Set()) {
  if (value === null || typeof value !== 'object') return
  if (ancestors.has(value)) return
  ancestors.add(value)
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_LEGACY_AUTHORIZATION_TOKENS.has(key) || (typeof child === 'string' && FORBIDDEN_LEGACY_AUTHORIZATION_TOKENS.has(child))) throw new TypeError(`legacy authorization ${key}`)
    rejectLegacyAuthorizationRecursively(child, ancestors)
  }
  ancestors.delete(value)
}
function assertAcyclicDependencies(prerequisites, boundaries, slices, capabilities) {
  const nodes = new Map(); for (const row of [...prerequisites, ...boundaries, ...slices, ...capabilities]) nodes.set(row.id ?? row.sliceId, row.hardDependsOn ?? [])
  const visiting = new Set(); const visited = new Set(); const visit = (id) => { if (visiting.has(id)) throw new TypeError('dependency cycle'); if (visited.has(id)) return; if (!nodes.has(id)) throw new TypeError('undeclared dependency'); visiting.add(id); for (const dependency of nodes.get(id)) visit(dependency); visiting.delete(id); visited.add(id) }; for (const id of nodes.keys()) visit(id)
}
function assertExactArchiveAndTrustIdentities(index) { assertCanonicalOracle(index.immutableArchives, IMMUTABLE_ARCHIVES, 'immutable archives'); assertCanonicalOracle(index.trustChainIdentities, TRUST_CHAIN_IDENTITIES, 'trust chain identities'); assertCanonicalOracle(index.carrierPatchIdentities, CARRIER_PATCH_IDENTITIES, 'carrier patch identities') }
function assertExactStaticArtifactPaths(index) { assertCanonicalOracle(index.staticArtifactPaths, STATIC_ARTIFACT_PATHS, 'static artifact paths') }

export function buildProgramIndex() { return { schemaVersion: SCHEMA, programId: 'feature-selection-and-sequential-main-integration', repository: REPOSITORY, planningBaselineMainSha: BASELINE, governance: cloneOracle(GOVERNANCE), baselinePrerequisites: cloneOracle(BASELINE_PREREQUISITES), planBoundaries: cloneOracle(PROGRAM_BOUNDARIES), programAtomicSlices: cloneOracle(PROGRAM_ATOMIC_SLICES), downstreamProtocolPolicy: cloneOracle(DOWNSTREAM_PROTOCOL_POLICY), deferredCapabilities: cloneOracle(DEFERRED_CAPABILITIES), immutableArchives: cloneOracle(IMMUTABLE_ARCHIVES), trustChainIdentities: cloneOracle(TRUST_CHAIN_IDENTITIES), carrierPatchIdentities: cloneOracle(CARRIER_PATCH_IDENTITIES), staticArtifactPaths: cloneOracle(STATIC_ARTIFACT_PATHS) } }
export function validateProgramIndex(index) {
  canonicalJson(index); rejectForbiddenDynamicKeysRecursively(index); rejectLegacyAuthorizationRecursively(index); assertExactKeys(index, PROGRAM_INDEX_KEYS, 'program index')
  if (index.schemaVersion !== SCHEMA || index.programId !== 'feature-selection-and-sequential-main-integration' || index.repository !== REPOSITORY || index.planningBaselineMainSha !== BASELINE) throw new TypeError('program index fixed value mismatch')
  assertExactGovernance(index.governance); assertExactBaselinePrerequisites(index.baselinePrerequisites, BASELINE_PREREQUISITES); assertCanonicalOracle(index.planBoundaries, PROGRAM_BOUNDARIES, 'plan boundaries'); assertExactProgramAtomicSlices(index.programAtomicSlices, PROGRAM_ATOMIC_SLICES); assertExactDownstreamProtocolPolicy(index.downstreamProtocolPolicy, DOWNSTREAM_PROTOCOL_POLICY); assertExactDeferredCapabilities(index.deferredCapabilities, DEFERRED_CAPABILITIES); assertAcyclicDependencies(index.baselinePrerequisites, index.planBoundaries, index.programAtomicSlices, index.deferredCapabilities); assertExactArchiveAndTrustIdentities(index); assertExactStaticArtifactPaths(index); return structuredClone(index)
}
