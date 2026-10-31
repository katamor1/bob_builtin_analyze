# PROC-T16-INPUT-PROCESS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CCRの一操作で入力・文書・diff・抜粋・Bob・管理生成物の予算を接続し、B/Cの外部コマンド出力をstream別に制限する。

**Architecture:** 一つのT13 ledgerをclosureで所有するprocessing operationからT15 document operationを一度だけ生成する。process launcher、prompt/package生成は現行extensionに残し、既存のOOXML owner・取消・終了待ちを維持する。source受入と別completion metadataを分離する。

**Tech Stack:** Node>=20（CI22）、TypeScript5.9.3、CommonJS ES2022/strict、Node test、既存Mammoth/read-excel-file/fflate、実npm pack/VSIX、VS Code1.106.1隔離host、exact-head Actions/Gate R。

**Spec:** `docs/superpowers/specs/2026-10-31-proc-t16-input-process-design.md`。承認済みcommit=`a3290a121db4297ee774e1cd49ce2f116cb19079`、blob=`78a61c53534c53f573e59cbd46ce62fd5fbd771c`、raw SHA256=`46c4edca2996bbadca8e6f612cf243ac678938ed7559c1deb5331eab3e2955fa`（33,117bytes）。利用者回答「設計を承認して実装計画へ進む」をE/design-approval.jsonに記録する。

## Global Constraints

- 実装は既存の**主スレッド方式**を継続し、承認後にexecuting-plansでTask1から進める。計画作成だけの現段階では製品変更・依存取得・host・remote操作を開始しない。
- M0=`b3d18e2d9c3aa272f861a28c69e8e963572186c8`、tree=`d717938a095bfd2872e46af40ed1ed04f35df03c`。sourceまで正式進捗は15refs/13of20（65%）/nextT16、activation全inactive。Task11受入後のみ16refs/14of20（70%）/next=`PROC-T17-DEADLINE`へ進める。
- T16 ordinal14、PROCESSING-CONTROL、29items/28paths/27blobs、owner=`49f39e1a6ec35e5db98e9ef698d4ce43369c9760`、全675 partition/未割当0。immutable ledger/universe/archiveと旧15 completion refsのraw/blob/subjectを変更しない。
- T13の13カテゴリ・default/max・9 error codesを保持する。stdout/stderrカテゴリは追加しない。原本→抜粋→Bobの異なる論理表現を各一回、祖先はT13が一回debitする。入力式はreviewInput原本＋選択文書原本＋採用diff＋採用抜粋＋採用Bob。artifactは独立出力予算。
- CCR public default/max：document5/50MiB、sheet20/100、rows500/5,000、chunk excerpt64KiB/1MiB、raw diff1/10MiB、Bob2/8MiB。T13 total_document32/256MiB、document_count128/1,024、total_sheets100/1,000、total_rows25,000/250,000、changed_files5,000/20,000、artifact16/64MiB、total_operation64/256MiB。明示低parent/0とclosed own-dataを設計§5どおり扱う。
- Bazaarの20 sources / 25 MiB per-source / 100 MiB batch / 32 KiB chunks、PDFの既存出力上限と低いcaller値を保持する。原本一選択一回、OOXML単一owner/Buffer identity/expanded構造検証、workbook pre-parser予約、parser lazy load/post-check、通常warning/GUI/selector/locatorを保持する。
- stdout optionは`maxStdoutBytes`のみ、stderr=`256 * 1024`bytes独立、timeout1,000..600,000ms、shell:false/Windows hidden/POSIX groupと既存tree settlementを維持する。T17 absolute deadline/authenticated first cause/physical adapter、T18 report/complete-only handoff/旧package復元、Bazaar全体のBob/artifact接続、V2 activation/UI設定追加は対象外。
- Pは14 flat modules/46 tarball paths（42 compiled＋4 assets）、rootと`./validated-ooxml` exports、production deps0/private0.1.0。B/Cは14JS＋manifest、28runtime＋8parser bindings。parser583files、B read-excel-file9.3.1/C9.2.0、Mammoth1.12.0/Cheerio1.2.0/fflate0.8.3、TS5.9.3を保持する。
- VSIX capsはWorkflow1,200,000 / B12,000,000 / C11,000,000bytes。Workflowの実圧縮scriptと113宣言/111 present/2 absentを保持し、旧文書の79へ戻さない。容量対策が必要なら現物と検証済み候補を整え、その差分だけ別承認を得る。
- sourceと別metadataで各一回fresh review、C/I一回のfix pass、Minorは記録。具体的candidate固有の新C承認後のみ通常push/PR、exact-head実CI、条件成立時normal merge、main実CI・非force同期。headが変われば承認/CIを転用しない。旧CI免除を継承しない。
- required5workflow/18契約行。PR18実成功、非PR17実成功＋PR専用Extension source metrics skip1。実runner/checkout/event/attempt/nonce/log/artifactを結合し、未起動・queued・403・失敗を成功にしない。同一hashの実VSIXで両OS hostを検証する。
- primaryのbranch/HEAD=`codex/bob-auto-response-probe`/`90f926e0045405625f1f40d20a41346a94d1981a`、normal statusの未追跡15項目、Owner57 raw SHA256=`1665c66acd04a535b08116e639f5119b98e03609d9bb4d5f8efacc9bba37b5a4`を保つ。既存WT/branch/profile/artifact/証拠を削除しない。`.integration-xlsx-on-prereq/`、`docs/analysis/`、`docs/superpowers/plans/2026-09-28-premium-informed-three-extension-improvements.md`の内容を読まない。

## Review Focus

1. 同値profileの別ownerや偽document handleが集計を分断する入力：I/O前に拒否し、原本再読取りで二重debitしない（Task1/5 `cross_owner_pair_is_rejected_before_io`）。
2. stdoutがcap丁度、stderrも256KiB丁度を同時に出し、一chunkだけ極端に大きい子：独立枠を守り、元chunkの巨大backing storeを保持しない（Task3 `independent_exact_streams_and_owned_prefix`）。
3. multibyte途中で止まるGit diffと、header途中で止まるBazaar：Gitは完了行と完全metadata、Bazaarはparse前失敗（Task4 `utf8_boundary_and_bazaar_incomplete_metadata`）。
4. clipping warningを追加すると必須prompt自体がcapを越えるtemplate：最終warningを一致させ、必須情報を切らず失敗する（Task6 `final_warning_growth_never_truncates_mandatory_metadata`）。
5. Bob予約後のartifact +1/write/cancel/cleanup失敗とユーザー非管理file：全pending予約を解放し、非管理fileを残し、fresh package成功を出さない（Task6 `package_failure_releases_pending_and_preserves_unmanaged`）。

---

## File Structure / execution decisions

略称：P=`packages/processing-budget-runtime`、B=`extensions/bob-bazaar-review`、C=`extensions/bob-code-consistency-review`、W=`extensions/workflow-register`、R=`tools/main-consolidation`、E=`.superpowers/sdd/2026-10-31-proc-t16-input-process`。rootにはpackage.jsonがなく、root検証は`node`で行う。P/B/C/Wのnpm commandにはcwdまたは`--prefix`を明示する。

| 責務 | 作成／変更する主なfile |
| --- | --- |
| 単一台帳ownerとpublic型 | P:`src/documentBudget.ts`,`src/index.ts`,`test/processingOperation.test.js`（新規）、既存型consumer3files/契約試験/README |
| CCR正規化・stable read | C:`src/sharedProcessingBudgetRuntime.ts`,`src/core/processingBudgetPipeline.ts`（新規）、`src/core/stableReviewInput.ts`（新規）、`src/core/reviewInputValidator.ts` |
| 独立process出力 | B:`src/bazaar/externalProcessRunner.ts`,`src/bazaar/bazaar.ts`,`src/ruleAuthoring/extraction/{pdfExtractor,documentExtractor}.ts`、C:`src/core/externalProcessRunner.ts`,`src/evidenceScope/repositorySymbolIndexProducer.ts`,`src/core/gitDiffCollector.ts` |
| diff・抜粋・pipeline | C:`src/core/gitDiffCollector.ts`,`src/analyzers/documentExtractor.ts`,`src/core/pipeline.ts`と対応tests |
| Bob・生成物 | C:`src/core/reviewPackageBudgets.ts`（新規）、`src/core/reviewPackageWriter.ts`（新規）、`src/core/reviewPackageBuilder.ts`と対応tests |
| 実artifact/両OS | root:`scripts/t16-input-process-installed-smoke.mjs`,`scripts/t16-input-process-installed-extension-host.test.js`,`scripts/t16-input-process-installed-smoke.test.mjs`（全新規）、processing workflow/既存workflow契約tests |
| source admission | R:`inputProcessAdmissionPolicy.mjs`,`input-process-source-admission.json`,`test/inputProcessAdmissionPolicy.test.mjs`,`test/helpers/inputProcessAdmissionFixture.mjs`とT16 coverage（全新規）、current projection callers、`.gitattributes` |
| 別metadata | T16 completion JSON、status JSON、R:`featureIntegrationStatusPolicy.mjs`,`create-feature-integration-status.mjs`,`test/featureIntegrationStatusPolicy.test.mjs`の5files |

profileの正本は既存facadeの`createReviewDocumentProfile`を拡張して一つにする。新`processingBudgetPipeline.ts`はそのfacadeをimportする一方向とし、facadeから新helperをimportしてcycleを作らない。Pに新module/process launcherを追加しない。B facadeはコピー済み新APIの存在検証を更新するが、不要な製品経路へoperation接続を広げない。

各TaskのRED/GREEN、command/cwd/exit/subject/index/working bytes、実artifact bindingsをEの新しいreceiptへ保存する。失敗を上書きしない。Task7/8まで未接続のharness/admission失敗を既存製品の成功と混同しない。必要checksが成功した後は、追加変更や未解決事項がない限り全suiteを反復しない。

## Task 1: processing ownerとT15 document ownerの共有

**Files:** Modify P:`src/documentBudget.ts`,`src/index.ts`,`test/documentAggregateBudget.test.js`,`test/documentAdmission.test.js`,`test/packageContract.test.js`,`test/processingBudgetContracts.test.js`,`test/extensionIntegrationContract.test.js`,`test/fixtures/workflow-register-consumer.ts`,`test/fixtures/bob-bazaar-review-consumer.ts`,`test/fixtures/bob-code-consistency-review-consumer.ts`,`README.md`。Create P:`test/processingOperation.test.js`。

**Interfaces:** P rootから`createProcessingOperation(input:ProcessingOperationInput):ProcessingOperation`、`assertProcessingOperation(value:unknown):asserts value is ProcessingOperation`をexportする。Inputはclosed own-data `{profile:ProcessingBudgetProfile,signal?:AbortSignal}`。handleはreadonly profile/signal、`snapshot():Readonly<ProcessingBudgetLedgerReport>`、`reserve(category:OperationScopedProcessingBudgetCategory,amount:number):ProcessingBudgetReservation`、`documents(selectedDocumentCount:number):DocumentOperation`、`assertDocuments(document:DocumentOperation):void`。最後の二つはprivate identityで結ぶ。既存`createDocumentOperation(DocumentOperationInput)`の引数/戻り値契約を保持する。

- [ ] **Step 1: failing testsを書く。** `one_processing_owner_shares_document_and_operation_debits`、`documents_initializes_once_including_zero`、`cross_owner_pair_is_rejected_before_io`、`opaque_owner_rejects_forge_closed_input_and_precancel`、`legacy_document_admission_stays_raw_once`を実ledger/実fsで検証する。
  ```js
  const op=createProcessingOperation({profile:normalizeProcessingBudgetProfile()})
  const docs=op.documents(1)
  await docs.readSelection(0,requestOfFourByteFile)
  op.reserve('raw_diff_bytes',3).commit()
  assert.equal(committed(op,'total_operation_input_bytes'),7)
  assert.throws(()=>op.assertDocuments(other.documents(1)))
  assert.throws(()=>op.documents(0))
  ```
- [ ] **Step 2: REDを捕捉する。** Pでfresh E cacheを使い`npm ci --ignore-scripts --no-audit --no-fund`→`npm run compile`→`node --test test/processingOperation.test.js`。Expected: 新API不在によるFAIL。fixture/syntax不備はREDと数えない。
- [ ] **Step 3: 同じprivate factoryを実装する。** `documentBudget.ts`内にowner/ledger/owned document handleのWeakMap/closureを置く。countを一度reserve/commitしてからselectionを許可し、既存admission state/fingerprint/workbook ownerへ同じledgerを渡す。公開skip flagやledger注入を増やさない。assertは偽handleをgetter呼出しなしで拒否する。旧standalone APIは内部ownerを作って委譲する。
- [ ] **Step 4: GREENと互換性を確認する。** compile後Step2＋`node --test test/documentAggregateBudget.test.js test/documentAdmission.test.js test/processingBudgetLedger.test.js test/boundedDocumentIo.test.js test/workbookBudget.test.js test/xlsxWorkbookBudget.test.js`、`npm run typecheck:consumers`。各型consumerで新API使用例と`@ts-expect-error`によるtargetカテゴリreserve禁止を確認する。raw/祖先一回、Error reason/falsey throw、post-check、count0/128/1,024、二重/同時admissionと既存14modules/46pathsを保持する。
- [ ] **Step 5: Task1 pathsをcommitする。** `feat: share one processing operation with document admissions`。standalone配布のmodule数を増やしていないことを記録する。

## Task 2: CCR共通profileとreviewInputのstable read

**Files:** Modify C:`src/sharedProcessingBudgetRuntime.ts`,`src/core/reviewInputValidator.ts`,`test/sizeLimits.test.js`、B:`src/sharedProcessingBudgetRuntime.ts`。Create C:`src/core/processingBudgetPipeline.ts`,`src/core/stableReviewInput.ts`,`test/processingBudgetPipelineProfile.test.js`,`test/stableReviewInput.test.js`。

**Interfaces:** C facadeはTask1のAPIs/typesと`ProcessingBudgetReservation`/`ProcessingBudgetProfile`を再exportする。`createReviewDocumentProfile(limits:ReviewProcessingLimits,overrides?:Readonly<Partial<SharedProcessingBudgetLimits>>):ProcessingBudgetProfile`を全13カテゴリ共通の正規化factoryにする。新helperは`createPipelineProcessingOperation(limits,overrides?,signal?):ProcessingOperation`。`StableReviewTextInput={filePath:string,maximumBytes:number,textEncoding:string,signal?:AbortSignal}`、`readStableReviewInputText(input:StableReviewTextInput & {operation:ProcessingOperation}):Promise<string>`と`readStableDiffFixtureText(input:StableReviewTextInput):Promise<string>`を`stableReviewInput.ts`に置く。`validateReviewInput`の既存5引数を維持し、optionsに`processingOperation?:ProcessingOperation`を追加する。

- [ ] **Step 1: failing testsを書く。** `profile_validates_before_clamping_and_obeys_explicit_parent`、`profile_defaults_keep_public_50mib_and_bazaar_caps`、`review_input_reserves_root_before_allocation_and_parse`、`stable_read_rejects_short_read_replacement_and_close_failure`、`review_input_zero_parent_and_falsey_first_failure`。stat/open/read/parse/closeの境界を観測する。
  ```js
  assert.equal(createReviewDocumentProfile(public50MiB).limits.total_document_bytes,50*1048576)
  assert.equal(createReviewDocumentProfile(defaults,{total_operation_input_bytes:0}).limits.raw_diff_bytes,0)
  assert.throws(()=>createReviewDocumentProfile(defaults,{raw_diff_bytes:10*1048576+1}))
  assert.equal(inputAllocationsBeforeRootReservation,0)
  assert.equal(parseCallsOnOversizeOrUnstableRead,0)
  ```
- [ ] **Step 2: REDを捕捉する。** Cで`npm ci`後、P build済みで`npm run compile`→`node --test test/processingBudgetPipelineProfile.test.js test/stableReviewInput.test.js`。Expected: 新helper/会計/identity検査不在。全14modulesのbuild/copy順を保持する。
- [ ] **Step 3: profile/readを実装する。** override descriptorを先に検証し、明示parent下の子をclampする。暗黙parentは設計§5のmax式、0は有効。public leaf超過と低aggregate拒否の原因を混同しない。保持handleのbigint stat→cap/safe integer/regular file→root reserve（reviewInputのみ）→allocate/full read→前後stat/named path identity/cancel→close→commit→decodeを行う。短いread、size/identity drift、close失敗はreleaseし、最初のthrowを保持する。fixture wrapperは会計せず同じprivate readerを使う。500 refsと既存hook順は維持する。
- [ ] **Step 4: GREENを確認する。** Step2＋`node --test test/sizeLimits.test.js`。root exact/+1/0、同size/mtime復元置換、read中cancel、nonregular/unsafe stat、profile getter未実行、max超過非隠蔽を確認する。direct validatorはowner省略時だけ共通factoryで独立ownerを作る。全pipeline一本化はTask5で行う。
- [ ] **Step 5: Task2 pathsをcommitする。** `feat: bound review input on the shared processing profile`。B/C loaderのrequired APIsとcanonical build検証を維持し、facade/helper import cycleを作らない。

## Task 3: B/C runnerの独立stdout/stderr枠と全caller移行

**Files:** Modify B:`src/bazaar/externalProcessRunner.ts`,`src/bazaar/bazaar.ts`,`src/ruleAuthoring/extraction/pdfExtractor.ts`,`src/ruleAuthoring/extraction/documentExtractor.ts`,`test/externalProcessRunner.test.js`,`test/windowsProcessTreeTermination.test.js`,`test/rulePdfExtraction.test.js`、C:`src/core/externalProcessRunner.ts`,`src/core/gitDiffCollector.ts`,`src/evidenceScope/repositorySymbolIndexProducer.ts`,`test/externalProcessRunner.test.js`,`test/windowsProcessTreeTermination.test.js`。Create B/C:`test/externalProcessOptionContract.test.js`。

**Interfaces:** `ExternalProcessOptions.maxStdoutBytes:number`へ移行し、`maxBufferBytes`aliasを削除する。stdoutは正のsafe整数をspawn前に検証する（timeout正規化は既存を保持）。`EXTERNAL_PROCESS_STDERR_MAX_BYTES=256*1024`をexport。`ExternalProcessError`の末尾にoptional readonly `outputStream?:'stdout'|'stderr'`を追加し、bufferExceeded時だけ超過streamを設定する。既存kind/result/allowedExitCodesは維持する。

- [ ] **Step 1: failing testsを書く。** `independent_exact_streams_and_owned_prefix`、`stdout_and_stderr_plus_one_reject_after_settlement`、`stream_identity_cannot_be_inferred_from_message`、`invalid_stdout_option_never_spawns`をB/C両方で検証する。既存timeout/cancel/race/taskkill試験も新optionへ移す。
  ```js
  assert.deepEqual([result.stdout.length,result.stderr.length],[1024,256*1024])
  assert.equal(overflow.outputStream,'stderr')
  assert.ok(overflow.stdout.length<=1024 && overflow.stderr.length<=256*1024)
  assert.ok(retainedPrefix.buffer.byteLength < giantInputChunk.byteLength)
  assert.equal(childAliveAfterOverflowRejection,false)
  ```
- [ ] **Step 2: REDを捕捉する。** Bは初回だけ`npm ci`でlocked dependenciesを準備する。B/Cそれぞれcompile→`node --test test/externalProcessRunner.test.js test/windowsProcessTreeTermination.test.js test/externalProcessOptionContract.test.js`。Expected: 共有枠/識別field/明示caller契約の失敗。
- [ ] **Step 3: stream collectorとcallerを実装する。** stream別counterでcap以内だけコピーして保持する。errorへbounded bufferとstructured streamを渡し、既存termination helperのsettlement後にrejectする。Bazaar/PDF/repository index/Git全callerで明示stdout capを渡し、旧option fallbackを残さない。PDFの出力/chunk clamp、signal forwarding、sanitized blocked/空白page/OCR分類を維持する。
- [ ] **Step 4: GREENを確認する。** Step2＋B `node --test test/rulePdfExtraction.test.js`。同時exact/+1、chunk split/巨大chunk、0/負/NaN/Infinity/fraction/unsafe値、cancelとoverflow race、Windows親先終了とtaskkill close待ち、POSIX子終了を確認する。Windows上のPOSIX専用skipを記録し、Ubuntu実行をTask10へ残す。
- [ ] **Step 5: Task3 pathsをcommitする。** `feat: enforce independent external process output limits`。B/C runnerの仕様差0を確認し、T17 controller変更を混ぜない。

## Task 4: stable diff fixture・完全metadata・diffの原子会計

**Files:** Modify C:`src/core/gitDiffCollector.ts`,`test/sizeLimits.test.js`。Create C:`test/diffFixtureBudget.test.js`,`test/diffProcessingBudget.test.js`,`test/bazaarDiffOverflow.test.js`。

**Interfaces:** `CollectGitDiffOptions.processingOperation?:ProcessingOperation`を追加し、owner省略時だけTask2 factoryを使う。`finalizeDiffProcessingBudget(diff:DiffSummary,operation:ProcessingOperation,sourceOverflow?:boolean):DiffSummary`をexportする。private `BoundedCommandText={readonly text:string,readonly overflow:boolean}`。signal/profile整合はI/O前に検査する。

- [ ] **Step 1: failing testsを書く。** `changed_files_default_and_absolute_exact_plus_one`、`raw_diff_retained_bytes_reserve_atomically`、`utf8_boundary_and_bazaar_incomplete_metadata`、`git_stdout_overflow_keeps_complete_metadata_but_stderr_is_fatal`、`fixture_stable_read_precedes_json_parse`。fixture JSON capはmin(VCS headroom(profile.raw_diff_bytes), operation root remaining)とする。
  ```js
  assert.equal(completeMetadataFiles,5000)
  assert.throws(()=>finalizeDiffProcessingBudget(diff5001,op),isChangedFilesExceeded)
  assert.ok(Buffer.byteLength(limited.unifiedDiff,'utf8')<=80)
  assert.equal(bazaarParseCallsAfterStdoutOverflow,0)
  assert.deepEqual(op.snapshot(),beforeAggregateFailure)
  ```
- [ ] **Step 2: REDを捕捉する。** C compile→`node --test test/diffProcessingBudget.test.js test/diffFixtureBudget.test.js test/bazaarDiffOverflow.test.js`。Expected: helper/会計/early read/overflow分岐不在。
- [ ] **Step 3: collector/finalizerを実装する。** Git metadataは現行headroom capで全量を取得する。unified diffはraw cap+1 capture、structured stdout超過だけsettle後にclip可能とする。UTF-8不完了末尾を捨て、完了行＋suffixを最終cap内に収める。Bazaarはno-aliases/exit0,1を保ち、overflow時parse前にthrowする。fixtureはTask2 readerで検証後だけparseする。全一覧のchanged_filesと採用本文raw_diffをreserveしてから同時確定し、失敗は両pendingをreleaseする。
- [ ] **Step 4: GREENを確認する。** Step2＋C sizeLimits/runner tests。default/max exact/+1、cap0、rename/NUL/日本語/emoji途中、encoding変換後のbyte増加、suffixだけの小cap、metadata overflow、timeout/cancel/stderr非成功、raw予約の親不足時changed_files不変を確認する。real Git testは実temporary repoを使い、完全一覧を`maxFiles`で切らない。
- [ ] **Step 5: Task4 pathsをcommitする。** `feat: account bounded diff with complete change metadata`。不明な元全文長を観測済みの数として記録しない。

## Task 5: 文書抜粋とpipeline前半を同じownerへ接続

**Files:** Modify C:`src/analyzers/documentExtractor.ts`,`src/core/pipeline.ts`,`test/documentAggregateBudget.test.js`,`test/pipelineDocumentCancellation.test.js`,`test/sizeLimits.test.js`、P:`scripts/check-document-boundary.js`,`test/extensionIntegrationContract.test.js`,`test/aggregateIntegrationContract.test.js`。Create C:`test/documentExcerptBudget.test.js`,`test/processingBudgetPipelineContract.test.js`。

**Interfaces:** `DocumentExtractionOptions`に`processingOperation?:ProcessingOperation`を加え、`operation?:DocumentOperation`との同ownerを`processingOperation.assertDocuments`で検査する。両方省略時はTask2 factory→documents(count)。documentだけ指定して別ownerを新設する経路は拒否し、既存内部caller/testsを同時移行する。pipelineはTask2 ownerをreviewInput前に一回作り、input hook→documents(count)→diff→extractorへ渡す。`PreprocessReviewInput`の公開fieldは増やさない。

- [ ] **Step 1: failing testsを書く。** `pipeline_has_one_owner_before_review_input_and_path_checks`、`cross_owner_pair_is_rejected_before_io`、`excerpt_counts_headers_separators_and_utf8_suffix`、`raw_diff_documents_and_excerpts_share_parent`、`excerpt_zero_and_parent_failure_are_not_ordinary_warning`。
  ```js
  assert.equal(processingOwnerCreations,1)
  assert.equal(documentInitializationsBeforeArtifactPathChecks,1)
  assert.equal(committed(owner,'document_excerpt_bytes'),Buffer.byteLength(result.excerptsMarkdown,'utf8'))
  assert.equal(committed(owner,'total_operation_input_bytes'),reviewInputBytes+rawDocumentBytes+rawDiffBytes+excerptBytes)
  assert.equal(allReserved(owner),0)
  ```
- [ ] **Step 2: REDを捕捉する。** C compile→`node --test test/documentExcerptBudget.test.js test/processingBudgetPipelineContract.test.js test/pipelineDocumentCancellation.test.js`。Expected: owner未接続/抜粋未計上。source文字列assertだけを共通台帳の証明にしない。
- [ ] **Step 3: 接続とexcerpt会計を実装する。** count/profile/signal/opaque owner pairを検証する。既存excerpt fitの枠をmin(public maxBobInputBytes, profile.document_excerpt_bytes)にし、最終join実bytesを同じownerへreserve/commitする。root不足はfatal、leaf clippingは既存warning、カテゴリ0は採用0とする。T15 source/read/admission/workbook/cancel処理を変更せず、pipelineの順次進行を保つ。P boundary policyは新APIのliteral call graphを許し、既存parser禁止・single owner検査を緩めない。
- [ ] **Step 4: GREENと回帰を確認する。** Step2＋C `node --test test/documentAggregateBudget.test.js test/documentXlsxCancellationOrder.test.js test/sizeLimits.test.js`、P `npm run boundary:policy`と該当integration tests。異なるowner、偽object、profile/signal/count不一致、raw once、後続failure時既commit保持、ordinary warning/cancel区別を確認する。Bob/artifactの最後の接続はTask6に残す。
- [ ] **Step 5: Task5 pathsをcommitする。** `feat: share review input and excerpt accounting with document operations`。既存selector/evidence ID/locator/GUIの意味を保持したことを記録する。

## Task 6: 必須Bob入力・管理writer・pipeline全体の確定

**Files:** Create C:`src/core/reviewPackageBudgets.ts`,`src/core/reviewPackageWriter.ts`,`test/reviewPackageBudgets.test.js`,`test/reviewPackageBudgetIntegration.test.js`。Modify C:`src/core/reviewPackageBuilder.ts`,`src/core/pipeline.ts`,`test/processingBudgetPipelineContract.test.js`,`test/sizeLimits.test.js`。

**Interfaces:** `assembleMandatoryFirstBobInput({maximumBytes:number,template:string,values:Readonly<Record<string,string>>,truncatableKeys:readonly string[]}):BoundedBobInput`はpure helper。result=`{readonly text:string,originalBytes:number,retainedBytes:number,mandatoryBytes:number,truncated:boolean}`。`reserveMandatoryFirstBobInput(options & {operation:ProcessingOperation}):BoundedBobInput & {reservation:ProcessingBudgetReservation}`はassembly後に一回reserveするwrapper。`createReviewPackageWriter({outDir:string,operation:ProcessingOperation,signal?:AbortSignal}):ReviewPackageWriter`。writerは`writeText(relativePath:string,text:string):Promise<void>`、`writeJson(relativePath:string,value:unknown):Promise<void>`、`measure():Promise<number>`、`commit():void`、`release():void`。`buildReviewPackage`に`processingOperation?:ProcessingOperation`を追加し、pipelineはTask5 ownerを渡す。`computeManagedReviewPackageBytes(outDir:string):Promise<number>`をexportする。

- [ ] **Step 1: failing testsを書く。** `mandatory_metadata_is_default_and_only_five_bulk_keys_clip`、`final_warning_growth_never_truncates_mandatory_metadata`、`bob_original_count_does_not_render_unbounded_template`、`package_failure_releases_pending_and_preserves_unmanaged`、`all_managed_writes_reserve_before_io_and_match_disk`、`pipeline_total_includes_all_five_input_representations`。
  ```js
  assert.ok(bob.text.includes(requiredSystemAndReviewMetadata))
  assert.equal(Buffer.byteLength(bob.text,'utf8'),bob.retainedBytes)
  assert.equal(committed(owner,'bob_input_bytes'),fs.statSync(bobPath).size)
  assert.equal(committed(owner,'managed_artifact_bytes'),await computeManagedReviewPackageBytes(outDir))
  assert.deepEqual([pendingOnFailure,freshPackageObservationOnFailure],[0,false])
  assert.equal(fs.readFileSync(unmanagedPath,'utf8'),'user data')
  ```
- [ ] **Step 2: REDを捕捉する。** C compile→`node --test test/reviewPackageBudgets.test.js test/reviewPackageBudgetIntegration.test.js test/processingBudgetPipelineContract.test.js`。Expected: 必須保護/予約/write前guard未対応。
- [ ] **Step 3: Bob assemblyとbudgeted writerを実装する。** literal/placeholderの必須suffix bytesを先に数え、任意keyは設計の5つだけに限定する。UTF-8/完了行/suffix内でclipし、理論元bytesはtoken加算で求める。warningの元bytes/limitを初回で固定し、最終deterministic checksを含め必要なら二度目のbounded assemblyを行う。最終textだけBob予約する。全管理writeをwriterへ移し、各serialized実bytesをwrite前reserve、最後に実size/Bob bytesを照合→cancel確認→Bobとwriter全予約をawaitなしcommitする。失敗は逆順releaseと管理集合cleanupを行い、cleanup失敗も失敗証拠へ残す。user非管理fileと先行commitを保持する。
- [ ] **Step 4: GREENとfailure injectionを確認する。** Step2＋C sizeLimits。Bob2/8MiB、artifact16/64MiBのexact/+1、mandatory-only不足、未知placeholder必須、任意key重複/不存在、warning追加でmandatory超過、0、UTF-8/newline/JSON indent、全管理17 entriesと配下、optional欠落、途中write/照合/cancel/cleanup failureを検証する。全writerのpending0と失敗時package observationなし、全stage共通root式一致を確認する。旧package復元/complete handoffは主張しない。
- [ ] **Step 5: Task6 pathsをcommitする。** `feat: preserve mandatory Bob input and budget managed review artifacts`。P/B/C architecture/source policiesとfull C testで無用なimport/export・cycle・古いwriter bypassを検出する。

## Task 7: 実package・25ケース隔離host・CI接続

**Files:** Create root:`scripts/t16-input-process-installed-smoke.mjs`,`scripts/t16-input-process-installed-extension-host.test.js`,`scripts/t16-input-process-installed-smoke.test.mjs`。Modify `.github/workflows/processing-budget-runtime.yml`,`scripts/processing-runtime-build-workflow.test.js`,`scripts/exact-head-ci-contract.test.js`,`scripts/extension-host-smoke-contract.test.js`,`scripts/three-extension-ui-contract-workflow.test.js`。既存T14/T15 installed scriptsのbytesとparser期待値を保持する。

**Interfaces:** T16 runnerの`createArtifactManifest(sourceRoot:string,evidenceParent:string):Promise<string>`、`validateArtifactManifest(manifest:unknown):Promise<ValidatedT16Artifacts>`、`runInstalledSmoke(manifestPath:string,evidenceRoot:string):Promise<T16InstalledSmokeReceipt>`、CLI `--artifacts <absolute manifest> --evidence-root <new absolute root>`。`ByteBinding={path:string,bytes:number,sha256:string}`。manifest schema=`bob-builtin-analyze/t16-installed-artifacts/v1`、closed fields=`schemaVersion,sourceHeadSha,sourceTreeSha,baselineManifest,supplementalFixtures`。baselineManifestは実T15 `createArtifactManifest`で得た14module/42compiled/28runtime/8parser/8fixture/2VSIX manifestへのByteBinding。supplementalFixturesは`{name,path,bytes,sha256}`の固定2行`review-input.yaml`,`diff-fixture.json`。

検証済みbaselineを既存T15 `prepareInstalledArtifacts`へ渡す。T16 probeとT15 probeを同じfresh probe folderへ別名で配置し、T15の`run()`を実行して別のbaseline-host-receiptを得てからT16追加8ケースを実行する。T15の17ケースを別実装で再定義せず、parser期待値も書換えない。T16 host schema=`bob-builtin-analyze/t16-installed-host/v1`、receipt schema=`bob-builtin-analyze/t16-installed-smoke/v1`。final receiptのclosed fieldsは`schemaVersion,state,sourceHeadSha,sourceTreeSha,os,developmentPayloadFiles,shippedRuntimeFilesPerExtension,artifactManifest,baselineManifest,baselineHostReceipt,hostReceipt,hostExit,cases,loadedModules,parserIdentities,productActivationProbe,productDeactivationProbe,failure`。値は42/14、25cases、28runtime/8parser、activation probes=`not_run`。失敗receiptは取得済みfactsだけを記録し、case未実行をpassにしない。

配置はT15が生成した`probe/test.js`/`config.json`を保持し、同じT15 probe bytesを`probe/t15-aggregate-installed-extension-host.test.js`へcopyする。T16は`probe/t16-test.js`と`probe/t16-config.json`を新規配置し、extensionTestsPathを前者にする。後者のclosed fieldsは`sourceHeadSha,sourceTreeSha,baselineConfigPath,baselineHostReceiptPath,hostReceiptPath,supplementalFixtures`。baseline receiptは既存`logs/host-receipt.json`、T16 host receiptは新規`logs/t16-host-receipt.json`。元T15のconfig/receiptをT16 schemaで上書きしない。T16 validatorはbaseline manifest/host両方を既存T15 validatorでも検証してから25casesへ結合する。

- [ ] **Step 1: failing harness/workflow testsを書く。** `t16_reuses_bound_t15_artifacts_without_source_fallback`、`t16_requires_twentyfive_real_cases_and_baseline_receipt`、`t16_rejects_wrong_head_resigned_parser_missing_case_and_unknown_field`、`workflow_builds_before_host_tooling_and_runs_t16_on_both_os`。
  ```js
  assert.deepEqual([compiled.length,loadedModules.length,parserIdentities.length],[42,28,8])
  assert.equal(cases.length,25)
  assert.equal(hostExit,0)
  assert.equal(baselineManifest.sourceHeadSha,t16Manifest.sourceHeadSha)
  assert.equal(loadedModules.every(x=>isUnderInstalledExtension(x.path)),true)
  ```
- [ ] **Step 2: REDを捕捉する。** rootで`node --test scripts/t16-input-process-installed-smoke.test.mjs scripts/processing-runtime-build-workflow.test.js scripts/exact-head-ci-contract.test.js`。Expected: T16 harness/CI未接続。
- [ ] **Step 3: runner/probe/workflowを実装する。** baseline manifestをraw hash/size/subjectごと検証し、既存T15 validatorとsource-fixed parser583を再利用する。T16 receiptはbaseline17＋追加8を実観測から結合する。追加名は`shared_operation_all_input_stages`、`independent_stdout_stderr_exact`、`stdout_overflow_waits_for_child_exit`、`git_overflow_preserves_complete_metadata`、`excerpt_parent_budget_is_fatal`、`mandatory_bob_metadata_survives_clipping`、`artifact_failure_releases_pending`、`utf8_package_bytes_and_unmanaged_file_are_preserved`で固定する。installed製品API/実Node子/実Git/実parserを使い、module bytesを置換しない。processing workflowのhost入口とupload名を`t16-input-process-${matrix.os}`へ更新し、旧T14/T15契約tests・package evidence upload・head guard/nonce/pinsを保持する。path filters/newtests/admission/coverageをliteral追加し、M0とowner49fもimmutable fetchする。
- [ ] **Step 4: GREENと実Windows hostを確認する。** Step2＋旧T14/T15 harness testsとextension-host/UI contracts。B/C実package/各package:policy/B package:smoke、P実tarball46paths/3型consumerを検証し、後からpinned `@vscode/test-cli@0.0.12`/`@vscode/test-electron@2.5.2`を入れる。実manifestを生成してT16 CLIを新しいE host rootで実行する。Expected: exit0/state passed/hostExit0/25passed/28runtime/8parser。UbuntuはTask10のactualCIでxvfb-runから同runnerを実行する。unit mockを実host成功へ代用しない。
- [ ] **Step 5: Task7 pathsをcommitする。** `ci: verify input and process budgets in installed artifacts`。容量の現物値・tarball/VSIX digest・基点実圧縮script不変を記録する。実容量対策が必要な場合だけ検証済み候補で別確認する。

## Task 8: 29出典coverageとT16 current admission

**Files:** Create R:`inputProcessAdmissionPolicy.mjs`,`input-process-source-admission.json`,`test/inputProcessAdmissionPolicy.test.mjs`,`test/helpers/inputProcessAdmissionFixture.mjs`、`docs/release-evidence/proc-t16-input-process-source-coverage-2026-10-31.json`。Modify R:`gateRMainAdmissionPolicy.mjs`,`processingBudgetAdmissionPolicy.mjs`,`test/gateRMainAdmissionPolicy.test.mjs`,`test/processingBudgetAdmissionPolicy.test.mjs`,`test/aggregateDocumentAdmissionPolicy.test.mjs`、`.gitattributes`。旧T13/T14/T15 admission/coverage/completion JSONと旧policyの歴史拘束を保持する。

**Interfaces:** `validateInputProcessCoverage(input:unknown):true`、`validateInputProcessSourceAdmission(input:unknown):true`、`applyInputProcessSourceAdmission(input:unknown,options:{domain:'gate_r_shipping'|'processing_budget',baseFiles:readonly PathRow[]}):PathRow[]`、`validateInputProcessRepository(repositoryRoot?:string):void`。PathRowは既存`{path,mode,blobSha}`。T16 beforeはM0/tree d717のT15 current projection、afterは今回のliteral paths/blob。新`gateRAggregateDocumentMainFiles()`/`processingBudgetT15SourceFiles()`へ旧current getterの意味を保存し、current getterだけT16を重ねる。`createT15AdmissionFixture(parent:string):{root:string,git:(...args:string[])=>string}`はM0の選別歴史bindingsだけをraw materialize/stageする。

- [ ] **Step 1: failing admission testsを書く。** `exact_29_items_28_paths_27_blobs_and_675_partition`、`t16_before_is_t15_and_domains_are_distinct`、`unknown_alias_working_index_and_wrong_origin_are_rejected`、`t13_t14_t15_historical_validators_remain_strict`、`t16_source_and_future_completion_have_literal_lf`。
  ```js
  assert.deepEqual([coverage.items.length,new Set(paths).size,new Set(blobs).size],[29,28,27])
  assert.deepEqual([coverage.remainderClosure.total,coverage.remainderClosure.unassigned],[675,0])
  assert.equal(ownerStageCommit,'49f39e1a6ec35e5db98e9ef698d4ce43369c9760')
  assert.deepEqual(statusBeforeMetadata,[15,13,'PROC-T16-INPUT-PROCESS'])
  ```
- [ ] **Step 2: REDを捕捉する。** rootで`node --test tools/main-consolidation/test/inputProcessAdmissionPolicy.test.mjs`。Expected: T16 coverage/layer不在。旧current==T15 assertionの失敗をhistorical fixtureへ移す前に保存する。
- [ ] **Step 3: coverage/literal layerを実装する。** Spec付録Aの29IDをowner raw bytesで再hashし、採用意味・実装path/named test・適応判断とadditional current prerequisitesへ結ぶ。675itemの既存partition/primary owner/未割当0を保持する。working/index/2domain/全P inventory/unknown/alias拒否を既存seal方式で固定する。旧`validateAggregateDocumentRepository`はT15 snapshot validatorのまま残し、新current検証がT16を担当する。旧root testsはM0の選別pathsだけのhermetic fixtureへ移し、drift試験を削らない。T16 coverage/将来completionのLFをsource段階で追加し、self-sealの循環を作らない。
- [ ] **Step 4: stageしたsource treeでGREENを確認する。** Task1–8のliteral pathsだけstageしてworking/indexを一致させ、新admission、旧processing/aggregate/bounded/GateR tests、root必須4と4生成器--checkを実行する。unknown/1byte/origin/domain/before/after/aliasのnegativeを実fixtureで拒否する。Windows短いTEMPと子process限定Git cache-offが必要な場合は前段と同じ適用範囲を記録し、global configは変更しない。
- [ ] **Step 5: Task8 pathsとfinal seal差分をcommitする。** `chore: admit input and process budget source with historical seals`。旧15refsと正式進捗を先取りせず、source universe/static program indexを再生成変更しない。

## Task 9: 全local品質・source review・具体的候補

**Files:** Task1–8の実装/試験/証拠の必要fixのみ。Eに新しいlocal-gates/package-host/closure/review/candidate receiptsを作る。承認spec/plan/coverageを含むsource差分全体を対象とする。

**Interfaces:** E/source-remote-candidate-<fresh>/CANDIDATE.mdはrepository=`katamor1/bob_builtin_analyze`、branch/head/tree、全changed paths、C/I0・Minor記録、実local receipts/VSIX/tarball/Windows25host、candidate/main5workflow18rowsの要求、通常remote操作範囲を結ぶ。immutable source candidateをC0、受入source mainをS1、別metadata mainをM1と呼ぶ。

- [ ] **Step 1: local gatesを実行する。** Wは初回だけ`npm ci --ignore-scripts --no-audit --no-fund`でlocked dependenciesを準備する。P `npm test`/boundary:policy、B/C/Wの`npm test`/dependency:policy/architecture:policy/source:policy、B unused:policy/artifact:policy/package:smoke、3拡張のaudit:prod、3実VSIX/package:policy、root必須4/4生成器、新旧admission、Gate R `--check`、`git diff --check`。lockfile/pins/public caps/definition/raw baselines不変を確認する。全positive receiptsへ元のhead/tree/index/working subjectとoutput hashを残す。
- [ ] **Step 2: 29項目と実bindingsのclosureを検証する。** named tests/owner blobs/coverage/675 partitionと25host/42compiled/46tar/28runtime/8parser/2VSIX/Workflow実圧縮proofを再hashする。unit/installed/portableとcandidate/mainの証拠を区別する。timeout等は失敗のまま保存する。既承認の再利用規則を適用する場合も、同一対象bytes・元subject・制限を明示し、新head成功へ書換えない。
- [ ] **Step 3: 一回fresh source reviewを行う。** requesting-code-reviewに従い、設計/計画/全差分/receipt索引だけを最小contextで独立reviewへ渡す。C/Iは一回のTDD fix passで修正または根拠付き反証、Minorは記録する。指摘0なら変更を増やさない。製品意味を変える要求なら設計差分を明確にしてから進める。
- [ ] **Step 4: candidate commitを固定して影響checkを確認する。** fix後のseal/indexを更新し、必要な影響gates/実package/hostを新しい実subjectで再実行する。検証済みindex treeとcommit treeの一致、clean WT、全pending0、未解消C/I0を確認する。承認用candidate記録を新規作成する。
- [ ] **Step 5: この具体的candidateへの新C承認を得る。** 通常push→main PR→candidate実CI→全条件成立時normal merge→S1実CI・非force同期、ユーザー作業と全証拠保持を候補記録で示す。ここまでのlocal承認をremoteへ転用せず、承認が届くまでTask10へ進まない。

## Task 10: source PR・両OS実CI・accepted source観測

**Files:** 製品sourceはC0固定。EにPR/run/attempt/actual artifacts/main closure/preservationとbyte-fixed SOURCE-OBSERVATION.jsonを新規保存する。CI修正が必要になれば具体的candidateを作り直す。

**Interfaces:** source observation schema=`bob-builtin-analyze/proc-t16-input-process-completion/v1`は既存T15 completionの共通closed fieldsを踏襲し、slice固有`inputProcess`にoperationAccounting/stableInput/diff/excerpt/bob/artifact/processSettlementのByteBindingを置く。sourceは29/28/27/675/0、13categories/14modules/46packed/42compiled、V2inactive、旧15refs/65%を保持する。installedUat candidate/actualMain各2OSは25cases/28runtime/8parser/583parser-filesとbaseline/T16両receipt・同hashVSIX joinsを持つ。CIは`actual_exact_head_success`/allRequiredGatesSucceeded=true/waiver=null、各5workflow18rows。Task11 validatorはこれをliteralに検証する。

- [ ] **Step 1: C承認とC0一致を確認し通常push/PRする。** branch/head/tree/全差分を承認へ照合し、primary/Owner57を確認する。main向けPRを作りnative attach_artifactで紐付ける。force/admin/bypassは使わない。
- [ ] **Step 2: candidate exact-head実CIを収集する。** 5workflow/18rowsのactual event/runner/checkout/log/attemptを確認する。path-filterで不足したworkflowだけ同SHA＋32hex nonceでdispatchする。PR18成功、dispatchはmetrics skip1以外全成功。Ubuntu/Windowsのprocessing tarball/T16 nested manifests/25case host/VSIX/runtime/parser証拠をdownloadし、raw size/hash/CRC/safe pathsと全bindingsを再検証する。
- [ ] **Step 3: 全条件成立時normal mergeしS1実CIを確認する。** drift時はbase/diff/承認/CIを再評価する。S1 parents/treeとC0 treeを照合し、S1をsubjectに新規5workflow18rows＝17success＋metrics skip1と両OSactual artifactsを確認する。候補実行をmain実行に読み替えない。
- [ ] **Step 4: source closureと非force同期を行う。** source WTをff-only、未checkout local mainを非force FFする。必要local named gates/actual joinsをS1へ束縛し、runner captureとportable再検証を区別する。primary branch/head/normal status15項目/Owner57と全WT/proofs保持を検証する。
- [ ] **Step 5: source observationをbyte固定する。** 全positive external evidenceを再hashし、SOURCE-OBSERVATION.jsonのraw SHA/bytes/canonical digestを別々に記録する。正式進捗は15refs/13of20/nextT16のまま。visual/live Bob/final Program UATはnot_runを保つ。

## Task 11: 別completion metadataと正式進捗の受入

**Files:** Create `docs/release-evidence/proc-t16-input-process-completion-2026-10-31.json`。Modify `docs/release-evidence/feature-integration-status.json`、R:`featureIntegrationStatusPolicy.mjs`,`create-feature-integration-status.mjs`,`test/featureIntegrationStatusPolicy.test.mjs`。source観測/既存15completion bytesとsubjectsは不変。

**Interfaces:** `validateT16Completion(record:unknown):void`を追加し、source C0/S1/tree/parents/PR、closed T16 facts/29items/675/0/13categories/同owner/root式/stable read/independent streams/Git対Bazaar/mandatory Bob/artifact pending0/46payload/両OS25cases/actual CI/local review/preservation/external bindingsを検証する。COMPLETION_REGISTRYの16番目へ追加し、旧15prefixとT15 literal pretty JSON parserを保持する。fixture `throughT16()`はsource S1をsubjectとし、metadata M1をsourceへ書かない。

最終Task checkerはevidence-onlyの`E/check-task-closure.cjs`とし、CLIは`node <absolute checker> <absolute task-closure.json>`。manifestはclosed `{tasks:[{number:1..11,state:'complete',evidence:ByteBinding[]}]}`で11個の一意な番号と各非空positive bindingsを必須にし、実file bytes/hashを再検証する。未完/未検証行があればnonzeroにし、source/metadataの承認・受入receiptも対応Taskへ結ぶ。

- [ ] **Step 1: 別metadata WTとsource proofを準備する。** native inventoryで既存を確認し、S1からmanaged worktreeを作成して返された実pathを使う。全source raw/physical bindingsを再検証し、observationの実bytesをそのままcopyする。completionはsourceで準備済みLF契約に従い、copy時のpretty/canonical変換をしない。
- [ ] **Step 2: failing metadata testsを書く。** `through_t16_preserves_fifteen_prefix_and_projects_fourteen_of_twenty`、`t16_rejects_metadata_subject_wrong_join_waiver_and_missing_case`、`t16_completion_portable_replay_never_reads_original_host`、`t16_literal_lf_and_old_t15_pretty_bytes_survive_checkout`。
  ```js
  assert.deepEqual([refs.length,verifiedSlices.length,nextSliceId],[16,14,'PROC-T17-DEADLINE'])
  assert.equal(originalHostFileAccesses,0)
  assert.throws(()=>validateT16Completion(withCaseCount24),TypeError)
  assert.equal(oldT15RawSha256,'59606e5e39ee9143e9a0fb63e1f4040bea68ab20fd8dd2376e73ebbcf21216aa')
  ```
- [ ] **Step 3: RED→status拡張→GREENを行う。** 新testsの未対応FAILを保存し、validator/registry/dispatch/generator入力末尾へT16だけ追加する。source observationのraw/canonical hashを区別し、source受入後だけ14/20/70%へ進める。PROCESSING-FOUNDATION VERIFIEDを保持し、PROCESSING-CONTROL全体をT16だけで完了にしない。root必須4/4生成器、新旧admission/P test/Gate R/diff check、5pathsだけ、旧15refs/source bytes不変を確認する。
- [ ] **Step 4: 一回metadata reviewと別candidate C承認を行う。** source reviewを繰り返さず、metadata diff/source closureのsubject/hash/portable replayをfresh read-only reviewする。C/I fix pass/Minor記録、local verification/commit/index treeを固定し、新CANDIDATE.mdへ5paths/head/tree/品質/通常remote範囲を示す。この別candidateへの新しいC承認を得る。
- [ ] **Step 5: metadata通常push/PR/実CI/merge/main同期を行う。** PRをattachし、不足workflowを同head＋nonce dispatchする。candidate/mainともevent別5workflow18rows、実CI/同hash両OSartifactsを新規確認する。全条件成立時normal mergeし、M1 parents/tree/candidate treeとsource S1 completion bytes不変を確認する。WT ff-only/未checkout local main非force FF、primaryと証拠保持を確認する。
- [ ] **Step 6: 最終受入を記録する。** M1のnamed local gates/全positive joins/preservationを確認し、16refs/14of20（70%）/nextT17-DEADLINE/Gate R15suite・5effects0/V2inactiveをreceipt化する。全11tasksをaggregate checkerで照合し、source/metadata別subject、実制限/skip/deferred Minor、final UAT not_runをCOMPLETION.mdへ残す。

## Verification commands / self-review map

root必須4：

```powershell
node --test scripts/exact-head-ci-contract.test.js tools/main-consolidation/test/featureIntegrationProgramPolicy.test.mjs tools/main-consolidation/test/featureIntegrationStatusPolicy.test.mjs tools/main-consolidation/test/featureSelectionLedgerPolicy.test.mjs
```

4生成器は既存`--check`を使い、immutable artifactsを書換えない：

```powershell
node tools/main-consolidation/create-feature-integration-program-index.mjs --check
node tools/main-consolidation/create-feature-integration-status.mjs --check
node tools/main-consolidation/create-feature-selection-source-universe.mjs --check
node tools/main-consolidation/create-feature-selection-ledger.mjs --check
```

admission/Gate R：

```powershell
node --test tools/main-consolidation/test/inputProcessAdmissionPolicy.test.mjs tools/main-consolidation/test/aggregateDocumentAdmissionPolicy.test.mjs tools/main-consolidation/test/boundedDocumentAdmissionPolicy.test.mjs tools/main-consolidation/test/processingBudgetAdmissionPolicy.test.mjs tools/main-consolidation/test/gateRMainAdmissionPolicy.test.mjs
node tools/main-consolidation/run-gate-r.mjs --check
git diff --check
```

CLI位置はNodeが確実に認識するよう`node --test --test-concurrency=1 <files>`等、optionをfile引数前へ置く。ローカルWindowsのPOSIX skipは実Ubuntu実行で補完する。npm audit/network/host/CI制限は実結果を記録し、以前の成功や免除で置換しない。

Spec coverage：§1/2→全Task/8–11、§3/4→Tasks1/2/4/5/6、§5→Tasks1/2/5、§6→Tasks2/3/4、§7/8→Tasks5/6、§9→Tasks7–11、§10→各named tests、§11→全Taskのscope/承認/保持、付録A29rows→Task8。Review Focus5項目は各owning Taskへnamed testsを割当済み。

自己レビューはspec coverage/step granularity/type consistency/Review Focus/proportionの5点を主スレッドで行う。計画承認後は主スレッド方式を保ってTask1から実装し、source/別metadataの具体的remote候補は完成後にそれぞれ別確認する。
