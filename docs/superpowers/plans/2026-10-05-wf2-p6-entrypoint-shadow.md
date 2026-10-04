# WF2 P6 Entrypoint Shadow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `WF2-P6-ENTRYPOINT`の選択済み26 source itemsを現mainへ再構成し、validation・registration・Bob adapter・操作ハブを一つのcompiler/store gatewayへ接続する。V2は検証・表示だけが可能なshadowに固定する。

**Architecture:** P2 filesystem loader、P4 sole immutable compiler、P5 process-wide storeを再利用する。閉じたslot request、compiled metadata/view、provider epochのgateway交換、pointer invalidationを組み合わせる。V1の実行経路を保持し、V2はcommand・runner・engine・run storeそれぞれの入口でdurable effect前に拒否する。

**Tech Stack:** TypeScript、Node.js 22、CommonJS、node:test、既存P2/P4/P5、VS Code API。新規dependencyなし。

**Spec:** `docs/superpowers/specs/2026-07-17-workflow-contract-v2-design.md` §16–17、`2026-07-24-workflow-contract-v2-generation-directory-amendment.md`、`2026-08-23-feature-selection-and-sequential-main-integration-design.md` §6.3・§7.1・§11、`2026-08-31-wave0a-risk-tiered-approval-and-evidence-design.md`。詳細は `docs/superpowers/plans/2026-07-17-workflow-contract-v2-package-compiler.md` P6と `2026-09-28-v2-migration-remaining-work.md` M2。

**Status:** local implementation in progress in the approved isolated worktree. Tasks 1–5 complete; Task 6 verification complete and local evidence/candidate proposal being finalized. Approved packaging amendment adds package.json, scripts/recompress-vsix.js and test/vsixCompression.test.js; no new dependencies or cap changes.

## Global Constraints

- `ONE_ACTIVE_SLICE` / `ONE_CONTINUOUS_SLICE_WORKSPACE`。sliceは `WF2-P6-ENTRYPOINT`、hard dependenciesは `WF2-P4-COMPILER` / `WF2-P5-PLANSTORE`。P5のVERIFIED証跡を実bytesで確認してから開始する。
- `MAX_SHADOW` / `FAIL_CLOSED` / `NO_SAME_SLOT_LEGACY_FALLBACK` / `existing_v1_commands_preserved`。`maxAuthorizedActivation: shadow`、`productReachability: separate_activation_required`、explicit omissionsは `product_provider_dispatch` / `workspace_activation_switch`。
- 固定shadow policyをworkspace設定・command引数・環境変数・package追加で解除できない。V2 product経路のprovider dispatch、Bob activation/task、lease取得、run directory作成、artifact stagingは0。
- compileはP5の `getOrCompileWorkflowPlan()` → P4のsole compilerだけ。新compiler、provider lookup、別provider registry、独立cache/lease ownerを作らない。
- 同じbranded environment object・slot・generationの全consumerは同じprivate handleを受け取る。provider再登録等でprivate environmentが変われば、public digestが同じでも古いviewを現行handleとして受理しない。
- `getOrCompile`とleaseを区別する。internal runtime-purpose fixtureのacquire/guard契約は検証してよいが、公開product API・commandからP5 acquireへの到達は拒否する。
- V1の同期 `validateTextDocument`、`listWorkflows(): CoreWorkflowDefinition[]`、run persistence schema、Bob登録、公開command IDと表示名 `Bob 操作ハブ` を維持する。V2 metadataが付いた表示用Core viewを実行可能なV1へfallbackさせない。
- compiler/parser/AJV/F3/predicate/provider/Bob/lock internalsはconsumerから直接importしない。旧V1専用importは exact path/import/reason の凍結allowlistで限定し、C7までの移行用とする。
- current slotが不正・欠落・読み取り不能でも、そのslotの `WORKFLOW.md` を代替として実行しない。別slotの正当なV1は継続する。
- compiler literalは `workflow-register-compiler/v2`。plan/digestへclock・host path・live registry・Buffer・dispatch functionを加えない。
- `collectionId`へWindows absolute path、またはP5で拒否される先頭dotの `.bob/workflows` を直接渡さない。P6のprivate slot IDは `collection-` + SHA-256 hex of UTF-8 `path.resolve(collectionRoot).replaceAll("\\", "/")`。P7の公開manifest用repository-relative collectionとは別用途。
- package上限はworkflow-register `1,200,000 bytes`、Bazaar `12,000,000 bytes`、CCR `11,000,000 bytes`。上限を変更しない。P5 Workflow VSIXは1,197,265 bytesで余裕2,735 bytes。
- static program index / selection ledger / source universe / 既存完了record / source archivesは変更しない。新technical記録は `mutationAuthority:false`。将来のP6 CI・merge・cleanup結果を先書きしない。

## Review Focus

1. invalid `current.json`と有効な同slot `WORKFLOW.md`が並存してもfallbackしない。Task 4のmixed discovery / invalid-slot cases。
2. public digestが同じprovider再登録・pointer失効で古い表示が残っても、private handleを使い回さない。Task 3 lifecycleとTask 5 displayed-handle cases。
3. webviewに開始ボタンがなくても直接command、resume、retry、checkpoint、Bob runner、run storeから実行できない。Task 5のroute matrix / effect spies。
4. multi-root・Windowsパス・同名slotでcollection identityが衝突せず、callerのproxy/getterを実行しない。Task 2 input cases / Task 4 multi-root cases。
5. shadow-only workspaceでBob extensionをactivateせず、V1と混在しても既存V1の登録・診断・実行を壊さない。Task 4 registration spies / Task 5 V1 regression。

## Source and Admission Binding

- base/main: `90c678d3d33ae61a5523f2d9cf8057538028dd4b`、tree: `5272f7e8a4966f146a3c15b76f8ae8fe09281979`。
- P5 PR #181。external final attempt: primary `.superpowers/preservation/wf2-p5-90c678d3/cleanup/final-attempt-90c678d3.json`、state VERIFIED。
- P5保全payloadは242 files / 22,062,310 bytes、manifest `efcc00bd77a85dfacd1b2eacba40c84fa6f7c2b53073e8f2167765b4f2fe0948`。native recovery refは `refs/codex/snapshots/be429ee0d33c4143f5848db2caf41cb09641299d` → `4bf207fb6e01644a5f35cafa3b15920af6809543`。
- P6 historical sourceは旧PR #155 owner-stage `45260e0b5a96e50bf01b820b71103b33f2067d8c` → `95d245ce2eba9ac1412038afe96dc509bd6735de`。26 itemsのowner-stage blobを現Git objectsと照合済み。
- 正本は `docs/release-evidence/feature-selection-ledger-2026-08-23.json` と `tools/main-consolidation/feature-selection-source-universe.json`。26 items / 24 target surfacesだけを選択し、Workflow B全carrierをapply/cherry-pickしない。exact items/blob/Task mappingは添付 `2026-10-05-wf2-p6-source-binding.json`。
- 開始直前にremote heads=main一件、open PR=0、primary tracked clean、main SHA/tree、P5保全hash・native archive、提案branch/worktree不存在を再照合する。driftなら実装を開始しない。

## Proposed Local Execution Scope

- repository: `katamor1/bob_builtin_analyze`。新規native worktree: `C:\Users\stell\.codex\worktrees\v2-p6-entrypoint\bob_builtin_analyze`。新規local branch: `codex/v2-p6-entrypoint`。baseは上記exact main。
- 保存先: 新worktreeの `docs/superpowers/plans/2026-10-05-wf2-p6-entrypoint-shadow.md`。本表示文書と同じ内容を保存し、mainでは実装しない。
- 所有範囲: 下記Task 1–6のproduct/test/support/evidence/status filesと本計画。技術記録rootは新worktree内 `.superpowers/sdd/2026-10-05-wf2-p6-entrypoint/`。
- generated roots: 各3 extensionの `out/` / `node_modules/` / default VSIX、本技術rootの `packages/` / `npm-cache/` / `tmp/` / `fixtures/` / 空npm user/global config。既存保全bytesを置換しない。task-owned disposable fixtureだけを掃除する。
- 含む: RED→GREEN、関連回帰、三extension全test/quality/policy/audit/package、全branchの独立review一回、指摘修正、対象fileを明示した通常local commit。実装方式は前sliceと同じinline＋最後のwhole-branch review。
- network: 公開 `registry.npmjs.org` からcredentialなしdependency取得と公開advisory照会（公開dependency名/versionだけ）。credential使用・非公開source送信・外部書込み・課金はなし。
- 含まない: main更新、push、PR、hosted CI dispatch、既存branch/worktree削除・archive、外部保全書込み、VSIX install/publish、V2有効化、P7/Runtime/Contribution bridge/Processing実装。
- 最終product UAT・publication/integration・保全cleanupは、生成済みartifact/hashと対象を提示した後の個別C操作。未実施を成功扱いしない。

---

### Task 1: P5完了観測の取り込みとP6 admission

**Files:** Create `docs/release-evidence/wf2-p5-completion-2026-10-05.json` / `wf2-p6-local-source-mapping-2026-10-05.json`; Modify `tools/main-consolidation/featureIntegrationStatusPolicy.mjs`, `create-feature-integration-status.mjs`, `test/featureIntegrationStatusPolicy.test.mjs`, `docs/release-evidence/feature-integration-status.json`。

**Interfaces:** Consumes preserved P5 final attempt / payload manifest / execution-record manifest / raw CI / review / native recovery metadata. Produces canonical `bob-builtin-analyze/feature-integration-completion-observation/v1` record for boundary/slice `WF2-P5-PLANSTORE`, acceptedMainSha=base M, state VERIFIED, productRuntimeActivation=inactive, mutationAuthority=false; unchanged `validateCompletionObservation()` / `projectIntegrationStatus()` / `deriveNextSlice()`。

- [x] Step 1: 新completion bytesと全externalEvidenceのactual bytes/hashを照合してcanonical recordを構成する。local VSIX hashとhosted package-policy logを区別し、raw旧承認/transcriptは取り込まない。P6 source mappingは26 itemsの既存owner-stage blobをTask 2–5へ一意に割り当てる。
- [x] Step 2: `accepts_verified_p5_completion_and_admits_only_p6` と `rejects_p5_record_evidence_tamper_and_future_p6_promotion` を追加。VERIFIED参照4件のprefixを与え、次のassertionsを固定する。main/hash/CI proof/cleanup/authority fieldを変えたrecordはreject。

```js
const status = projectIntegrationStatus({ programIndex, ledger, completionObservations: [...priorThree, p5] });
assert.equal(deriveNextSlice({ programIndex, statusProjection: status }).sliceId, "WF2-P6-ENTRYPOINT");
assert.equal(status.slices.find(x => x.sliceId === "WF2-P5-PLANSTORE").state, "VERIFIED");
assert.equal(status.slices.find(x => x.sliceId === "WF2-P6-ENTRYPOINT").state, "planned");
assert.equal(status.slices.find(x => x.sliceId === "WF2-P7-MANIFEST").state, "planned");
assert.equal(status.boundaries.find(x => x.id === "WORKFLOW-B-GATE-P").state, "planned");
assert.ok(status.capabilities.every(x => x.observedActivationStatus === "inactive"));
```
- [x] Step 3: `node --test tools/main-consolidation/test/featureIntegrationStatusPolicy.test.mjs` → 新recordがunregisteredとしてRED。純粋なpolicy validationは実操作の許可を発行しない。
- [x] Step 4: COMPLETION_REGISTRYへ新record digest / actual evidence-registry digest / referenceだけをadditive登録し、generatorのread listへP5 recordを追加。`--print`のcanonical bytesからstatusを生成する。
- [x] Step 5: 同testと `node tools/main-consolidation/create-feature-integration-status.mjs --check` → GREEN。static ledger/program/source universeがbaseとbyte-identicalであることを確認。
- [x] Step 6: 明示stageし `docs: import verified P5 completion for P6 admission` でlocal commit。

### Task 2: 閉じたslot requestと共通compiler/store gateway

**Files:** Create `src/workflowContractV2Entrypoint.ts`, `src/workflowContractV2Product.ts`, `test/workflowContractV2Entrypoints.test.js`, `test/workflowContractV2EntrypointTestSupport.js` （以上 `extensions/workflow-register/` 相対）。

**Interfaces:** `WorkflowContractV2Slot={readonly collectionId:string; readonly collectionRoot:string; readonly workflowId:string}`。consumerは validation / workspace-registration / run-creation / bob-adapter / operation-hub / command-validation / resume のclosed union。`createWorkflowContractV2Entrypoint(input)` は branded environment、P2 loadCurrent/loadGeneration、P5 getOrCompile/acquire/invalidate callbackを受け、`compileCurrent({slot,consumer})`, `compileGeneration({slot,consumer,generation,expectedPackageDigest?})`, `acquireCurrent({slot,consumer})`, `invalidateSlot(slot)` を返す。compile resultは `ok:true,handle,rawPackage,diagnostics:[]` または `ok:false,diagnostics:readonly WorkflowContractV2Diagnostic[]`。acquire successはhandleの代わりにopaque lease。Product helperは一つのowned ActionRegistryとP5 facadeをcomposeする。

- [x] Step 1: foundationの `createLockedRawPackage`, `MemoryPackageFileSystem`, `installPublished` と限定Module._load stubからtest supportを作る。他の `.test.js` をrequireせず、load後/finallyでstubを復元する。input/type testsを追加する。
- [x] Step 2: 新module未実装のREDを確認した後、`all consumers share exact handle and sorted failure diagnostics`、`explicit generation ignores current pointer`、`closed inputs reject getters/proxies without behavior`、`captured RegExp survives replacement`、`nonruntime acquisition fails before lease` をbehaviorでREDにする。

```js
const first = await entrypoint.compileCurrent({ slot, consumer: "validation" });
for (const consumer of ["workspace-registration", "run-creation", "bob-adapter", "operation-hub", "command-validation", "resume"]) {
  const result = await entrypoint.compileCurrent({ slot, consumer });
  assert.equal(result.ok, true);
  assert.strictEqual(result.handle, first.handle);
  assert.equal(result.handle.planDigest, first.handle.planDigest);
}
assert.equal(counters.compile, 1);
assert.equal(counters.acquire, 0);
assert.equal(counters.dispatch, 0);
```
- [x] Step 3: requestを同期detached snapshot化し、P2 load→P5 facadeの順に一回ずつ委譲する。failed compileはstale successへfallbackせずF2 diagnostic contractを保持する。internal acquireはP5 private-purpose/publication/lease guardを維持する。
- [x] Step 4: Product helperはservice-owned runtime environmentを全shadow consumersで共有するが、product側のacquire callbackは固定shadow拒否としP5 acquireへ渡さない。purpose/activationをworkspace/commandへ公開しない。P2 loader adapterだけがpackage internalsをimportし、compiler内部を呼ばない。
- [x] Step 5: `npm run compile`、`node --test test/workflowContractV2Entrypoints.test.js test/workflowContractV2PlanStoreRuntimeWiring.test.js` → GREEN。`npm run package` / `npm run package:policy` を早期実行し容量を記録。上限超過ならowned P6 codeを簡素化して解消し、未解消のまま次gateを成功扱いしない。
- [x] Step 6: 上記4 filesをstageし `feat(workflow): add shared contract V2 entrypoint gateway` でlocal commit。

### Task 3: provider epoch交換とFIFO catalog reload

**Files:** Create `src/workflowContractV2ProviderLifecycle.ts`, `src/workflowCatalogReloadCoordinator.ts`, `test/workflowContractV2ProviderLifecycle.test.js`, `test/workflowCatalogReloadCoordinator.test.js`; Modify `src/core/actionRegistry.ts`, `src/workflowRegisterService.ts`。

**Interfaces:** `WorkflowContractV2ProviderLifecycle({actionRegistry,createEntrypoint,onChanged?})` → `current():WorkflowContractV2Entrypoint`, `register(input:WorkflowProviderRegistrationInput):WorkflowProviderRegistration`, `dispose():void`。`WorkflowCatalogReloadCoordinator.run<T>(operation:()=>Promise<T>|T):Promise<T>` / `dispose():void`。ActionRegistryの既存owned provider registryを再利用し、必要なregistration typesだけを再exportする。

- [x] Step 1: `provider registration/disposal rotates gateway exactly once`, `failed rotation rolls back new registration`, `dispose is idempotent and closes new work`, `registry accessor is not invoked`, `FIFO reload survives prior failure` をcounter/explicit deferred promisesで追加。provider dispatch0もassert。

```js
const before = lifecycle.current();
const registration = lifecycle.register(providerInput);
const after = lifecycle.current();
assert.notStrictEqual(after, before);
assert.equal(counters.gatewayBuild, 2);
registration.dispose();
registration.dispose();
assert.equal(counters.registrationDispose, 1);
assert.equal(counters.gatewayBuild, 3);
assert.equal(counters.dispatch, 0);
```
- [x] Step 2: compileして両新testを実行 → RED。既存provider registryのowner/version/stale-disposable primitiveを再実装するテストは作らない。
- [x] Step 3: registration→branded catalog snapshot→新environment/gatewayの交換を成功時だけ公開する。失敗時は新registrationをdisposeし旧gatewayを保持。reloadをFIFOにし、disposal後の新規workは拒否して現在ownerはsettleさせる。
- [x] Step 4: `node --test test/workflowContractV2ProviderLifecycle.test.js test/workflowCatalogReloadCoordinator.test.js test/workflowContractV2ProviderRegistry.test.js` → GREEN。product epoch wrapperと後続REG-BRIDGEの実装責務を混同しない。
- [x] Step 5: 明示stageし `feat(workflow): rotate compiler gateway with provider epochs` でlocal commit。

### Task 4: V2 slot発見・compiled view・検証・shadow登録

**Files:** Create `src/workflowContractV2View.ts`, `src/workflowBobTaskBinding.ts`, `test/fixtures/workflow-contract-v2/transitional-legacy-import-allowlist.json`; Modify `src/workflowDiscovery.ts`, `src/workflowDefinitionLoader.ts`, `src/workflowRegistrationService.ts`, `src/commands/validateWorkflow.ts`, `src/extension.ts`, `src/extensionWithAuthoring.ts`, `src/workflowRegisterService.ts`, `test/workflowContractV2Entrypoints.test.js`, `test/architectureContracts.test.js`, `test/workflowCompilerParity.test.js`。

**Interfaces:** discovery resultへ `packages:WorkflowPackageSlotCandidate[]` をadditive追加。candidateはroot/currentPointer/relativePath/folderName/collectionId/collectionRoot/workflowIdを保持。`loadWorkspaceWorkflows(sourceId,contractV2?)` はV2を共通gateway経由で読み込む。`adaptCompiledWorkflowForProduct({handle,rawPackage,slot,root,currentPointer})` はreadonly compiled metadata/viewだけを作り、private bindingを保持する。metadata literalは `workflow-contract-v2-view/v1`、binding literalは `workflow-contract-v2-binding/v1`。F7 `AUDITED_BOB_PROFILE_DIGEST` / `LEGACY_BOB_TASK_BINDING` は既存profile authorityを再利用する。

- [x] Step 1: `mixed discovery reserves invalid V2 slot without V1 fallback`, `multi-root same-name slots remain distinct`, `valid shadow registration has no Bob activation/registration/runner`, `invalid generation diagnostic parity across validation/registration/Bob adapter/hub`, `V1 sync validation and registration remain compatible` を追加する。shadow-only workspaceではBob getExtension/activate/registerSource/registerWorkflow/task/deactivateとrunnerのcounterを0にする。

```js
assert.equal(discovered.packages.length, 2);
assert.notEqual(discovered.packages[0].collectionId, discovered.packages[1].collectionId);
assert.ok(discovered.packages.every(x => /^[A-Za-z0-9][A-Za-z0-9._/-]*[A-Za-z0-9]$/.test(x.collectionId)));
assert.equal(loaded.workflows.filter(x => x.core.workflowFolderName === invalidV2Slot).length, 0);
for (const name of ["bobGetExtension", "bobActivate", "registerSource", "registerWorkflow", "bobTask", "bobDeactivate", "runner", "acquire", "dispatch"]) {
  assert.equal(shadowOnlyCounters[name], 0);
}
```
- [x] Step 2: focused入口・parity testsを実行 → RED。discoveryだけのmock一致ではなく実P2 locked generation fixtureと現consumer callbackを使う。
- [x] Step 3: `.bob/workflows/*/current.json`をV1 filesとは別候補として発見し、全V2 slotを先にreserveする。load failureやcallback欠落でも同slot legacyをskipしてdiagnosticを出す。V1は別slotで従来処理を継続する。
- [x] Step 4: viewをcompiled planから構成し、V2 raw YAMLを再parseしない。`contractV2` metadataを除去/偽造してlegacyへ落とせないprivate bindingを保持する。V2 shadow viewはBob executable registrationへ渡さず、V1 sourceの登録/破棄はV1の変更時だけ行う。
- [x] Step 5: core APIにselected compileCurrent/compileGeneration/invalidate/registerProvider methodsと固定shadowで拒否するacquireCurrent methodをadditiveに委譲する。authoring compositionはそのgatewayをcommandへ渡す。`validateTextDocument`はV1同期契約を維持し、current/workspace V2検証はasync callbackを使う。formatはpresentation境界だけ。
- [x] Step 6: transitional allowlistをexact path/import/reasonで凍結し、architecture testは未登録import・広げたentry・new compiler private importを拒否する。Product adapterのP2 filesystem loader importsだけはその責務で限定する。
- [x] Step 7: `npm run compile` と `node --test test/workflowContractV2Entrypoints.test.js test/architectureContracts.test.js test/workflowCompilerParity.test.js test/registrationWiring.test.js test/workflowSchemaVersionNegotiation.test.js` → GREEN。
- [x] Step 8: 明示stageし `feat(workflow): discover and validate contract V2 shadow slots` でlocal commit。

### Task 5: 全product実行入口と操作ハブのshadow境界

**Files:** Create `src/workflowContractV2ExecutionGuard.ts`, `src/workflowContractV2RunStateStore.ts`, `test/workflowContractV2ExecutionGuard.test.js`, `test/workflowContractV2ExecutionBoundary.test.js`; Modify `src/workflowRuntimeFactory.ts`, `src/workflowRegisterService.ts`, `src/bobWorkflowFactory.ts`, `src/gui/operationHubProvider.ts`, `src/gui/operationHubModel.ts`, `test/operationHubProviderBehavior.test.js`。

**Interfaces:** `WorkflowContractV2BoundaryError` retains readonly diagnostics。`verifyWorkflowContractV2CurrentPlan({workflow,compileCurrent}):Promise<CompiledWorkflowPlanHandle|undefined>` はV1にundefined、V2にはprivate bound handle＋current generationの一致だけを受理。`acquireWorkflowContractV2RunLease({workflow,acquireCurrent}):Promise<WorkflowPlanLease|undefined>` はinternal fixture用exact binding guardで、drift時release。`ContractV2GuardedRunStateStore` はFileRunStateStoreのcreateRun前にguard。factoryのbefore-run hookは run/resume/resumeGuarded/retry/checkpoint/Bob input collectionで共通の固定shadow拒否を実行する。

- [x] Step 1: route matrixを追加。valid V2、invalid V2、表示後pointer変更、同public digest/provider epoch変更に対し、command run/runStep/startFromArtifacts、engine run/resume/retry/checkpoint、Bob runner、direct runStore createのeffect spiesと`.bob/workflows/runs`不在をassert。各V2 product caseでacquire/provider/Bob/run/artifact countersは0。V1 caseは従来結果を保持する。

```js
await assert.rejects(route.invoke(v2View), WorkflowContractV2BoundaryError);
for (const name of ["inputsPrompt", "acquire", "providerDispatch", "bobActivation", "bobTask", "runCreate", "artifactStage", "recovery", "runtimeCommandDispatch"]) {
  assert.equal(effectCounters[name], 0);
}
assert.equal(existsSync(join(workspaceRoot, ".bob/workflows/runs")), false);
assert.ok(!shadowCatalogRow.actions.some(x => /run|start|resume|retry|checkpoint/.test(x.id)));
```
- [x] Step 2: `node --test test/workflowContractV2ExecutionGuard.test.js test/workflowContractV2ExecutionBoundary.test.js test/operationHubProviderBehavior.test.js` → RED。internal acquire testはisolated runtime fixtureに限定し、product spy結果と分ける。
- [x] Step 3: viewとcurrent compiler resultのprivate handle identity、generation/package/environment evidenceを照合する。古いviewや未認証metadataはfail closed。通常V2もfixed shadowとして、input prompt・lease・recovery・run作成・command dispatch前に拒否する。before-run hook省略でもfactory-owned V2 guardは有効。
- [x] Step 4: guarded run storeを第二境界としてcomposeする。service APIのacquireCurrentはruntimeを有効化せず拒否する。internal lease helperはexact current/publication/private bindingを検査し、drift/error leaseを必ずreleaseする。
- [x] Step 5: 操作ハブはshadow rowに「検証のみ・実行不可」を表示し、開始/step/resume/retry等のactionを付けない。既存V1 row/公開list型は維持する。偽造webview messageや直接commandもserver guardで拒否する。操作ハブで選んだworkflowはcurrent planを再検証してからshadow拒否し、stale viewを実行しない。
- [x] Step 6: 上記新testsに `test/runtimeWiring.test.js test/bobWorkflowFactory.test.js test/operationHub.test.js test/workflowContractV2PlanStoreRuntimeWiring.test.js` を加えてGREEN。必要なbehavior support以外のV1実装は変更しない。
- [x] Step 7: 明示stageし `feat(workflow): enforce contract V2 shadow at product boundaries` でlocal commit。

### Task 6: 全体検証・artifact・whole-branch review

**Files:** 本計画、new `docs/release-evidence/wf2-p6-local-implementation-2026-10-05.{json,md}`。技術logs/packagesは限定technical rootへ保存。

**Interfaces:** previous tasksのhead/tree/source mapping、test results、三VSIX hash/size/entry count、independent review。出力はlocal実装の観測だけであり、P6 VERIFIED・Gate P・UAT完了を先取りしない。

- [x] Step 1: source mapping26 itemsを実装/testへ再照合し、exact owned diffとstatic artifact不変、V1 public API/persistence互換、V2 public route到達行列を確認する。
- [x] Step 2: Workflowは `npm run compile` 後に `node --test --test-concurrency=2 test/*.test.js` で全件実行し全counts/logを保持。新規P6 focused、既存P1–P5、architecture/registration/Hub/Bob regressionsが0 failure。先行失敗を削除しない。
- [x] Step 3: 他2 extensionは順に `npm ci` / `npm test`。3 extensionで `npm run architecture:policy`, `npm run source:policy`, `npm run dependency:policy`, `npm run audit:prod`, `npm run package`, `npm run package:policy`。Bazaarは `npm run artifact:policy` / `npm run unused:policy` も実行。rootのprogram policyは `node --test tools/main-consolidation/test/*.test.mjs`。root UI gateは次の現行CIと同じ10filesを実行する。rootにはpackage.jsonがないためroot npm commandを使わない。各実commandとexit/countを記録する。

```text
node --test scripts/three-extension-command-surface.test.js scripts/three-extension-documentation-contract.test.js scripts/bazaar-review-documentation-parity.test.js scripts/code-consistency-documentation-parity.test.js scripts/workflow-register-documentation-parity.test.js scripts/extension-host-smoke-contract.test.js scripts/three-extension-ui-contract-workflow.test.js scripts/ci-baseline-summary.test.js scripts/verify-ci-head.test.js scripts/exact-head-ci-contract.test.js
```
- [x] Step 4: VSIX3件をtechnical packagesへcopy/hashし、Workflow上限1,200,000 bytesを含め全package policyを照合。超過を上限変更やruntime files除外で隠さない。同じ所有範囲の簡素化で解消しない場合はpublicationを止め、具体的な追加変更案を提示する。
- [x] Step 5: actual whole-branch diffをfresh-context reviewerへ一度渡す。Critical/ImportantはRED→fix→GREEN＋関連full suiteの一回の修正pass。Minorはdeferredとして台帳へ記録。headが変われば旧review/CIを使わない。
- [x] Step 6: local観測のjson/mdと本計画を更新してcommit。stateはLOCAL。同hash VSIXで変更surfaceのproduct UATは必要なC範囲を提示し、未実施をpendingに保つ。
- [ ] Step 7: candidate publication案をcanonical repository/branch/base/head/tree/変更件数/容量/rollbackとともに準備する。push/PR/4workflow dispatch、exact merge/4main CI、外部保全/lease deletion/native archiveは各別C確認後だけ。P6がVERIFIEDになるまでP7を開始しない。

## Self-Review and Handoff

- 機械source bindingは26 unique items / 24 selected target surfaces。supplemental changeは現mainのactual Hub model/provider、architecture/parity/Hub tests、test support、P5 completion/status publication、local evidenceと本計画に限定。
- Review Focus 5件をTask 2–5へ割り当てた。consumer union / slot / compile result / P5 facade / lifecycle / guardsの綴りと型を統一した。
- July17 planのlegacy run/Bob登録をそのまま移植せず、Aug23 MAX_SHADOWを優先する。P5 collection ID規則・private environment identity・invalidated-handle contractを維持する。
- P7 manifest、R1 provenance、R2 invocation、conditional R3–R5、rejected R6、Contribution bridge、Processing、最終three-extension UATは後続責務。V2移行全体の完了とは宣言しない。
- 実装前に本計画と上記限定local範囲を確認する。repository外の一時表示文書を新worktreeへ保存するため、保存のためだけの別承認は追加しない。

## Approved packaging amendment

User approved the three-file level-9 VSIX recompression amendment on 2026-10-05. Scope: extensions/workflow-register/package.json, scripts/recompress-vsix.js, test/vsixCompression.test.js. Original proposal SHA256: e6ae4cc8163faee42fcf9d6a29669d47188259c3e5f45de32c4c7efd75414eb9. No dependency additions, runtime exclusions or budget increases.

## Verification adjustments

The full suite exposed two old structural test files that still assumed the binding constant lived in the loader, an unguarded FileRunStateStore constructor, and the original package command. workflowContractV2BobLoaderBindingCases.js and workflowRegister.test.js now validate the moved binding, guarded store and approved package script. Behavioral V1 registration, task capability and persistence tests remain required.

Child test processes use a task-marked .superpowers/t6 temporary root inside this worktree. Deep Windows bundle paths failed creation and verification; the short-path probe passes. core.longpaths is scoped to child Git environments. Full suites are executed sequentially after the initial timing failures; no test timeout is increased. The temporary root is retained for the separately authorized preservation/cleanup stage.

## Final review fix scope and verification

The one fresh-context review at 6b6efe31 found four Important issues. The one TDD fix pass at f8ff1ccf closes file-exclusion/wrong-type/incomplete-slot reservation, malformed-slot isolation, partial V1 registration retry, and persisted-run mutation/recovery before engine entry. workflowRunCommands.ts is added to the guard scope; internal workflowById plumbing retains the fixed shadow decision and does not expose an activation switch. Structural sourceLayoutPolicy.test.js and the existing guarded-store constructor test are maintained. One exact /.t/ ignore rule supports an exclusively marked short Windows TMP. All previous technical roots and failed attempts remain retained.

Workflow full result: 2034 pass / 1 skip / 0 fail. Final Workflow VSIX: 1,197,704 bytes / 897 entries, unchanged 1,200,000-byte cap. Three VSIX artifacts have independent decoder CRC/length/content hash manifests. Program full attempt03: 854 pass / 0 fail. Local-only completion evidence records all required gates, failed attempts, source/package/log hashes and the single review fix pass. Hosted CI, installed UAT, merge, preservation/cleanup and P6 VERIFIED remain pending.
