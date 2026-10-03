# WF2 P4 Compiler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `WF2-P4-COMPILER`だけを統合し、immutable package bytesからdeterministic frozen planを生成する唯一のContract v2 compilerを追加する。

**Architecture:** 現行P1–P3/F1–F7 foundationを維持し、review済みP4 snapshotの意味を27 owned pathsへ再構成する。F3の一回のschema catalog constructionとopaque viewsを先に追加し、environment、private handle、semantic resolution、F6 binding、lock/policy、public facadeを一つのpipelineへ接続する。product entrypointやprovider invocationへは接続しない。

**Tech Stack:** TypeScript、Node.js 22、node:test、既存AJV draft 2020-12/catalog、既存strict YAML、canonical JSON/SHA-256、module-private WeakMap。

**Spec:** `docs/superpowers/specs/2026-08-23-feature-selection-and-sequential-main-integration-design.md` §7.1・§8–12（technical-only）、`docs/superpowers/specs/2026-08-31-wave0a-risk-tiered-approval-and-evidence-design.md`、`docs/superpowers/specs/2026-07-17-workflow-contract-v2-design.md` §15–16、`docs/superpowers/specs/2026-07-24-workflow-contract-v2-generation-directory-amendment.md`。詳細入力は既存 `2026-07-17-workflow-contract-v2-package-compiler.md` のP4 sectionのみ。

**Status:** review用の計画。P4実装は未着手。Wave 0B registry recovery publicationのmain統合・検証・cleanupを完了してからexecutionへ進む。

## Global Constraints

- sliceはProgram ordinal 2の `WF2-P4-COMPILER`。直前境界 `WAVE-0B-SELECTION-LEDGER:VERIFIED`、hard dependency `BASE-WF2-A` を検証する。
- `ONE_ACTIVE_SLICE`、`ONE_CONTINUOUS_SLICE_WORKSPACE`。先行publicationのactive branch/worktreeを残したままP4 workspaceを開始しない。
- `SOLE_IMMUTABLE_COMPILER`、`no_provider_lookup`、alternate compilerなし。最大activationは `shadow`。一般利用run directory作成、provider dispatch、Bob execution、artifact stagingは別activation設計まで禁止する。
- v1 command、公開API、保存schema、`Bob 操作ハブ`動作を維持する。P5 store/cache/lease、P6 product routing、P7 manifest、R2 invocation bridge、conditional R3–R5、旧R6 recoveryを追加しない。
- literal compiler versionは `workflow-register-compiler/v2`。P3の正確な九つの `WORKFLOW_COMPILER_POLICY_VERSIONS` をimportし、callerから代替versionを受け取らない。
- schema dialectは `https://json-schema.org/draft/2020-12/schema`。F3/F6の現行identity/binding契約を再利用し、別parser・別AJV validation pipelineを作らない。
- generation/package evidenceは `sha256:<hex>`。physical directoryの `sha256-<hex>` はP2境界だけ。物理pathをplanへ混入させない。
- 現行 `bobProfile.ts` のstable Bob 2.x host binding/optional `toSerializable` 改善を維持する。constructor入力は実interface `BobContractProfileResult`。persisted `BOB_2_0_1_PROFILE` identityを勝手に置換しない。
- source/archiveはread-only。carrier全体のpatch apply、cherry-pick、旧branch再作成、archive更新はしない。承認capture、request hash、claim/receipt、provider transcript、旧bootstrapを保存・実行しない。

## Source and Admission Binding

planning baselineは実main `b8876b2714d74bd8bbe686b66d17f2f76467f041`。execution baseはregistry recovery publicationを受け入れた実mainをその時点で読み取り、source provenanceとは別に記録する。未来のhead/merge/受入結果をこのplanやstatic ledgerへ書かない。

sourceは旧PR #153のowner-stage snapshot: base `683e794eb4a39eea7bc3630bedbd2a557f4af8af` → head `e0766f9448033688964fabbcfa6ae73b3d849ed0`。ledgerの30 `sourceItemIds`と27 target surfacesを正本にする。tranche `workflow-b` はP4–P7全体なので、range全体を採用してはならない。

execution開始時にsource universeのorigin/blob identitiesを再照合し、original repository bundleとremote recovery bundleの双方の期待P4 headをread-onlyで確認する。archive manifest SHA-256は `36e477ee9b752ebf7f07a208c166fec24e14a89bf7ba6a7921cf6bdf708c9f31`、Workflow B carrier patch SHA-256は `59eca51331f3c580a63435021e03c05780ffbe6b65db76949cb0d4bff8c428c7`。今回の計画調査では二つの実file hashを照合したが、bundle全体の再hashは未実施。

最初のcompiler commitだけでなく、P4 headに含まれるone-catalog、opaque role、raw snapshot、fresh prompt read等の修正後契約を採用する。歴史sourceをauthorityや現行仕様の代替にしない。

## Review Focus

1. publication/generation/raw bytesを同時に一回snapshotし、lock verifierや後段がcallerのmutable packageを再読しない（Snapshot/Pipeline Cases）。
2. 二段階同時failureで前段diagnosticを優先し、部分plan、provider call、run作成、lock write、artifact publishをすべて0にする（Pipeline/Core Cases）。
3. identical public digestの別environment/provider登録generation/purpose/stagingを同じprivate identityやleasable handleと扱わない（Environment/Core/Provider/Staging Cases）。
4. schema roleとsource bytesのfull identity、lexical references、input-only predicate、owning outputのpostCommit境界を崩さない（SchemaRoleOwnership/ReferenceRole/Predicate Cases）。
5. JSON planにBuffer・clock・host path・live registry・dispatch function・`planDigest`を入れず、private prompt readsをfresh copyにする（Plan/Semantic/Snapshot Cases）。

## File Map

source rootは `extensions/workflow-register/src/core/contractV2/`、test rootは `extensions/workflow-register/test/`。下記27 pathsはplanning baselineに未存在。

| Task | Source files | Responsibility |
| --- | --- | --- |
| 1 | `jsonSchemaCatalog.ts`, `jsonSchemaRole.ts` | F3 one-catalog/opaque per-root views、detached role/source binding |
| 2 | `compilerFiles.ts` | immutable raw snapshot、strict semantic prompt/schema bytes |
| 2 | `compilerReferences.ts`, `compilerSchemaRoles.ts` | lexical/schema references、role compatibility |
| 2 | `compilerEnvironment.ts`, `compilerBindings.ts` | private environment namespace、F6 exact provider/Bob binding |
| 2 | `compiledPlan.ts`, `compilerWorkflow.ts` | public frozen plan、private state、compiled execution/predicates |
| 2 | `compiler.ts`, `index.ts` | sole ordered pipeline、限定public facade |

test pathsはfixture `fixtures/workflow-contract-v2/compiler/valid-source/files.json`、suite entry `workflowContractV2Compiler.test.js`、support `workflowContractV2CompilerTestSupport.js`、次の13 families。fixture helperは `createLockedRawPackage(overrides={})` と既存lock test supportの `rawPackageFromFiles(files, overrides={})` を再利用する。

| Family file | Task | Contract |
| --- | --- | --- |
| `workflowContractV2CompilerSchemaCatalogCases.js` | 1 | one AJV construction、dense/sorted/unique roots |
| `workflowContractV2CompilerSchemaRoleOwnershipCases.js` | 1 | opaque detached roles、source mismatch、closed reasons |
| `workflowContractV2CompilerEnvironmentCases.js` | 2 | distinct environment identity、nonruntime compile-only binding |
| `workflowContractV2CompilerEnvironmentHardeningCases.js` | 2 | frozen Bob wrapper、hostile tuple/accessor拒否 |
| `workflowContractV2CompilerPipelineCases.js` | 2 | stage precedence、one raw snapshot |
| `workflowContractV2CompilerSnapshotCases.js` | 2 | publication/generation snapshot、fresh prompt bytes |
| `workflowContractV2CompilerCoreCases.js` | 2 | deterministic freeze、nonleaseability、hostile input |
| `workflowContractV2CompilerPlanCases.js` | 2 | public plan/adjacent digest、detached handle |
| `workflowContractV2CompilerSemanticCases.js` | 2 | strict UTF-8/LF、BOM/extra/missing files、redacted diagnostics |
| `workflowContractV2CompilerProviderCases.js` | 2 | exact binding、no lower-version fallback、generation保全 |
| `workflowContractV2CompilerPredicateCases.js` | 2 | entry/postCommit、current/future/unit/transient拒否 |
| `workflowContractV2CompilerReferenceRoleCases.js` | 2 | pointer/manual form/artifact full schema identity |
| `workflowContractV2CompilerStagingCases.js` | 2 | identical public evidence、published-only leaseability |

### Task 1: One Local Schema Catalog and Opaque Roles

**Files:** create source/testのTask 1所有4 files。既存 `jsonSchema.ts`, `jsonValue.ts`, diagnostics foundationを変更せず利用する。

**Interfaces:**
- `compileLocalJsonSchemaCatalog(input: CompileLocalJsonSchemaCatalogInput): CompileLocalJsonSchemaCatalogResult`。inputは `rootIds`, `schemas: readonly LocalJsonSchemaSource[]`, `diagnosticCode`, `location`。successは `roots: readonly {id,compiled:CompiledLocalJsonSchemaView}[]` とempty diagnostics、failureはsorted diagnostics。
- `createLocalJsonSchemaRoleHandle({compiled:CompiledLocalJsonSchemaView,schema:unknown}): LocalJsonSchemaRoleHandle`。
- `validateLocalJsonSchemaManualContract({role,fields:readonly LocalJsonSchemaManualFieldContract[]}): ValidateLocalJsonSchemaManualContractResult`。
- Task 2はopaque viewのpointer/dependency/value/predicate adaptersを利用する。private base validatorやrole rootはpublic compiler facadeへexportしない。

- [ ] **Step 1: Write failing behavioral tests.** 二つのdirect module case filesで一回AJV construction、全root identity、root並べ替え/重複/sparse/proxy拒否、opaque role/source bytes mismatch、hostile manual fields/getterを実schema入力に対してassertする。
- [ ] **Step 2: Run RED.** extension rootで `npm run compile`、`node --test test/workflowContractV2CompilerSchemaCatalogCases.js test/workflowContractV2CompilerSchemaRoleOwnershipCases.js`。新catalog/role不在による失敗を確認し、既存F3だけの別validatorで代替しない。
- [ ] **Step 3: Implement catalog and role contracts.** P4 source-owned functionsと現在のF3 `jsonSchema.ts` を接続し、schema root/source evidenceを一度clone/freezeしてopaque WeakMapへ保管する。全rootを一catalogから構築し、manual roleのclosed reasonとschema digest/$id一致を検証する。
- [ ] **Step 4: Run GREEN.** compile、二つのdirect module case files、`test/workflowContractV2JsonSchema.test.js`、`npm run architecture:policy`、`npm run source:policy` が成功。
- [ ] **Step 5: Commit.** Task 1の4 owned filesのみを明示stageし、`feat(workflow): add compiler schema catalog views`。

### Task 2: Immutable Compiler, Environment and Public Facade

**Files:** create Task 2の9 source filesと14 test/fixture files。Task 1の二つのfamilyをsuite entryへrequireする。existing foundationのruntime/Bob 2.x改善は保持する。

**Interfaces:**
```ts
compileWorkflowPackage(input: {
  readonly rawPackage: RawWorkflowPackage
  readonly environment: WorkflowCompilerEnvironment
}): WorkflowPackageCompileResult

createAuditedWorkflowCompilerEnvironment(input: {
  readonly purpose: "runtime" | "authoring-validation" | "evidence"
  readonly providerCatalog: WorkflowProviderCatalog
  readonly bobProfile: BobContractProfileResult
}): WorkflowCompilerEnvironment
```

successはopaque frozen `CompiledWorkflowPlanHandle`。public `plan`はpure JSON、`planDigest`はfrozen planの `canonicalJsonDigest` をhandle隣接fieldへ保存する。environment public objectはfrozen opaque object、constructor毎にdistinct private identity。private handleはenvironment identity、publication/generation、validators、normalized prompt bytes、F6 opaque dispatch handlesを保管し、dispatch functionsを抽出しない。

private helpersは `requireCompiledWorkflowPlanState(handle)`、`readCompiledWorkflowPromptBytes(handle,id):Uint8Array`、`compiledWorkflowPlanBelongsToEnvironment(handle,environment):boolean`、`isCompiledWorkflowPlanLeasable(handle):boolean`、`requireWorkflowCompilerEnvironmentState(environment)`。public barrelはcompile/environment facade、そのinput/result/environment types、`CompiledWorkflowPlan`/`CompiledWorkflowPlanHandle`/`CompiledWorkflowPlanPredicateRecord` typesだけを明示exportする。

- [ ] **Step 1: Write failing contract tests and fixture.** historical 13 familiesの41 top-level casesを現行foundationへ合わせ、Task 1以外の11 families、support、suite entry、valid-source fixtureを追加。次StepのGREENをfacade/import不在だけで判定せず、failure precedence・canonical plan・private identity・zero side effectsの実behaviorをassertする。
- [ ] **Step 2: Run RED.** extension rootでcompileと `node --test test/workflowContractV2Compiler.test.js`。pipeline順序 raw snapshot/layout→strict YAML→closed package shape→one catalog→references/schema roles/predicates→provider/Bob bind→lock→policy→canonical plan/deep freeze の新契約が未実装で失敗することを記録する。
- [ ] **Step 3: Implement immutable semantic inputs.** raw publication/generation/filesを一度detached snapshotし、strict UTF-8/LF prompt normalization、missing/unreferenced declarations、full schema-role identityとlexical pointerを検証する。後段lock verifierにcaller packageを再読させない。
- [ ] **Step 4: Implement environment and binding.** constructorがprivate identityを新設し、purposeはpublic digestsから除外する。F6が最高versionを一回選び、schema/effect/idempotency/capability mismatch時にlower-version fallbackしない。live registry dispose/re-register後もsnapshot generation/bound-handle identityを保持する。
- [ ] **Step 5: Implement frozen plan and lowering.** public planはcanonical pure JSON・deep frozen、`planDigest` fieldなし。input `requiredWhen`はinputsのみ、entry/templates/context/resultはstrictly earlier lexical value outputsのみ、outgoing transitionはowning value outputを許し `postCommit` とする。unit/current-at-entry/future/transient referencesとraw source predicate残存を拒否する。private prompt bytesはfresh detached read。
- [ ] **Step 6: Implement sole pipeline/public facade.** Task 1 adaptersとStep 3–5を `compiler.ts` へordered接続する。nonruntimeはordinary F6 handle＋throwing compile-only dispatchでnonleasable。private planのleaseabilityは `purpose==="runtime" && publication==="published"`。P5 acquire/cacheやproduct consumerは作らない。
- [ ] **Step 7: Run GREEN and local full checks.** compile、compiler suite全13 families、現行10 foundation `workflowContractV2*.test.js`、`npm run architecture:policy` / `source:policy` / `dependency:policy`、workflow-register `npm test` を実行し、failure 0。影響がある三拡張のquality gatesを既存repo commandで実行し、`git diff --check`、27 owned paths以外のproduct diffをreviewする。
- [ ] **Step 8: Review and commit.** source item/blob/omission mappingと独立reviewを行い、Critical/Important 0にする。Task 2 owned filesのみを明示stageし、`feat(workflow): add single immutable package compiler`。

## Integration and Handoff

local成果物だけでP4をVERIFIEDやproduct activeと宣言しない。公開・main統合はexact候補headを示す具体的C対象として扱い、candidate exact-head CI、merged-main exact-head CI、Ubuntu/Windows、変更product surfaceに該当するsame hashed VSIX UATを実施する。UAT不要なcompiler-only surfaceと判断する場合は理由と検証代替をreview recordへ残し、最終三拡張実機UATは省略しない。

workspace dispositionは同じsliceの継続か、external保全→native archive→exact local ref削除→main-only照合を実証跡へ結合する。先行P4の実受入・cleanup完了後にだけP5を計画/開始する。historical schema/archiveとcurrent product runtimeの両方を保ち、旧planの将来cutoverによるv1削除をP4へ持ち込まない。

## Plan Self-Review — 2026-10-03

27 target pathsをTask 1の4＋Task 2の23へ一意分割し、30 semantic itemsはledger/source universeへ結合した。Task 1の二familyはdirect module testsで、未作成compiler facadeへの依存がないことを旧sourceで確認。Environment/Plan等のfacade依存familiesはTask 2にまとめた。review focusの五条件はcase familyに対応し、旧planの `BobContractProfile` 型名を実sourceの `BobContractProfileResult` へ修正した。P5/P6/P7、invocation/activation、legacy削除は対象外。
