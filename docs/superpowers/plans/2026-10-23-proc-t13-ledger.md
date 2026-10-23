# PROC-T13-LEDGER Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 23出典に対応する共通13カテゴリ予算台帳を導入し、sourceと別metadataの実証後にV2進捗を11/20へ進める。

**Architecture:** `packages/processing-budget-runtime`に独立した純粋libraryを置き、定義JSONから定数/schemaを生成する。profile、atomic reservation、consumer declarations、実tarballを順に検証する。現行3拡張のコード・設定・配布入力は保持し、source受入S1と観測記録metadata M2を分離する。

**Tech Stack:** Node22 CI / package Node>=20、TypeScript5.9.3 exact devDependency、CommonJS ES2022/strict、Node test、npm local tarball、既存exact-head/Gate R/status policies。

**Spec:** `docs/superpowers/specs/2026-10-23-proc-t13-ledger-design.md`、承認済みcommit `0a893611a7687bcf7911de2ed609533fcc94be7c`、blob `c496122f9fdac070a42b0ec1968bd82538f0aeb6`、SHA256 `38ea0c7daf626fc40d56c89d5943c4f8339bc9b08fd75f5822a7a0f29eae6edb`。

## Global Constraints

- 基点はmain D2=`aa25f00f98c41c5aebdb30c68cdc967a1d205ab5` / tree=`fc869e3735b5ddcad3dcf7e6892e290888656716`。source設計・計画・実装は同じ`C:/Users/stell/.codex/worktrees/v2-processing-ledger/bob_builtin_analyze`、branch=`codex/v2-processing-ledger`で継続する。
- ordinal11、`PROC-T13-LEDGER`だけを対象とする。T14/T15のparser/aggregate接続、future R3-R5/R6、V2 runtime activationは含めない。metadataまで正式進捗は10/20。
- 読取り調査で照合済みの23 source items/21 distinct origin blobsを使う。origin=`bd29233dac84922e2f868dcb9d654644f6ee0d6a`、manifest=`36e477ee9b752ebf7f07a208c166fec24e14a89bf7ba6a7921cf6bdf708c9f31`、carrier=`6913ddddcffb150eb207aee99bdbbad158b4ed05e9c3ca8714693d31f6122536`。全675分類/未分類0、static20、旧12 completion referencesは不変。
- libraryはprivate `@bob/processing-budget-runtime@0.1.0`、runtime production depsなし。定義・profile・error・ledger・indexの5 source modulesだけで始める。root npm workspaceは作らない。
- MiB=1,048,576。target最大256 UTF-8 bytes、内部APIエラー文言最大512 UTF-8 bytes、safe nonnegative integer会計、chain単位atomic、snapshotはdeep-frozenでtruncateしない。metadata cardinalityの新上限・reset/cancel/timeout/巻戻しAPIは追加しない。
- 現行Bazaar source20/25 MiB/100 MiB、chunk32 KiB、index/evidence/proposal各1 MiB、PDF32 MiB、OOXML5,000entries/250 MiBを保持する。fixtureだけ`total_operation_input_bytes=256 MiB`を明示する。extension/GUI/parser/deps/versions/lock/圧縮対象を変更しない。
- VSIX ceilingsはworkflow1,200,000、Bazaar12,000,000、CCR11,000,000 bytes。既存Gate R15/120s/3slots/1MiBとfive effects0を維持する。旧4workflow/16jobsを保って5workflow/18jobsへ追加する。
- **実行方式案は既存の主スレッド方式を継続**し、taskごとの実装者/reviewerは増やさない。source全体とmetadataを各一度fresh reviewし、Critical/Importantは一回のTDD fix pass、Minorはdeferする。
- Local Bには同worktreeのliteral files、実装・検証・review・local commits、公開`https://registry.npmjs.org/`からのcredentialなしdependency readを含める。秘密情報の取得・publish・外部message送信は含めない。remote/PR/mainのCは準備済み実candidateを提示した新しい承認の範囲で行う。
- local evidence/pack/install/npm cacheは`<worktree>/.superpowers/sdd/2026-10-23-proc-t13-ledger/`配下のfresh rootへ置き、開始時にabsolute/realpathをreceipt化する。CIはphysical `runner.temp/bob-processing-budget-runtime`下でfresh rootを作る。standalone testのfallbackはphysical os.tmpdir下の`bob-processing-budget-ledger-` prefix。既存artifactを置換しない。
- primary user branchのswitch/reset、保護済み3領域の内容読取り、user untracked15件のstage/delete、worktree/profile/branch/evidenceのcleanupをしない。主系main同期は未checkout local mainへの非force FFで行う。

### Canonical table（順序固定）

| category | scope | default | absolute | aggregate |
| --- | --- | ---: | ---: | --- |
| `single_document_bytes` | target | 5 MiB | 50 MiB | `total_document_bytes` |
| `total_document_bytes` | operation | 32 MiB | 256 MiB | `total_operation_input_bytes` |
| `document_count` | operation | 128 | 1,024 | — |
| `sheets_per_workbook` | target | 20 | 100 | `total_sheets` |
| `total_sheets` | operation | 100 | 1,000 | — |
| `rows_per_sheet` | target | 500 | 5,000 | `total_rows` |
| `total_rows` | operation | 25,000 | 250,000 | — |
| `changed_files` | operation | 5,000 | 20,000 | — |
| `raw_diff_bytes` | operation | 1 MiB | 10 MiB | `total_operation_input_bytes` |
| `document_excerpt_bytes` | operation | 2 MiB | 8 MiB | `total_operation_input_bytes` |
| `bob_input_bytes` | operation | 2 MiB | 8 MiB | `total_operation_input_bytes` |
| `managed_artifact_bytes` | operation | 16 MiB | 64 MiB | — |
| `total_operation_input_bytes` | operation | 64 MiB | 256 MiB | — |

## Review Focus

1. 未知category/profileにあるgetter・throwing coercion・巨大文字列から、API内部errorへ実行副作用や無制限文字列を持ち込まない（Task2/3）。Proxy introspectionそのものをsandboxする主張はしない。
2. 複数open予約の祖先競合、無効commit後のrelease、0予約/overflowで、失敗がstateを部分変更しない（Task3）。
3. target summaryにper-target remainingを作らず、UTF-8長とUnicode code-point順、snapshot後の別予約を正しく扱う（Task3）。
4. repoのoutがあるからpackが動くという誤証明を避け、実tarballだけを入れたoffline consumerでruntime/declarationsを検証する。Bazaar actual export parityは別root試験で行う（Task4/5）。
5. 将来の同package T14/T15やmetadata受入で、歴史的T13 baseを改変・新subjectへ誤転用しない。sourceとmetadataの識別、old12 prefix、boundary未完了、実CIattemptの結論を検証する（Task5/7/8）。

## File Structure / shared interfaces

`P`は`packages/processing-budget-runtime/`。Task1-4のP配下21pathsと、Task1の`.gitignore`/Task5のworkflowがSpec§11の23項目へ一対一に対応する。実装では同表のfull source IDsを使う。

| Task | literal paths / ownership |
| --- | --- |
| 1 | P:`package.json`, `package-lock.json`, `tsconfig.json`, `contracts/processing-budget-definition.v1.json`, `scripts/generate-processing-budget-contracts.js`, `src/generatedProcessingBudgetDefinition.ts`, `schema/processing-budget-profile.v1.schema.json`, `test/helpers.js`, `test/processingBudgetContracts.test.js`; root `.gitignore`, `.gitattributes` |
| 2 | P:`src/processingBudgetError.ts`, `src/processingBudgetProfile.ts`, `test/processingBudgetDefinition.test.js` |
| 3 | P:`src/processingBudgetLedger.ts`, `test/processingBudgetLedger.test.js` |
| 4 | P:`src/index.ts`, `README.md`, `test/packageContract.test.js`, `test/fixtures/{workflow-register-consumer,bob-bazaar-review-consumer,bob-code-consistency-review-consumer}.ts`, `test/fixtures/tsconfig.json`; P:`test/helpers.js`を拡張 |
| 5 | `.github/workflows/processing-budget-runtime.yml`; `tools/main-consolidation/{processingBudgetAdmissionPolicy.mjs,processing-budget-source-admission.json,test/processingBudgetAdmissionPolicy.test.mjs,exact-head-ci-contract.json}`; `scripts/exact-head-ci-contract.test.js`; `docs/release-evidence/proc-t13-ledger-source-coverage-2026-10-23.json` |
| 6/7 | 新製品機能追加なし。Eのreceipts/review/CIのみ。必要なfixは上のliteral source/test/sealだけ |
| 8 | 別metadataで`docs/release-evidence/proc-t13-ledger-completion-2026-10-23.json`、`tools/main-consolidation/{featureIntegrationStatusPolicy.mjs,create-feature-integration-status.mjs,test/featureIntegrationStatusPolicy.test.mjs}`、`docs/release-evidence/feature-integration-status.json`の5paths |

source PRの追加・変更は上表30pathsとこの計画/承認済み設計の2文書、計32 literal pathsを予定する。generated outputs/pack/receiptsはtracked sourceへ含めない。metadataは5pathsだけで、source段階のLF ruleを変更しない。

`PathRow={path:string,mode:'100644',blobSha:40hex}`、`ByteBinding={path:string,sha256:64hex,bytes:positiveSafeInteger}`。以下のInterfacesを後続taskも同名で使用する。

## Task 1: canonical definition・生成器・独立build

**Files:** 上表Task1。setup/configはこの定義生成のdeliverableへ含める。

**Interfaces:** Consumes: Canonical table/Spec§3。Produces: `PROCESSING_BUDGET_DEFINITION`, `PROCESSING_BUDGET_DEFINITION_BY_ID`, `PROCESSING_BUDGET_CATEGORY_IDS`, `PROCESSING_BUDGET_TARGET_CATEGORY_IDS`, `PROCESSING_BUDGET_OPERATION_CATEGORY_IDS`, `PROCESSING_BUDGET_DEFAULT_LIMITS`, `PROCESSING_BUDGET_ABSOLUTE_MAXIMA`, `PROCESSING_BUDGET_MANIFEST_MAXIMA`、`MEBIBYTE_BYTES=1048576`、`PROCESSING_BUDGET_PROFILE_SCHEMA_VERSION='processing-budget-profile/v1'`, `PROCESSING_BUDGET_LEDGER_REPORT_SCHEMA_VERSION='processing-budget-ledger-report/v1'`、category/scope/unit/definition型。MANIFEST_MAXIMAとABSOLUTE_MAXIMAは同一object。test helper `loadRuntime(moduleName='index'):object`はoutの5固定moduleだけを読め、未compileなら固定build-required failure。Task1-3はindexがまだ無いのでそれぞれのmodule名を明示する。generator CLIは引数なしgenerate/`--check`のみ、import safeで固定3paths（定義入力/生成TS/Schema出力）を使う。

JSONはarchiveと同じsnake_case（category.default/absolute_maximum/aggregate_into）。生成public `ProcessingBudgetCategoryDefinition`はreadonly id/title/scope/unit/defaultLimit/absoluteMaximum/aggregateIntoを持ち、scope=`'target'|'operation'`、unit=`'bytes'|'count'`、aggregateIntoはoperation categoryまたはnullへ写す。Task2/3はこのcamelCase generated interfaceを使う。

- [ ] **Step 1: failing contract testsとpackage scaffoldを書く。** `definition_is_the_exact_ordered_13_category_table`, `generated_contracts_reject_drift_and_invalid_definition`, `runtime_graph_has_no_effectful_imports`。package/tsconfig/lockはarchiveのNode>=20/TS5.9.3/CommonJS/strict/declarations/sourceMapを使い、runtime depsを足さない。test/helperだけを先に置き、定義/generator/runtimeはまだ置かない。
  ```js
  assert.equal(definition.categories.length, 13)
  assert.deepEqual(definition.categories.map(x => x.id), expectedOrderedIds)
  assert.strictEqual(runtime.PROCESSING_BUDGET_MANIFEST_MAXIMA, runtime.PROCESSING_BUDGET_ABSOLUTE_MAXIMA)
  assert.equal(runtime.MEBIBYTE_BYTES, 1048576)
  ```
- [ ] **Step 2: REDを観測する。** P cwdで`node --test test/processingBudgetContracts.test.js`。Expected: 定義/生成器/compiled moduleが無いためFAIL。既存拡張やoutを代用しない。
- [ ] **Step 3: 定義と生成器を実装する。** 上の13行をJSON sole authorityへ保存。fatal UTF-8、closed fields、unique IDs、scope/units、整数bounds、aggregate existence/operation scope/同単位/child<=parent/acyclicを検証してdeep-frozen constantsとcomplete-profile schemaを生成する。Schemaは13 limits必須/additionalProperties false、schema version固定。runtime src importsは5固定relative modulesの範囲、fs/process/provider等へ接続しない。`.gitignore`はPのnode_modules/outのliteral2行、`.gitattributes`はcanonical定義/TS/schemaと将来completion1pathのliteral LF rulesを追加する。
- [ ] **Step 4: GREENを実行する。** Pで`npm ci --ignore-scripts --no-audit --no-fund`、`npm run contracts:generate`、`npm run compile`、`npm run contracts:check`、Step2。Expected: 全0、13の順序/数値完全一致。不正definition/循環/生成1byte差の各fixtureは非0。初回npm取得は公開registryだけ、npm cacheはE配下。
- [ ] **Step 5: Task1 literal pathsだけをcommitする。** `feat: generate canonical processing budget contracts`。test/helperのfake runtimeでGREENにしない。

## Task 2: strict immutable profilesとbounded errors

**Files:** 上表Task2。

**Interfaces:** Consumes: Task1 definitions。Produces: `ProcessingBudgetLimits=Readonly<Record<ProcessingBudgetCategory,number>>`; `ProcessingBudgetProfile={readonly schema_version:'processing-budget-profile/v1',readonly limits:ProcessingBudgetLimits}`; overridesはschema_version?/limits partial。`normalizeProcessingBudgetProfile(overrides?:ProcessingBudgetProfile|ProcessingBudgetProfileOverrides):ProcessingBudgetProfile`、`DEFAULT_PROCESSING_BUDGET_PROFILE`, `ABSOLUTE_PROCESSING_BUDGET_PROFILE`。`ProcessingBudgetErrorCode`はSpec§7の9 codes、`ProcessingBudgetErrorDetails`はoptional targetCategory/target/constrainedCategory/limit/observed、classはreadonly code/frozen detailsを持つ。API内部diagnosticsだけを固定文言/known enum/checked target/safe numberに制限する。

- [ ] **Step 1: failing testsを書く。** `profiles_snapshot_closed_own_data_without_getter_or_coercion`, `profiles_reject_invalid_limits_and_child_parent_violations`, `current_bazaar_explicit_profile_preserves_20_25_100`, `api_errors_are_typed_and_bounded`。0、各absolute/plus1、NaN/Infinity/unsafe/fractional/negative、schema/unknown/symbol/nonenumerable/inherited/accessor、throwing Proxy introspection、immutable old snapshotを対象にする。
  ```js
  const p = normalizeProcessingBudgetProfile({limits:{single_document_bytes:25*MiB,total_document_bytes:100*MiB,document_count:20,total_operation_input_bytes:256*MiB}})
  assert.equal(p.limits.total_document_bytes, 100*MiB)
  assert.equal(Object.getPrototypeOf(p.limits), null)
  assert.ok(Object.isFrozen(p) && Object.isFrozen(p.limits))
  assert.equal(getterCalls + coercionCalls, 0)
  ```
- [ ] **Step 2: REDを実行する。** Pで`node --test test/processingBudgetDefinition.test.js`。Expected: profile/error module不存在のFAIL。
- [ ] **Step 3: error/profileを実装する。** descriptorsからown dataをsnapshotし、未知入力をString/toString/valueOfで診断へ変換しない。schema/全13整数/absolute/各immediate parentを検査してfresh frozen profileを返す。unsafe observedはundefined。profile内部エラーのmessageは512 UTF-8 bytes以下。
- [ ] **Step 4: GREENを実行する。** Pで`npm run compile`と`node --test test/processingBudgetContracts.test.js test/processingBudgetDefinition.test.js`。Expected: 全pass、実exportで13値/2profile constants確認。ProxyのownKeys等が呼ばれないという誤ったassertは書かず、getter/coercionとthrowing trapの型収束を区別する。
- [ ] **Step 5: Task2をcommitする。** `feat: validate immutable processing budget profiles`。

## Task 3: atomic reservation ledger

**Files:** 上表Task3。

**Interfaces:** Consumes: Task1/2。Produces: `ProcessingBudgetLedger(profile?:ProcessingBudgetProfile|ProcessingBudgetProfileOverrides)`、readonly profile、`reserve(category:OperationScopedProcessingBudgetCategory,amount:number):ProcessingBudgetReservation`、`reserveForTarget(category:TargetScopedProcessingBudgetCategory,target:string,amount:number):ProcessingBudgetReservation`、`snapshot():ProcessingBudgetLedgerReport`。reservation=`{readonly category,readonly target?,readonly amount,commit(actualAmount?:number):void,release():void}`。report=`{schema_version:'processing-budget-ledger-report/v1',categories:readonly CategoryReport[],targets:readonly TargetReport[]}`。category共通fieldsはcategory/unit/limit/committed/reserved/used、operationはscope/remaining、target summaryはscope/target_countだけ、個別targetはtarget/remainingを持つ。target最大定数は`PROCESSING_BUDGET_TARGET_MAX_UTF8_BYTES=256`。

- [ ] **Step 1: failing ledger testsを書く。** `reservation_chain_is_atomic_under_shared_ancestor_contention`, `invalid_commit_stays_open_and_releasable`, `target_summary_utf8_order_and_old_snapshot_are_correct`, `forged_receiver_and_diagnostics_do_not_gain_authority`, `ledger_invariants_hold_for_deterministic_64_step_sequences`。全13 default/absolute boundaryとplus1、0/不正amount、overflow、複数open、commit(actual)<reserve、release、double finalize、independent byte categories、managed output非input、Unicode/256-byte limitを含める。
  ```js
  const before = ledger.snapshot()
  assert.throws(() => reserveOneMoreAtContendedAncestor(), e => e.code==='processing_budget_exceeded')
  assert.deepEqual(ledger.snapshot(), before)
  assert.throws(() => reservation.commit(reservation.amount + 1), e => e.code==='processing_budget_commit_invalid')
  reservation.release()
  assert.equal(Object.hasOwn(targetCategorySummary, 'remaining'), false)
  ```
- [ ] **Step 2: REDを実行する。** Pで`node --test test/processingBudgetLedger.test.js`。Expected: ledger moduleが無くFAIL。
- [ ] **Step 3: Ledgerを実装する。** private operation/target/token Mapsとfrozen public shellを使用。leafから全operation ancestorsへのdebitsを先に検査し、全成功後だけmutationする。commitは全reservedを除いてactualを加える。失敗予約/0予約で空targetをattachしない。double finalizeをtyped errorにする。snapshotは13順/Unicode code-point順/deep freeze。複数APIのtransaction、target path解釈、cardinality cap等は追加しない。
- [ ] **Step 4: GREENを実行する。** Pで`npm run compile`と`node --test test/processingBudgetContracts.test.js test/processingBudgetDefinition.test.js test/processingBudgetLedger.test.js`。Expected: 全pass、各sequenceでnonnegative/safe/used=committed+reserved/operationと個別target<=limit/失敗時不変。2 target合計が単一target limitを超えても正しいsummaryは成功。未知object coercion counters0。偽receiverはprivate brandで拒否し、公開されていないtoken入力APIを新設しない。
- [ ] **Step 5: Task3をcommitする。** `feat: implement atomic processing budget reservations`。

## Task 4: explicit exports・3 consumer declarations・実tarball

**Files:** 上表Task4。

**Interfaces:** Consumes: Task1-3。Produces: package rootの明示export（Spec§4/6/7の定数/型/profile/error/ledger/report/reservation）、3 named fixtures、`test/helpers.js`の`loadRuntime`に加えて`freshArtifactRoot(label):absolutePath`と`packAndInstall(packageRoot,outputRoot):{tarball:ByteBinding,manifest:string[],consumerRoot:string,receipt:ByteBinding}`。さらに`publishCiArtifacts({head:40hex,tree:40hex,os:string,proof,outputRoot}):absolutePath`は実pack proofから3ファイルだけのpublish directoryを作る。helperはtest-only、runtime exportsへ含めない。fresh consumerのinstalled package rootを実行/型検証する。

CI artifactは`runtime.tgz`, `package-manifest.json`, `receipt.json`。receipt schema=`bob-builtin-analyze/processing-budget-ci-evidence/v1`、closed fields=`{schemaVersion,sourceHeadSha,sourceTreeSha,os,files,consumerResults,runtimeResult}`。filesはtgz/manifestの2 `{path,sha256,bytes}`でpathはこのdirectory内のlogical相対名だけ、consumerResultsは3 named fixtureごとのtypecheck成功のみ。runtimeResultはinstalled packageの専用valid-call probeによる`{state:'passed',entry:'out/index.js',checks:['constructor','reserve_commit','release','snapshot']}`で、negative type fixturesを実行済みとは記録しない。host absolute locatorは権限やreplay前提にしない。npm cache/consumer node_modules/未関係test artifactsをuploadしない。

- [ ] **Step 1: failing tests/fixturesを書く。** `packed_runtime_works_without_repository_out_or_dev_dependencies`, `packed_declarations_enforce_all_three_consumer_contracts`, `payload_is_exact_and_excludes_source_tests_and_stale_out`, `published_artifact_binds_actual_pack_without_host_path_dependency`。fixturesでwrong scope、unknown category、readonly mutationを`@ts-expect-error`にする。Bazaarだけ明示20/25/100/256 profile、他2つもreport discriminant/commit/releaseを型確認する。
  ```js
  assert.equal(packedManifest.includes('out/index.js'), true)
  assert.equal(packedManifest.includes('out/index.d.ts'), true)
  assert.equal(packedManifest.some(p=>/^(src|test|scripts|node_modules)\//.test(p)), false)
  assert.equal(installedLedger.snapshot().schema_version, 'processing-budget-ledger-report/v1')
  assert.notEqual(installedResolvedPath, repositoryOutPath)
  ```
- [ ] **Step 2: REDを実行する。** Pで`node --test test/packageContract.test.js`。Expected: index/実pack helperの未実装FAIL。dry-run file listだけで合格にしない。
- [ ] **Step 3: exports/pack helper/READMEを実装する。** indexはnamed exportsだけ。実`npm pack --json --ignore-scripts`は既compileを前提にfresh E rootへ出力し、packed tarballをfresh consumerへ`npm install --offline --ignore-scripts --no-audit --no-fund`で入れる。Node/npm CLIの引数arrayを用い、Windows shell文字列結合を避ける。fresh childでactual requireのresolved realpathがconsumer内のinstalled packageにあることをassertする。3fixtureをconsumerへcopyし、固定import specifierだけをpackage nameへ置換して、packageのTS compilerでconsumer tsconfigを--noEmit検証する。repo outの削除/renameやrepo宣言へのfallbackで証明しない。package.json/README/定義/schemaと5moduleのjs/d.ts/js.mapだけを許す。out偽fileはfixtureで拒否する。READMEには純粋library/atomic単位/二重計上/target identity/caller lifetime/非GUI/後続接続を明記する。
- [ ] **Step 4: GREENを実行する。** Pで`npm test`と`npm pack --json --pack-destination <fresh-resolved-root>`。Expected: full package/3type fixtures/installed runtime全pass、runtime prod deps0、実tgz hash/size/全payload pathsをreceipt化。package testは他拡張のoutやGit repoの存在に依存しない。自己packのループを防ぐためhelperのpackはignore-scripts、通常packのprepackはcompileを維持する。
- [ ] **Step 5: Task4をcommitする。** `feat: verify processing budget consumers and packed runtime`。

## Task 5: literal source admission・現行profile parity・5workflow実CI契約

**Files:** 上表Task5。Task1の`.gitattributes`に将来completion ruleがあることも確認する。

**Interfaces:** `PROCESSING_BUDGET_T13_SOURCE_PATHS`は23 literal paths、`PROCESSING_BUDGET_CONTROL_PATHS`は7 control paths。`processingBudgetT13SourceFiles():PathRow[]`はsourceRows23をPathRow化してcontrolRows5を加えたimmutable T13 baseの28rows、`processingBudgetCurrentSourceFiles():PathRow[]`は初期は同じbase、`validateProcessingBudgetCoverage(input):true`、`validateProcessingBudgetSourceAdmission(input):true`、`validateProcessingBudgetRepository(root=REPO_ROOT):void`をnew policyからexportする。T14/T15も同packageを使うため、将来は別の承認済みliteral layerをcurrent getterへ足し、T13 base/admission bytesを変えない。caller入力で任意layerを許可する仕組みは作らない。package inventoryはcurrent getterのpackage pathsから導き、未来にも永久に21pathsを強制しない。

Admission rootは`{schemaVersion,baseMainSha,baseTreeSha,sourceRows,controlRows,sourceCoverageDigest}`、schema=`bob-builtin-analyze/processing-budget-source-admission/v1`。sourceRowsは23の`{path,mode,beforeBlobSha,afterBlobSha,sourceItemIds}`。controlRowsはroot admission test/coverage JSON/exact-head JSON/exact-head test/.gitattributesの5 `PathRow`。policy/admission自身の2pathsは別literal allowlistで検査してself-hash cycleを避ける。Coverage rootは`{schemaVersion,baseMainSha,baseTreeSha,sourceUniverseSha256,selectionLedgerSha256,items,remainderClosure}`、schema=`bob-builtin-analyze/proc-t13-ledger-source-coverage/v1`。items23にはsourceItemId/origin(commit,path,blob)/target(path,blob,symbols,testPaths)/adaptationを持たせ、remainderClosureは既存675全rows/total675/unassigned0を持つ。

- [ ] **Step 1: failing root/CI testsを書く。** `t13_admission_is_literal_and_preserves_full_675_partition`, `current_bazaar_actual_export_matches_explicit_profile`, `five_workflow_contract_preserves_original_sixteen_jobs`, `processing_matrix_builds_actual_parity_inputs_before_tests`。fake extra source、bad mode/hash、変更されたOwner/Discovery baseline、unknown package path/aliasを拒否。old contractはD2の4workflow/16rowsとdeep equalで保持する。
  ```js
  assert.equal(coverage.items.length,23)
  assert.equal(coverage.remainderClosure.total,675)
  assert.equal(coverage.remainderClosure.unassigned,0)
  assert.deepEqual(contract.workflows.slice(0,4), baselineContract.workflows)
  assert.equal(contract.workflows.flatMap(x=>x.jobs).length,18)
  assert.equal(actualBazaarLimits.maxAggregateSourceBytes,100*1048576)
  ```
- [ ] **Step 2: REDを実行する。** rootで`node --test tools/main-consolidation/test/processingBudgetAdmissionPolicy.test.mjs scripts/exact-head-ci-contract.test.js`。Expected: new admission/new workflow/18-row契約の未実装FAIL。既存16契約の成功を消さない。
- [ ] **Step 3: source coverage/admissionを実装・sealする。** Spec§11の23 IDs/pathsとactual origin blobsを再取得。stale symbol2件をactual256-byte/operationChainへ適応した記録を持つ。current packageは固定generated node_modules/out以外をno-follow inventoryし、working/indexの差・canonical LF・source blobを照合する。sourceRows/controlRowsはindexのGit blob bytesからsealし、policyにcanonical admission/coverage SHA256を登録する。全3拡張tree不変は今回candidateの観測として検証し、未来のT14/T15にもD2 treeを永久強制するtestは作らない。現行Bazaar limit moduleのparityは引き続き守る。
- [ ] **Step 4: new workflow/contractを実装する。** workflow=`processing-budget-runtime.yml`、matrix job id=`test`、names=`Processing budget / ubuntu-latest`, `Processing budget / windows-latest`、Node22、10min deadline/read-only permissions。checkout=`34e114876b0b11c390a56381ad16ebd13914f8d5`、setup-node=`49933ea5288caeca8642d1e84afbd3f7d6820020`、upload-artifact=`cf430e030ddbb5b0abf93d22962f4752f3646cd9`（既存v7.0.2 pin）。全install/build前にexisting guardをroot cwdで実行し、dispatch expectedHeadSha/nonceとrun-name `wave0a-{sha}-{nonce}`を継承する。package npm ci/test/実pack後、Bazaar npm ci/compileを明示してからroot parity/admission testを実行する。actual Git HEAD/treeとguard済みheadを再比較してからTask4 publishCiArtifactsへ渡し、`processing-budget-runtime-${matrix.os}` artifactとして3ファイルだけをuploadする。pathsはP、7controls、`.gitattributes`、自workflow、guard、Bazaar limitsを含む。
- [ ] **Step 5: GREENを実行する。** Bazaar cwdでnpm ci/compile、Pでnpm test、rootでStep2とroot必須4（Task6列挙）、4生成器--check、Gate R--check。Expected: 全pass。exact-head旧testのcurrent totalsは18/17へ更新し、旧12原始jobs+4 evidence jobsの内容/順序/guardを厳密に残す。新CIは実行前なのでまだnot_run。実core.autocrlf checkoutで定義/生成/SchemaのLFを照合する。
- [ ] **Step 6: Task5 literal pathsをcommitする。** `ci: verify processing budget runtime and literal source coverage`。

## Task 6: 全品質・不変product証拠・source全体review

**Files:** Eのimmutable receipts/review、必要なfixは上のsource/testとseal。**Interfaces:** Consumes: committed T13 source、5workflow contract。Produces: reviewed exact candidate C_T13/tree、executed quality receipts、real package hashes、product parity observation。

- [ ] **Step 1: required checksを一巡する。** root必須4は`node --test scripts/exact-head-ci-contract.test.js tools/main-consolidation/test/featureIntegrationProgramPolicy.test.mjs tools/main-consolidation/test/featureIntegrationStatusPolicy.test.mjs tools/main-consolidation/test/featureSelectionLedgerPolicy.test.mjs`、加えてnew admissionとP full npm test。4生成器は`create-feature-integration-program-index.mjs`, `create-feature-selection-source-universe.mjs`, `create-feature-selection-ledger.mjs`, `create-feature-integration-status.mjs`の--check、Gate Rは`node tools/main-consolidation/run-gate-r.mjs --check`。Expected: 全0、runtime15/5effects0、旧12ref/nextT13。件数はactual値で記録し、過去126を流用しない。
- [ ] **Step 2: 3拡張quality/policiesを確認する。** 各cwdのcompile、dependency:policy、architecture:policy、source:policy、unused:report、audit:prod、test。workflow追加schema:policy/runtime-reachability、Bazaar追加artifact:policy/unused:policy。Expected: 全0。missing scriptを作ってpass扱いしない。full3拡張suiteとGate Rは同時に走らせず、現在のtime budgetを維持する。既に同一treeで実行済みならidentityを付して再利用し、理由なくbroad再実行しない。
- [ ] **Step 3: actual artifactsとproduct parityを固定する。** local package tgz/manifest/installed require/declarations/Node versionをcapture。D2..candidateのextensions tree、package/locks/compaction/admission bytesが不変、current Bazaar実exportとOOXML/GUI/CCR focused existing testsが維持されることを確認する。CIの3VSIX package/policy結果もTask7で受け取る。別hashへD1 native UATを転用せず、今回のinstalled extension UATはno changed surfaceとして未実行を明記する。Expected: 23対応/全675/unassigned0、product source差分0、root packageだけが新機能。
- [ ] **Step 4: source全体を一度fresh reviewする。** D2..candidate immutable diff、設計/計画、23対応、new package actual proof、current product不変、Review Focus5点を最小packageで渡す。Expected: Critical/Important/MinorとDeclined to judgeを得る。主スレッド実装、per-task reviewerなし。
- [ ] **Step 5: one TDD fix passを行う。** Critical/Importantは再現test RED→最小fix→GREEN/全affected suite、admission/coverage sealとpack証拠も必要範囲で更新。Minorはdefer。Declined to judgeは効果・判断・間違った場合のcostをledger化。Expected: unresolved Critical/Important0、追加reviewなし。
- [ ] **Step 6: candidateを固定する。** source変更があればliteral stageで`fix: close processing budget review findings`。full diffが予定32paths内、old12prefix/20catalog/primary protected status不変を確認。Expected: clean worktree、C_T13とtreeを記録、空commitなし。

## Task 7: source C承認・5workflow実CI・通常merge S1

**Files:** GitHubとEのみ。**Interfaces:** Consumes: Task6 fixed C_T13/tree。Produces: exact candidate18success、normal source main S1、exact-main17success+legacy skip1、raw job/log/artifact/coverage closure。非製品コードの観測taskなので、CI結果を人工的にREDにしない。

- [ ] **Step 1: review可能なsource候補を提示してC承認を得る。** repository/branch、C_T13/tree、32paths、review/local proof、push/PR作成/同headの実CIと通常merge/main同期までの具体的影響を提示する。Expected: 新しい自然文承認がこのscopeへ対応する。承認前はremoteを変更しない。追加hash/nonceの利用者転記は求めない。
- [ ] **Step 2: push/PR作成・attachを行う。** ordinary push、main向けPR、本文はpackage behavior/現行profile保持/inactive/実CI待ちを--body-fileで記す。Expected: actual PR URL、直後にattach_artifact、head=C_T13。mainが進んでいれば上流をrevertせず差分/対象を再評価し、候補・証拠を更新する。
- [ ] **Step 3: candidate実CIを受け入れる。** 5workflow/18 successful jobs、actual checkout SHA、run ID/attempt/job/runner/log hashes、両OSの実package/consumer receiptsをcaptureする。missingだけsame-head32hex nonce dispatch。Expected: 全実成功。queued/起動前失敗/403/job state不整合はそのまま保持し、実conclusionが揃うまで成功としない。rerunはfull workflowなら全jobの新attempt、部分rerunならjobごとの元attemptを記録する。
- [ ] **Step 4: CIが実行コード失敗なら必要範囲を直す。** source scope内でTDD fix/affected checks/seal/package更新。Expected: 新C_T13が固定され、新headに必要なC承認と実CIが対応する。source reviewは増やさず、追加CI fixesのobserved TDDを記録する。外部起動制約でのみ止まる時は完成候補・実失敗を提示し、今回固有の例外判断を求める。旧CI免除は使わない。
- [ ] **Step 5: 通常mergeと保全FFを行う。** 承認済みexact headでadmin/fake statusなしのnormal merge、S1.parents/tree/C_T13関係を確認。primary branch/head/status/Owner raw bytesを直前直後比較し、未checkout local mainだけ非force FFする。Expected: user作業15件を保持し、source worktree/branch/profiles/receiptsを残す。
- [ ] **Step 6: source main実CIとclosureを固定する。** 同5workflowで17実成功+既存PR-only metrics skip1、両OSactual package/consumer results、current source subject S1をcapture。`sourceObservation`をimmutable closureへまとめ、全ByteBindingをread-only再hashする。Expected: actual normal S1受入、23/675/0/old12/10of20/nextT13のまま。formal ordinal11はTask8まで更新しない。

## Task 8: S1をsubjectにする別metadata M2

**Files:** 上表Task8の5pathsだけ。sourceと同時に進めず、S1受入後にmanaged metadata worktree=`C:/Users/stell/.codex/worktrees/v2-processing-ledger-completion/bob_builtin_analyze`、branch=`codex/v2-processing-ledger-completion`をS1から作り、sourceの継続worktreeを保持する。native toolのactual pathとclean S1を確認し、同じplanのsource ledger/receiptsを保持してTask8の継続位置を記録する。

**Interfaces:** schema=`bob-builtin-analyze/proc-t13-ledger-completion/v1`、record.boundaryId=`PROC-T13-LEDGER`（logical boundaryのPROCESSING-FOUNDATIONと混同しない）。Rootは既存Discovery completionのclosed24 keysを踏襲して`discovery`を`processingBudget`へ置換する。processingBudgetはclosed9 ByteBindings `{sourceCoverage,remainderClosure,definition,profile,ledger,consumers,packaging,crossPlatform,currentProductParity}`。base fieldsはactual C_T13/S1/tree/parents/PR/CI/レビュー/保全を使う。packagesはactual source CIの3VSIX記録とし、新npm artifactsはprocessingBudget.packagingで区別する。installedUatはclosed `{state:'not_required',executed:false,reason:'unchanged_extension_source_and_packaging_inputs',changedProductPaths:0,historicalCompletionSha256}`として既存D1 completion hashを参照するだけで、新VSIXへのnative成功を主張しない。GUI/live model/finalProgramUATはnot_run。

- [ ] **Step 1: actual closureをcaptureしmetadata REDを書く。** canonical JSONはTask7 sourceObservationからだけ作り、registry未登録で新6 testsを追加する: `t13_completion_preserves_twelve_reference_prefix`, `t13_completion_binds_source_not_metadata`, `t13_rejects_missing_or_forged_package_ci_and_parity`, `t13_does_not_complete_processing_foundation_or_activate_runtime`, `t13_generator_requires_one_canonical_completion`, `t13_completion_lf_survives_real_index_checkout`。
  ```js
  assert.deepEqual(status.completionReferences.slice(0,12), previousTwelve)
  assert.equal(status.completionReferences.length,13)
  assert.equal(status.slices.filter(x=>x.state==='VERIFIED').length,11)
  assert.equal(status.nextSliceId,'PROC-T14-BOUNDED-DOC')
  assert.equal(status.boundaries.find(x=>x.id==='PROCESSING-FOUNDATION').state,'planned')
  assert.equal(status.acceptedMainSha,sourceS1)
  ```
- [ ] **Step 2: REDを観測する。** new6 testsをtest-name-patternで実行。Expected: 未登録schema/completion/13ref投影でFAIL。旧baseline full suiteはGREEN時に確認する。LF test用completionだけ先にliteral stageする。
- [ ] **Step 3: closed validator/registry/generatorを実装する。** status policyに`validateT13Completion(record):void`を追加し、source23/675/0、13definition/profile/256target、packed artifacts/3type contracts、現行product不変、candidate18/main17+metrics1、no inherited waiver、one fresh review、各実ByteBindingとwhole record/evidence-map SHAを個別に検証して13番目を登録する。common dispatcherにはこのschema/boundaryのclosed24 keysだけを追加する。installedUatのnot_requiredはchangedProductPaths0/packaging inputs不変/executed falseの場合だけ許し、native実行成功へ昇格しない。generatorはnew completionをliteral pathで一度読む。旧12registry hashes/reference bytesと過去Discoveryの16job観測を変更しない。reference.boundaryIdはT13sliceなのでexisting projectionにlogical Processing boundaryのpromotionは追加しない。
- [ ] **Step 4: GREENとmetadata独立reviewを行う。** new6→full status/root必須4、4生成器--check、Gate R15、new admission、P npm test、diff --check。current generator出力を読む旧4 assertionsだけ13ref/nextT14へ更新し、`throughDiscovery` historical12ref assertionsは保持する。Expected: 全pass、5pathsのみ、source/control seals不変。immutable metadata diffとactual S1 closureを一度fresh review、C/Iは一回TDD fix pass、Minorはdefer。source reviewは繰り返さない。
- [ ] **Step 5: metadata candidateを準備してC承認を得る。** 5 literal pathsを`docs: record verified processing budget ledger completion`でlocal commitし、actual metadata head/tree/diff/レビュー/検証とpush/PR/実CI/通常merge/main同期の影響を提示。Expected: この具体的candidateに対応する新しいC承認。sourceのC/waiverを勝手に継承しない。
- [ ] **Step 6: metadata PR・実CI・normal M2 merge。** push/create/attach、5workflow18candidate成功、normal merge parents/tree、main17実成功+metrics skip1を確認。missingは同head/nonce dispatch。Expected: actual resultsが一致、admin/fake successなし。M2の証拠をS1 source subjectへ書き替えない。
- [ ] **Step 7: 最終確認して完了を記録する。** isolated metadata treeをM2へFF、primary user checkoutを保ってlocal main refをFF、root必須4/4生成器/new admission/P npm test/Gate R15と全physical bindingsを確認する。Expected: 13refs/20slices/11VERIFIED/55%/nextT14、WORKFLOW-C-SAFE-PREFIX verified、PROCESSING-FOUNDATION planned、runtime inactive/five effects0、旧12prefix、全worktree/profiles/branches/user statusを保持。named checks実行後はaggregate receipt checkerでtask-doneし、判断/deferred minorsを完了記録へ残す。

## Self-review / Spec coverage

Spec§1-3/11のscope/provenanceはTasks5/7、§4はTasks1/2、§5はTasks2/4/5/6、§6-7はTasks2/3、§8はTasks1/4/5、§9はTasks1-8、§10はTasks7/8へ対応する。Review Focus各5行はTask2/3/4/5/8のnamed testsに割当済み。T13をlogical境界と誤って扱う投影、独立package testへのBazaar out依存、source後のLF/seal drift、旧12refsを書き換えるcurrent generator更新、future同package layerを永久禁止する検査を避けるinterfacesを明示した。

設計書は承認済みだが、この計画は書面レビュー前の案である。実装は計画承認後に始める。8tasksの主スレッド方式・source/metadata各一度reviewを確認してからexecuting-plansへ引き継ぐ。
