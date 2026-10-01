import { buildProgramIndex, canonicalJson, validateProgramIndex } from './featureIntegrationProgramPolicy.mjs'
import { digest, same, validateSourceUniverse, SOURCE_UNIVERSE_SHA256 } from './featureSelectionSourcePolicy.mjs'

const SPEC = 'FEATURE-SELECTION-AND-SEQUENTIAL-MAIN-INTEGRATION@2026-08-23'
const defs = [
  ['WAVE-0B-SELECTION-LEDGER', [], ['WAVE-0A-CONTROL-PLANE'], '履歴所有と採否を固定し、検証済み観測を表示する。', ['no_product_runtime_change', 'ONE_ACTIVE_SLICE', 'ONE_CONTINUOUS_SLICE_WORKSPACE'], ['legacy_authorization', 'runtime_activation']],
  ['WF2-P4-COMPILER', ['BASE-WF2-A'], [], 'immutable bytesを唯一のcompilerへ渡す。', ['SOLE_IMMUTABLE_COMPILER', 'no_provider_lookup'], ['alternate_compiler']],
  ['WF2-P5-PLANSTORE', ['WF2-P4-COMPILER'], [], '環境別private cacheとruntime-only leaseを管理する。', ['exact_environment_identity', 'runtime_only_lease'], ['persisted_lease']],
  ['WF2-P6-ENTRYPOINT', ['WF2-P4-COMPILER','WF2-P5-PLANSTORE'], [], 'validation・registration・Bob操作ハブを共通gatewayへ接続する。', ['MAX_SHADOW', 'FAIL_CLOSED', 'NO_SAME_SLOT_LEGACY_FALLBACK', 'existing_v1_commands_preserved'], ['product_provider_dispatch', 'workspace_activation_switch']],
  ['WF2-P7-MANIFEST', ['WF2-P4-COMPILER','WF2-P5-PLANSTORE','WF2-P6-ENTRYPOINT'], [], 'explicit collection/catalogからcross-platform manifestを生成する。', ['immutable_bytes', 'deterministic_manifest'], ['manual_provider_catalog']],
  ['GATE-R-ARCHIVE-INVENTORY', ['WF2-P7-MANIFEST'], ['GATE-WF2-P'], 'archive上のruntime payload全体を棚卸しする。', ['archive_read_only', 'complete_inventory'], ['payload_activation']],
  ['GATE-R-ACTIVE-MANIFEST', ['GATE-R-ARCHIVE-INVENTORY'], [], 'active pathがないことを明示するmanifestを作る。', ['active_runtime_path_zero'], ['archived_runtime_payload']],
  ['GATE-R-VALIDATOR', ['GATE-R-ACTIVE-MANIFEST'], [], 'inventoryとactive manifestをclosed schemaで検査する。', ['fail_closed', 'unknown_payload_rejected'], ['runtime_mutation_authority']],
  ['GATE-R-RUNNER', ['GATE-R-VALIDATOR'], [], 'Gate Rの検査を再実行可能なread-only runnerへ接続する。', ['repository_non_mutating'], ['provider_dispatch']],
  ['WF2-R1-PROVENANCE', ['WF2-P7-MANIFEST'], ['GATE-WF2-P'], 'exact plan/package/lock/environment/provider/Bob provenanceとlease lifetimeを束ねる。', ['exact_provenance', 'runtime_only_lease'], ['restart_restore']],
  ['WF2-R2-INVOKE', ['WF2-R1-PROVENANCE'], [], 'private dispatch bridgeでbounded input/output/errorを検査する。', ['PRODUCT_REACHABILITY_ZERO', 'bounded_provider_io'], ['product_run_directory', 'artifact_staging']],
  ['REG-BRIDGE-OWNER-VERSION-LIFECYCLE', ['WF2-P6-ENTRYPOINT'], ['WF2-R2-INVOKE'], 'strict owner/version/lifecycleを既存Contract v2 registryへ一本化する。', ['one_owned_registry_per_action_registry', 'atomic_duplicate_rejection', 'stale_disposable_safe', 'three_extension_activation_converges'], ['duplicate_registry', 'long_lived_legacy_adapter']],
  ['REG-BRIDGE-DISCOVERY-EVIDENCE', ['WF2-P4-COMPILER','WF2-P7-MANIFEST','REG-BRIDGE-OWNER-VERSION-LIFECYCLE'], [], '同一immutable bytes/catalogからdiscovery/report evidenceを生成する。', ['ubuntu_windows_same_evidence', 'no_legacy_compiler'], ['legacy_dynamic_gate', 'manual_catalog']],
  ['PROC-T13-LEDGER', [], ['REG-BRIDGE-DISCOVERY-EVIDENCE'], 'canonical 13-category profileとatomic budget ledgerを導入する。', ['canonical_13_categories', 'atomic_reservations', 'current_bazaar_profile_override'], ['archived_default_product_limits']],
  ['PROC-T14-BOUNDED-DOC', ['PROC-T13-LEDGER','BASE-OOXML-SNAPSHOT'], [], '現行Buffer snapshotをshared境界へ接続しCCRをbounded Buffer inputへ移行する。', ['BASE_OOXML_SNAPSHOT_PARITY', 'CURRENT_GUI_DIAGNOSTIC_PARITY', 'buffer_input_only'], ['legacy_bazaar_docx_xlsx_parser', 'path_parser_input']],
  ['PROC-T15-AGGREGATE', ['PROC-T14-BOUNDED-DOC'], [], 'workbook/document local/operation capとpre-parser cancellationを導入する。', ['pre_parser_cancellation', 'atomic_aggregate_cap'], ['post_parser_only_budget_test']],
  ['PROC-T16-INPUT-PROCESS', ['PROC-T13-LEDGER','PROC-T15-AGGREGATE'], [], 'stdout/stderr、diff、excerpt、Bob input、artifact、operation全体を制限する。', ['bounded_process_output', 'process_tree_settlement'], ['unbounded_input_buffer']],
  ['PROC-T17-DEADLINE', ['PROC-T14-BOUNDED-DOC','PROC-T16-INPUT-PROCESS'], [], 'absolute monotonic deadlineとauthenticated first causeを管理する。', ['ABSOLUTE_MONOTONIC_DEADLINE', 'authenticated_first_cause', 'process_tree_settlement'], ['wall_clock_deadline']],
  ['PROC-T17-PATH', ['PROC-T17-DEADLINE'], [], 'portable/physical containmentを独立して検査する。', ['PHYSICAL_PATH_CONTAINMENT', 'windows_unc_junction', 'japanese_spaces_multi_root'], ['raw_report_path_display']],
  ['PROC-T18-REPORT', ['PROC-T13-LEDGER','PROC-T14-BOUNDED-DOC','PROC-T15-AGGREGATE','PROC-T16-INPUT-PROCESS','PROC-T17-DEADLINE','PROC-T17-PATH'], [], 'strict deterministic reportをshadow比較する。', ['closed_report_schema', 'success_zero_issues_finalized_only_complete', 'REPORT_SHADOW_BEFORE_BLOCKING'], ['early_blocking_handoff']],
  ['PROC-T18-CCR-HANDOFF', ['PROC-T18-REPORT'], [], 'verified snapshotとcomplete-only handoff/rollbackを接続する。', ['verified_snapshot', 'complete_only', 'atomic_rollback'], ['incomplete_handoff']],
  ['PROC-T18-BZR-HANDOFF', ['PROC-T18-REPORT'], [], 'GUI/run failure persistenceとcomplete-only atomic replacementを接続する。', ['current_gui_diagnostics', 'complete_only', 'atomic_replacement'], ['mechanical_rule_authoring_gui_base_split']],
  ['FINAL-VALIDATION-CONTROL', ['PROC-T18-CCR-HANDOFF','PROC-T18-BZR-HANDOFF'], ['PROCESSING-INTEGRITY'], 'fixed product mainと外部attestationの検証手順を固定する。', ['fixed_product_main', 'three_vsix_same_artifact_uat', 'non_mutating_validation_phases', 'payload_identical_optional_closure'], ['self_referential_future_merge', 'automatic_cleanup']]
]
const baselines = [
  { id:'BASE-WF2-A', evidence:[{repositoryPath:'docs/release-evidence/workflow-carrier-a-merge-resolution-2026-08-22.json',blobOid:'33ec748c6b43929f26e0ceca3076f4c9ac6cf671',blobSha256:'1e7be9d9164ae1ad3d3a4935f8e24fb44b38abf9b248c39e9b27d9233177da3a'}], rationale:'受入済みWorkflow Aのschema/loader/registryを正本として維持する。' },
  { id:'BASE-OOXML-SNAPSHOT', evidence:[{repositoryPath:'docs/release-evidence/main-consolidation-inventory-2026-08-21.json',blobOid:'4b9bd95aa22ce2f13f88f604e11663be2db55dc6',blobSha256:'f21a729133e6c52e932f5c3abb58d958422f8a2a8b1ee1197e33de75913246cf'},{archiveEvidenceId:'PRA-WIN-001',archiveManifestSha256:'36e477ee9b752ebf7f07a208c166fec24e14a89bf7ba6a7921cf6bdf708c9f31',relativePath:'artifacts/pra-win-001-evidence/PRA-WIN-001-evidence.json',sha256:'2554afe6bc8ac15067d103ecb692b5c14cbe5e578336930e7c7fe5aa40bac954'}], rationale:'現行OOXML snapshot、GUI診断、PRA-WIN-001を比較基準として維持する。' }
]
function sourceOrigin(id, universe, programIndex) {
  const sourceItemIds = universe.items.filter(item => item.primaryOwner === id).map(item => item.sourceItemId)
  if (!sourceItemIds.length) return {kind:'new_design',requiredSpecIdentity:id==='WF2-R3-WINDOWS-ADAPTER'?'WF2-R3-WINDOWS-ADAPTER-DESIGN@1':SPEC,implementationSourcePolicy:'no_implementation_source_before_committed_spec_review'}
  const trancheIds = new Set(universe.items.filter(item=>item.primaryOwner===id).flatMap(item=>item.origins.map(origin=>origin.trancheId)))
  return {kind:'archive',sourceItemIds,tranches:universe.tranches.filter(row=>trancheIds.has(row.id)).map(row=>({id:row.id,fromSha:row.fromSha,toSha:row.toSha,legacyHeads:row.legacyHeads,archiveManifestSha256:programIndex.immutableArchives[0].manifestSha256,carrierPatchSha256:programIndex.carrierPatchIdentities.find(p=>p.id===row.carrierId).sha256}))}
}
const acceptance = invariants => ({RED:['prove_new_contract_failure_before_implementation'],focused:invariants,full:['all_affected_extension_tests','three_extension_quality_gates'],CI:['exact_reviewed_candidate_head','exact_merged_main_head','ubuntu_windows'],UAT:['same_hashed_vsix_for_changed_product_surfaces','final_three_extension_real_machine_uat']})
function capability(id, deps, sequence, rationale, invariants, omissions, universe, programIndex, disposition='selected', go=[]) {
  const items=universe.items.filter(item=>item.primaryOwner===id)
  return {id,sourceOrigin:sourceOrigin(id,universe,programIndex),disposition,rationale,hardDependsOn:deps,sequenceAfter:sequence,goConditionRequirement:go,approvalRequirement:disposition==='conditional'?['separate_explicit_GO','scoped_B_work','explicit_C_publication_integration']:disposition==='selected'?['scoped_B_work','explicit_C_publication_integration']:['no_implementation_admission'],maxAuthorizedActivation:disposition==='superseded'||disposition==='rejected_current_snapshot'?'inactive':id.startsWith('WF2-')||id==='PROC-T18-REPORT'?'shadow':id==='WAVE-0B-SELECTION-LEDGER'||id==='FINAL-VALIDATION-CONTROL'?'inactive':'active',productReachability:id==='WF2-R2-INVOKE'?'zero':id.startsWith('WF2-')?'separate_activation_required':disposition==='selected'?'only_after_verified_prerequisites':'zero',targetSurfaces:[...new Set(items.map(item=>item.path))].sort(),preservedInvariants:invariants,explicitOmissions:omissions,acceptanceRequirements:acceptance(invariants)}
}

export function buildSelectionLedger({ universe, programIndex }) {
  validateProgramIndex(programIndex)
  validateSourceUniverse(universe,{programIndex,archiveIdentities:programIndex.immutableArchives})
  const capabilities=defs.map(args=>capability(...args,universe,programIndex))
  for(const deferred of programIndex.deferredCapabilities) {
    const go=deferred.id==='WF2-R3-WINDOWS-ADAPTER'?['committed_spec_identity:WF2-R3-WINDOWS-ADAPTER-DESIGN@1','windows_adversarial_reparse_junction_mount_hardlink_identity_proof','no_overwrite_same_volume_atomic_flush_failure_injection','security_review','explicit_GO']:deferred.id==='WF2-R3-ARTIFACT-TX'?['windows_adapter_verified','linux_windows_artifact_transaction_parity','explicit_GO']:deferred.id==='WF2-R4-EXECUTOR'?['artifact_transaction_verified','compiled_execution_no_reparse','explicit_GO']:deferred.id==='WF2-R5-BOB'?['exact_handle_lease','real_machine_bob_profile_probe','explicit_GO']:[]
    capabilities.push(capability(deferred.id,deferred.hardDependsOn,deferred.sequenceAfter||[],deferred.id==='WF2-R6-ARCHIVED'?'restart/resume matrixと残存artifact分類が不足するためarchive snapshotを採らない。':'独立したGO条件と承認を満たした後だけ実装を検討する。',['inactive_until_separate_GO','default_shadow','no_workspace_environment_activation'],['automatic_selection_from_predecessor_merge'],universe,programIndex,deferred.disposition,go))
  }
  const remainders=[...new Set(universe.items.map(item=>item.primaryOwner))].filter(id=>!capabilities.some(cap=>cap.id===id)).sort()
  for(const id of remainders) {
    if(!id.endsWith('-REMAINDER')) throw new TypeError(`unknown semantic owner ${id}`)
    capabilities.push(capability(id,[],[],'現行mainまたはselected sliceが正本を所有する。旧実装・旧gate・旧payloadを移植しない。',['current_main_authoritative'],['all_owned_historical_implementation'],universe,programIndex,'superseded'))
  }
  const baselineRows=[...baselines,{id:'BASE-WF2-F7-BOB-PROFILE',evidence:[programIndex.baselinePrerequisites[0].authorityEvidence],rationale:'F7 Bob profile/probeの受入済み証拠。実機GOには後続証拠も必要。'}]
  for(const baseline of baselineRows) {
    const row=capability(baseline.id,[],[],baseline.rationale,['current_main_authoritative'],['archived_duplicate'],universe,programIndex,'superseded')
    row.sourceOrigin={kind:'current_main',baselineMainSha:programIndex.planningBaselineMainSha,evidenceId:baseline.id,evidence:baseline.evidence}
    capabilities.push(row)
  }
  return structuredClone({schemaVersion:'bob-builtin-analyze/feature-selection-ledger/v1',repository:programIndex.repository,planningBaselineMainSha:programIndex.planningBaselineMainSha,sourceUniverseSha256:SOURCE_UNIVERSE_SHA256,archiveIdentities:programIndex.immutableArchives,trustChainIdentities:programIndex.trustChainIdentities,carrierPatchIdentities:programIndex.carrierPatchIdentities,topologyObservation:{kind:'pre_execution_readback',observedAt:'2026-10-01T13:56:29.0871872+00:00',mainSha:'ec136225bf2737a2f2c8053dce69d3acb6f4be3d',remoteBranches:['main'],openPullRequestCount:0},gates:[{id:'WAVE-0A-CONTROL-PLANE',kind:'completion_observation'},{id:'GATE-WF2-P',kind:'completion_observation',programBoundaryId:'WORKFLOW-B-GATE-P',afterSlice:'WF2-P7-MANIFEST'},{id:'PROCESSING-INTEGRITY',kind:'completion_observation'},{id:'FINAL-VALIDATION',kind:'completion_observation'}],capabilities,sourceItems:universe.items.map(item=>({sourceItemId:item.sourceItemId,primaryOwner:item.primaryOwner,disposition:capabilities.find(cap=>cap.id===item.primaryOwner).disposition})),runtimePolicy:{defaultActivation:'inactive',workflowMaximum:'shadow',r2ProductReachability:'zero',conditionalAutoSelection:false,mutationAuthority:false}})
}

export function validateSelectionLedger(ledger, context) {
  // The approved decision catalog is the oracle; neither a digest supplied by
  // the caller nor a rewritten dependency list can redefine this partition.
  same(ledger,buildSelectionLedger(context),'static selection ledger')
  const ids=new Set(ledger.capabilities.map(cap=>cap.id)); const gates=new Set(ledger.gates.map(gate=>gate.id))
  for(const cap of ledger.capabilities) {
    if(cap.hardDependsOn.some(id=>!ids.has(id))||cap.sequenceAfter.some(id=>!ids.has(id)&&!gates.has(id))) throw new TypeError('unresolved dependency')
  }
}
const md = value => String(value).replaceAll('|','\\|').replaceAll('\n',' ')
export function renderSelectionLedgerMarkdown(ledger) {
  const lines=['# Feature selection ledger — 2026-08-23','',`Planning baseline: \`${ledger.planningBaselineMainSha}\``, `Source universe SHA-256: \`${ledger.sourceUniverseSha256}\``, '', '静的な採否・依存・受入要件。実際の完了とactivationは別status projectionで示す。', '', '| Capability | Origin | Disposition | Hard dependencies | Sequence after | Maximum activation |', '| --- | --- | --- | --- | --- | --- |']
  for(const cap of ledger.capabilities) lines.push(`| ${[cap.id,cap.sourceOrigin.kind,cap.disposition,cap.hardDependsOn.join(', '),cap.sequenceAfter.join(', '),cap.maxAuthorizedActivation].map(md).join(' | ')} |`)
  for(const cap of ledger.capabilities) {
    lines.push('',`## ${cap.id}`,'',cap.rationale,'',`- Source: \`${md(canonicalJson(cap.sourceOrigin).toString('utf8').trim())}\``,`- GO requirements: ${cap.goConditionRequirement.map(md).join('; ')||'none beyond normal slice prerequisites'}`,`- Approval requirements: ${cap.approvalRequirement.map(md).join('; ')}`,`- Product reachability: ${cap.productReachability}`,`- Preserved invariants: ${cap.preservedInvariants.map(md).join('; ')}`,`- Explicit omissions: ${cap.explicitOmissions.map(md).join('; ')}`,`- Target surfaces: ${cap.targetSurfaces.map(md).join('; ')||'control/evidence only'}`)
    for(const [kind,requirements] of Object.entries(cap.acceptanceRequirements).sort(([a],[b])=>a<b?-1:a>b?1:0)) lines.push(`- ${kind}: ${requirements.map(md).join('; ')}`)
  }
  lines.push('','## Source item partition','','| Source item | Primary owner | Disposition |','| --- | --- | --- |')
  for(const item of ledger.sourceItems) lines.push(`| ${item.sourceItemId} | ${item.primaryOwner} | ${item.disposition} |`)
  return Buffer.from(`${lines.join('\n')}\n`)
}
export function checkSelectionLedgerArtifacts({ledgerBytes,markdownBytes,universe,programIndex}) {
  const ledger=JSON.parse(ledgerBytes)
  validateSelectionLedger(ledger,{universe,programIndex})
  if(!Buffer.from(ledgerBytes).equals(canonicalJson(ledger))||!Buffer.from(markdownBytes).equals(renderSelectionLedgerMarkdown(ledger))) throw new TypeError('selection ledger bytes drift')
}
