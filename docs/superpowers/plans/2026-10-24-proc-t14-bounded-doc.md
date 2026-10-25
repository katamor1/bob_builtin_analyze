# PROC-T14-BOUNDED-DOC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 現行OOXML安全処理を共有ownerへ移し、2拡張の文書読取りをbounded Buffer/callbackへ接続し、sourceと別metadata受入後にmandatory進捗を12/20へ進める。

**Architecture:** T13台帳へ原本bytesを一度だけ予約し、shared ownerが同じhandleでread・ZIP検証・callback・解析後SHA照合・close・finalizeを管理する。parser/locator/GUIは拡張に残し、同じcompiled payloadを各VSIXへコピーする。M2を基点とするliteral deltaを既存admissionへ加え、歴史的source subjectと新しい受入観測を分離する。

**Tech Stack:** Node>=20（CI22）、TypeScript5.9.3、CommonJS ES2022/strict、Node test、既存fflate0.8.3・Mammoth/read-excel-file、実npm pack/VSIX、既存exact-head CIとGate R。

**Spec:** `docs/superpowers/specs/2026-10-24-proc-t14-bounded-doc-design.md`。承認済みcommit=`e94964e50216737b6218e3db4bfd3d2668991c32`、blob=`f935523a0ec8bb1d3c23dbd7a16b1f655570fd8e`、SHA256=`cc1baca80acc4352c035e3f2919f15c26a13db17d55bea8ba98a5f75bfb86728`。ユーザー回答「設計を承認して実装計画へ進む」をEへ記録する。

**Execution method:** 既承認の主スレッド方式を維持し、executing-plansを使用する。上の一般的なrecommended表記を方式変更の承認と解釈しない。

## Global Constraints

- 基準main M2=`0e806d48dfdd3136f47f36218b72fba1cfb4c4fd`、tree=`7623f90470a16145cdcb8d641959e18856820f67`。source作業は既存`C:/Users/stell/.codex/worktrees/v2-processing-bounded-doc/bob_builtin_analyze`、branch=`codex/v2-processing-bounded-doc`を使用する。設計/計画commitはこのbase上の文書差分として識別する。
- T14 ordinal12のみ。正式進捗はmetadataまで11/20（55%）/13refs/nextT14を維持し、受入後12/20（60%）/14refs/nextT15とする。static20、675分類、unassigned0、WORKFLOW-C-SAFE-PREFIX verified、PROCESSING-FOUNDATION plannedを維持する。
- 39 source items/38paths/36distinct archive blobs、全origin=`4d0fb728763db9d13c87d000790a88c45900733e`をSpec付録Aと照合する。source universe/selection ledger/archiveは書き換えない。
- MiB=1,048,576。13カテゴリとT13 profile/default/max/error9codesは不変。target<=256 UTF-8 bytes、internal generated error<=512 UTF-8 bytes、file/root path<=4,096 UTF-8 bytes、safe nonnegative整数。原本bytesだけをleafへ一回計上し、祖先の手動reserve・展開bytesの同leaf転用をしない。
- shared file hard cap50 MiB、Bazaar source25 MiB/batch100 MiB/20sources/chunk32 KiB、CCR source default5/max50 MiB。OOXMLは5,000entries/250 MiB expanded/32 MiB central-directoryを上限にする。新しい25/50 MiB entry capは作らない。CCR sheet20/100、row500/5,000、excerpt64 KiB/1 MiB、Bob input2/8 MiBを保持する。
- 単一文書ledger、原本予約はcallback/post-check/closeが成功するまでopen、失敗はrelease。fingerprint再読取りを論理入力へ重複加算しない。T15 aggregate/cancel orchestration、T16 process budgets、T17 deadline/native path、T18 report/handoff、PDF process置換は含めない。
- 通常OOXMLは元snapshot Buffer identity/再圧縮0、missing-both XLSXだけ最小styles補修、原本不変、malformed前parser/fflate load0。製品向けOOXML入口はawaitした`withValidatedOoxmlParserInput`だけとする。
- parser lockはBazaar read-excel-file9.3.1、CCR9.2.0、両方Mammoth1.12.0/Cheerio1.2.0を保持する。package production deps0、TS5.9.3/@types/node20.19.43/fflate0.8.3はexact dev deps、CCRは既存transitive同版fflate0.8.3を直接prod宣言する。拡張versionは変えない。
- 5 workflows/18契約行、PR18success、push/dispatch17success+PR専用metrics skip1。現行head guard・job IDs・nonce照合・attempt provenanceを保持し、起動前失敗/queued/403を成功とせず、旧CI免除を継承しない。
- VSIX capsはWorkflow1,200,000、Bazaar12,000,000、CCR11,000,000 bytes。Workflow source/deps/fixed compaction対象は変更しない。Gate R15/120s/3slots/1MiB、five effects0、V2 runtime inactive、R3–R5inactive/R6absentを保持する。
- 主スレッド実装を継続し、taskごとのimplementer/reviewerは増やさない。source全体と別metadataを各一度fresh review、C/Iは一回TDD fix pass、Minorはdeferする。レビュー済み具体的candidateができてからsource/metadataそれぞれ新しいC承認を得る。
- Local Bの範囲は以下のliteral files、隔離worktreeでの実装/検証/review/local commit、公開registry.npmjs.orgからのcredentialなしdependency read、既存pinのVS Code1.106.1/test-cli0.0.12/test-electron2.5.2取得と隔離host実行。compile中の暗黙install、publish、秘密情報取得、外部message送信は含めない。
- E=`<source worktree>/.superpowers/sdd/2026-10-24-proc-t14-bounded-doc/`。evidence/pack/install/cache/profilesはEのfresh root、CIはphysical runner.temp配下のfresh rootを使用し、absolute/realpathとsubjectをreceiptへ記録する。既存evidence/profile/artifactを上書き/cleanupしない。generated outだけは所有・path検証後にbuild更新する。
- primaryは`codex/bob-auto-response-probe`/`90f926e0045405625f1f40d20a41346a94d1981a`、15untrackedとOwner57 raw SHA256=`1665c66acd04a535b08116e639f5119b98e03609d9bb4d5f8efacc9bba37b5a4`を保持する。保護済み3領域の内容は読まない。switch/reset/stash/clean/force updateはせず、local mainは承認済み受入後だけ非checkout状態で非force FFする。

## Review Focus

1. 同size・mtime復元、named-path置換、callbackがBufferを変更する場合でも、保持handleと原本SHAを再検査し、検証前のparser結果を返さない（Task1/2）。
2. callbackが`undefined/null/0`をthrowする、close/releaseも失敗する場合、最初の失敗をtruthinessで失わず、commitせずopen reservationを残さない（Task1/2）。
3. 外部選択されたBazaar文書、CCRの設定/command override、discoveryの4入口で、誤ったworkspace制約やdefault32 MiB parentが正当な入力を狭めない（Task4/5/6）。
4. concurrent compile・stale module・copy symlink・別parser版で、共有物の混在やrepo/source fallbackが起きず、実tarball/実VSIXだけで動く（Task3/7）。
5. 古いOwner/Discovery/T13 hashを緩めたり、metadata SHAや別artifactをsource成功へ転用したりせず、portable replayでも元観測のbytes/subject/actual CIを照合する（Task8/10/11）。

## File Structure / decisions

以下の略記はliteral prefixである。`P=packages/processing-budget-runtime/`、`B=extensions/bob-bazaar-review/`、`C=extensions/bob-code-consistency-review/`、`R=tools/main-consolidation/`。括弧内の名前をwildcardの許可として解釈しない。各TaskのFilesだけをstageし、generated out/node_modules/VSIX/Eをcommitしない。

設計§4が委ねる小さな配置調整として、internal helpersもP/src直下に置く。これによりTSの同じcompiled bytesをflat copyでき、require/declaration/source-mapの書換えが不要になる。内部性はexports mapとimport policyで守り、製品へ低水準APIを公開しない。runtime moduleは既存5+新7の次の12個に固定する:

`generatedProcessingBudgetDefinition`, `processingBudgetError`, `processingBudgetProfile`, `processingBudgetLedger`, `index`, `boundedDocumentError`, `boundedDocumentRequest`, `boundedDocumentFile`, `boundedDocumentIo`, `ooxmlPreflight`, `ooxmlParserInput`, `validatedOoxml`。

package payloadはこの12module×js/d.ts/js.mapと既存4assets（package.json/README/definition/schema）の40paths。extension flat payloadは同じ36compiled filesと生成manifest.jsonとし、contract assetsはruntimeが読まないので複製しない。package rootは既存T13+bounded read/fingerprint/errorsをnamed exportし、`./validated-ooxml` subpathだけがcallback/typesをexportする。`./out/*`等のwildcard/deep exportは作らない。

型`PathRow={path:string,mode:'100644',blobSha:40hex}`、`ByteBinding={path:string,sha256:64hex,bytes:positiveSafeInteger}`を使う。空stdoutは直接positive bindingにせず、command/exit/byteLength0/hashを持つ非空receiptに束縛し、失敗ログ/旧attemptも保持する。

一文書profileは`single_document_bytes=L`、`total_document_bytes=max(L,DEFAULT_PROCESSING_BUDGET_PROFILE.limits.total_document_bytes)`、`total_operation_input_bytes=max(total_document_bytes,DEFAULT_PROCESSING_BUDGET_PROFILE.limits.total_operation_input_bytes)`とする。他10カテゴリは不変。現在のparent defaultは32/64MiBで、L=1byteでも未使用のraw_diff/excerpt/Bob既定値とのprofile不等式を壊さず、L=50MiBも受理できる。小さいLに合わせてparentを1byteへ下げたり、無関係categoryを0へ書き換えたりしない。fingerprint helper内と両product facadeの`createDocumentLedger(maximumFileBytes:number):ProcessingBudgetLedger`がこの同じ明示mappingを使う。

実行開始時にexecuting-plansのledgerをE/progress.mdへ作り、Taskごとにstart/base・RED/GREEN・判断・commit・doneを記録する。途中はfocused checksを使い、source全体のadmission sealはTask8で閉じる。未seal期間のroot admission失敗は予定された未完として記録し、gate成功に読み替えない。

## Task 1: bounded原本ownerとstrict request/error

**Files:** Create P:`src/boundedDocumentError.ts`, `src/boundedDocumentRequest.ts`, `src/boundedDocumentFile.ts`, `src/boundedDocumentIo.ts`, `test/boundedDocumentIo.test.js`, `test/boundedDocumentRuntime.test.js`, `test/helpers/boundedDocumentFixtures.js`。Modify P:`package.json`, `package-lock.json`, `test/helpers.js`, `test/processingBudgetContracts.test.js`。T13 definitions/profile/ledger/error実装は変更しない。

**Interfaces:**
- `BoundedDocumentIdentity={readonly byteSize:string,readonly mtimeNs:string,readonly device:string,readonly inode:string}`、`BoundedDocumentFingerprint=BoundedDocumentIdentity & {readonly sha256:string}`。
- `BoundedDocumentReadInput={filePath:string,rootPath:string,maximumFileBytes:number,target:string,ledger:ProcessingBudgetLedger,expectedFingerprint?:BoundedDocumentFingerprint,signal?:AbortSignal}`。
- `BoundedDocumentSnapshot={readonly byteLength:number,readonly sha256:string,readonly identity:BoundedDocumentIdentity,copyBytes():Buffer}`。
- `readBoundedDocumentFile(input:BoundedDocumentReadInput):Promise<BoundedDocumentSnapshot>`、`fingerprintBoundedDocumentFile(input:{filePath:string,rootPath:string,maximumFileBytes:number,signal?:AbortSignal}):Promise<BoundedDocumentFingerprint>`。
- private `withBoundedDocumentSnapshot<T>(input:BoundedDocumentReadInput,consume:(snapshot:{bytes:Buffer,fingerprint:BoundedDocumentFingerprint})=>Promise<T>):Promise<T>`。唯一file ownerでread/post-verify/close/reservation finalizationを管理する。fingerprint helperは独立ledgerとdigest targetを内部作成し、同じownerを使う。
- `BoundedDocumentError`のclosed codesは`bounded_document_input_invalid`, `bounded_document_source_invalid`, `bounded_document_source_changed`, `bounded_document_read_failed`, `bounded_document_archive_invalid`, `bounded_document_kind_mismatch`, `bounded_document_cancelled`, `bounded_document_cleanup_failed`。内部生成message<=512UTF8、detailsはphase/limit/observedの検証済み情報だけ。trusted callbackのthrowは元identityを保持し、T13 typed budget errorも保持する。
- test helperは`observeLedger(profile?)`、`committedTriple(ledger):[number,number,number]`、`openReservations(ledger):number`を定義する。実T13 ledgerのreservationを記録するtest-only subclass/wrapperでeventsとopen tokenを追い、会計自体をFakeLedgerへ代替しない。committedTripleはsingle/total/opのsnapshot committedを読む。

- [ ] **Step 1: failing testsを書く。** `bounded_read_reserves_before_content_io_and_commits_exact_bytes`、`oversize_growth_short_read_and_path_replacement_leave_zero_budget`、`request_getters_and_coercion_do_not_execute`、`snapshot_is_copy_only_and_frozen`、`close_failure_prevents_commit_and_preserves_first_thrown_value`、`one_byte_and_fifty_mib_profiles_preserve_all_13_category_inequalities`。実fs fixtureとNode mockでread/allocation/closeを観測する。
  ```js
  assert.equal(readCallsBeforeReserve + allocationsBeforeReserve, 0)
  assert.deepEqual(committedTriple(ledger), [sourceBytes, sourceBytes, sourceBytes])
  assert.equal(snapshot.copyBytes().equals(originalBytes), true)
  assert.equal(openReservations(ledger), 0)
  assert.equal(getterCalls + coercionCalls, 0)
  ```
- [ ] **Step 2: REDを捕捉する。** Pで`node --test test/boundedDocumentIo.test.js test/boundedDocumentRuntime.test.js`。Expected: 新out/API不在によるFAIL。fixture不足や構文errorを契約REDとして数えない。
- [ ] **Step 3: request/error/file ownerを実装する。** 必須maximumFileBytesはpositive safe integerで50MiBへclamp。root/fileを4,096UTF8、target256UTF8に制限し、closed own-data検証後だけtrusted ledger/signal capabilityへ触れる。symlink/nonregular/root escapeを拒否、一handleでBigInt stat→named identity→reserve→exact read→SHA/stat→consume→固定64KiB chunkのpost-SHA/stat/path検査→close成功→exact commitとする。失敗は一つの予約をreleaseし、finally close、先行throwの有無はbooleanで管理する。fingerprint helperのparent limitsはFile Structureの共通mappingを使い、物理再読取りを二重debitしない。
- [ ] **Step 4: GREENとT13回帰を実行する。** Pで公開registry用cacheをEへ設定し、`npm install --save-dev --save-exact --ignore-scripts --no-audit --no-fund @types/node@20.19.43 fflate@0.8.3`でlockを更新、`npm run compile`とStep2を実行する。既存T13 purity scanは純粋core4modulesを現物検証し、indexのnamed-export allowlistとT14全7modulesのclosed import/global graph検証を別に加える。無制限の新src除外は作らない。既存profile/ledger/definition試験を実行し全pass。unusual throw値/close失敗でcommitted/reserved0を確認する。
- [ ] **Step 5: Task1 pathsだけをcommitする。** `feat: add bounded document snapshot ownership`。初期のcurrent pack19-path testとroot admissionは後続更新前なので未完を記録し、成功とはしない。

## Task 2: current-main OOXML移設・mandatory callback・parity

**Files:** Create P:`src/ooxmlPreflight.ts`, `src/ooxmlParserInput.ts`, `src/validatedOoxml.ts`, `test/ooxmlParserInput.test.js`, `test/ooxmlMigrationParity.test.js`, `test/boundedArchiveInputLimit.test.js`, `test/boundedZipRetention.test.js`, `test/helpers/m2OoxmlBaseline.js`, `test/baseline/m2-ooxmlArchive.ts`, `test/baseline/m2-ooxmlPreflight.ts`, `test/baseline/m2-ruleSourceHash.ts`, `test/baseline/m2-ruleAuthoringLimits.ts`。Modify P:`test/helpers/boundedDocumentFixtures.js`, `test/boundedDocumentRuntime.test.js`。旧Bazaar ownerはまだ削除しない。

**Interfaces:** `OoxmlDocumentKind='docx'|'xlsx'`、`OoxmlStructuralLimits={maxEntries:number,maxExpandedBytes:number}`、`XlsxZipCodec={strToU8(text:string):Uint8Array,zipSync(entries:Record<string,Uint8Array>):Uint8Array}`。`ValidatedOoxmlParserRequest`はTask1 read inputのexpectedFingerprintを必須にし、documentKind/structuralLimits/loadXlsxCodecを追加する。`ValidatedOoxmlParserInput={readonly documentKind:OoxmlDocumentKind,readonly parserInput:Buffer,readonly normalization:'none'|'xlsx_minimal_styles'}`。`withValidatedOoxmlParserInput<T>(request,parse:(input:ValidatedOoxmlParserInput)=>Promise<T>):Promise<T>`はTask1 owner内でZIP検証とparseを行い、post-check/finalize前に結果を外へ返さない。preflight/prepareはこのmodule群の内部またはtest限定。

- [ ] **Step 1: callback/parityのfailing testsを書く。** `callback_runs_once_only_after_complete_zip_validation`、`post_sha_rejects_same_size_mtime_restored_mutation`、`callback_bytes_mutation_does_not_replace_source_sha`、`normal_ooxml_preserves_original_buffer_identity_without_recompression`、`missing_both_only_normalizes_once_with_lazy_codec`、`raw_once_accounting_preserves_current_expansion_caps`。
  ```js
  assert.strictEqual(parserArgument.parserInput, observedOwnedSnapshot)
  assert.deepEqual({parserLoads,codecLoads,recompressions}, {parserLoads:0,codecLoads:0,recompressions:0}) // malformed
  assert.deepEqual(committedTriple(ledger), [C, C, C]) // successful OOXML; E is structural
  assert.equal(resultVisibleBeforePostVerification, false)
  ```
- [ ] **Step 2: REDを観測する。** Pで`npm run compile`後に`node --test test/ooxmlParserInput.test.js test/ooxmlMigrationParity.test.js test/boundedArchiveInputLimit.test.js test/boundedZipRetention.test.js`。Expected: callback/module不在。Task1のread単独GREENは維持する。
- [ ] **Step 3: M2正本を移設してcallbackへ接続する。** preflight/entry inflate/CRC/minimal stylesheetはM2 blobを起点とし、archive版へ置換しない。5,000entries/250MiB expansion/32MiB centralをclampし、declared/actual長、全compressed消費、kind/root/descriptor/range/overlap/unsafe名を維持する。通常entryは逐次検証後に破棄、missing-both時だけ各inflate結果を一回保持。検証後だけcodec loader→必要な補修→parseを実行する。parse失敗・post-SHA失敗・signal中断はTask1へthrowし、commit前close/releaseを委譲する。
- [ ] **Step 4: baseline bytesを固定してGREENを実行する。** 下表の4raw blobsをtest/baselineへ無変更保存する。helperはTS5.9.3でテスト内transpileし、importsを4baseline modulesとNode builtin/実fflateだけへ固定解決する。runtime/packageへbaselineを含めない。全adversarial ZIP、通常DOCX/XLSX/片方styles/片方strings/両方missing、元Buffer、normalization bytes/load数、原本不変を比較する。60MiB単一entryとC=10MiB/E=245MiBのfixtureをcompressed file<=25MiBで生成し、旧ownerと新ownerとも受理・raw一回計上を確認する。250MiB+1/5,001entries/CRC/trailing deflateは両方拒否、予約0/parser0。全新tests+Task1を実行し全pass。
- [ ] **Step 5: Task2 pathsだけをcommitする。** `feat: centralize validated OOXML parser callbacks`。parity receiptへ保持するbehavior/新たに強化したpost-check/archive会計の非継承を別々に記録する。

| M2 origin（Bazaar src/ruleAuthoring/配下） | Raw Git blob | SHA256 | bytes |
| --- | --- | --- | ---: |
| extraction/ooxmlArchive.ts | 1c581f7ccfb3932115eb0f80f2770ab331c6c757 | 2225f70089962925cb358c6a1bfe012127e719d36f0e9f7536a534e743686743 | 6869 |
| extraction/ooxmlPreflight.ts | b6a7655698219250050023ac3c713da47074bbd9 | 0d998bcc44b5b8b260308d6cb5338c22720cdc1d4804265d277595f9460927d3 | 19684 |
| ruleSourceHash.ts | 8ebb7a7857955434d0a17cb37c8f5a8ce0dc2d65 | b94cedbfdd57d40d58ec659953be55425c6bd72d94bd21e45178823a3782a477 | 1742 |
| ruleAuthoringLimits.ts | dafc16b11602c6e914da53ca010deaa797ab0214 | bb9e2910c4c97351e732ff2499396ce349e116528497253927dacc538d8a6b30 | 1141 |

## Task 3: explicit exports・安全なbuild/copy・実tarball

**Files:** Create P:`scripts/runtime-payload.js`, `scripts/build-runtime.js`, `scripts/copy-extension-runtime.js`, `test/boundedDocumentPackaging.test.js`, `test/extensionIntegrationContract.test.js`、B/Cそれぞれ`src/sharedProcessingBudgetRuntime.ts`, `scripts/build-shared-runtime.js`。Modify P:`src/index.ts`, `package.json`, `test/helpers.js`, `test/packageContract.test.js`, `test/processingBudgetContracts.test.js`, `test/fixtures/workflow-register-consumer.ts`, `test/fixtures/bob-bazaar-review-consumer.ts`, `test/fixtures/bob-code-consistency-review-consumer.ts`, `test/fixtures/tsconfig.json`, `README.md`、B/Cそれぞれ`package.json`, `README.md`, `test/dependencyPolicy.test.js`、C:`package-lock.json`。

**Interfaces:** `runtime-payload.js`は上記12moduleと40package paths/36compiled pathsのliteral manifestをexportするbuild-only helper。`build-runtime.js` CLIは引数なし、exports `buildRuntime():BuildReceipt`。`copy-extension-runtime.js` CLIは`--extension-root <absolute>`だけ、exports `copyExtensionRuntime(extensionRoot:string):CopyReceipt`。receiptはsource input digest・compiled module ByteBindings・destination physical path・manifest digestを持つ。copierはこのrepoのB/C exact rootsのowned out/shared-processing-budget-runtimeだけを許す。testはfresh synthetic repo配置で同じCLIを実行する。両facadeはroot bounded API/T13 ledgerとcallback subpathをexplicit named exportし、lazy `loadXlsxCodec`だけをextensionのfflateから構成する。

- [ ] **Step 1: failing packaging/build testsを書く。** `flat_copy_has_exact_compiled_bytes_and_no_source_fallback`、`copy_rejects_escape_symlink_unknown_and_stale_output`、`concurrent_same_source_builds_do_not_mix_modules`、`packed_bounded_runtime_and_declarations_work_offline`、`product_deep_imports_are_rejected`。package rootにlow-level prepare/verification tokenがなく、subpathにcallbackだけがあることを確認する。
  ```js
  assert.equal(packageManifest.length, 40)
  assert.deepEqual(compiledHashesInBazaar, compiledHashesInConsistency)
  assert.deepEqual(compiledHashesInBazaar, compiledHashesInPackage)
  assert.throws(() => require('@bob/processing-budget-runtime/out/ooxmlParserInput'), /NOT_EXPORTED/)
  assert.equal(installedProductionDependencies, 0)
  ```
- [ ] **Step 2: REDを観測する。** Pで`node --test test/boundedDocumentPackaging.test.js test/extensionIntegrationContract.test.js test/packageContract.test.js`。Expected: copy/build/API/新manifest不在または19-path不一致。現物tarballを使い、fake requireやsource fallbackで通さない。
- [ ] **Step 3: canonical build/copyとfacadeを実装する。** package compileは`node scripts/build-runtime.js`へ変更し、contracts check→固定TS5.9.3（`--newLine lf`）→fresh staging→literal emit inventory/hashを検証する。package/node_modules/.cache下のexclusive build lockでcompile/copyをserializeし、source hashesが変われば失敗。検証済みowned out以外をremove/moveしない。既存old5-module出力は許可subsetとして置換し、未知ファイル/aliasは拒否する。copyはfresh stagingとmanifestを完全検証後に反映し、既存outputを壊した失敗を成功にしない。wrapperのnpm compileは`node scripts/build-shared-runtime.js`のみ。絶対argvでpackage build→extension tsc→canonical copyを呼び、暗黙installや別compilerへfallbackしない。facadeのtype importはpackageのcompiled declarationsだけ、実行時requireは`./shared-processing-budget-runtime`/`./shared-processing-budget-runtime/validatedOoxml`だけ。loader/manifest不在・必要API不在で固定build-required failureを返す。exports mapはrootと`./validated-ooxml`のtypes/require/defaultだけを列挙する。
- [ ] **Step 4: GREENと実offline installを行う。** CCR rootで`npm install --save-exact --ignore-scripts --no-audit --no-fund fflate@0.8.3`を実行して直接宣言/lock rootを更新し、他parserのresolved version/integrity不変を検査する。Pで`npm test`。fresh E rootへ実npm packし、tarballだけをoffline installしたconsumerでbounded read/callback/legacy ledgerを実行する。型試験のTS/Node typesだけはPのdev toolchainを明示typeRootsに指定し、installed consumerにdev dependenciesやrepo runtimeを持ち込まない。fixture tsconfigはmodule/moduleResolutionをNode16にしてsubpath exportsを検証する。helperはfixtureのroot相対importとout/validatedOoxmlの型importを、それぞれinstalled package rootと`@bob/processing-budget-runtime/validated-ooxml`へ明示置換する。3fixturesのroot/subpath型契約、runtime require path、manifest40paths、unknown/stale/deep import拒否を確認する。両拡張をcompileし、同じ36compiled bytesを確認する。
- [ ] **Step 5: Task3 pathsだけをcommitする。** `build: distribute one compiled processing runtime`。P/C lockのbefore/after dependency identity receiptをEへ保存する。

## Task 4: Bazaar bounded fingerprint・callback接続・旧owner薄型化

**Files:** Modify B:`src/ruleAuthoring/ruleSourceHash.ts`, `src/ruleAuthoring/extraction/documentExtractor.ts`, `src/ruleAuthoring/extraction/ooxmlArchive.ts`, `src/ruleAuthoring/extraction/ooxmlPreflight.ts`, `test/ruleSourceHash.test.js`, `test/ruleDocumentExtraction.test.js`, `test/ruleXlsxExtraction.test.js`, `test/ruleOoxmlPreflight.test.js`, `test/ruleAuthoringHeavyDependencyLoading.test.js`。Create B:`test/ruleBoundedOoxmlExtraction.test.js`, `test/ruleConfiguredFingerprintLimit.test.js`, `test/ruleConfiguredOoxmlLimitForwarding.test.js`, `test/ruleNoLegacyOoxmlPreflight.test.js`。B:`docxExtractor.ts`, `xlsxExtractor.ts`, GUI本体は原則bytes不変でBuffer/locator契約を確認する。

**Interfaces:** `SourceFingerprint`はshared fingerprintの同じ5fields。`fingerprintSource(filePath:string,options:{maximumBytes:number,rootPath:string}):Promise<SourceFingerprint>`を必須optionsへ変更する。既存3production callはすべてeffective source capとrootを渡す。`extractRuleDocument(s)`の公開signatureを維持し、contextだけへtrusted `rootPath?`を追加できる。外部選択ファイルの許可rootは選択pathの親directoryとし、CCRのworkspace制約をBazaarへ転用しない。`ooxmlArchive.ts`はhigh-level callback adapter/codec capabilityだけ、`ooxmlPreflight.ts`は必要なkind型のthin reexportだけを残す。

- [ ] **Step 1: failing consumer testsを書く。** `effective_source_ceiling_reaches_all_three_fingerprint_calls`、`both_ooxml_kinds_use_shared_callback_and_discard_changed_result`、`external_selected_source_is_allowed_within_selected_parent`、`malformed_archive_never_loads_parser_or_codec`、`pdf_and_legacy_keep_status_and_receive_bounded_fingerprints`。
  ```js
  assert.deepEqual(observedFingerprintCaps, [effectiveCap, effectiveCap, effectiveCap])
  assert.equal(legacyPathPreflightReads, 0)
  assert.equal(parserResultCommitsAfterSourceMutation, 0)
  assert.deepEqual(existingRulesVerificationLocators, baselineLocators)
  ```
- [ ] **Step 2: REDを観測する。** Bでcompile後`node --test test/ruleBoundedOoxmlExtraction.test.js test/ruleConfiguredFingerprintLimit.test.js test/ruleConfiguredOoxmlLimitForwarding.test.js test/ruleNoLegacyOoxmlPreflight.test.js`。Expected: 旧fingerprint/prepare経路を検出してFAIL。
- [ ] **Step 3: 3fingerprint callとDOCX/XLSX解析を接続する。** 単一/一括抽出と解析後のfingerprintへ有効25MiB以下ceilingを伝播する。OOXMLはfacadeのcreateDocumentLedgerでFile Structureのmappingを設定し、expected fingerprint/structural limits/target/loaderを渡して既存Buffer extractorをcallback内でawaitする。shared post-checkと重複する無制限readを残さない。PDF/legacyのpost-fingerprintと既存statusはbounded helperで維持する。Task2 parity成功後だけ旧ZIP/CRC/normalization bodyをthin化する。
- [ ] **Step 4: GREENと既存回帰を実行する。** Step2と`npm test`。旧prepare/preflight instrumentationを新callback/internal parityへ移し、adversarial assertionsを削除しない。`ruleDocxExtraction`/`ruleXlsxExtraction`/`rulePdfExtraction`/`realMachineDocumentFixtures`/`ruleAuthoringGui`/heavy loadingを確認し、normal Buffer・Rules/Verification・PDF page・requires_conversion/requires_ocr・原本不変を維持する。configured low capとlarge caller clampも実行する。
- [ ] **Step 5: Task4 pathsだけをcommitする。** `feat: use bounded shared snapshots in Bazaar extraction`。非変更のextractor/GUIもGit blob比較と回帰結果をcoverageへ記録する。

## Task 5: CCR extractorのbounded Buffer化

**Files:** Modify C:`src/analyzers/documentExtractor.ts`, `src/analyzers/documentDocxExtractor.ts`, `src/analyzers/documentXlsxExtractor.ts`, `package.json`のmaxDocumentBytes説明、`test/documentExtraction.test.js`, `test/sizeLimits.test.js`, `test/heavyDependencyLoading.test.js`。Create C:`test/documentBoundedInput.test.js`, `test/documentSourceLimitDescription.test.js`。

**Interfaces:** `extractDocuments(reviewInput, {workspaceRoot,textEncoding?,limits?})`とresult shapeは維持。`extractDocxChunks(documentBuffer:Buffer,evidenceType:string,selectors:string[]):Promise<ExtractedChunk[]>`。`extractXlsxChunks(workbookBuffer:Buffer,item:ArtifactRef,evidenceType:string,selectors:string[],warnings:string[],limits:ReviewProcessingLimits):Promise<ExtractedChunk[]>`。診断pathはitem.pathから取り、parser inputへpathを渡さない。`extractFileChunks`へworkspaceRootを渡す。MarkdownはreadBounded→既存decodeTextBuffer→pure extractor、OOXMLはbounded事前fingerprint→callback→Buffer extractorへ接続する。

- [ ] **Step 1: failing testsを書く。** `oversized_markdown_is_rejected_before_decode_and_emits_no_evidence`、`docx_xlsx_parser_arguments_are_verified_buffers`、`source_change_after_parse_discards_all_chunks`、`fifty_mib_source_is_not_rejected_by_default_parent_budget`、`valid_source_still_truncates_excerpt_and_aggregate_output`。
  ```js
  assert.equal(parserLoadsForOversize, 0)
  assert.deepEqual([result.evidence.length, result.excerptsMarkdown], [0, ''])
  assert.equal(Buffer.isBuffer(mammothInput.buffer), true)
  assert.equal('path' in mammothInput, false)
  assert.equal(Buffer.isBuffer(readExcelFileInput), true)
  ```
- [ ] **Step 2: REDを観測する。** Cでcompile後`node --test test/documentBoundedInput.test.js test/documentSourceLimitDescription.test.js test/sizeLimits.test.js`。Expected: path入力/Markdown切詰め成功/旧説明を検出する。
- [ ] **Step 3: 三形式の境界を接続する。** facadeのcreateDocumentLedgerでnormalized maxDocumentBytesとFile Structureのparent mappingを設定する。DOCX/XLSXは共通5,000/250MiB structural ceilingとmandatory post-checkを通す。Markdownの短いread/oversizeはwarning付き空chunksとし、原本切詰めを成功入力にしない。既存excerpt/aggregate出力切詰め・document metadata・selector/locator・warnings継続を維持する。設定説明を「原本全体を上限判定し超過時は抽出しない」意味へ更新する。
- [ ] **Step 4: GREENとCCR回帰を実行する。** Step2と`npm test`。旧sizeLimitsの「oversize Markdownからevidenceあり」をsource拒否/evidence0とwithin-source excerpt truncationに分け、aggregate excerpt testは保持する。realMachine fixtures、pathBoundary、heavy loading、encoding、no matching selectorも確認する。
- [ ] **Step 5: Task5 pathsだけをcommitする。** `feat: bound consistency document parser inputs`。

## Task 6: CCR discovery迂回の解消と設定伝播

**Files:** Create C:`src/reviewProcessingConfiguration.ts`, `test/reviewProcessingConfiguration.test.js`, `test/reviewInputDiscovery.test.js`, `test/discoveryProcessingLimitsWiring.test.js`。Modify C:`src/core/reviewInputDiscovery.ts`, `src/core/reviewInputAiDraftProvider.ts`, `src/core/traceabilityAiDraftProvider.ts`, `src/commands/reviewInputCommands.ts`, `src/traceabilityCommands.ts`, `src/webview/consistencyReviewWizard.ts`, `test/reviewInputAiDraftProvider.test.js`, `test/traceabilityAiDraftProvider.test.js`, `test/traceabilityCommandWiring.test.js`。既存core/limits.ts/runPreprocessの権威は保持する。

**Interfaces:** `reviewProcessingLimitsFromConfiguration(config:{get<T>(section:string):T|undefined}, overrides?:Partial<ReviewProcessingLimits>):ReviewProcessingLimits`を新host helperに置き、既存6settingsを収集してcore normalizeへ渡す。config namespaceは現行の`bobCodeConsistency`をそのまま使用する。command hostsは既存numberOptionの優先順でoverrideを作る。`ReviewInputDiscoveryOptions`と両`PrepareAi*DraftPromptInput`へ`limits?:Partial<ReviewProcessingLimits>`を追加し、providerはdiscoveryへ渡す。wizardは同じhelperのnormalized値を渡す。既存public function names/result shapeを変更しない。

- [ ] **Step 1: failing testsを書く。** `discovery_uses_bounded_markdown_and_verified_xlsx_buffers`、`rejected_discovery_preserves_path_candidate_without_ids`、`all_four_entry_paths_forward_effective_source_limit`、`command_override_precedes_config_and_direct_call_uses_default`、`docx_candidates_do_not_load_parser`。
  ```js
  assert.equal(discoveryOptions.limits.maxDocumentBytes, configuredOrOverrideBytes)
  assert.deepEqual(rejectedCandidate.sections ?? rejectedCandidate.rows, undefined)
  assert.equal(rejectedCandidate.path, originalRelativePath)
  assert.equal(result.warnings.length > 0, true)
  assert.equal(defaultOptions.maxDocumentBytes, 5 * 1048576)
  ```
- [ ] **Step 2: REDを観測する。** Cでcompile後`node --test test/reviewProcessingConfiguration.test.js test/reviewInputDiscovery.test.js test/discoveryProcessingLimitsWiring.test.js`。Expected: unbounded read/path parser/limits未伝播でFAIL。
- [ ] **Step 3: discoveryと4入口を実装する。** Markdownはworkspace root内のbounded snapshotからdecode、XLSXはTask5と同じ一文書profile/fingerprint/callbackで解析する。oversize/ZIP/source-change時は既存warningとpath candidateを維持し、IDs/selectorを成功扱いにしない。4direct discovery callers（wizard、create command、review-input provider、traceability provider）と2provider hostsへhelperの値を伝播する。AI prompt生成や既存Bob呼出しの同意経路は変更しない。
- [ ] **Step 4: GREENとhost回帰を実行する。** Step2と既存AI provider/traceability wiring/wizard initialization/lifecycle/model-snapshotを含む`npm test`。walk順序、maxFiles200/maxIds20、AI maxFiles120、XLSX80rows/シート、fallback path、DOCX parser0を保持する。fake hostは実際の4入口を呼び、source regexだけで伝播成功としない。
- [ ] **Step 5: Task6 pathsだけをcommitする。** `feat: enforce document bounds during review discovery`。sourceItemIdsなしのcurrent-main prerequisiteとしてcoverageへ分類する。

## Task 7: 実VSIX・隔離host・全CI buildへの接続

**Files:** Create root:`scripts/t14-bounded-document-installed-smoke.mjs`, `scripts/t14-bounded-document-installed-extension-host.test.js`, `scripts/t14-bounded-document-installed-smoke.test.mjs`, `scripts/processing-runtime-build-workflow.test.js`、P:`scripts/check-document-boundary.js`。Modify `.github/workflows/extensions-quality.yml`, `.github/workflows/code-consistency-review-scaffold.yml`, `.github/workflows/processing-budget-runtime.yml`, `scripts/exact-head-ci-contract.test.js`, `scripts/extension-host-smoke-contract.test.js`, `scripts/three-extension-ui-contract-workflow.test.js`、P:`package.json`, `test/extensionIntegrationContract.test.js`。exact-head契約JSONのjob集合は変更しない。

**Interfaces:** runner CLI=`node scripts/t14-bounded-document-installed-smoke.mjs --artifacts <manifest.json> --evidence-root <fresh absolute root>`。artifact manifestはcandidate head/tree、Bazaar/CCR VSIXのpositive bindings、expected36compiled-module bindings、fixture manifestを持つ。runnerはVS Code1.106.1と既存pinのtest runtimeを用い、専用user-data/extensions/probe/workspace/logs配下へだけ展開/launchする。VSIXをfresh owned artifact rootsへ展開・hash検証し、`runTests`のextensionDevelopmentPath配列にその2rootsとtest probeを指定する。extensionTestsPathはhost testの`exports.run():Promise<void>`を呼ぶ。配列と専用profile引数の扱いは[固定2.5.2の一次source](https://github.com/microsoft/vscode-test/blob/v2.5.2/lib/runTest.ts)で確認済み。host testはvscode.extensions.getExtension(id).extensionPathからartifact outを読み、repo/worktree runtimeを使用しない。receiptはartifact hashes、host exit、実module paths/hashes、各caseのpass/failを持つ。product activate/deactivateは今回のpayload境界試験の要件にせず、未実行ならnot_runと明記する。最終native三拡張UATや過去Discoveryのactivate/deactivate成功へ転用しない。build-only policy `checkDocumentBoundaries(repositoryRoot:string):void`/引数なしCLIをP/scriptsへ置き、Pの`boundary:policy`とintegration testから同じcheckerを実行する。

- [ ] **Step 1: failing build/host contract testsを書く。** `every_companion_build_prepares_shared_dependencies_first`、`shared_source_changes_trigger_all_dependent_quality_workflows`、`installed_smoke_rejects_wrong_hash_missing_module_and_repo_fallback`、`installed_gui_error_is_logged_once_and_queue_recovers`、`boundary_policy_rejects_path_parser_deep_import_and_unawaited_callback`。
  ```js
  assert.ok(sharedPrepPosition < firstAffectedCompilePosition)
  assert.equal(requiredCiContractRows, 18)
  assert.equal(loadedRuntimePaths.every(p => p.startsWith(installedExtensionRoot)), true)
  assert.equal(guiLoggedOriginalErrorCount, 1)
  assert.equal(nextQueuedOperationSucceeded, true)
  ```
- [ ] **Step 2: REDを観測する。** rootで`node --test scripts/processing-runtime-build-workflow.test.js scripts/t14-bounded-document-installed-smoke.test.mjs`。Expected: prep/runner不在またはguard不足。host実行のmockを実native passとして扱わない。
- [ ] **Step 3: workflowsとrunnerを実装する。** shared npm ciをextensions-qualityのworkflow-register companion block、Bazaar/CCR jobs、windows-smoke全3matrix、scaffold validate-extensionの最初のaffected compile前へ追加する。processing-runtime Ubuntu/Windows jobは既存install後に両拡張install/build/実VSIXとinstalled smokeも実行し、timeoutを20minへ設定する。Linuxは既存xvfb方式、Windowsは隔離profileで実hostを起動する。extensions-quality/scaffoldのPR/push pathsにP全体のdependency triggerを加える。各jobのcheckout guardより前にinstall/buildを動かさず、job identitiesは保持する。uploadは既存full-SHA upload-artifact pinを再利用し、同じjobが生成したartifact/manifest/host proofを一緒に保存する。boundary checkerはTS5.9.3 ASTで両拡張src全体のparser import/call inventoryを閉じ、5既知parser callsとそのcallerがcallback由来Bufferだけを使うこと、callback Promiseをawait/returnすること、低水準/deep/source-fallback importがないことを検査する。mutated fresh source fixturesで各禁止例がFAILすることも試験し、単なる文字列の存在だけをparity成功にしない。
- [ ] **Step 4: GREENと同一artifact smokeを実行する。** root contract testsと両拡張の実`npm run package`/`package:policy`、Bazaar package:smokeを実行する。runnerはfresh VSIXから展開したartifactだけをhostへ読み込み、通常DOCX/XLSX、missing-both XLSX、CRC/oversize/解析中置換、locator、原本不変を実compiled extractorで確認する。Bazaarのartifact `out/ui/ruleAuthoringGui.js::createRuleAuthoringGuiHost`へfake transportを渡し、実compiled queueで元error一回log/固定表示/次処理成功を確認する。これはartifactから動くhost-runtime試験で、製品activate/deactivate・visual operator/live Bob/final Program UATへ転用しない。artifact path/hash不一致時はlaunch前に拒否する。Ubuntu/Windowsの実実行証拠はTask10の実CIで閉じる。
- [ ] **Step 5: Task7 pathsだけをcommitする。** `ci: verify shared document runtime in installed VSIX`。Workflow VSIXはsource/compaction不変と容量回帰だけを確認する。

## Task 8: 39項目coverageと二つのliteral current admission層

**Files:** Create R:`boundedDocumentAdmissionPolicy.mjs`, `bounded-document-source-admission.json`, `test/boundedDocumentAdmissionPolicy.test.mjs`、`docs/release-evidence/proc-t14-bounded-doc-source-coverage-2026-10-24.json`。Modify R:`gateRMainAdmissionPolicy.mjs`, `processingBudgetAdmissionPolicy.mjs`, `test/gateRMainAdmissionPolicy.test.mjs`, `test/processingBudgetAdmissionPolicy.test.mjs`、`.gitattributes`。既存Owner/Discovery/T13 admission/coverage/completion JSONは変更しない。

**Interfaces:** new policyはgateRData helpersのみをimportし、旧policyをimportしない。`validateBoundedDocumentCoverage(input):true`, `validateBoundedDocumentSourceAdmission(input):true`, `applyBoundedDocumentSourceAdmission(input,{domain:'gate_r_shipping'|'processing_budget',baseFiles:PathRow[]}):PathRow[]`, `validateBoundedDocumentRepository(root):void`。旧gateRCurrentMainFilesのDiscovery結果を`gateRDiscoveryMainFiles():PathRow[]`として保持し、currentだけにnew layerを適用する。processingBudgetT13SourceFilesは28rowsのまま、CurrentSourceFilesだけがnew layerを適用する。

Admission closed fields=`{schemaVersion,baseMainSha,baseTreeSha,baseFilesDigests:{gateRDiscovery,processingBudgetT13},sourceRows,controlRows,sourceCoverageDigest}`。rowsはliteral path/mode/beforeBlobSha/afterBlobSha/sourceItemIdsを持つ。archive itemのないprerequisiteはsourceItemIds空配列かつcoverageの明示理由/試験へ結合する。policy/admission自身のself-hashは作らず、独立literal controlsとindex/working一致を要求する。

- [ ] **Step 1: failing coverage/admission testsを書く。** `exact_39_items_and_complete_675_partition`、`historical_layers_keep_original_raw_bytes_and_subjects`、`literal_t14_layer_rejects_before_blob_alias_unknown_and_wrong_domain`、`changed_extension_and_package_files_require_both_current_projections`。歴史hashはrawbytesで検査する。
  ```js
  assert.deepEqual([coverage.items.length,coverage.remainderClosure.total,coverage.remainderClosure.unassigned], [39,675,0])
  assert.equal(processingBudgetT13SourceFiles().length, 28)
  assert.throws(() => applyBoundedDocumentSourceAdmission(forgedAdmission, {domain:'processing_budget',baseFiles:t13Rows}), /literal/)
  assert.equal(gateRDigest(rawOwner57), '1665c66acd04a535b08116e639f5119b98e03609d9bb4d5f8efacc9bba37b5a4')
  ```
- [ ] **Step 2: REDを観測する。** rootで`node --test tools/main-consolidation/test/boundedDocumentAdmissionPolicy.test.mjs`。Expected: layer/coverage不在。既存old-current==T13/Discovery assertionsの失敗を捕捉し、歴史assertionsは削除しない。
- [ ] **Step 3: source coverage/literal layerを実装・sealする。** Spec付録A39IDと全origin blobsを再照合し、各itemを実装/testへ結合する。archive runtime/copy/preflight/展開会計の適応理由、unchanged Buffer extractor、discovery/settings/build/CIの追加前提を明記する。各taskのFilesに限定したM2 before/current index afterをsealし、domainsのexact scopeへ投影する。old Gate R extension/tools scanを縮小せず、new package inventoryをすべて検証する。historical原本4baseline filesにliteral LF、admission/coverage/将来completionのliteral LF rulesをsource段階で追加する。
- [ ] **Step 4: GREENとroot gatesを実行する。** new test、old main/processing admission tests、`gateRPolicy.test.mjs`、root必須4と4生成器--checkを実行する。T13 historical getter/definition/Owner/Discovery bytesはM2と一致、current gettersだけがT14afterに一致する。unknown src/lock/runtime/alias/working-index drift/caller-supplied arbitrary layerを拒否する。CIワークフロー文言に依存する既存testはprep順序を保つ形へ適応し、新しい未列挙controlを便乗許可しない。
- [ ] **Step 5: Task8 pathsとseal対象の最終正規化差分だけをcommitする。** `chore: admit bounded document source and preserve historical seals`。spec/planもreview対象literal documentsとして記録し、source universeやstatic program indexを変更しない。

## Task 9: full local品質・一度のsource review・candidate固定

**Files:** 新しい製品機能/無関係fileは追加しない。Eへquality receipts、source manifest、review/fix記録、candidateを作る。必要なC/I fixはTask1–8のliteral pathsに限定し、seal/coverageを更新する。

**Interfaces:** immutable review range=`M2..candidateHead`、source/tree/index一致、source gate receiptsにcommand/exit/count/head/tree/actual output bindingを持たせる。source reviewは一度fresh、修正は観測TDD一回、再reviewなし。

- [ ] **Step 1: task完了と差分を検証する。** 各RED/GREEN・39coverage・追加前提・E receipts・old hashesを集約し、source/control/document literal一覧とGit diffを照合する。実diffに新pathが必要なら意味/責任/試験を記録し、設計の境界を変える変更だけ利用者へ戻す。
- [ ] **Step 2: full named gatesを実行する。** Pの`npm test`、B/Cの`dependency:policy`/`architecture:policy`/`source:policy`/`unused:report`/`audit:prod`/`npm test`/実package/policy、Bazaar artifact/package:smoke、Workflow既存品質とGate R、root必須4/4生成器、新admission、Task7契約・installed smoke、`git diff --check`。live audit失敗は現物を調査し、未実行やCI成功の代用としない。必要checksがpassした後に理由なく全suiteを繰り返さない。
- [ ] **Step 3: source全体を一度fresh reviewする。** 最強の利用可能reviewerへimmutable diff/spec/planと証拠pathsだけを渡す。focusはraw/expanded会計、同handle post-SHA、close/finalize、未bounded discovery/parserの迂回、lazy/parser版、copy/VSIX、historical seals/actual CI。reviewerはread-onlyで実装者を兼ねない。
- [ ] **Step 4: C/Iを一回TDD fix passで処理する。** 各指摘に反証またはnamed RED→最小fix→GREEN/影響checksを記録する。Minorはdefer、source reviewerを再起動しない。指摘0ならfixのためだけの変更を作らない。seal/index更新を含む最終candidateをcommitし、tree/quality receiptsをそのheadへ束縛する。
- [ ] **Step 5: concrete remote candidateをE/fresh-root/CANDIDATE.mdへ作る。** repo/branch/head/tree/changed files、C/I0、remaining minors、actual local package/VSIX/host hashes、5workflow18row契約、通常push→main PR→actual CI→全成功時通常merge→exact-main CI→非force main FFの影響を記載する。remote/main操作に先立ち、このcandidateに対する新しいC承認を得る。未承認ならここで保持し、先行pushしない。

## Task 10: source PR・実CI・S1受入観測

**Files:** Eのremote/CI/artifact/source-closure証拠のみ。製品diffを追加しない。承認対象candidateが変わった場合は同じ承認を別headへ転用しない。

**Interfaces:** source C_T14とtree、normal merge main S1とparents/tree、5workflows各run/attempt/job/runner/guard/log/artifactの実観測を記録する。`sourceObservation.json`はclosed `bob-builtin-analyze/proc-t14-bounded-doc-completion/v1` recordで、acceptedMainSha/tree/parents、sourceHeadSha、PR番号、source39/675/0、原本一回会計/13categories、current+historical admissions、local gates、real package/VSIX/installed host、review、CI、preservationの各joinとpositive externalEvidenceを持つ。

top-level keysは`schemaVersion,boundaryId,state,repository,sourceHeadSha,acceptedMainSha,acceptedTreeSha,mergeParents,pullRequestNumber,source,boundedDocument,ci,packages,installedUat,activeRuntime,review,local,preservation,externalEvidence,runtimeActivation,automaticCleanup,mutationAuthority,finalProgramUat,limits`とする。`boundedDocument`は`contracts,parity,rawAccounting,sourceFingerprints,callbackPostChecks,normalization,consumers,discovery,crossPlatform,packaging`の各ByteBinding。sourceには39/675/0・M2 base・13categories・`rawByteAccounting:'source_once'`・`expandedByteAccounting:'structural_only'`・40payload・3type consumers・productionDeps0・coverage/admission/historical bindings・additionalPrerequisites・metadataIsNotSourceSubjectを記録する。packagesは既存3拡張のid/version/accepted source/tree/vsix/cap/headroomを持ち、B/CにはcompiledPayload/parserIdentity、Workflowには既存compaction proofを結合する。

ciは`mode:'actual_exact_head_success',allRequiredGatesSucceeded:true,waiver:null,candidate,actualMain`で、各workflowの実eventを保持する。PR/dispatchが混じる場合もoverall eventで偽装せず、guardのactualHeadShaをsubjectと比較する。metrics skipはそのworkflowが非PR eventのときだけ許す。installedUatは`kind:'isolated_artifact_extension_host'`と両OSのartifact/host bindingsを持ち、product activation/deactivation/visualOperator/liveBob/finalProgramUatはnot_runのまま。Gate Rの15/five effects0はactiveRuntimeの実receiptから結合する。review/local/preservationはC/I残0・一度review・実named gates・primary/Owner/全proof再hashを記録する。Task11でこれらのclosed形と捕捉時の値を固定し、未来metadataをsourceへ転用しない。

- [ ] **Step 1: candidateのC承認を検証して通常push・main向けPRを作る。** candidate SHA/tree/diffが承認記録と一致し、primary状態/Owner57不変を確認する。PR作成後はnative attach_artifactで必ず紐付ける。admin merge/force push/bypassを使わない。
- [ ] **Step 2: candidateの実CIを収集する。** required5workflow/18rowsをexact-head契約で照合し、missingだけ同SHA+32hex nonce dispatchする。PR18success、dispatchのPR専用metricsだけskipを許し、全row completed/actual checkout/runner/log/attemptを確認する。processing両OSのactual tarball/VSIX/module/parity/host proofをdownloadし、全physical bindingsを再hashする。artifact/downloadやstart失敗は未成功のまま保持する。
- [ ] **Step 3: 全条件成立時に通常mergeする。** main driftがあればbase/diff/CI subjectを再評価し、treeが承認candidateと一致しないmergeを黙って受け入れない。S1のparents/treeとcandidate treeを検証し、mainの5workflow18rows=17success+metrics skip1を同じ方法で収集する。main artifact/host proofのsource head/treeをS1として確認する。
- [ ] **Step 4: S1 closureを作り、受入後同期を実施する。** approved remote範囲でsource WTをS1へff-only、未checkout local mainを非force FFし、primary branch/head/untracked/status/Owner57不変を確認する。root必須4/4生成器、新admission/P test/Gate R/actual VSIX joinsをS1へ束縛する。元host pathを読むcapture検証と、捕捉bytesでのportable replayを分け、historyを別headへ偽装しない。
- [ ] **Step 5: Task10をdoneにする。** 全evidenceをpositive external bindingsとmanifestへ結合し、sourceObservationをbyte-fixedにする。静的進捗/statusはまだ11/20/13refsのまま。旧Discovery native/live Bobの歴史成功を新T14 artifactへ転用しない。

## Task 11: 別completion metadata・正式進捗・metadata受入

**Files:** source S1基点の別managed worktree/branch=`codex/v2-processing-bounded-doc-completion`で、Create `docs/release-evidence/proc-t14-bounded-doc-completion-2026-10-24.json`、Modify R:`featureIntegrationStatusPolicy.mjs`, `create-feature-integration-status.mjs`, `test/featureIntegrationStatusPolicy.test.mjs`と`docs/release-evidence/feature-integration-status.json`の5pathsだけ。sourceのLF rule/admission/coverageは変更しない。

**Interfaces:** completion JSONはTask10 sourceObservationの実bytesをそのまま保存する。new `validateT14Completion(record)`をexisting status policyのdispatcherへ加え、受入済みsource C_T14/S1/tree/parents/PR番号を固定し、closed fields/39items/675/0/13categories/原本一回会計/40pack paths/2realVSIX/2OS host/actualCI/local/review/preservationを検証する。`COMPLETION_REGISTRY`へ14番目を追加し、旧13 referencesをprefixで保持する。new `throughT14()` test fixtureはsource S1をsubjectとし、metadata candidate/mainをsourceへ置換しない。

- [ ] **Step 1: 別metadata worktreeを作りsource proofを再検証する。** native list_artifactsで再利用を確認してS1からmanaged WTを作り、実path/branchを記録する。sourceObservationと全physical bindingsのhash/size/subjectを照合してからcopyする。portable replayで元host filesystem参照0、1byte drift/wrong artifact/wrong subjectは拒否する。
- [ ] **Step 2: metadataのfailing testsを書く。** `through_t14_preserves_old_13_prefix_and_projects_12_of_20`、`t14_completion_rejects_wrong_source_metadata_subject_and_waiver`、`t14_ci_and_installed_artifacts_must_share_actual_source_identity`、`t14_replay_requires_closed_physical_bindings_without_host_access`、`t14_completion_literal_lf_survives_autocrlf_checkout`。
  ```js
  assert.deepEqual(status.completionReferences.slice(0,13), throughT13.completionReferences)
  assert.deepEqual([status.completionReferences.length,status.slices.filter(x=>x.state==='VERIFIED').length,status.nextSliceId], [14,12,'PROC-T15-AGGREGATE'])
  assert.equal(status.boundaries.find(x=>x.id==='PROCESSING-FOUNDATION').state, 'planned')
  assert.equal(status.slices.every(x=>x.observedActivationStatus==='inactive'), true)
  ```
- [ ] **Step 3: RED→status拡張→GREENを実行する。** 新testsはT14未対応を理由にFAIL。policyへsource facts/CI/artifact/host/historical bindingsを検証するT14 branchを加え、generator入力末尾へcompletionを追加してstatusを生成する。既存T13 validatorの19-path/192bindings等の歴史条件とthroughT13 assertionsは保持する。新tests、full status、root必須4、4生成器--check、新admission/P test/Gate R、metadata diff --checkを実行し、5pathsだけの差分を確認する。
- [ ] **Step 4: metadataを一度fresh reviewし、C/I一回fix後candidateを固定する。** source reviewを繰り返さず、metadata diff+source closureのsubject/hash/replayを独立reviewする。新CANDIDATE.mdに具体的head/tree/5paths/quality/C/I0と、通常push→main PR→実CI→通常merge→main同期を記載する。この別candidateに対応する新しいC承認を得てからremote操作へ進む。
- [ ] **Step 5: 通常push/PR/実CI/merge/main同期を行う。** PRをattachする。metadataだけで起動しないworkflowは同head+nonceでdispatchし、candidate/mainとも5workflows/18rows=17success+PR専用metrics skip1（PR eventでmetricsが実行された場合は18success）を現物で確認する。source S1をsubjectとするcompletion bytes不変、metadata main M2のparents/tree/candidate tree一致を検証し、ff-onlyと非checkout local mainへの非force FFを行う。
- [ ] **Step 6: 最終受入を記録する。** 必須named checksと全physical joinsをmetadata M2で確認し、14refs/20slices/12verified/60%/nextT15、boundary planned、Gate R15/five effects0/runtime inactive、primary/Owner57/全worktrees/profiles/evidence保持をreceipt化する。installed hostは実行したartifact/hash/OSだけPASSED、visual operator/live Bob/final Program UATはnot_run。最終aggregate checkerで全Task doneを確認し、deferred minorsと実行制限をCOMPLETION.mdへ記録する。

## Root verification commands / self-review map

root必須4は次を一括実行する:

```powershell
node --test scripts/exact-head-ci-contract.test.js tools/main-consolidation/test/featureIntegrationProgramPolicy.test.mjs tools/main-consolidation/test/featureIntegrationStatusPolicy.test.mjs tools/main-consolidation/test/featureSelectionLedgerPolicy.test.mjs
```

4生成器は既存CLIの`--check`を使う。実行前に各CLIがimport-safeな現行interfaceを保持していることを確認し、出力修正のために古いsource ledgerを再生成しない:

```powershell
node tools/main-consolidation/create-feature-integration-program-index.mjs --check
node tools/main-consolidation/create-feature-integration-status.mjs --check
node tools/main-consolidation/create-feature-selection-source-universe.mjs --check
node tools/main-consolidation/create-feature-selection-ledger.mjs --check
```

Gate Rはrootで`node tools/main-consolidation/run-gate-r.mjs --check`を実行する。出力のruntimeSuitesExecuted=15/runtimeActivation=false/five effects0を既存validatorのreceiptへ結合する。raw byte seal、actual native host、typed installed consumer、mock contract testの証拠種別を混同しない。

Spec §1/11→Tasks9–11、§2/3→Tasks1–8のscope、§3.1→Tasks1/2/4/5、§4/5→Tasks1–3、§6→Tasks2/4/7、§7→Tasks4–6、§8→Tasks3/7、§9→Task8、§10→全TaskのRED/GREENとTask9/10、§12→上記private配置/config helperの明示判断へ対応する。Review Focusの5項目にはそれぞれTask1/2、1/2、4/5/6、3/7、8/10/11のnamed testsがある。

書面plan reviewが終わるまで実装・依存取得・新host起動・remote操作は開始しない。承認後は既存の主スレッド方式でTask1から実施する。
