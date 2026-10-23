# PROC-T13-LEDGER 詳細設計

- 状態: 書面レビュー用の設計案。製品実装・dependency install・remote操作は未着手。
- 日付: 2026-10-23（Asia/Tokyo）
- Repository: `katamor1/bob_builtin_analyze`
- Slice: `PROC-T13-LEDGER`、static20のordinal11、boundary `PROCESSING-FOUNDATION`
- 起点main: `aa25f00f98c41c5aebdb30c68cdc967a1d205ab5`（Discovery metadata D2）
- 起点tree: `fc869e3735b5ddcad3dcf7e6892e290888656716`
- 継続worktree: `C:/Users/stell/.codex/worktrees/v2-processing-ledger/bob_builtin_analyze`
- 継続branch: `codex/v2-processing-ledger`

## 1. 目的・成功条件

既承認のV2移行roadmapに従い、Processingの最初の基盤として、13カテゴリの共通予算定義、profileの検証、予約・commit・releaseを行う台帳を一つの独立パッケージへ導入する。後続T14/T15が共有できる契約を作り、現行の抽出処理・GUI・VSIXの動作は維持する。

利用者が指示したのは既存V2計画の続行である。今回の具体化は、選択台帳の23 source itemsをT13に限定して再構成すること、現行Bazaarの上限を保持すること、既存WORKFLOW-C-SAFE-PREFIXを受け入れたmainを前提にすることとする。独立packageだけを導入する方式を本設計の提案とし、書面承認前に製品コードを書かない。

成功条件は、23項目の出典対応、13カテゴリの生成物一致、不正profile拒否、各予約chainのatomic性、3 consumer型契約、packed packageの実行、Ubuntu/Windows実CI、現行product不変の証明が揃うこと。source受入と別metadata受入の後だけ、11/20（55%）、next=`PROC-T14-BOUNDED-DOC`へ進める。

## 2. 範囲と方式

| 方式 | 利点 | 追加責務 | 今回の判断 |
| --- | --- | --- | --- |
| root独立package | 単一の生成・型・runtime・package authority。3拡張の既存buildを維持できる | 後続sliceが実consumer接続を行う | 採用案 |
| workflow-register配下を共有authorityにする | 既存compiler/buildを利用できる | 他拡張の独立配布と`rootDir: src`をまたぐ配布経路の設計が必要 | 今回は採用しない |
| 共通packageを同時に3拡張へ配布・接続する | 今回から製品で使用できる | 3 VSIX依存・parser adapter・aggregate入出力を同時に変更する | T14/T15以降の接続として分離 |

追加先は`packages/processing-budget-runtime/`。root npm workspaceは新設しない。現行3拡張のmanifest、lock、src、test、parser imports、GUI messages、許可済み圧縮対象は変更しない。Nodeプロセス内のlibraryであり、filesystem読取り、process生成、Bob/provider dispatch、artifact stage、run-directory作成、runtime V2のactivationを行わない。

T14のbounded document parser、T15のaggregate処理、T16以降のprocess/deadline/path/report/handoffは対象外。`PROCESSING-FOUNDATION`のboundary terminalはT13だけでVERIFIEDにしない。既存のGUI/live model/final Program UATを今回のpackage試験から成功扱いにしない。

## 3. 出典・現行authority

選択元は`tools/main-consolidation/feature-selection-source-universe.json`と`docs/release-evidence/feature-selection-ledger-2026-08-23.json`のprimaryOwner=`PROC-T13-LEDGER`に一致する23項目。origin commitは`bd29233dac84922e2f868dcb9d654644f6ee0d6a`、trancheは`processing-t13`。archive manifest SHA256は`36e477ee9b752ebf7f07a208c166fec24e14a89bf7ba6a7921cf6bdf708c9f31`、carrier patch SHA256は`6913ddddcffb150eb207aee99bdbbad158b4ed05e9c3ca8714693d31f6122536`。23 path/blob対応は読取り調査で一致し、consumer3 fixtureが同一blobなのでdistinct blobsは21である。

再構成はarchiveの契約を根拠に行い、archiveの製品既定値を現行productへ適用しない。固定source universe・disposition ledger・静的20件・旧12 completion referencesは変更しない。全675出典の既存分類を保持し、選択23件との対応と未分類0を検証する。675件の歴史的意味を今回再監査したとは記録しない。

Universeのsymbol metadataには、このexact origin blobに存在しない`MAX_PROCESSING_BUDGET_TARGET_CODE_UNITS`と`categoryChain`が含まれる。symbol metadataを実装証拠として扱わず、実blobの`PROCESSING_BUDGET_TARGET_MAX_UTF8_BYTES=256`と`operationChain`へ対応させ、その差をcoverageへ記録する。旧名称を復活させない。

## 4. 13カテゴリとprofile

MiBは1,048,576 bytes。定義JSONをsole authorityとし、TypeScript定数とnormalized-profile JSON Schemaを生成する。以下の順序・単位・scope・最大値を変更しない。

| category | scope | package default | absolute maximum | aggregate |
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

`managed_artifact_bytes`は出力でありoperation inputへ加算しない。定義生成時にclosed fields、13 ordered IDs、整数・scope・単位、aggregateの存在・単位・operation scope、循環不存在、child上限<=parent上限を検査する。`--check`は生成済みsource/schemaのexact LF bytesを比較する。

APIは`normalizeProcessingBudgetProfile(overrides?)`。入力は`{schema_version?,limits?:Partial<Record<Category,number>>}`、出力は`{schema_version:'processing-budget-profile/v1',limits:Readonly<Record<Category,number>>}`。入力なし・partial値をpackage defaultで補い、新しいdeep-frozen profileを返す。limitsはcanonical orderのnull-prototype own dataとする。

unknown/symbol/nonenumerable/inherited/accessor fields、不正schema、NaN/Infinity/unsafe/fractional/negative値、absolute超過、各child>immediate aggregateを拒否する。0は有効。own property descriptorsをsnapshotしgetterを呼ばない。Proxyのintrospection trapが失敗した場合もprofile_invalidへ収束するが、このAPIを任意JavaScriptのsandboxとは主張しない。

Schemaは完全なnormalized profileを表す。partial overridesはruntime API用でありSchemaへそのまま渡さない。Schemaだけでaggregate不等式を検証できるとは扱わない。

## 5. 現行Bazaar profileの保持

現行authorityは`extensions/bob-bazaar-review/src/ruleAuthoring/ruleAuthoringLimits.ts`のfrozen `DEFAULT_RULE_AUTHORING_LIMITS`である。主要値はsource20件、1件25 MiB、合計100 MiB、chunk32 KiB、sourceIndex/evidence/proposal各1 MiB、PDF32 MiB、OOXML5,000entries/declared250 MiB。これらを今回のpackage defaultへ置換しない。

Bazaar consumer fixtureで、将来のadapterが明示できるprofileの型と正規化を実証する。対応する3項目は`single_document_bytes=25 MiB`、`total_document_bytes=100 MiB`、`document_count=20`とし、正規化のparent制約を満たすためfixtureの`total_operation_input_bytes`を256 MiBと明示する。この256 MiBはfixture-onlyの組合せであり、現行Bazaarに新しいaggregate上限を適用するものではない。T15は実input chain・同一materialの二重計上防止を別途設計し、必要な明示profileを決める。

現行値とのparity試験は新root admission testでD2とcandidateの`ruleAuthoringLimits.ts` Git blob不変を検査し、isolated build済みBazaarの実exportが上記値を持つことを検証する。同じ実export値を明示overrideへ写してprofileを正規化する。package単体のunit/type/packed-runtime試験は製品checkoutや他拡張のoutがなくても成立させる。現行3consumerのfixtureはdeclaration契約であり、実拡張への接続成功とは記録しない。

現行OOXML validated Buffer、CRC/size/fingerprint checks、XLSX minimal-style補修、lazy parser、GUIのhost error sanitization/consentは保持する。CCRの5/50 MiB documentや64 KiB/1 MiB excerptなど、製品ごとの設定も保持する。現行コードを「すべての読取り前に台帳予約する実装」とは主張しない。

## 6. Ledger・予約・snapshot契約

公開APIは`new ProcessingBudgetLedger(profile?)`、readonly `profile`、`reserve(operationCategory,amount)`、`reserveForTarget(targetCategory,target,amount)`、`snapshot()`。reservationはreadonly `category/target?/amount`、`commit(actualAmount?)`、`release()`。内部state・tokenはprivateで、public shellはfreezeする。公開exportは明示列挙し、export-starは使わない。

`target`はnonemptyかつ最大256 UTF-8 bytesのopaque stringである。path resolution、normalization、Unicode正規化、file identityの推定はしない。Unicode境界試験でUTF-16 code-unit数と混同しない。targetの命名・document/sheet等のgranularityと一意性はcallerの責任である。

予約ごとにleafとすべてのoperation ancestorsを列挙し、全stateの`committed+reserved+amount<=limit`とsafe整数を検査してからまとめてreservedを増やす。途中の超過・overflowは全state不変。失敗予約でtarget stateをattachしない。0予約で新targetのsnapshot rowを作らない。

`commit()`は予約量を使用し、`commit(actual)`は0<=actual<=reservedだけ許す。成功時は全debitから予約量全体を除きactualをcommittedへ加える。無効commitはstate不変で予約をopenに保つ。releaseは全予約分を戻す。finalizeは一度だけで、再commit/releaseはreservation_finalized。reservationの所有tokenを偽造・他ledgerへ転用できない。

Atomicなのは一つの予約chainである。document_countとbytes等の複数API呼出しを一括transactionにするAPIは追加しない。leafとそのaggregateを同一materialについて両方reserveすると二重計上になるためcallerが防ぐ。reset、timeout、cancel hook、commit後の巻戻し、永続化、operation identityは追加しない。

`snapshot()`は`processing-budget-ledger-report/v1`のdeep-frozen `{schema_version,categories,targets}`。categoriesは13順でcategory/unit/limit/committed/reserved/usedを持つ。operation rowはscope/remaining、target category summaryはscope/target_countを持ちremainingを持たない。target summaryの合計usedが単一target上限を超えることを許す。targetsはcategory順、次にUnicode code-point順でtargetごとのremainingを持つ。0状態のtargetはfinalization後に除去する。

snapshotは会計stateを省略・truncateしない。open reservation数、target state数、台帳寿命はcaller管理であり、package単体が任意回数の呼出し・全metadataのRSS・snapshot JSON bytesを独立に制限するとは主張しない。製品でのdocument_count/total_sheets等の複数予約と出力byte制限は後続adapter/reportの責務として残す。

## 7. エラーと不正入力

`ProcessingBudgetError`と9 codeを保持する: `processing_budget_profile_invalid`, `category_invalid`, `target_required`, `target_invalid`, `reservation_invalid`, `exceeded`, `commit_invalid`, `reservation_finalized`, `internal_invariant`（後者8件にも`processing_budget_`を前置）。detailsはfrozen、許可したtargetCategory/target/constrainedCategory/limit/observedのみとする。診断のunsafeな合計値はundefinedにし、会計計算のoverflowを診断表示のために確定させない。

archiveの転用にあたり、APIが生成する失敗文言へ未知objectの`String(value)`/toString/valueOfや無制限の未知key/category文字列を取り込まない。known enum、検証済み256-byte target、安全な有限整数だけを必要なdetailsへ入れ、未知値は固定文言で拒否する。profile/ledger APIの内部エラー文言はUTF-8で512 bytes以下を試験する。callerが任意に直接構築したErrorをlibraryがsandboxする契約は持たない。

テストは不正category/object・throwing coercion・getterのside-effect countersが0のままtyped errorへなることを含む。GUIへ直接errorやsnapshotを送らず、将来のadapterも既存host sanitizationを通す。

## 8. パッケージ・CI・literal source admission

packageはprivate `@bob/processing-budget-runtime@0.1.0`、Node>=20、runtime production dependenciesなし、TypeScript devDependency `5.9.3`をexact pin、lock v3、CommonJS ES2022/strict、`out/index.js`とdeclarations。payloadはcontracts/out/schema/READMEとnpm必須metadataのpackage.jsonを明示し、source/test/node_modulesを配布しない。outは選択した5 source modulesからのJS/declarations/mapsだけを許し、未知の残存outファイルもpack試験で拒否する。package scriptsはcontracts generate/check、compile、consumer typecheck、test、prepackを持つ。extension compilerへroot TSを直接includeしない。

root `.gitignore`は現行内容を保ってこのpackageのnode_modules/outのliteral2行だけを追加する。`.gitattributes`は定義JSON・生成source/schemaなどcanonical管理対象と、後述のcompletion pathのliteral LF規則をsource段階で追加する。completion JSONやregistry自体をsource段階で追加することはない。これにより後続metadataでsource-sealed attributesの変更を要しない。VSIX圧縮対象・上限・extensionsのlock/versions/depsは維持する。

新`processing-budget-runtime.yml`はUbuntu/Windows、Node22、既存レビュー済みfull-SHAのcheckout/setup-node pinsを再利用し、packageのnpm ci/test、実`npm pack`とfresh consumer rootでのpackage root require/declaration確認、契約・coverage/admission検証を行う。tarballはfresh rootへ`--offline --ignore-scripts --no-audit --no-fund`のlocal installationで検証し、registryへpublishしない。`npm pack --dry-run`だけではpacked runtime成功としない。pack/install先は実装計画でresolved fresh rootを固定し、既存artifactを上書きしない。新rootの現行profile parity testより前に、両OSともBazaarの既存lockでnpm ci/compileして実exportを用意する。package本体のテストが他拡張の未compile outに依存する構造にはしない。

全jobはdependency取得や生成前に既存`verify-ci-head.js`を使い、PR head/push head/dispatch head+32hex nonceの実checkoutを確認する。新workflow idは`processing-budget-runtime`、2job名は`Processing budget / ubuntu-latest`と`Processing budget / windows-latest`とする。exact-head契約へ加え、旧4workflow/16jobを維持して5workflow/18jobとする。PR18成功、main/dispatchは既存metrics条件に従い17実成功+metrics skip1。新workflowのpathsにはpackage、literal T13 control filesと`.gitattributes`を含める。run ID/attempt/job ID/runner/log hash/actual checkoutを記録し、run表示だけでjob成功を推測しない。missing workflowは同SHA/nonce dispatch、API不整合の再実行はattempt provenanceを分ける。

新root policy `processingBudgetAdmissionPolicy.mjs`とliteral `processing-budget-source-admission.json`、`test/processingBudgetAdmissionPolicy.test.mjs`、`docs/release-evidence/proc-t13-ledger-source-coverage-2026-10-23.json`を用意する。package21pathsとrootの`.gitignore`/workflowが23出典へ対応し、追加control files（このpolicy/admission/test/coverage、exact-head契約/test、`.gitattributes`）をliteral列挙する。設計文書と後続の`docs/superpowers/plans/2026-10-23-proc-t13-ledger.md`も文書上の承認対象として別に記録する。base D2/tree・before/after Git blob・mode・sourceItemIdsを束縛する。自己hash依存は避け、policy自身などのcontrol pathは独立literal allowlistで検証する。packageのsource inventoryはsymbolic link/reparse aliasを拒否し、固定のnode_modules/outだけをgenerated領域としてsource scanから除外する。archive source IDsの足し引きやwildcard許可はしない。

既存Gate R/Owner57/upstream/Discovery11+root37 admission bytesは不変。Gate Rのexisting extension/tools scanningを縮小しない。新packageの厳密なpath/payload検証はT13側が追加で担当し、source universeに無いpackageファイルや非対象product差分を拒否する。

## 9. RED/GREEN・受入証拠

実装計画ではnamed testsとliteral filesをtaskへ落とし込み、各新contractの不在を先にREDで確認する。独立実装者は増やさず、主スレッド方式を継続する案とする。source全体のfresh reviewを一度、別metadata reviewを一度行う。Critical/Importantは一回のTDD fix pass、Minorは記録し便乗修正しない。

| 対象 | 必須の反証・検証 |
| --- | --- |
| definition/generation | ordered13、正確なdefault/max/aggregate、unknown/重複/循環/不正単位拒否、生成1byte drift拒否 |
| profile | 0/上限/plus1、非整数・unsafe・schema/own-data違反、getter/coercion、child-parent不等式、immutable snapshot |
| ledger | 全13カテゴリboundary、祖先超過時の全state不変、同時open予約のcontention、commit縮小・release、無効commit後release、double finalize、overflow、偽token、0予約、target256 UTF-8、Unicode code-point sort |
| property sequences | deterministic sequenceで非負・safe・used=committed+reserved・operation<=limit・個別target<=limit・失敗時不変を検査 |
| consumers/package | 3 named consumer型契約、Bazaar explicit profile、実tarballのruntime/declarations、runtime依存なし、payload allowlist、未compile時は失敗 |
| 既存product | D2との差分がextensions0、versions/locks/deps/compaction不変、現行Bazaar実export上限・OOXML/GUI/error consentの既存試験、CCR size/evidence試験、runtime V2 reachability/Gate R15/5effects0 |
| repository | root必須4、4生成器--check、T13 coverage/admission、新CI exact-head tests、diff --check、full affected package/3拡張品質・実CI |

source review focusは、複数予約とchain atomicityの混同、target summaryのremaining欠落を誤補完しないこと、actual<=reservedと失敗時不変、leaf/aggregate二重計上、descriptor/coercion攻撃、package実artifactとtype fixtureだけの証拠差、現行profile/GUI/OOXML不変、metadataが別sourceをsubjectにしないこと。

今回extension payloadは変更しないため、新しいVSIXへのpackage接続やinstalled ledger UATを実施済みとは記録しない。3拡張の実CI品質/package gatesとproduct Git blob不変を確認し、必要に応じ実VSIX payloadを比較する。既存D1のnative証拠はそのhashを持つ歴史的証拠のまま保持し、別hashへ転用しない。最終3拡張実機UATはFINAL-VALIDATIONで別に実施する。

## 10. sourceと完了metadata・承認・保全

設計承認後に詳細実装計画を作り、その書面承認と実行方式の確認後に限定local実装へ進む。新規依存取得は計画に明示した公開registryからのreadだけとし、credential取得・telemetry・publishは含めない。

現在のrisk authorityは`docs/superpowers/specs/2026-08-31-wave0a-risk-tiered-approval-and-evidence-design.md`である。旧request-hash/provider transcript転記方式はhistorical onlyで、利用者へhash/nonceの転記を求めない。local Bの承認とremote/PR/main影響のCを区別する。具体的な候補が整いレビュー可能になった後、C操作の実対象・影響を提示して必要な新しい承認を得る。設計の承認をまだ存在しない実装・remote候補の承認に拡張しない。

source候補C_T13とそのtreeを検証・review・実CIで固定し、通常mergeしたsource main S1のparents/treeとexact-main CIを確認する。remote/main操作は上記C範囲に含める。起動前失敗・queued・API403・実行失敗を成功としない。過去sliceのCI免除は継承しない。

S1受入後、別metadataで`docs/release-evidence/proc-t13-ledger-completion-2026-10-23.json`へcompletion schema `bob-builtin-analyze/proc-t13-ledger-completion/v1`、source C_T13/S1/tree/parents、23出典対応・全675分類、実package/consumer/CI/不変product証拠をclosed byte/hash/size bindingsとして登録する。metadata差分はこのcompletion、既存status policy/generator/test、生成statusの5pathsに限定し、source段階で用意済みのLF規則は変更しない。historical replayは元hostの絶対pathの存在を要求せず、捕捉時の実bytesを記録する。旧Discoveryを含む12 references/evidence hashesをprefixのまま保持して13件にし、static20/ordinal11だけを追加VERIFIED、11/20、nextT14へ投影する。新completionのsubjectへmetadata main M2を使わない。

metadataも独立review・exact-head CI・通常merge・exact-main確認を行う。旧Discoveryの4workflow/16jobという歴史的観測を書き換えて新5workflow/18jobへ合わせない。Processing境界はまだplanned、future R3-R5はinactive/R6 absent、runtime V2 inactive、automatic cleanup/mutationAuthority falseを維持する。

primaryは現在ユーザーの`codex/bob-auto-response-probe`でありswitch/resetしない。現在の未追跡15件とOwner57 raw bytesを前後snapshotで保持し、必要なlocal main同期は未checkout refの非force FFだけを使う。既存source/metadata worktree、branches、VSIX、native profiles、receiptsはすべて保持する。保護済み`.integration-xlsx-on-prereq/`、`docs/analysis/`、指定premium計画の内容を読まない。

## 11. 23出典の対応表

各source IDには`source-`を前置する。package相対pathには`packages/processing-budget-runtime/`を前置する。actual origin blobはsource universeの固定値をcoverageへ保存する。

| source suffix | target path |
| --- | --- |
| `0ddab8f0a7385edb664ff6c5` | `src/generatedProcessingBudgetDefinition.ts` |
| `116ffcb1708dfab88771d924` | `scripts/generate-processing-budget-contracts.js` |
| `1af7f2371abe4195022a0223` | `test/fixtures/bob-bazaar-review-consumer.ts` |
| `1bed1bc5c87559b5e30af777` | `test/processingBudgetContracts.test.js` |
| `2a80aed4ccf00e64fa21313e` | `test/processingBudgetDefinition.test.js` |
| `2dc2cff4c648616a169fa711` | `package.json` |
| `3f97c2ee47589e0c7df351d0` | `tsconfig.json` |
| `5320828c1887a20eaf46dd64` | `src/processingBudgetError.ts` |
| `5a8f885cd31ff13f1f53864a` | `test/helpers.js` |
| `5df63668a86d46592ab24aa5` | root `.gitignore`（限定2行） |
| `60f1d8d32af58e3c1772b1d1` | `test/packageContract.test.js` |
| `6ea58dc2902ca040cae5f75f` | `src/index.ts` |
| `75bd0042a5f39793d323ed37` | `test/fixtures/workflow-register-consumer.ts` |
| `80994c711887d22f843b9eff` | `src/processingBudgetProfile.ts` |
| `9f42d0f519b0985a176778aa` | root `.github/workflows/processing-budget-runtime.yml` |
| `a8286a3ff1ab7a81e19604a5` | `README.md` |
| `b6f88ff9b6c95adcacaded9e` | `test/fixtures/tsconfig.json` |
| `bc5ca26554439a83438dd5e7` | `src/processingBudgetLedger.ts` |
| `c87b9592a9003fb1046dad54` | `test/fixtures/bob-code-consistency-review-consumer.ts` |
| `db81d68332957cd43752ade9` | `test/processingBudgetLedger.test.js` |
| `dbf0e78300057ea404011413` | `contracts/processing-budget-definition.v1.json` |
| `df3ef033dd61514f10966848` | `schema/processing-budget-profile.v1.schema.json` |
| `e050742b7b51a7e281552c43` | `package-lock.json` |

## 12. 設計の自己点検

23件/21distinct blobs、13カテゴリ、現行Bazaar profileとfixture-only parent値、chain単位atomicity、UTF-8 target256、非sandbox境界、実packと型fixtureの証拠差、旧12参照/新13参照、18/17実CI、source S1/metadata M2の区別を明示した。T14/T15接続・parser/GUI変更・metadata cardinality上限の新設を今回へ含めていない。未確定の製品値をpackage defaultで埋めることもない。実装計画はまだ作成しておらず、書面設計の承認が次のgateである。
