# PROC-T15-AGGREGATE Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** T13台帳とT14 ownerを一操作へ接続し、全選択のcount/raw bytesとparser前workbook予算・取消を両拡張で保証し、sourceと別metadata受入後に13/20へ進める。

**Architecture:** opaque admissionで原本を一選択一回計上し、T14の同handle検証を再利用する。既存ZIP検証passからXML構造だけを採り、全sheet/row予約を成立させてからparserを呼ぶ。同じcompiled runtimeを実tarball/VSIXへ配布し、T14までの歴史subjectとT15のcurrent admission・完了観測を分離する。

**Tech Stack:** Node>=20（CI22）、TypeScript5.9.3、CommonJS ES2022/strict、Node test、既存fflate/Mammoth/read-excel-file、実npm pack/VSIX、exact-head CI/Gate R。

**Spec:** `docs/superpowers/specs/2026-10-26-proc-t15-aggregate-design.md`。承認済みcommit=`3304c867977ad9b9d1ac0745c0bfc19996b93e2e`、blob=`32e642dec16cf45443655cbae1112046b8baa39d`、raw SHA256=`f1abfaecc5a3f50c9bfc419b6657e67571374abda1c17a834b4f399def4e7d3a`（33,070bytes）。利用者回答「設計を承認して実装計画へ進む」はE/design-approval.jsonへ記録済み。

**Execution method:** 既存の主スレッド方式を維持し、計画レビュー後にexecuting-plansで実装する。上の一般的recommended表記を方式変更と解釈しない。

## Global Constraints

- 基準main M2=`a826dc20c0e71f472401adf644ca8cc777b74c58`、tree=`fa3a7ed1ea9aca00965ebe16d786096033d5f39e`。既存managed worktree `C:/Users/stell/.codex/worktrees/v2-processing-aggregate/bob_builtin_analyze`、branch=`codex/v2-processing-aggregate`を使用し、設計/計画commitをM2上の文書差分として識別する。
- ordinal13のT15のみ。30 source items/25paths/23distinct blobs、全owner-stage=`7fc7a371e6506290d8626d06e9b12c2a67888b47`をSpec付録Aと照合する。675分類/unassigned0、immutable universe/ledger/archive/static20を変更しない。
- 正式進捗は別metadata受入まで12/20（60%）/14refs/nextT15。受入後15refs/13of20（65%）/next=`PROC-T16-INPUT-PROCESS`、T13/T14/T15全accepted sourceを確認した時だけPROCESSING-FOUNDATIONをVERIFIEDにする。
- MiB=1,048,576。13カテゴリ/default/max/error9codes不変。single_document5/50MiB、total_document32/256MiB、document_count128/1,024、sheets_per_workbook20/100、total_sheets100/1,000、rows_per_sheet500/5,000、total_rows25,000/250,000、total_operation64/256MiB。未接続6カテゴリも変更しない。
- target<=256 UTF-8bytes、内部生成message<=512 UTF-8bytes、file/root<=4,096 UTF-8bytes、closed own-data/safe integer検証を維持。countはpath/content I/Oより先、rawはallocation前にreserveし、一選択一回だけcommitする。祖先を手動二重reserveしない。
- admission後のcount/raw/workbook commitは後続parser失敗で巻き戻さない。workbook未commit群は失敗時全release。通常T14 APIは従来のcallback/post-check/close成功後commit・失敗releaseを維持する。
- Bazaar20sources/25MiB source/100MiB batch/32KiB chunk、CCR source default5/max50MiB、workbook20/max100・data rows500/max5,000、既存excerpt/Bob clippingを保持する。全宣言sheet/spanを会計し、excerpt選択で縮小しない。
- 単一file/ZIP owner。OOXML5,000entries/250MiB expanded/32MiB central directory、CRC/実inflate長/全compressed消費、通常Buffer identity/再圧縮0、missing-both XLSXのみ最小styles補修を維持する。C=10MiB/E=245MiB、60MiB単一entryを新entry capで拒否しない。Eは構造制限だけで台帳debitしない。
- runtime14modules/46package paths/42development compiled files、各B/C VSIX14JS+manifest。production deps0/private0.1.0、TS5.9.3/@types/node20.19.43/fflate0.8.3、exports rootと`./validated-ooxml`のみを保持。新production依存・extension version変更をしない。
- parserはB read-excel-file9.3.1、C9.2.0、両Mammoth1.12.0/Cheerio1.2.0/fflate0.8.3。source-fixed583parser files/8actual parser entry bindings、28runtime bindingsをactual artifact/hostへ結合する。Workflow source/deps/fixed79compaction不変、VSIX capsはWorkflow1,200,000/B12,000,000/C11,000,000bytes。
- T16 diff/process/excerpt/Bob/artifact会計、T17 deadline/process tree/完全physical-path adapter、T18 handoff/report、PDF process置換、GUI設定変更、V2 activation/R3–R6は範囲外。同期inflate/parser途中停止やRSS上限を保証しない。
- required5workflows/18契約行、PR18実成功、非PR17実成功+PR専用metrics skip1。actual event/runner/checkout/nonce/attempt/logを照合し、queued/起動前失敗/403を成功としない。旧CI免除を継承しない。
- source全体fresh review一回・別metadata fresh review一回、C/I一回TDD fix pass、Minor記録。local Bはこの計画のliteral files・隔離実装/検証/local commit、公開registryのcredentialなし既存lock取得、既存pin VS Code1.106.1/test-cli0.0.12/test-electron2.5.2取得・隔離host実行まで。source/metadataのremote Cは具体的candidateごとに別承認。
- Gate R15suite/120s/3slots/1MiB、five effects0、runtime activation/automatic cleanup/mutation authority=false、V2inactive/R3–R5inactive/R6absentを保持。visual operator/live Bob/final Program UATは実証するまでnot_run。
- E=`<T15 worktree>/.superpowers/sdd/2026-10-26-proc-t15-aggregate/`。fresh evidence/pack/cache/profile rootsへ保存し、旧attempt・全証拠/branches/worktreesを保持する。CIはphysical runner.temp配下。generated outの更新も所有path/aliasを検証してから行う。
- primaryは`codex/bob-auto-response-probe`/`90f926e0045405625f1f40d20a41346a94d1981a`、15untracked、Owner57 raw SHA256=`1665c66acd04a535b08116e639f5119b98e03609d9bb4d5f8efacc9bba37b5a4`を保持。`.integration-xlsx-on-prereq/`、`docs/analysis/`、`docs/superpowers/plans/2026-09-28-premium-informed-three-extension-improvements.md`の内容を読まない。switch/reset/stash/clean/force更新を行わない。

## Review Focus

1. 同じpathを複数選択し、dedupやexcerpt早期打切りがあっても、全件数を先に確保し、読んだ各選択のrawを別計上する（Tasks1/4/5）。
2. 同size/mtime復元・handle forge/replay・callback/close失敗でも、raw二重計上やpost-check迂回を作らず、確定済みusageとopen予約を区別する（Tasks1/3）。
3. worksheetがworkbook/relsより先、sparse/implicit rows、非選択sheetに超過がある場合も、全sheetをparser前に検査・一括確保する（Tasks2/3/4/5）。
4. await直後の取消とordinary failureが競合し、Error以外やundefined/null/0がthrowされても、正しい失敗を保ち、結果採用・owned sibling放置を防ぐ（Tasks1/3/4/5/6）。
5. lower aggregate override、CCR50MiB leaf、古いsource hash/別artifact/metadata subjectで、公開上限の互換性と実CI証拠のsubjectを失わない（Tasks4/5/7/8/10/11）。

---

## File Structure / execution decisions

略記はliteral prefix：`P=packages/processing-budget-runtime/`、`B=extensions/bob-bazaar-review/`、`C=extensions/bob-code-consistency-review/`、`R=tools/main-consolidation/`。各TaskのFilesだけをstageする。out/node_modules/VSIX/Eはcommitしない。初回にE/progress.mdへ全11tasksのstart/base・RED/GREEN・判断・commit・doneを記録する。

Pの既存12flat modulesに`documentBudget`（operation/admission/取消）と`workbookBudget`（XML構造/atomic予約）だけを加える。file/ZIPのprivate policyは既存`boundedDocumentFile`/`ooxmlParserInput`内へ置く。依存方向はdocumentBudget→owner→workbookBudget→ledger/types/errorであり、逆runtime importを作らない。Task1の13module/43package/39compiledは作業途中の閉じたinventory、Task2で最終14/46/42へ更新する。package契約の未更新はTask3まで未完として記録する。

`PathRow={path:string,mode:'100644',blobSha:string}`、`ByteBinding={path:string,bytes:positiveSafeInteger,sha256:64hex}`。空stdoutはpositive fileとせず、command/exit/byteLength0/hashを持つ非空receiptで結ぶ。subjectは実head/tree/index/command/OS/artifactを保持し、source不変でgateを再利用する時も元の実行subjectを隠さずtree-equivalence理由を記録する。

以下のAPIの引数順・公開名はこの計画で固定する。opaque handleの公開fingerprintはfrozen copyであり、権限はWeakMapにだけある。method/requestにledger/target/skipCharge/parserInput/inspectionを受け取らせない。test-only observationは実ledgerのprototype予約呼出しをNode testで監視し、偽台帳に置換しない。

## Task 1: operation count・opaque admission・原本一回会計

**Files:** Create P:`src/documentBudget.ts`, `test/documentAggregateBudget.test.js`, `test/documentAdmission.test.js`。Modify P:`src/boundedDocumentFile.ts`, `src/boundedDocumentIo.ts`, `src/boundedDocumentRequest.ts`, `scripts/runtime-payload.js`, `test/boundedDocumentIo.test.js`, `test/boundedDocumentRuntime.test.js`, `test/helpers/boundedDocumentFixtures.js`。T13 core4modules/definition/schemaは不変。

**Interfaces:**
- `DocumentSelectionRequest={readonly filePath:string;readonly rootPath:string;readonly maximumFileBytes:number;readonly signal?:AbortSignal}`。
- `DocumentAdmission`は非export unique-symbol brand付きreadonly interface、公開fieldは`fingerprint:BoundedDocumentFingerprint`だけ。生成object/fingerprintはfreezeし、WeakMapにはop/ordinal/digest target/正規化path-root/max/effective signal/fingerprint/stateを保持する。
- `DocumentOperationInput={selectedDocumentCount:number;profile:ProcessingBudgetProfile;signal?:AbortSignal}`。
- このTaskの`DocumentOperationBase`はreadonly `profile`, `selectedDocumentCount`, `signal?`と、`fingerprintSelection(index:number,request:DocumentSelectionRequest):Promise<DocumentAdmission>`、`readSelection(index:number,request:DocumentSelectionRequest):Promise<BoundedDocumentSnapshot>`、`verifyAfterExternalRead(admission:DocumentAdmission):Promise<void>`、`snapshot():Readonly<ProcessingBudgetLedgerReport>`を持つ。Task3でOOXML methodを加えた`DocumentOperation`を完成させる。このTaskのfactoryは`createDocumentOperation(input:DocumentOperationInput):DocumentOperationBase`。
- `assertDocumentNotCancelled(signal?:AbortSignal):void`はError reasonを同一性のままthrow、非Error reasonは`bounded_document_cancelled`へ固定正規化する。
- private owner accountingは通常reservationとadmitted rereadを閉じた内部型で区別する。T15 operation以外は既存通常APIを使う。公開request/exportsにpolicy tokenを加えない。readSelectionは一回read・post-check/close後raw commitしてcopy-only snapshotを返し、slotは再利用不可。

- [ ] **Step 1: failing testsを書く。** `full_count_precedes_path_coercion_and_content_io`、`duplicate_path_selections_count_and_charge_separately`、`raw_reservation_precedes_allocation_and_ancestors_charge_once`、`admission_rejects_forge_cross_operation_out_of_range_reuse_and_concurrency_before_io`、`admission_freezes_identity_and_has_bounded_digest_targets`、`normal_t14_failure_releases_but_admitted_raw_survives_later_failure`。getter/coercionと実fs read/allocation/close/実ledger eventsを観測する。
  ```js
  assert.equal(pathCoercions + contentReadsBeforeCount + allocationsBeforeReserve, 0)
  assert.equal(report.categories.find(x=>x.category==='document_count').committed, 2)
  assert.deepEqual(['single_document_bytes','total_document_bytes','total_operation_input_bytes'].map(id=>report.categories.find(x=>x.category===id).committed), [2*C,2*C,2*C])
  assert.equal(report.categories.every(x=>x.reserved===0), true)
  assert.strictEqual(caughtCancellation, errorReason)
  ```
- [ ] **Step 2: REDを捕捉する。** Pで`npm ci --ignore-scripts --no-audit --no-fund`（cacheはE/fresh-root、公開registryのみ）→`npm run compile`→`node --test test/documentAggregateBudget.test.js test/documentAdmission.test.js`。Expected: 新API/module不在によるFAIL。構文/fixture不備をREDと数えない。
- [ ] **Step 3: operationとprivate policyを実装する。** call-level cancel→closed input/profile→Nのcount reserve/commitを同期で行い、その後だけselectionを解決する。ordinal別digest targetとslot stateを管理し、FP成功のpost-check/close後にrawを一回commitする。admission消費は`admitted→in_progress→completed|failed`、並行二重使用も同期state遷移で拒否する。external verifyも同じownerのprivate admitted policyで全fingerprint/physical検査を行う。public maximum超過の既存errorを先に判定し、その内側でlower aggregateに反する場合は、allocation直前の同じ同期区間でledger snapshotのtotal_document→total_operation remainingを確認し、最初の不足祖先をconstrainedCategoryに持つ既存ProcessingBudgetErrorをthrowする。成立時だけ通常のleaf reserveを一回呼ぶ。独立raw counterや祖先予約を増設せず、leafだけの不足は既存leaf errorを保つ。owner通常APIのfinish順・先行throw boolean・close/releaseを保持する。runtime manifestはdocumentBudgetを加えた13modulesだけを許す。
- [ ] **Step 4: GREENとT14回帰を実行する。** compile後にStep2 tests、`node --test test/boundedDocumentIo.test.js test/boundedDocumentRuntime.test.js test/processingBudgetLedger.test.js test/processingBudgetDefinition.test.js`。N exact/+1、raw exact/+1、同path2回、signal Error/非Error、throw undefined/null/0、same-size/mtime復元・path置換・close失敗を確認する。通常API失敗raw0/admitted後失敗rawC・全reserved0を別assertする。
- [ ] **Step 5: Task1 pathsだけをcommitする。** `feat: admit document selections on one operation ledger`。count/raw確定点と実RED/GREENをEへ保存する。package current testの旧40paths不一致はTask3未完として保持する。

## Task 2: strict XML inspectionとatomic workbook予約

**Files:** Create P:`src/workbookBudget.ts`, `test/workbookBudget.test.js`, `test/xlsxWorkbookBudget.test.js`。Modify P:`scripts/runtime-payload.js`, `test/helpers/boundedDocumentFixtures.js`。

**Interfaces:**
- `WorkbookSheetBudget={readonly name:string;readonly rowCount:number}`、`XlsxWorkbookInspection={readonly sheets:readonly {readonly name:string;readonly partName:string;readonly rowSpan:number}[]}`。
- `WorkbookBudgetCommit={readonly sheetCount:number;readonly totalRows:number;readonly sheets:readonly {readonly name:string;readonly target:string;readonly rows:number}[]}`、`XlsxWorkbookBudgetCommit=WorkbookBudgetCommit & {readonly inspection:XlsxWorkbookInspection}`。
- `commitWorkbookBudget(input:{ledger:ProcessingBudgetLedger;workbookTarget:string;sheets:Iterable<WorkbookSheetBudget>;cancellation?:()=>void}):WorkbookBudgetCommit`。
- `commitXlsxWorkbookBudget(input:{ledger:ProcessingBudgetLedger;workbookTarget:string;inspection:XlsxWorkbookInspection;headerRows:0|1;sheetTarget?:(sheetName:string,index:number)=>string;cancellation?:()=>void}):XlsxWorkbookBudgetCommit`。
- `assertParsedXlsxWorkbookWithinBudget(parsed:readonly {sheet:string;data:readonly unknown[]}[],inspection:XlsxWorkbookInspection):void`。
- private-to-package `createXlsxInspectionObserver():{observeEntry(name:string,validatedBytes:Uint8Array):void;finish():XlsxWorkbookInspection}`を同moduleからownerだけへexportする。root/subpathはこのobserverを公開しない。

- [ ] **Step 1: failing testsを書く。** `late_sheet_failure_releases_every_pending_reservation`、`enumeration_cancellation_and_invalid_count_keep_first_failure`、`all_reservations_precede_any_commit_and_commit_has_no_await`、`xlsx_inspection_is_entry_order_independent_and_checks_relationship_targets`、`sparse_explicit_implicit_cell_rows_ignore_dimension`、`strict_xml_rejects_utf8_dtd_entities_duplicate_attributes_and_unsafe_scalars`、`parsed_workbook_cannot_exceed_inspected_names_or_span`。実ledger eventsで途中commit0・逆順releaseを観測する。
  ```js
  assert.equal(commitsBeforeAllReservations, 0)
  assert.equal(ledger.snapshot().categories.every(x=>x.reserved===0), true)
  assert.deepEqual(inspection.sheets.map(x=>x.rowSpan), [102]) // r=100 + implicit 2
  assert.equal(header0.totalRows,102)
  assert.equal(header1.totalRows,101)
  assert.throws(()=>assertParsedXlsxWorkbookWithinBudget([{sheet:'Unknown',data:[]}],inspection))
  ```
- [ ] **Step 2: REDを観測する。** Pでcompile後`node --test test/workbookBudget.test.js test/xlsxWorkbookBudget.test.js`。Expected: helper/module不在。
- [ ] **Step 3: helper/scannerを実装する。** 全sheet/countをsafeに列挙→sheet/row leaf reservations→最終取消確認→awaitなし全commit。失敗は未commit群逆順release、最初のthrow値を保持する。targetはordinal/digestで生成し、過去commitは巻き戻さない。fatal UTF-8、宣言/tag/quote/attribute/entityの検証、コメント/CDATA/PI、positive safe decimal row r・implicit increment・cell referenceを処理する。workbook/rels/worksheetをentry順に依存せず結び、ID/type/external/重複part/relative target escape等を拒否。候補XML失敗は必要part決定まで延期し、無関係partのfailureを新拒否理由にしない。decoded bytesは保持せず構造だけ残す。runtime inventoryを最終14/46/42へ更新する。
- [ ] **Step 4: GREENと全境界を確認する。** Step2＋Task1 tests。defaults/maxそれぞれsheet20/100・total100/1,000、rows500/5,000・total25,000/250,000のexact/+1、0、safe overflow、後半超過、generator途中throw、commit直前cancel、既committed群保持を確認する。duplicate/unknown parsed sheet・full span+1拒否、少ないsheet/row許可、header0/1、worksheet先頭/逆順、dimension無視、malformed referenced/unreferenced partsを区別する。
- [ ] **Step 5: Task2 pathsだけをcommitする。** `feat: reserve inspected workbook budgets atomically`。public helperのdata accountingをfilesystem検証tokenと扱わないことを記録する。

## Task 3: OOXML一pass接続・最終exports・実package配布

**Files:** Modify P:`src/documentBudget.ts`, `src/ooxmlParserInput.ts`, `src/validatedOoxml.ts`, `src/index.ts`, `test/documentAdmission.test.js`, `test/ooxmlParserInput.test.js`, `test/boundedZipRetention.test.js`, `test/packageContract.test.js`, `test/boundedDocumentPackaging.test.js`, `test/processingBudgetContracts.test.js`, `test/extensionIntegrationContract.test.js`, `test/fixtures/workflow-register-consumer.ts`, `test/fixtures/bob-bazaar-review-consumer.ts`, `test/fixtures/bob-code-consistency-review-consumer.ts`, `README.md`。Create P:`test/aggregateIntegrationContract.test.js`。B/C:`src/sharedProcessingBudgetRuntime.ts`をModifyする。既存lock/compiler/build ownershipは不変。

**Interfaces:**
- `DocumentOoxmlOptions={structuralLimits:OoxmlStructuralLimits;loadXlsxCodec:()=>Promise<XlsxZipCodec>} & ({documentKind:'docx'}|{documentKind:'xlsx';xlsxBudget:{headerRows:0|1}})`。
- `BudgetedOoxmlParserInput=Omit<ValidatedOoxmlParserInput,'documentKind'> & ({documentKind:'docx'}|{documentKind:'xlsx';readonly workbookInspection:XlsxWorkbookInspection})`。
- 最終`DocumentOperation extends DocumentOperationBase`に`withValidatedOoxml<T>(admission:DocumentAdmission,options:DocumentOoxmlOptions,parse:(input:BudgetedOoxmlParserInput)=>Promise<T>):Promise<T>`を加え、`createDocumentOperation(input:DocumentOperationInput):DocumentOperation`とする。
- rootはoperation/base/input/selection/admission、取消guard、三つのworkbook public helpersと関連typesだけを既存exportsへ追加する。subpathは通常callback/typesとBudgetedOoxmlParserInputをexport。normal T14 callback3fieldsは不変。facadeはこれらをexplicit namedで同じcopied runtimeから再exportし、`SharedProcessingBudgetLimits=Runtime.ProcessingBudgetLimits`もtype exportする。

- [ ] **Step 1: failing testsを書く。** `admitted_ooxml_reread_charges_raw_once_without_skipping_verification`、`worksheet_observer_runs_after_crc_once_per_entry_without_retaining_buffers`、`all_workbook_budgets_commit_before_parser_and_codec_results_are_adopted`、`parser_failure_keeps_admitted_usage_and_normal_t14_failure_releases_raw`、`packed_aggregate_api_has_exact_46_paths_and_no_deep_import`。load/parse/inflate countersとactual tarballを使う。
  ```js
  assert.deepEqual(rawCommittedAfterTwoPhysicalReads,[C,C,C])
  assert.deepEqual([inflateCalls,observedEntries],[deflatedEntryCount,allEntryCount])
  assert.equal(parserLoadsOnInvalidWorkbook + parserCallsOnBudgetFailure,0)
  assert.deepEqual([packageFiles.length,compiledFiles.length],[46,42])
  assert.equal(installedProductionDependencies,0)
  ```
- [ ] **Step 2: REDを観測する。** Pでcompile後`node --test test/aggregateIntegrationContract.test.js test/documentAdmission.test.js test/packageContract.test.js`。Expected: missing budgeted method/exportまたは旧40paths。
- [ ] **Step 3: 同ownerにbudgeted経路を接続する。** normal prepare coreにprivate observerを渡し、decodeEntryが長さ/消費/CRC検証した直後だけobserveする。全entry/必要XML成功後にfinish→atomic workbook commit→lazy codec/parse。再inflate pass、全worksheet Buffer cache、public skip flagを作らない。通常normalization/Buffer identityを維持し、cancelをawait codec/parse後・materialization検査前・post-check前後・結果採用前に再確認する。先行Error/typed failureをcatchでarchive errorに誤変換しない。facadeのrequiredApis/closed import graphを新二moduleへ明示拡張し、runtime purityのT13範囲を広い除外で緩めない。
- [ ] **Step 4: GREEN・実offline consumersを確認する。** Pで`npm test`と`npm run boundary:policy`（consumer境界変更はTask6で最終化）。既存pack/install helperでfresh rootへ実npm pack→tarballだけoffline install、3type consumers、root/subpath runtime、deep import拒否、46paths/42compiled、旧API保持を確認する。copy/buildのstale/alias/concurrency試験とTask1/2/T14 parityを実行する。C10/E245MiB・60MiB entryの受理と250MiB+1/5,001entry拒否を保持する。境界policyが新consumer未接続で失敗する場合はTask6未完として保存し、passにしない。
- [ ] **Step 5: Task3 pathsだけをcommitする。** `feat: expose budgeted OOXML operations from one runtime`。parser locks/source-fixed identitiesとdefinition/core bytes不変をEへ結ぶ。

## Task 4: Bazaar一操作admission・dedup・signal互換

**Files:** Modify B:`src/sharedProcessingBudgetRuntime.ts`, `src/ruleAuthoring/ruleSourceHash.ts`, `src/ruleAuthoring/extraction/documentExtractor.ts`, `src/ruleAuthoring/extraction/ooxmlArchive.ts`, `src/ruleAuthoring/extraction/docxExtractor.ts`, `src/ruleAuthoring/extraction/xlsxExtractor.ts`, `test/ruleDocumentExtraction.test.js`, `test/ruleSourceHash.test.js`, `test/ruleXlsxExtraction.test.js`, `test/ruleBoundedOoxmlExtraction.test.js`, `test/ruleAuthoringHeavyDependencyLoading.test.js`。Create B:`test/ruleDocumentAggregateBudget.test.js`, `test/ruleDocumentSignalCompatibility.test.js`, `test/ooxmlPreCancelled.test.js`。GUI/manifest/locator/public limits/schemaは不変。

**Interfaces:** facadeに`createRuleDocumentOperation(count:number,limits:RuleAuthoringLimits,signal?:AbortSignal):DocumentOperation`。`RuleDocumentExtractionRequest`へ`signal?:AbortSignal`、batchは`extractRuleDocuments(requests:readonly RuleDocumentExtractionRequest[],existingManifest:RuleSourceManifestV1|undefined,limits:RuleAuthoringLimits=DEFAULT_RULE_AUTHORING_LIMITS,options?:{signal?:AbortSignal}):Promise<RuleDocumentBatchResult>`とし既存3引数の順序を保つ。`fingerprintSource(filePath,options:{maximumBytes:number;rootPath:string;signal?:AbortSignal}):Promise<SourceFingerprint>`の既存呼出しを保つ。internal contextにoperation/admission/selectionIndex/effective signalを持つ。

`withRuleOoxmlParserInput`の旧6引数経路は通常T14用に維持し、第6contextへunion `{rootPath:string;target:string;operation?:never;admission?:never}`または`{rootPath:string;target:string;operation:DocumentOperation;admission:DocumentAdmission}`を受ける。budgeted branchのcallbackはBudgetedOoxmlParserInputを受け、旧callback型とのoverloadを定義する。製品coordinatorは必ずbudgeted branch。`DocxExtractionContext`へ`signal?`、`XlsxExtractionContext`へ`signal?;workbookInspection?:XlsxWorkbookInspection`を追加し、coordinatorのXLSXはinspection必須で渡す。

- [ ] **Step 1: failing testsを書く。** `batch_reserves_all_twenty_before_any_path_or_fingerprint`、`twenty_one_rejects_even_if_duplicates`、`duplicate_and_existing_manifest_selections_charge_raw_before_canonical_parse`、`raw_exact_and_plus_one_preserve_25_and_100_mib_caps`、`batch_preparation_settles_in_order_without_owned_siblings_after_failure`、`single_and_batch_signal_precedence_preserves_nested_pdf_options`、`xlsx_full_span_budget_precedes_import_and_keeps_locators`。
  ```js
  assert.equal(ioCallsWhenCountIs21,0)
  assert.deepEqual([logicalCount,rawCommitted,canonicalParserCalls],[2,2*C,1])
  assert.deepEqual(dedupManifestAndLocators,currentMainExpected)
  assert.equal(activeOwnedPreparationsAfterReject,0)
  assert.strictEqual(signalPassedToPdf,batchSignal)
  ```
- [ ] **Step 2: REDを観測する。** Bで既存lockから`npm ci --ignore-scripts --no-audit --no-fund`→`npm run compile`→`node --test test/ruleDocumentAggregateBudget.test.js test/ruleDocumentSignalCompatibility.test.js test/ooxmlPreCancelled.test.js`。Expected: operation/signal/pre-parser予算未接続。
- [ ] **Step 3: mapping/entry/coordinatorを実装する。** profileはcount=有効maxSourceFiles、total_document=有効aggregate、single=min(有効source,aggregate)、operation=max(total_document,既定64MiB)とし、他カテゴリはT13 defaults。public source<=25MiB/count<=20/aggregate<=100MiBを先にclosed検証する。sourceがpublic leaf内でlower aggregateにだけ反する場合はaggregate categoryでfatalとする。全effective signalsをI/O前に確認し、count確保→入力順fingerprint admission→既存canonical sort/dedup/sourceId→canonicalだけOOXML、PDF/legacyはexternal verifyへ渡す。single=`request.signal ?? pdf.signal`、batch=`options.signal ?? request.signal ?? pdf.signal`、未選択signalを結合しない。外部file rootと全PDF optionsを保持する。docx/xlsxはimport前後・parser後・結果採用前にguard、XLSXはheader0/full span検証。通常FP helperはpostcheck用途でもprivate ledgerのままでoperation rawを増やさない。
- [ ] **Step 4: GREENとB全testsを実行する。** Step2 testsと`npm test`、Task3のcopy契約。pre-cancelでread/codec/parser0、import/parser await後の取消・同一Error reason・非Error reason、取消とparser failure競合を試験する。legacy requires_conversion、PDF nested signal、同path/既存manifest dedup、source IDs/order/diagnostics/GUI queue回復、25/100MiB境界、全sheet/span拒否と有効locator parityを確認する。
- [ ] **Step 5: Task4 pathsだけをcommitする。** `feat: enforce aggregate budgets across rule documents`。raw/countとcanonical workbook会計の差をreceiptへ記録する。

## Task 5: CCR direct/pipeline context・全sheet・fatal分類

**Files:** Modify C:`src/sharedProcessingBudgetRuntime.ts`, `src/analyzers/documentExtractor.ts`, `src/analyzers/documentDocxExtractor.ts`, `src/analyzers/documentXlsxExtractor.ts`, `src/core/pipeline.ts`, `src/core/reviewInputValidator.ts`, `test/documentExtraction.test.js`, `test/documentBoundedInput.test.js`, `test/sizeLimits.test.js`, `test/heavyDependencyLoading.test.js`。Create C:`test/documentAggregateBudget.test.js`, `test/pipelineDocumentCancellation.test.js`, `test/documentXlsxCancellationOrder.test.js`。`core/limits.ts`の公開上限/既存GUI settingsは不変。

**Interfaces:** facadeに`createReviewDocumentOperation(count:number,limits:ReviewProcessingLimits,processingBudgetLimits?:Readonly<Partial<SharedProcessingBudgetLimits>>,signal?:AbortSignal):DocumentOperation`。extractorにexport `countDocumentSelections(reviewInput:ReviewInput):number`（全artifact arraysのtruthy path参照数）と`DocumentExtractionOptions={workspaceRoot:string;textEncoding?:string;limits?:Partial<ReviewProcessingLimits>;signal?:AbortSignal;processingBudgetLimits?:Readonly<Partial<SharedProcessingBudgetLimits>>;operation?:DocumentOperation}`。`extractDocuments(reviewInput,options:DocumentExtractionOptions)`は戻り型不変。

`PreprocessReviewInput`へ`processingBudgetLimits?`を追加。provided operationはcount/profile一致を要求し、profile overrideとの同時指定は正規化後の一致だけ許す。不一致をcontent/path I/O前に拒否する。`extractXlsxChunks`は既存6引数＋任意第7`{signal?:AbortSignal;workbookInspection?:XlsxWorkbookInspection}`、`extractDocxChunks`は既存引数＋任意末尾`{signal?:AbortSignal}`を追加する。coordinatorはXLSX inspectionとheader1を必ず渡す。

現行`validateReviewInput`はschema後にartifact path解決/存在確認も行うため、その完了後のcountではSpecの先行予約を満たさない。実装上の分割として、既存4引数/戻り値を保ち任意第5`options?:{signal?:AbortSignal;beforeArtifactPaths?:(reviewInput:ReviewInput)=>void}`を加える。schema/既存500-reference cap成功→取消確認→同期beforeArtifactPaths→既存path検証の順とし、pipelineはhookでcontextを一度だけ作る。呼出し成功後は完全検証済みreviewInputと同contextをcollectGitDiff/抽出へ渡す。hookは検証省略やcaller inspectionを許す入口ではなく、失敗時はpath処理へ進まない。既存利用者はhookなしで同じ検証結果を得る。reviewInput自体のread会計をT15へ追加しない。

- [ ] **Step 1: failing testsを書く。** `all_artifact_selections_count_before_resolve_even_after_excerpt_exhaustion`、`fifty_mib_public_leaf_is_not_implicitly_cut_to_32`、`lower_aggregate_override_remains_fatal_not_single_source_warning`、`all_declared_sheets_are_budgeted_before_selected_sheet_filter`、`pipeline_pre_cancel_precedes_validation_and_document_context_precedes_git_diff`、`pipeline_count_precedes_reference_path_resolution_and_exists_checks`、`validator_without_hook_preserves_existing_schema_path_and_500_reference_errors`、`import_and_parser_await_cancellation_precedes_materialization_checks`、`ordinary_warning_and_typed_fatal_failures_keep_existing_document_ids`。
  ```js
  assert.equal(context.profile.limits.total_document_bytes,50*1048576)
  assert.equal(context.profile.limits.total_operation_input_bytes,64*1048576)
  assert.equal(resolveCallsWhenCountExceeded + gitDiffCallsWhenPreCancelled,0)
  assert.equal(parserLoadsForUnselectedOversizeSheet,0)
  assert.strictEqual(caughtCancellation,reason)
  assert.equal(ordinaryFailureResult.warnings.length>0,true)
  ```
- [ ] **Step 2: REDを観測する。** Cで既存lockから`npm ci --ignore-scripts --no-audit --no-fund`→compile→`node --test test/documentAggregateBudget.test.js test/pipelineDocumentCancellation.test.js test/documentXlsxCancellationOrder.test.js`。Expected: per-file ledger/cancellation relay未接続。
- [ ] **Step 3: profile/contextとconsumerを実装する。** explicit total_document overrideなしならmax(public leaf,32MiB)、operation overrideなしならmax(total_document,64MiB)、total_sheets overrideなしならmax(public workbook,100)、total_rows overrideなしならmax(public row,25,000)。explicit lower aggregateを認め、localはmin(public local,明示local overrideまたはpublic local,aggregate)とし、残りの明示13category overridesもclosed検証して保持する。絶対上限/全13不等式はT13で検証する。full countをcommitしてからpath解決、MarkdownはreadSelection一回、OOXMLはFP admission→budgeted callback。pipeline入口pre-cancel→reviewInput schema/500cap→hookでcount/context→参照path検証→collectGitDiff、抽出へ同context/signalを渡す。artifact pathなし/非配列warning、既存excerpt早期打切り/ID/空行header/locatorsを保つ。aggregate/workbook safety/source change/cleanup/kind/cancelはcatchで再throw、single_documentだけの既存oversize・ordinary unsupported/parser failureはwarningを維持する。取消はcatchでも再確認し、非取消のundefined/null/0をtruthinessで失わない。
- [ ] **Step 4: GREENとC全testsを実行する。** Step2＋`npm test`。duplicate path/count1024/+1、default/max・aggregate低値・50MiB boundary、header1/fullspan、selected/unselected sheets、sparse location parity、直接/提供contextの一致拒否、取消reasonとordinary failure競合、source post-check/closeのfatal、既存excerpt clippingを確認する。pipelineのdiff/input readをT16会計へ便乗接続しない。
- [ ] **Step 5: Task5 pathsだけをcommitする。** `feat: share document budgets through consistency preprocessing`。pipelineとdirect contextの所有権/検証順をEへ記録する。

## Task 6: 両consumerの閉じた境界・cross-consumer契約

**Files:** Modify P:`scripts/check-document-boundary.js`, `test/extensionIntegrationContract.test.js`, `test/aggregateIntegrationContract.test.js`, `test/processingBudgetContracts.test.js`、B/C:`test/dependencyPolicy.test.js`。必要な実装修正はTasks1–5 pathsだけとする。

**Interfaces:** 既存`checkDocumentBoundaries(repositoryRoot:string)`の引数/CLIは保持。AST policyにliteralなoperation callback/callerの形を追加し、既存discoveryの通常T14入口は保持する。runtime/deep import/parser alias/任意Buffer/path/未await callback/inspection forgeを許可しない。

- [ ] **Step 1: failing integration/policy testsを書く。** `coordinators_use_budgeted_operations_and_xlsx_inspection_before_parser`、`ast_policy_rejects_unawaited_member_callback_and_arbitrary_inspection`、`legacy_discovery_keeps_normal_t14_owner_without_aggregate_scope_creep`、`two_consumers_keep_reason_identity_and_original_valid_output`。synthetic source mutationでmember-call alias・callback外parser・new deep importを個別に拒否する。
  ```js
  assert.equal(preParserBudgetChecks,2)
  assert.equal(arbitraryInspectionAccepted,false)
  assert.deepEqual(validDocumentOutput,acceptedT14Expected)
  assert.equal(definitionAndParserLockBytesChanged,false)
  ```
- [ ] **Step 2: REDを観測する。** Pでcompile後`node --test test/extensionIntegrationContract.test.js test/aggregateIntegrationContract.test.js`と`npm run boundary:policy`。Expected: 新member-call/cancel/workbook契約未対応。policyを無効化してpassさせない。
- [ ] **Step 3: literal AST/import graphを更新する。** Pのprivate modules/export allowlist、facade required APIs、coordinatorのawait operation method、parserのBuffer/inspection/guard順を実形へ限定して検証する。T13 pure core scan・discovery通常API・4parser ownersの列挙を維持し、namespace/computed importやsource fallbackを増やさない。
- [ ] **Step 4: GREENを実行する。** Step2、P `npm test`、B/C `dependency:policy`/`architecture:policy`/`source:policy`。Task1–5の故障classが別consumerでも同じreason/usage意味を持ち、T14 callback/post-check/ZIP parityが維持されることを確認する。製品安全意味を変える新要求が出た場合だけ設計差分を利用者へ戻す。
- [ ] **Step 5: Task6 pathsと必要fixだけをcommitする。** `test: enforce aggregate parser ownership boundaries`。旧admissionが未sealの間のroot失敗はTask8未完として保持する。

## Task 7: T15実VSIX・隔離host・CIの接続

**Files:** Create root:`scripts/t15-aggregate-installed-smoke.mjs`, `scripts/t15-aggregate-installed-extension-host.test.js`, `scripts/t15-aggregate-installed-smoke.test.mjs`。Modify `.github/workflows/processing-budget-runtime.yml`, `scripts/processing-runtime-build-workflow.test.js`, `scripts/exact-head-ci-contract.test.js`, `scripts/extension-host-smoke-contract.test.js`, `scripts/three-extension-ui-contract-workflow.test.js`。既存T14 installed scripts3filesのbytes/583parser期待値は保持する。quality/scaffold workflowsの既存shared prep順と18job集合は変更しない。

**Interfaces:** new runnerの`createArtifactManifest(sourceRoot:string,evidenceParent:string):Promise<string>`、`validateArtifactManifest(manifest:unknown):Promise<ValidatedArtifactManifest>`、`runInstalledSmoke(manifestPath:string,evidenceRoot:string):Promise<InstalledSmokeReceipt>`、CLI `--artifacts <absolute manifest> --evidence-root <new absolute root>`を既存T14同様に固定する。T15 artifact schema=`bob-builtin-analyze/t15-installed-artifacts/v1`、receipt=`bob-builtin-analyze/t15-installed-smoke/v1`。closed manifest fieldsは`schemaVersion,sourceHeadSha,sourceTreeSha,compiledModules,extensions,fixtures`。42compiled/28loaded runtime/8parser bindings、各B/C14JS+manifestを検証する。

`ValidatedArtifactManifest`は既存T14と同じ`{manifest,compiled,archives,fixtures}`で、compiledは42ByteBindings、archivesは`{archive:Awaited<ReturnType<typeof validateVsixArchive>>,digest:string,parsers:ReturnType<typeof expectedParserIdentities>}`の2要素、fixturesは`{name:string,bytes:Buffer,binding:ByteBinding}`の8要素。`InstalledSmokeReceipt`のclosed fieldsは`schemaVersion,state,sourceHeadSha,sourceTreeSha,os,developmentPayloadFiles,shippedRuntimeFilesPerExtension,artifactManifest,hostReceipt,hostExit,cases,loadedModules,parserIdentities,productActivationProbe,productDeactivationProbe,failure`。stateはpassed/failed、数は42/14、artifactManifestはByteBinding、hostReceiptはByteBinding|null、hostExitはnumber|null、casesは固定17name/stateの配列、loadedModulesは`{extensionId,moduleName,...ByteBinding}`、parserIdentitiesは`{extensionId,name,version,integrity,specifier,relativePath,...ByteBinding}`。両activation probesはnot_run、failureはnullまたは固定512UTF8以内の診断とする。失敗receiptも実際に取得したfieldsだけを保存し、未取得配列は空として成功検証から排除する。

parser期待値はread-only importした既存`expectedParserIdentities(id)`を使用し、caller期待値を受けない。既存hostのexport済みphysical-path/parser/GUI probeだけを再利用し、旧9caseを新probeでも実行する。fixtureは旧5names＋`legacy.doc`,`sparse.xlsx`,`unselected-over-budget.xlsx`の8files。

- [ ] **Step 1: failing artifact/workflow testsを書く。** `t15_artifacts_require_42_compiled_and_same_28_runtime_bytes`、`t15_smoke_rejects_resigned_parser_changed_runtime_wrong_head_and_repo_fallback`、`workflow_builds_before_host_tooling_and_runs_t15_on_both_os`、`t15_receipt_requires_all_seventeen_cases_and_actual_host_exit`。旧T14 synthetic12module manifestは旧validatorで引き続き検証する。
  ```js
  assert.deepEqual([compiledModules.length,loadedModules.length,loadedParsers.length],[42,28,8])
  assert.equal(requiredCases.length,17)
  assert.equal(hostExit,0)
  assert.equal(loadedModules.every(x=>x.path.startsWith(installedExtensionRoot)),true)
  ```
- [ ] **Step 2: REDを観測する。** rootで`node --test scripts/t15-aggregate-installed-smoke.test.mjs scripts/processing-runtime-build-workflow.test.js scripts/exact-head-ci-contract.test.js`。Expected: T15 harness/current14module契約未接続。
- [ ] **Step 3: runner/probe/workflowを実装する。** 実VSIXをhash/size/CRC/containmentで検証→fresh isolated install/profile→pinned VS Code1.106.1で同じhashをloadする。source parser583files/actual entry resolution/extension ids/versionを照合する。processing workflowはT15の8fixture/42module manifestとhostに置換し、T14契約testsも保持。path filtersへnew scripts/admission/coverageをliteral追加し、Ubuntuはxvfb-run、Windowsは同runner、artifact名`t15-aggregate-${matrix.os}`、source package artifactも保持する。既存head guard/nonce/event/attempt/upload pinsを維持する。
- [ ] **Step 4: GREENと実Windows hostを実行する。** Step2＋旧T14 harness契約、extension-host/three-extension/workflow契約を実行する。B/C実package→各package:policy、B package:smoke、P実tarball46paths/3typed consumersとVSIX hashを結ぶ。new createArtifactManifestへ実source root/Eのfresh parentを渡して得たmanifestを使い、rootで`node scripts/t15-aggregate-installed-smoke.mjs --artifacts <実manifest絶対path> --evidence-root <E内の未作成host絶対path>`を実行する。Expected: exit0/state passed/hostExit0、両拡張に束縛されたruntime28/parser8、固定17caseすべてpassed。new probeは旧9caseに`document_count_rejected_before_io`,`raw_aggregate_counts_duplicate_selections`,`pre_cancelled_document_has_no_parser`,`sparse_xlsx_rejected_before_parser`,`unselected_sheet_budget_is_enforced`,`parser_await_cancellation_discards_result`,`ordinary_failure_warns_and_aggregate_failure_throws`,`source_admission_raw_is_charged_once`を加える。公開抽出API・実parserを使い、parser制御のunit mock成功をhost成功に代用しない。await取消は実parser Promise境界へのtest-onlyラップでcancelを差し込み、本体module/hashを置換しない。ローカルUbuntu未実行を成功とせずTask10 actualCIで確認する。
- [ ] **Step 5: Task7 pathsだけをcommitする。** `ci: verify aggregate budgets in installed companion artifacts`。VSIX上限超過や既存Workflow79対象変更が必要な場合は、現物bytes/候補検証を整えてその変更だけ別確認する。上限/対象を黙って緩めない。

## Task 8: 30出典coverage・T15 literal current admission

**Files:** Create R:`aggregateDocumentAdmissionPolicy.mjs`, `aggregate-document-source-admission.json`, `test/aggregateDocumentAdmissionPolicy.test.mjs`, `test/helpers/aggregateAdmissionFixture.mjs`、`docs/release-evidence/proc-t15-aggregate-source-coverage-2026-10-26.json`。Modify R:`gateRMainAdmissionPolicy.mjs`, `processingBudgetAdmissionPolicy.mjs`, `test/gateRMainAdmissionPolicy.test.mjs`, `test/processingBudgetAdmissionPolicy.test.mjs`, `test/boundedDocumentAdmissionPolicy.test.mjs`、`.gitattributes`。T14 policy/admission/coverage/completion、T13/Owner/Discovery immutable JSONと既存T14 installed scriptsはbytes不変。

**Interfaces:** `validateAggregateDocumentCoverage(input:unknown):true`、`validateAggregateDocumentSourceAdmission(input:unknown):true`、`applyAggregateDocumentSourceAdmission(input:unknown,options:{domain:'gate_r_shipping'|'processing_budget';baseFiles:readonly PathRow[]}):PathRow[]`、`validateAggregateDocumentRepository(repositoryRoot?:string):void`。T15 layerのbeforeはM2のT14 current projections、afterはTasks1–7＋本Taskのliteral source/control/document rows。旧getterから`gateRBoundedDocumentMainFiles()`/`processingBudgetT14SourceFiles()`を独立名で保存し、新current gettersだけT15 applyを重ねる。

新validatorはT14のliteral coverage/admission/歴史raw bindingsをそのまま検証し、T14 after→T15 before/afterの連鎖・working/index・全package inventory・二domain unionを閉じて検証する。新moduleはT14 policy/contained-file helpersにだけ依存し、gateR/processing policyを逆importしない。古い`validateBoundedDocumentRepository`はstrict T14 snapshot validatorのまま保持する。旧projection assertionsは新設のT14 gettersへ対応させ、旧repository testsはM2の選別pathsだけを`git show M2:path`のraw bytesでmaterializeしたhermetic fixtureへ移す。new helper `createT14AdmissionFixture(parent:string):{root:string,git:(...args:string[])=>string}`が旧admission rows/歴史bindingsに限って生成・stageし、保護領域をcheckoutしない。新current-root検証はT15 testsが担当し、旧drift/alias/未知payload試験を削らない。

- [ ] **Step 1: failing admission testsを書く。** `exact_30_items_and_complete_675_partition_preserve_owner_origins`、`t15_layer_requires_exact_t14_before_and_separate_domains`、`current_union_rejects_unknown_alias_working_index_drift`、`old_t13_t14_historical_validators_and_raw_bindings_remain_strict`、`future_completion_and_current_coverage_are_literal_lf`。
  ```js
  assert.deepEqual([coverage.items.length,coverage.remainderClosure.total,coverage.remainderClosure.unassigned],[30,675,0])
  assert.equal(new Set(coverage.items.map(x=>x.origin.blobSha)).size,23)
  assert.equal(processingBudgetT13SourceFiles().length,28)
  assert.equal(owner57RawSha256,'1665c66acd04a535b08116e639f5119b98e03609d9bb4d5f8efacc9bba37b5a4')
  assert.deepEqual(statusBeforeMetadata,[14,12,'PROC-T15-AGGREGATE'])
  ```
- [ ] **Step 2: REDを観測する。** rootで`node --test tools/main-consolidation/test/aggregateDocumentAdmissionPolicy.test.mjs`。Expected: T15 layer/coverage不在。旧current==T14のassertion失敗を歴史fixtureへ移す前に保存する。
- [ ] **Step 3: coverage/projection/sealを実装する。** Spec付録A30IDs/25paths/23blobsをarchive raw bytesで再照合し、各itemを最終実装とnamed testsへ結ぶ。archive expanded E会計の非継承・current owner/admission/XML/CIの追加前提を明記する。literal before/after blob、2domain exact scopes、current全package inventory、sealed controlsを固定する。coverage/将来completionにsource段階でLF rulesを追加し、旧completion14refs/subject/raw/hashは触らない。self-seal循環を避け、policy/admission own-controlのindex/workingと定数bindingは既存T14方式を踏襲する。
- [ ] **Step 4: stageしたsource treeでGREENを実行する。** Task8＋Tasks1–7 literal changed pathsだけstageしてindex/workingを一致させ、新admission・old processing/bounded/GateR tests・root必須4・4生成器--checkを実行する。新path/alias/wrong domain/before/after/working/index改変をfixtureで拒否し、M2 fixture上の旧T14 validatorもGREEN。unknown file許可のためのscan縮小をしない。未stageとの差を成功とせず、最終sealが検証indexに一致したことを記録する。
- [ ] **Step 5: Task8 pathsと最終seal差分だけをcommitする。** `chore: admit aggregate document source with historical seals`。source universe/static program indexは不変とし、source13/20完了を先取りしない。

## Task 9: full local品質・一度のsource review・候補固定

**Files:** Eにquality receipts/source manifest/review/fix/CANDIDATEを作る。新しい製品機能や無関係pathを追加しない。C/I fixはTasks1–8 paths、seal/coverageを必要に応じ更新する。

**Interfaces:** review immutable range=`M2..sourceCandidateHead`、実index tree=commit tree、各receiptはcommand/exit/count/head/tree/output/actual artifact bindingを持つ。source review一度、C/I TDD一回、再reviewなし。

- [ ] **Step 1: task evidenceと差分を照合する。** 全RED/GREEN・30/675/0・追加前提・literal diff・旧raw/blob・private/production0・parser versionsを集約する。設計/計画文書もsource candidate diffへ含める。scopeを変える新path/責任が必要なら、具体的差分を整えて設計境界だけ確認する。
- [ ] **Step 2: named local gatesを実行する。** P `npm test`/`boundary:policy`、B/Cのdependency:policy/architecture:policy/source:policy/unused:report/audit:prod/npm test/package/package:policy、B artifact:policy/package:smoke、Workflowの同named品質/test/package/package:policy、root必須4/4生成器、新旧admission、Gate R、Task7契約とWindows実hostを実行する。live audit失敗は現物原因を調査し、未実行/403をpassにしない。成功後は新変更/失敗/未解決懸念があるchecksだけ再実行する。
- [ ] **Step 3: source全体を一度fresh reviewする。** 最強の利用可能reviewerへimmutable diff/spec/planと証拠pathsだけ渡す。read-only、focusはlogical admissionとphysical再検証、group atomicity、XML/order/span、cancelとwarning分類、profile互換、単一owner/actual artifacts/historical admissions。
- [ ] **Step 4: C/Iを一回TDD fix passで処理する。** named RED→最小fix→GREEN/影響checks、または根拠付き反証を記録する。Minorはdefer、reviewerを再起動しない。指摘0なら不要な変更を作らない。seal/indexを更新しcandidate commitを固定する。
- [ ] **Step 5: concrete remote candidateを作る。** E/fresh-root/CANDIDATE.mdにrepository/branch/head/tree/全changed paths、C/I0/Minor、local receipts/実package/VSIX/17host cases、5workflow18rows、通常push→main PR→actualCI→全成功時normal merge→exact-mainCI→非force同期の影響を記載する。このcandidateに対応する新しいC承認を得てからremote操作へ進む。ここまでのlocal承認をpush承認へ転用しない。

## Task 10: source PR・実CI・accepted source観測

**Files:** Eのremote/CI/artifact/source-closure証拠のみ。製品diffを追加しない。candidateが変われば古いC承認を別headへ転用しない。

**Interfaces:** `sourceObservation.json`はschema=`bob-builtin-analyze/proc-t15-aggregate-completion/v1`。top-level closed keysは`schemaVersion,boundaryId,state,repository,sourceHeadSha,acceptedMainSha,acceptedTreeSha,mergeParents,pullRequestNumber,source,aggregateDocument,ci,packages,installedUat,activeRuntime,review,local,preservation,externalEvidence,runtimeActivation,automaticCleanup,mutationAuthority,finalProgramUat,limits`。

`aggregateDocument`は`contracts,selectionAdmission,rawAccounting,workbookAtomicity,xlsxInspection,cancellation,profileCompatibility,consumerParity,sourceFingerprints,packaging,crossPlatform`のByteBindings。sourceに30/675/0、M2 base、13categories、raw=`source_once_per_selection`/expanded=`structural_only`、46payload/42compiled/3type consumers/productionDeps0、28runtime+8parser bindings、coverage/admission/historical/追加前提、metadataIsNotSourceSubjectを持つ。実値・closed subordinate形は受入観測時に固定し、Task11 validatorで同じ値を検証する。

CIはmode=`actual_exact_head_success`/allRequiredGatesSucceeded=true/waiver=null、candidate/actualMainそれぞれ5workflow18rows、actual event/run/attempt/job/runner/checkout/nonce/log/artifact join。installedUatはisolated artifact host、各OS17casesと同hash VSIX/28runtime/8parserを持つ。packagesは3拡張id/version/source/tree/vsix/cap/headroom、B/Cにはcompiled/parser、Workflowには既存79compaction proofを結ぶ。source mainをS1、別metadata mainをM3と呼び、取り違えない。

- [ ] **Step 1: C承認とcandidate一致を確認して通常push/PRする。** primary/Owner57を照合し、branch/head/tree/diffが承認と一致してからpush、main向けPRを作りnative attach_artifactで必ず紐付ける。force/admin/bypassは使わない。
- [ ] **Step 2: candidate実CIを収集する。** required5workflow18rowsをexact headで確認し、missingだけ同SHA+32hex nonce dispatchする。PR18success、非PRのmetrics skip1だけ許す。actual runner/checkout/log/attemptとUbuntu/Windowsのactual tarball/VSIX/17case host/module/parser証拠をdownloadし、raw artifact size/digest/CRC/safe pathsと全positive bindingsを再hashする。失敗/未起動を成功へ変更しない。
- [ ] **Step 3: 全条件成立時normal mergeしS1実CIを確認する。** drift時はbase/diff/承認/CI subjectを再評価する。S1 parents/treeと承認candidate treeを照合し、main5workflow18rows=17success+metrics skip1と、S1をsubjectにした両OSactual artifactsを新規確認する。
- [ ] **Step 4: S1 closureと非force同期を行う。** accepted source WTをff-only、未checkout local mainを非force FFする。primary branch/head/status/untracked/Owner57不変を検証する。必要named gatesとsource/package/host joinsをS1へ束縛し、元runner filesystem capture検証と捕捉bytes portable replayを分ける。historyを別headへ偽装しない。
- [ ] **Step 5: sourceObservationをbyte-fixedにしてTask10をdoneにする。** 全positive external evidence/preservation manifestを再hashする。正式進捗は14refs/12of20/nextT15のまま。visual/live Bob/final Program UATとruntime activationを新artifact成功へ混同しない。

## Task 11: 別completion metadata・正式進捗・metadata受入

**Files:** S1基点の別managed worktree/branch=`codex/v2-processing-aggregate-completion`でCreate `docs/release-evidence/proc-t15-aggregate-completion-2026-10-26.json`、Modify R:`featureIntegrationStatusPolicy.mjs`, `create-feature-integration-status.mjs`, `test/featureIntegrationStatusPolicy.test.mjs`と`docs/release-evidence/feature-integration-status.json`の5pathsだけ。sourceLF/admission/coverageは変更しない。

**Interfaces:** completion JSONはTask10 sourceObservationの実bytesをそのままcopyする。status policyに`validateT15Completion(record)`を追加し、source C/S1/tree/parents/PR番号、closed facts/30items/675/0/13categories/原本一選択一回/workbook/cancel/46payload/42compiled/2VSIX/両OS17cases/actual CI/local/review/preservation joinsをliteralに検証する。COMPLETION_REGISTRYへ15番目、旧14refsとT13/T14 validators/hash/subjectsは不変。fixture `throughT15()`はsource S1をsubjectとする。

- [ ] **Step 1: 別metadata WTを作りsource proofを再検証する。** native list_artifactsで再利用を確認してS1からmanaged worktreeを作成し、返された実pathを使用する。sourceObservation/rawhash/全physical bindings/subjectを検証してcopyする。portable replayは元host access0、1byte drift/wrong artifact/wrong source/metadata subjectを拒否する。
- [ ] **Step 2: failing metadata testsを書く。** `through_t15_keeps_14_prefix_and_projects_13_of_20`、`foundation_requires_all_three_accepted_source_observations`、`t15_rejects_metadata_subject_waiver_wrong_artifact_and_missing_host_case`、`t15_portable_replay_has_no_original_host_access`、`t15_completion_literal_lf_survives_autocrlf_checkout`。
  ```js
  assert.deepEqual(status.completionReferences.slice(0,14),throughT14.completionReferences)
  assert.deepEqual([status.completionReferences.length,status.slices.filter(x=>x.state==='VERIFIED').length,status.nextSliceId],[15,13,'PROC-T16-INPUT-PROCESS'])
  assert.equal(status.boundaries.find(x=>x.id==='PROCESSING-FOUNDATION').state,'VERIFIED')
  assert.equal(status.slices.every(x=>x.observedActivationStatus==='inactive'),true)
  ```
- [ ] **Step 3: RED→status拡張→GREENを実行する。** 新testsがT15未対応でFAILすることを保存し、validator/dispatcher/generator入力末尾へT15を追加する。PROCESSING-FOUNDATIONはT13/T14/T15 source全受入を条件とし、throughT14のplanned判定を維持する。新/full status、root必須4/4生成器、新旧admission/P test/Gate R/diff --checkを実行し、5pathsだけ・source completion bytes不変・旧14prefix不変を確認する。
- [ ] **Step 4: metadata一度fresh review・C/I一回fix・具体的候補のC承認。** source reviewを繰り返さず、metadata diff/source closureのsubject/hash/portable replayをread-only独立reviewする。named RED/GREENでC/I処理、Minor記録後、commit/index treeを固定した新CANDIDATE.mdへhead/tree/5paths/品質/C/I0と通常push→PR→実CI→merge→main同期を記載し、この別candidateへの新しいC承認を得る。
- [ ] **Step 5: metadata通常push/PR/実CI/merge/main同期を行う。** PR attach、起動しないworkflowは同head+nonce dispatchする。candidate/mainとも実event別5workflow18rows=17success+非PR metrics skip1（PR metrics実行なら18success）を現物確認する。sourceS1 completion bytes/subjects不変、metadata M3 parents/tree/candidate tree一致を確認し、WT ff-only/未checkout local main非force FFを行う。
- [ ] **Step 6: 最終受入を記録する。** named local checks/全physical joins/preservationをM3で確認し、15refs/20slices/13verified/65%/nextT16、foundation VERIFIED、GateR15/five0/V2inactive、primary/Owner57/全proof/WT/profile保持をreceipt化する。actual artifact/OSで検証したhostだけPASSED、visual/live Bob/final Program UATはnot_runを維持。全11tasks doneをaggregate checkerで確認し、deferred minors/実行制限と出典・source/metadata両subjectをCOMPLETION.mdへ記録する。

## Verification commands / self-review map

root必須4：

```powershell
node --test scripts/exact-head-ci-contract.test.js tools/main-consolidation/test/featureIntegrationProgramPolicy.test.mjs tools/main-consolidation/test/featureIntegrationStatusPolicy.test.mjs tools/main-consolidation/test/featureSelectionLedgerPolicy.test.mjs
```

4生成器は既存`--check`を使い、古いimmutable sourceを出力修正のため再生成しない：

```powershell
node tools/main-consolidation/create-feature-integration-program-index.mjs --check
node tools/main-consolidation/create-feature-integration-status.mjs --check
node tools/main-consolidation/create-feature-selection-source-universe.mjs --check
node tools/main-consolidation/create-feature-selection-ledger.mjs --check
```

admission/Gate R：

```powershell
node --test tools/main-consolidation/test/aggregateDocumentAdmissionPolicy.test.mjs tools/main-consolidation/test/boundedDocumentAdmissionPolicy.test.mjs tools/main-consolidation/test/processingBudgetAdmissionPolicy.test.mjs tools/main-consolidation/test/gateRMainAdmissionPolicy.test.mjs
node tools/main-consolidation/run-gate-r.mjs --check
git diff --check
```

gate receiptsには実command/exit/count/subject/output bindingsを残す。必要checksが成功した後、理由なく全suiteを繰り返さない。WindowsのPOSIX専用skipは明記し、Ubuntuの実実行で補完する。actual host成功とunit/mock成功、portable再検証とrunner capture、sourceとmetadataを混同しない。

Spec coverage：§1/2/8→Tasks8–11、§3/4→Tasks1/3/4/5、§5→Tasks1/4/5、§6→Tasks2/3/4/5、§7→Tasks4–6、§8配布/実CI→Tasks3/7/9/10、§9→Tasks1–11のnamed tests、§10→全Taskのscope/承認境界、付録A→Task8。Review Focus5項目は対応Taskのnamed testsへ割当済み。

この文書は自己レビューでspec coverage/step granularity/type consistency/Review Focus/proportionを点検してから利用者へ提示する。計画レビュー完了まで製品実装・依存取得・新host起動・remote操作を開始しない。承認後は既存の主スレッド方式でTask1から実施する。
