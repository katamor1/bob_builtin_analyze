# REG-BRIDGE-OWNER-VERSION-LIFECYCLE Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 主スレッドで実装し、最後に一度の独立whole-branch reviewを行う。計画レビュー前に製品実装を開始しない。

**Goal:** ordinal9のowner/version/lifecycleを、既存Contract V2 registryを唯一のbackendとする3拡張のatomic registrationとして実装・検証・逐次統合する。

**Architecture:** ActionRegistryが所有する一つのWorkflowProviderRegistryにV1互換登録とatomic contributionのlive stateを集約する。manifest/handlerのpure preparation、installed metadataを照合するAPI facade、同backendを読むruntime viewsを分離する。V1 handlerをV2 contractへmirrorせず、既存compiler/catalog/lease authorityを維持する。

**Tech Stack:** TypeScript、Node.js 22、node:test、既存semver/Ajv、VS Code/IBM Bob extension host、既存VSIX packager、GitHub Actions。

**Spec:** [承認済み詳細設計](../specs/2026-10-18-reg-bridge-owner-version-lifecycle-design.md)。2026-10-19の直接回答「承認して実装計画へ進む」により、commit 78710d85ff6ce11e3743b207a1befb6b0533d929のspec bytes（SHA256 8631ab6bfd144882a850688adc670e0c54a68ca8cf2edc0c3af1ad610b48918d）が承認済み。元の機能選別仕様§7.2、Contract V2 §12、残件計画M3も適用する。

## Global Constraints

- base main: 88de3a67aedf5c8d1b3ee2ea3226a973703ebaf0。作業branch: codex/v2-registry-lifecycle、既存隔離worktreeを使用する。
- 正式進捗は8/20。今回のsource/main受入までordinal9をVERIFIEDにしない。ordinal10のdiscovery/evidence、Processing、R3以降は対象外。
- runtimeActivation=false。V2製品のlease取得、provider/Bob dispatch、run directory作成、artifact stagingはすべて0。
- ActionRegistryごとのWorkflowProviderRegistryは一つ。新しいContributionRegistry class、process-global provider registry、manual V2 catalog、compiler、plan cacheを作らない。
- V2の既存id/SemVer/dispatch ABIとV1のcontribution id/contract_version/handler ABIを相互変換しない。legacy fallbackでV2失敗を成功にしない。
- 既存V1 command、公開APIのsignature/return、保存schema/既存定義bytes、standalone default動作を維持する。今回custom result sink用の保存schema variantを追加しない。
- workflow-register VSIX上限1,200,000 bytes、version0.1.0、engine^1.106.1、既存33圧縮対象と3拡張の依存/lockを維持する。R2最終実測1,199,470 bytesの530 bytesは今回候補の余裕の保証ではない。
- R2のCI免除を継承しない。source候補/main、metadata候補/mainの実結果を記録する。failure/not_runをsuccessへ置換しない。
- 保護3項目を読まない・走査しない。保護8項目のGit statusを保持する。旧証跡、失敗、branch、worktree、profileは削除しない。force/admin/settings/billing/credentials操作は禁止。
- spec/plan承認はCI成功、公開済み候補、Program完了の証拠ではない。実装の実行方法は承認済みspec§7の主スレッド実装を維持する。

## Review Focus

1. registryを分割した結果、別authority、mutable mirror、handler保持cacheが生まれる → Task2のinstance isolation/owner graphとTask5のsource ownership検査。
2. 偽owner/version、installed root不一致、host交代時の旧disposerが新登録を壊す → Task1/2のprovenance matrixとTask4のhost restart/late completion。
3. getter/Proxy/Map変更、reentrant mutation、後半失敗が途中stateを公開する → Task1/2のbehavior counter、late failure、pending disposable試験。
4. 古いruntime/file transaction/agentが解除後のhandlerを使う → Task3のlive view、generation/run binding、sink version試験。
5. 互換API/built-ins移設からV2実行へ到達する → Task3/5の実動五項目0とreachability policyのnegative fixtures。

## 固定する型・責務

パスは特記がなければextensions/workflow-register/基準。以下の型は新しいbarrelへ集約せず、必要なmoduleからnamed/type-only importする。

| 所有file | 契約 |
| --- | --- |
| src/core/contributionManifest.ts | ContributionOwner={id,version}; ContributionRegistryApiRange={min,max}; InstalledContributionOwner={id,version,extensionRoot}; ProviderProvenanceContextも同3 key。WorkflowContributionManifestはschema_version、owner、registry_api、action_providers、preflight_checks、result_sinks、optional agent_provider、workflow_templates、schemasのclosed object。validateContributionManifest(value:unknown, installed:InstalledContributionOwner): Readonly<WorkflowContributionManifest>はdetached/frozen値を返し、不正時は固定codeのContributionRegistrationErrorをthrowする。parseContributionRegistryRange(value:unknown):Readonly<{min:bigint,max:bigint}>をvalidatorとAPI交渉で共用する。 |
| src/core/contributionRegistration.ts | PreflightCheckHandler=WorkflowPreflightChecks[string]、SinkHandler=(sink:ResultSinkDefinition,input:ResultSinkWriteInput)=>Promise<ResultSinkWriteResult>。ContributionHandlerSet={actionProviders:Map<string,ActionProvider>,preflightChecks:Map<string,PreflightCheckHandler>,resultSinks:Map<string,SinkHandler>,agentProvider?:AgentProvider}。prepareContributionSet(manifest,installed,handlers):PreparedContributionSet。PreparedContributionSetのruntime brandと検証済みsnapshotは同moduleが保護する。pure preparationとgeneration構築だけを行い、live stateを保持しない。 |
| src/core/contractV2/providerRegistry.ts | 既存register/snapshot/bind/dispatch boundaryを維持。registerContributionSet(prepared:PreparedContributionSet):ContributionRegistration、snapshotContributions():ContributionRegistrySnapshot、contributionRuntimeResolver():ContributionRuntimeResolver、既存V1用registerLegacyAction/listLegacyActions/execute用lookup、setLegacyAgent/registerLegacyResultSink、disposeLegacyCompatibilityを追加。新旧V1 handlerのlive stateはここだけが所有する。 |
| src/core/actionRegistry.ts | 既存public register/list/executeとV2 register/snapshotを維持し、既存legacy action Mapをowned backendへ移す。registerContributionSet(manifest,installed,handlers)、snapshotContributions()、contributionRuntimeResolver()は同backendへのdelegation。V2とV1のlookupを混ぜない。 |
| src/api/providerRegistryApi.ts | PROVIDER_REGISTRY_API_VERSION='provider-registry/v1'; negotiateProviderRegistry(range):同literal。ProviderRegistryHost({actionRegistry,resolveInstalledExtension})は所有backendを作らない。api={apiVersion,negotiateProviderRegistry,registerContributionSet(manifest,provenance,handlers)}、snapshot()、trackedRegistrationCount()、dispose()を提供する。 |
| src/core/runtime/resultSinkRegistry.ts | Task1のSinkHandlerをtype re-exportし、既存FileTransactionHandlerをtype export。ContributionSinkRequest={type:string,contractVersion:string,payload:unknown}とwriteContribution(request,input)は内部boundary。既存write(sink,input)/register/registerFileTransactionは互換維持。ResultSinkFileTransactionBindingはopaque owner generation、handler identity、scope={workspaceRoot,runId}を照合する。 |

ContributionRuntimeResolverはgetActionProvider(id)、listActionProviderIds()、getPreflightCheck(id)、getResultSinkBinding(type)、getAgentProvider()を持つ。getResultSinkBindingはfrozen {handler,contractVersion,ownerToken}またはundefinedを返し、ownerTokenはpublic evidenceへserializeしない。ContributionRegistrySnapshotは6 kind別のreadonly metadata配列とownedSetCountを持ち、handler/token/host pathを含めない。V2 catalogは既存の形を変えない。

互換agent/sinkは同backendのgetLegacyAgent():AgentProvider|undefined、getLegacyResultSink(type):SinkHandler|undefinedから読む。製品runtimeではexplicit agent引数、legacy互換agent、atomic agent、明示agentCommandの順とする。legacy sinkの最終登録優先とstandalone ResultSinkRegistry.register/writeの既存動作は維持する。writeContributionはatomic宣言だけを参照し、legacy登録をversion付きatomic契約として扱わない。legacy actionとatomic actionの同id競合は双方の登録時に拒否する。atomic agent登録時の既存legacy agentはconflict、既存legacy setAgentは従来どおり明示overrideとして扱う。

Handler input型は既存ActionExecutionInput、WorkflowPreflightCheckInput、ResultSinkWriteInput、AgentExecutionInputをtype-onlyで参照する。backendからservice、runtimeFactory、vscodeへのvalue importを作らない。

追加interfaceの名前を省略しない。WorkflowPreflightCheckResolver={getPreflightCheck(id):PreflightCheckHandler|undefined}、ContributionRegistration={dispose():void}。registerLegacyAction(provider)は既存ActionProviderRegistrationを返す。listLegacyActions():string[]、getLegacyAction(id):ActionProvider|undefined、setLegacyAgent(provider):void、registerLegacyResultSink(type,handler):void、disposeLegacyCompatibility():voidをbackendの互換契約とする。runtime viewはhandler値をcacheせず、同backendのmethodを毎回呼ぶ。

新境界のerror.codeはcontribution.manifest.invalid、contribution.provenance.invalid、contribution.handlers.invalid、contribution.registry.duplicate_owner/duplicate_identifier/agent_conflict/reentrant_mutation/commit_failed、provider.registry.range_malformed/version_incompatible/host_disposed。messageは固定文字列とし、入力getter/例外内容を補間しない。既存F6/legacy errorの互換surfaceは変えない。

## 検証・証跡の共通手順

実行承認後、plan専用のignored workspaceとprogress.mdを作り、第一行にこのplanの絶対pathを置く。承認回答、base/head/tree、対象46 source itemの対応表、各RED/GREENのcommand/exit/TAP件数、変更path、判断を記録する。過去R2 workspaceは参照元としてのみ扱い、新しいログを書き込まない。

setupは各extensionで既存lockのnpm.cmd ci、compile。cache流用をしても別treeの成功を今回の全回帰と呼ばない。全試験はNode22、長いログはworkspaceへ保存し、exit/件数/skip理由を読む。以下のtaskコマンドは各extension directoryをcwdにする。PowerShellでglob展開に依存せず、全回帰は各既存npm.cmd testを使う。

各taskの最後にgit diff --check、対象pathだけstage/commitし、commit範囲と検証をledgerへ追記する。失敗を消して再実行の成功だけ残さない。Task5以外にtaskごとのreviewerを起動しない。

---

### Task 1: installed manifestとpure registration preparationを固定する

**Files:** Create src/core/contributionManifest.ts、src/core/contributionRegistration.ts、schema/workflow-contributions.v1.schema.json、3拡張のcontracts/workflow-contributions.json、test/contributionManifest.test.js、test/contributionRegistration.test.js。ここでは製品入口へ接続しない。

**Interfaces:** 上記validateContributionManifestとprepareContributionSetを作る。action/preflight/agent宣言は{id,contract_version}、sinkは{type,contract_version}、template/schemaは{id,path}。workflow claims/reportや手動schema catalogを加えない。owner/versionはそれぞれの現package値（local.workflow-register@0.1.0、local.bob-bazaar-review@0.3.0、local.bob-code-consistency-review@0.1.0）。handler id集合は既存製品の2/11/16 actionsをそのまま採り、companion actionのcontract_versionは既存idに/v1を付ける。built-in actionはworkflow-register.run-mechanical-checks/v1とworkflow-register.vscode-execute-command/v1、preflightはworkflow-register.workspace-open/v1、workflow-register.bob-workspace-initialized/v1、workflow-register.bazaar-repository/v1、sinkはTask3の2値とする。

- [ ] **Step 1 — REDを書く:** 上記2 test filesに、installed id/version/rootの各不一致、owner省略/余分key、非canonical strict SemVer、重複owner用fixture、6 kind間のid衝突、schema pathとidの区別、late missing/extra handler、callable Proxy/record getter/Map subclass/入力変更を追加する。test名'descriptor-only preparation never invokes hostile input'でassert.deepEqual(counters,{getter:0,proxy:0,handler:0})、成功fixtureではassert.notEqual(result,input)とassert.equal(Object.isFrozen(result),true)。境界はUTF-8文字列4,096 bytes、全snapshot文字列合計4,194,304 bytes、manifest深さ32、node50,000、配列/handler数20,000。contribution idはF4形式1–128文字、owner idはhost resolverのpublisher.nameにexact一致かつ255 UTF-8 bytes以下、contract_versionはF4形式のprefix+/v+正整数で256文字以下とする。
- [ ] **Step 2 — REDを観測:** npm.cmd run compileの後、node --test test/contributionManifest.test.js test/contributionRegistration.test.js。Expected: 新しい契約が未実装で失敗し、失敗名と理由を保存。まだ同じ要件が既存実装で満たされるなら重複実装をせずfixture/対象を修正して再現する。
- [ ] **Step 3 — 最小実装:** source/manifest/schemaを追加。既存F6のcanonical strict SemVer再構築方式を再利用する。own-data descriptorとcaptured Map intrinsicsでsnapshotし、Proxy/アクセサーを実行しない。準備済み値のbrandを検証せずbackendへ渡せない形にする。
- [ ] **Step 4 — GREEN:** 同じ2 filesと既存workflowContractV2ProviderRegistry.test.jsを実行。Expected: 新規全件成功、skip追加0、旧F6全成功。3 manifestsのdeclared actionsと現製品provider id集合の一致をfixtureで確認する。
- [ ] **Step 5 — Commit:** 新規fileだけをcommitし、spec§4/§8と46 source itemsの対応表を更新する。Expected: 契約/prepareのみ、製品runtimeは未接続。

### Task 2: 一つのowned backendとactivation facadeでatomic registrationを実装する

**Files:** Modify src/core/{actionRegistry.ts,contractV2/providerRegistry.ts}; Create src/api/providerRegistryApi.ts、test/providerRegistryApi.test.js、test/contributionRegistry.test.js、test/providerRegistryOwnership.test.js、test/fixtures/provider-registry-api/{consumer.ts,tsconfig.json}。

**Interfaces:** Task1のprepared valueを消費し、ActionRegistry経由のContributionRegistration={dispose():void}、固定snapshot、同ownerのruntime resolverを返す。ProviderRegistryHostのresolveInstalledExtension(id)はInstalledContributionOwner|undefinedを返すtrusted dependency。hostはcaller contextとhost-resolved metadataを比較してからbackendへ渡す。

constructorのtrusted test seamsはbeforeContributionCommit(pending:{registration,snapshot})とbeforeContributionRemove(snapshot)だけ。ActionRegistryの省略可能optionsから既存owned backendへ渡す。製品API/inputからhookを設定させない。hookのthrowはpublication前で、reentrant mutationは共有guardにより拒否される。未解除registrationのdisposed flagは削除成功後だけ確定する。

- [ ] **Step 1 — REDを書く:** 同ownerの同/別version、別ownerの後半id衝突、legacy actionとの衝突、late invalid handler、before-publication throwで全snapshot/handler identity/登録数が不変。test名'late collision publishes no partial generation'でassert.deepEqual(host.snapshot(),before)、assert.equal(currentHandler,previousHandler)。pending disposableとmutation中の再登録・解除は固定error。old dispose→new register→old disposeで新登録が残る。手動disposeでassert.equal(host.trackedRegistrationCount(),0)。1000 register/disposeでstate/trackingが0に戻る。別ActionRegistry間は完全分離。V1 setの変更前後でV2 catalog bytesが一致することをassertする。
- [ ] **Step 2 — negotiation/provenance REDを観測:** range missing/extra/accessor/Proxy、v0/v01、suffix、64/65文字、巨大整数、逆転、非互換rangeを試す。成功は最高supported v1だけ。偽installed root、未installed owner、getter付きresolver結果ではhandler read/commit=0。Run: node --test test/providerRegistryApi.test.js test/contributionRegistry.test.js test/providerRegistryOwnership.test.js。Expected: 目的の未実装契約で失敗。
- [ ] **Step 3 — backend/facadeを実装:** mutable legacy action mapを既存owned registryへ移し、agent/sink互換slotも同ownerへ集約する。register/atomic登録/解除/互換書込みに共有mutation guardを使う。検証済みnext generationを一度だけpublishする。既存V2 exact-version/token/snapshotは維持。facadeは手動解除後だけtrackingを削除し、shutdown時は逆順で全解除を試み、失敗分を追跡したままAggregateErrorにまとめる。
- [ ] **Step 4 — GREENとAPI型確認:** 前記3 files、Task1の2 files、既存workflowContractV2ProviderRegistry.test.jsとworkflowContractV2ProviderLifecycle.test.jsを実行。Run: node node_modules/typescript/bin/tsc --noEmit -p test/fixtures/provider-registry-api/tsconfig.json。Expected: 全成功、consumerは既存API+新atomic APIを型検査でき、public APIに新backend constructorを露出しない。
- [ ] **Step 5 — 早期容量ゲート:** npm.cmd run package、npm.cmd run package:policyを実行し、候補VSIXのbytes/SHA256/全entry一覧とR2との差分を保全する。Expected: 上限内なら続行。超過なら実失敗のままTask2を容量blockedとして記録し、上限/固定対象を変更せず、path保持・AST同等・他payload不変を検証した具体的対策を提示する。承認なしにTask3以降や公開を進めない。
- [ ] **Step 6 — Commit:** GREENと容量ゲートを満たしたpathだけcommit。Expected: 新しいlive registry classは0、ActionRegistry当たりWorkflowProviderRegistry constructorは1、entrypoint/runtime接続はまだ変更しない。

### Task 3: live runtime、built-ins、互換API、全解除を同backendへ接続する

**Files:** Modify src/{workflowRegisterService.ts,workflowRuntimeFactory.ts,bobWorkflowRunner.ts,extension.ts,workflowContractV2ProviderLifecycle.ts}、src/core/{agentProvider.ts,engine.ts,engineTypes.ts,resultSinkRegistry.ts,runtime/resultSinkRegistry.ts,engine/preflight.ts}。Create src/builtInContributions.ts、src/core/disposeResources.ts、test/{providerRegistryRuntimeLifecycle,providerRegistryRuntimeWiring,providerRegistryDisposal,builtInContributionRegistration}.test.js。既存registrationWiring/runtimeWiring/resultSinkRegistry/agent関連testを更新する。

**Interfaces:** createLiveAgentProvider(resolve:()=>AgentProvider|undefined):AgentProvider、createPreflightCheckResolver(local,owned):WorkflowPreflightCheckResolver。registerWorkflowRegisterBuiltInContributions(host,options):ContributionRegistrationはactions2/preflight3/sinks2を一つのsetとして登録する。DisposalStep={name:string,dispose:()=>void|Promise<void>}、DisposalResult={failures:readonly {name:string,error:unknown}[]}。disposeResourcesInOrder(steps):Promise<DisposalResult>は順に全stepを呼び、返ったPromiseは後でallSettledして全失敗を集計する。service.dispose():voidはcompletionを内部保持し、service.whenDisposed():Promise<DisposalResult>でshutdown開始後の実完了を観測できるようにする（公開WorkflowRegisterApiへは追加しない）。ResultSinkFileTransactionBinding.bind(scope,ownerToken,handler,transaction):ContributionRegistration、getFileTransaction(scope,ownerToken,handler):FileTransactionHandler|undefined。file handlerのtransaction factoryはtrusted runtimeから渡す。

- [ ] **Step 1 — REDを書く:** runtimeを登録前に作成し、登録→実行→解除→再登録でaction/preflight/agent/sinkが現handlerだけを使う。explicit agent引数>現登録agent>明示agentCommandの順を保持。ownerless legacy sink/agent APIの既存結果とreturnをcharacterizeする。compat登録もbackend所有となり、serviceの旧array/fieldへ複製されないことをassertする。
- [ ] **Step 2 — sink/cleanup REDを観測:** test名'sink version mismatch calls no handler'でassert.equal(result.ok,false)、assert.equal(handlerCalls,0)。既存command/file形は保存schemaを変えず従来どおり成功し、内部expected versionはそれぞれworkflow-register.command-result-sink/v1、workflow-register.file-result-sink/v1と照合する。scope/ownerToken/handler不一致、解除後、別run混在ではtransaction/commit0。test名'cleanup continues after synchronous and asynchronous failures'で全step呼出し後にresultをawaitし、assert.deepEqual(attempted,allStepNames)、assert.equal(result.failures.length,2)。whenDisposedはshutdown前なら固定error、shutdown後は同じcompletionを返す。Run: node --test test/providerRegistryRuntimeLifecycle.test.js test/providerRegistryRuntimeWiring.test.js test/providerRegistryDisposal.test.js test/builtInContributionRegistration.test.js。Expected: 新しいlive/cleanup契約で失敗。
- [ ] **Step 3 — 接続を実装:** serviceは空のActionRegistryにhost facadeと一つのbuilt-in setを接続し、standalone createDefaultActionRegistryは従来defaultを保持する。serviceのcustomResultSinks/agentProvider/action lifecycle storeをlive backendへの互換delegationへ置き換える。preflight/agent/sinkは実行時lookupとし、file transactionは毎回current generationとrun scopeを照合、古いgenerationへ自動rebindしない。registeredSourceの非同期解除を含むcompletionはwhenDisposedで観測し、既存void disposeのsignatureを変えない。legacy file sink override時の既存transaction処理もcharacterizationに一致させる。
- [ ] **Step 4 — 境界のGREEN:** 前記4 filesと既存resultSinkRegistry.test.js、registrationWiring.test.js、runtimeWiring.test.js、runtimeWiringAdditional.test.js、workflowEngineCommandAgent.test.js、workflowContractV2ExecutionBoundary.test.js、workflowContractV2ProviderLifecycle.test.jsを実行。Expected: 既存V1と新live view全成功、V2五項目0。Task1/2 focusedも再実行する。
- [ ] **Step 5 — reachability所有変更の証明:** scripts/check-contract-v2-runtime-reachability.jsのfrozen ownerのうち実際に変更したfileだけ、diff/新hash/変更理由を記録する。private invocation import、acquisition call、barrel exportを注入したnegative fixturesが拒否されることを先に観測してからhash pinsを更新する。Run: node scripts/check-contract-v2-runtime-reachability.js、node --test test/workflowContractV2ReachabilityPolicy.test.js test/workflowContractV2ExecutionBoundary.test.js。Expected: 不正fixtureを拒否、実source五項目0、禁止集合/ルートを弱めない。
- [ ] **Step 6 — Commit:** 上記pathと必要なpolicy/testだけcommitし、VSIX容量を再測定。Expected: runtimeActivation=false、compiled leaseやV2 dispatchを製品へ接続していない。

### Task 4: companionsをatomic APIへ移し、3拡張の収束を実挙動で検証する

**Files:** Modify extensions/bob-bazaar-review/src/workflow/{workflowProviders.ts,workflowRegisterBridge.ts}、extensions/bob-code-consistency-review/src/{workflowProviderRegistration.ts,extension.ts}、両extensionの既存retryRegistrationController/test。Create Bazaar test/providerRegistryBridge.test.js、Consistency test/workflowProviderAtomicRegistration.test.js、workflow-register test/threeExtensionProviderLifecycle.test.js。既存companion workflowProviderRegistration.test.jsを動作試験で強化する。

**Interfaces:** BazaarのregisterWorkflowProvidersWithRetry(context)のvoid signatureは維持。CCRのregisterWorkflowProvidersは現在のresult unionを維持し、成功時registrationsはatomic disposable一つ。両方のbridgeはcomplete apiVersion/negotiate/registerContributionSetを検証し、installed ExtensionContext/packageからprovenanceを作る。既存retry controllerのapi/generation/own contractは変更しない。

- [ ] **Step 1 — REDを書く:** API一部欠落、version交渉throw/結果違い、installed context不一致で登録0。全handlerを準備後に一回だけ登録し、成功disposableが一つで、Bazaar11/CCR16のid・args・結果・既存sourceIdが不変であることをassertする。
- [ ] **Step 2 — 結合REDを観測:** 3拡張をcompileし、実companion registration moduleをcontrolled vscode adapterで読み込む。test名'three extensions converge across host restart and late completion'でbuilt-in1+companion2=3 sets、unchanged通知後3、API A→B後assert.equal(hostA.snapshot().ownedSetCount,0)、assert.equal(hostB.snapshot().ownedSetCount,3)、遅延A完了後も同値、全deactivate後0をassertする。provider/Bob/model handlerは実行せず、registration preparation/publicationとretry lifecycleだけを測る。Run: node --test test/threeExtensionProviderLifecycle.test.js（workflow-register cwd）。Expected: 現逐次API/未接続lifetimeで目的の収束assertが失敗。
- [ ] **Step 3 — 最小接続:** public API shapeを交渉してから一括登録し、missing disposableを成功扱いしない。古いregisterActionProvider逐次fallbackをcompanion bridgeから外す。optional integration不在時の再試行、既存timer/onDidChange/API generation機構は維持する。
- [ ] **Step 4 — GREEN:** Bazaarでnode --test test/providerRegistryBridge.test.js test/workflowProviderRegistration.test.js test/retryRegistrationController.test.js、CCRでnode --test test/workflowProviderAtomicRegistration.test.js test/workflowProviderRegistration.test.js test/retryRegistrationController.test.js、workflow-registerで前記結合試験とTask1–3 focused。Expected: 全成功、部分登録0、stale handler/遅延結果の残存0、handler実行/モデル呼出し0。
- [ ] **Step 5 — Commit:** 影響pathだけcommitし、3 manifestsと実handler集合の対応表を確定する。Expected: 三拡張同時に新APIへ接続、V1 action ID/挙動とretry APIは互換。

### Task 5: 同一候補の回帰・3 VSIX・installed UAT・独立reviewを完了する

**Files:** 実装済みsource/test、必要なら新しいtest/installedProviderRegistryLifecycle.test.jsとscripts/run-provider-registry-installed-uat.js。evidenceはplan専用workspace。共有runnerやCI contractを目的外に書き換えない。

- [ ] **Step 1 — 全回帰:** 各3 extensionでnpm.cmd test、dependency:policy、architecture:policy、source:policy、unused:report、audit:prodを実行。workflow-registerはschema:policy、Bazaarはartifact:policyとunused:policyも実行する。Expected: 新規失敗0。既存skip/監査所見を件数と理由付きで保持し、未実行の他拡張を成功扱いしない。
- [ ] **Step 2 — root gate:** rootでnode --test scripts/exact-head-ci-contract.test.js tools/main-consolidation/test/featureIntegrationProgramPolicy.test.mjs tools/main-consolidation/test/featureIntegrationStatusPolicy.test.mjs tools/main-consolidation/test/featureSelectionLedgerPolicy.test.mjsを実行。続いてnode tools/main-consolidation/create-feature-integration-program-index.mjs --check、node tools/main-consolidation/create-feature-selection-source-universe.mjs --check、node tools/main-consolidation/create-feature-selection-ledger.mjs --check、node tools/main-consolidation/create-feature-integration-status.mjs --check、node tools/main-consolidation/run-gate-r.mjs --checkを順に実行する。npm test中のGate R出力とも照合する。Expected: static20と旧completion10件不変、次sliceは本sliceのまま、active Gate R 15 familiesを保持しV2五項目0。これをroot全試験の新規実行とは呼ばない。
- [ ] **Step 3 — 実package:** 各3 extensionでnpm.cmd run package、package:policy。Bazaarのpackage:smokeも実行。Expected: 上限workflow1,200,000/Bazaar12,000,000/CCR11,000,000 bytes以内。各VSIX SHA256と全entry名/bytes/hash、owner manifests、version/engine/locksを保存。圧縮対策で修正した場合は承認済み対象のAST同等と非対象payload不変も確認する。
- [ ] **Step 4 — installed UAT:** 3候補VSIXを同じowned IBM Bob host/profileへ導入し、インストール済みout moduleとmanifestをVSIX全payload hashesへ照合する。候補sourceのoutへ差し替えない。installed実moduleで3 owned sets、API restart、late completion、全deactivate0、V2五項目0を観測し、host exit0を確認する。GUI/model操作は行わずnot_runと明記する。失敗host/profileも保持する。
- [ ] **Step 5 — 一度の独立review:** spec/plan、base..candidateのdiff、46 items対応表、全ログ/hashと判断ledgerをfresh reviewerへ渡す。owner graph、host provenance限界、reentrant/late failure、run binding、V1互換/V2不達を確認する。Expected: Critical/Importantは主スレッドの一度のRED→GREEN修正と影響拡張全回帰で解決。MinorとDeclined to judgeの全判断・代償を記録し、二度目reviewの実施を装わない。
- [ ] **Step 6 — exact-head確定:** review修正後はVSIX/UAT subjectを更新し、各成果物のsource HEAD/tree、payload/host測定を同候補へ再結合する。Expected: candidateはclean、VSIXとinstalled subjectにずれなし、local verification complete。source/main統合完了はまだ主張しない。

### Task 6: source候補を公開し、実CIと通常main統合を受け入れる

**Files:** source branch、GitHub draft PR、plan専用CI/ref/admission証跡。既存4 workflowsとexact-head-ci-contract.jsonは契約として参照し、通すために弱めない。

- [ ] **Step 1 — 公開前guard:** 今回sliceの人間承認と具体的C公開・統合scope、Task5のexact candidate/head/clean/review、VSIX/UAT/hash、保護status、remote refsを確認する。scope未承認なら完成候補を提示し、その最終確認だけを求める。Expected: 強制操作・設定変更なしで通常公開できる具体的候補。
- [ ] **Step 2 — candidate CI:** approved branchをpushしdraft PRを作成、必ずattach_artifactで紐付ける。品質/contract/scaffold/UIの4 workflowsを現exact-head契約に従って確認し、path filterで起動しないものは同candidate SHAと32文字nonceでdispatchする。Ubuntu/Windows、package/host proofと実checkout subjectを収集する。Expected: 要求check成功。runner未起動/403/not_runはそのまま保存し、免除を推定しない。
- [ ] **Step 3 — source M1:** headが変わらずreview/local/CI全gateを満たす場合のみ通常mergeし、mainのparents/treeとcandidate treeを照合する。primaryはff-onlyで同期し、保護statusを比較する。Expected: source M1を特定でき、不要branch削除なし。
- [ ] **Step 4 — main CIと保全:** M1 exact headの同CI契約を収集し、全required gates成功と証拠closureを確認する。外部証拠はexclusive copy/hash検証で保持し、nested absolute bindingsも漏れなく保全する。Expected: source-main admissionのacceptedMainSha=M1、CI failure/unverifiedがなければ受入。未解決ならTask7へ進まず、そのgateだけ保留する。

### Task 7: source M1から別metadata PRを作り、ordinal9だけを昇格する

**Files:** .gitattributes、docs/release-evidence/reg-bridge-owner-version-lifecycle-completion-2026-10-19.json、tools/main-consolidation/{featureIntegrationStatusPolicy.mjs,create-feature-integration-status.mjs,test/featureIntegrationStatusPolicy.test.mjs}、docs/release-evidence/feature-integration-status.jsonの6 pathだけ。別worktree/branchはsource M1から作る。

**Interfaces:** source recordはM1をsubjectとし、source candidate/review/local/CI/VSIX/installed proof/全外部bindingを持つ。completionReferencesは旧10 prefixを保持して11件、static20不変、ordinal9だけVERIFIED、次はREG-BRIDGE-DISCOVERY-EVIDENCE、進捗9/20。metadata M2をsource subjectに使わない。

- [ ] **Step 1 — REDを書く:** source M1/tree/parents不一致、未成功CI、異なるVSIX/host subject、nested証拠欠落、旧completion prefix変更、順序/他slice昇格、runtimeActivation trueを拒否する。test名'owner lifecycle advances only ordinal nine'でassert.equal(output.completionReferences.length,11)、assert.equal(output.nextSliceId,'REG-BRIDGE-DISCOVERY-EVIDENCE')、assert.deepEqual(output.completionReferences.slice(0,10),oldReferences)。Run: node --test tools/main-consolidation/test/featureIntegrationStatusPolicy.test.mjs。Expected: 新recordが未登録/不正として目的のassertで失敗する。
- [ ] **Step 2 — 最小metadata実装:** 新recordのliteral LF ruleとdecoder/pins/generator inputを追加する。旧R1/R2の歴史的CI免除は変更せず、新recordには適用しない。全absolute evidence bindingの保全先/hashを再帰検証する。Expected: 上記6 path以外とextensions treeは不変。
- [ ] **Step 3 — GREEN/生成物:** status-policy全試験とTask5 Step2のroot対象試験/4 generators --check、実index LF checkoutを実行。Expected: 11 refs、9/20、ordinal10がnext、V2 inactive。生成物だけを手で書き換えて成功させない。その他root testを実CIが要求する場合はそのliteral file集合を実行し、実際の範囲/件数を記録する。
- [ ] **Step 4 — metadata受入:** exact六pathの独立metadata reviewを一度実施し、必要なら一度のRED→GREEN修正を行う。候補CI、通常merge M2、main CI/4 generator readbackを確認し、source M1とmetadata M2を分けて記録。Expected: CI未成功時は統合受入を保留し、旧refs/失敗証拠を保持する。
- [ ] **Step 5 — 完了報告:** 実行結果、統合identity、CI実結果、VSIX/host identity、保留事項、reviewと全判断/代償を日本語で報告する。Expected: 今回sliceだけの完了を示し、V2全面移行やlive model/Program最終UATの完了を主張しない。worktree/profile/branch/証拠を保持する。

## 実装開始前の自己点検

- [x] spec§1–3はGlobal Constraints、型/責務、Task2の単一owner試験に対応する。
- [x] spec§4はTask1とTask2、§5はTask2/3/4、§6はTask3/4の実挙動試験に対応する。
- [x] spec§7–8はTasks1–7、§9は早期容量ゲートとTasks5–7、§10の5 focusは指定taskに対応する。
- [x] 型/method名は型・責務表と各Interfacesを一致させ、runtime sink用内部requestとV1保存schemaを分離した。
- [x] preparation/facadeにlive registryを作らず、既存F6/R1/R2、旧snapshot/lease、V1 APIの回帰を明示した。
- [x] 計画に未確定の仮置きや未定義の外部helperを置かず、Expectedと失敗時の保留境界を各taskへ記した。
- [x] source/metadataを別branch・別PRにし、実CI免除の継承、source M1/M2混同、早期status昇格を禁止した。
- [x] 本計画は未実行。詳細設計の承認は記録し、計画レビュー前の製品コード変更・依存install・CI dispatchは行っていない。
