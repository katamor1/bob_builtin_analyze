# Feature selection ledger — 2026-08-23

Planning baseline: `c59db06ecb32eb7a57beeb3e932acdd5b4774de5`
Source universe SHA-256: `c69adc6b82d1d6d40719e10c116e985890f17d45ee4b99e0feabe76b00d08c79`

静的な採否・依存・受入要件。実際の完了とactivationは別status projectionで示す。

| Capability | Origin | Disposition | Hard dependencies | Sequence after | Maximum activation |
| --- | --- | --- | --- | --- | --- |
| WAVE-0B-SELECTION-LEDGER | new_design | selected |  | WAVE-0A-CONTROL-PLANE | inactive |
| WF2-P4-COMPILER | archive | selected | BASE-WF2-A |  | shadow |
| WF2-P5-PLANSTORE | archive | selected | WF2-P4-COMPILER |  | shadow |
| WF2-P6-ENTRYPOINT | archive | selected | WF2-P4-COMPILER, WF2-P5-PLANSTORE |  | shadow |
| WF2-P7-MANIFEST | archive | selected | WF2-P4-COMPILER, WF2-P5-PLANSTORE, WF2-P6-ENTRYPOINT |  | shadow |
| GATE-R-ARCHIVE-INVENTORY | new_design | selected | WF2-P7-MANIFEST | GATE-WF2-P | active |
| GATE-R-ACTIVE-MANIFEST | new_design | selected | GATE-R-ARCHIVE-INVENTORY |  | active |
| GATE-R-VALIDATOR | new_design | selected | GATE-R-ACTIVE-MANIFEST |  | active |
| GATE-R-RUNNER | new_design | selected | GATE-R-VALIDATOR |  | active |
| WF2-R1-PROVENANCE | archive | selected | WF2-P7-MANIFEST | GATE-WF2-P | shadow |
| WF2-R2-INVOKE | archive | selected | WF2-R1-PROVENANCE |  | shadow |
| REG-BRIDGE-OWNER-VERSION-LIFECYCLE | archive | selected | WF2-P6-ENTRYPOINT | WF2-R2-INVOKE | active |
| REG-BRIDGE-DISCOVERY-EVIDENCE | archive | selected | WF2-P4-COMPILER, WF2-P7-MANIFEST, REG-BRIDGE-OWNER-VERSION-LIFECYCLE |  | active |
| PROC-T13-LEDGER | archive | selected |  | REG-BRIDGE-DISCOVERY-EVIDENCE | active |
| PROC-T14-BOUNDED-DOC | archive | selected | PROC-T13-LEDGER, BASE-OOXML-SNAPSHOT |  | active |
| PROC-T15-AGGREGATE | archive | selected | PROC-T14-BOUNDED-DOC |  | active |
| PROC-T16-INPUT-PROCESS | archive | selected | PROC-T13-LEDGER, PROC-T15-AGGREGATE |  | active |
| PROC-T17-DEADLINE | archive | selected | PROC-T14-BOUNDED-DOC, PROC-T16-INPUT-PROCESS |  | active |
| PROC-T17-PATH | archive | selected | PROC-T17-DEADLINE |  | active |
| PROC-T18-REPORT | archive | selected | PROC-T13-LEDGER, PROC-T14-BOUNDED-DOC, PROC-T15-AGGREGATE, PROC-T16-INPUT-PROCESS, PROC-T17-DEADLINE, PROC-T17-PATH |  | shadow |
| PROC-T18-CCR-HANDOFF | archive | selected | PROC-T18-REPORT |  | active |
| PROC-T18-BZR-HANDOFF | archive | selected | PROC-T18-REPORT |  | active |
| FINAL-VALIDATION-CONTROL | new_design | selected | PROC-T18-CCR-HANDOFF, PROC-T18-BZR-HANDOFF | PROCESSING-INTEGRITY | inactive |
| WF2-R3-WINDOWS-ADAPTER | new_design | conditional | WF2-R2-INVOKE | FINAL-VALIDATION | shadow |
| WF2-R3-ARTIFACT-TX | archive | conditional | WF2-R2-INVOKE, WF2-R3-WINDOWS-ADAPTER | FINAL-VALIDATION | shadow |
| WF2-R4-EXECUTOR | archive | conditional | WF2-R3-ARTIFACT-TX | FINAL-VALIDATION | shadow |
| WF2-R5-BOB | archive | conditional | WF2-R4-EXECUTOR, BASE-WF2-F7-BOB-PROFILE | FINAL-VALIDATION | shadow |
| WF2-R6-ARCHIVED | archive | rejected_current_snapshot |  |  | inactive |
| PROC-ARCHIVED-IMPLEMENTATION-REMAINDER | archive | superseded |  |  | inactive |
| REG-P1-PREREQUISITE-REMAINDER | archive | superseded |  |  | inactive |
| WF2-B-BASELINE-LOCK-SYNC-REMAINDER | archive | superseded |  |  | inactive |
| WF2-B-HISTORICAL-DOC-REMAINDER | archive | superseded |  |  | inactive |
| BASE-WF2-A | current_main | superseded |  |  | inactive |
| BASE-OOXML-SNAPSHOT | current_main | superseded |  |  | inactive |
| BASE-WF2-F7-BOB-PROFILE | current_main | superseded |  |  | inactive |

## WAVE-0B-SELECTION-LEDGER

履歴所有と採否を固定し、検証済み観測を表示する。

- Source: `{"implementationSourcePolicy":"no_implementation_source_before_committed_spec_review","kind":"new_design","requiredSpecIdentity":"FEATURE-SELECTION-AND-SEQUENTIAL-MAIN-INTEGRATION@2026-08-23"}`
- GO requirements: none beyond normal slice prerequisites
- Approval requirements: scoped_B_work; explicit_C_publication_integration
- Product reachability: only_after_verified_prerequisites
- Preserved invariants: no_product_runtime_change; ONE_ACTIVE_SLICE; ONE_CONTINUOUS_SLICE_WORKSPACE
- Explicit omissions: legacy_authorization; runtime_activation
- Target surfaces: control/evidence only
- CI: exact_reviewed_candidate_head; exact_merged_main_head; ubuntu_windows
- RED: prove_new_contract_failure_before_implementation
- UAT: same_hashed_vsix_for_changed_product_surfaces; final_three_extension_real_machine_uat
- focused: no_product_runtime_change; ONE_ACTIVE_SLICE; ONE_CONTINUOUS_SLICE_WORKSPACE
- full: all_affected_extension_tests; three_extension_quality_gates

## WF2-P4-COMPILER

immutable bytesを唯一のcompilerへ渡す。

- Source: `{"kind":"archive","sourceItemIds":["source-0cf0e1be0378d8d47d574ce7","source-169a3c501c107418bfb84330","source-1cfe3b722312aa3ebb399cca","source-1ed1c6c31fee5eb4edf09757","source-2049d531d13f77f1a6241507","source-211bd833b0682ef0fa642984","source-21e1028b3969abfb77ed2b2c","source-40739e59ed46d2e99caf17db","source-4c7b24ff190c560443c24d6c","source-68f5463300aecabb2ee9a102","source-6cfca7a5d4d2ee4214050c87","source-73fac3b407195c97a05d729c","source-767f35e7bd80060d344901b0","source-78f752cc0e5f73accb3136e0","source-79e4eb6fc7765cd1fd77e404","source-7efd822b4a76ff101a014c32","source-8824803e8ace4a3ff84a12cd","source-9cd501a3a6adc9ecd19702a7","source-9ec26de51d53744e7456932b","source-ace33ba08090fa6e5b2f7d26","source-bcda8a354f3057f49558f404","source-bd280a6ac95d7ff0d082b949","source-bebb5727accfba3061935b0b","source-bee0458df16f3bebdc583818","source-cdf137d4537fd538dbf91ffe","source-ce917f59c8241b117731f93e","source-d611ffe8c5f4eea7886a38c5","source-e3a6350764da6b82cdda693e","source-e8b58057c4615ef67af1bf85","source-edd501db0565ffbac6ca0b45"],"tranches":[{"archiveManifestSha256":"36e477ee9b752ebf7f07a208c166fec24e14a89bf7ba6a7921cf6bdf708c9f31","carrierPatchSha256":"59eca51331f3c580a63435021e03c05780ffbe6b65db76949cb0d4bff8c428c7","fromSha":"683e794eb4a39eea7bc3630bedbd2a557f4af8af","id":"workflow-b","legacyHeads":[{"baseSha":"683e794eb4a39eea7bc3630bedbd2a557f4af8af","headSha":"e0766f9448033688964fabbcfa6ae73b3d849ed0","kind":"closed_pull_request","originalBundleHead":"e0766f9448033688964fabbcfa6ae73b3d849ed0","pullRequestNumber":153,"recoveryBundleHead":"e0766f9448033688964fabbcfa6ae73b3d849ed0","ref":"refs/remotes/origin/codex/workflow-contract-v2-p4"},{"baseSha":"e0766f9448033688964fabbcfa6ae73b3d849ed0","headSha":"45260e0b5a96e50bf01b820b71103b33f2067d8c","kind":"closed_pull_request","originalBundleHead":"45260e0b5a96e50bf01b820b71103b33f2067d8c","pullRequestNumber":154,"recoveryBundleHead":"45260e0b5a96e50bf01b820b71103b33f2067d8c","ref":"refs/remotes/origin/codex/workflow-contract-v2-p5"},{"baseSha":"45260e0b5a96e50bf01b820b71103b33f2067d8c","headSha":"95d245ce2eba9ac1412038afe96dc509bd6735de","kind":"closed_pull_request","originalBundleHead":"95d245ce2eba9ac1412038afe96dc509bd6735de","pullRequestNumber":155,"recoveryBundleHead":"95d245ce2eba9ac1412038afe96dc509bd6735de","ref":"refs/remotes/origin/codex/workflow-contract-v2-p6"},{"baseSha":"95d245ce2eba9ac1412038afe96dc509bd6735de","headSha":"e860d1ebbafe7068fc6871b16c9586a11b4fe19d","kind":"closed_pull_request","originalBundleHead":"e860d1ebbafe7068fc6871b16c9586a11b4fe19d","pullRequestNumber":157,"recoveryBundleHead":"e860d1ebbafe7068fc6871b16c9586a11b4fe19d","ref":"refs/remotes/origin/codex/workflow-contract-v2-p7"}],"toSha":"e860d1ebbafe7068fc6871b16c9586a11b4fe19d"}]}`
- GO requirements: none beyond normal slice prerequisites
- Approval requirements: scoped_B_work; explicit_C_publication_integration
- Product reachability: separate_activation_required
- Preserved invariants: SOLE_IMMUTABLE_COMPILER; no_provider_lookup
- Explicit omissions: alternate_compiler
- Target surfaces: extensions/workflow-register/src/core/contractV2/compiledPlan.ts; extensions/workflow-register/src/core/contractV2/compiler.ts; extensions/workflow-register/src/core/contractV2/compilerBindings.ts; extensions/workflow-register/src/core/contractV2/compilerEnvironment.ts; extensions/workflow-register/src/core/contractV2/compilerFiles.ts; extensions/workflow-register/src/core/contractV2/compilerReferences.ts; extensions/workflow-register/src/core/contractV2/compilerSchemaRoles.ts; extensions/workflow-register/src/core/contractV2/compilerWorkflow.ts; extensions/workflow-register/src/core/contractV2/index.ts; extensions/workflow-register/src/core/contractV2/jsonSchemaCatalog.ts; extensions/workflow-register/src/core/contractV2/jsonSchemaRole.ts; extensions/workflow-register/test/fixtures/workflow-contract-v2/compiler/valid-source/files.json; extensions/workflow-register/test/workflowContractV2Compiler.test.js; extensions/workflow-register/test/workflowContractV2CompilerCoreCases.js; extensions/workflow-register/test/workflowContractV2CompilerEnvironmentCases.js; extensions/workflow-register/test/workflowContractV2CompilerEnvironmentHardeningCases.js; extensions/workflow-register/test/workflowContractV2CompilerPipelineCases.js; extensions/workflow-register/test/workflowContractV2CompilerPlanCases.js; extensions/workflow-register/test/workflowContractV2CompilerPredicateCases.js; extensions/workflow-register/test/workflowContractV2CompilerProviderCases.js; extensions/workflow-register/test/workflowContractV2CompilerReferenceRoleCases.js; extensions/workflow-register/test/workflowContractV2CompilerSchemaCatalogCases.js; extensions/workflow-register/test/workflowContractV2CompilerSchemaRoleOwnershipCases.js; extensions/workflow-register/test/workflowContractV2CompilerSemanticCases.js; extensions/workflow-register/test/workflowContractV2CompilerSnapshotCases.js; extensions/workflow-register/test/workflowContractV2CompilerStagingCases.js; extensions/workflow-register/test/workflowContractV2CompilerTestSupport.js
- CI: exact_reviewed_candidate_head; exact_merged_main_head; ubuntu_windows
- RED: prove_new_contract_failure_before_implementation
- UAT: same_hashed_vsix_for_changed_product_surfaces; final_three_extension_real_machine_uat
- focused: SOLE_IMMUTABLE_COMPILER; no_provider_lookup
- full: all_affected_extension_tests; three_extension_quality_gates

## WF2-P5-PLANSTORE

環境別private cacheとruntime-only leaseを管理する。

- Source: `{"kind":"archive","sourceItemIds":["source-1921ef22a041d98667b357ee","source-2bb96ca222954ef7996b2e41","source-418c99dff76ec8aa8c971638","source-4f000b9390bc293973eefa7d","source-501ab87205e94c950750ca70","source-9d3b8054b264f92bd285309d","source-beda9c4e8baebbfbfc49b093","source-f7af99547f1c8bfbb41c9f16"],"tranches":[{"archiveManifestSha256":"36e477ee9b752ebf7f07a208c166fec24e14a89bf7ba6a7921cf6bdf708c9f31","carrierPatchSha256":"59eca51331f3c580a63435021e03c05780ffbe6b65db76949cb0d4bff8c428c7","fromSha":"683e794eb4a39eea7bc3630bedbd2a557f4af8af","id":"workflow-b","legacyHeads":[{"baseSha":"683e794eb4a39eea7bc3630bedbd2a557f4af8af","headSha":"e0766f9448033688964fabbcfa6ae73b3d849ed0","kind":"closed_pull_request","originalBundleHead":"e0766f9448033688964fabbcfa6ae73b3d849ed0","pullRequestNumber":153,"recoveryBundleHead":"e0766f9448033688964fabbcfa6ae73b3d849ed0","ref":"refs/remotes/origin/codex/workflow-contract-v2-p4"},{"baseSha":"e0766f9448033688964fabbcfa6ae73b3d849ed0","headSha":"45260e0b5a96e50bf01b820b71103b33f2067d8c","kind":"closed_pull_request","originalBundleHead":"45260e0b5a96e50bf01b820b71103b33f2067d8c","pullRequestNumber":154,"recoveryBundleHead":"45260e0b5a96e50bf01b820b71103b33f2067d8c","ref":"refs/remotes/origin/codex/workflow-contract-v2-p5"},{"baseSha":"45260e0b5a96e50bf01b820b71103b33f2067d8c","headSha":"95d245ce2eba9ac1412038afe96dc509bd6735de","kind":"closed_pull_request","originalBundleHead":"95d245ce2eba9ac1412038afe96dc509bd6735de","pullRequestNumber":155,"recoveryBundleHead":"95d245ce2eba9ac1412038afe96dc509bd6735de","ref":"refs/remotes/origin/codex/workflow-contract-v2-p6"},{"baseSha":"95d245ce2eba9ac1412038afe96dc509bd6735de","headSha":"e860d1ebbafe7068fc6871b16c9586a11b4fe19d","kind":"closed_pull_request","originalBundleHead":"e860d1ebbafe7068fc6871b16c9586a11b4fe19d","pullRequestNumber":157,"recoveryBundleHead":"e860d1ebbafe7068fc6871b16c9586a11b4fe19d","ref":"refs/remotes/origin/codex/workflow-contract-v2-p7"}],"toSha":"e860d1ebbafe7068fc6871b16c9586a11b4fe19d"}]}`
- GO requirements: none beyond normal slice prerequisites
- Approval requirements: scoped_B_work; explicit_C_publication_integration
- Product reachability: separate_activation_required
- Preserved invariants: exact_environment_identity; runtime_only_lease
- Explicit omissions: persisted_lease
- Target surfaces: extensions/workflow-register/src/core/contractV2/index.ts; extensions/workflow-register/src/core/contractV2/planLease.ts; extensions/workflow-register/src/core/contractV2/planStore.ts; extensions/workflow-register/src/core/contractV2/planStoreInput.ts; extensions/workflow-register/src/workflowRuntimeFactory.ts; extensions/workflow-register/test/workflowContractV2PlanStore.test.js; extensions/workflow-register/test/workflowContractV2PlanStoreIdentity.test.js; extensions/workflow-register/test/workflowContractV2PlanStoreRuntimeWiring.test.js
- CI: exact_reviewed_candidate_head; exact_merged_main_head; ubuntu_windows
- RED: prove_new_contract_failure_before_implementation
- UAT: same_hashed_vsix_for_changed_product_surfaces; final_three_extension_real_machine_uat
- focused: exact_environment_identity; runtime_only_lease
- full: all_affected_extension_tests; three_extension_quality_gates

## WF2-P6-ENTRYPOINT

validation・registration・Bob操作ハブを共通gatewayへ接続する。

- Source: `{"kind":"archive","sourceItemIds":["source-03f3e91bd544a8c107546b31","source-1b77ef339188f46fda20ed3f","source-200e5bffee5f7adee7265389","source-211ce0e127827b329bdc59e8","source-28fc352703ea6a0d36ba82da","source-2d5f40ef64b61e97372163c3","source-487818564a725885879bc58d","source-4ea2851958ad8182f8e6febb","source-555bdba0baee1b9d0dc5b853","source-57a458266388471a1b32856d","source-60e6fab77af45f9c2bde1ecc","source-7021229a1b36012137ed7676","source-861855ac2fa66f2a6f18da8b","source-92520c1f32f5bb800763bb5b","source-9c85d790c8430b35032bb0b3","source-a19cf56f8839f61bbf85c8a4","source-b69378eb229cf54aef34ce86","source-bcc284e4d66c136f1264b98b","source-c17b90eda53c1c3096c12b4a","source-c89e42bd9d47e129405c0284","source-ccdeaf8900368dfaf0e5f97f","source-ddbcf5073d1165cea16c732a","source-e5383e8d285f9ae1a990d45f","source-e960b66c70c58f030bd5c259","source-efeea41da424681431167d02","source-fdd3944951a97ce7698e0492"],"tranches":[{"archiveManifestSha256":"36e477ee9b752ebf7f07a208c166fec24e14a89bf7ba6a7921cf6bdf708c9f31","carrierPatchSha256":"59eca51331f3c580a63435021e03c05780ffbe6b65db76949cb0d4bff8c428c7","fromSha":"683e794eb4a39eea7bc3630bedbd2a557f4af8af","id":"workflow-b","legacyHeads":[{"baseSha":"683e794eb4a39eea7bc3630bedbd2a557f4af8af","headSha":"e0766f9448033688964fabbcfa6ae73b3d849ed0","kind":"closed_pull_request","originalBundleHead":"e0766f9448033688964fabbcfa6ae73b3d849ed0","pullRequestNumber":153,"recoveryBundleHead":"e0766f9448033688964fabbcfa6ae73b3d849ed0","ref":"refs/remotes/origin/codex/workflow-contract-v2-p4"},{"baseSha":"e0766f9448033688964fabbcfa6ae73b3d849ed0","headSha":"45260e0b5a96e50bf01b820b71103b33f2067d8c","kind":"closed_pull_request","originalBundleHead":"45260e0b5a96e50bf01b820b71103b33f2067d8c","pullRequestNumber":154,"recoveryBundleHead":"45260e0b5a96e50bf01b820b71103b33f2067d8c","ref":"refs/remotes/origin/codex/workflow-contract-v2-p5"},{"baseSha":"45260e0b5a96e50bf01b820b71103b33f2067d8c","headSha":"95d245ce2eba9ac1412038afe96dc509bd6735de","kind":"closed_pull_request","originalBundleHead":"95d245ce2eba9ac1412038afe96dc509bd6735de","pullRequestNumber":155,"recoveryBundleHead":"95d245ce2eba9ac1412038afe96dc509bd6735de","ref":"refs/remotes/origin/codex/workflow-contract-v2-p6"},{"baseSha":"95d245ce2eba9ac1412038afe96dc509bd6735de","headSha":"e860d1ebbafe7068fc6871b16c9586a11b4fe19d","kind":"closed_pull_request","originalBundleHead":"e860d1ebbafe7068fc6871b16c9586a11b4fe19d","pullRequestNumber":157,"recoveryBundleHead":"e860d1ebbafe7068fc6871b16c9586a11b4fe19d","ref":"refs/remotes/origin/codex/workflow-contract-v2-p7"}],"toSha":"e860d1ebbafe7068fc6871b16c9586a11b4fe19d"}]}`
- GO requirements: none beyond normal slice prerequisites
- Approval requirements: scoped_B_work; explicit_C_publication_integration
- Product reachability: separate_activation_required
- Preserved invariants: MAX_SHADOW; FAIL_CLOSED; NO_SAME_SLOT_LEGACY_FALLBACK; existing_v1_commands_preserved
- Explicit omissions: product_provider_dispatch; workspace_activation_switch
- Target surfaces: extensions/workflow-register/src/bobWorkflowFactory.ts; extensions/workflow-register/src/commands/validateWorkflow.ts; extensions/workflow-register/src/core/actionRegistry.ts; extensions/workflow-register/src/extension.ts; extensions/workflow-register/src/extensionWithAuthoring.ts; extensions/workflow-register/src/workflowBobTaskBinding.ts; extensions/workflow-register/src/workflowCatalogReloadCoordinator.ts; extensions/workflow-register/src/workflowContractV2Entrypoint.ts; extensions/workflow-register/src/workflowContractV2ExecutionGuard.ts; extensions/workflow-register/src/workflowContractV2Product.ts; extensions/workflow-register/src/workflowContractV2ProviderLifecycle.ts; extensions/workflow-register/src/workflowContractV2RunStateStore.ts; extensions/workflow-register/src/workflowContractV2View.ts; extensions/workflow-register/src/workflowDefinitionLoader.ts; extensions/workflow-register/src/workflowDiscovery.ts; extensions/workflow-register/src/workflowRegisterService.ts; extensions/workflow-register/src/workflowRegistrationService.ts; extensions/workflow-register/src/workflowRuntimeFactory.ts; extensions/workflow-register/test/fixtures/workflow-contract-v2/transitional-legacy-import-allowlist.json; extensions/workflow-register/test/workflowCatalogReloadCoordinator.test.js; extensions/workflow-register/test/workflowContractV2Entrypoints.test.js; extensions/workflow-register/test/workflowContractV2ExecutionBoundary.test.js; extensions/workflow-register/test/workflowContractV2ExecutionGuard.test.js; extensions/workflow-register/test/workflowContractV2ProviderLifecycle.test.js
- CI: exact_reviewed_candidate_head; exact_merged_main_head; ubuntu_windows
- RED: prove_new_contract_failure_before_implementation
- UAT: same_hashed_vsix_for_changed_product_surfaces; final_three_extension_real_machine_uat
- focused: MAX_SHADOW; FAIL_CLOSED; NO_SAME_SLOT_LEGACY_FALLBACK; existing_v1_commands_preserved
- full: all_affected_extension_tests; three_extension_quality_gates

## WF2-P7-MANIFEST

explicit collection/catalogからcross-platform manifestを生成する。

- Source: `{"kind":"archive","sourceItemIds":["source-051d3492ded4b0938c1e22d4","source-05e57d74177fec8af5afb411","source-2cd4b3ecdb06af789434147d","source-4aab19c95cc99ebe98ac9077","source-4b22735ad64dae69650013dd","source-564c1fd49aa7987997867165","source-56e4fc48d577920a309094ac","source-5b811c80c7655c7faaf05600","source-627a08e2dd90d652ebf61457","source-66c039c026623426f8667cf2","source-7eeec6df64115cc1b866f89f","source-a4145c194cf2045b2a8dee14","source-c2ea231c964bc6a6742637c4"],"tranches":[{"archiveManifestSha256":"36e477ee9b752ebf7f07a208c166fec24e14a89bf7ba6a7921cf6bdf708c9f31","carrierPatchSha256":"59eca51331f3c580a63435021e03c05780ffbe6b65db76949cb0d4bff8c428c7","fromSha":"683e794eb4a39eea7bc3630bedbd2a557f4af8af","id":"workflow-b","legacyHeads":[{"baseSha":"683e794eb4a39eea7bc3630bedbd2a557f4af8af","headSha":"e0766f9448033688964fabbcfa6ae73b3d849ed0","kind":"closed_pull_request","originalBundleHead":"e0766f9448033688964fabbcfa6ae73b3d849ed0","pullRequestNumber":153,"recoveryBundleHead":"e0766f9448033688964fabbcfa6ae73b3d849ed0","ref":"refs/remotes/origin/codex/workflow-contract-v2-p4"},{"baseSha":"e0766f9448033688964fabbcfa6ae73b3d849ed0","headSha":"45260e0b5a96e50bf01b820b71103b33f2067d8c","kind":"closed_pull_request","originalBundleHead":"45260e0b5a96e50bf01b820b71103b33f2067d8c","pullRequestNumber":154,"recoveryBundleHead":"45260e0b5a96e50bf01b820b71103b33f2067d8c","ref":"refs/remotes/origin/codex/workflow-contract-v2-p5"},{"baseSha":"45260e0b5a96e50bf01b820b71103b33f2067d8c","headSha":"95d245ce2eba9ac1412038afe96dc509bd6735de","kind":"closed_pull_request","originalBundleHead":"95d245ce2eba9ac1412038afe96dc509bd6735de","pullRequestNumber":155,"recoveryBundleHead":"95d245ce2eba9ac1412038afe96dc509bd6735de","ref":"refs/remotes/origin/codex/workflow-contract-v2-p6"},{"baseSha":"95d245ce2eba9ac1412038afe96dc509bd6735de","headSha":"e860d1ebbafe7068fc6871b16c9586a11b4fe19d","kind":"closed_pull_request","originalBundleHead":"e860d1ebbafe7068fc6871b16c9586a11b4fe19d","pullRequestNumber":157,"recoveryBundleHead":"e860d1ebbafe7068fc6871b16c9586a11b4fe19d","ref":"refs/remotes/origin/codex/workflow-contract-v2-p7"}],"toSha":"e860d1ebbafe7068fc6871b16c9586a11b4fe19d"}]}`
- GO requirements: none beyond normal slice prerequisites
- Approval requirements: scoped_B_work; explicit_C_publication_integration
- Product reachability: separate_activation_required
- Preserved invariants: immutable_bytes; deterministic_manifest
- Explicit omissions: manual_provider_catalog
- Target surfaces: extensions/workflow-register/scripts/compile-workflow-contract-v2-packages.js; extensions/workflow-register/scripts/lib/workflow-contract-v2-environment.js; extensions/workflow-register/src/core/contractV2/compiledPlanManifest.ts; extensions/workflow-register/src/core/contractV2/index.ts; extensions/workflow-register/test/fixtures/workflow-contract-v2/manifest-collection/minimal/current.json; extensions/workflow-register/test/fixtures/workflow-contract-v2/manifest-collection/minimal/versions/sha256-f63effff0027607a3f0443e787c3055bf60394f5eb2a2fd256581db90d6528cc/workflow.lock.json; extensions/workflow-register/test/fixtures/workflow-contract-v2/manifest-collection/minimal/versions/sha256-f63effff0027607a3f0443e787c3055bf60394f5eb2a2fd256581db90d6528cc/workflow.yaml; extensions/workflow-register/test/fixtures/workflow-contract-v2/manifest-provider-catalog.json; extensions/workflow-register/test/workflowContractV2Manifest.test.js; extensions/workflow-register/test/workflowContractV2ManifestFixture.test.js; extensions/workflow-register/test/workflowContractV2ManifestPortability.test.js
- CI: exact_reviewed_candidate_head; exact_merged_main_head; ubuntu_windows
- RED: prove_new_contract_failure_before_implementation
- UAT: same_hashed_vsix_for_changed_product_surfaces; final_three_extension_real_machine_uat
- focused: immutable_bytes; deterministic_manifest
- full: all_affected_extension_tests; three_extension_quality_gates

## GATE-R-ARCHIVE-INVENTORY

archive上のruntime payload全体を棚卸しする。

- Source: `{"implementationSourcePolicy":"no_implementation_source_before_committed_spec_review","kind":"new_design","requiredSpecIdentity":"FEATURE-SELECTION-AND-SEQUENTIAL-MAIN-INTEGRATION@2026-08-23"}`
- GO requirements: none beyond normal slice prerequisites
- Approval requirements: scoped_B_work; explicit_C_publication_integration
- Product reachability: only_after_verified_prerequisites
- Preserved invariants: archive_read_only; complete_inventory
- Explicit omissions: payload_activation
- Target surfaces: control/evidence only
- CI: exact_reviewed_candidate_head; exact_merged_main_head; ubuntu_windows
- RED: prove_new_contract_failure_before_implementation
- UAT: same_hashed_vsix_for_changed_product_surfaces; final_three_extension_real_machine_uat
- focused: archive_read_only; complete_inventory
- full: all_affected_extension_tests; three_extension_quality_gates

## GATE-R-ACTIVE-MANIFEST

active pathがないことを明示するmanifestを作る。

- Source: `{"implementationSourcePolicy":"no_implementation_source_before_committed_spec_review","kind":"new_design","requiredSpecIdentity":"FEATURE-SELECTION-AND-SEQUENTIAL-MAIN-INTEGRATION@2026-08-23"}`
- GO requirements: none beyond normal slice prerequisites
- Approval requirements: scoped_B_work; explicit_C_publication_integration
- Product reachability: only_after_verified_prerequisites
- Preserved invariants: active_runtime_path_zero
- Explicit omissions: archived_runtime_payload
- Target surfaces: control/evidence only
- CI: exact_reviewed_candidate_head; exact_merged_main_head; ubuntu_windows
- RED: prove_new_contract_failure_before_implementation
- UAT: same_hashed_vsix_for_changed_product_surfaces; final_three_extension_real_machine_uat
- focused: active_runtime_path_zero
- full: all_affected_extension_tests; three_extension_quality_gates

## GATE-R-VALIDATOR

inventoryとactive manifestをclosed schemaで検査する。

- Source: `{"implementationSourcePolicy":"no_implementation_source_before_committed_spec_review","kind":"new_design","requiredSpecIdentity":"FEATURE-SELECTION-AND-SEQUENTIAL-MAIN-INTEGRATION@2026-08-23"}`
- GO requirements: none beyond normal slice prerequisites
- Approval requirements: scoped_B_work; explicit_C_publication_integration
- Product reachability: only_after_verified_prerequisites
- Preserved invariants: fail_closed; unknown_payload_rejected
- Explicit omissions: runtime_mutation_authority
- Target surfaces: control/evidence only
- CI: exact_reviewed_candidate_head; exact_merged_main_head; ubuntu_windows
- RED: prove_new_contract_failure_before_implementation
- UAT: same_hashed_vsix_for_changed_product_surfaces; final_three_extension_real_machine_uat
- focused: fail_closed; unknown_payload_rejected
- full: all_affected_extension_tests; three_extension_quality_gates

## GATE-R-RUNNER

Gate Rの検査を再実行可能なread-only runnerへ接続する。

- Source: `{"implementationSourcePolicy":"no_implementation_source_before_committed_spec_review","kind":"new_design","requiredSpecIdentity":"FEATURE-SELECTION-AND-SEQUENTIAL-MAIN-INTEGRATION@2026-08-23"}`
- GO requirements: none beyond normal slice prerequisites
- Approval requirements: scoped_B_work; explicit_C_publication_integration
- Product reachability: only_after_verified_prerequisites
- Preserved invariants: repository_non_mutating
- Explicit omissions: provider_dispatch
- Target surfaces: control/evidence only
- CI: exact_reviewed_candidate_head; exact_merged_main_head; ubuntu_windows
- RED: prove_new_contract_failure_before_implementation
- UAT: same_hashed_vsix_for_changed_product_surfaces; final_three_extension_real_machine_uat
- focused: repository_non_mutating
- full: all_affected_extension_tests; three_extension_quality_gates

## WF2-R1-PROVENANCE

exact plan/package/lock/environment/provider/Bob provenanceとlease lifetimeを束ねる。

- Source: `{"kind":"archive","sourceItemIds":["source-01ca179efcbe182b733f7a89","source-04042ee1d12b54981a558cd1","source-0ee8bd8c0cf158480af89527","source-1125e24c264c3e7ff427c8ae","source-299b38c2a6c3696dbc79dd52","source-3266621c45ba21fc5873f61d","source-34c61efc427121c81952998a","source-41c31bf3997087539134b1c2","source-50f29b856d5d39f3e342ca85","source-5206f6fdf1c711d1bb161d62","source-5878428770ba85ec6765b380","source-5ca2654642f10f69b53d3f8b","source-718be8379c70ab754a9d7484","source-75c07aaa99be8455bdc3285f","source-7ae51bbef33180664889fba4","source-9aad994c88d618f45c216249","source-a5eabe004258ac7de4b9ebdb","source-a7f21730f621e090b2aed5e9","source-b06ff4b70ad3a69d34490e7e","source-ba56f810f0c338c02ff4e864","source-ba622294349bb562549c5825","source-fde858a48c84d66184d3513a"],"tranches":[{"archiveManifestSha256":"36e477ee9b752ebf7f07a208c166fec24e14a89bf7ba6a7921cf6bdf708c9f31","carrierPatchSha256":"2852e9e0e535bbb63165ae01538dd271bd888afe0b7f7dcbca53d193ef24912f","fromSha":"e860d1ebbafe7068fc6871b16c9586a11b4fe19d","id":"workflow-c","legacyHeads":[{"baseSha":"e860d1ebbafe7068fc6871b16c9586a11b4fe19d","headSha":"66e005faf0046ca931c83abc41ce533488d2f581","kind":"closed_pull_request","originalBundleHead":"66e005faf0046ca931c83abc41ce533488d2f581","pullRequestNumber":158,"recoveryBundleHead":"66e005faf0046ca931c83abc41ce533488d2f581","ref":"refs/remotes/origin/codex/workflow-contract-v2-r1"},{"baseSha":"66e005faf0046ca931c83abc41ce533488d2f581","headSha":"7bad4e42f2146b8ae229e05427a5d2ae013cdb2e","kind":"closed_pull_request","originalBundleHead":"7bad4e42f2146b8ae229e05427a5d2ae013cdb2e","pullRequestNumber":160,"recoveryBundleHead":"7bad4e42f2146b8ae229e05427a5d2ae013cdb2e","ref":"refs/remotes/origin/codex/workflow-contract-v2-r2"},{"baseSha":"7bad4e42f2146b8ae229e05427a5d2ae013cdb2e","headSha":"e0a4b1b25166c4d47cf8f5564c01cf30c63d9180","kind":"closed_pull_request","originalBundleHead":"e0a4b1b25166c4d47cf8f5564c01cf30c63d9180","pullRequestNumber":161,"recoveryBundleHead":"e0a4b1b25166c4d47cf8f5564c01cf30c63d9180","ref":"refs/remotes/origin/codex/workflow-contract-v2-r3"},{"baseSha":"e0a4b1b25166c4d47cf8f5564c01cf30c63d9180","headSha":"266f13f8544338ce0445c749f4625a1f80791c36","kind":"closed_pull_request","originalBundleHead":"266f13f8544338ce0445c749f4625a1f80791c36","pullRequestNumber":162,"recoveryBundleHead":"266f13f8544338ce0445c749f4625a1f80791c36","ref":"refs/remotes/origin/codex/workflow-contract-v2-r4"},{"baseSha":"266f13f8544338ce0445c749f4625a1f80791c36","headSha":"de65647c18a122b6f88af3967ba509282b64d6db","kind":"closed_pull_request","originalBundleHead":"de65647c18a122b6f88af3967ba509282b64d6db","pullRequestNumber":163,"recoveryBundleHead":"de65647c18a122b6f88af3967ba509282b64d6db","ref":"refs/remotes/origin/codex/workflow-contract-v2-r5"},{"baseSha":"de65647c18a122b6f88af3967ba509282b64d6db","headSha":"a18c09b10fa51702d312e34940a694ad971a48cc","kind":"closed_pull_request","originalBundleHead":"a18c09b10fa51702d312e34940a694ad971a48cc","pullRequestNumber":164,"recoveryBundleHead":"a18c09b10fa51702d312e34940a694ad971a48cc","ref":"refs/remotes/origin/codex/workflow-contract-v2-r6"}],"toSha":"a18c09b10fa51702d312e34940a694ad971a48cc"}]}`
- GO requirements: none beyond normal slice prerequisites
- Approval requirements: scoped_B_work; explicit_C_publication_integration
- Product reachability: separate_activation_required
- Preserved invariants: exact_provenance; runtime_only_lease
- Explicit omissions: restart_restore
- Target surfaces: extensions/workflow-register/src/core/contractV2/index.ts; extensions/workflow-register/src/core/contractV2/runPlanProvenance.ts; extensions/workflow-register/src/core/contractV2/runPlanProvenanceModel.ts; extensions/workflow-register/src/core/engine/runExecutionCoordinator.ts; extensions/workflow-register/src/core/engine/runState.ts; extensions/workflow-register/src/core/modelSchema.ts; extensions/workflow-register/src/core/runProvenance.ts; extensions/workflow-register/src/core/runtime/runStateCodec.ts; extensions/workflow-register/src/workflowContractV2ProviderLifecycle.ts; extensions/workflow-register/src/workflowContractV2RunStateStore.ts; extensions/workflow-register/src/workflowContractV2RuntimeBoundary.ts; extensions/workflow-register/src/workflowRegisterService.ts; extensions/workflow-register/src/workflowRuntimeFactory.ts; extensions/workflow-register/test/workflowContractV2ExecutionBoundary.test.js; extensions/workflow-register/test/workflowContractV2ExecutionGuard.test.js; extensions/workflow-register/test/workflowContractV2RunLeaseDisposal.test.js; extensions/workflow-register/test/workflowContractV2RunProvenance.test.js; extensions/workflow-register/test/workflowContractV2RunProvenanceProjection.test.js; extensions/workflow-register/test/workflowContractV2RunSchemaType.test.js; extensions/workflow-register/test/workflowContractV2RuntimeLeaseScope.test.js; extensions/workflow-register/test/workflowContractV2TerminalLeaseRelease.test.js
- CI: exact_reviewed_candidate_head; exact_merged_main_head; ubuntu_windows
- RED: prove_new_contract_failure_before_implementation
- UAT: same_hashed_vsix_for_changed_product_surfaces; final_three_extension_real_machine_uat
- focused: exact_provenance; runtime_only_lease
- full: all_affected_extension_tests; three_extension_quality_gates

## WF2-R2-INVOKE

private dispatch bridgeでbounded input/output/errorを検査する。

- Source: `{"kind":"archive","sourceItemIds":["source-14cfd7d06e0a3ff1d07dbd07","source-42e52f0142bc1480cba3f8bb","source-5ec92ed8eb7c664752c179f6","source-67e4c888b7aa389e2ebf5135","source-7fac6492e3e471002b40d219","source-917527dedba80f811bb34bac","source-9c06a4751ee2e5cb236ffade","source-aa64e1c64d51e4da51fd72c7","source-e6276ab81d5965f9ef86745d","source-e9053c4efd76a31cfe133bdb","source-e98cec4ab341f9224f6e2ee0","source-f3f7f4b0b7abd506c0c8f506","source-fecb7999677bed9e8fe3ce13"],"tranches":[{"archiveManifestSha256":"36e477ee9b752ebf7f07a208c166fec24e14a89bf7ba6a7921cf6bdf708c9f31","carrierPatchSha256":"2852e9e0e535bbb63165ae01538dd271bd888afe0b7f7dcbca53d193ef24912f","fromSha":"e860d1ebbafe7068fc6871b16c9586a11b4fe19d","id":"workflow-c","legacyHeads":[{"baseSha":"e860d1ebbafe7068fc6871b16c9586a11b4fe19d","headSha":"66e005faf0046ca931c83abc41ce533488d2f581","kind":"closed_pull_request","originalBundleHead":"66e005faf0046ca931c83abc41ce533488d2f581","pullRequestNumber":158,"recoveryBundleHead":"66e005faf0046ca931c83abc41ce533488d2f581","ref":"refs/remotes/origin/codex/workflow-contract-v2-r1"},{"baseSha":"66e005faf0046ca931c83abc41ce533488d2f581","headSha":"7bad4e42f2146b8ae229e05427a5d2ae013cdb2e","kind":"closed_pull_request","originalBundleHead":"7bad4e42f2146b8ae229e05427a5d2ae013cdb2e","pullRequestNumber":160,"recoveryBundleHead":"7bad4e42f2146b8ae229e05427a5d2ae013cdb2e","ref":"refs/remotes/origin/codex/workflow-contract-v2-r2"},{"baseSha":"7bad4e42f2146b8ae229e05427a5d2ae013cdb2e","headSha":"e0a4b1b25166c4d47cf8f5564c01cf30c63d9180","kind":"closed_pull_request","originalBundleHead":"e0a4b1b25166c4d47cf8f5564c01cf30c63d9180","pullRequestNumber":161,"recoveryBundleHead":"e0a4b1b25166c4d47cf8f5564c01cf30c63d9180","ref":"refs/remotes/origin/codex/workflow-contract-v2-r3"},{"baseSha":"e0a4b1b25166c4d47cf8f5564c01cf30c63d9180","headSha":"266f13f8544338ce0445c749f4625a1f80791c36","kind":"closed_pull_request","originalBundleHead":"266f13f8544338ce0445c749f4625a1f80791c36","pullRequestNumber":162,"recoveryBundleHead":"266f13f8544338ce0445c749f4625a1f80791c36","ref":"refs/remotes/origin/codex/workflow-contract-v2-r4"},{"baseSha":"266f13f8544338ce0445c749f4625a1f80791c36","headSha":"de65647c18a122b6f88af3967ba509282b64d6db","kind":"closed_pull_request","originalBundleHead":"de65647c18a122b6f88af3967ba509282b64d6db","pullRequestNumber":163,"recoveryBundleHead":"de65647c18a122b6f88af3967ba509282b64d6db","ref":"refs/remotes/origin/codex/workflow-contract-v2-r5"},{"baseSha":"de65647c18a122b6f88af3967ba509282b64d6db","headSha":"a18c09b10fa51702d312e34940a694ad971a48cc","kind":"closed_pull_request","originalBundleHead":"a18c09b10fa51702d312e34940a694ad971a48cc","pullRequestNumber":164,"recoveryBundleHead":"a18c09b10fa51702d312e34940a694ad971a48cc","ref":"refs/remotes/origin/codex/workflow-contract-v2-r6"}],"toSha":"a18c09b10fa51702d312e34940a694ad971a48cc"}]}`
- GO requirements: none beyond normal slice prerequisites
- Approval requirements: scoped_B_work; explicit_C_publication_integration
- Product reachability: zero
- Preserved invariants: PRODUCT_REACHABILITY_ZERO; bounded_provider_io
- Explicit omissions: product_run_directory; artifact_staging
- Target surfaces: extensions/workflow-register/src/core/contractV2/planLease.ts; extensions/workflow-register/src/core/contractV2/providerAttemptStaging.ts; extensions/workflow-register/src/core/contractV2/providerEnvelopeSnapshot.ts; extensions/workflow-register/src/core/contractV2/providerInvocation.ts; extensions/workflow-register/src/core/contractV2/providerRegistry.ts; extensions/workflow-register/test/workflowContractV2ProviderInvocation.test.js; extensions/workflow-register/test/workflowContractV2ProviderInvocationArchitecture.test.js; extensions/workflow-register/test/workflowContractV2ProviderInvocationFailurePrecedence.test.js; extensions/workflow-register/test/workflowContractV2ProviderInvocationFollowup.test.js; extensions/workflow-register/test/workflowContractV2ProviderInvocationHardening.test.js; extensions/workflow-register/test/workflowContractV2ProviderInvocationReviewCases.test.js; extensions/workflow-register/test/workflowContractV2ProviderInvocationTestSupport.js
- CI: exact_reviewed_candidate_head; exact_merged_main_head; ubuntu_windows
- RED: prove_new_contract_failure_before_implementation
- UAT: same_hashed_vsix_for_changed_product_surfaces; final_three_extension_real_machine_uat
- focused: PRODUCT_REACHABILITY_ZERO; bounded_provider_io
- full: all_affected_extension_tests; three_extension_quality_gates

## REG-BRIDGE-OWNER-VERSION-LIFECYCLE

strict owner/version/lifecycleを既存Contract v2 registryへ一本化する。

- Source: `{"kind":"archive","sourceItemIds":["source-05dcdabc25077b727fa3858a","source-06b495365a39505884c0f86f","source-06c5f2cc5db5e4f92b0cf2cc","source-09c3e86a1add707d71de4d8c","source-0b61f62d20da4612280b6569","source-178b32177a4de88216c81e1e","source-21c74c762ada2909d42a47b0","source-240df7c38b2b9a2698b1e2b8","source-2b3053b0bd0857926680aaa4","source-2cd5d697cee371e3948b8f33","source-30975ac1581193529a323011","source-473b8fbfa56d3c4c61e553a0","source-49c3dcb3210f6747397403d8","source-4aa26e2ba3475a88e66b9d2e","source-657058eea29c4c1daed416c3","source-68e935618e8909d8f47822a1","source-6bd46f52727f256b495ee3d7","source-6e4f27e3414ecd0dbbe3abb7","source-700d79ad28282566c4a56ca3","source-71443e2d19d7a40e05e396e8","source-721523ae63cd162bf55c8c6f","source-72a412bb6c5f0ba82dff9b1b","source-730d00e957bf6cefffeeacf2","source-79bd38ef5563e7b3aec53fd6","source-83eef9cf8e2990705d59370e","source-88604e6280fac57594af0b14","source-888302701c275d7a8c7fb34c","source-a1581360299210be8dd381b0","source-a3fd41a350be7f1b0dea1bc7","source-b7f2224e7b3370bcd1126871","source-b828b14f3a5c2a07fea08db5","source-c357a71f441254a3b0893e6a","source-c5828e6fb833ccaa6eea4c0f","source-d79dcd8a933e2243f74ff982","source-d8fda3dd7e23d8a1d7e5c0d5","source-dcc9d121869659f63332ad3a","source-e2649725e3a40cd18302e95a","source-ee09d1109431e8dcb4ef836b","source-ef342bf8f2f3c3f4b9629d6e","source-ef8686105cd944dc38900da7","source-efdfd169459fd6cf212c2e84","source-f89eb258abf02ed66382987d","source-f8e9072cf65ee834911af7cc","source-fb04528e9e231cf695440dfb","source-fd40c97ba2097bd3305e520d","source-fda2fa7cf647654a7ee23674"],"tranches":[{"archiveManifestSha256":"36e477ee9b752ebf7f07a208c166fec24e14a89bf7ba6a7921cf6bdf708c9f31","carrierPatchSha256":"6913ddddcffb150eb207aee99bdbbad158b4ed05e9c3ca8714693d31f6122536","fromSha":"8793804f2f99fd1d545cb496064bcbdc7df4bf40","id":"contribution-prerequisite","legacyHeads":[{"headSha":"3e2dd68d4a0a880e7fa7ed065f5a1be2bd25a0ca","kind":"prerequisite_branch","originalBundleHead":"3e2dd68d4a0a880e7fa7ed065f5a1be2bd25a0ca","recoveryBundleHead":"3e2dd68d4a0a880e7fa7ed065f5a1be2bd25a0ca","ref":"refs/remotes/origin/codex/three-extension-p1-release-gates"}],"toSha":"3e2dd68d4a0a880e7fa7ed065f5a1be2bd25a0ca"}]}`
- GO requirements: none beyond normal slice prerequisites
- Approval requirements: scoped_B_work; explicit_C_publication_integration
- Product reachability: only_after_verified_prerequisites
- Preserved invariants: one_owned_registry_per_action_registry; atomic_duplicate_rejection; stale_disposable_safe; three_extension_activation_converges
- Explicit omissions: duplicate_registry; long_lived_legacy_adapter
- Target surfaces: extensions/bob-bazaar-review/contracts/workflow-contributions.json; extensions/bob-bazaar-review/src/workflow/retryRegistrationController.ts; extensions/bob-bazaar-review/src/workflow/workflowProviders.ts; extensions/bob-bazaar-review/src/workflow/workflowRegisterBridge.ts; extensions/bob-bazaar-review/test/providerRegistryBridge.test.js; extensions/bob-bazaar-review/test/retryRegistrationController.test.js; extensions/bob-bazaar-review/test/workflowContributionContract.test.js; extensions/bob-bazaar-review/test/workflowProviderRegistration.test.js; extensions/bob-code-consistency-review/contracts/workflow-contributions.json; extensions/bob-code-consistency-review/src/extension.ts; extensions/bob-code-consistency-review/src/retryRegistrationController.ts; extensions/bob-code-consistency-review/src/workflowProviderRegistration.ts; extensions/bob-code-consistency-review/test/retryRegistrationController.test.js; extensions/bob-code-consistency-review/test/workflowProviderAtomicRegistration.test.js; extensions/bob-code-consistency-review/test/workflowProviderRegistration.test.js; extensions/workflow-register/contracts/workflow-contributions.json; extensions/workflow-register/schema/workflow-contributions.v1.schema.json; extensions/workflow-register/src/api/providerRegistryApi.ts; extensions/workflow-register/src/bobWorkflowRunner.ts; extensions/workflow-register/src/builtInContributions.ts; extensions/workflow-register/src/core/actionRegistry.ts; extensions/workflow-register/src/core/agentProvider.ts; extensions/workflow-register/src/core/contributionManifest.ts; extensions/workflow-register/src/core/contributionRegistry.ts; extensions/workflow-register/src/core/disposeResources.ts; extensions/workflow-register/src/core/engine.ts; extensions/workflow-register/src/core/engine/preflight.ts; extensions/workflow-register/src/core/engineTypes.ts; extensions/workflow-register/src/core/runtime/resultSinkRegistry.ts; extensions/workflow-register/src/extension.ts; extensions/workflow-register/src/workflowRegisterService.ts; extensions/workflow-register/src/workflowRuntimeFactory.ts; extensions/workflow-register/test/builtInContributionRegistration.test.js; extensions/workflow-register/test/builtInContributionWiring.test.js; extensions/workflow-register/test/contributionManifest.test.js; extensions/workflow-register/test/contributionManifestAggregate.test.js; extensions/workflow-register/test/contributionRegistry.test.js; extensions/workflow-register/test/fixtures/provider-registry-api/consumer.ts; extensions/workflow-register/test/providerRegistryApi.test.js; extensions/workflow-register/test/providerRegistryDisposal.test.js; extensions/workflow-register/test/providerRegistryRuntimeLifecycle.test.js; extensions/workflow-register/test/providerRegistryRuntimeWiring.test.js; extensions/workflow-register/test/providerRegistryWiring.test.js; extensions/workflow-register/test/registrationWiring.test.js; extensions/workflow-register/test/runtimeWiring.test.js; extensions/workflow-register/test/workflowEnginePreflightDefaults.test.js
- CI: exact_reviewed_candidate_head; exact_merged_main_head; ubuntu_windows
- RED: prove_new_contract_failure_before_implementation
- UAT: same_hashed_vsix_for_changed_product_surfaces; final_three_extension_real_machine_uat
- focused: one_owned_registry_per_action_registry; atomic_duplicate_rejection; stale_disposable_safe; three_extension_activation_converges
- full: all_affected_extension_tests; three_extension_quality_gates

## REG-BRIDGE-DISCOVERY-EVIDENCE

同一immutable bytes/catalogからdiscovery/report evidenceを生成する。

- Source: `{"kind":"archive","sourceItemIds":["source-00e1139e1829c12246ddfc93","source-0bd231a3c17b7b56bbbbda21","source-108b6d1a970be1f538f3602d","source-12d9b78e71be42e5711771f4","source-1913ba4170b45960fbe64027","source-26b6488e607378d4c655a690","source-2d2e01542f2b8de11ef04afb","source-3b47ba9ceb1a183e4b4b72b6","source-42a51209abb3930bdea6ba64","source-5337bde73cf849b77a4ec168","source-6ed53a774d194de006046976","source-773145e87b6df693130cda15","source-7b4478e568123faa4d57384b","source-81dbd3422d5271c2937c1f2d","source-94c75d7f2b39527bdd46537b","source-a3b4ca6a0b1e4db038b83ee2","source-ae53a107be8a2a34e41640fa","source-b07af6a4536e3f305f2cbd96","source-b0d34954e5c18ba7b31098a5","source-b70d9366a8f58c57853ffb5c","source-bbf2ca2bcc7c77ab957b9da0","source-c9f9168d602096cc4dd38962","source-ded09201e927f84b96d1ea91","source-e97fb940447f8795f030dd5a","source-ecd28ff2184f030296cb7e8f","source-f10cf7e3aac8376a0cd86693","source-f894324f170cd6b0e3e013d0"],"tranches":[{"archiveManifestSha256":"36e477ee9b752ebf7f07a208c166fec24e14a89bf7ba6a7921cf6bdf708c9f31","carrierPatchSha256":"6913ddddcffb150eb207aee99bdbbad158b4ed05e9c3ca8714693d31f6122536","fromSha":"8793804f2f99fd1d545cb496064bcbdc7df4bf40","id":"contribution-prerequisite","legacyHeads":[{"headSha":"3e2dd68d4a0a880e7fa7ed065f5a1be2bd25a0ca","kind":"prerequisite_branch","originalBundleHead":"3e2dd68d4a0a880e7fa7ed065f5a1be2bd25a0ca","recoveryBundleHead":"3e2dd68d4a0a880e7fa7ed065f5a1be2bd25a0ca","ref":"refs/remotes/origin/codex/three-extension-p1-release-gates"}],"toSha":"3e2dd68d4a0a880e7fa7ed065f5a1be2bd25a0ca"}]}`
- GO requirements: none beyond normal slice prerequisites
- Approval requirements: scoped_B_work; explicit_C_publication_integration
- Product reachability: only_after_verified_prerequisites
- Preserved invariants: ubuntu_windows_same_evidence; no_legacy_compiler
- Explicit omissions: legacy_dynamic_gate; manual_catalog
- Target surfaces: extensions/bob-bazaar-review/contracts/workflow-contributions.json; extensions/bob-code-consistency-review/contracts/workflow-contributions.json; extensions/bob-code-consistency-review/test/workflowContributionManifest.test.js; extensions/workflow-register/contracts/workflow-contributions.json; extensions/workflow-register/schema/workflow-contract-report.v1.schema.json; extensions/workflow-register/schema/workflow-contribution-catalog.v1.schema.json; extensions/workflow-register/schema/workflow-contributions.v1.schema.json; extensions/workflow-register/scripts/discover-tracked-workflows.js; extensions/workflow-register/scripts/generate-workflow-contract-report.js; extensions/workflow-register/scripts/lib/vsix-contribution-payload-validator.js; extensions/workflow-register/src/core/contentDigest.ts; extensions/workflow-register/src/core/contributionCatalog.ts; extensions/workflow-register/src/core/contributionManifest.ts; extensions/workflow-register/src/core/diagnosticText.ts; extensions/workflow-register/src/core/extensionCommandCatalog.ts; extensions/workflow-register/src/core/templateMirrorValidator.ts; extensions/workflow-register/src/core/vsixContributionPayloadValidator.ts; extensions/workflow-register/src/core/workflowContractReport.ts; extensions/workflow-register/test/builtInContributionManifest.test.js; extensions/workflow-register/test/contributionCatalog.test.js; extensions/workflow-register/test/contributionManifest.test.js; extensions/workflow-register/test/trackedWorkflowDiscovery.test.js; extensions/workflow-register/test/workflowCommandContracts.test.js; extensions/workflow-register/test/workflowContractFiles.test.js; extensions/workflow-register/test/workflowContractGate.test.js; extensions/workflow-register/test/workflowContractReport.test.js; extensions/workflow-register/test/workflowPackageContracts.test.js
- CI: exact_reviewed_candidate_head; exact_merged_main_head; ubuntu_windows
- RED: prove_new_contract_failure_before_implementation
- UAT: same_hashed_vsix_for_changed_product_surfaces; final_three_extension_real_machine_uat
- focused: ubuntu_windows_same_evidence; no_legacy_compiler
- full: all_affected_extension_tests; three_extension_quality_gates

## PROC-T13-LEDGER

canonical 13-category profileとatomic budget ledgerを導入する。

- Source: `{"kind":"archive","sourceItemIds":["source-0ddab8f0a7385edb664ff6c5","source-116ffcb1708dfab88771d924","source-1af7f2371abe4195022a0223","source-1bed1bc5c87559b5e30af777","source-2a80aed4ccf00e64fa21313e","source-2dc2cff4c648616a169fa711","source-3f97c2ee47589e0c7df351d0","source-5320828c1887a20eaf46dd64","source-5a8f885cd31ff13f1f53864a","source-5df63668a86d46592ab24aa5","source-60f1d8d32af58e3c1772b1d1","source-6ea58dc2902ca040cae5f75f","source-75bd0042a5f39793d323ed37","source-80994c711887d22f843b9eff","source-9f42d0f519b0985a176778aa","source-a8286a3ff1ab7a81e19604a5","source-b6f88ff9b6c95adcacaded9e","source-bc5ca26554439a83438dd5e7","source-c87b9592a9003fb1046dad54","source-db81d68332957cd43752ade9","source-dbf0e78300057ea404011413","source-df3ef033dd61514f10966848","source-e050742b7b51a7e281552c43"],"tranches":[{"archiveManifestSha256":"36e477ee9b752ebf7f07a208c166fec24e14a89bf7ba6a7921cf6bdf708c9f31","carrierPatchSha256":"6913ddddcffb150eb207aee99bdbbad158b4ed05e9c3ca8714693d31f6122536","fromSha":"3e2dd68d4a0a880e7fa7ed065f5a1be2bd25a0ca","id":"processing-t13","legacyHeads":[{"baseSha":"3e2dd68d4a0a880e7fa7ed065f5a1be2bd25a0ca","headSha":"bd29233dac84922e2f868dcb9d654644f6ee0d6a","kind":"closed_pull_request","originalBundleHead":"bd29233dac84922e2f868dcb9d654644f6ee0d6a","pullRequestNumber":145,"recoveryBundleHead":"bd29233dac84922e2f868dcb9d654644f6ee0d6a","ref":"refs/remotes/origin/codex/task13-processing-budget-runtime-20260723"}],"toSha":"bd29233dac84922e2f868dcb9d654644f6ee0d6a"}]}`
- GO requirements: none beyond normal slice prerequisites
- Approval requirements: scoped_B_work; explicit_C_publication_integration
- Product reachability: only_after_verified_prerequisites
- Preserved invariants: canonical_13_categories; atomic_reservations; current_bazaar_profile_override
- Explicit omissions: archived_default_product_limits
- Target surfaces: .github/workflows/processing-budget-runtime.yml; .gitignore; packages/processing-budget-runtime/README.md; packages/processing-budget-runtime/contracts/processing-budget-definition.v1.json; packages/processing-budget-runtime/package-lock.json; packages/processing-budget-runtime/package.json; packages/processing-budget-runtime/schema/processing-budget-profile.v1.schema.json; packages/processing-budget-runtime/scripts/generate-processing-budget-contracts.js; packages/processing-budget-runtime/src/generatedProcessingBudgetDefinition.ts; packages/processing-budget-runtime/src/index.ts; packages/processing-budget-runtime/src/processingBudgetError.ts; packages/processing-budget-runtime/src/processingBudgetLedger.ts; packages/processing-budget-runtime/src/processingBudgetProfile.ts; packages/processing-budget-runtime/test/fixtures/bob-bazaar-review-consumer.ts; packages/processing-budget-runtime/test/fixtures/bob-code-consistency-review-consumer.ts; packages/processing-budget-runtime/test/fixtures/tsconfig.json; packages/processing-budget-runtime/test/fixtures/workflow-register-consumer.ts; packages/processing-budget-runtime/test/helpers.js; packages/processing-budget-runtime/test/packageContract.test.js; packages/processing-budget-runtime/test/processingBudgetContracts.test.js; packages/processing-budget-runtime/test/processingBudgetDefinition.test.js; packages/processing-budget-runtime/test/processingBudgetLedger.test.js; packages/processing-budget-runtime/tsconfig.json
- CI: exact_reviewed_candidate_head; exact_merged_main_head; ubuntu_windows
- RED: prove_new_contract_failure_before_implementation
- UAT: same_hashed_vsix_for_changed_product_surfaces; final_three_extension_real_machine_uat
- focused: canonical_13_categories; atomic_reservations; current_bazaar_profile_override
- full: all_affected_extension_tests; three_extension_quality_gates

## PROC-T14-BOUNDED-DOC

現行Buffer snapshotをshared境界へ接続しCCRをbounded Buffer inputへ移行する。

- Source: `{"kind":"archive","sourceItemIds":["source-081690cb9b343e0e4fd86aaa","source-0f84fc23754230d796e0a5b3","source-115f8910d0fd986cd859a0cb","source-116947d48756a2313f259d67","source-11c6eda712b2f301761a6dd5","source-122cdfe84d37c5f2d7462bdc","source-15ac07e0adbade462b24c3d7","source-212b25dd59af07e1690b14f0","source-55668c6c4fc0ac2d3e153762","source-61060f515b48c9284440815f","source-6e47fdc9c880c66578479d9e","source-757ca93020f46db1d64ffa69","source-766a64b493cd8b3b12542bb6","source-77efe876583486afd84bc446","source-79eaa2908653365204363bca","source-88eaed95118bf51f812a1b91","source-8921fb578f27dc51782bedbb","source-8bc8f4d403d2a239104b230b","source-8c8b935c16fbfd490ffaed7c","source-8e4006e199b552802bd3321e","source-92c9c09c80024b9a183e6a25","source-9364e198f4b4e13273dfe750","source-98d63195b541433bc119f411","source-9c736d36f51e003acd61ec67","source-9e6d125b619471c4637173cb","source-a2f4e841de98c10855985c8d","source-a7bc4d9c841743268ccca70c","source-b4ab7cc1ae4820e5605f057e","source-c4a71884a59c961e40fd6866","source-c7840f4d1fe2e382e974f73a","source-d2c3714904c50e0fe41bbb09","source-da39f68ce042cc7d54b5e92b","source-db0dcef3635a43637cc9c2f3","source-e056445cbc6911cd4866e520","source-e1425c0445b88a037b0c09af","source-e6b932cf56ceda58b85a155f","source-e8f3a56005a262a9606c1e60","source-e9d5a1e9d34f3ddaa30417cb","source-f67f10f4f0b705f9399609cd"],"tranches":[{"archiveManifestSha256":"36e477ee9b752ebf7f07a208c166fec24e14a89bf7ba6a7921cf6bdf708c9f31","carrierPatchSha256":"6913ddddcffb150eb207aee99bdbbad158b4ed05e9c3ca8714693d31f6122536","fromSha":"bd29233dac84922e2f868dcb9d654644f6ee0d6a","id":"processing-t14","legacyHeads":[{"baseSha":"bd29233dac84922e2f868dcb9d654644f6ee0d6a","headSha":"4d0fb728763db9d13c87d000790a88c45900733e","kind":"closed_pull_request","originalBundleHead":"4d0fb728763db9d13c87d000790a88c45900733e","pullRequestNumber":146,"recoveryBundleHead":"4d0fb728763db9d13c87d000790a88c45900733e","ref":"refs/remotes/origin/codex/task14-bounded-document-extraction-20260723"}],"toSha":"4d0fb728763db9d13c87d000790a88c45900733e"},{"archiveManifestSha256":"36e477ee9b752ebf7f07a208c166fec24e14a89bf7ba6a7921cf6bdf708c9f31","carrierPatchSha256":"edd675378aa15650b5648308ae1f7621fa830844699ad4d06660463c9d2cb10b","fromSha":"4d0fb728763db9d13c87d000790a88c45900733e","id":"processing-t15","legacyHeads":[{"baseSha":"4d0fb728763db9d13c87d000790a88c45900733e","headSha":"7fc7a371e6506290d8626d06e9b12c2a67888b47","kind":"closed_pull_request","originalBundleHead":"7fc7a371e6506290d8626d06e9b12c2a67888b47","pullRequestNumber":147,"recoveryBundleHead":"7fc7a371e6506290d8626d06e9b12c2a67888b47","ref":"refs/remotes/origin/codex/task15-workbook-document-aggregate-caps-20260724"}],"toSha":"7fc7a371e6506290d8626d06e9b12c2a67888b47"},{"archiveManifestSha256":"36e477ee9b752ebf7f07a208c166fec24e14a89bf7ba6a7921cf6bdf708c9f31","carrierPatchSha256":"edd675378aa15650b5648308ae1f7621fa830844699ad4d06660463c9d2cb10b","fromSha":"7fc7a371e6506290d8626d06e9b12c2a67888b47","id":"processing-t16","legacyHeads":[{"baseSha":"7fc7a371e6506290d8626d06e9b12c2a67888b47","headSha":"49f39e1a6ec35e5db98e9ef698d4ce43369c9760","kind":"closed_pull_request","originalBundleHead":"49f39e1a6ec35e5db98e9ef698d4ce43369c9760","pullRequestNumber":150,"recoveryBundleHead":"49f39e1a6ec35e5db98e9ef698d4ce43369c9760","ref":"refs/remotes/origin/codex/task16-review-input-process-budgets-20260724"}],"toSha":"49f39e1a6ec35e5db98e9ef698d4ce43369c9760"},{"archiveManifestSha256":"36e477ee9b752ebf7f07a208c166fec24e14a89bf7ba6a7921cf6bdf708c9f31","carrierPatchSha256":"294c11760ed94bdddec8f37f6f9517f42f7e9c6442ad23df6041ff9f470bbab5","fromSha":"49f39e1a6ec35e5db98e9ef698d4ce43369c9760","id":"processing-t17","legacyHeads":[{"baseSha":"49f39e1a6ec35e5db98e9ef698d4ce43369c9760","headSha":"7ea786afd5715d841526000a402c831d6c2a203c","kind":"closed_pull_request","originalBundleHead":"7ea786afd5715d841526000a402c831d6c2a203c","pullRequestNumber":152,"recoveryBundleHead":"7ea786afd5715d841526000a402c831d6c2a203c","ref":"refs/remotes/origin/codex/task17-deadlines-process-control-paths-20260724"}],"toSha":"7ea786afd5715d841526000a402c831d6c2a203c"},{"archiveManifestSha256":"36e477ee9b752ebf7f07a208c166fec24e14a89bf7ba6a7921cf6bdf708c9f31","carrierPatchSha256":"294c11760ed94bdddec8f37f6f9517f42f7e9c6442ad23df6041ff9f470bbab5","fromSha":"7ea786afd5715d841526000a402c831d6c2a203c","id":"processing-t18","legacyHeads":[{"baseSha":"7ea786afd5715d841526000a402c831d6c2a203c","headSha":"2d8a570fa1c0646fd662346744449b1abc1142b2","kind":"closed_pull_request","originalBundleHead":"2d8a570fa1c0646fd662346744449b1abc1142b2","pullRequestNumber":159,"recoveryBundleHead":"2d8a570fa1c0646fd662346744449b1abc1142b2","ref":"refs/remotes/origin/codex/task18-processing-budget-report-handoff-20260726"}],"toSha":"2d8a570fa1c0646fd662346744449b1abc1142b2"}]}`
- GO requirements: none beyond normal slice prerequisites
- Approval requirements: scoped_B_work; explicit_C_publication_integration
- Product reachability: only_after_verified_prerequisites
- Preserved invariants: BASE_OOXML_SNAPSHOT_PARITY; CURRENT_GUI_DIAGNOSTIC_PARITY; buffer_input_only
- Explicit omissions: legacy_bazaar_docx_xlsx_parser; path_parser_input
- Target surfaces: extensions/bob-bazaar-review/package.json; extensions/bob-bazaar-review/src/ruleAuthoring/extraction/documentExtractor.ts; extensions/bob-bazaar-review/src/ruleAuthoring/extraction/docxExtractor.ts; extensions/bob-bazaar-review/src/ruleAuthoring/extraction/xlsxExtractor.ts; extensions/bob-bazaar-review/src/ruleAuthoring/ruleSourceHash.ts; extensions/bob-bazaar-review/src/sharedProcessingBudgetRuntime.ts; extensions/bob-bazaar-review/test/ruleBoundedOoxmlExtraction.test.js; extensions/bob-bazaar-review/test/ruleConfiguredFingerprintLimit.test.js; extensions/bob-bazaar-review/test/ruleConfiguredOoxmlLimitForwarding.test.js; extensions/bob-bazaar-review/test/ruleNoLegacyOoxmlPreflight.test.js; extensions/bob-code-consistency-review/package.json; extensions/bob-code-consistency-review/src/analyzers/documentDocxExtractor.ts; extensions/bob-code-consistency-review/src/analyzers/documentExtractor.ts; extensions/bob-code-consistency-review/src/analyzers/documentXlsxExtractor.ts; extensions/bob-code-consistency-review/src/sharedProcessingBudgetRuntime.ts; extensions/bob-code-consistency-review/test/documentSourceLimitDescription.test.js; extensions/bob-code-consistency-review/test/sizeLimits.test.js; packages/processing-budget-runtime/README.md; packages/processing-budget-runtime/package.json; packages/processing-budget-runtime/runtime/bounded-document-runtime.js; packages/processing-budget-runtime/runtime/bounded-file.js; packages/processing-budget-runtime/runtime/bounded-zip.js; packages/processing-budget-runtime/runtime/errors.js; packages/processing-budget-runtime/scripts/copy-bounded-document-runtime.js; packages/processing-budget-runtime/scripts/copy-extension-runtime.js; packages/processing-budget-runtime/src/boundedDocumentIo.ts; packages/processing-budget-runtime/src/index.ts; packages/processing-budget-runtime/test/boundedArchiveInputLimit.test.js; packages/processing-budget-runtime/test/boundedDocumentIo.test.js; packages/processing-budget-runtime/test/boundedDocumentPackaging.test.js; packages/processing-budget-runtime/test/boundedDocumentRuntime.test.js; packages/processing-budget-runtime/test/boundedZipRetention.test.js; packages/processing-budget-runtime/test/extensionIntegrationContract.test.js; packages/processing-budget-runtime/test/fixtures/bob-bazaar-review-consumer.ts; packages/processing-budget-runtime/test/fixtures/bob-code-consistency-review-consumer.ts; packages/processing-budget-runtime/test/fixtures/workflow-register-consumer.ts; packages/processing-budget-runtime/test/helpers/boundedDocumentFixtures.js; packages/processing-budget-runtime/test/packageContract.test.js
- CI: exact_reviewed_candidate_head; exact_merged_main_head; ubuntu_windows
- RED: prove_new_contract_failure_before_implementation
- UAT: same_hashed_vsix_for_changed_product_surfaces; final_three_extension_real_machine_uat
- focused: BASE_OOXML_SNAPSHOT_PARITY; CURRENT_GUI_DIAGNOSTIC_PARITY; buffer_input_only
- full: all_affected_extension_tests; three_extension_quality_gates

## PROC-T15-AGGREGATE

workbook/document local/operation capとpre-parser cancellationを導入する。

- Source: `{"kind":"archive","sourceItemIds":["source-0079608c934fd2c8521b4c4b","source-0209178d37fa1d85d707a3b7","source-029c3450e572ca500b56d997","source-0b1db8b46876527efe49b608","source-0dc3160ff443203c1012c332","source-13c44626c0be971142e83fc1","source-2cc51fa85468ac0ed1130ba8","source-308b45cdc82376d66646f04c","source-51bcaeb41bc1a68cec561182","source-54284087d47d7b028ce71bb0","source-59393027dc9303c0772d3255","source-70fef9b583863580a47ddc75","source-7b83c4602a45112783d66e76","source-933f4d876b1f1a77bdef2c3d","source-a454f8df9fcade23d410f8f9","source-a542dff0e366e0cd08fb9506","source-af2bee558009aa5c69c8e766","source-b11e3d49cc49cbfcfc612cea","source-b9febf9c1b199ac9a861df0a","source-bb1f1886f02fe1d15e4ddf67","source-bc1c6595fef769aedee758f4","source-c07e349e46e5969f9dd00866","source-d00fdc4453525c52ab2e44a2","source-d4a33aff27a5fdfe2ef009b7","source-d4e08dcfed03d4704221716b","source-d869381edc302fee73a78b09","source-dc1308461f2b82bbe709d2a9","source-df389420fc16a7c3191f1011","source-e4aab2d934795fa338eb336a","source-ebbc80adbe86accc7deb0bb0"],"tranches":[{"archiveManifestSha256":"36e477ee9b752ebf7f07a208c166fec24e14a89bf7ba6a7921cf6bdf708c9f31","carrierPatchSha256":"edd675378aa15650b5648308ae1f7621fa830844699ad4d06660463c9d2cb10b","fromSha":"4d0fb728763db9d13c87d000790a88c45900733e","id":"processing-t15","legacyHeads":[{"baseSha":"4d0fb728763db9d13c87d000790a88c45900733e","headSha":"7fc7a371e6506290d8626d06e9b12c2a67888b47","kind":"closed_pull_request","originalBundleHead":"7fc7a371e6506290d8626d06e9b12c2a67888b47","pullRequestNumber":147,"recoveryBundleHead":"7fc7a371e6506290d8626d06e9b12c2a67888b47","ref":"refs/remotes/origin/codex/task15-workbook-document-aggregate-caps-20260724"}],"toSha":"7fc7a371e6506290d8626d06e9b12c2a67888b47"},{"archiveManifestSha256":"36e477ee9b752ebf7f07a208c166fec24e14a89bf7ba6a7921cf6bdf708c9f31","carrierPatchSha256":"edd675378aa15650b5648308ae1f7621fa830844699ad4d06660463c9d2cb10b","fromSha":"7fc7a371e6506290d8626d06e9b12c2a67888b47","id":"processing-t16","legacyHeads":[{"baseSha":"7fc7a371e6506290d8626d06e9b12c2a67888b47","headSha":"49f39e1a6ec35e5db98e9ef698d4ce43369c9760","kind":"closed_pull_request","originalBundleHead":"49f39e1a6ec35e5db98e9ef698d4ce43369c9760","pullRequestNumber":150,"recoveryBundleHead":"49f39e1a6ec35e5db98e9ef698d4ce43369c9760","ref":"refs/remotes/origin/codex/task16-review-input-process-budgets-20260724"}],"toSha":"49f39e1a6ec35e5db98e9ef698d4ce43369c9760"},{"archiveManifestSha256":"36e477ee9b752ebf7f07a208c166fec24e14a89bf7ba6a7921cf6bdf708c9f31","carrierPatchSha256":"294c11760ed94bdddec8f37f6f9517f42f7e9c6442ad23df6041ff9f470bbab5","fromSha":"49f39e1a6ec35e5db98e9ef698d4ce43369c9760","id":"processing-t17","legacyHeads":[{"baseSha":"49f39e1a6ec35e5db98e9ef698d4ce43369c9760","headSha":"7ea786afd5715d841526000a402c831d6c2a203c","kind":"closed_pull_request","originalBundleHead":"7ea786afd5715d841526000a402c831d6c2a203c","pullRequestNumber":152,"recoveryBundleHead":"7ea786afd5715d841526000a402c831d6c2a203c","ref":"refs/remotes/origin/codex/task17-deadlines-process-control-paths-20260724"}],"toSha":"7ea786afd5715d841526000a402c831d6c2a203c"},{"archiveManifestSha256":"36e477ee9b752ebf7f07a208c166fec24e14a89bf7ba6a7921cf6bdf708c9f31","carrierPatchSha256":"294c11760ed94bdddec8f37f6f9517f42f7e9c6442ad23df6041ff9f470bbab5","fromSha":"7ea786afd5715d841526000a402c831d6c2a203c","id":"processing-t18","legacyHeads":[{"baseSha":"7ea786afd5715d841526000a402c831d6c2a203c","headSha":"2d8a570fa1c0646fd662346744449b1abc1142b2","kind":"closed_pull_request","originalBundleHead":"2d8a570fa1c0646fd662346744449b1abc1142b2","pullRequestNumber":159,"recoveryBundleHead":"2d8a570fa1c0646fd662346744449b1abc1142b2","ref":"refs/remotes/origin/codex/task18-processing-budget-report-handoff-20260726"}],"toSha":"2d8a570fa1c0646fd662346744449b1abc1142b2"}]}`
- GO requirements: none beyond normal slice prerequisites
- Approval requirements: scoped_B_work; explicit_C_publication_integration
- Product reachability: only_after_verified_prerequisites
- Preserved invariants: pre_parser_cancellation; atomic_aggregate_cap
- Explicit omissions: post_parser_only_budget_test
- Target surfaces: extensions/bob-bazaar-review/src/ruleAuthoring/extraction/documentExtractor.ts; extensions/bob-bazaar-review/src/ruleAuthoring/extraction/docxExtractor.ts; extensions/bob-bazaar-review/src/ruleAuthoring/extraction/xlsxExtractor.ts; extensions/bob-bazaar-review/src/ruleAuthoring/ruleSourceHash.ts; extensions/bob-bazaar-review/src/sharedProcessingBudgetRuntime.ts; extensions/bob-bazaar-review/test/ooxmlPreCancelled.test.js; extensions/bob-bazaar-review/test/ruleDocumentAggregateBudget.test.js; extensions/bob-bazaar-review/test/ruleDocumentSignalCompatibility.test.js; extensions/bob-code-consistency-review/src/analyzers/documentExtractor.ts; extensions/bob-code-consistency-review/src/analyzers/documentXlsxExtractor.ts; extensions/bob-code-consistency-review/src/core/pipeline.ts; extensions/bob-code-consistency-review/src/sharedProcessingBudgetRuntime.ts; extensions/bob-code-consistency-review/test/documentAggregateBudget.test.js; extensions/bob-code-consistency-review/test/documentXlsxCancellationOrder.test.js; extensions/bob-code-consistency-review/test/pipelineDocumentCancellation.test.js; packages/processing-budget-runtime/src/index.ts; packages/processing-budget-runtime/src/workbookBudget.ts; packages/processing-budget-runtime/test/aggregateIntegrationContract.test.js; packages/processing-budget-runtime/test/documentAggregateBudget.test.js; packages/processing-budget-runtime/test/fixtures/bob-bazaar-review-consumer.ts; packages/processing-budget-runtime/test/fixtures/bob-code-consistency-review-consumer.ts; packages/processing-budget-runtime/test/fixtures/workflow-register-consumer.ts; packages/processing-budget-runtime/test/packageContract.test.js; packages/processing-budget-runtime/test/workbookBudget.test.js; packages/processing-budget-runtime/test/xlsxWorkbookBudget.test.js
- CI: exact_reviewed_candidate_head; exact_merged_main_head; ubuntu_windows
- RED: prove_new_contract_failure_before_implementation
- UAT: same_hashed_vsix_for_changed_product_surfaces; final_three_extension_real_machine_uat
- focused: pre_parser_cancellation; atomic_aggregate_cap
- full: all_affected_extension_tests; three_extension_quality_gates

## PROC-T16-INPUT-PROCESS

stdout/stderr、diff、excerpt、Bob input、artifact、operation全体を制限する。

- Source: `{"kind":"archive","sourceItemIds":["source-05f184a5094441d208a847c2","source-0bff6322ffa2774f6f27a3ee","source-2447bc3569e6ac90c8ecf0b0","source-31502d818e0b6147aa6f3275","source-44d30d8b4cc747498d0a7117","source-4c4c58c4f1546e0176ba06a2","source-50af63c7c4cda00775f5a5a2","source-6109286cf50be04f67f2b427","source-61e92951d83f50818aab7248","source-68752b504e6e6d0a501987f7","source-7b6a8ca9b6683dfebe539566","source-7c4ba109c3323751bd6c0460","source-8f20d598ea0db48f404c389e","source-9b5a3df1781361b2e783d0d0","source-a67f1076c6e1454f31fa386e","source-a7a47b2c4935ee934a70ff9f","source-a988f317012704304ff20d34","source-aa14b45b9a62c15e216b1e7a","source-ad6ac90a37b17ebc84947235","source-b3f1242a2d63fad26d27bd6d","source-c07621bcfe509d992b18e1c9","source-c3731cfb10994c67a2629d82","source-c6293fce78faaf8b47f702b4","source-c7bb6706403b362f18e01e4d","source-c96bb205f0c1fa19b450db1a","source-dda090c32e79effef12b5905","source-e08fa31f4527651e1c53a428","source-f0138af267eed6886093ed36","source-fd93b64d67682284ad2a0ac1"],"tranches":[{"archiveManifestSha256":"36e477ee9b752ebf7f07a208c166fec24e14a89bf7ba6a7921cf6bdf708c9f31","carrierPatchSha256":"edd675378aa15650b5648308ae1f7621fa830844699ad4d06660463c9d2cb10b","fromSha":"7fc7a371e6506290d8626d06e9b12c2a67888b47","id":"processing-t16","legacyHeads":[{"baseSha":"7fc7a371e6506290d8626d06e9b12c2a67888b47","headSha":"49f39e1a6ec35e5db98e9ef698d4ce43369c9760","kind":"closed_pull_request","originalBundleHead":"49f39e1a6ec35e5db98e9ef698d4ce43369c9760","pullRequestNumber":150,"recoveryBundleHead":"49f39e1a6ec35e5db98e9ef698d4ce43369c9760","ref":"refs/remotes/origin/codex/task16-review-input-process-budgets-20260724"}],"toSha":"49f39e1a6ec35e5db98e9ef698d4ce43369c9760"},{"archiveManifestSha256":"36e477ee9b752ebf7f07a208c166fec24e14a89bf7ba6a7921cf6bdf708c9f31","carrierPatchSha256":"294c11760ed94bdddec8f37f6f9517f42f7e9c6442ad23df6041ff9f470bbab5","fromSha":"49f39e1a6ec35e5db98e9ef698d4ce43369c9760","id":"processing-t17","legacyHeads":[{"baseSha":"49f39e1a6ec35e5db98e9ef698d4ce43369c9760","headSha":"7ea786afd5715d841526000a402c831d6c2a203c","kind":"closed_pull_request","originalBundleHead":"7ea786afd5715d841526000a402c831d6c2a203c","pullRequestNumber":152,"recoveryBundleHead":"7ea786afd5715d841526000a402c831d6c2a203c","ref":"refs/remotes/origin/codex/task17-deadlines-process-control-paths-20260724"}],"toSha":"7ea786afd5715d841526000a402c831d6c2a203c"},{"archiveManifestSha256":"36e477ee9b752ebf7f07a208c166fec24e14a89bf7ba6a7921cf6bdf708c9f31","carrierPatchSha256":"294c11760ed94bdddec8f37f6f9517f42f7e9c6442ad23df6041ff9f470bbab5","fromSha":"7ea786afd5715d841526000a402c831d6c2a203c","id":"processing-t18","legacyHeads":[{"baseSha":"7ea786afd5715d841526000a402c831d6c2a203c","headSha":"2d8a570fa1c0646fd662346744449b1abc1142b2","kind":"closed_pull_request","originalBundleHead":"2d8a570fa1c0646fd662346744449b1abc1142b2","pullRequestNumber":159,"recoveryBundleHead":"2d8a570fa1c0646fd662346744449b1abc1142b2","ref":"refs/remotes/origin/codex/task18-processing-budget-report-handoff-20260726"}],"toSha":"2d8a570fa1c0646fd662346744449b1abc1142b2"}]}`
- GO requirements: none beyond normal slice prerequisites
- Approval requirements: scoped_B_work; explicit_C_publication_integration
- Product reachability: only_after_verified_prerequisites
- Preserved invariants: bounded_process_output; process_tree_settlement
- Explicit omissions: unbounded_input_buffer
- Target surfaces: extensions/bob-bazaar-review/src/bazaar/bazaar.ts; extensions/bob-bazaar-review/src/bazaar/externalProcessRunner.ts; extensions/bob-bazaar-review/src/ruleAuthoring/extraction/documentExtractor.ts; extensions/bob-bazaar-review/src/ruleAuthoring/extraction/pdfExtractor.ts; extensions/bob-bazaar-review/test/externalProcessOptionContract.test.js; extensions/bob-bazaar-review/test/externalProcessRunner.test.js; extensions/bob-bazaar-review/test/rulePdfExtraction.test.js; extensions/bob-bazaar-review/test/windowsProcessTreeTermination.test.js; extensions/bob-code-consistency-review/src/analyzers/documentExtractor.ts; extensions/bob-code-consistency-review/src/core/externalProcessRunner.ts; extensions/bob-code-consistency-review/src/core/gitDiffCollector.ts; extensions/bob-code-consistency-review/src/core/pipeline.ts; extensions/bob-code-consistency-review/src/core/processingBudgetPipeline.ts; extensions/bob-code-consistency-review/src/core/reviewPackageBudgets.ts; extensions/bob-code-consistency-review/src/core/reviewPackageBuilder.ts; extensions/bob-code-consistency-review/src/evidenceScope/repositorySymbolIndexProducer.ts; extensions/bob-code-consistency-review/test/bazaarDiffOverflow.test.js; extensions/bob-code-consistency-review/test/diffFixtureBudget.test.js; extensions/bob-code-consistency-review/test/diffProcessingBudget.test.js; extensions/bob-code-consistency-review/test/documentExcerptBudget.test.js; extensions/bob-code-consistency-review/test/externalProcessOptionContract.test.js; extensions/bob-code-consistency-review/test/externalProcessRunner.test.js; extensions/bob-code-consistency-review/test/processingBudgetPipelineContract.test.js; extensions/bob-code-consistency-review/test/processingBudgetPipelineProfile.test.js; extensions/bob-code-consistency-review/test/reviewPackageBudgetIntegration.test.js; extensions/bob-code-consistency-review/test/reviewPackageBudgets.test.js; extensions/bob-code-consistency-review/test/sizeLimits.test.js; extensions/bob-code-consistency-review/test/windowsProcessTreeTermination.test.js
- CI: exact_reviewed_candidate_head; exact_merged_main_head; ubuntu_windows
- RED: prove_new_contract_failure_before_implementation
- UAT: same_hashed_vsix_for_changed_product_surfaces; final_three_extension_real_machine_uat
- focused: bounded_process_output; process_tree_settlement
- full: all_affected_extension_tests; three_extension_quality_gates

## PROC-T17-DEADLINE

absolute monotonic deadlineとauthenticated first causeを管理する。

- Source: `{"kind":"archive","sourceItemIds":["source-01a9655f527e3c20b24c6835","source-01f7821ee897fedfb488ca62","source-0242818ae8483b31a38c73a6","source-2b646d5d315a539415d3e73c","source-2df85f46e62ea5d5fc8545f9","source-3492db8bbbc56bda287a9055","source-3af20d158a95f6e5eb6bc244","source-3df4b118944857706a292a71","source-401a97fced069da2bee6384b","source-422ee5e3fe35e7ae1ca2f981","source-48166ff553110df8983d5257","source-4b4730055bf291daeb1a9b42","source-4d3c8c1d47eea6437944309c","source-4d84e287ca61db22836ab0d4","source-4e660869aa1ada148aeb2bda","source-5237c6af1c153c9400cd06cf","source-5af29fd63ef8b7045a65ff67","source-6b16cf78cbd9cf1ded5f9240","source-6c4642fcb7b9c15c901d72c2","source-6d627a871a7f238b34893ad7","source-6e83ef7a0f958789ba1fa2ed","source-6eeca2d26a9aa16ab8ef600e","source-70c2dea15f32dc8ddf7a81e4","source-730c5e064055f1b7adffeb69","source-7d745b5944c1a7b68cfb1465","source-84c0ecbeece6f1a6ebd7f215","source-859cf9b394d1bc84511ef37d","source-85b0b67dff73be4be2abfbd4","source-9659ba5cde0d919ac0a0e8c8","source-9909fe163821c8d49a50588a","source-9ce8c736275573d2f95cb081","source-a2b03f10fed5ed28286aed02","source-ad09a42bee1d878c41fe9e79","source-b335aea38d77e70867dbff68","source-b81959ae019101dc335c9c98","source-b8b9df65d1f3050c70c13f7c","source-bb91584f71612f3e175e76f2","source-bda3c142c71b53f9bbdd6e2d","source-bf5a1d63ef4b8f946cc8f95b","source-c22f6c70eb524373f02f229b","source-c3ad921f37b6a82d27d7af4e","source-c7836f19ab61ab5583ec71aa","source-c84f819d75a53bfcc42d3531","source-ca7404fcccfb8012f2637dd7","source-cadf6df2cd6d0b41cd4b897f","source-cdf15f7d0d73f91e0a022cfd","source-d0917810045b5739bc8f6370","source-d47d8a1ad7e651d178c4ecb1","source-d51d0f0701cb68ddc04dc206","source-d6e35ead5bdf9406a3ec4f01","source-dd222a5fc261fb64b45fba8b","source-e69de915da3b2c2508e9cb90","source-ea3a1c93f1943b1e70e5990c","source-ed1e49e2ede1bb77d9551e9d"],"tranches":[{"archiveManifestSha256":"36e477ee9b752ebf7f07a208c166fec24e14a89bf7ba6a7921cf6bdf708c9f31","carrierPatchSha256":"294c11760ed94bdddec8f37f6f9517f42f7e9c6442ad23df6041ff9f470bbab5","fromSha":"49f39e1a6ec35e5db98e9ef698d4ce43369c9760","id":"processing-t17","legacyHeads":[{"baseSha":"49f39e1a6ec35e5db98e9ef698d4ce43369c9760","headSha":"7ea786afd5715d841526000a402c831d6c2a203c","kind":"closed_pull_request","originalBundleHead":"7ea786afd5715d841526000a402c831d6c2a203c","pullRequestNumber":152,"recoveryBundleHead":"7ea786afd5715d841526000a402c831d6c2a203c","ref":"refs/remotes/origin/codex/task17-deadlines-process-control-paths-20260724"}],"toSha":"7ea786afd5715d841526000a402c831d6c2a203c"},{"archiveManifestSha256":"36e477ee9b752ebf7f07a208c166fec24e14a89bf7ba6a7921cf6bdf708c9f31","carrierPatchSha256":"294c11760ed94bdddec8f37f6f9517f42f7e9c6442ad23df6041ff9f470bbab5","fromSha":"7ea786afd5715d841526000a402c831d6c2a203c","id":"processing-t18","legacyHeads":[{"baseSha":"7ea786afd5715d841526000a402c831d6c2a203c","headSha":"2d8a570fa1c0646fd662346744449b1abc1142b2","kind":"closed_pull_request","originalBundleHead":"2d8a570fa1c0646fd662346744449b1abc1142b2","pullRequestNumber":159,"recoveryBundleHead":"2d8a570fa1c0646fd662346744449b1abc1142b2","ref":"refs/remotes/origin/codex/task18-processing-budget-report-handoff-20260726"}],"toSha":"2d8a570fa1c0646fd662346744449b1abc1142b2"}]}`
- GO requirements: none beyond normal slice prerequisites
- Approval requirements: scoped_B_work; explicit_C_publication_integration
- Product reachability: only_after_verified_prerequisites
- Preserved invariants: ABSOLUTE_MONOTONIC_DEADLINE; authenticated_first_cause; process_tree_settlement
- Explicit omissions: wall_clock_deadline
- Target surfaces: extensions/bob-bazaar-review/src/bazaar/bazaar.ts; extensions/bob-bazaar-review/src/bazaar/externalProcessRunner.ts; extensions/bob-bazaar-review/src/mcp/tools.ts; extensions/bob-bazaar-review/src/ruleAuthoring/extraction/documentExtractor.ts; extensions/bob-bazaar-review/src/ruleAuthoring/extraction/docxExtractor.ts; extensions/bob-bazaar-review/src/ruleAuthoring/extraction/pdfExtractor.ts; extensions/bob-bazaar-review/src/ruleAuthoring/extraction/xlsxExtractor.ts; extensions/bob-bazaar-review/src/ruleAuthoring/ruleSourceHash.ts; extensions/bob-bazaar-review/src/sharedProcessingBudgetRuntime.ts; extensions/bob-bazaar-review/src/ui/ruleAuthoringGui.ts; extensions/bob-bazaar-review/test/bazaarClient.test.js; extensions/bob-bazaar-review/test/deadlineSettlement.test.js; extensions/bob-bazaar-review/test/externalProcessRunner.test.js; extensions/bob-bazaar-review/test/externalProcessWiring.test.js; extensions/bob-bazaar-review/test/mcpToolDeadline.test.js; extensions/bob-bazaar-review/test/posixProcessTreeTermination.test.js; extensions/bob-bazaar-review/test/ruleDocumentDeadline.test.js; extensions/bob-bazaar-review/test/rulePdfExtraction.test.js; extensions/bob-bazaar-review/test/task17RuleAuthoringCancellation.test.js; extensions/bob-bazaar-review/test/windowsProcessTreeTermination.test.js; extensions/bob-code-consistency-review/package.json; extensions/bob-code-consistency-review/src/analyzers/documentExtractor.ts; extensions/bob-code-consistency-review/src/core/externalProcessRunner.ts; extensions/bob-code-consistency-review/src/core/gitDiffCollector.ts; extensions/bob-code-consistency-review/src/core/pipeline.ts; extensions/bob-code-consistency-review/src/evidenceScope/repositorySymbolIndexProducer.ts; extensions/bob-code-consistency-review/src/sharedProcessingBudgetRuntime.ts; extensions/bob-code-consistency-review/test/deadlineConfigurationContract.test.js; extensions/bob-code-consistency-review/test/deadlineSettlement.test.js; extensions/bob-code-consistency-review/test/diffFixturePathBoundary.test.js; extensions/bob-code-consistency-review/test/externalProcessRunner.test.js; extensions/bob-code-consistency-review/test/externalProcessWiring.test.js; extensions/bob-code-consistency-review/test/pipelineFinalCancellation.test.js; extensions/bob-code-consistency-review/test/posixProcessTreeTermination.test.js; extensions/bob-code-consistency-review/test/windowsProcessTreeTermination.test.js; packages/processing-budget-runtime/runtime/bounded-document-runtime.js; packages/processing-budget-runtime/runtime/bounded-file.js; packages/processing-budget-runtime/runtime/bounded-zip.js; packages/processing-budget-runtime/runtime/deadline-cancellation.js; packages/processing-budget-runtime/runtime/errors.js; packages/processing-budget-runtime/src/boundedDocumentIo.ts; packages/processing-budget-runtime/src/deadlineCancellation.ts; packages/processing-budget-runtime/src/index.ts; packages/processing-budget-runtime/test/boundedArchiveCancellation.test.js; packages/processing-budget-runtime/test/boundedDocumentCancellation.test.js; packages/processing-budget-runtime/test/cancellationReasonPropagation.test.js; packages/processing-budget-runtime/test/deadlineCancellation.test.js; packages/processing-budget-runtime/test/deadlineLongTimer.test.js; packages/processing-budget-runtime/test/deadlineReasonAuthentication.test.js; packages/processing-budget-runtime/test/deadlineSynchronousExpiry.test.js; packages/processing-budget-runtime/test/ooxmlCancellationWiring.test.js; packages/processing-budget-runtime/test/synchronousBoundedDeadline.test.js; packages/processing-budget-runtime/test/task17IntegrationContract.test.js; packages/processing-budget-runtime/test/workbookBudget.test.js
- CI: exact_reviewed_candidate_head; exact_merged_main_head; ubuntu_windows
- RED: prove_new_contract_failure_before_implementation
- UAT: same_hashed_vsix_for_changed_product_surfaces; final_three_extension_real_machine_uat
- focused: ABSOLUTE_MONOTONIC_DEADLINE; authenticated_first_cause; process_tree_settlement
- full: all_affected_extension_tests; three_extension_quality_gates

## PROC-T17-PATH

portable/physical containmentを独立して検査する。

- Source: `{"kind":"archive","sourceItemIds":["source-02309bad381271a510d344c9","source-04120694790d10c80bb7040c","source-1004a4fe0de3bc511f445d9c","source-3ded212f1168d24021187d9e","source-3e7af2df20c39b189fbd1629","source-434d0ac63b4a746f6d3a9e20","source-47976894c870049312761832","source-4f031a975bf8b94eb8d72e84","source-50e11b6b638f7049f18b0e16","source-5219013542fc29ba1d534591","source-62df0f711e5ae203237bb4a1","source-6f36d055862923caea3a35e1","source-aa62885d24943041e4096545","source-b33145fb261ad05c13b57e8d","source-ca4e97785c37f540250cf9fa","source-caf09c280275a6ebe087fe80","source-d04f52986688fcbd24d8cda7","source-de3b9139421e60c0585e67ab","source-ebfc5cdf5f699bf21c7f452d","source-ef195dcb7064aa411dcd1bb3","source-f7857de29e60e9f3caa993eb","source-f81376e6cca60ec0168ede79"],"tranches":[{"archiveManifestSha256":"36e477ee9b752ebf7f07a208c166fec24e14a89bf7ba6a7921cf6bdf708c9f31","carrierPatchSha256":"294c11760ed94bdddec8f37f6f9517f42f7e9c6442ad23df6041ff9f470bbab5","fromSha":"49f39e1a6ec35e5db98e9ef698d4ce43369c9760","id":"processing-t17","legacyHeads":[{"baseSha":"49f39e1a6ec35e5db98e9ef698d4ce43369c9760","headSha":"7ea786afd5715d841526000a402c831d6c2a203c","kind":"closed_pull_request","originalBundleHead":"7ea786afd5715d841526000a402c831d6c2a203c","pullRequestNumber":152,"recoveryBundleHead":"7ea786afd5715d841526000a402c831d6c2a203c","ref":"refs/remotes/origin/codex/task17-deadlines-process-control-paths-20260724"}],"toSha":"7ea786afd5715d841526000a402c831d6c2a203c"}]}`
- GO requirements: none beyond normal slice prerequisites
- Approval requirements: scoped_B_work; explicit_C_publication_integration
- Product reachability: only_after_verified_prerequisites
- Preserved invariants: PHYSICAL_PATH_CONTAINMENT; windows_unc_junction; japanese_spaces_multi_root
- Explicit omissions: raw_report_path_display
- Target surfaces: extensions/bob-bazaar-review/src/sharedProcessingBudgetRuntime.ts; extensions/bob-bazaar-review/src/workspace/workspaceResolver.ts; extensions/bob-bazaar-review/src/workspace/workspaceRoots.ts; extensions/bob-code-consistency-review/src/core/fileSystem.ts; extensions/bob-code-consistency-review/src/core/reviewInputBuilder.ts; extensions/bob-code-consistency-review/src/sharedProcessingBudgetRuntime.ts; extensions/bob-code-consistency-review/src/workspaceResolver.ts; extensions/bob-code-consistency-review/src/workspaceRoots.ts; extensions/bob-code-consistency-review/test/task17PathSyntax.test.js; extensions/workflow-register/src/core/workspaceRoots.ts; extensions/workflow-register/src/shared-processing-budget-runtime/path-policy.js; extensions/workflow-register/src/sharedProcessingBudgetRuntime.ts; extensions/workflow-register/test/task17SharedPathRuntime.test.js; extensions/workflow-register/test/workspaceRoots.test.js; extensions/workflow-register/tsconfig.json; packages/processing-budget-runtime/runtime/bounded-file.js; packages/processing-budget-runtime/runtime/path-policy.js; packages/processing-budget-runtime/src/index.ts; packages/processing-budget-runtime/src/pathPolicy.ts; packages/processing-budget-runtime/test/pathPolicy.test.js; packages/processing-budget-runtime/test/pathPolicyAbsoluteSegments.test.js; packages/processing-budget-runtime/test/task17IntegrationContract.test.js
- CI: exact_reviewed_candidate_head; exact_merged_main_head; ubuntu_windows
- RED: prove_new_contract_failure_before_implementation
- UAT: same_hashed_vsix_for_changed_product_surfaces; final_three_extension_real_machine_uat
- focused: PHYSICAL_PATH_CONTAINMENT; windows_unc_junction; japanese_spaces_multi_root
- full: all_affected_extension_tests; three_extension_quality_gates

## PROC-T18-REPORT

strict deterministic reportをshadow比較する。

- Source: `{"kind":"archive","sourceItemIds":["source-10fcba6023328c4b7224a77a","source-126064185b6123a536a663d2","source-1989d7a99664ed7704314edf","source-1e9f07d82474ab751e932877","source-1ec3af946c25ef88797a2bd6","source-27b48797011bf83f1eb80391","source-2c291b5d938be3b5d376b5a2","source-2e754cd2101ad26c6702b242","source-3224e934a9f612e8e17d2f4f","source-394edf9f1a86f2b1eb6bbcc8","source-3b42c17309022b8d81e10e40","source-3baea552da259804ed36fb01","source-4598e653da287a68a574650e","source-49d99bc2c6863f64d71f88da","source-5115b3e605487c5bf7585e23","source-5156efa0941959246e595695","source-5f2f60689df7964a3fe4fa56","source-6f4fe152412c275a26ef800d","source-755991a7e0fc967724e8c0f9","source-89d0e5f328845d309a4f36b2","source-99311c4ce299ef0aa83c05d1","source-9e02784b89c52dedd2cc178f","source-a5ee11c6fe89e01547ca21ac","source-ad7b565fdec29b64c3dc84cd","source-ae183cbe4c9b75ab525591e6","source-b491a6068d95f0fce3be3671","source-ba2be74a97fc42e035b5c504","source-c1ea5dfe65e4163d347fcdf0","source-c700c2499c181ae03baac177","source-de0de82ae384806c1fca5b31","source-e6cc56c09eaf6e145c50b409","source-f3f205bf99923a7ac27a4b0e","source-f8996765a53be5a6b3ada292"],"tranches":[{"archiveManifestSha256":"36e477ee9b752ebf7f07a208c166fec24e14a89bf7ba6a7921cf6bdf708c9f31","carrierPatchSha256":"294c11760ed94bdddec8f37f6f9517f42f7e9c6442ad23df6041ff9f470bbab5","fromSha":"7ea786afd5715d841526000a402c831d6c2a203c","id":"processing-t18","legacyHeads":[{"baseSha":"7ea786afd5715d841526000a402c831d6c2a203c","headSha":"2d8a570fa1c0646fd662346744449b1abc1142b2","kind":"closed_pull_request","originalBundleHead":"2d8a570fa1c0646fd662346744449b1abc1142b2","pullRequestNumber":159,"recoveryBundleHead":"2d8a570fa1c0646fd662346744449b1abc1142b2","ref":"refs/remotes/origin/codex/task18-processing-budget-report-handoff-20260726"}],"toSha":"2d8a570fa1c0646fd662346744449b1abc1142b2"}]}`
- GO requirements: none beyond normal slice prerequisites
- Approval requirements: scoped_B_work; explicit_C_publication_integration
- Product reachability: only_after_verified_prerequisites
- Preserved invariants: closed_report_schema; success_zero_issues_finalized_only_complete; REPORT_SHADOW_BEFORE_BLOCKING
- Explicit omissions: early_blocking_handoff
- Target surfaces: extensions/bob-bazaar-review/src/bazaar/bazaarProcessingCoverage.ts; extensions/bob-bazaar-review/src/bazaar/reviewTarget.ts; extensions/bob-bazaar-review/src/bazaar/revisionInfo.ts; extensions/bob-bazaar-review/src/sharedProcessingBudgetReport.ts; extensions/bob-bazaar-review/src/sharedProcessingBudgetRuntime.ts; extensions/bob-bazaar-review/test/addedFilesContentEvidence.test.js; extensions/bob-bazaar-review/test/addedFilesProcessingCoverage.test.js; extensions/bob-bazaar-review/test/bazaarProcessingCommandIdentity.test.js; extensions/bob-bazaar-review/test/bazaarProcessingCoverage.test.js; extensions/bob-bazaar-review/test/bazaarProcessingFailureCode.test.js; extensions/bob-code-consistency-review/src/core/pipeline.ts; extensions/bob-code-consistency-review/src/core/processingBudgetCoverage.ts; extensions/bob-code-consistency-review/src/core/processingOperationInput.ts; extensions/bob-code-consistency-review/src/sharedProcessingBudgetReport.ts; extensions/bob-code-consistency-review/src/sharedProcessingBudgetRuntime.ts; extensions/bob-code-consistency-review/test/processingArtifactLedgerIdentity.test.js; extensions/bob-code-consistency-review/test/processingBudgetHandoff.test.js; extensions/bob-code-consistency-review/test/processingBudgetStageIdentity.test.js; extensions/bob-code-consistency-review/test/processingBudgetWarningFamilies.test.js; extensions/bob-code-consistency-review/test/processingFailureCode.test.js; extensions/bob-code-consistency-review/test/processingOperationFractionalNumber.test.js; extensions/bob-code-consistency-review/test/processingOperationInput.test.js; extensions/bob-code-consistency-review/test/processingOperationPrimitiveDomain.test.js; extensions/bob-code-consistency-review/test/processingOperationUndefinedPresence.test.js; packages/processing-budget-runtime/schema/processing-budget-report.meta.schema.json; packages/processing-budget-runtime/schema/processing-budget-report.v1.schema.json; packages/processing-budget-runtime/src/index.ts; packages/processing-budget-runtime/src/processingBudgetReport.ts; packages/processing-budget-runtime/src/processingBudgetReportPublic.ts; packages/processing-budget-runtime/test/processingBudgetReport.test.js; packages/processing-budget-runtime/test/processingBudgetReportDenseArrays.test.js; packages/processing-budget-runtime/test/processingBudgetReportSchema.test.js; packages/processing-budget-runtime/test/processingBudgetReportSchemaText.test.js
- CI: exact_reviewed_candidate_head; exact_merged_main_head; ubuntu_windows
- RED: prove_new_contract_failure_before_implementation
- UAT: same_hashed_vsix_for_changed_product_surfaces; final_three_extension_real_machine_uat
- focused: closed_report_schema; success_zero_issues_finalized_only_complete; REPORT_SHADOW_BEFORE_BLOCKING
- full: all_affected_extension_tests; three_extension_quality_gates

## PROC-T18-CCR-HANDOFF

verified snapshotとcomplete-only handoff/rollbackを接続する。

- Source: `{"kind":"archive","sourceItemIds":["source-16a204d54fe67ae4779c47be","source-18eb570fe8122555b5162451","source-201a758d2c574b15ee621648","source-2d58717b603fd53b87717fbb","source-303a9827be5534d28ae9faa3","source-31a92de444e0022d4b7a4a90","source-4a14f990f0f7a31143fb4315","source-7d6321e410fcbc313aae8ff1","source-801768019e34c2f11d9a1dd1","source-803a62f006f784c3e094425c","source-8e3b86b3a6de7af9e1618c70","source-9bc9f210f1d28338ae8fb4fd","source-9d316c3268f51794c2003b24","source-af6a5d55a61245d8751451e4","source-bad557b70efbcace66d9fb13","source-bb36cc223579317b73b3e641","source-bce85497eb40decefc886f6c","source-be55c3c119eead1776236c35","source-f904cb6ca0ff2960c755990a"],"tranches":[{"archiveManifestSha256":"36e477ee9b752ebf7f07a208c166fec24e14a89bf7ba6a7921cf6bdf708c9f31","carrierPatchSha256":"294c11760ed94bdddec8f37f6f9517f42f7e9c6442ad23df6041ff9f470bbab5","fromSha":"7ea786afd5715d841526000a402c831d6c2a203c","id":"processing-t18","legacyHeads":[{"baseSha":"7ea786afd5715d841526000a402c831d6c2a203c","headSha":"2d8a570fa1c0646fd662346744449b1abc1142b2","kind":"closed_pull_request","originalBundleHead":"2d8a570fa1c0646fd662346744449b1abc1142b2","pullRequestNumber":159,"recoveryBundleHead":"2d8a570fa1c0646fd662346744449b1abc1142b2","ref":"refs/remotes/origin/codex/task18-processing-budget-report-handoff-20260726"}],"toSha":"2d8a570fa1c0646fd662346744449b1abc1142b2"}]}`
- GO requirements: none beyond normal slice prerequisites
- Approval requirements: scoped_B_work; explicit_C_publication_integration
- Product reachability: only_after_verified_prerequisites
- Preserved invariants: verified_snapshot; complete_only; atomic_rollback
- Explicit omissions: incomplete_handoff
- Target surfaces: extensions/bob-code-consistency-review/src/core/atomicReplaceFile.ts; extensions/bob-code-consistency-review/src/core/pipeline.ts; extensions/bob-code-consistency-review/src/core/preprocessCleanupTransaction.ts; extensions/bob-code-consistency-review/src/core/preprocessCoverageBoundary.ts; extensions/bob-code-consistency-review/src/core/preprocessTypes.ts; extensions/bob-code-consistency-review/src/core/processingBudgetCoverage.ts; extensions/bob-code-consistency-review/src/core/processingBudgetReportGuard.ts; extensions/bob-code-consistency-review/src/core/processingCoverageError.ts; extensions/bob-code-consistency-review/src/core/reviewPackageCoverageGuard.ts; extensions/bob-code-consistency-review/src/core/verifiedReviewPackage.ts; extensions/bob-code-consistency-review/src/reviewExecutionCommands.ts; extensions/bob-code-consistency-review/test/preprocessBoundaryCancellation.test.js; extensions/bob-code-consistency-review/test/preprocessCleanupRollback.test.js; extensions/bob-code-consistency-review/test/processingBudgetCompletionAssertion.test.js; extensions/bob-code-consistency-review/test/processingBudgetHandoff.test.js; extensions/bob-code-consistency-review/test/processingCoverageFinalCancellation.test.js; extensions/bob-code-consistency-review/test/reviewPackageCoverageCleanup.test.js; extensions/bob-code-consistency-review/test/verifiedReviewPackageCancellation.test.js; extensions/bob-code-consistency-review/test/verifiedReviewPackageWorkspaceBoundary.test.js
- CI: exact_reviewed_candidate_head; exact_merged_main_head; ubuntu_windows
- RED: prove_new_contract_failure_before_implementation
- UAT: same_hashed_vsix_for_changed_product_surfaces; final_three_extension_real_machine_uat
- focused: verified_snapshot; complete_only; atomic_rollback
- full: all_affected_extension_tests; three_extension_quality_gates

## PROC-T18-BZR-HANDOFF

GUI/run failure persistenceとcomplete-only atomic replacementを接続する。

- Source: `{"kind":"archive","sourceItemIds":["source-176fed7efa554a786ecc23df","source-19d222b534b627f412fdd53c","source-1a8ac05bed133639db4b132d","source-2269303d724dff4f1d38b1a3","source-27133ef013bd7994415d3180","source-33620672a8fd3907321bbd6c","source-36e0a0a4e27788af32dba442","source-4c78c545babfbae8e93c6c13","source-6405858a097b1bd5e2f80d30","source-67f9d036814509f2a04e92ce","source-9541bc7c3682a1884683af85","source-96bdd8242f50fe80fcde07d9","source-9a74d6db2fd202c510a25c88","source-9b016ff62347354a74c4f2ac","source-b6559f4252d41eb4e54ca77c","source-cd4146faf60909d221d9de06","source-cf0fd4106530603ac4766aba","source-f6fc2b5e885ec08c5c76a614","source-f754fb5af53527cbc82ca313"],"tranches":[{"archiveManifestSha256":"36e477ee9b752ebf7f07a208c166fec24e14a89bf7ba6a7921cf6bdf708c9f31","carrierPatchSha256":"294c11760ed94bdddec8f37f6f9517f42f7e9c6442ad23df6041ff9f470bbab5","fromSha":"7ea786afd5715d841526000a402c831d6c2a203c","id":"processing-t18","legacyHeads":[{"baseSha":"7ea786afd5715d841526000a402c831d6c2a203c","headSha":"2d8a570fa1c0646fd662346744449b1abc1142b2","kind":"closed_pull_request","originalBundleHead":"2d8a570fa1c0646fd662346744449b1abc1142b2","pullRequestNumber":159,"recoveryBundleHead":"2d8a570fa1c0646fd662346744449b1abc1142b2","ref":"refs/remotes/origin/codex/task18-processing-budget-report-handoff-20260726"}],"toSha":"2d8a570fa1c0646fd662346744449b1abc1142b2"}]}`
- GO requirements: none beyond normal slice prerequisites
- Approval requirements: scoped_B_work; explicit_C_publication_integration
- Product reachability: only_after_verified_prerequisites
- Preserved invariants: current_gui_diagnostics; complete_only; atomic_replacement
- Explicit omissions: mechanical_rule_authoring_gui_base_split
- Target surfaces: extensions/bob-bazaar-review/src/bazaar/atomicReplaceFile.ts; extensions/bob-bazaar-review/src/bazaar/bazaarProcessingCoverage.ts; extensions/bob-bazaar-review/src/bazaar/bazaarReviewCommands.ts; extensions/bob-bazaar-review/src/bazaar/reviewTarget.ts; extensions/bob-bazaar-review/src/bazaar/revisionInfo.ts; extensions/bob-bazaar-review/src/reviewRuns/reviewRunProcessingFailure.ts; extensions/bob-bazaar-review/src/ui/reviewGui.ts; extensions/bob-bazaar-review/test/addedFilesFailureTargets.test.js; extensions/bob-bazaar-review/test/addedFilesProcessingCoverage.test.js; extensions/bob-bazaar-review/test/bazaarCommandHandoffCancellation.test.js; extensions/bob-bazaar-review/test/bazaarEvidenceLossCoverage.test.js; extensions/bob-bazaar-review/test/bazaarProcessingAtomicReplace.test.js; extensions/bob-bazaar-review/test/bazaarProcessingCoverage.test.js; extensions/bob-bazaar-review/test/bazaarProcessingCoverageIntegration.test.js; extensions/bob-bazaar-review/test/bazaarProcessingFinalCancellation.test.js; extensions/bob-bazaar-review/test/bazaarProcessingPreparedCheckpoint.test.js; extensions/bob-bazaar-review/test/reviewRunCoordinator.test.js; extensions/bob-bazaar-review/test/reviewRunProcessingFailure.test.js; extensions/bob-bazaar-review/test/reviewTargetLogFailure.test.js
- CI: exact_reviewed_candidate_head; exact_merged_main_head; ubuntu_windows
- RED: prove_new_contract_failure_before_implementation
- UAT: same_hashed_vsix_for_changed_product_surfaces; final_three_extension_real_machine_uat
- focused: current_gui_diagnostics; complete_only; atomic_replacement
- full: all_affected_extension_tests; three_extension_quality_gates

## FINAL-VALIDATION-CONTROL

fixed product mainと外部attestationの検証手順を固定する。

- Source: `{"implementationSourcePolicy":"no_implementation_source_before_committed_spec_review","kind":"new_design","requiredSpecIdentity":"FEATURE-SELECTION-AND-SEQUENTIAL-MAIN-INTEGRATION@2026-08-23"}`
- GO requirements: none beyond normal slice prerequisites
- Approval requirements: scoped_B_work; explicit_C_publication_integration
- Product reachability: only_after_verified_prerequisites
- Preserved invariants: fixed_product_main; three_vsix_same_artifact_uat; non_mutating_validation_phases; payload_identical_optional_closure
- Explicit omissions: self_referential_future_merge; automatic_cleanup
- Target surfaces: control/evidence only
- CI: exact_reviewed_candidate_head; exact_merged_main_head; ubuntu_windows
- RED: prove_new_contract_failure_before_implementation
- UAT: same_hashed_vsix_for_changed_product_surfaces; final_three_extension_real_machine_uat
- focused: fixed_product_main; three_vsix_same_artifact_uat; non_mutating_validation_phases; payload_identical_optional_closure
- full: all_affected_extension_tests; three_extension_quality_gates

## WF2-R3-WINDOWS-ADAPTER

独立したGO条件と承認を満たした後だけ実装を検討する。

- Source: `{"implementationSourcePolicy":"no_implementation_source_before_committed_spec_review","kind":"new_design","requiredSpecIdentity":"WF2-R3-WINDOWS-ADAPTER-DESIGN@1"}`
- GO requirements: committed_spec_identity:WF2-R3-WINDOWS-ADAPTER-DESIGN@1; windows_adversarial_reparse_junction_mount_hardlink_identity_proof; no_overwrite_same_volume_atomic_flush_failure_injection; security_review; explicit_GO
- Approval requirements: separate_explicit_GO; scoped_B_work; explicit_C_publication_integration
- Product reachability: separate_activation_required
- Preserved invariants: inactive_until_separate_GO; default_shadow; no_workspace_environment_activation
- Explicit omissions: automatic_selection_from_predecessor_merge
- Target surfaces: control/evidence only
- CI: exact_reviewed_candidate_head; exact_merged_main_head; ubuntu_windows
- RED: prove_new_contract_failure_before_implementation
- UAT: same_hashed_vsix_for_changed_product_surfaces; final_three_extension_real_machine_uat
- focused: inactive_until_separate_GO; default_shadow; no_workspace_environment_activation
- full: all_affected_extension_tests; three_extension_quality_gates

## WF2-R3-ARTIFACT-TX

独立したGO条件と承認を満たした後だけ実装を検討する。

- Source: `{"kind":"archive","sourceItemIds":["source-019c995cdf5d0cd326d5ddc0","source-7d5b9b0f1f44489ab6c9b709","source-80a3429ee46bc8ebb7c64ac9","source-8bd330be0e18a8152c060000","source-8d7ffdb614cbb1a8db423f89","source-98807ab1ee6c8bdac14eb58b","source-c3ae7291d50d386e060d0aa7","source-c703fda5b8fe92276d3af8ad","source-f8f725c5bb37f2e55a8a2900"],"tranches":[{"archiveManifestSha256":"36e477ee9b752ebf7f07a208c166fec24e14a89bf7ba6a7921cf6bdf708c9f31","carrierPatchSha256":"2852e9e0e535bbb63165ae01538dd271bd888afe0b7f7dcbca53d193ef24912f","fromSha":"e860d1ebbafe7068fc6871b16c9586a11b4fe19d","id":"workflow-c","legacyHeads":[{"baseSha":"e860d1ebbafe7068fc6871b16c9586a11b4fe19d","headSha":"66e005faf0046ca931c83abc41ce533488d2f581","kind":"closed_pull_request","originalBundleHead":"66e005faf0046ca931c83abc41ce533488d2f581","pullRequestNumber":158,"recoveryBundleHead":"66e005faf0046ca931c83abc41ce533488d2f581","ref":"refs/remotes/origin/codex/workflow-contract-v2-r1"},{"baseSha":"66e005faf0046ca931c83abc41ce533488d2f581","headSha":"7bad4e42f2146b8ae229e05427a5d2ae013cdb2e","kind":"closed_pull_request","originalBundleHead":"7bad4e42f2146b8ae229e05427a5d2ae013cdb2e","pullRequestNumber":160,"recoveryBundleHead":"7bad4e42f2146b8ae229e05427a5d2ae013cdb2e","ref":"refs/remotes/origin/codex/workflow-contract-v2-r2"},{"baseSha":"7bad4e42f2146b8ae229e05427a5d2ae013cdb2e","headSha":"e0a4b1b25166c4d47cf8f5564c01cf30c63d9180","kind":"closed_pull_request","originalBundleHead":"e0a4b1b25166c4d47cf8f5564c01cf30c63d9180","pullRequestNumber":161,"recoveryBundleHead":"e0a4b1b25166c4d47cf8f5564c01cf30c63d9180","ref":"refs/remotes/origin/codex/workflow-contract-v2-r3"},{"baseSha":"e0a4b1b25166c4d47cf8f5564c01cf30c63d9180","headSha":"266f13f8544338ce0445c749f4625a1f80791c36","kind":"closed_pull_request","originalBundleHead":"266f13f8544338ce0445c749f4625a1f80791c36","pullRequestNumber":162,"recoveryBundleHead":"266f13f8544338ce0445c749f4625a1f80791c36","ref":"refs/remotes/origin/codex/workflow-contract-v2-r4"},{"baseSha":"266f13f8544338ce0445c749f4625a1f80791c36","headSha":"de65647c18a122b6f88af3967ba509282b64d6db","kind":"closed_pull_request","originalBundleHead":"de65647c18a122b6f88af3967ba509282b64d6db","pullRequestNumber":163,"recoveryBundleHead":"de65647c18a122b6f88af3967ba509282b64d6db","ref":"refs/remotes/origin/codex/workflow-contract-v2-r5"},{"baseSha":"de65647c18a122b6f88af3967ba509282b64d6db","headSha":"a18c09b10fa51702d312e34940a694ad971a48cc","kind":"closed_pull_request","originalBundleHead":"a18c09b10fa51702d312e34940a694ad971a48cc","pullRequestNumber":164,"recoveryBundleHead":"a18c09b10fa51702d312e34940a694ad971a48cc","ref":"refs/remotes/origin/codex/workflow-contract-v2-r6"}],"toSha":"a18c09b10fa51702d312e34940a694ad971a48cc"}]}`
- GO requirements: windows_adapter_verified; linux_windows_artifact_transaction_parity; explicit_GO
- Approval requirements: separate_explicit_GO; scoped_B_work; explicit_C_publication_integration
- Product reachability: separate_activation_required
- Preserved invariants: inactive_until_separate_GO; default_shadow; no_workspace_environment_activation
- Explicit omissions: automatic_selection_from_predecessor_merge
- Target surfaces: extensions/workflow-register/src/core/contractV2/artifactContentValidation.ts; extensions/workflow-register/src/core/contractV2/artifactSetV2.ts; extensions/workflow-register/src/core/contractV2/artifactTransaction.ts; extensions/workflow-register/src/core/contractV2/attemptArtifactWorkspace.ts; extensions/workflow-register/src/core/contractV2/attemptArtifactWorkspaceLinux.ts; extensions/workflow-register/test/workflowContractV2ArtifactPlatformFailClosed.test.js; extensions/workflow-register/test/workflowContractV2ArtifactTransaction.test.js; extensions/workflow-register/test/workflowContractV2ArtifactTransactionReviewCases.test.js; extensions/workflow-register/test/workflowContractV2ProviderInvocationTestSupport.js
- CI: exact_reviewed_candidate_head; exact_merged_main_head; ubuntu_windows
- RED: prove_new_contract_failure_before_implementation
- UAT: same_hashed_vsix_for_changed_product_surfaces; final_three_extension_real_machine_uat
- focused: inactive_until_separate_GO; default_shadow; no_workspace_environment_activation
- full: all_affected_extension_tests; three_extension_quality_gates

## WF2-R4-EXECUTOR

独立したGO条件と承認を満たした後だけ実装を検討する。

- Source: `{"kind":"archive","sourceItemIds":["source-016f44736fcd2bb137b3be81","source-3d984f11c0ee20d0bae02aba","source-4a0aadeb973f48b645778d59","source-4efd833dfee834ecbf390c76","source-5294fb607798bbb272cb9cda","source-538762670809484047410b5c","source-61972ab69dff727d73b81231","source-78c261d75a6572afd9103a67","source-94194ee1dba8f868d0ff9ed8","source-9b2c73f17f281c878e5e2b4e","source-9b610312085b3c0ee241b151","source-b34cfecc5780177b7e7a6602","source-b42ad7fac197b9e39191d933","source-b53c2ffd6380fb43f64ba82c","source-c16ed9fb4a5aafaa5d62872e","source-c25dcfd41610e3599d785c9c","source-e12579c149150d82df1c4698"],"tranches":[{"archiveManifestSha256":"36e477ee9b752ebf7f07a208c166fec24e14a89bf7ba6a7921cf6bdf708c9f31","carrierPatchSha256":"2852e9e0e535bbb63165ae01538dd271bd888afe0b7f7dcbca53d193ef24912f","fromSha":"e860d1ebbafe7068fc6871b16c9586a11b4fe19d","id":"workflow-c","legacyHeads":[{"baseSha":"e860d1ebbafe7068fc6871b16c9586a11b4fe19d","headSha":"66e005faf0046ca931c83abc41ce533488d2f581","kind":"closed_pull_request","originalBundleHead":"66e005faf0046ca931c83abc41ce533488d2f581","pullRequestNumber":158,"recoveryBundleHead":"66e005faf0046ca931c83abc41ce533488d2f581","ref":"refs/remotes/origin/codex/workflow-contract-v2-r1"},{"baseSha":"66e005faf0046ca931c83abc41ce533488d2f581","headSha":"7bad4e42f2146b8ae229e05427a5d2ae013cdb2e","kind":"closed_pull_request","originalBundleHead":"7bad4e42f2146b8ae229e05427a5d2ae013cdb2e","pullRequestNumber":160,"recoveryBundleHead":"7bad4e42f2146b8ae229e05427a5d2ae013cdb2e","ref":"refs/remotes/origin/codex/workflow-contract-v2-r2"},{"baseSha":"7bad4e42f2146b8ae229e05427a5d2ae013cdb2e","headSha":"e0a4b1b25166c4d47cf8f5564c01cf30c63d9180","kind":"closed_pull_request","originalBundleHead":"e0a4b1b25166c4d47cf8f5564c01cf30c63d9180","pullRequestNumber":161,"recoveryBundleHead":"e0a4b1b25166c4d47cf8f5564c01cf30c63d9180","ref":"refs/remotes/origin/codex/workflow-contract-v2-r3"},{"baseSha":"e0a4b1b25166c4d47cf8f5564c01cf30c63d9180","headSha":"266f13f8544338ce0445c749f4625a1f80791c36","kind":"closed_pull_request","originalBundleHead":"266f13f8544338ce0445c749f4625a1f80791c36","pullRequestNumber":162,"recoveryBundleHead":"266f13f8544338ce0445c749f4625a1f80791c36","ref":"refs/remotes/origin/codex/workflow-contract-v2-r4"},{"baseSha":"266f13f8544338ce0445c749f4625a1f80791c36","headSha":"de65647c18a122b6f88af3967ba509282b64d6db","kind":"closed_pull_request","originalBundleHead":"de65647c18a122b6f88af3967ba509282b64d6db","pullRequestNumber":163,"recoveryBundleHead":"de65647c18a122b6f88af3967ba509282b64d6db","ref":"refs/remotes/origin/codex/workflow-contract-v2-r5"},{"baseSha":"de65647c18a122b6f88af3967ba509282b64d6db","headSha":"a18c09b10fa51702d312e34940a694ad971a48cc","kind":"closed_pull_request","originalBundleHead":"a18c09b10fa51702d312e34940a694ad971a48cc","pullRequestNumber":164,"recoveryBundleHead":"a18c09b10fa51702d312e34940a694ad971a48cc","ref":"refs/remotes/origin/codex/workflow-contract-v2-r6"}],"toSha":"a18c09b10fa51702d312e34940a694ad971a48cc"}]}`
- GO requirements: artifact_transaction_verified; compiled_execution_no_reparse; explicit_GO
- Approval requirements: separate_explicit_GO; scoped_B_work; explicit_C_publication_integration
- Product reachability: separate_activation_required
- Preserved invariants: inactive_until_separate_GO; default_shadow; no_workspace_environment_activation
- Explicit omissions: automatic_selection_from_predecessor_merge
- Target surfaces: extensions/workflow-register/src/core/contractV2/compiledRunExecutor.ts; extensions/workflow-register/src/core/contractV2/compiledRunInputs.ts; extensions/workflow-register/src/core/contractV2/compiledRunSteps.ts; extensions/workflow-register/src/core/contractV2/compiledRunTypes.ts; extensions/workflow-register/src/core/contractV2/compiledRunValues.ts; extensions/workflow-register/src/core/contractV2/providerAttemptStaging.ts; extensions/workflow-register/src/workflowContractV2RunExecutor.ts; extensions/workflow-register/src/workflowRegisterService.ts; extensions/workflow-register/test/workflowContractV2CompiledRunAtomicity.test.js; extensions/workflow-register/test/workflowContractV2CompiledRunExecutor.test.js; extensions/workflow-register/test/workflowContractV2CompiledRunExecutorArchitecture.test.js; extensions/workflow-register/test/workflowContractV2CompiledRunExecutorTestSupport.js; extensions/workflow-register/test/workflowContractV2CompiledRunFollowupReview.test.js; extensions/workflow-register/test/workflowContractV2CompiledRunReviewArchitecture.test.js; extensions/workflow-register/test/workflowContractV2CompiledRunReviewCases.test.js; extensions/workflow-register/test/workflowContractV2ExecutionBoundary.test.js
- CI: exact_reviewed_candidate_head; exact_merged_main_head; ubuntu_windows
- RED: prove_new_contract_failure_before_implementation
- UAT: same_hashed_vsix_for_changed_product_surfaces; final_three_extension_real_machine_uat
- focused: inactive_until_separate_GO; default_shadow; no_workspace_environment_activation
- full: all_affected_extension_tests; three_extension_quality_gates

## WF2-R5-BOB

独立したGO条件と承認を満たした後だけ実装を検討する。

- Source: `{"kind":"archive","sourceItemIds":["source-09182ccb2c40b3b86eed340e","source-11ca11edf36ec8e30cec5745","source-1f4210adfc6ed84512738e47","source-2c63e68948995844eccba2ba","source-4fe64eb225784edc6cb0dfbc","source-685712c718e0fc99204a8363","source-7562832c7a70c95e37804221","source-796d77fe51d8eede02f4b8d9","source-7bbfd459d31e9a487d1b45ea","source-7e294b1663bc5ee0222ffcf6","source-953d5c8bae1672e20051e94c","source-a92768b7e7c911e7dfa0ed75","source-aed1b503cd6d42355a5252da","source-b34effffdee1aaefaf071226","source-c72737ff1d4766b1f111f852","source-d426695e21f4a57eaa2e650b","source-da2feeae2c1db949eb941ed1","source-e793797efde60a580b26b863","source-ee83d0ea1a94fff4b49b92b3","source-f5cc6d57f7acdbfab147248d","source-fbf7b8c30abef77aac8614f0"],"tranches":[{"archiveManifestSha256":"36e477ee9b752ebf7f07a208c166fec24e14a89bf7ba6a7921cf6bdf708c9f31","carrierPatchSha256":"2852e9e0e535bbb63165ae01538dd271bd888afe0b7f7dcbca53d193ef24912f","fromSha":"e860d1ebbafe7068fc6871b16c9586a11b4fe19d","id":"workflow-c","legacyHeads":[{"baseSha":"e860d1ebbafe7068fc6871b16c9586a11b4fe19d","headSha":"66e005faf0046ca931c83abc41ce533488d2f581","kind":"closed_pull_request","originalBundleHead":"66e005faf0046ca931c83abc41ce533488d2f581","pullRequestNumber":158,"recoveryBundleHead":"66e005faf0046ca931c83abc41ce533488d2f581","ref":"refs/remotes/origin/codex/workflow-contract-v2-r1"},{"baseSha":"66e005faf0046ca931c83abc41ce533488d2f581","headSha":"7bad4e42f2146b8ae229e05427a5d2ae013cdb2e","kind":"closed_pull_request","originalBundleHead":"7bad4e42f2146b8ae229e05427a5d2ae013cdb2e","pullRequestNumber":160,"recoveryBundleHead":"7bad4e42f2146b8ae229e05427a5d2ae013cdb2e","ref":"refs/remotes/origin/codex/workflow-contract-v2-r2"},{"baseSha":"7bad4e42f2146b8ae229e05427a5d2ae013cdb2e","headSha":"e0a4b1b25166c4d47cf8f5564c01cf30c63d9180","kind":"closed_pull_request","originalBundleHead":"e0a4b1b25166c4d47cf8f5564c01cf30c63d9180","pullRequestNumber":161,"recoveryBundleHead":"e0a4b1b25166c4d47cf8f5564c01cf30c63d9180","ref":"refs/remotes/origin/codex/workflow-contract-v2-r3"},{"baseSha":"e0a4b1b25166c4d47cf8f5564c01cf30c63d9180","headSha":"266f13f8544338ce0445c749f4625a1f80791c36","kind":"closed_pull_request","originalBundleHead":"266f13f8544338ce0445c749f4625a1f80791c36","pullRequestNumber":162,"recoveryBundleHead":"266f13f8544338ce0445c749f4625a1f80791c36","ref":"refs/remotes/origin/codex/workflow-contract-v2-r4"},{"baseSha":"266f13f8544338ce0445c749f4625a1f80791c36","headSha":"de65647c18a122b6f88af3967ba509282b64d6db","kind":"closed_pull_request","originalBundleHead":"de65647c18a122b6f88af3967ba509282b64d6db","pullRequestNumber":163,"recoveryBundleHead":"de65647c18a122b6f88af3967ba509282b64d6db","ref":"refs/remotes/origin/codex/workflow-contract-v2-r5"},{"baseSha":"de65647c18a122b6f88af3967ba509282b64d6db","headSha":"a18c09b10fa51702d312e34940a694ad971a48cc","kind":"closed_pull_request","originalBundleHead":"a18c09b10fa51702d312e34940a694ad971a48cc","pullRequestNumber":164,"recoveryBundleHead":"a18c09b10fa51702d312e34940a694ad971a48cc","ref":"refs/remotes/origin/codex/workflow-contract-v2-r6"}],"toSha":"a18c09b10fa51702d312e34940a694ad971a48cc"}]}`
- GO requirements: exact_handle_lease; real_machine_bob_profile_probe; explicit_GO
- Approval requirements: separate_explicit_GO; scoped_B_work; explicit_C_publication_integration
- Product reachability: separate_activation_required
- Preserved invariants: inactive_until_separate_GO; default_shadow; no_workspace_environment_activation
- Explicit omissions: automatic_selection_from_predecessor_merge
- Target surfaces: extensions/workflow-register/src/bobWorkflowFactory.ts; extensions/workflow-register/src/core/contractV2/bobTaskMethodBinding.ts; extensions/workflow-register/src/core/contractV2/compiledRunExecutor.ts; extensions/workflow-register/src/core/contractV2/compiledRunInputs.ts; extensions/workflow-register/src/core/contractV2/compiledRunLoop.ts; extensions/workflow-register/src/core/contractV2/compiledRunTypes.ts; extensions/workflow-register/src/core/contractV2/compiledRunValues.ts; extensions/workflow-register/src/core/contractV2/planStore.ts; extensions/workflow-register/src/workflowContractV2BobExecutor.ts; extensions/workflow-register/src/workflowContractV2BobProductExecutor.ts; extensions/workflow-register/test/workflowContractV2BobCompiledExecution.test.js; extensions/workflow-register/test/workflowContractV2BobCompiledExecutionArchitecture.test.js; extensions/workflow-register/test/workflowContractV2BobCompiledExecutionHardening.test.js; extensions/workflow-register/test/workflowContractV2BobExactHandle.test.js; extensions/workflow-register/test/workflowContractV2BobInputReadiness.test.js; extensions/workflow-register/test/workflowContractV2BobReviewRound2.test.js; extensions/workflow-register/test/workflowContractV2BobRoutingConcurrency.test.js; extensions/workflow-register/test/workflowContractV2BobTaskMethodBinding.test.js; extensions/workflow-register/test/workflowContractV2CompiledInitialSaveRecovery.test.js; extensions/workflow-register/test/workflowContractV2CompiledRunContinuation.test.js; extensions/workflow-register/test/workflowContractV2ExecutionBoundary.test.js
- CI: exact_reviewed_candidate_head; exact_merged_main_head; ubuntu_windows
- RED: prove_new_contract_failure_before_implementation
- UAT: same_hashed_vsix_for_changed_product_surfaces; final_three_extension_real_machine_uat
- focused: inactive_until_separate_GO; default_shadow; no_workspace_environment_activation
- full: all_affected_extension_tests; three_extension_quality_gates

## WF2-R6-ARCHIVED

restart/resume matrixと残存artifact分類が不足するためarchive snapshotを採らない。

- Source: `{"kind":"archive","sourceItemIds":["source-2051d416e49954e09634c7ed","source-23ef029fb33793052ddc9001","source-2e0e63d825cf491d1922e307","source-2fb29342a01abe31e3d18f9a","source-40656a07adc5cc4f80d75510","source-454dada4039d3961efe56ec0","source-4e0b4bf434260cc41151ac06","source-4e950f82b16ed824792d7ae0","source-5681a1de308edf68b105998d","source-583ae398d8cf034d60f70a19","source-5ed71aa8dee3c408184b5167","source-734c3cbaf46b50e06430134a","source-7ef754ae59ee342963211de7","source-7f07993cdbcd31fb971d7292","source-8492929ccbf4e4e7516dfa77","source-89514da5f9297a2a073a769c","source-8fa3d05a66f65b14f13a23c3","source-9cc52a834c6aea8a25753584","source-a19b32d43066e13a87c2dc72","source-aa0db1aab1be001df117aef6","source-b9f28d9c236055510138155b","source-baf82d9ac92ee14d5662a30b","source-c28e612c6145c4fc213178d0","source-ca652a2c9d999bb36a7729f2","source-e40a45eb8079544de379b574","source-fdd27f3176a3c1a89812bf70"],"tranches":[{"archiveManifestSha256":"36e477ee9b752ebf7f07a208c166fec24e14a89bf7ba6a7921cf6bdf708c9f31","carrierPatchSha256":"2852e9e0e535bbb63165ae01538dd271bd888afe0b7f7dcbca53d193ef24912f","fromSha":"e860d1ebbafe7068fc6871b16c9586a11b4fe19d","id":"workflow-c","legacyHeads":[{"baseSha":"e860d1ebbafe7068fc6871b16c9586a11b4fe19d","headSha":"66e005faf0046ca931c83abc41ce533488d2f581","kind":"closed_pull_request","originalBundleHead":"66e005faf0046ca931c83abc41ce533488d2f581","pullRequestNumber":158,"recoveryBundleHead":"66e005faf0046ca931c83abc41ce533488d2f581","ref":"refs/remotes/origin/codex/workflow-contract-v2-r1"},{"baseSha":"66e005faf0046ca931c83abc41ce533488d2f581","headSha":"7bad4e42f2146b8ae229e05427a5d2ae013cdb2e","kind":"closed_pull_request","originalBundleHead":"7bad4e42f2146b8ae229e05427a5d2ae013cdb2e","pullRequestNumber":160,"recoveryBundleHead":"7bad4e42f2146b8ae229e05427a5d2ae013cdb2e","ref":"refs/remotes/origin/codex/workflow-contract-v2-r2"},{"baseSha":"7bad4e42f2146b8ae229e05427a5d2ae013cdb2e","headSha":"e0a4b1b25166c4d47cf8f5564c01cf30c63d9180","kind":"closed_pull_request","originalBundleHead":"e0a4b1b25166c4d47cf8f5564c01cf30c63d9180","pullRequestNumber":161,"recoveryBundleHead":"e0a4b1b25166c4d47cf8f5564c01cf30c63d9180","ref":"refs/remotes/origin/codex/workflow-contract-v2-r3"},{"baseSha":"e0a4b1b25166c4d47cf8f5564c01cf30c63d9180","headSha":"266f13f8544338ce0445c749f4625a1f80791c36","kind":"closed_pull_request","originalBundleHead":"266f13f8544338ce0445c749f4625a1f80791c36","pullRequestNumber":162,"recoveryBundleHead":"266f13f8544338ce0445c749f4625a1f80791c36","ref":"refs/remotes/origin/codex/workflow-contract-v2-r4"},{"baseSha":"266f13f8544338ce0445c749f4625a1f80791c36","headSha":"de65647c18a122b6f88af3967ba509282b64d6db","kind":"closed_pull_request","originalBundleHead":"de65647c18a122b6f88af3967ba509282b64d6db","pullRequestNumber":163,"recoveryBundleHead":"de65647c18a122b6f88af3967ba509282b64d6db","ref":"refs/remotes/origin/codex/workflow-contract-v2-r5"},{"baseSha":"de65647c18a122b6f88af3967ba509282b64d6db","headSha":"a18c09b10fa51702d312e34940a694ad971a48cc","kind":"closed_pull_request","originalBundleHead":"a18c09b10fa51702d312e34940a694ad971a48cc","pullRequestNumber":164,"recoveryBundleHead":"a18c09b10fa51702d312e34940a694ad971a48cc","ref":"refs/remotes/origin/codex/workflow-contract-v2-r6"}],"toSha":"a18c09b10fa51702d312e34940a694ad971a48cc"}]}`
- GO requirements: none beyond normal slice prerequisites
- Approval requirements: no_implementation_admission
- Product reachability: separate_activation_required
- Preserved invariants: inactive_until_separate_GO; default_shadow; no_workspace_environment_activation
- Explicit omissions: automatic_selection_from_predecessor_merge
- Target surfaces: extensions/workflow-register/src/core/contractV2/artifactTransactionRecovery.ts; extensions/workflow-register/src/core/contractV2/attemptArtifactWorkspaceInspection.ts; extensions/workflow-register/src/core/contractV2/compiledRunExecutor.ts; extensions/workflow-register/src/core/contractV2/compiledRunLoop.ts; extensions/workflow-register/src/core/contractV2/providerEffectIntent.ts; extensions/workflow-register/src/core/contractV2/runAttemptRecovery.ts; extensions/workflow-register/src/core/contractV2/runPlanRecovery.ts; extensions/workflow-register/src/core/contractV2/runRestartRecovery.ts; extensions/workflow-register/src/core/engine/recoveryState.ts; extensions/workflow-register/src/core/engine/runExecutionCoordinator.ts; extensions/workflow-register/src/workflowContractV2Entrypoint.ts; extensions/workflow-register/src/workflowContractV2RunRecovery.ts; extensions/workflow-register/src/workflowRunCommands.ts; extensions/workflow-register/src/workflowRuntimeFactory.ts; extensions/workflow-register/test/workflowContractV2ArtifactRecoveryArchitecture.test.js; extensions/workflow-register/test/workflowContractV2ArtifactRecoveryInspection.test.js; extensions/workflow-register/test/workflowContractV2AttemptRecovery.test.js; extensions/workflow-register/test/workflowContractV2AttemptRecoverySkipEvidence.test.js; extensions/workflow-register/test/workflowContractV2AttemptRecoverySkipHardening.test.js; extensions/workflow-register/test/workflowContractV2ProviderEffectIntent.test.js; extensions/workflow-register/test/workflowContractV2RecoveryLeaseLifecycle.test.js; extensions/workflow-register/test/workflowContractV2RestartIntent.test.js; extensions/workflow-register/test/workflowContractV2RestartPolicy.test.js; extensions/workflow-register/test/workflowContractV2RestartReentry.test.js; extensions/workflow-register/test/workflowContractV2Resume.test.js; extensions/workflow-register/test/workflowContractV2RetryRouting.test.js
- CI: exact_reviewed_candidate_head; exact_merged_main_head; ubuntu_windows
- RED: prove_new_contract_failure_before_implementation
- UAT: same_hashed_vsix_for_changed_product_surfaces; final_three_extension_real_machine_uat
- focused: inactive_until_separate_GO; default_shadow; no_workspace_environment_activation
- full: all_affected_extension_tests; three_extension_quality_gates

## PROC-ARCHIVED-IMPLEMENTATION-REMAINDER

現行mainまたはselected sliceが正本を所有する。旧実装・旧gate・旧payloadを移植しない。

- Source: `{"kind":"archive","sourceItemIds":["source-28cd959695154a83150090b4","source-2b1da614d7fab345c0baaec6","source-2eb513ec8a0f9c235ab3928c","source-3ec41ca4a670ccae38ce5ace","source-79538ea5d40f171fbe46570f","source-80f3da695e6d7d6d02f49660","source-8782a165a56c7f2ca9079bdc","source-9e2d758ed049f9c11c3e63f9","source-b2a64440acdc6241751cb96d","source-c5d5b65122e2c53ffd7d29d6","source-c5ef33df69d6a0783a978472","source-f66668790e4e97e10e4c9a4a"],"tranches":[{"archiveManifestSha256":"36e477ee9b752ebf7f07a208c166fec24e14a89bf7ba6a7921cf6bdf708c9f31","carrierPatchSha256":"6913ddddcffb150eb207aee99bdbbad158b4ed05e9c3ca8714693d31f6122536","fromSha":"bd29233dac84922e2f868dcb9d654644f6ee0d6a","id":"processing-t14","legacyHeads":[{"baseSha":"bd29233dac84922e2f868dcb9d654644f6ee0d6a","headSha":"4d0fb728763db9d13c87d000790a88c45900733e","kind":"closed_pull_request","originalBundleHead":"4d0fb728763db9d13c87d000790a88c45900733e","pullRequestNumber":146,"recoveryBundleHead":"4d0fb728763db9d13c87d000790a88c45900733e","ref":"refs/remotes/origin/codex/task14-bounded-document-extraction-20260723"}],"toSha":"4d0fb728763db9d13c87d000790a88c45900733e"},{"archiveManifestSha256":"36e477ee9b752ebf7f07a208c166fec24e14a89bf7ba6a7921cf6bdf708c9f31","carrierPatchSha256":"edd675378aa15650b5648308ae1f7621fa830844699ad4d06660463c9d2cb10b","fromSha":"4d0fb728763db9d13c87d000790a88c45900733e","id":"processing-t15","legacyHeads":[{"baseSha":"4d0fb728763db9d13c87d000790a88c45900733e","headSha":"7fc7a371e6506290d8626d06e9b12c2a67888b47","kind":"closed_pull_request","originalBundleHead":"7fc7a371e6506290d8626d06e9b12c2a67888b47","pullRequestNumber":147,"recoveryBundleHead":"7fc7a371e6506290d8626d06e9b12c2a67888b47","ref":"refs/remotes/origin/codex/task15-workbook-document-aggregate-caps-20260724"}],"toSha":"7fc7a371e6506290d8626d06e9b12c2a67888b47"},{"archiveManifestSha256":"36e477ee9b752ebf7f07a208c166fec24e14a89bf7ba6a7921cf6bdf708c9f31","carrierPatchSha256":"294c11760ed94bdddec8f37f6f9517f42f7e9c6442ad23df6041ff9f470bbab5","fromSha":"49f39e1a6ec35e5db98e9ef698d4ce43369c9760","id":"processing-t17","legacyHeads":[{"baseSha":"49f39e1a6ec35e5db98e9ef698d4ce43369c9760","headSha":"7ea786afd5715d841526000a402c831d6c2a203c","kind":"closed_pull_request","originalBundleHead":"7ea786afd5715d841526000a402c831d6c2a203c","pullRequestNumber":152,"recoveryBundleHead":"7ea786afd5715d841526000a402c831d6c2a203c","ref":"refs/remotes/origin/codex/task17-deadlines-process-control-paths-20260724"}],"toSha":"7ea786afd5715d841526000a402c831d6c2a203c"},{"archiveManifestSha256":"36e477ee9b752ebf7f07a208c166fec24e14a89bf7ba6a7921cf6bdf708c9f31","carrierPatchSha256":"294c11760ed94bdddec8f37f6f9517f42f7e9c6442ad23df6041ff9f470bbab5","fromSha":"7ea786afd5715d841526000a402c831d6c2a203c","id":"processing-t18","legacyHeads":[{"baseSha":"7ea786afd5715d841526000a402c831d6c2a203c","headSha":"2d8a570fa1c0646fd662346744449b1abc1142b2","kind":"closed_pull_request","originalBundleHead":"2d8a570fa1c0646fd662346744449b1abc1142b2","pullRequestNumber":159,"recoveryBundleHead":"2d8a570fa1c0646fd662346744449b1abc1142b2","ref":"refs/remotes/origin/codex/task18-processing-budget-report-handoff-20260726"}],"toSha":"2d8a570fa1c0646fd662346744449b1abc1142b2"}]}`
- GO requirements: none beyond normal slice prerequisites
- Approval requirements: no_implementation_admission
- Product reachability: zero
- Preserved invariants: current_main_authoritative
- Explicit omissions: all_owned_historical_implementation
- Target surfaces: extensions/bob-bazaar-review/src/bazaar/bazaarReviewCommands.ts; extensions/bob-bazaar-review/src/ruleAuthoring/extraction/docxExtractor.ts; extensions/bob-bazaar-review/src/ruleAuthoring/extraction/xlsxExtractor.ts; extensions/bob-bazaar-review/src/ui/reviewGui.ts; extensions/bob-bazaar-review/src/ui/ruleAuthoringGui.ts; extensions/bob-bazaar-review/src/ui/ruleAuthoringGuiBase.ts; extensions/bob-bazaar-review/test/extensionSourceLayout.test.js; extensions/bob-bazaar-review/test/ruleDocxExtraction.test.js; extensions/bob-bazaar-review/test/ruleXlsxAggregateBudget.test.js; extensions/bob-bazaar-review/test/ruleXlsxExtraction.test.js; extensions/bob-code-consistency-review/package.json; extensions/bob-code-consistency-review/src/core/reviewInputBuilderBase.ts
- CI: exact_reviewed_candidate_head; exact_merged_main_head; ubuntu_windows
- RED: prove_new_contract_failure_before_implementation
- UAT: same_hashed_vsix_for_changed_product_surfaces; final_three_extension_real_machine_uat
- focused: current_main_authoritative
- full: all_affected_extension_tests; three_extension_quality_gates

## REG-P1-PREREQUISITE-REMAINDER

現行mainまたはselected sliceが正本を所有する。旧実装・旧gate・旧payloadを移植しない。

- Source: `{"kind":"archive","sourceItemIds":["source-006d4b763e608fa6c87c74cc","source-03a781d365df081b4042eb14","source-05db8a77fc9b9c50e2b9d99a","source-08cf7040bf7cedd215994fa6","source-0a803fd9adfd5c66b966d848","source-0bd3de26b724c46ba0713372","source-0ddc6f63bb0aa429f3ea8562","source-114b1cfa43f7c40bda93481c","source-117fdb573b2a36aa7435dd80","source-11a000e220469c6659ac748a","source-13e4092c25b7d5bc9b17c67c","source-1642dde6cd29686983fe625f","source-1695bce1510648e8360b7573","source-16a272bd624d89b490de2140","source-16cf1fed85af501f28d8e139","source-1d1393f09aa1a1f387c7ba7d","source-1ecb61b9dade9dcda82989ab","source-1fcc62cb259d781bd4206d98","source-1fdf59d939e0433f594eb9fc","source-233e64cf1f3dd0565d5d7372","source-25aba0c2726a350c54494405","source-25f32e1c53acc6480c22232f","source-26a65de4664f83527a60e9cf","source-27814fa8bd448afba6518707","source-2839c8aaea74f598b7b7c9d3","source-2aba4bce4c743c3be0804236","source-2c5b5dd33544e8887388d1a4","source-2f264e78fc1b2e94568f7c9d","source-32e9140a0f50612d610feac7","source-331c6ccb24dfb3ce140ca97f","source-3462dd4c677524e60e040af9","source-36d412f849420f60ddb12822","source-3a5272c8b11050e809cfeeae","source-3cfbff2f13280ba542bb1b6d","source-3ff824e028ecde613522a8fb","source-4009cfe451fa25b3099f3e5b","source-40a89bdc57fca18c39a73307","source-40c5d3639996778f5c4b02a1","source-413b142f9386049a7a2c8a04","source-42668575e26357a75fdc7fdd","source-435ea0c82017bab8b7eb65c2","source-43afe8ef4c088aed6de1f0e3","source-45a5c819a8f1f1230f169783","source-4bf80ec56a84638551921399","source-4bf96b2949be2c4dd0545280","source-4cdf0214c1ee4d4cb93d11d4","source-4de7f5da2406c2a983981a35","source-50524b0b5b4b53a67144f9da","source-515949005839255a00a6ee2e","source-520448f62c399bf4418369c0","source-534f05a71116b1f55575965a","source-5365a0b2921b930ee4cd844b","source-54cd61893a9af5982dcfb2d8","source-55209d082987d908e592dfdf","source-55ada93a1860168fada7a13e","source-562a8c38abbf90eb2937146a","source-67430234a5556c4e33b801fb","source-6cbaad21c2068409918643eb","source-6de3556d4b766da3795e6b0c","source-6e8fa17958aafecbb92172bd","source-6eb20632fef31abd1bc65c67","source-6f838249b43f683bd474a127","source-70b2e2cc5195bc85e5d8f4fd","source-735f5d06fdf443c1d0e0a906","source-75b1b741f06e4b48d4064dc6","source-768d9ad2e94b72efc0fd7ad5","source-788d202720178fa50934caf4","source-7be491602c8812aa1b1590e4","source-7c2f86e907d4d182660ea0bb","source-7d60880ac3e0cadb3ae491f1","source-7dee62d9c1c099f84978d8d3","source-7df7e5b670df977bd1ba69ff","source-7e6c62b05bfe25b2370aaefd","source-814d19d6eb54203594b75a4e","source-8659629d45522f256722a033","source-883c2cc5a7aa138768bba140","source-8a9ffa46822a89cd79082f5d","source-8c1e22567f17ea817712dbb5","source-8d5faabdd4d5cbbdadfebd96","source-8dc5485552be7425939200b7","source-8ef808b753a3b4800ac122fe","source-916fc5f88edf845b05b4448f","source-91cf4c49b2cb9bdf722a7db1","source-97484d9af41b96702e19325b","source-97d1cc092174ad9298f276e1","source-98cac7e8ff20128e72d6b174","source-a193c9edd0f1f44d9fef6cd3","source-a41b2626b4461b56baed3a5d","source-a77980002a25c17a64c1ac3f","source-acc81c46bb2c069f22d48dbe","source-afb53cdffbd113137c01fbfa","source-b039d96238b5105470eb021f","source-b04c545928739c04ba6a89f1","source-b074e0b118b87c2068350699","source-b2589bea9d2c93467ca169a1","source-b44b413221797bf9735b1192","source-ba5dd4e43d521c23f3be77da","source-bc663b1b06449423e3f4ff04","source-bf5b05e841f3360877c4ccb2","source-c6452bd8b89372c3fd6d6081","source-c668d15a27fb0827e9efe91d","source-c806c587186a1fbff11dc6fd","source-c83a9e14dd82e30b24744a40","source-c94e5b4733fcfbb933447a84","source-c9f505b2135e396584ef1e43","source-c9fff7f8e0565ec70b7d8e8f","source-cb047bfd559849ceb6956e36","source-cf8f1f69cdf000dc7a49b7bc","source-d58c2d20a91dc40737b44e4c","source-d5ad4f08da715d0c729c24a8","source-d85738d7563a0ea4c27f8d41","source-d8d5bd080d551ab76782183d","source-dc0a21748ac93670ea1487d0","source-e012c4cc6fe60e657e681cb5","source-e3e849812855473a059fab39","source-e542ef59e6f2d7ba3ec2fdbc","source-e5fef947b0f89ff9ec2a09a5","source-e74f771cff841decd9c7e270","source-e85cf5dafb81fc219d5780e0","source-e977bcd5e446bea87321191c","source-eb7aeef897a4f48ed72d6900","source-efac4394ba806915bbe2d722","source-f0e97950679a6e452b2e8f4f","source-f14004623c57da377fe105ce","source-f179ffbdb55719af4e5a84aa","source-f3f7f3e748ae358affcdd47f","source-f52509adf05476fb73e8d056","source-f8cc0ee1e565f3ed2153b9d1","source-f98dad2e42e1ac4df497b82e","source-fa2bc8c2fdee77f0056338d5","source-fd4c785327bc9f1638f5a7d4","source-feaca6d983c78286ecd68be0","source-ff5a869fb5d43921d45c9a66"],"tranches":[{"archiveManifestSha256":"36e477ee9b752ebf7f07a208c166fec24e14a89bf7ba6a7921cf6bdf708c9f31","carrierPatchSha256":"6913ddddcffb150eb207aee99bdbbad158b4ed05e9c3ca8714693d31f6122536","fromSha":"8793804f2f99fd1d545cb496064bcbdc7df4bf40","id":"contribution-prerequisite","legacyHeads":[{"headSha":"3e2dd68d4a0a880e7fa7ed065f5a1be2bd25a0ca","kind":"prerequisite_branch","originalBundleHead":"3e2dd68d4a0a880e7fa7ed065f5a1be2bd25a0ca","recoveryBundleHead":"3e2dd68d4a0a880e7fa7ed065f5a1be2bd25a0ca","ref":"refs/remotes/origin/codex/three-extension-p1-release-gates"}],"toSha":"3e2dd68d4a0a880e7fa7ed065f5a1be2bd25a0ca"}]}`
- GO requirements: none beyond normal slice prerequisites
- Approval requirements: no_implementation_admission
- Product reachability: zero
- Preserved invariants: current_main_authoritative
- Explicit omissions: all_owned_historical_implementation
- Target surfaces: .github/workflows/workflow-contracts.yml; .superpowers/sdd/progress.md; docs/superpowers/plans/2026-07-18-three-extension-p1-release-gates.md; extensions/bob-bazaar-review/contracts/schemas/capture-review-result-output.schema.json; extensions/bob-bazaar-review/contracts/schemas/capture-rule-evidence-selection-output.schema.json; extensions/bob-bazaar-review/contracts/schemas/capture-rule-proposal-output.schema.json; extensions/bob-bazaar-review/contracts/schemas/collect-review-context-output.schema.json; extensions/bob-bazaar-review/contracts/schemas/load-review-rules-output.schema.json; extensions/bob-bazaar-review/contracts/schemas/load-rule-source-index-output.schema.json; extensions/bob-bazaar-review/contracts/schemas/load-selected-rule-evidence-output.schema.json; extensions/bob-bazaar-review/contracts/schemas/open-review-gui-output.schema.json; extensions/bob-bazaar-review/contracts/schemas/open-rule-authoring-gui-output.schema.json; extensions/bob-bazaar-review/contracts/schemas/open-rule-proposal-triage-gui-output.schema.json; extensions/bob-bazaar-review/contracts/schemas/verify-rule-authoring-apply-output.schema.json; extensions/bob-bazaar-review/contracts/schemas/workflow-action-input.schema.json; extensions/bob-bazaar-review/contracts/workflow-contributions.json; extensions/bob-bazaar-review/scripts/check-vsix-policy.js; extensions/bob-bazaar-review/src/workflow/workflowProviders.ts; extensions/bob-bazaar-review/src/workflow/workflowRegisterBridge.ts; extensions/bob-bazaar-review/test/contributionPackagingPolicy.test.js; extensions/bob-bazaar-review/test/dependencyPolicy.test.js; extensions/bob-bazaar-review/test/package/ruleAuthoringPackageSmoke.test.js; extensions/bob-bazaar-review/test/workflowContributionContract.test.js; extensions/bob-bazaar-review/test/workflowProviderRegistration.test.js; extensions/bob-code-consistency-review/contracts/schemas/workflow-action-input.v1.schema.json; extensions/bob-code-consistency-review/contracts/schemas/workflow-action-output.v1.schema.json; extensions/bob-code-consistency-review/contracts/workflow-contributions.json; extensions/bob-code-consistency-review/scripts/check-vsix-policy.js; extensions/bob-code-consistency-review/src/extension.ts; extensions/bob-code-consistency-review/src/workflowProviderRegistration.ts; extensions/bob-code-consistency-review/test/workflowContributionManifest.test.js; extensions/bob-code-consistency-review/test/workflowProviderRegistration.test.js; extensions/workflow-register/README.md; extensions/workflow-register/contracts/workflow-contributions.json; extensions/workflow-register/docs/basic-design-ja.md; extensions/workflow-register/docs/detailed-design-ja.md; extensions/workflow-register/docs/workflow-action-contracts-ja.md; extensions/workflow-register/docs/workflow-pause-resume-plan-ja.md; extensions/workflow-register/docs/workflow-runtime-debugging.md; extensions/workflow-register/package.json; extensions/workflow-register/schema/workflow-contract-report.v1.schema.json; extensions/workflow-register/schema/workflow-contribution-catalog.v1.schema.json; extensions/workflow-register/schema/workflow-contributions.v1.schema.json; extensions/workflow-register/schema/workflow-register-action-input.v1.schema.json; extensions/workflow-register/schema/workflow-register-action-output.v1.schema.json; extensions/workflow-register/schema/workflow-register-command-result-sink.v1.schema.json; extensions/workflow-register/schema/workflow-register-file-result-sink.v1.schema.json; extensions/workflow-register/schema/workflow-register-preflight-result.v1.schema.json; extensions/workflow-register/schema/workflow-register.v1.schema.json; extensions/workflow-register/scripts/check-provider-registry-phase1.js; extensions/workflow-register/scripts/check-vsix-policy.js; extensions/workflow-register/scripts/generate-workflow-contract-report.js; extensions/workflow-register/scripts/lib/vsix-contribution-payload-validator.js; extensions/workflow-register/scripts/validate-contribution-assets.js; extensions/workflow-register/src/api/legacyContributionAdapter.ts; extensions/workflow-register/src/api/providerRegistryApi.ts; extensions/workflow-register/src/bobWorkflowRunner.ts; extensions/workflow-register/src/builtInContributions.ts; extensions/workflow-register/src/core/actionProviderRegistrationStore.ts; extensions/workflow-register/src/core/actionRegistry.ts; extensions/workflow-register/src/core/agentProvider.ts; extensions/workflow-register/src/core/authoring/workflowAuthoringSerializer.ts; extensions/workflow-register/src/core/authoring/workflowSkipResumeReadiness.ts; extensions/workflow-register/src/core/authoring/workflowSkipResumeReadinessPreview.ts; extensions/workflow-register/src/core/contributionCatalog.ts; extensions/workflow-register/src/core/contributionManifest.ts; extensions/workflow-register/src/core/contributionRegistry.ts; extensions/workflow-register/src/core/engine.ts; extensions/workflow-register/src/core/engine/preflight.ts; extensions/workflow-register/src/core/engineTypes.ts; extensions/workflow-register/src/core/modelSinks.ts; extensions/workflow-register/src/core/parser/normalizers.ts; extensions/workflow-register/src/core/resultSinkRegistry.ts; extensions/workflow-register/src/core/runDiagnostics.ts; extensions/workflow-register/src/core/runtime/resultSinkRegistry.ts; extensions/workflow-register/src/core/schema/workflowSchema.ts; extensions/workflow-register/src/core/templateMirrorValidator.ts; extensions/workflow-register/src/core/vsixContributionPayloadValidator.ts; extensions/workflow-register/src/core/workflowAuthoringStepDraftValidation.ts; extensions/workflow-register/src/core/workflowCompiler.ts; extensions/workflow-register/src/core/workflowContractReport.ts; extensions/workflow-register/src/core/workflowValidator.ts; extensions/workflow-register/src/extension.ts; extensions/workflow-register/src/webview/workflowBuilderStepRendererScript.ts; extensions/workflow-register/src/workflowAdapter.ts; extensions/workflow-register/src/workflowRegisterService.ts; extensions/workflow-register/src/workflowRuntimeFactory.ts; extensions/workflow-register/test/actionProviderRegistrationStore.test.js; extensions/workflow-register/test/actionRegistry.test.js; extensions/workflow-register/test/agentPromptParity.test.js; extensions/workflow-register/test/architectureContracts.test.js; extensions/workflow-register/test/builtInContributionManifest.test.js; extensions/workflow-register/test/builtInContributionWiring.test.js; extensions/workflow-register/test/contributionCatalog.test.js; extensions/workflow-register/test/contributionManifest.test.js; extensions/workflow-register/test/contributionManifestAggregate.test.js; extensions/workflow-register/test/contributionRegistry.test.js; extensions/workflow-register/test/customResultSinkContract.test.js; extensions/workflow-register/test/dependencyPolicy.test.js; extensions/workflow-register/test/fixtures/provider-registry-api/consumer.ts; extensions/workflow-register/test/fixtures/provider-registry-api/tsconfig.json; extensions/workflow-register/test/fixtures/tracked-workflow-discovery/real-repository-inventory.json; extensions/workflow-register/test/fixtures/workflow-contributions/invalid-duplicate.json; extensions/workflow-register/test/fixtures/workflow-contributions/invalid-path.json; extensions/workflow-register/test/fixtures/workflow-contributions/invalid-range.json; extensions/workflow-register/test/fixtures/workflow-contributions/invalid-unknown-field.json; extensions/workflow-register/test/fixtures/workflow-contributions/valid.json; extensions/workflow-register/test/legacyContributionAdapterPolicy.test.js; extensions/workflow-register/test/legacyProviderRegistryAdapter.test.js; extensions/workflow-register/test/mechanicalChecksActionProvider.test.js; extensions/workflow-register/test/operationHubAgentProvider.test.js; extensions/workflow-register/test/phase1ProviderRegistryEvidence.test.js; extensions/workflow-register/test/providerRegistryApi.test.js; extensions/workflow-register/test/providerRegistryApiTypes.test.js; extensions/workflow-register/test/providerRegistryRuntimeLifecycle.test.js; extensions/workflow-register/test/providerRegistryRuntimeWiring.test.js; extensions/workflow-register/test/providerRegistryWiring.test.js; extensions/workflow-register/test/registrationWiring.test.js; extensions/workflow-register/test/runtimeWiring.test.js; extensions/workflow-register/test/trackedWorkflowDiscovery.test.js; extensions/workflow-register/test/workflowAgentProvider.test.js; extensions/workflow-register/test/workflowAutomaticPauseRuntimeWiring.test.js; extensions/workflow-register/test/workflowCommandContracts.test.js; extensions/workflow-register/test/workflowCompilerParity.test.js; extensions/workflow-register/test/workflowContractFiles.test.js; extensions/workflow-register/test/workflowContractGate.test.js; extensions/workflow-register/test/workflowContractReport.test.js; extensions/workflow-register/test/workflowContractsCi.test.js; extensions/workflow-register/test/workflowContributionResolution.test.js; extensions/workflow-register/test/workflowEnginePreflightDefaults.test.js; extensions/workflow-register/test/workflowPackageContracts.test.js; extensions/workflow-register/test/workflowRegister.test.js; extensions/workflow-register/test/workflowRuntime.test.js
- CI: exact_reviewed_candidate_head; exact_merged_main_head; ubuntu_windows
- RED: prove_new_contract_failure_before_implementation
- UAT: same_hashed_vsix_for_changed_product_surfaces; final_three_extension_real_machine_uat
- focused: current_main_authoritative
- full: all_affected_extension_tests; three_extension_quality_gates

## WF2-B-BASELINE-LOCK-SYNC-REMAINDER

現行mainまたはselected sliceが正本を所有する。旧実装・旧gate・旧payloadを移植しない。

- Source: `{"kind":"archive","sourceItemIds":["source-10f2c447d85b8fdeb5f33051","source-7116e7cb3ced13ad31835489","source-dc3d38365c4b273e9ed23a20"],"tranches":[{"archiveManifestSha256":"36e477ee9b752ebf7f07a208c166fec24e14a89bf7ba6a7921cf6bdf708c9f31","carrierPatchSha256":"59eca51331f3c580a63435021e03c05780ffbe6b65db76949cb0d4bff8c428c7","fromSha":"683e794eb4a39eea7bc3630bedbd2a557f4af8af","id":"workflow-b","legacyHeads":[{"baseSha":"683e794eb4a39eea7bc3630bedbd2a557f4af8af","headSha":"e0766f9448033688964fabbcfa6ae73b3d849ed0","kind":"closed_pull_request","originalBundleHead":"e0766f9448033688964fabbcfa6ae73b3d849ed0","pullRequestNumber":153,"recoveryBundleHead":"e0766f9448033688964fabbcfa6ae73b3d849ed0","ref":"refs/remotes/origin/codex/workflow-contract-v2-p4"},{"baseSha":"e0766f9448033688964fabbcfa6ae73b3d849ed0","headSha":"45260e0b5a96e50bf01b820b71103b33f2067d8c","kind":"closed_pull_request","originalBundleHead":"45260e0b5a96e50bf01b820b71103b33f2067d8c","pullRequestNumber":154,"recoveryBundleHead":"45260e0b5a96e50bf01b820b71103b33f2067d8c","ref":"refs/remotes/origin/codex/workflow-contract-v2-p5"},{"baseSha":"45260e0b5a96e50bf01b820b71103b33f2067d8c","headSha":"95d245ce2eba9ac1412038afe96dc509bd6735de","kind":"closed_pull_request","originalBundleHead":"95d245ce2eba9ac1412038afe96dc509bd6735de","pullRequestNumber":155,"recoveryBundleHead":"95d245ce2eba9ac1412038afe96dc509bd6735de","ref":"refs/remotes/origin/codex/workflow-contract-v2-p6"},{"baseSha":"95d245ce2eba9ac1412038afe96dc509bd6735de","headSha":"e860d1ebbafe7068fc6871b16c9586a11b4fe19d","kind":"closed_pull_request","originalBundleHead":"e860d1ebbafe7068fc6871b16c9586a11b4fe19d","pullRequestNumber":157,"recoveryBundleHead":"e860d1ebbafe7068fc6871b16c9586a11b4fe19d","ref":"refs/remotes/origin/codex/workflow-contract-v2-p7"}],"toSha":"e860d1ebbafe7068fc6871b16c9586a11b4fe19d"}]}`
- GO requirements: none beyond normal slice prerequisites
- Approval requirements: no_implementation_admission
- Product reachability: separate_activation_required
- Preserved invariants: current_main_authoritative
- Explicit omissions: all_owned_historical_implementation
- Target surfaces: extensions/workflow-register/src/core/contractV2/workflowLockSnapshot.ts; extensions/workflow-register/test/workflowContractV2Lock.test.js; extensions/workflow-register/test/workflowContractV2LockSnapshotCases.js
- CI: exact_reviewed_candidate_head; exact_merged_main_head; ubuntu_windows
- RED: prove_new_contract_failure_before_implementation
- UAT: same_hashed_vsix_for_changed_product_surfaces; final_three_extension_real_machine_uat
- focused: current_main_authoritative
- full: all_affected_extension_tests; three_extension_quality_gates

## WF2-B-HISTORICAL-DOC-REMAINDER

現行mainまたはselected sliceが正本を所有する。旧実装・旧gate・旧payloadを移植しない。

- Source: `{"kind":"archive","sourceItemIds":["source-40c04e26c61ecac1cbf375c6"],"tranches":[{"archiveManifestSha256":"36e477ee9b752ebf7f07a208c166fec24e14a89bf7ba6a7921cf6bdf708c9f31","carrierPatchSha256":"59eca51331f3c580a63435021e03c05780ffbe6b65db76949cb0d4bff8c428c7","fromSha":"683e794eb4a39eea7bc3630bedbd2a557f4af8af","id":"workflow-b","legacyHeads":[{"baseSha":"683e794eb4a39eea7bc3630bedbd2a557f4af8af","headSha":"e0766f9448033688964fabbcfa6ae73b3d849ed0","kind":"closed_pull_request","originalBundleHead":"e0766f9448033688964fabbcfa6ae73b3d849ed0","pullRequestNumber":153,"recoveryBundleHead":"e0766f9448033688964fabbcfa6ae73b3d849ed0","ref":"refs/remotes/origin/codex/workflow-contract-v2-p4"},{"baseSha":"e0766f9448033688964fabbcfa6ae73b3d849ed0","headSha":"45260e0b5a96e50bf01b820b71103b33f2067d8c","kind":"closed_pull_request","originalBundleHead":"45260e0b5a96e50bf01b820b71103b33f2067d8c","pullRequestNumber":154,"recoveryBundleHead":"45260e0b5a96e50bf01b820b71103b33f2067d8c","ref":"refs/remotes/origin/codex/workflow-contract-v2-p5"},{"baseSha":"45260e0b5a96e50bf01b820b71103b33f2067d8c","headSha":"95d245ce2eba9ac1412038afe96dc509bd6735de","kind":"closed_pull_request","originalBundleHead":"95d245ce2eba9ac1412038afe96dc509bd6735de","pullRequestNumber":155,"recoveryBundleHead":"95d245ce2eba9ac1412038afe96dc509bd6735de","ref":"refs/remotes/origin/codex/workflow-contract-v2-p6"},{"baseSha":"95d245ce2eba9ac1412038afe96dc509bd6735de","headSha":"e860d1ebbafe7068fc6871b16c9586a11b4fe19d","kind":"closed_pull_request","originalBundleHead":"e860d1ebbafe7068fc6871b16c9586a11b4fe19d","pullRequestNumber":157,"recoveryBundleHead":"e860d1ebbafe7068fc6871b16c9586a11b4fe19d","ref":"refs/remotes/origin/codex/workflow-contract-v2-p7"}],"toSha":"e860d1ebbafe7068fc6871b16c9586a11b4fe19d"}]}`
- GO requirements: none beyond normal slice prerequisites
- Approval requirements: no_implementation_admission
- Product reachability: separate_activation_required
- Preserved invariants: current_main_authoritative
- Explicit omissions: all_owned_historical_implementation
- Target surfaces: extensions/workflow-register/src/extension.ts
- CI: exact_reviewed_candidate_head; exact_merged_main_head; ubuntu_windows
- RED: prove_new_contract_failure_before_implementation
- UAT: same_hashed_vsix_for_changed_product_surfaces; final_three_extension_real_machine_uat
- focused: current_main_authoritative
- full: all_affected_extension_tests; three_extension_quality_gates

## BASE-WF2-A

受入済みWorkflow Aのschema/loader/registryを正本として維持する。

- Source: `{"baselineMainSha":"c59db06ecb32eb7a57beeb3e932acdd5b4774de5","evidence":[{"blobOid":"33ec748c6b43929f26e0ceca3076f4c9ac6cf671","blobSha256":"1e7be9d9164ae1ad3d3a4935f8e24fb44b38abf9b248c39e9b27d9233177da3a","repositoryPath":"docs/release-evidence/workflow-carrier-a-merge-resolution-2026-08-22.json"}],"evidenceId":"BASE-WF2-A","kind":"current_main"}`
- GO requirements: none beyond normal slice prerequisites
- Approval requirements: no_implementation_admission
- Product reachability: zero
- Preserved invariants: current_main_authoritative
- Explicit omissions: archived_duplicate
- Target surfaces: control/evidence only
- CI: exact_reviewed_candidate_head; exact_merged_main_head; ubuntu_windows
- RED: prove_new_contract_failure_before_implementation
- UAT: same_hashed_vsix_for_changed_product_surfaces; final_three_extension_real_machine_uat
- focused: current_main_authoritative
- full: all_affected_extension_tests; three_extension_quality_gates

## BASE-OOXML-SNAPSHOT

現行OOXML snapshot、GUI診断、PRA-WIN-001を比較基準として維持する。

- Source: `{"baselineMainSha":"c59db06ecb32eb7a57beeb3e932acdd5b4774de5","evidence":[{"blobOid":"4b9bd95aa22ce2f13f88f604e11663be2db55dc6","blobSha256":"f21a729133e6c52e932f5c3abb58d958422f8a2a8b1ee1197e33de75913246cf","repositoryPath":"docs/release-evidence/main-consolidation-inventory-2026-08-21.json"},{"archiveEvidenceId":"PRA-WIN-001","archiveManifestSha256":"36e477ee9b752ebf7f07a208c166fec24e14a89bf7ba6a7921cf6bdf708c9f31","relativePath":"artifacts/pra-win-001-evidence/PRA-WIN-001-evidence.json","sha256":"2554afe6bc8ac15067d103ecb692b5c14cbe5e578336930e7c7fe5aa40bac954"}],"evidenceId":"BASE-OOXML-SNAPSHOT","kind":"current_main"}`
- GO requirements: none beyond normal slice prerequisites
- Approval requirements: no_implementation_admission
- Product reachability: zero
- Preserved invariants: current_main_authoritative
- Explicit omissions: archived_duplicate
- Target surfaces: control/evidence only
- CI: exact_reviewed_candidate_head; exact_merged_main_head; ubuntu_windows
- RED: prove_new_contract_failure_before_implementation
- UAT: same_hashed_vsix_for_changed_product_surfaces; final_three_extension_real_machine_uat
- focused: current_main_authoritative
- full: all_affected_extension_tests; three_extension_quality_gates

## BASE-WF2-F7-BOB-PROFILE

F7 Bob profile/probeの受入済み証拠。実機GOには後続証拠も必要。

- Source: `{"baselineMainSha":"c59db06ecb32eb7a57beeb3e932acdd5b4774de5","evidence":[{"blobOid":"2af57db85d10cc23d0581064f7e74f22d79b4cf6","blobSha256":"78dcc91a09299d5d8f1b7ebe27457fc920cc280778c7c4c45c343a6e40803f4e","containingCommitSha":"c59db06ecb32eb7a57beeb3e932acdd5b4774de5","repositoryPath":"docs/release-evidence/workflow-contract-v2-foundation-status-2026-07-23.md"}],"evidenceId":"BASE-WF2-F7-BOB-PROFILE","kind":"current_main"}`
- GO requirements: none beyond normal slice prerequisites
- Approval requirements: no_implementation_admission
- Product reachability: zero
- Preserved invariants: current_main_authoritative
- Explicit omissions: archived_duplicate
- Target surfaces: control/evidence only
- CI: exact_reviewed_candidate_head; exact_merged_main_head; ubuntu_windows
- RED: prove_new_contract_failure_before_implementation
- UAT: same_hashed_vsix_for_changed_product_surfaces; final_three_extension_real_machine_uat
- focused: current_main_authoritative
- full: all_affected_extension_tests; three_extension_quality_gates

## Source item partition

| Source item | Primary owner | Disposition |
| --- | --- | --- |
| source-006d4b763e608fa6c87c74cc | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-0079608c934fd2c8521b4c4b | PROC-T15-AGGREGATE | selected |
| source-00e1139e1829c12246ddfc93 | REG-BRIDGE-DISCOVERY-EVIDENCE | selected |
| source-016f44736fcd2bb137b3be81 | WF2-R4-EXECUTOR | conditional |
| source-019c995cdf5d0cd326d5ddc0 | WF2-R3-ARTIFACT-TX | conditional |
| source-01a9655f527e3c20b24c6835 | PROC-T17-DEADLINE | selected |
| source-01ca179efcbe182b733f7a89 | WF2-R1-PROVENANCE | selected |
| source-01f7821ee897fedfb488ca62 | PROC-T17-DEADLINE | selected |
| source-0209178d37fa1d85d707a3b7 | PROC-T15-AGGREGATE | selected |
| source-02309bad381271a510d344c9 | PROC-T17-PATH | selected |
| source-0242818ae8483b31a38c73a6 | PROC-T17-DEADLINE | selected |
| source-029c3450e572ca500b56d997 | PROC-T15-AGGREGATE | selected |
| source-03a781d365df081b4042eb14 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-03f3e91bd544a8c107546b31 | WF2-P6-ENTRYPOINT | selected |
| source-04042ee1d12b54981a558cd1 | WF2-R1-PROVENANCE | selected |
| source-04120694790d10c80bb7040c | PROC-T17-PATH | selected |
| source-051d3492ded4b0938c1e22d4 | WF2-P7-MANIFEST | selected |
| source-05db8a77fc9b9c50e2b9d99a | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-05dcdabc25077b727fa3858a | REG-BRIDGE-OWNER-VERSION-LIFECYCLE | selected |
| source-05e57d74177fec8af5afb411 | WF2-P7-MANIFEST | selected |
| source-05f184a5094441d208a847c2 | PROC-T16-INPUT-PROCESS | selected |
| source-06b495365a39505884c0f86f | REG-BRIDGE-OWNER-VERSION-LIFECYCLE | selected |
| source-06c5f2cc5db5e4f92b0cf2cc | REG-BRIDGE-OWNER-VERSION-LIFECYCLE | selected |
| source-081690cb9b343e0e4fd86aaa | PROC-T14-BOUNDED-DOC | selected |
| source-08cf7040bf7cedd215994fa6 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-09182ccb2c40b3b86eed340e | WF2-R5-BOB | conditional |
| source-09c3e86a1add707d71de4d8c | REG-BRIDGE-OWNER-VERSION-LIFECYCLE | selected |
| source-0a803fd9adfd5c66b966d848 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-0b1db8b46876527efe49b608 | PROC-T15-AGGREGATE | selected |
| source-0b61f62d20da4612280b6569 | REG-BRIDGE-OWNER-VERSION-LIFECYCLE | selected |
| source-0bd231a3c17b7b56bbbbda21 | REG-BRIDGE-DISCOVERY-EVIDENCE | selected |
| source-0bd3de26b724c46ba0713372 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-0bff6322ffa2774f6f27a3ee | PROC-T16-INPUT-PROCESS | selected |
| source-0cf0e1be0378d8d47d574ce7 | WF2-P4-COMPILER | selected |
| source-0dc3160ff443203c1012c332 | PROC-T15-AGGREGATE | selected |
| source-0ddab8f0a7385edb664ff6c5 | PROC-T13-LEDGER | selected |
| source-0ddc6f63bb0aa429f3ea8562 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-0ee8bd8c0cf158480af89527 | WF2-R1-PROVENANCE | selected |
| source-0f84fc23754230d796e0a5b3 | PROC-T14-BOUNDED-DOC | selected |
| source-1004a4fe0de3bc511f445d9c | PROC-T17-PATH | selected |
| source-108b6d1a970be1f538f3602d | REG-BRIDGE-DISCOVERY-EVIDENCE | selected |
| source-10f2c447d85b8fdeb5f33051 | WF2-B-BASELINE-LOCK-SYNC-REMAINDER | superseded |
| source-10fcba6023328c4b7224a77a | PROC-T18-REPORT | selected |
| source-1125e24c264c3e7ff427c8ae | WF2-R1-PROVENANCE | selected |
| source-114b1cfa43f7c40bda93481c | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-115f8910d0fd986cd859a0cb | PROC-T14-BOUNDED-DOC | selected |
| source-116947d48756a2313f259d67 | PROC-T14-BOUNDED-DOC | selected |
| source-116ffcb1708dfab88771d924 | PROC-T13-LEDGER | selected |
| source-117fdb573b2a36aa7435dd80 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-11a000e220469c6659ac748a | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-11c6eda712b2f301761a6dd5 | PROC-T14-BOUNDED-DOC | selected |
| source-11ca11edf36ec8e30cec5745 | WF2-R5-BOB | conditional |
| source-122cdfe84d37c5f2d7462bdc | PROC-T14-BOUNDED-DOC | selected |
| source-126064185b6123a536a663d2 | PROC-T18-REPORT | selected |
| source-12d9b78e71be42e5711771f4 | REG-BRIDGE-DISCOVERY-EVIDENCE | selected |
| source-13c44626c0be971142e83fc1 | PROC-T15-AGGREGATE | selected |
| source-13e4092c25b7d5bc9b17c67c | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-14cfd7d06e0a3ff1d07dbd07 | WF2-R2-INVOKE | selected |
| source-15ac07e0adbade462b24c3d7 | PROC-T14-BOUNDED-DOC | selected |
| source-1642dde6cd29686983fe625f | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-1695bce1510648e8360b7573 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-169a3c501c107418bfb84330 | WF2-P4-COMPILER | selected |
| source-16a204d54fe67ae4779c47be | PROC-T18-CCR-HANDOFF | selected |
| source-16a272bd624d89b490de2140 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-16cf1fed85af501f28d8e139 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-176fed7efa554a786ecc23df | PROC-T18-BZR-HANDOFF | selected |
| source-178b32177a4de88216c81e1e | REG-BRIDGE-OWNER-VERSION-LIFECYCLE | selected |
| source-18eb570fe8122555b5162451 | PROC-T18-CCR-HANDOFF | selected |
| source-1913ba4170b45960fbe64027 | REG-BRIDGE-DISCOVERY-EVIDENCE | selected |
| source-1921ef22a041d98667b357ee | WF2-P5-PLANSTORE | selected |
| source-1989d7a99664ed7704314edf | PROC-T18-REPORT | selected |
| source-19d222b534b627f412fdd53c | PROC-T18-BZR-HANDOFF | selected |
| source-1a8ac05bed133639db4b132d | PROC-T18-BZR-HANDOFF | selected |
| source-1af7f2371abe4195022a0223 | PROC-T13-LEDGER | selected |
| source-1b77ef339188f46fda20ed3f | WF2-P6-ENTRYPOINT | selected |
| source-1bed1bc5c87559b5e30af777 | PROC-T13-LEDGER | selected |
| source-1cfe3b722312aa3ebb399cca | WF2-P4-COMPILER | selected |
| source-1d1393f09aa1a1f387c7ba7d | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-1e9f07d82474ab751e932877 | PROC-T18-REPORT | selected |
| source-1ec3af946c25ef88797a2bd6 | PROC-T18-REPORT | selected |
| source-1ecb61b9dade9dcda82989ab | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-1ed1c6c31fee5eb4edf09757 | WF2-P4-COMPILER | selected |
| source-1f4210adfc6ed84512738e47 | WF2-R5-BOB | conditional |
| source-1fcc62cb259d781bd4206d98 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-1fdf59d939e0433f594eb9fc | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-200e5bffee5f7adee7265389 | WF2-P6-ENTRYPOINT | selected |
| source-201a758d2c574b15ee621648 | PROC-T18-CCR-HANDOFF | selected |
| source-2049d531d13f77f1a6241507 | WF2-P4-COMPILER | selected |
| source-2051d416e49954e09634c7ed | WF2-R6-ARCHIVED | rejected_current_snapshot |
| source-211bd833b0682ef0fa642984 | WF2-P4-COMPILER | selected |
| source-211ce0e127827b329bdc59e8 | WF2-P6-ENTRYPOINT | selected |
| source-212b25dd59af07e1690b14f0 | PROC-T14-BOUNDED-DOC | selected |
| source-21c74c762ada2909d42a47b0 | REG-BRIDGE-OWNER-VERSION-LIFECYCLE | selected |
| source-21e1028b3969abfb77ed2b2c | WF2-P4-COMPILER | selected |
| source-2269303d724dff4f1d38b1a3 | PROC-T18-BZR-HANDOFF | selected |
| source-233e64cf1f3dd0565d5d7372 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-23ef029fb33793052ddc9001 | WF2-R6-ARCHIVED | rejected_current_snapshot |
| source-240df7c38b2b9a2698b1e2b8 | REG-BRIDGE-OWNER-VERSION-LIFECYCLE | selected |
| source-2447bc3569e6ac90c8ecf0b0 | PROC-T16-INPUT-PROCESS | selected |
| source-25aba0c2726a350c54494405 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-25f32e1c53acc6480c22232f | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-26a65de4664f83527a60e9cf | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-26b6488e607378d4c655a690 | REG-BRIDGE-DISCOVERY-EVIDENCE | selected |
| source-27133ef013bd7994415d3180 | PROC-T18-BZR-HANDOFF | selected |
| source-27814fa8bd448afba6518707 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-27b48797011bf83f1eb80391 | PROC-T18-REPORT | selected |
| source-2839c8aaea74f598b7b7c9d3 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-28cd959695154a83150090b4 | PROC-ARCHIVED-IMPLEMENTATION-REMAINDER | superseded |
| source-28fc352703ea6a0d36ba82da | WF2-P6-ENTRYPOINT | selected |
| source-299b38c2a6c3696dbc79dd52 | WF2-R1-PROVENANCE | selected |
| source-2a80aed4ccf00e64fa21313e | PROC-T13-LEDGER | selected |
| source-2aba4bce4c743c3be0804236 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-2b1da614d7fab345c0baaec6 | PROC-ARCHIVED-IMPLEMENTATION-REMAINDER | superseded |
| source-2b3053b0bd0857926680aaa4 | REG-BRIDGE-OWNER-VERSION-LIFECYCLE | selected |
| source-2b646d5d315a539415d3e73c | PROC-T17-DEADLINE | selected |
| source-2bb96ca222954ef7996b2e41 | WF2-P5-PLANSTORE | selected |
| source-2c291b5d938be3b5d376b5a2 | PROC-T18-REPORT | selected |
| source-2c5b5dd33544e8887388d1a4 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-2c63e68948995844eccba2ba | WF2-R5-BOB | conditional |
| source-2cc51fa85468ac0ed1130ba8 | PROC-T15-AGGREGATE | selected |
| source-2cd4b3ecdb06af789434147d | WF2-P7-MANIFEST | selected |
| source-2cd5d697cee371e3948b8f33 | REG-BRIDGE-OWNER-VERSION-LIFECYCLE | selected |
| source-2d2e01542f2b8de11ef04afb | REG-BRIDGE-DISCOVERY-EVIDENCE | selected |
| source-2d58717b603fd53b87717fbb | PROC-T18-CCR-HANDOFF | selected |
| source-2d5f40ef64b61e97372163c3 | WF2-P6-ENTRYPOINT | selected |
| source-2dc2cff4c648616a169fa711 | PROC-T13-LEDGER | selected |
| source-2df85f46e62ea5d5fc8545f9 | PROC-T17-DEADLINE | selected |
| source-2e0e63d825cf491d1922e307 | WF2-R6-ARCHIVED | rejected_current_snapshot |
| source-2e754cd2101ad26c6702b242 | PROC-T18-REPORT | selected |
| source-2eb513ec8a0f9c235ab3928c | PROC-ARCHIVED-IMPLEMENTATION-REMAINDER | superseded |
| source-2f264e78fc1b2e94568f7c9d | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-2fb29342a01abe31e3d18f9a | WF2-R6-ARCHIVED | rejected_current_snapshot |
| source-303a9827be5534d28ae9faa3 | PROC-T18-CCR-HANDOFF | selected |
| source-308b45cdc82376d66646f04c | PROC-T15-AGGREGATE | selected |
| source-30975ac1581193529a323011 | REG-BRIDGE-OWNER-VERSION-LIFECYCLE | selected |
| source-31502d818e0b6147aa6f3275 | PROC-T16-INPUT-PROCESS | selected |
| source-31a92de444e0022d4b7a4a90 | PROC-T18-CCR-HANDOFF | selected |
| source-3224e934a9f612e8e17d2f4f | PROC-T18-REPORT | selected |
| source-3266621c45ba21fc5873f61d | WF2-R1-PROVENANCE | selected |
| source-32e9140a0f50612d610feac7 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-331c6ccb24dfb3ce140ca97f | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-33620672a8fd3907321bbd6c | PROC-T18-BZR-HANDOFF | selected |
| source-3462dd4c677524e60e040af9 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-3492db8bbbc56bda287a9055 | PROC-T17-DEADLINE | selected |
| source-34c61efc427121c81952998a | WF2-R1-PROVENANCE | selected |
| source-36d412f849420f60ddb12822 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-36e0a0a4e27788af32dba442 | PROC-T18-BZR-HANDOFF | selected |
| source-394edf9f1a86f2b1eb6bbcc8 | PROC-T18-REPORT | selected |
| source-3a5272c8b11050e809cfeeae | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-3af20d158a95f6e5eb6bc244 | PROC-T17-DEADLINE | selected |
| source-3b42c17309022b8d81e10e40 | PROC-T18-REPORT | selected |
| source-3b47ba9ceb1a183e4b4b72b6 | REG-BRIDGE-DISCOVERY-EVIDENCE | selected |
| source-3baea552da259804ed36fb01 | PROC-T18-REPORT | selected |
| source-3cfbff2f13280ba542bb1b6d | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-3d984f11c0ee20d0bae02aba | WF2-R4-EXECUTOR | conditional |
| source-3ded212f1168d24021187d9e | PROC-T17-PATH | selected |
| source-3df4b118944857706a292a71 | PROC-T17-DEADLINE | selected |
| source-3e7af2df20c39b189fbd1629 | PROC-T17-PATH | selected |
| source-3ec41ca4a670ccae38ce5ace | PROC-ARCHIVED-IMPLEMENTATION-REMAINDER | superseded |
| source-3f97c2ee47589e0c7df351d0 | PROC-T13-LEDGER | selected |
| source-3ff824e028ecde613522a8fb | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-4009cfe451fa25b3099f3e5b | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-401a97fced069da2bee6384b | PROC-T17-DEADLINE | selected |
| source-40656a07adc5cc4f80d75510 | WF2-R6-ARCHIVED | rejected_current_snapshot |
| source-40739e59ed46d2e99caf17db | WF2-P4-COMPILER | selected |
| source-40a89bdc57fca18c39a73307 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-40c04e26c61ecac1cbf375c6 | WF2-B-HISTORICAL-DOC-REMAINDER | superseded |
| source-40c5d3639996778f5c4b02a1 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-413b142f9386049a7a2c8a04 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-418c99dff76ec8aa8c971638 | WF2-P5-PLANSTORE | selected |
| source-41c31bf3997087539134b1c2 | WF2-R1-PROVENANCE | selected |
| source-422ee5e3fe35e7ae1ca2f981 | PROC-T17-DEADLINE | selected |
| source-42668575e26357a75fdc7fdd | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-42a51209abb3930bdea6ba64 | REG-BRIDGE-DISCOVERY-EVIDENCE | selected |
| source-42e52f0142bc1480cba3f8bb | WF2-R2-INVOKE | selected |
| source-434d0ac63b4a746f6d3a9e20 | PROC-T17-PATH | selected |
| source-435ea0c82017bab8b7eb65c2 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-43afe8ef4c088aed6de1f0e3 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-44d30d8b4cc747498d0a7117 | PROC-T16-INPUT-PROCESS | selected |
| source-454dada4039d3961efe56ec0 | WF2-R6-ARCHIVED | rejected_current_snapshot |
| source-4598e653da287a68a574650e | PROC-T18-REPORT | selected |
| source-45a5c819a8f1f1230f169783 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-473b8fbfa56d3c4c61e553a0 | REG-BRIDGE-OWNER-VERSION-LIFECYCLE | selected |
| source-47976894c870049312761832 | PROC-T17-PATH | selected |
| source-48166ff553110df8983d5257 | PROC-T17-DEADLINE | selected |
| source-487818564a725885879bc58d | WF2-P6-ENTRYPOINT | selected |
| source-49c3dcb3210f6747397403d8 | REG-BRIDGE-OWNER-VERSION-LIFECYCLE | selected |
| source-49d99bc2c6863f64d71f88da | PROC-T18-REPORT | selected |
| source-4a0aadeb973f48b645778d59 | WF2-R4-EXECUTOR | conditional |
| source-4a14f990f0f7a31143fb4315 | PROC-T18-CCR-HANDOFF | selected |
| source-4aa26e2ba3475a88e66b9d2e | REG-BRIDGE-OWNER-VERSION-LIFECYCLE | selected |
| source-4aab19c95cc99ebe98ac9077 | WF2-P7-MANIFEST | selected |
| source-4b22735ad64dae69650013dd | WF2-P7-MANIFEST | selected |
| source-4b4730055bf291daeb1a9b42 | PROC-T17-DEADLINE | selected |
| source-4bf80ec56a84638551921399 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-4bf96b2949be2c4dd0545280 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-4c4c58c4f1546e0176ba06a2 | PROC-T16-INPUT-PROCESS | selected |
| source-4c78c545babfbae8e93c6c13 | PROC-T18-BZR-HANDOFF | selected |
| source-4c7b24ff190c560443c24d6c | WF2-P4-COMPILER | selected |
| source-4cdf0214c1ee4d4cb93d11d4 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-4d3c8c1d47eea6437944309c | PROC-T17-DEADLINE | selected |
| source-4d84e287ca61db22836ab0d4 | PROC-T17-DEADLINE | selected |
| source-4de7f5da2406c2a983981a35 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-4e0b4bf434260cc41151ac06 | WF2-R6-ARCHIVED | rejected_current_snapshot |
| source-4e660869aa1ada148aeb2bda | PROC-T17-DEADLINE | selected |
| source-4e950f82b16ed824792d7ae0 | WF2-R6-ARCHIVED | rejected_current_snapshot |
| source-4ea2851958ad8182f8e6febb | WF2-P6-ENTRYPOINT | selected |
| source-4efd833dfee834ecbf390c76 | WF2-R4-EXECUTOR | conditional |
| source-4f000b9390bc293973eefa7d | WF2-P5-PLANSTORE | selected |
| source-4f031a975bf8b94eb8d72e84 | PROC-T17-PATH | selected |
| source-4fe64eb225784edc6cb0dfbc | WF2-R5-BOB | conditional |
| source-501ab87205e94c950750ca70 | WF2-P5-PLANSTORE | selected |
| source-50524b0b5b4b53a67144f9da | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-50af63c7c4cda00775f5a5a2 | PROC-T16-INPUT-PROCESS | selected |
| source-50e11b6b638f7049f18b0e16 | PROC-T17-PATH | selected |
| source-50f29b856d5d39f3e342ca85 | WF2-R1-PROVENANCE | selected |
| source-5115b3e605487c5bf7585e23 | PROC-T18-REPORT | selected |
| source-5156efa0941959246e595695 | PROC-T18-REPORT | selected |
| source-515949005839255a00a6ee2e | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-51bcaeb41bc1a68cec561182 | PROC-T15-AGGREGATE | selected |
| source-520448f62c399bf4418369c0 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-5206f6fdf1c711d1bb161d62 | WF2-R1-PROVENANCE | selected |
| source-5219013542fc29ba1d534591 | PROC-T17-PATH | selected |
| source-5237c6af1c153c9400cd06cf | PROC-T17-DEADLINE | selected |
| source-5294fb607798bbb272cb9cda | WF2-R4-EXECUTOR | conditional |
| source-5320828c1887a20eaf46dd64 | PROC-T13-LEDGER | selected |
| source-5337bde73cf849b77a4ec168 | REG-BRIDGE-DISCOVERY-EVIDENCE | selected |
| source-534f05a71116b1f55575965a | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-5365a0b2921b930ee4cd844b | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-538762670809484047410b5c | WF2-R4-EXECUTOR | conditional |
| source-54284087d47d7b028ce71bb0 | PROC-T15-AGGREGATE | selected |
| source-54cd61893a9af5982dcfb2d8 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-55209d082987d908e592dfdf | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-555bdba0baee1b9d0dc5b853 | WF2-P6-ENTRYPOINT | selected |
| source-55668c6c4fc0ac2d3e153762 | PROC-T14-BOUNDED-DOC | selected |
| source-55ada93a1860168fada7a13e | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-562a8c38abbf90eb2937146a | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-564c1fd49aa7987997867165 | WF2-P7-MANIFEST | selected |
| source-5681a1de308edf68b105998d | WF2-R6-ARCHIVED | rejected_current_snapshot |
| source-56e4fc48d577920a309094ac | WF2-P7-MANIFEST | selected |
| source-57a458266388471a1b32856d | WF2-P6-ENTRYPOINT | selected |
| source-583ae398d8cf034d60f70a19 | WF2-R6-ARCHIVED | rejected_current_snapshot |
| source-5878428770ba85ec6765b380 | WF2-R1-PROVENANCE | selected |
| source-59393027dc9303c0772d3255 | PROC-T15-AGGREGATE | selected |
| source-5a8f885cd31ff13f1f53864a | PROC-T13-LEDGER | selected |
| source-5af29fd63ef8b7045a65ff67 | PROC-T17-DEADLINE | selected |
| source-5b811c80c7655c7faaf05600 | WF2-P7-MANIFEST | selected |
| source-5ca2654642f10f69b53d3f8b | WF2-R1-PROVENANCE | selected |
| source-5df63668a86d46592ab24aa5 | PROC-T13-LEDGER | selected |
| source-5ec92ed8eb7c664752c179f6 | WF2-R2-INVOKE | selected |
| source-5ed71aa8dee3c408184b5167 | WF2-R6-ARCHIVED | rejected_current_snapshot |
| source-5f2f60689df7964a3fe4fa56 | PROC-T18-REPORT | selected |
| source-60e6fab77af45f9c2bde1ecc | WF2-P6-ENTRYPOINT | selected |
| source-60f1d8d32af58e3c1772b1d1 | PROC-T13-LEDGER | selected |
| source-61060f515b48c9284440815f | PROC-T14-BOUNDED-DOC | selected |
| source-6109286cf50be04f67f2b427 | PROC-T16-INPUT-PROCESS | selected |
| source-61972ab69dff727d73b81231 | WF2-R4-EXECUTOR | conditional |
| source-61e92951d83f50818aab7248 | PROC-T16-INPUT-PROCESS | selected |
| source-627a08e2dd90d652ebf61457 | WF2-P7-MANIFEST | selected |
| source-62df0f711e5ae203237bb4a1 | PROC-T17-PATH | selected |
| source-6405858a097b1bd5e2f80d30 | PROC-T18-BZR-HANDOFF | selected |
| source-657058eea29c4c1daed416c3 | REG-BRIDGE-OWNER-VERSION-LIFECYCLE | selected |
| source-66c039c026623426f8667cf2 | WF2-P7-MANIFEST | selected |
| source-67430234a5556c4e33b801fb | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-67e4c888b7aa389e2ebf5135 | WF2-R2-INVOKE | selected |
| source-67f9d036814509f2a04e92ce | PROC-T18-BZR-HANDOFF | selected |
| source-685712c718e0fc99204a8363 | WF2-R5-BOB | conditional |
| source-68752b504e6e6d0a501987f7 | PROC-T16-INPUT-PROCESS | selected |
| source-68e935618e8909d8f47822a1 | REG-BRIDGE-OWNER-VERSION-LIFECYCLE | selected |
| source-68f5463300aecabb2ee9a102 | WF2-P4-COMPILER | selected |
| source-6b16cf78cbd9cf1ded5f9240 | PROC-T17-DEADLINE | selected |
| source-6bd46f52727f256b495ee3d7 | REG-BRIDGE-OWNER-VERSION-LIFECYCLE | selected |
| source-6c4642fcb7b9c15c901d72c2 | PROC-T17-DEADLINE | selected |
| source-6cbaad21c2068409918643eb | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-6cfca7a5d4d2ee4214050c87 | WF2-P4-COMPILER | selected |
| source-6d627a871a7f238b34893ad7 | PROC-T17-DEADLINE | selected |
| source-6de3556d4b766da3795e6b0c | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-6e47fdc9c880c66578479d9e | PROC-T14-BOUNDED-DOC | selected |
| source-6e4f27e3414ecd0dbbe3abb7 | REG-BRIDGE-OWNER-VERSION-LIFECYCLE | selected |
| source-6e83ef7a0f958789ba1fa2ed | PROC-T17-DEADLINE | selected |
| source-6e8fa17958aafecbb92172bd | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-6ea58dc2902ca040cae5f75f | PROC-T13-LEDGER | selected |
| source-6eb20632fef31abd1bc65c67 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-6ed53a774d194de006046976 | REG-BRIDGE-DISCOVERY-EVIDENCE | selected |
| source-6eeca2d26a9aa16ab8ef600e | PROC-T17-DEADLINE | selected |
| source-6f36d055862923caea3a35e1 | PROC-T17-PATH | selected |
| source-6f4fe152412c275a26ef800d | PROC-T18-REPORT | selected |
| source-6f838249b43f683bd474a127 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-700d79ad28282566c4a56ca3 | REG-BRIDGE-OWNER-VERSION-LIFECYCLE | selected |
| source-7021229a1b36012137ed7676 | WF2-P6-ENTRYPOINT | selected |
| source-70b2e2cc5195bc85e5d8f4fd | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-70c2dea15f32dc8ddf7a81e4 | PROC-T17-DEADLINE | selected |
| source-70fef9b583863580a47ddc75 | PROC-T15-AGGREGATE | selected |
| source-7116e7cb3ced13ad31835489 | WF2-B-BASELINE-LOCK-SYNC-REMAINDER | superseded |
| source-71443e2d19d7a40e05e396e8 | REG-BRIDGE-OWNER-VERSION-LIFECYCLE | selected |
| source-718be8379c70ab754a9d7484 | WF2-R1-PROVENANCE | selected |
| source-721523ae63cd162bf55c8c6f | REG-BRIDGE-OWNER-VERSION-LIFECYCLE | selected |
| source-72a412bb6c5f0ba82dff9b1b | REG-BRIDGE-OWNER-VERSION-LIFECYCLE | selected |
| source-730c5e064055f1b7adffeb69 | PROC-T17-DEADLINE | selected |
| source-730d00e957bf6cefffeeacf2 | REG-BRIDGE-OWNER-VERSION-LIFECYCLE | selected |
| source-734c3cbaf46b50e06430134a | WF2-R6-ARCHIVED | rejected_current_snapshot |
| source-735f5d06fdf443c1d0e0a906 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-73fac3b407195c97a05d729c | WF2-P4-COMPILER | selected |
| source-755991a7e0fc967724e8c0f9 | PROC-T18-REPORT | selected |
| source-7562832c7a70c95e37804221 | WF2-R5-BOB | conditional |
| source-757ca93020f46db1d64ffa69 | PROC-T14-BOUNDED-DOC | selected |
| source-75b1b741f06e4b48d4064dc6 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-75bd0042a5f39793d323ed37 | PROC-T13-LEDGER | selected |
| source-75c07aaa99be8455bdc3285f | WF2-R1-PROVENANCE | selected |
| source-766a64b493cd8b3b12542bb6 | PROC-T14-BOUNDED-DOC | selected |
| source-767f35e7bd80060d344901b0 | WF2-P4-COMPILER | selected |
| source-768d9ad2e94b72efc0fd7ad5 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-773145e87b6df693130cda15 | REG-BRIDGE-DISCOVERY-EVIDENCE | selected |
| source-77efe876583486afd84bc446 | PROC-T14-BOUNDED-DOC | selected |
| source-788d202720178fa50934caf4 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-78c261d75a6572afd9103a67 | WF2-R4-EXECUTOR | conditional |
| source-78f752cc0e5f73accb3136e0 | WF2-P4-COMPILER | selected |
| source-79538ea5d40f171fbe46570f | PROC-ARCHIVED-IMPLEMENTATION-REMAINDER | superseded |
| source-796d77fe51d8eede02f4b8d9 | WF2-R5-BOB | conditional |
| source-79bd38ef5563e7b3aec53fd6 | REG-BRIDGE-OWNER-VERSION-LIFECYCLE | selected |
| source-79e4eb6fc7765cd1fd77e404 | WF2-P4-COMPILER | selected |
| source-79eaa2908653365204363bca | PROC-T14-BOUNDED-DOC | selected |
| source-7ae51bbef33180664889fba4 | WF2-R1-PROVENANCE | selected |
| source-7b4478e568123faa4d57384b | REG-BRIDGE-DISCOVERY-EVIDENCE | selected |
| source-7b6a8ca9b6683dfebe539566 | PROC-T16-INPUT-PROCESS | selected |
| source-7b83c4602a45112783d66e76 | PROC-T15-AGGREGATE | selected |
| source-7bbfd459d31e9a487d1b45ea | WF2-R5-BOB | conditional |
| source-7be491602c8812aa1b1590e4 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-7c2f86e907d4d182660ea0bb | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-7c4ba109c3323751bd6c0460 | PROC-T16-INPUT-PROCESS | selected |
| source-7d5b9b0f1f44489ab6c9b709 | WF2-R3-ARTIFACT-TX | conditional |
| source-7d60880ac3e0cadb3ae491f1 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-7d6321e410fcbc313aae8ff1 | PROC-T18-CCR-HANDOFF | selected |
| source-7d745b5944c1a7b68cfb1465 | PROC-T17-DEADLINE | selected |
| source-7dee62d9c1c099f84978d8d3 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-7df7e5b670df977bd1ba69ff | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-7e294b1663bc5ee0222ffcf6 | WF2-R5-BOB | conditional |
| source-7e6c62b05bfe25b2370aaefd | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-7eeec6df64115cc1b866f89f | WF2-P7-MANIFEST | selected |
| source-7ef754ae59ee342963211de7 | WF2-R6-ARCHIVED | rejected_current_snapshot |
| source-7efd822b4a76ff101a014c32 | WF2-P4-COMPILER | selected |
| source-7f07993cdbcd31fb971d7292 | WF2-R6-ARCHIVED | rejected_current_snapshot |
| source-7fac6492e3e471002b40d219 | WF2-R2-INVOKE | selected |
| source-801768019e34c2f11d9a1dd1 | PROC-T18-CCR-HANDOFF | selected |
| source-803a62f006f784c3e094425c | PROC-T18-CCR-HANDOFF | selected |
| source-80994c711887d22f843b9eff | PROC-T13-LEDGER | selected |
| source-80a3429ee46bc8ebb7c64ac9 | WF2-R3-ARTIFACT-TX | conditional |
| source-80f3da695e6d7d6d02f49660 | PROC-ARCHIVED-IMPLEMENTATION-REMAINDER | superseded |
| source-814d19d6eb54203594b75a4e | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-81dbd3422d5271c2937c1f2d | REG-BRIDGE-DISCOVERY-EVIDENCE | selected |
| source-83eef9cf8e2990705d59370e | REG-BRIDGE-OWNER-VERSION-LIFECYCLE | selected |
| source-8492929ccbf4e4e7516dfa77 | WF2-R6-ARCHIVED | rejected_current_snapshot |
| source-84c0ecbeece6f1a6ebd7f215 | PROC-T17-DEADLINE | selected |
| source-859cf9b394d1bc84511ef37d | PROC-T17-DEADLINE | selected |
| source-85b0b67dff73be4be2abfbd4 | PROC-T17-DEADLINE | selected |
| source-861855ac2fa66f2a6f18da8b | WF2-P6-ENTRYPOINT | selected |
| source-8659629d45522f256722a033 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-8782a165a56c7f2ca9079bdc | PROC-ARCHIVED-IMPLEMENTATION-REMAINDER | superseded |
| source-8824803e8ace4a3ff84a12cd | WF2-P4-COMPILER | selected |
| source-883c2cc5a7aa138768bba140 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-88604e6280fac57594af0b14 | REG-BRIDGE-OWNER-VERSION-LIFECYCLE | selected |
| source-888302701c275d7a8c7fb34c | REG-BRIDGE-OWNER-VERSION-LIFECYCLE | selected |
| source-88eaed95118bf51f812a1b91 | PROC-T14-BOUNDED-DOC | selected |
| source-8921fb578f27dc51782bedbb | PROC-T14-BOUNDED-DOC | selected |
| source-89514da5f9297a2a073a769c | WF2-R6-ARCHIVED | rejected_current_snapshot |
| source-89d0e5f328845d309a4f36b2 | PROC-T18-REPORT | selected |
| source-8a9ffa46822a89cd79082f5d | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-8bc8f4d403d2a239104b230b | PROC-T14-BOUNDED-DOC | selected |
| source-8bd330be0e18a8152c060000 | WF2-R3-ARTIFACT-TX | conditional |
| source-8c1e22567f17ea817712dbb5 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-8c8b935c16fbfd490ffaed7c | PROC-T14-BOUNDED-DOC | selected |
| source-8d5faabdd4d5cbbdadfebd96 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-8d7ffdb614cbb1a8db423f89 | WF2-R3-ARTIFACT-TX | conditional |
| source-8dc5485552be7425939200b7 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-8e3b86b3a6de7af9e1618c70 | PROC-T18-CCR-HANDOFF | selected |
| source-8e4006e199b552802bd3321e | PROC-T14-BOUNDED-DOC | selected |
| source-8ef808b753a3b4800ac122fe | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-8f20d598ea0db48f404c389e | PROC-T16-INPUT-PROCESS | selected |
| source-8fa3d05a66f65b14f13a23c3 | WF2-R6-ARCHIVED | rejected_current_snapshot |
| source-916fc5f88edf845b05b4448f | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-917527dedba80f811bb34bac | WF2-R2-INVOKE | selected |
| source-91cf4c49b2cb9bdf722a7db1 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-92520c1f32f5bb800763bb5b | WF2-P6-ENTRYPOINT | selected |
| source-92c9c09c80024b9a183e6a25 | PROC-T14-BOUNDED-DOC | selected |
| source-933f4d876b1f1a77bdef2c3d | PROC-T15-AGGREGATE | selected |
| source-9364e198f4b4e13273dfe750 | PROC-T14-BOUNDED-DOC | selected |
| source-94194ee1dba8f868d0ff9ed8 | WF2-R4-EXECUTOR | conditional |
| source-94c75d7f2b39527bdd46537b | REG-BRIDGE-DISCOVERY-EVIDENCE | selected |
| source-953d5c8bae1672e20051e94c | WF2-R5-BOB | conditional |
| source-9541bc7c3682a1884683af85 | PROC-T18-BZR-HANDOFF | selected |
| source-9659ba5cde0d919ac0a0e8c8 | PROC-T17-DEADLINE | selected |
| source-96bdd8242f50fe80fcde07d9 | PROC-T18-BZR-HANDOFF | selected |
| source-97484d9af41b96702e19325b | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-97d1cc092174ad9298f276e1 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-98807ab1ee6c8bdac14eb58b | WF2-R3-ARTIFACT-TX | conditional |
| source-98cac7e8ff20128e72d6b174 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-98d63195b541433bc119f411 | PROC-T14-BOUNDED-DOC | selected |
| source-9909fe163821c8d49a50588a | PROC-T17-DEADLINE | selected |
| source-99311c4ce299ef0aa83c05d1 | PROC-T18-REPORT | selected |
| source-9a74d6db2fd202c510a25c88 | PROC-T18-BZR-HANDOFF | selected |
| source-9aad994c88d618f45c216249 | WF2-R1-PROVENANCE | selected |
| source-9b016ff62347354a74c4f2ac | PROC-T18-BZR-HANDOFF | selected |
| source-9b2c73f17f281c878e5e2b4e | WF2-R4-EXECUTOR | conditional |
| source-9b5a3df1781361b2e783d0d0 | PROC-T16-INPUT-PROCESS | selected |
| source-9b610312085b3c0ee241b151 | WF2-R4-EXECUTOR | conditional |
| source-9bc9f210f1d28338ae8fb4fd | PROC-T18-CCR-HANDOFF | selected |
| source-9c06a4751ee2e5cb236ffade | WF2-R2-INVOKE | selected |
| source-9c736d36f51e003acd61ec67 | PROC-T14-BOUNDED-DOC | selected |
| source-9c85d790c8430b35032bb0b3 | WF2-P6-ENTRYPOINT | selected |
| source-9cc52a834c6aea8a25753584 | WF2-R6-ARCHIVED | rejected_current_snapshot |
| source-9cd501a3a6adc9ecd19702a7 | WF2-P4-COMPILER | selected |
| source-9ce8c736275573d2f95cb081 | PROC-T17-DEADLINE | selected |
| source-9d316c3268f51794c2003b24 | PROC-T18-CCR-HANDOFF | selected |
| source-9d3b8054b264f92bd285309d | WF2-P5-PLANSTORE | selected |
| source-9e02784b89c52dedd2cc178f | PROC-T18-REPORT | selected |
| source-9e2d758ed049f9c11c3e63f9 | PROC-ARCHIVED-IMPLEMENTATION-REMAINDER | superseded |
| source-9e6d125b619471c4637173cb | PROC-T14-BOUNDED-DOC | selected |
| source-9ec26de51d53744e7456932b | WF2-P4-COMPILER | selected |
| source-9f42d0f519b0985a176778aa | PROC-T13-LEDGER | selected |
| source-a1581360299210be8dd381b0 | REG-BRIDGE-OWNER-VERSION-LIFECYCLE | selected |
| source-a193c9edd0f1f44d9fef6cd3 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-a19b32d43066e13a87c2dc72 | WF2-R6-ARCHIVED | rejected_current_snapshot |
| source-a19cf56f8839f61bbf85c8a4 | WF2-P6-ENTRYPOINT | selected |
| source-a2b03f10fed5ed28286aed02 | PROC-T17-DEADLINE | selected |
| source-a2f4e841de98c10855985c8d | PROC-T14-BOUNDED-DOC | selected |
| source-a3b4ca6a0b1e4db038b83ee2 | REG-BRIDGE-DISCOVERY-EVIDENCE | selected |
| source-a3fd41a350be7f1b0dea1bc7 | REG-BRIDGE-OWNER-VERSION-LIFECYCLE | selected |
| source-a4145c194cf2045b2a8dee14 | WF2-P7-MANIFEST | selected |
| source-a41b2626b4461b56baed3a5d | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-a454f8df9fcade23d410f8f9 | PROC-T15-AGGREGATE | selected |
| source-a542dff0e366e0cd08fb9506 | PROC-T15-AGGREGATE | selected |
| source-a5eabe004258ac7de4b9ebdb | WF2-R1-PROVENANCE | selected |
| source-a5ee11c6fe89e01547ca21ac | PROC-T18-REPORT | selected |
| source-a67f1076c6e1454f31fa386e | PROC-T16-INPUT-PROCESS | selected |
| source-a77980002a25c17a64c1ac3f | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-a7a47b2c4935ee934a70ff9f | PROC-T16-INPUT-PROCESS | selected |
| source-a7bc4d9c841743268ccca70c | PROC-T14-BOUNDED-DOC | selected |
| source-a7f21730f621e090b2aed5e9 | WF2-R1-PROVENANCE | selected |
| source-a8286a3ff1ab7a81e19604a5 | PROC-T13-LEDGER | selected |
| source-a92768b7e7c911e7dfa0ed75 | WF2-R5-BOB | conditional |
| source-a988f317012704304ff20d34 | PROC-T16-INPUT-PROCESS | selected |
| source-aa0db1aab1be001df117aef6 | WF2-R6-ARCHIVED | rejected_current_snapshot |
| source-aa14b45b9a62c15e216b1e7a | PROC-T16-INPUT-PROCESS | selected |
| source-aa62885d24943041e4096545 | PROC-T17-PATH | selected |
| source-aa64e1c64d51e4da51fd72c7 | WF2-R2-INVOKE | selected |
| source-acc81c46bb2c069f22d48dbe | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-ace33ba08090fa6e5b2f7d26 | WF2-P4-COMPILER | selected |
| source-ad09a42bee1d878c41fe9e79 | PROC-T17-DEADLINE | selected |
| source-ad6ac90a37b17ebc84947235 | PROC-T16-INPUT-PROCESS | selected |
| source-ad7b565fdec29b64c3dc84cd | PROC-T18-REPORT | selected |
| source-ae183cbe4c9b75ab525591e6 | PROC-T18-REPORT | selected |
| source-ae53a107be8a2a34e41640fa | REG-BRIDGE-DISCOVERY-EVIDENCE | selected |
| source-aed1b503cd6d42355a5252da | WF2-R5-BOB | conditional |
| source-af2bee558009aa5c69c8e766 | PROC-T15-AGGREGATE | selected |
| source-af6a5d55a61245d8751451e4 | PROC-T18-CCR-HANDOFF | selected |
| source-afb53cdffbd113137c01fbfa | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-b039d96238b5105470eb021f | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-b04c545928739c04ba6a89f1 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-b06ff4b70ad3a69d34490e7e | WF2-R1-PROVENANCE | selected |
| source-b074e0b118b87c2068350699 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-b07af6a4536e3f305f2cbd96 | REG-BRIDGE-DISCOVERY-EVIDENCE | selected |
| source-b0d34954e5c18ba7b31098a5 | REG-BRIDGE-DISCOVERY-EVIDENCE | selected |
| source-b11e3d49cc49cbfcfc612cea | PROC-T15-AGGREGATE | selected |
| source-b2589bea9d2c93467ca169a1 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-b2a64440acdc6241751cb96d | PROC-ARCHIVED-IMPLEMENTATION-REMAINDER | superseded |
| source-b33145fb261ad05c13b57e8d | PROC-T17-PATH | selected |
| source-b335aea38d77e70867dbff68 | PROC-T17-DEADLINE | selected |
| source-b34cfecc5780177b7e7a6602 | WF2-R4-EXECUTOR | conditional |
| source-b34effffdee1aaefaf071226 | WF2-R5-BOB | conditional |
| source-b3f1242a2d63fad26d27bd6d | PROC-T16-INPUT-PROCESS | selected |
| source-b42ad7fac197b9e39191d933 | WF2-R4-EXECUTOR | conditional |
| source-b44b413221797bf9735b1192 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-b491a6068d95f0fce3be3671 | PROC-T18-REPORT | selected |
| source-b4ab7cc1ae4820e5605f057e | PROC-T14-BOUNDED-DOC | selected |
| source-b53c2ffd6380fb43f64ba82c | WF2-R4-EXECUTOR | conditional |
| source-b6559f4252d41eb4e54ca77c | PROC-T18-BZR-HANDOFF | selected |
| source-b69378eb229cf54aef34ce86 | WF2-P6-ENTRYPOINT | selected |
| source-b6f88ff9b6c95adcacaded9e | PROC-T13-LEDGER | selected |
| source-b70d9366a8f58c57853ffb5c | REG-BRIDGE-DISCOVERY-EVIDENCE | selected |
| source-b7f2224e7b3370bcd1126871 | REG-BRIDGE-OWNER-VERSION-LIFECYCLE | selected |
| source-b81959ae019101dc335c9c98 | PROC-T17-DEADLINE | selected |
| source-b828b14f3a5c2a07fea08db5 | REG-BRIDGE-OWNER-VERSION-LIFECYCLE | selected |
| source-b8b9df65d1f3050c70c13f7c | PROC-T17-DEADLINE | selected |
| source-b9f28d9c236055510138155b | WF2-R6-ARCHIVED | rejected_current_snapshot |
| source-b9febf9c1b199ac9a861df0a | PROC-T15-AGGREGATE | selected |
| source-ba2be74a97fc42e035b5c504 | PROC-T18-REPORT | selected |
| source-ba56f810f0c338c02ff4e864 | WF2-R1-PROVENANCE | selected |
| source-ba5dd4e43d521c23f3be77da | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-ba622294349bb562549c5825 | WF2-R1-PROVENANCE | selected |
| source-bad557b70efbcace66d9fb13 | PROC-T18-CCR-HANDOFF | selected |
| source-baf82d9ac92ee14d5662a30b | WF2-R6-ARCHIVED | rejected_current_snapshot |
| source-bb1f1886f02fe1d15e4ddf67 | PROC-T15-AGGREGATE | selected |
| source-bb36cc223579317b73b3e641 | PROC-T18-CCR-HANDOFF | selected |
| source-bb91584f71612f3e175e76f2 | PROC-T17-DEADLINE | selected |
| source-bbf2ca2bcc7c77ab957b9da0 | REG-BRIDGE-DISCOVERY-EVIDENCE | selected |
| source-bc1c6595fef769aedee758f4 | PROC-T15-AGGREGATE | selected |
| source-bc5ca26554439a83438dd5e7 | PROC-T13-LEDGER | selected |
| source-bc663b1b06449423e3f4ff04 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-bcc284e4d66c136f1264b98b | WF2-P6-ENTRYPOINT | selected |
| source-bcda8a354f3057f49558f404 | WF2-P4-COMPILER | selected |
| source-bce85497eb40decefc886f6c | PROC-T18-CCR-HANDOFF | selected |
| source-bd280a6ac95d7ff0d082b949 | WF2-P4-COMPILER | selected |
| source-bda3c142c71b53f9bbdd6e2d | PROC-T17-DEADLINE | selected |
| source-be55c3c119eead1776236c35 | PROC-T18-CCR-HANDOFF | selected |
| source-bebb5727accfba3061935b0b | WF2-P4-COMPILER | selected |
| source-beda9c4e8baebbfbfc49b093 | WF2-P5-PLANSTORE | selected |
| source-bee0458df16f3bebdc583818 | WF2-P4-COMPILER | selected |
| source-bf5a1d63ef4b8f946cc8f95b | PROC-T17-DEADLINE | selected |
| source-bf5b05e841f3360877c4ccb2 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-c07621bcfe509d992b18e1c9 | PROC-T16-INPUT-PROCESS | selected |
| source-c07e349e46e5969f9dd00866 | PROC-T15-AGGREGATE | selected |
| source-c16ed9fb4a5aafaa5d62872e | WF2-R4-EXECUTOR | conditional |
| source-c17b90eda53c1c3096c12b4a | WF2-P6-ENTRYPOINT | selected |
| source-c1ea5dfe65e4163d347fcdf0 | PROC-T18-REPORT | selected |
| source-c22f6c70eb524373f02f229b | PROC-T17-DEADLINE | selected |
| source-c25dcfd41610e3599d785c9c | WF2-R4-EXECUTOR | conditional |
| source-c28e612c6145c4fc213178d0 | WF2-R6-ARCHIVED | rejected_current_snapshot |
| source-c2ea231c964bc6a6742637c4 | WF2-P7-MANIFEST | selected |
| source-c357a71f441254a3b0893e6a | REG-BRIDGE-OWNER-VERSION-LIFECYCLE | selected |
| source-c3731cfb10994c67a2629d82 | PROC-T16-INPUT-PROCESS | selected |
| source-c3ad921f37b6a82d27d7af4e | PROC-T17-DEADLINE | selected |
| source-c3ae7291d50d386e060d0aa7 | WF2-R3-ARTIFACT-TX | conditional |
| source-c4a71884a59c961e40fd6866 | PROC-T14-BOUNDED-DOC | selected |
| source-c5828e6fb833ccaa6eea4c0f | REG-BRIDGE-OWNER-VERSION-LIFECYCLE | selected |
| source-c5d5b65122e2c53ffd7d29d6 | PROC-ARCHIVED-IMPLEMENTATION-REMAINDER | superseded |
| source-c5ef33df69d6a0783a978472 | PROC-ARCHIVED-IMPLEMENTATION-REMAINDER | superseded |
| source-c6293fce78faaf8b47f702b4 | PROC-T16-INPUT-PROCESS | selected |
| source-c6452bd8b89372c3fd6d6081 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-c668d15a27fb0827e9efe91d | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-c700c2499c181ae03baac177 | PROC-T18-REPORT | selected |
| source-c703fda5b8fe92276d3af8ad | WF2-R3-ARTIFACT-TX | conditional |
| source-c72737ff1d4766b1f111f852 | WF2-R5-BOB | conditional |
| source-c7836f19ab61ab5583ec71aa | PROC-T17-DEADLINE | selected |
| source-c7840f4d1fe2e382e974f73a | PROC-T14-BOUNDED-DOC | selected |
| source-c7bb6706403b362f18e01e4d | PROC-T16-INPUT-PROCESS | selected |
| source-c806c587186a1fbff11dc6fd | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-c83a9e14dd82e30b24744a40 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-c84f819d75a53bfcc42d3531 | PROC-T17-DEADLINE | selected |
| source-c87b9592a9003fb1046dad54 | PROC-T13-LEDGER | selected |
| source-c89e42bd9d47e129405c0284 | WF2-P6-ENTRYPOINT | selected |
| source-c94e5b4733fcfbb933447a84 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-c96bb205f0c1fa19b450db1a | PROC-T16-INPUT-PROCESS | selected |
| source-c9f505b2135e396584ef1e43 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-c9f9168d602096cc4dd38962 | REG-BRIDGE-DISCOVERY-EVIDENCE | selected |
| source-c9fff7f8e0565ec70b7d8e8f | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-ca4e97785c37f540250cf9fa | PROC-T17-PATH | selected |
| source-ca652a2c9d999bb36a7729f2 | WF2-R6-ARCHIVED | rejected_current_snapshot |
| source-ca7404fcccfb8012f2637dd7 | PROC-T17-DEADLINE | selected |
| source-cadf6df2cd6d0b41cd4b897f | PROC-T17-DEADLINE | selected |
| source-caf09c280275a6ebe087fe80 | PROC-T17-PATH | selected |
| source-cb047bfd559849ceb6956e36 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-ccdeaf8900368dfaf0e5f97f | WF2-P6-ENTRYPOINT | selected |
| source-cd4146faf60909d221d9de06 | PROC-T18-BZR-HANDOFF | selected |
| source-cdf137d4537fd538dbf91ffe | WF2-P4-COMPILER | selected |
| source-cdf15f7d0d73f91e0a022cfd | PROC-T17-DEADLINE | selected |
| source-ce917f59c8241b117731f93e | WF2-P4-COMPILER | selected |
| source-cf0fd4106530603ac4766aba | PROC-T18-BZR-HANDOFF | selected |
| source-cf8f1f69cdf000dc7a49b7bc | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-d00fdc4453525c52ab2e44a2 | PROC-T15-AGGREGATE | selected |
| source-d04f52986688fcbd24d8cda7 | PROC-T17-PATH | selected |
| source-d0917810045b5739bc8f6370 | PROC-T17-DEADLINE | selected |
| source-d2c3714904c50e0fe41bbb09 | PROC-T14-BOUNDED-DOC | selected |
| source-d426695e21f4a57eaa2e650b | WF2-R5-BOB | conditional |
| source-d47d8a1ad7e651d178c4ecb1 | PROC-T17-DEADLINE | selected |
| source-d4a33aff27a5fdfe2ef009b7 | PROC-T15-AGGREGATE | selected |
| source-d4e08dcfed03d4704221716b | PROC-T15-AGGREGATE | selected |
| source-d51d0f0701cb68ddc04dc206 | PROC-T17-DEADLINE | selected |
| source-d58c2d20a91dc40737b44e4c | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-d5ad4f08da715d0c729c24a8 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-d611ffe8c5f4eea7886a38c5 | WF2-P4-COMPILER | selected |
| source-d6e35ead5bdf9406a3ec4f01 | PROC-T17-DEADLINE | selected |
| source-d79dcd8a933e2243f74ff982 | REG-BRIDGE-OWNER-VERSION-LIFECYCLE | selected |
| source-d85738d7563a0ea4c27f8d41 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-d869381edc302fee73a78b09 | PROC-T15-AGGREGATE | selected |
| source-d8d5bd080d551ab76782183d | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-d8fda3dd7e23d8a1d7e5c0d5 | REG-BRIDGE-OWNER-VERSION-LIFECYCLE | selected |
| source-da2feeae2c1db949eb941ed1 | WF2-R5-BOB | conditional |
| source-da39f68ce042cc7d54b5e92b | PROC-T14-BOUNDED-DOC | selected |
| source-db0dcef3635a43637cc9c2f3 | PROC-T14-BOUNDED-DOC | selected |
| source-db81d68332957cd43752ade9 | PROC-T13-LEDGER | selected |
| source-dbf0e78300057ea404011413 | PROC-T13-LEDGER | selected |
| source-dc0a21748ac93670ea1487d0 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-dc1308461f2b82bbe709d2a9 | PROC-T15-AGGREGATE | selected |
| source-dc3d38365c4b273e9ed23a20 | WF2-B-BASELINE-LOCK-SYNC-REMAINDER | superseded |
| source-dcc9d121869659f63332ad3a | REG-BRIDGE-OWNER-VERSION-LIFECYCLE | selected |
| source-dd222a5fc261fb64b45fba8b | PROC-T17-DEADLINE | selected |
| source-dda090c32e79effef12b5905 | PROC-T16-INPUT-PROCESS | selected |
| source-ddbcf5073d1165cea16c732a | WF2-P6-ENTRYPOINT | selected |
| source-de0de82ae384806c1fca5b31 | PROC-T18-REPORT | selected |
| source-de3b9139421e60c0585e67ab | PROC-T17-PATH | selected |
| source-ded09201e927f84b96d1ea91 | REG-BRIDGE-DISCOVERY-EVIDENCE | selected |
| source-df389420fc16a7c3191f1011 | PROC-T15-AGGREGATE | selected |
| source-df3ef033dd61514f10966848 | PROC-T13-LEDGER | selected |
| source-e012c4cc6fe60e657e681cb5 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-e050742b7b51a7e281552c43 | PROC-T13-LEDGER | selected |
| source-e056445cbc6911cd4866e520 | PROC-T14-BOUNDED-DOC | selected |
| source-e08fa31f4527651e1c53a428 | PROC-T16-INPUT-PROCESS | selected |
| source-e12579c149150d82df1c4698 | WF2-R4-EXECUTOR | conditional |
| source-e1425c0445b88a037b0c09af | PROC-T14-BOUNDED-DOC | selected |
| source-e2649725e3a40cd18302e95a | REG-BRIDGE-OWNER-VERSION-LIFECYCLE | selected |
| source-e3a6350764da6b82cdda693e | WF2-P4-COMPILER | selected |
| source-e3e849812855473a059fab39 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-e40a45eb8079544de379b574 | WF2-R6-ARCHIVED | rejected_current_snapshot |
| source-e4aab2d934795fa338eb336a | PROC-T15-AGGREGATE | selected |
| source-e5383e8d285f9ae1a990d45f | WF2-P6-ENTRYPOINT | selected |
| source-e542ef59e6f2d7ba3ec2fdbc | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-e5fef947b0f89ff9ec2a09a5 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-e6276ab81d5965f9ef86745d | WF2-R2-INVOKE | selected |
| source-e69de915da3b2c2508e9cb90 | PROC-T17-DEADLINE | selected |
| source-e6b932cf56ceda58b85a155f | PROC-T14-BOUNDED-DOC | selected |
| source-e6cc56c09eaf6e145c50b409 | PROC-T18-REPORT | selected |
| source-e74f771cff841decd9c7e270 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-e793797efde60a580b26b863 | WF2-R5-BOB | conditional |
| source-e85cf5dafb81fc219d5780e0 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-e8b58057c4615ef67af1bf85 | WF2-P4-COMPILER | selected |
| source-e8f3a56005a262a9606c1e60 | PROC-T14-BOUNDED-DOC | selected |
| source-e9053c4efd76a31cfe133bdb | WF2-R2-INVOKE | selected |
| source-e960b66c70c58f030bd5c259 | WF2-P6-ENTRYPOINT | selected |
| source-e977bcd5e446bea87321191c | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-e97fb940447f8795f030dd5a | REG-BRIDGE-DISCOVERY-EVIDENCE | selected |
| source-e98cec4ab341f9224f6e2ee0 | WF2-R2-INVOKE | selected |
| source-e9d5a1e9d34f3ddaa30417cb | PROC-T14-BOUNDED-DOC | selected |
| source-ea3a1c93f1943b1e70e5990c | PROC-T17-DEADLINE | selected |
| source-eb7aeef897a4f48ed72d6900 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-ebbc80adbe86accc7deb0bb0 | PROC-T15-AGGREGATE | selected |
| source-ebfc5cdf5f699bf21c7f452d | PROC-T17-PATH | selected |
| source-ecd28ff2184f030296cb7e8f | REG-BRIDGE-DISCOVERY-EVIDENCE | selected |
| source-ed1e49e2ede1bb77d9551e9d | PROC-T17-DEADLINE | selected |
| source-edd501db0565ffbac6ca0b45 | WF2-P4-COMPILER | selected |
| source-ee09d1109431e8dcb4ef836b | REG-BRIDGE-OWNER-VERSION-LIFECYCLE | selected |
| source-ee83d0ea1a94fff4b49b92b3 | WF2-R5-BOB | conditional |
| source-ef195dcb7064aa411dcd1bb3 | PROC-T17-PATH | selected |
| source-ef342bf8f2f3c3f4b9629d6e | REG-BRIDGE-OWNER-VERSION-LIFECYCLE | selected |
| source-ef8686105cd944dc38900da7 | REG-BRIDGE-OWNER-VERSION-LIFECYCLE | selected |
| source-efac4394ba806915bbe2d722 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-efdfd169459fd6cf212c2e84 | REG-BRIDGE-OWNER-VERSION-LIFECYCLE | selected |
| source-efeea41da424681431167d02 | WF2-P6-ENTRYPOINT | selected |
| source-f0138af267eed6886093ed36 | PROC-T16-INPUT-PROCESS | selected |
| source-f0e97950679a6e452b2e8f4f | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-f10cf7e3aac8376a0cd86693 | REG-BRIDGE-DISCOVERY-EVIDENCE | selected |
| source-f14004623c57da377fe105ce | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-f179ffbdb55719af4e5a84aa | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-f3f205bf99923a7ac27a4b0e | PROC-T18-REPORT | selected |
| source-f3f7f3e748ae358affcdd47f | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-f3f7f4b0b7abd506c0c8f506 | WF2-R2-INVOKE | selected |
| source-f52509adf05476fb73e8d056 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-f5cc6d57f7acdbfab147248d | WF2-R5-BOB | conditional |
| source-f66668790e4e97e10e4c9a4a | PROC-ARCHIVED-IMPLEMENTATION-REMAINDER | superseded |
| source-f67f10f4f0b705f9399609cd | PROC-T14-BOUNDED-DOC | selected |
| source-f6fc2b5e885ec08c5c76a614 | PROC-T18-BZR-HANDOFF | selected |
| source-f754fb5af53527cbc82ca313 | PROC-T18-BZR-HANDOFF | selected |
| source-f7857de29e60e9f3caa993eb | PROC-T17-PATH | selected |
| source-f7af99547f1c8bfbb41c9f16 | WF2-P5-PLANSTORE | selected |
| source-f81376e6cca60ec0168ede79 | PROC-T17-PATH | selected |
| source-f894324f170cd6b0e3e013d0 | REG-BRIDGE-DISCOVERY-EVIDENCE | selected |
| source-f8996765a53be5a6b3ada292 | PROC-T18-REPORT | selected |
| source-f89eb258abf02ed66382987d | REG-BRIDGE-OWNER-VERSION-LIFECYCLE | selected |
| source-f8cc0ee1e565f3ed2153b9d1 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-f8e9072cf65ee834911af7cc | REG-BRIDGE-OWNER-VERSION-LIFECYCLE | selected |
| source-f8f725c5bb37f2e55a8a2900 | WF2-R3-ARTIFACT-TX | conditional |
| source-f904cb6ca0ff2960c755990a | PROC-T18-CCR-HANDOFF | selected |
| source-f98dad2e42e1ac4df497b82e | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-fa2bc8c2fdee77f0056338d5 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-fb04528e9e231cf695440dfb | REG-BRIDGE-OWNER-VERSION-LIFECYCLE | selected |
| source-fbf7b8c30abef77aac8614f0 | WF2-R5-BOB | conditional |
| source-fd40c97ba2097bd3305e520d | REG-BRIDGE-OWNER-VERSION-LIFECYCLE | selected |
| source-fd4c785327bc9f1638f5a7d4 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-fd93b64d67682284ad2a0ac1 | PROC-T16-INPUT-PROCESS | selected |
| source-fda2fa7cf647654a7ee23674 | REG-BRIDGE-OWNER-VERSION-LIFECYCLE | selected |
| source-fdd27f3176a3c1a89812bf70 | WF2-R6-ARCHIVED | rejected_current_snapshot |
| source-fdd3944951a97ce7698e0492 | WF2-P6-ENTRYPOINT | selected |
| source-fde858a48c84d66184d3513a | WF2-R1-PROVENANCE | selected |
| source-feaca6d983c78286ecd68be0 | REG-P1-PREREQUISITE-REMAINDER | superseded |
| source-fecb7999677bed9e8fe3ce13 | WF2-R2-INVOKE | selected |
| source-ff5a869fb5d43921d45c9a66 | REG-P1-PREREQUISITE-REMAINDER | superseded |
