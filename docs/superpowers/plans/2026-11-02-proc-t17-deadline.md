# PROC-T17-DEADLINE Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** T16の一操作一台帳へ非更新monotonic deadlineと認証first cancellation causeを結び、文書・VCS・外部process・結果採用を同じ期限で制御する。

**Architecture:** Pのnative TypeScript module一つでdeadline/scopeを実装し、既存ProcessingOperationが所有する。B/Cはeffective signalと同一期限を渡し、runnerのtransport failureとouterの取消優先を分ける。sourceと別metadataを独立して受け入れる。

**Tech Stack:** Node>=20（CI22）、TypeScript5.9.3、CommonJS ES2022/strict、native AbortController／performance.now／child_process、Node test、実npm pack/VSIX、VS Code1.106.1 isolated host、Ubuntu/Windows Actions。

**Spec:** `docs/superpowers/specs/2026-11-02-proc-t17-deadline-design.md`。承認済みcommit=`af3f1de94d0105d2ed49f237c679859a662a23f2`、blob=`d0758de54248e093a8e1164b8a0331b562c75cd4`、rawSHA256=`c672402c7fd5af38051da82e545697f865fa134096d9070b380cb98c97aad6d0`、42540bytes。利用者回答 `call_c89124c108e946b0a91dda75c9fd9451`「設計を承認して実装計画へ進む」をE/design-approval.jsonに記録する。

## Global Constraints

- 既承認の**主スレッド方式**を継続する。計画レビュー後にexecuting-plansで実装する。今は計画のみで、製品変更・依存取得・native host・remote操作は始めない。
- M0=`6ce384313c1072e34ced342260304c9c7dd07e9e`、tree=`8b2738d648aeff346be05167cd30d952e974686a`。sourceまで16refs/14of20（70%）/nextT17-DEADLINE、activation inactive。別metadata受入後のみ17refs/15of20（75%）/next=`PROC-T17-PATH`。PROCESSING-CONTROLはまだplanned。
- T17-DEADLINE ordinal15、owner=`7ea786afd5715d841526000a402c831d6c2a203c`、54selected items/54paths/53blobs/56origin rows/54unique origins、P19/B20/C15、contract14/symbol11/test family29。全675 assignments/未割当0と旧16completionのraw/blob/subjectは不変。
- absolute deadlineは `{expires_at_monotonic_ms:number}`、finite/非負/MAX_SAFE_INTEGER以下、process内monotonic domain。duration primitiveはpositive safe integer。remaining=`max(0,ceil(expiry-now))`、constrain=`min(parent,now+duration)`。time入力不正は固定message TypeError。UTC文字列・unknown/accessor/symbol/inherited configを拒否し、deadlineをprocess間authorityとして保存・transferしない。
- 設定はoperation入口で一回だけ正規化。nonnumber/nonfinite/<=0→120000ms、その他floor後1000–600000ms clamp。P primitive/runnerに1000ms最低残量を足さない。親があるconsumerはnested timeoutを再適用せず同じ期限を借用する。
- `bobBazaar.commandTimeoutMs`、`bobCodeConsistency.vcsCommandTimeoutMs` のkey/default120000/min1000/max600000を保持。C説明のみ前処理全体の非更新期限へ変更。新設定key・timeout envは追加しない。timer最大=`0x7fffffff`、長期/early callbackは再schedule、unref可能ならunref。
- scopeはnative AbortSignalとprivate WeakMapでsignal/reason identityを認証。kind=`user|deadline`、new ProcessingCancellationError.code=`processing_cancelled` はbudget9codesとは別。既存user優先、登録race再確認、最初の観測取消cause固定、外部metadata/公開constructor/別signal転載をdeadline authorityにしない。
- 通常T14取消は従来のBoundedDocumentError、既存operationのuser Errorは同一Error、非Errorは `bounded_document_cancelled`。typed authenticated deadlineをI/O/parser warningへ包まない。runner transport firstfailureは保持するが、outer採用時の認証取消を優先する（設計§9.2）。
- ProcessingOperationは一つのscope/ledger/document owner。default deadline120000ms。ownedだけがfinally dispose、borrowed documentはparentを解除しない。disposeはcancelでなくtimer/listener解放、後の同期refreshも期限/sourceを検査する。
- B signal優先はcommon > request > PDF。ignored lower signalは合成しない。複数effective sourceは受け付け、snapshot/dedupして一ownerで最初の取消を監視する。single `signal` と `signals` の同時指定を拒否する。
- B/C runner sourceはbyte同一。required `deadline` に移行、shell:false/Windows hidden/POSIX detached group、stdout caller cap/stderr262144bytes/owned prefixes/既存outputStreamを保持。nonzero/失敗もtree cleanupし、controller settle後にrejectする。
- cleanup grace2000ms、POSIX poll25ms。親exit単独でsettleしない。2秒fallbackは未確認のbest effortであり残存process0の証明でない。cleanupで元runner failureを置換せず、outer owner停止時は取消を先に返す。
- T13の13categories/default/max/aggregate/既存9errorcodes、T15/T16の一回計上・parser前予約・未commit release・過去commit非rollbackを保持。CCR document5/50MiB・sheets20/100・rows500/5000・chunk64KiB/1MiB・diff1/10MiB・Bob2/8MiB、B20sources/25MiB each/100MiB batch/32KiB chunksは不変。
- T13 total_document32/256MiB、document_count128/1024、total_sheets100/1000、total_rows25000/250000、changed_files5000/20000、aggregate excerpt2/8MiB、artifact16/64MiB、total_operation64/256MiB、zero許容/低parentも不変。
- P native moduleはdeadlineCancellationだけ追加し15modules/45compiled/49tar paths（既存4assets）へ更新。B/C各15JS＋manifest、host30runtime/8parser/583fixed parser files。P private0.1.0/prod deps0、root/`./validated-ooxml` exports、type consumers3、全parser pins保持。
- VSIX caps W1200000/B12000000/C11000000bytes。W source/deps/固定compaction113declared/111present/2absentは不変。超過なら現物と検証済み対策を作り、その差分だけ追加承認。capを緩めない。
- T17-PATH、T18 report/復元/complete-only handoff、同期native parser/inflate preemption、RSS/CPU bound、PID birth/Job Object/残存0receipt、durable Workflow arbiter、V2 activation、新UIは対象外。
- source/別metadata各一回fresh review、C/I一回TDD fix pass、Minor記録。具体的headの新C承認後のみ通常push/PR/実CI/normal merge/main非force同期。head変更なら承認/CIを転用せず、旧CI免除なし。
- 候補/mainとも5workflow/18契約行。PR18actual success、非PR17actual success＋PR専用metrics skip1。実runner/checkout/event/attempt/nonce/log/artifactを結ぶ。不足は同head＋新32hex nonceでdispatch。未起動/queued/403/失敗を成功にしない。
- primary=`codex/bob-auto-response-probe`/`90f926e0045405625f1f40d20a41346a94d1981a`、未追跡15、Owner57 rawSHA=`1665c66acd04a535b08116e639f5119b98e03609d9bb4d5f8efacc9bba37b5a4`を保持。existing18WT/branch/profile/artifact/全記録/初回失敗を削除しない。
- `.integration-xlsx-on-prereq/`、`docs/analysis/`、`docs/superpowers/plans/2026-09-28-premium-informed-three-extension-improvements.md` の内容を読まない。visual/live Bob/final Program UAT not_run。

## Review Focus

1. timer callback前の同期expiryとremaining50ms：spawn/close採用を拒否し、1000msへ延長しない（Tasks1/4/6 `subsecond_parent_deadline_never_reclamps`）。
2. public error偽装・reason転載・別runtime instance：signal+reason identity以外ではdeadlineと認証しない（Tasks1/3 `reason_replay_never_authenticates_deadline`）。
3. default effective signalがlegacy selection signalを隠す入力、ignored lower signal、borrowed dispose：取消を落とさずparentを解除しない（Tasks2/5 `legacy_selection_signal_is_not_shadowed` / `borrowed_dispose_keeps_owner_live`）。
4. overflow/nonzero119900→cleanup中expiry→settle120100：raw runner failureとouter認証取消を別に保持、未確認cleanupを成功と呼ばない（Tasks4/6 `cleanup_expiry_preserves_transport_but_cancels_adoption`）。
5. final ledger await後の取消、cleanup失敗、非管理file：fresh package成功を返さずpending解放・既存file保持（Tasks6/7 `final_ledger_cancellation_prevents_success`）。

---

## File Structure / execution decisions

P/B/C/Wは設計§1、R=`tools/main-consolidation`、E=`.superpowers/sdd/2026-11-02-proc-t17-deadline`。全file名は略称に対する相対path。rootにpackage.jsonはなくroot checksはnodeで実行する。新module/controlは下表に限定し、P/runtimeを復活させない。

| 責務 | Create / Modify |
| --- | --- |
| deadline/scopeとpublic型 | P `src/deadlineCancellation.ts`（新規）、`src/index.ts`,`scripts/runtime-payload.js`,`README.md`、fixture consumer3filesと既存package/build contracts；B/C `src/sharedProcessingBudgetRuntime.ts` |
| owner/lifecycle/互換 | P `src/documentBudget.ts`,`src/boundedDocumentRequest.ts`、owner tests；B facadeに `createRuleDocumentProfile` 抽出 |
| bounded checkpoint | P `src/boundedDocumentFile.ts`,`src/boundedDocumentIo.ts`,`src/ooxmlPreflight.ts`,`src/ooxmlParserInput.ts`,`src/validatedOoxml.ts`,`src/workbookBudget.ts` と対応tests |
| process+全4callers | B `src/bazaar/{externalProcessRunner,bazaar}.ts`,`src/ruleAuthoring/extraction/pdfExtractor.ts`、C `src/core/{externalProcessRunner,gitDiffCollector}.ts`,`src/evidenceScope/repositorySymbolIndexProducer.ts` と対応tests |
| B operation接続 | B `src/ruleAuthoring/extraction/{documentExtractor,docxExtractor,xlsxExtractor}.ts`,`src/ruleAuthoring/ruleSourceHash.ts`,`src/ui/ruleAuthoringGui.ts`,`src/mcp/tools.ts` |
| C operation接続 | C `src/core/{processingBudgetPipeline,pipeline,stableReviewInput,reviewInputValidator,reviewPackageBuilder,reviewPackageWriter}.ts`,`src/analyzers/documentExtractor.ts`,`package.json` と対応tests |
| host/CI | root `scripts/t17-deadline-installed-{smoke.mjs,extension-host.test.js,baseline-cases.js,smoke.test.mjs}`（新規4files）、processing workflow/既存build・UI・host contracts；旧host unit testsのcurrent-observerだけ適応 |
| current admission | R `deadlineAdmissionPolicy.mjs`,`deadline-source-admission.json`,`test/deadlineAdmissionPolicy.test.mjs`,`test/helpers/deadlineAdmissionFixture.mjs` と `docs/release-evidence/proc-t17-deadline-source-coverage-2026-11-02.json`（新規）、current policy callers/fixture tests/`.gitattributes` |
| 別metadata | `docs/release-evidence/proc-t17-deadline-completion-2026-11-02.json`（新規）、status JSON、R status policy/generator/testsの計5files |

実行時にTask-start/BASEとbriefを読み、各commandのcwd/HEAD/index tree/working bindings/exit/RED→GREENをEへ記録する。physical host/artifactsには短いowned temp rootを作り、Eからbytes/hashで結ぶ。生成物・失敗ログを上書きしない。Git cache-offは子process限定、global設定を変えない。main gateとGate Rの重い同時実行による既知の120s圧迫を避け、Gate Rは単独実行する。Task7/8まで未接続のharness/admission失敗は予想されるが、各taskの指定gateの失敗は解決するまでcompleteにしない。

### Task 1: native deadline / authenticated scope / 49-path package契約

**Files:** P新 `src/deadlineCancellation.ts`；既存 `src/index.ts`,`scripts/runtime-payload.js`,`README.md`,`test/packageContract.test.js`,`test/boundedDocumentPackaging.test.js`,`test/extensionIntegrationContract.test.js`,`test/aggregateIntegrationContract.test.js`,`test/fixtures/{bob-bazaar-review-consumer,bob-code-consistency-review-consumer,workflow-register-consumer}.ts`；B/C `src/sharedProcessingBudgetRuntime.ts`。新P tests=`deadlineCancellation.test.js`,`deadlineReasonAuthentication.test.js`,`deadlineSynchronousExpiry.test.js`,`deadlineLongTimer.test.js`。

**Interfaces:** `AbsoluteProcessingDeadline {readonly expires_at_monotonic_ms:number}`、`ProcessingCancellationKind='user'|'deadline'`、`ProcessingCancellationScope {readonly deadline:AbsoluteProcessingDeadline; readonly signal:AbortSignal; remainingMilliseconds():number; throwIfCancelled():void; dispose():void}`。`CreateProcessingCancellationScopeInput` はrequired `deadline:AbsoluteProcessingDeadline`、exclusive `signal?:AbortSignal` または `signals?:readonly AbortSignal[]`、trusted optional `now:()=>number`,`schedule:(callback:()=>void,delay:number)=>unknown`,`cancelSchedule:(handle:unknown)=>void`。`ProcessingCancellationError(kind:ProcessingCancellationKind,originalReason?:unknown)` extends Error、code=`processing_cancelled`、readonly `kind`/`original_reason`。以下をP rootとB/C facadeへexportする：`monotonicNowMilliseconds():number`、`createAbsoluteDeadline(timeoutMs:number,nowMs?:number):AbsoluteProcessingDeadline`、`constrainAbsoluteDeadline(parent:AbsoluteProcessingDeadline,timeoutMs:number,nowMs?:number):AbsoluteProcessingDeadline`、`remainingDeadlineMilliseconds(deadline:AbsoluteProcessingDeadline,nowMs?:number):number`、`createCancellationScope(input:CreateProcessingCancellationScopeInput):ProcessingCancellationScope`、`cancellationKindFromSignal(signal:AbortSignal):ProcessingCancellationKind|undefined`、`cancellationOriginalReason(signal:AbortSignal):unknown`、class、MAX_TIMER_DELAY_MS。facade型aliasはSharedAbsoluteDeadline/SharedCancellationScope/SharedProcessingCancellationKind、SharedCancellationSignalはAbortSignalのalias。

- [ ] **Step 1: failing testsを書く。** `nested_deadlines_do_not_refresh`、`first_observed_user_cause_wins`、`reason_replay_never_authenticates_deadline`、`early_timer_reschedules_until_clock_expires`、`long_timer_segments_without_early_abort`、`multi_source_snapshot_and_registration_race`。`invalid_deadline_and_clock_fail_closed` はNaN/unsafe/negative/unknown/accessor/symbol/inherited config・duration非整数・clock後退をTypeErrorにしgetter実行0、境界丁度のremaining0を検証する。`authenticated_metadata_ignores_public_mutation_and_other_runtime` は公開constructor/改変kind/別instanceをdeadlineと認証せず、nested genuine reasonはidentity保持。`disposed_scope_refreshes_without_live_timer` は解除各1回・以後のsource/expiry同期検査を検証する。既存package testsに15/45/49と3consumer assertionsを先に追加する。
  ```js
  assert.equal(constrainAbsoluteDeadline({expires_at_monotonic_ms:150},1000,100).expires_at_monotonic_ms,150)
  assert.equal(remainingDeadlineMilliseconds({expires_at_monotonic_ms:150},100),50)
  assert.equal(cancellationKindFromSignal(replayedReasonOnAnotherNativeSignal),'user')
  assert.deepEqual([modules.length,compiled.length,packedPaths.length],[15,45,49])
  ```
- [ ] **Step 2: REDを保存する。** 初回setupはP/B/C/W各cwdで `npm ci --ignore-scripts --no-audit --no-fund`、lock diff0を確認する。`npm run compile --prefix packages/processing-budget-runtime` で現行payloadを生成してから、新testsを `node --test --test-concurrency=1 packages/processing-budget-runtime/test/deadlineCancellation.test.js packages/processing-budget-runtime/test/deadlineReasonAuthentication.test.js packages/processing-budget-runtime/test/deadlineSynchronousExpiry.test.js packages/processing-budget-runtime/test/deadlineLongTimer.test.js` で実行。Expected: 未定義API/inventory不足によるFAIL（dependency/path typoや既存out不在はREDとしない）。
- [ ] **Step 3: 上記signatureをnative TSで実装する。** WeakMap認証・native intrinsic getters・source-first refresh・登録直後再検査・long/early timer再schedule・dispose後同期refresh。invalid/後退clockはTypeError、default timer unref。15modulesへcurrent inventoriesを更新しfacade API/hash検証を保持、budget definition/9codes/exports/depsは変更しない。
- [ ] **Step 4: GREENを確認する。** `npm run compile --prefix packages/processing-budget-runtime`、Step2 command、`node --test --test-concurrency=1 packages/processing-budget-runtime/test/packageContract.test.js packages/processing-budget-runtime/test/boundedDocumentPackaging.test.js`、`npm run typecheck:consumers --prefix packages/processing-budget-runtime`。Expected: 全exit0、real pack49paths/45compiled/3型consumer、production deps0。
- [ ] **Step 5: Task1 Filesだけをstageしcommitする。** `feat: add authenticated monotonic deadline scopes`。追加P sourceはdeadlineCancellation.ts一つ、compiled/public inventoriesの不足・余計なpath0を確認する。

### Task 2: ProcessingOperation / document ownership / Error互換

**Files:** P `src/documentBudget.ts`,`src/boundedDocumentRequest.ts`；既存 `test/processingOperation.test.js`,`test/documentAggregateBudget.test.js`,`test/documentAdmission.test.js`、新 `test/deadlineOperation.test.js`、必要な型consumer assertions。B `src/sharedProcessingBudgetRuntime.ts`。

**Interfaces:** `ProcessingOperationInput`=profile＋deadline?＋exclusive signal/signals。`ProcessingOperation` は既存APIにrequired `deadline`,`signal:AbortSignal`,`throwIfCancelled():void`,`dispose():void` を追加。default deadline120000、private ledger/brand/doc pair不変。DocumentOperationは親deadline/signalと `dispose():void` を持ち、direct factoryだけhidden ownerを所有、borrowed disposeはparentを解除しない。既存 `createDocumentOperation(input)` signatureとcount semanticsを保持。`assertDocumentNotCancelled(signal?:AbortSignal):void` はauth-aware compatibility entry。B `createRuleDocumentProfile(limits:RuleAuthoringLimits):ProcessingBudgetProfile` を既存profile bodyから抽出し、既存 `createRuleDocumentOperation(count,limits,signal?)` を保持する。

- [ ] **Step 1: failing owner/compat testsを書く。** `one_deadline_one_ledger_one_document_owner`、`default_deadline_is_120000_once`、`borrowed_dispose_keeps_owner_live`、`owned_document_dispose_releases_only_its_scope`、`legacy_selection_signal_is_not_shadowed`、`operation_error_identity_and_falsey_nonerror_are_preserved`。
  ```js
  assert.equal(document.deadline,owner.deadline)
  document.dispose(); assert.equal(owner.signal.aborted,false)
  assert.throws(()=>owner.documents(0)) // documents(0)も二回は不可
  await assert.rejects(()=>legacyNoExplicitSource.readSelection(0,{...request,signal:cancelled.signal}),e=>e===operatorError)
  assert.equal(owner.snapshot().categories.length,13)
  ```
- [ ] **Step 2: REDを保存する。** `npm run compile --prefix packages/processing-budget-runtime`、`node --test --test-concurrency=1 packages/processing-budget-runtime/test/deadlineOperation.test.js packages/processing-budget-runtime/test/processingOperation.test.js packages/processing-budget-runtime/test/documentAggregateBudget.test.js packages/processing-budget-runtime/test/documentAdmission.test.js`。Expected: owner deadline/dispose/compat不足のFAIL。
- [ ] **Step 3: 既存ownerへTask1 scopeを結ぶ。** default生成一回、snapshotは失敗後も可、mutating/adoptionはrefresh、全owner finally disposal可能にする。Error reasonは認証metadataから復元、ordinary T14/nonError code保持。legacy document factoryでexplicit sourceがなくselection.signalがある場合はdefault control signalで隠さず、同deadlineを持つselection child scopeを用い同ledger/admissionへ結ぶ。explicit owner sourceの優先を保持し、childのlistener/timerはadmission終了/owner disposeで解放する。B batchはTask5でeffective sourcesをowner作成前に集約する。
- [ ] **Step 4: GREENと旧数量契約を確認する。** Step2 command＋`node --test --test-concurrency=1 packages/processing-budget-runtime/test/processingBudgetLedger.test.js packages/processing-budget-runtime/test/processingBudgetDefinition.test.js packages/processing-budget-runtime/test/processingBudgetContracts.test.js`。Expected: 全exit0、13categories/9codes/過去commit不変、fake/cross-owner拒否、Error同一性、borrowed disposalでparent取消監視を失わない。
- [ ] **Step 5: Task2 Filesをcommitする。** `feat: bind deadline lifecycle to processing owners`。deadlineはnumeric閉じたsnapshot、borrowed consumerの明示deadlineはexpiry一致を検証し、実呼出しにはowner.deadlineを渡す。effective signalはidentity一致を必須にする。

### Task 3: bounded file / OOXML / workbook同期checkpoint

**Files:** P `src/boundedDocumentRequest.ts`,`src/boundedDocumentFile.ts`,`src/boundedDocumentIo.ts`,`src/ooxmlPreflight.ts`,`src/ooxmlParserInput.ts`,`src/validatedOoxml.ts`,`src/workbookBudget.ts`。新tests `synchronousBoundedDeadline.test.js`,`boundedArchiveCancellation.test.js`,`cancellationReasonPropagation.test.js`,`ooxmlCancellationWiring.test.js`；既存boundedDocumentIo/ooxmlParserInput/workbookBudget tests。

**Interfaces:** `BoundedDocumentReadInput.signal?:AbortSignal` と、それを継承するpublic `ValidatedOoxmlParserRequest` を保持。現行private moduleの関数を `preflightOoxmlArchive(archiveBytes:Buffer,limits:OoxmlPreflightLimits,options?:Readonly<{signal?:AbortSignal}>):Promise<OoxmlPreflightResult>` へ末尾option追加し、prepareSnapshotから転送する。archiveのOoxmlArchivePreflightInput型やraw preflight public wrapperを復活させない。internal checkpointはTask1認証refresh、public requestから任意callbackを受け取らない。`assertOperationNotAborted`/ordinary assertNotAbortedのError互換はTask2を消費する。

- [ ] **Step 1: failing testsを書く。** `trusted_expiry_between_read_chunks_before_timer`、`trusted_expiry_in_zip_entry_and_crc_loop`、`pre_cancelled_archive_clones_and_reserves_nothing`、`reason_replay_never_authenticates_deadline`、`workbook_group_commits_only_after_last_check`、`falsey_original_failure_survives_without_cancel`。
  ```js
  assert.deepEqual([cloneCalls,reserveCalls,parserCalls],[0,0,0])
  assert.equal(caught.code,'processing_cancelled'); assert.equal(caught.kind,'deadline')
  assert.equal(owner.snapshot().categories.every(x=>x.reserved===0),true)
  assert.equal(commitsBeforeFinalCheck,0)
  assert.equal(commitsAfterFinalCheck,proposedReservations.length)
  ```
- [ ] **Step 2: REDを保存する。** P compile後 `node --test --test-concurrency=1 packages/processing-budget-runtime/test/synchronousBoundedDeadline.test.js packages/processing-budget-runtime/test/boundedArchiveCancellation.test.js packages/processing-budget-runtime/test/cancellationReasonPropagation.test.js packages/processing-budget-runtime/test/ooxmlCancellationWiring.test.js`。Expected: 同期expiry/forwarding不足FAIL。
- [ ] **Step 3: checkpointを接続する。** readExactly各chunk前後、allocation/reservation前、close/verify後、OOXML clone/EOCD/central/local/extra/entry/decode/inflate前後/CRC/workbook列挙、結果採用前。typed deadlineを普通のI/O/parser errorへwrapしない。native callの途中preemptionは追加せず、最後のcheck後の予約群同期commitに途中cancelを挟まない。
- [ ] **Step 4: GREENを確認する。** Step2＋`node --test --test-concurrency=1 packages/processing-budget-runtime/test/boundedDocumentIo.test.js packages/processing-budget-runtime/test/ooxmlParserInput.test.js packages/processing-budget-runtime/test/workbookBudget.test.js packages/processing-budget-runtime/test/xlsxWorkbookBudget.test.js`。Expected: 全exit0、未commit全release/close、既commit保持、ordinary T14互換、parser pin/Buffer identity/構造上限不変。
- [ ] **Step 5: Task3 Filesをcommitする。** `feat: enforce synchronous deadline checkpoints for bounded documents`。旧runtime/*.jsへ戻さず、変更native module inventoryは15のまま。

### Task 4: B/C runnerのabsolute deadlineと全4callersのatomic移行

**Files:** B `src/bazaar/externalProcessRunner.ts`,`src/bazaar/bazaar.ts`,`src/ruleAuthoring/extraction/pdfExtractor.ts`；C `src/core/externalProcessRunner.ts`,`src/core/gitDiffCollector.ts`,`src/evidenceScope/repositorySymbolIndexProducer.ts`。両existing runner/windowsProcessTreeTermination/externalProcessOptionContract/externalProcessWiring tests、新両 `test/{deadlineSettlement,posixProcessTreeTermination}.test.js`、新C `test/diffFixturePathBoundary.test.js`、B `test/{bazaarClient,rulePdfExtraction}.test.js`。

**Interfaces:** `ExternalProcessOptions` required `deadline:SharedAbsoluteDeadline` に置換、relative timeoutMs削除。other fields不変。`ExternalProcessTerminationCause='deadline'|'user'|'stdout_limit'|'stderr_limit'|'spawn_failure'|'non_zero_exit'`、`cleanupStatus='controller_settled'|'best_effort_failure'|'bounded_wait_expired'|'not_required'`。Errorは既存kind/outputStream/owned prefixes＋readonly両fields。B `BazaarOptions` はdeadline?/processingOperation?追加、clientはownedかborrowedか保持し `dispose():void`。C VCS/index optionsとPDF optionsにdeadline?/processingOperation?追加し、standalone所有／borrowed非disposeを統一する。

- [ ] **Step 1: failing runner/caller testsを書く。** `subsecond_parent_deadline_never_reclamps`、`deadline_rechecked_immediately_before_spawn_and_allowed_close`、`nonzero_after_parent_exit_waits_for_tree`、`cleanup_bound_is_not_confirmed_process_removal`、`first_transport_failure_is_stable_during_cleanup`、`pre_expired_diff_fixture_has_no_read`。4caller testsは同じdeadline/effective signalを検証し、Bazaar nested callsとstandalone PDFの一回正規化も確認。
  ```js
  assert.equal(spawnCalls,0) // pre-expired
  assert.equal(observed.deadline,owner.deadline)
  assert.equal(error.terminationCause,'stdout_limit'); assert.equal(error.outputStream,'stdout')
  assert.equal(settledBeforeKillerOrGroupTerminal,false)
  assert.equal(timeoutFallback.cleanupStatus,'bounded_wait_expired')
  ```
- [ ] **Step 2: REDを保存する。** P/B/C compile後 `node --test --test-concurrency=1 extensions/bob-bazaar-review/test/deadlineSettlement.test.js extensions/bob-code-consistency-review/test/deadlineSettlement.test.js extensions/bob-bazaar-review/test/posixProcessTreeTermination.test.js extensions/bob-code-consistency-review/test/posixProcessTreeTermination.test.js extensions/bob-bazaar-review/test/externalProcessRunner.test.js extensions/bob-code-consistency-review/test/externalProcessRunner.test.js`。Expected: relative-only/close採用/nonzero cleanup不足FAIL。
- [ ] **Step 3: runnerと4callersを一括移行する。** Task1/2のscopeを使用しpreflight/spawn直前/data/error/closeでcheck、最初のtransport outcomeを固定。nonzeroもcleanup。Windows hidden taskkill/parent後待機、POSIX group SIGKILL+25ms probe、2000ms未確認fallback、cleanupでprimaryを置換しない。B/C source byte一致。callerは既存DEFAULT_PROCESSING_BUDGET_PROFILEまたは既存profile builderで一ownerを作り、standaloneだけfinally dispose。VCS取消確認はoverflow parsingより先。
- [ ] **Step 4: GREENと全callerを確認する。** Step2＋両 `windowsProcessTreeTermination.test.js`,`externalProcessOptionContract.test.js`,`externalProcessWiring.test.js`、B bazaarClient/rulePdfExtraction、C vcsValidation/repositorySymbolIndexProducer/diffProcessingBudget/diffFixturePathBoundary。Expected: 全platform該当cases成功、POSIX-only Windows skipを記録、stdout/stderr exact/+1、fixed PDF argv、Git metadata・Bazaar incomplete差分不変。targeted AST option-contractで4production runner callのdeadline必須・timeoutMs不在を確認する。入口configとimmutable legacy probeのversioned adapterは別扱い。
- [ ] **Step 5: Task4 Filesをcommitする。** `feat: apply absolute deadlines and bounded process-tree settlement`。required option変更と全production caller移行を同一commitに収め、relative-optionの中間APIを残さない。

### Task 5: B rule batch / source fingerprint / MCP / GUI lifecycle

**Files:** B `src/sharedProcessingBudgetRuntime.ts`,`src/ruleAuthoring/ruleSourceHash.ts`,`src/ruleAuthoring/extraction/{documentExtractor,docxExtractor,xlsxExtractor,pdfExtractor}.ts`,`src/mcp/tools.ts`,`src/ui/ruleAuthoringGui.ts`、lifecycle prerequisite `src/bazaar/bazaarReviewCommands.ts`,`src/ui/reviewGui.ts`。新 `test/{ruleDocumentDeadline,mcpToolDeadline,task17RuleAuthoringCancellation,bazaarOperationLifecycle}.test.js`、既存ruleDocumentSignalCompatibility/ruleDocumentAggregateBudget/ruleSourceHash/rulePdfExtraction/reviewGuiLifecycle tests。

**Interfaces:** batchの既存3argsを維持し第4optionsに `signal?:AbortSignal,deadline?:SharedAbsoluteDeadline`。requestにdeadline?追加、PDF nested optionsを保持。Task2 `createRuleDocumentProfile` で一owner→documents一回、selected effective signalsをownerにsnapshot。McpToolRegistry public options/callTool不変、Bazaar clientをtool call内で生成・finally dispose。GUI extraction dependencyは同じ第4optionsを受け、run AbortControllerからsignalを渡す。

- [ ] **Step 1: failing testsを書く。** `batch_uses_one_owner_deadline_before_fingerprint`、`ignored_lower_signal_is_not_combined`、`distinct_effective_sources_keep_first_observed_cause`、`fingerprints_are_sequential_after_failure`、`MCP_each_call_has_fresh_client_deadline`、`cancelRun_and_panel_dispose_abort_only_active_operation`。
  ```js
  assert.equal(new Set(pdfCalls.map(x=>x.deadline)).size,1)
  assert.equal(cancelledIgnoredPdfSignalAffectsCommonOwner,false)
  assert.equal(inflightSourceReadsAfterFailure,0)
  assert.notEqual(firstToolClient,secondToolClient)
  assert.equal(activeRunSignal.aborted,true)
  assert.deepEqual([ownedClientDisposeCalls,borrowedParentDisposeCalls],[1,0])
  ```
- [ ] **Step 2: REDを保存する。** B compile後 `node --test --test-concurrency=1 extensions/bob-bazaar-review/test/ruleDocumentDeadline.test.js extensions/bob-bazaar-review/test/mcpToolDeadline.test.js extensions/bob-bazaar-review/test/task17RuleAuthoringCancellation.test.js extensions/bob-bazaar-review/test/ruleDocumentSignalCompatibility.test.js`。Expected: scope/fresh client/GUI relay不足FAIL。
- [ ] **Step 3: owner生成前にdeadlineとeffective sourcesを確定する。** explicit deadlines最小、なければnormalized PDF duration最小、common>request>PDFを保持。異なるeffective sourceを拒否せず一ownerへ監視、ignored lowerを読まない。fingerprint/parse/import/post-check/adoption前後は同owner。MCP client lifetimeをcallへ移しenv意味不変。direct commands/reviewGuiの既存client factoryは論理operationごとにfresh生成し、所有側finally disposeを加える（必要なcurrent-main prerequisite、UI改変はしない）。GUI generation/state/non管理file/既存cancel UIを保ちcontrollerを実抽出へ接続する。
- [ ] **Step 4: GREENとB既存契約を確認する。** Step2＋B `ruleDocumentAggregateBudget.test.js`,`ruleSourceHash.test.js`,`rulePdfExtraction.test.js`,`ruleDocumentSignalCompatibility.test.js`,`bazaarOperationLifecycle.test.js`,`reviewGuiLifecycle.test.js`、既存MCP/UI対象tests。Expected: 全exit0、原本dedup前会計/locator/warning/20source等不変。borrowed PDFはauth cancelをouterへthrow、standaloneは認証原因のblocked+空chunks、成功本文なし。client作成側のfinally disposalを成功/失敗/取消で検証する。
- [ ] **Step 5: Task5 Filesをcommitする。** `feat: share rule-document deadlines across batch and UI lifetimes`。archive multiple-signal-reject testのsemantic adaptationをEへ残し、現行互換を破らない。

### Task 6: CCR前処理全体・writer・final ledger採用

**Files:** C `src/core/{processingBudgetPipeline,pipeline,gitDiffCollector,stableReviewInput,reviewInputValidator,reviewPackageBuilder,reviewPackageWriter}.ts`,`src/evidenceScope/repositorySymbolIndexProducer.ts`,`src/analyzers/documentExtractor.ts`,`package.json`。新 `test/{deadlineConfigurationContract,pipelineFinalCancellation,deadlinePipeline}.test.js`、新P `test/task17IntegrationContract.test.js`、既存processingBudgetPipelineContract/diffProcessingBudget/reviewPackageBudgetIntegration tests。

**Interfaces:** `createPipelineProcessingOperation(limits,overrides?,signal?,deadline?):ProcessingOperation` と既存3args互換。`PreprocessReviewInput` にdeadline?、既存commandTimeoutMsは一操作設定。pipelineはowner生成後の `owner.signal/owner.deadline` を各層へ渡す。writer/builderは同ownerを消費し、signal省略時はowner.signalを導出、explicit不一致だけを拒否する（既存owner-only呼出しを壊さない）。normalizationはrootで一回。standalone VCS/indexはTask4の所有ルール。

- [ ] **Step 1: failing testsを書く。** `one_owner_deadline_reaches_every_selected_boundary`、`subsecond_parent_deadline_never_reclamps`、`cleanup_expiry_preserves_transport_but_cancels_adoption`、`final_ledger_cancellation_prevents_success`、`late_user_error_identity_precedes_overflow_parsing`。
  ```js
  assert.equal(createdOwners.length,1)
  assert.ok(allCalls.every(x=>x.signal===owner.signal&&x.deadline===owner.deadline))
  assert.equal(rawRunnerError.terminationCause,'stdout_limit')
  assert.equal(outerError.kind,'deadline'); assert.equal(adoptedDiffOrFreshPackage,0)
  assert.equal(resultReturnedAfterFinalLedgerCancel,false)
  ```
- [ ] **Step 2: REDを保存する。** C compile後 `node --test --test-concurrency=1 extensions/bob-code-consistency-review/test/deadlinePipeline.test.js extensions/bob-code-consistency-review/test/pipelineFinalCancellation.test.js extensions/bob-code-consistency-review/test/deadlineConfigurationContract.test.js extensions/bob-code-consistency-review/test/processingBudgetPipelineContract.test.js`。Expected: 元signal転送/whole-operation/final採用不足FAIL。
- [ ] **Step 3: pipeline入口からfinallyまで接続する。** input/path前にdeadline owner、全selected async前後とfinal artifact-ledger後・return直前にcheck。selected外のanalysis/context/traceabilityは内部を全面改造せずawait境界をcheck。root commandTimeout→deadline一回、C package説明変更。failure cleanupはscope停止でも最後までsettle、未commit release/非管理file保持、過去commit/旧package復元はT18へ残す。
- [ ] **Step 4: GREENとT16会計・失敗を確認する。** Step2＋C `diffProcessingBudget.test.js`,`reviewPackageBudgetIntegration.test.js`,`reviewPackageBudgets.test.js`,`stableReviewInput.test.js`,`processingBudgetPipelineProfile.test.js`、`node --test --test-concurrency=1 packages/processing-budget-runtime/test/task17IntegrationContract.test.js`。Expected: 全exit0、operator Error identity、falsey初回throw、root式の5表現一回、既commit不変、期限後warning/fresh package0、unmanaged file保持、B/C/Pの全選定layerへdeadline転送。profile testの兄弟build非依存を後退させない。
- [ ] **Step 5: Task6 Filesをcommitする。** `feat: enforce one deadline through code-review preprocessing`。実unit probeでtimer/listener finally解放、core機能の過大なcancel/preemption主張なし。

### Task 7: 49-path real package / 37-case native host / CI wiring

**Files:** 新root `scripts/t17-deadline-installed-smoke.mjs`,`scripts/t17-deadline-installed-extension-host.test.js`,`scripts/t17-deadline-installed-baseline-cases.js`,`scripts/t17-deadline-installed-smoke.test.mjs`。Modify `.github/workflows/processing-budget-runtime.yml`,`scripts/processing-runtime-build-workflow.test.js`,`scripts/extension-host-smoke-contract.test.js`,`scripts/three-extension-ui-contract-workflow.test.js`、必要な旧T14/T15/T16 smoke unit testsのcurrent-observer。旧native probe/controller source bytesは保持する。

**Interfaces:** `createArtifactManifest(sourceRoot:string,evidenceParent:string):Promise<string>`、`validateArtifactManifest(input:unknown):Promise<void>`、`prepareInstalledArtifacts(manifest,evidenceRoot):Promise<PreparedInstalled>`、`runInstalledSmoke(manifestPath,evidenceRoot):Promise<Receipt>`、`validateInstalledHostReceipt(host,config,manifest,exit):Promise<Join>` を新T17moduleがexport。prepare/validateはVS Code download・Git HEAD再決定・host実行をせず、渡されたcapture subjectを検証し抽出configだけを作る。runInstalledSmokeだけがhostを起動する。schema `bob-builtin-analyze/t17-artifacts/v1` / `t17-installed-host/v1` / `t17-installed-smoke/v1`。37cases/30runtime/8parser/583pins/45compiled/49tar/3type consumers、全sourceHead/tree bindings。

baseline25はT15の固定17case順＋T16の固定8case順を保持する。新baseline-cases.jsでcaseの意味を保って15module/absolute optionへ適応し、旧14module validatorに新payloadを通した成功とは呼ばない。originM0の旧probe hashes・case一覧・adaptation理由をreceiptへ結ぶ。旧probe bytesは書換えず、legacy unit validatorsはimmutable M0 fixtureを使う。新T17probeのbaseline modeは `case_semantics_preserved_in_t17_probe`。

baselineのclosed順序は `normal_docx`、`normal_xlsx`、`missing_both_xlsx`、`crc_rejected`、`oversize_rejected`、`mutation_discarded`、`locators_preserved`、`source_unchanged`、`installed_gui_error_is_logged_once_and_queue_recovers`、`document_count_rejected_before_io`、`raw_aggregate_counts_duplicate_selections`、`pre_cancelled_document_has_no_parser`、`sparse_xlsx_rejected_before_parser`、`unselected_sheet_budget_is_enforced`、`parser_await_cancellation_discards_result`、`ordinary_failure_warns_and_aggregate_failure_throws`、`source_admission_raw_is_charged_once`、`shared_operation_all_input_stages`、`independent_stdout_stderr_exact`、`stdout_overflow_waits_for_child_exit`、`git_overflow_preserves_complete_metadata`、`excerpt_parent_budget_is_fatal`、`mandatory_bob_metadata_survives_clipping`、`artifact_failure_releases_pending`、`utf8_package_bytes_and_unmanaged_file_are_preserved`。

追加12caseは順に `deadline_one_owner_reaches_all_stages`、`deadline_preexpired_fixture_has_no_reads`、`deadline_authentication_rejects_forged_reason`、`deadline_first_user_cause_survives_expiry`、`deadline_sync_read_refreshes_before_timer`、`deadline_sync_ooxml_refreshes_before_reserve`、`deadline_batch_signal_priority_and_shared_endpoint`、`deadline_mcp_calls_get_fresh_client`、`deadline_borrowed_dispose_keeps_owner_live`、`deadline_native_child_settlement`、`deadline_outer_cancel_wins_after_transport_failure`、`deadline_final_ledger_before_success`。

- [ ] **Step 1: failing harness/receipt testsを書く。** missing/duplicate case、case36/38、runtime29/31、compiled44/46、wrong head/tree、modified VSIX/fixture/parser/type proof、original-runner path読み込み、cleanup未確認の成功偽装を拒否する。
  ```js
  assert.deepEqual([receipt.cases.length,receipt.loadedModules.length,receipt.parserIdentities.length],[37,30,8])
  assert.equal(receipt.baseline.mode,'case_semantics_preserved_in_t17_probe')
  assert.equal(originalRunnerPathReads,0)
  assert.throws(()=>validateReceipt(withMissingNativeCase))
  ```
- [ ] **Step 2: REDを保存する。** `node --test --test-concurrency=1 scripts/t17-deadline-installed-smoke.test.mjs scripts/processing-runtime-build-workflow.test.js scripts/extension-host-smoke-contract.test.js scripts/three-extension-ui-contract-workflow.test.js`。Expected: T17 harness/schema/wiring不足FAIL。
- [ ] **Step 3: versioned harnessとCI stepsを実装する。** safe ZIP/CRC/hash/alias/owned temp/evidence overwrite拒否を再利用。期限はhost内で作り、親Nodeのmonotonic absolute値をconfigへtransferしない。installed module合成clock/transportのcaseはその種別を明記し、native child caseは実childの終了を観測。parser/native inflate preemption/GUI visual/live Bobは成功扱いにしない。workflowは既存5flow18jobを維持、immutable M0/owner fetchをguard後に追加し、same actual built artifactsで37caseを両OS実行・uploadする。
- [ ] **Step 4: GREENと実物を検証する。** Step2、P実npm pack49/3型consumer、B/C/W実VSIXと全package policiesを実行。`node scripts/t17-deadline-installed-smoke.mjs --artifacts <owned manifest> --evidence-root <fresh owned root>` でWindows37/37。Expected: real hostExit0、37/30/8/583/45/49/3、3VSIX cap内。portable replayは元captureと派生path mapを別保存、raw bytes不変、同じhashを検証したVSiXのruntime joinsを保持する。容量超過なら設計§12どおり例外候補を作る。
- [ ] **Step 5: Task7 Filesをcommitする。** `test: verify installed deadline control and native process settlement`。37casesは新実行であり、旧T16実行を37成功へ読み替えない。

### Task 8: 54出典coverageと独立T17 current admission

**Files:** 新R `deadlineAdmissionPolicy.mjs`,`deadline-source-admission.json`,`test/deadlineAdmissionPolicy.test.mjs`,`test/helpers/deadlineAdmissionFixture.mjs`、新coverage `docs/release-evidence/proc-t17-deadline-source-coverage-2026-11-02.json`。Modify R `gateRMainAdmissionPolicy.mjs`,`processingBudgetAdmissionPolicy.mjs` と必要なcurrent-observer tests/fixture imports、`.gitattributes`、processing workflow。

**Interfaces:** `validateDeadlineCoverage(input:unknown):true`、`validateDeadlineSourceAdmission(input:unknown):true`、`applyDeadlineSourceAdmission(input,{domain:'gate_r_shipping'|'processing_budget',baseFiles:readonly SourceRow[]}):readonly SourceRow[]`、`validateDeadlineRepository(root:string):void`。現行currentのT16 rowsを、新historical exports `gateRInputProcessMainFiles():readonly SourceRow[]`／`processingBudgetT16SourceFiles():readonly SourceRow[]` にそのまま固定してから、currentをT17へlayerする。新currentのnamed projectionは `gateRDeadlineMainFiles()`／`processingBudgetT17DeadlineSourceFiles()` とし、既存current APIはそれへdelegateする。fixture helper `createT16AdmissionFixture(parent:string):{root:string,git(...args):string}` はM0から旧T16 bytesを復元し、`createDeadlineAdmissionFixture(parent)` はcurrentを組む。

- [ ] **Step 1: failing admission testsを書く。** `exact_54_items_54_paths_53_blobs_and_675_partition`、`deadline_layer_requires_exact_t16_before`、`current_rejects_unknown_alias_working_index_and_reason_forgery`、`t13_to_t16_historical_validators_and_raw_bindings_are_unchanged`、`deadline_coverage_and_future_completion_are_literal_lf`。
  ```js
  assert.deepEqual([coverage.items.length,paths.size,blobs.size],[54,54,53])
  assert.deepEqual([coverage.remainderClosure.total,coverage.remainderClosure.unassigned],[675,0])
  assert.equal(validateInputProcessRepository(oldT16Fixture),undefined)
  assert.throws(()=>validateInputProcessRepository(liveT17Root))
  ```
- [ ] **Step 2: REDを保存する。** `node --test --test-concurrency=1 tools/main-consolidation/test/deadlineAdmissionPolicy.test.mjs`。Expected: layer/coverage未実装FAIL。旧5admission suiteのcurrent root assertionsが不適合になった実結果も別に記録する。
- [ ] **Step 3: exact T16→T17 layerを作る。** M0とownerをgit blobで再検証、54item origins/symbols→actual code/test/semantic adaptationsと675全割当を閉じる。旧runtime paths→native TS、signal precedence、timer矛盾test、37case baseline適応を明示。current-main prerequisiteを全実diffから列挙。既存canonical/raw/blob独立seal方式を使い自己hash循環を作らない。旧T13–T16validator/旧16completion bytesは変更しない。過去observerだけimmutable fixtureへ移す。LF rulesはnew coverage/admission/future completionに限定。
- [ ] **Step 4: GREENを確認する。** 新test＋旧 `inputProcessAdmissionPolicy.test.mjs`,`aggregateDocumentAdmissionPolicy.test.mjs`,`boundedDocumentAdmissionPolicy.test.mjs`,`processingBudgetAdmissionPolicy.test.mjs`,`gateRMainAdmissionPolicy.test.mjs` を `node --test --test-concurrency=1` で実行。Expected: 全exit0、new current正確/旧fixtures厳密/unknown alias拒否/675 closure、all source54 consumed。Windows owned Git一時書込み失敗は初回を残し、同head exact-caseの限定再試行以外を成功へ変換しない。
- [ ] **Step 5: Task8 Filesをcommitする。** `feat: admit deadline sources over the immutable T16 baseline`。Task1–7のactual code/paths/sealsを再確認し、付録A全54のtarget/test receiptが非空。

### Task 9: 全local品質・一回source review・具体的remote候補

**Files:** 既存source全差分。Create Eのquality receipts、actual packages、source-review package/results、source CANDIDATE.md。製品のreview fix以外はtracked追加をしない。

**Interfaces:** actual `Candidate {repository,branch,base,head,tree,changedPaths,qualityBindings,packageBindings,hostBindings,review,preservation}`。review targetはM0..固定HEAD、whole-sourceを一回、most capable available reviewer（gpt-6-astra）にread-onlyで渡す。self-reviewで代替しない。

- [ ] **Step 1: quality gate matrixを実行する。** P full test/type3/contracts/boundary、B/C/W full tests/compile・architecture/source/unused/dependency/package policies・prod audit high、root必須4、4immutable generators、新旧6admission、Task7 harness/Windows37、P real pack49、3実VSIX capsを保存する。Task1–8の各RED→GREENも照合。Expected: 全required gate成功、OS固有skipは実記録、moderate等のauditは実結果を記録しpinを無断更新しない。
- [ ] **Step 2: Gate Rを単独実行する。** `node tools/main-consolidation/run-gate-r.mjs --check`、`git diff --check`。Expected: runtimeSuitesExecuted15、providerDispatches/bobDispatches/v2ProductLeaseAcquisitions/v2ProductRunDirectoryCreations/v2ProductArtifactStagesすべて0、runtimeActivation false。失敗原因を調査し、timeoutを緩めない。
- [ ] **Step 3: 一回fresh source reviewを行う。** 全range package、設計/計画、Review Focus5行をverbatim、ledger Rulingへpointerを渡す。C/Iはeffectで再gradeしONE fix pass、各修正のRED→GREENと影響suite/必要gate成功、Minorは記録。declined-to-judgeを判断し、再reviewしない。Expected: unresolved Critical/Important0、Minor/deferredと制限が明示されている。
- [ ] **Step 4: 最終candidateをfreezeする。** 影響gate/実packages/37caseを必要範囲で新head検証し、初回失敗と原実行subjectを保持する。packaged inputsが同一でも別headで実行したと書かない。commit/index/working inputs一致、旧16refs/675/pins/primary全18WT保存を確認。Expected: hash読戻し済み、3actual VSIXはmutable outputから別physical保存。
- [ ] **Step 5: 新C承認を得る。** exact repository=`katamor1/bob_builtin_analyze`、branch=`codex/v2-processing-deadline`、head/tree/全paths/local限界/通常remote範囲をCANDIDATE.mdへ示し、このcandidate固有の新C承認を得る。通常push→main PR→candidate actual5workflow18rows/bothOS37→条件成立時normal merge→main actualCI/artifacts→WT/local main非force同期まで。metadata remoteは含めず、ユーザー作業・全WT・証拠保持を明記する。

### Task 10: source PR・両OS actual CI・accepted source observation

**Files:** Eのcandidate C approval、PR/API/logs/artifact ZIP/CRC captures、portable mapped proofs、merge/sync、`SOURCE-OBSERVATION.json` とfreeze。tracked completion/statusはまだ作らない。

**Interfaces:** sourceC0=承認head、acceptedS1=normal merge commit、tree/parents[M0,C0]。source observation schema=`bob-builtin-analyze/proc-t17-deadline-completion/v1`、state VERIFIED、source54/54/53/56/54・675/0・13categories/9budgetcodes・15modules/45compiled/49packed/3types・37cases/30runtime/8parser/583pins。deadline/control evidenceはsafe booleans/ordered outcomes/normalized durationsで表し、absolute monotonic objectを後の実行authorityへserializeしない。

- [ ] **Step 1: C承認と候補不変を読戻し、通常push/PRを行う。** PRをnative attach可能ならattach、なければURL/number/head/baseを記録する。Expected: exact remote head、main基点一致、force/adminなし。変更headは旧承認でpushしない。
- [ ] **Step 2: candidateのactual CI/artifactsを確認する。** 5workflow18rowsをevent契約で照合、不足は同head＋新32hex nonce dispatch。実runner/checkout/attempt/guard timestamp/log/hash/ZIP CRC/path、両OS native37と49tar/45compiled/3types/583pins、同payload joinsを新規capture。Expected: PR qualityなら18success、nonPR qualityなら17success＋metrics skip1。byte joinsと元runner observationをportable replayと分け、旧CI/失敗/queueを転用しない。
- [ ] **Step 3: premerge条件成立時のみ通常mergeする。** exact head guard、current base、clean PR、local tree・全positive joins・preservation読戻し。Expected: S1 parents=[M0,C0]、S1 tree=candidate tree。新head修正が必要なら具体候補を再作成し新C承認、古いCIを転用しない。
- [ ] **Step 4: S1 actual main CI/artifactsと同期を確認する。** 同じ5workflow18rows（17success/metrics skip1）・両OS37・real packages/compiled/pinsを新規観測。M0/candidate祖先を確認し対象WT ff-only、main未checkoutを確認してold-ref付き非force FF。Expected: primary branch/head/status15/Owner57・他全WT不変、S1 current admission/4generators/named deadline gates/GateR15・5effects0・diff成功。
- [ ] **Step 5: source observationをclosed recordでfreezeする。** C0/S1/tree/parents/PR、全54対応、deadline ownership/authentication/sync checks/dispose/tree bounded outcome/outer adoption、actual local/review/CI/host/packages、初回失敗/制限/physical bindingsを結ぶ。raw/canonical hashを区別し全positive bindingを再hash。Expected: source JSON固定、formal progressはまだ16refs/14of20/nextT17-DEADLINE、activation false、final UAT not_run。

### Task 11: 別completion metadata・17refs/75%・最終11task closure

**Files:** new `docs/release-evidence/proc-t17-deadline-completion-2026-11-02.json`。Modify status JSON、R `featureIntegrationStatusPolicy.mjs`,`create-feature-integration-status.mjs`,`test/featureIntegrationStatusPolicy.test.mjs` の計5files。Eの最終checker/report/metadata evidenceはignored。

**Interfaces:** `validateT17DeadlineCompletion(record:unknown):void` はsource C0/S1/tree/parents/PR、54/54/53/675/0、13/9/15/45/49/3、両OS37/30/8/583、safe deadline control evidence、auth/transport-vs-outer/cleanup未確認限界、actual CI/local/review/preservationを検証する。COMPLETION_REGISTRY17番へappendし旧16prefixと旧pretty/LF parsersを保持する。metadata M1をsourceへ書かない。

- [ ] **Step 1: S1から別metadata WTを準備する。** native inventory/createを優先し、なければ既存方針のGit fallbackを記録。全source bindingsを再hashし、source observation raw bytesを変換せずcopy。Expected: 別metadata branch、source旧証拠不変。新WT追加も含め全existing WT保持。
- [ ] **Step 2: failing metadata testsを書く。** `through_t17_deadline_preserves_sixteen_prefix_and_projects_fifteen_of_twenty`、`t17_deadline_rejects_metadata_subject_forged_cause_and_missing_case`、`t17_deadline_portable_replay_never_reads_original_host`、`t17_deadline_literal_lf_preserves_all_old_completion_bytes`。
  ```js
  assert.deepEqual([refs.length,verified.length,nextSliceId],[17,15,'PROC-T17-PATH'])
  assert.equal(originalHostFileAccesses,0)
  assert.throws(()=>validateT17DeadlineCompletion(withCaseCount36),TypeError)
  assert.equal(oldT16RawSha256,'0de29738494e0835a09c034e64d32ccdc56a7027208372b03cbae57638fac9d5')
  ```
- [ ] **Step 3: RED→status拡張→GREENを行う。** source raw/canonicalを別pin、pure validator/registry/dispatch/generator入力末尾へT17だけ追加。Expected: 旧16refs/全旧completion bytes保持、17refs/15of20/75%/nextT17-PATH、PROCESSING-CONTROL planned、allinactive。root必須4/4generators/新旧6admission/P test/GateR/diff成功、exact5pathsとindex/commit tree一致。current-generator observerだけ新件数へ移しhistorical replayを変えない。
- [ ] **Step 4: 一回fresh metadata review・具体的別C承認。** source reviewを繰り返さず、metadata patch/source closure/subject/hash/portable replayをread-only review。C/I一回TDD fix、Minor記録。検証済み別CANDIDATE.mdへ5paths/head/tree/実行限界/通常remote範囲を固定し、この別candidateへの新C承認を得る。Expected: source Cを流用しない。
- [ ] **Step 5: metadataの通常push/PR/actual CI/merge/main同期。** candidate/mainそれぞれ同head event別5workflow18rowsと両OS37case/packages/compiled/pinsを新規確認。条件成立時normal merge、M1 parents/tree一致、source raw bytes不変、WT ff-only・未checkout main非force FF。Expected: all evidence/primary/既存WT保持、旧免除/forceなし。
- [ ] **Step 6: M1 named gatesと全11taskを最終照合する。** current admission/4generators/named4metadata tests/GateR15・5effects0/diff、17refs/75%/nextPATH/inactiveをreceipt化。E/check-task-closure.cjsのCLIは `node <absolute checker> <absolute task-closure.json>`、closed manifest `{tasks:[{number:1..11,state:'complete',evidence:ByteBinding[]}]}`。11個の一意番号/各非空positive absolute-path bytes/hashを再検証し不足ならnonzero、source/metadata C approvalと受入receiptsを対応Taskに結ぶ。Expected: 全11task completeのみexit0。実制限・初回失敗/skip・Ruling/Minor・source/metadata別subject・最終UAT not_runをCOMPLETION.mdへ残し、全記録/WTを保持する。

## Verification commands / self-review map

Task9のnpm gateは下表の実在scriptを使う。各 `npm run <script>` / `npm test` は表のpackage cwdまたは `--prefix` を付ける。P auditは `npm audit --omit=dev --audit-level=high` で別記録、prod deps0を確認する。compile/copy producerはshared buildを競合させず順次実行する。

| Package | Required scripts/commands |
| --- | --- |
| P | test、contracts:check、boundary:policy、typecheck:consumers、実npm pack |
| B | test、architecture:policy、source:policy、unused:policy、unused:report、artifact:policy、dependency:policy、audit:prod、package、package:policy、package:smoke |
| C | test、architecture:policy、source:policy、unused:report、dependency:policy、audit:prod、package、package:policy |
| W | test、architecture:policy、source:policy、schema:policy、unused:report、dependency:policy、audit:prod、package、package:policy |

root必須4:

```powershell
node --test --test-concurrency=1 scripts/exact-head-ci-contract.test.js tools/main-consolidation/test/featureIntegrationProgramPolicy.test.mjs tools/main-consolidation/test/featureIntegrationStatusPolicy.test.mjs tools/main-consolidation/test/featureSelectionLedgerPolicy.test.mjs
node tools/main-consolidation/create-feature-integration-program-index.mjs --check
node tools/main-consolidation/create-feature-integration-status.mjs --check
node tools/main-consolidation/create-feature-selection-source-universe.mjs --check
node tools/main-consolidation/create-feature-selection-ledger.mjs --check
node --test --test-concurrency=1 tools/main-consolidation/test/deadlineAdmissionPolicy.test.mjs tools/main-consolidation/test/inputProcessAdmissionPolicy.test.mjs tools/main-consolidation/test/aggregateDocumentAdmissionPolicy.test.mjs tools/main-consolidation/test/boundedDocumentAdmissionPolicy.test.mjs tools/main-consolidation/test/processingBudgetAdmissionPolicy.test.mjs tools/main-consolidation/test/gateRMainAdmissionPolicy.test.mjs
node tools/main-consolidation/run-gate-r.mjs --check
git diff --check
```

P/B/C/W commandのcwd/`--prefix`を明示、Node test optionsはfile引数前。WindowsのPOSIX-only skipは実Ubuntuで補完する。native controller実行とfake controller合成結果、元captureとportable replayを混同しない。full suiteは影響変更/失敗/未決事項がある場合に必要範囲で再実行し、通ったgateを理由なく反復しない。

自己レビューは主スレッドで5点（spec coverage／step scan／type consistency／Review Focus／proportion）を行う。Spec§1–3/14→全Task・9–11、§4→Task2/4–6、§5–6→Task1/2/4、§7→Task2/5/6、§8→Task2/5、§9/9.2→Task4/6、§10→Task4–6、§11→Task3、§12→Task1/7/8、§13→全named tests/Task7、§15→Global Constraints/Task7/9–11、付録A54→Task8。Review Focus5行はowning tasksのnamed testsに割当済み。

計画レビュー後も既存の主スレッド方式を維持し、実装候補のremote操作はTask9/11で具体的candidateが完成してから別確認する。
