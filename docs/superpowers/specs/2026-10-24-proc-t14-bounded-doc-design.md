# PROC-T14-BOUNDED-DOC 詳細設計

日付: 2026-10-24（Asia/Tokyo）
状態: 設計案。製品実装・依存取得・remote操作は未開始。

## 1. 目的と正本

V2移行のmandatory slice ordinal12、`PROC-T14-BOUNDED-DOC`を実施する。T13で受入済みの13カテゴリ台帳を利用し、文書の原本bytesを読取り前に制限する。現行BazaarのOOXML snapshot検証を共有packageへ所有移設し、BazaarとCode Consistency Review（CCR）のDOCX/XLSX解析を、検証済みBufferと必須の解析後再検査を持つ一つのcallback境界へ接続する。

正本は、選別設計`docs/superpowers/specs/2026-08-23-feature-selection-and-sequential-main-integration-design.md` §7.3/§10.1、immutable selection ledger/source universe、およびT13受入済みmainである。基準main M2は`0e806d48dfdd3136f47f36218b72fba1cfb4c4fd`。基準treeは`7623f90470a16145cdcb8d641959e18856820f67`。T13 source main `4ca80105eceb75f9192f8a94d5203a8883c05a26`とmetadata main M2は別subjectとして保持する。

成功条件は、39 source itemsの対応、current-main OOXMLのparity、bounded原本読取り、CCRのpath parser入力撤去、同一compiled runtimeの実配布、Ubuntu/Windows実CI、sourceと別metadataの受入が揃うことである。metadata受入後だけ12/20（60%）、14 completion references、next=`PROC-T15-AGGREGATE`とする。T14単独で`PROCESSING-FOUNDATION`をVERIFIEDにしない。

## 2. 現状と対象範囲

M2で共有packageに存在するのはdefinition/profile/error/ledger/indexの5モジュールで、拡張はまだ利用していない。Bazaarの`ooxmlArchive.ts`と`ooxmlPreflight.ts`がsnapshot、ZIP32検証、bounded inflate/CRC、XLSX補修を所有する。BazaarのDOCX/XLSX parserには既にBufferを渡すが、元handleはprepare終了時に閉じられ、後段fingerprintは拡張側の責務である。最初の`fingerprintSource()`にはbyte ceilingがなく、全体のsource上限を判定する前にhashを読む。

CCRのDOCX/XLSX extractorはstat後にparserへpathを渡す。Markdownはstatに基づく単回readと先頭切詰めを行う。さらに`core/reviewInputDiscovery.ts`に別のXLSX path parserと全文Markdown読取りがある。discoveryはwizard、review-input command、review-input AI draft、traceability AI draftから使われるため、抽出経路だけの変更では迂回経路が残る。

今回含めるもの:

- shared packageのbounded原本読取り・fingerprint、current-main OOXML owner移設、callback API、型・実package・copyの契約。
- Bazaarのfingerprint ceiling伝播とDOCX/XLSX callback接続。PDF/legacyの既存分類は保持する。
- CCRのDOCX/XLSX Buffer移行、Markdownのoversize原本拒否、同じbounded境界を通るdiscovery。discovery関連はsource universeにarchive itemがないため、追加のcurrent-main安全前提として別区分に記録する。
- literal admission layer、CI/build wiring、parity/architecture tests、source受入と別completion metadata。

T15のoperation単位document/sheet/row aggregate、pre-parser cancellation orchestration、T16のprocess/stdout/stderr/diff/excerpt/Bob/artifact accounting、T17のabsolute deadline/完全なphysical path adapter、T18のreport/complete-only handoffは含めない。PDF process実装、GUI構成、V1/V2 runtime activation、R3–R6は変更しない。全体処理時間・RSS・全filesystem raceへの完全耐性や、最終Program UAT成功を主張しない。

## 3. 採用する方式と判断

| 方式 | 利点 | 採否と理由 |
| --- | --- | --- |
| current-mainのOOXML ownerを共有packageへ移し、両拡張をcallbackへ接続 | 既存の厳密なZIP検証・補修を維持でき、解析後検査を省略できない | 採用。承認済み選別仕様が指定する方式 |
| archiveのbounded-file/ZIP実装とconsumerを直接移植 | 既存の予算試験を再利用しやすい | 不採用。handle寿命、解析後SHA、deflate全入力消費、公開上限の会計が現行契約と異なる |
| 各拡張へ安全処理を複製する、または独立libraryのままにする | consumer変更を局所化できる | 不採用。唯一ownerとCCR移行を満たさず、既知のpath parser経路が残る |

実装言語は既存と同じTypeScript/CommonJS、Node>=20、compilerは既存の5.9.3とする。archiveのruntime/*.jsという配置は採らず、current-mainのTypeScriptをpackageのinternal sourceへ移し、同じcompiler出力を配布する。旧JS copy工程は通常のTS emitと明示payload manifestへ適応する。これは実装者の判断であり、archiveのAPI/配置を承認済みと読み替えない。

### 3.1 原本と展開bytesの会計

ここはarchiveから意図的に適応する。archiveは圧縮原本Cと展開entry合計Eを`single_document_bytes`の別targetへ計上して同じaggregateに加え、各entryにも原本上限25 MiBを課す。現行Bazaarは原本25 MiB、展開合計250 MiBで、独立した25 MiB entry上限はない。たとえばC=10 MiB/E=245 MiBや60 MiBの単一entryをarchive方式は新たに拒否する。25+250 MiBはT13 aggregate最大256 MiBも超えるため、profile overrideでは解決しない。

公開上限を維持するため、T14では解析対象として受け入れる原本bytesを`single_document_bytes`へ一度だけ計上する。祖先`total_document_bytes`と`total_operation_input_bytes`は台帳の自動debitだけとし、手動で重複reserveしない。ZIP展開bytesは同じ原本の派生表現であり、13カテゴリの別入力として加算しない。既存preflightのentry数・central directory・展開合計上限と、実inflate長/CRC/全入力消費で独立に検証する。検証済み`entryCount/declaredExpandedBytes/actualExpandedBytes`は構造検査の観測値で、台帳残量や新しいcategoryではない。

上記は実装者の判断として本設計の承認対象に含める。archiveの「展開entryのledger debit」試験をそのまま成功と主張せず、coverageに非採用理由と代わりの原本一回計上・構造上限parity試験を明記する。13カテゴリ定義/default/maxは変更しない。T15のoperation集約を先取りせず、T14 consumerは一文書の独立ledgerを使う。fingerprint用の事前/事後再読取りは同一論理入力を再加算せず、物理I/O量を13カテゴリで報告しているとは扱わない。

## 4. 所有権とAPI

packageの新sourceを`src/boundedDocumentIo.ts`、`src/internal/boundedDocumentFile.ts`、`src/internal/ooxmlPreflight.ts`、`src/internal/ooxmlParserInput.ts`へ分ける。既存T13のdefinition/profile/ledger/errorは正本のまま再利用する。module分割の小調整はbuilderに委ねるが、ZIP/normalization ownerを複製しない。

型付きpublic APIはbounded原本snapshotとfingerprint、ledgerの既存APIに限定する。OOXMLの製品向け内部facadeは次とする:

```ts
withValidatedOoxmlParserInput<T>(
  request: ValidatedOoxmlParserRequest,
  parse: (input: ValidatedOoxmlParserInput) => Promise<T>
): Promise<T>
```

requestはfilePath、rootPath、expectedFingerprint、documentKind、構造limits、ledger、target、optional AbortSignal、lazy XLSX codec loaderを持つclosed own-data recordとする。filePathは絶対path、rootPathは検証に用いる許可root、targetはpath digestから作った256 UTF-8 bytes以下のopaque識別子とする。parserInput/verification tokenをrequestで渡して検査を省略する入口は作らない。callback引数は`{documentKind, parserInput: Buffer, normalization: "none" | "xlsx_minimal_styles"}`だけとする。

`prepareOoxmlParserInput`、ZIPの低水準entry API、opaque verification token、独立`verifySourceUnchanged`はpackage rootおよび製品facadeからexportしない。migration parity testだけがinternal moduleへ到達できる。package exports mapとarchitecture policyでdeep import/相対的internal importを製品側から拒否する。製品のDOCX/XLSX parseはすべてcallback内で行い、そのPromiseをawaitしてから結果を採用する。

`readBoundedDocumentFile`は非OOXMLの原本読取り/事前fingerprint向けに、bytes長・SHA256・BigInt由来のidentity文字列・copy-only bytesを持つfrozen snapshotを返す。これをOOXML parserへの別入口にはしない。fingerprint helperも同じfile ownerを利用し、有効なmaxSourceBytes/maxDocumentBytesを必須で受け取る。expectedFingerprintはbyteSize/mtimeNs/device/inode/sha256を閉じた型で検証する。CCRの初回事前fingerprintもbounded helperで作り、shared callbackへ渡す。fingerprint生成にだけ成功してもparser出力成功とは記録しない。

未知key、accessor、不正数値、unsafe integer、過大path/target、未対応kindを副作用を起こすcoercionなしで拒否する。ライブラリー診断は上限付きの固定codeと検証済み有限情報のみとし、pathや生の未知errorを画面へ露出しない。T13の9 error codesを改名しない。T14のI/O/ZIP/source-change codeは別のclosed enumとして追加し、既存typed budget errorを保持する。

## 5. 読取りから解析後検査まで

1. request/profile/構造上限を検証し、optional signalの中断を確認する。pathはroot内で、symlink components・非regular fileを拒否する。T14のNodeで観測可能なidentity/containmentを確認するが、T17/R3のWindows native race-free adapterの完了証拠にはしない。
2. 原本を一つのFileHandleでopenする。read前BigInt statとexpected fingerprintのdevice/inode/size/mtimeを照合し、maxSourceBytesとsafe allocation boundを確認する。named pathと開いたhandleのidentityが合わなければ拒否する。
3. 原本サイズを台帳でreserveしてからBufferをallocateし、exact read loopで全量を読む。短いread、growth、stat/hashの不一致は失敗にする。statだけで切り詰めた原本を成功入力として返さない。
4. SHA256とread後statを確認する。ZIP preflight→entry実inflate/length/CRC/全compressed入力消費→kind一致→必要な場合だけXLSX補修を行う。拒否時のparser load/callbackは0にする。
5. signalを再確認し、検証済みBufferでparser callbackを一度だけ実行する。通常DOCX/XLSXでは元snapshotと同じBuffer objectを渡し、再圧縮を0にする。補修ケースだけ新しいBufferとなる。
6. callback成功後にshared owner自身が、保持した元handleを上限付き固定chunkで再読取りする。前後stat、元SHA256、named pathのdevice/inode/size/mtimeと現在のpathからの同一性を再確認する。同size・mtime復元を伴う内容変更でもSHA不一致で結果を破棄する。検証用tokenはcallbackへ渡さない。
7. 全検査成功後に一つの原本予約をexact bytesでcommitし、結果を返す。read/ZIP/parser/post-check/cancel失敗ならopen予約をreleaseする。handleは成功/失敗ともfinallyでcloseする。cleanup失敗は先行する本来の失敗を上書きしない。既存T13 ledgerにcommit後rollbackを追加しない。

非OOXML bounded readはread前後の同様のsnapshot検査後にcommitしてhandleを閉じる。返却bytesは所有済みcopyであり、その後のpathの不変性を保証するtokenではない。fingerprintの事前観測とcallbackの成功証拠を混同しない。callback中に無制限のCPU/parser allocationを停止する仕組み、absolute deadline、operation全体のtransactionは今回作らない。

## 6. OOXML parityとnormalization

current-main `ooxmlPreflight.ts`のZIP32、encrypted/multidisk/ZIP64拒否、unsafe name・duplicate・local/central一致・descriptor/range/overlap/EOF検証をそのまま出発点にする。`ooxmlArchive.ts`のstored/deflate、maxOutputLength、実長、deflate全入力消費、CRC32を保持する。archive版の弱いinflate判定へ置換しない。

通常検証時はentryを順に検証して不要なinflate結果を保持しない。missing-both XLSX補修時だけ各inflate結果を一回保持し、二度inflateしない。`styles.xml`と`sharedStrings.xml`が両方ないときだけ、現行の最小stylesheet bytesとzipSyncの動作でメモリ補修する。片方または両方があるときは補修しない。原本を変更せず、`__proto__`等の現行安全判定も維持する。

shared packageにparser依存を追加しない。XLSX補修に使うcodecは拡張所有の`import("fflate")`をlazy loaderとして渡し、shared ownerが全ZIP検証に成功し、missing-bothを判定した後だけ呼ぶ。codecの構造型はshared declaration内で完結し、外部fflate型をconsumerへ要求しない。loaderはtrusted product dependency capabilityであり、利用者入力として差し替えられない。migration testsは実fflate 0.8.3でnormalization bytes/load countを比較する。

parity harnessはM2のsource blobを固定したテスト専用baselineと新ownerを同じfixture群で比較する。baselineを製品payloadへ含めない。ZIP判定、元Buffer identity、normalization bytes、load timing、fingerprint、Rules/Verification/locator、GUI error処理を比較し、意図した新たな拒否（変更原本・oversize・CCRのmalformed ZIP）は別に分類する。parity成立前に旧Bazaar ownerを削除しない。成立後、旧pathはthin callback adapterまたは型再exportに限定し、duplicate ZIP/inflate/normalization実装と低水準製品入口を拒否する。

## 7. Consumerと公開上限

| Consumer | 維持する上限・契約 | T14の変更 |
| --- | --- | --- |
| Bazaar | 20 sources、25 MiB/source、100 MiB batch、32 KiB/chunk、OOXML 5,000 entries/250 MiB expansion、32 MiB PDF出力 | 全fingerprintへ有効source ceilingを渡す。DOCX/XLSX callback化。batch全体の新台帳はT15へ残す |
| CCR | source default5/max50 MiB、sheets20/100、rows500/5,000、excerpt64 KiB/1 MiB、Bob input2/8 MiB | DOCX/XLSXをBuffer化。Markdown原本oversizeは解析/切詰め前に拒否する。excerptの従来上限とlocatorは保持 |
| CCR discovery | 現行の候補列挙・ID/selector/description、既存warning継続 | Markdown bounded readとXLSX callbackを追加。原本maxDocumentBytesはCCRの同じ正規化値を受け渡す。上限超過時はID抽出せずwarningとpath候補を維持 |
| Workflow register | 実装・依存・VSIX容量を変更しない | package declaration consumer fixtureだけ拡張する |

MiBは1,048,576 bytes。Bazaarのlimitsは既存実exportから明示overrideへ写す。CCRの原本上限も既存normalize関数の値を使う。各一文書ledgerのparentには原本量を許す明示値を用い、default32 MiBの隠れた拒否でCCR50 MiBを狭めない。shared file hard capは50 MiB、Bazaarは25 MiBへclampする。

OOXML structural ceilingsは5,000 entries、250 MiB expanded sum、32 MiB central directoryとし、有効な小さいcaller値は維持し、大きい値では上げない。独立した25/50 MiB per-entry制限は追加せず、各entryは残りexpanded sumと実inflate boundに従う。これらのstructural値をT13 profileのcategory上限へ混ぜない。

CCR discoveryには`limits?: Partial<ReviewProcessingLimits>`を追加し、4つのhost callerが既存の正規化済み設定を渡す。直接library呼出しは既存CCR defaultを使う。これは追加UIや別設定ではない。DOCX候補は現在もID解析しないので、その列挙のために新parserを起動しない。walk順序・maxFiles/maxIdsPerFileの意味、source universeの所有割当は変更しない。

BazaarのDOC/XLSは`requires_conversion`、PDFは固定の既存process/page locator/OCR状態を維持する。PDFへOOXML検証を適用しない。今回はPDFのfingerprint read ceilingだけを共通化し、process-tree/deadline/output budgetを実装済みとはしない。GUIは既存の元error一回log・固定表示・queue継続を維持する。CCRのwarningは既存sanitize境界を経由し、未検証のraw path/errorを新たにwebviewへ渡さない。

## 8. Build・実配布・依存

両拡張のnpm scriptsには親相対pathを直接書かず、extension-local `scripts/build-shared-runtime.js`を呼ぶ。このwrapperは絶対argvで、shared packageのcontracts check/compile、extension compile、canonical `packages/processing-budget-runtime/scripts/copy-extension-runtime.js`を順に実行する。compile中の暗黙npm install、network fetch、別compilerへのfallbackは行わない。shared dev dependenciesが未installなら具体的な準備手順とともに失敗する。

CIは拡張buildの前にshared packageを既存lockでnpm ciする。shared compilerは5.9.3、Node typeは既存両consumerと同じ20.19.43をexact dev dependencyとする。実normalization試験用fflate 0.8.3もdev dependencyに置く。CCRには現行transitiveと同じfflate 0.8.3を直接production宣言し、lockの実版を変えない。packageのproduction dependenciesは引き続き0とする。Bazaar parser lock `read-excel-file 9.3.1`、CCR `9.2.0`、両方Mammoth `1.12.0`/Cheerio `1.2.0`を維持する。registry取得は承認済み計画に記載した公開registryからの読取りだけで、publishはしない。

copyは各拡張のexact owned `out/shared-processing-budget-runtime`にflat compiled payloadを置く。compiled index、選択した内部module、declarations、必要なcontract assetsをliteral manifestで定義する。source、tests、package node_modules、古いruntime実装をコピーしない。no-followでsource/destination/ancestorsのregular性・physical containmentを確認し、fresh stagingで全bytes/hash/manifestを検証してからowned outputへ反映する。削除/上書き対象を検証済みowned output外へ広げない。同時compileはfresh出力とserialized package build/copyで混在を拒否する。

実行時facadeはこのcompiled payloadだけをrequireし、repo source、package out、別拡張へfallbackしない。build前の不在/stale payloadは明確に失敗する。実npm packをfresh consumerへoffline installして、root exports・runtime・declarationsを実行する。さらに実Bazaar/CCR VSIXを隔離展開し、同じcompiled module bytesとdependency identity、src/test除外、missing payload時の失敗を確認する。19-entryだったT13 pack proofはT14のliteral inventoryへ更新するが、T13の歴史的19-entry artifact記録は変更しない。

VSIX capsはWorkflow1,200,000、Bazaar12,000,000、CCR11,000,000 bytesを維持する。Workflowのfixed compaction対象には触れず、他拡張のpayloadも便乗変更しない。容量超過は上限引上げや圧縮対象拡大で隠さず、実測・path/AST/payload比較を備えた具体的な別決定として提示する。

## 9. Source coverageとadmission

T14 source inventoryは39 items、38 paths、36 distinct archive blobsで、全origin commitは`4d0fb728763db9d13c87d000790a88c45900733e`。末尾の表はsource universeから生成する。各itemにorigin blob、実装先、試験先、parity/適応判断を持つcoverageを新規追加し、675項目全体の分類/unassigned0を維持する。archive ZIP実装・旧consumer facade・copy-bounded-runtimeはcurrent-main/TS/callback契約への適応を明示し、単なるfilename一致を受入にしない。

追加のcurrent-main safety prerequisiteは、旧OOXML ownerのthin化、CCR discoveryと4caller/settings伝播、build wrappers、lock/declaration/architecture tests、workflow wiringである。archive sourceItemIdを捏造せず、`additionalCurrentMainPrerequisite`の区分でM2 before blob・理由・試験を記録する。正確なliteral file一覧は実装計画で固定する。

新`boundedDocumentAdmissionPolicy.mjs`、`bounded-document-source-admission.json`、対応test、`proc-t14-bounded-doc-source-coverage-2026-10-24.json`を設ける。M2/treeをbaseとし、literal source/control rowsのmode・before/after Git blob・source IDsをsealする。existing `processingBudgetCurrentSourceFiles()`にはレビュー対象のT14 literal layerだけを足す。T13 base getter、T13 coverage/admission bytes/subjectは変更しない。既存Owner57・Discovery・Gate Rの履歴sealを別bytesで再canonicalizeしない。新layerのbeforeはM2 current filesを要求し、同pathの後続変更をwildcardで許さない。

old policyのcurrent getter、architecture/source admission hooksの最小修正は新control deltaとして列挙する。旧baselineのhash拘束やscanを縮小しない。working/indexの一致、symlink/reparse alias、未知package payload、未許可extension差分を拒否する。self-hashは避け、policy自身は別literal control allowlistと独立reviewで受け入れる。source段階で将来completion pathのliteral LF ruleを用意し、metadataでsource-sealed attributesを変えない。

## 10. 検証と受入

実装は既承認の主スレッド方式を継続する案とする。新契約ごとにnamed REDを先に観測し、最小実装、focused GREEN、関連回帰、必要な品質checkを行う。sourceのfresh reviewを一度、別metadataのfresh reviewを一度行い、Critical/Importantは一回のTDD fix pass、Minorは記録して便乗修正しない。

| 対象 | 必須の反証/成功証拠 |
| --- | --- |
| bounded file | reserve前allocation/read0、oversize・growth・short read・identity replacement・symlink/escape拒否、exact bytes、copy ownership、typed error、全失敗の予約finalize |
| callback | parser前ZIP拒否、callback一回、結果await、成功後SHA/handle/path再検査、同size/mtime復元mutation、callback/parser失敗、post-check失敗の結果0、handle close/open reservation0 |
| accounting | raw bytes一回と自動ancestor、parser/post-check失敗release、独立per-document scope、60 MiB entry/C10+E245の現行構造上限parity、archive会計を非継承と記録 |
| OOXML | 全current adversarial ZIP、trailing deflate input/CRC、通常元Buffer identity・再圧縮0、missing-bothのみnormalization・bytes一致、single retention、malformed前parser/fflate load0 |
| consumers | Bazaar DOCX/XLSX configured caps・fingerprint全呼出し伝播・legacy path preflight0、CCR三つのXLSX/DOCX parse callのpath入力0、discovery Markdown bounded、oversize sourceのexcerpts/evidence0、locator/Rules/Verification/GUI回帰 |
| package/build | 実tarball installed runtime/declarations、literal flat copy、missing/stale/deep-import/source fallback拒否、copy escape/alias/同時compile、実VSIX payload・dependency identity・容量 |
| repository | 新coverage/admission、T13歴史base、既存root必須4/4生成器--check、Gate R15・five effects0、3拡張品質/package gates、diff --check |

既存5 workflows/18契約行を維持し、processing-budget-runtime jobと影響するextension buildにshared準備とparityを組み込む。PR eventは18 success、main/dispatchは既存metrics条件により17 actual success+skip1。missing workflowは同headと32hex nonceでdispatchする。実checkout/head、run/attempt/job/runner/log/hash、実package/VSIXとparity結果を保存する。起動前失敗やAPI403を成功扱いにせず、過去CI免除は継承しない。

新VSIXについてはUbuntu/Windowsの品質/実packageに加え、同一hashのBazaar/CCR artifactを使う隔離extension host smokeを行う。通常OOXML、missing-both XLSX、malformed/変更原本、既存GUI汎用errorとqueue継続を確認する。native/live Bob/最終3拡張Program UATは別項目で、今回のlibrary/host試験をその成功へ転用しない。実行環境不足があれば該当項目をnot_runとして扱い、受入要件から黙って除かない。

## 11. 承認・main受入・保全

本設計承認後に詳細実装計画を作成し、その書面承認後に限定local実装へ進む。remote/PR/mainのC操作は、レビュー済みの具体的candidate commit/tree/diff/check結果が揃ってから、対象と影響を提示して新しい承認を得る。T13のsource/metadata承認や過去CI免除をT14へ継承しない。

source C_T14を固定→実CI→通常mergeしたsource main S1のparents/tree/exact-main CIを確認する。別metadataはS1をsubjectとしてcompletionを登録し、旧13 completion referencesの順序/bytes/hashをprefixのまま保持する。metadata candidate/mainにも同じactual CI契約を満たし、通常merge後のM2を別subjectとして記録する。sourceとmetadataのC承認は別候補ごとに行う。risk authorityは`2026-08-31-wave0a-risk-tiered-approval-and-evidence-design.md`で、古いrequest-hashの手動転記は求めない。

primary checkoutは`codex/bob-auto-response-probe`/`90f926e0045405625f1f40d20a41346a94d1981a`を維持し、15 untracked entriesとOwner57の見かけ上のmodified表示を変更しない。protected user dirs/filesは読まない。Owner57 bytesのSHA256は`1665c66acd04a535b08116e639f5119b98e03609d9bb4d5f8efacc9bba37b5a4`を保持する。既存worktrees/branches/profiles/artifactsをcleanupしない。local mainは非checkout状態で、承認済み受入後だけ非force FFする。

## 12. Builderへ委ねる点と次のgate

同じowner内のprivate helper名、fixtureの最小構成、exact file list/タスク分割、既存hostのsettings getterからdiscovery optionsへの具体的な接続は実装計画で決める。39項目、原本一回会計、公開上限、唯一OOXML owner、mandatory callback/post-SHA、同じcompiled artifactとparser identity、discovery迂回解消、歴史的seal保持は変更しない。

本設計は製品実装の承認ではない。fresh builder checkの質問を既存正本/実装者判断/利用者の判断へ分類して一度だけ反映し、書面レビューへ提示する。

fresh builder check（独立した計画作成者、2026-10-24）は「nothing important left」と回答した。追加の利用者判断を要する未決事項はなく、§3.1の会計適応・§7のdiscovery追加・§8のlazy codec/build方式は実装者の判断として書面承認へ提示する。

## 付録A: Immutable T14 source items

以下は基準M2のsource universeから生成した一覧である。同じbounded-zip pathに2 familiesがあるため39 items/38 pathsとなる。各originはowner_stage_snapshotで、実装計画時にもblob identityを照合する。

| sourceItemId | Origin path | Family |
| --- | --- | --- |
| source-081690cb9b343e0e4fd86aaa | `extensions/bob-bazaar-review/test/ruleBoundedOoxmlExtraction.test.js` | bazaar-pre-parser-archive-limits |
| source-0f84fc23754230d796e0a5b3 | `extensions/bob-bazaar-review/package.json` | package |
| source-115f8910d0fd986cd859a0cb | `extensions/bob-code-consistency-review/src/analyzers/documentDocxExtractor.ts` | document-docx-extractor |
| source-116947d48756a2313f259d67 | `extensions/bob-bazaar-review/test/ruleConfiguredFingerprintLimit.test.js` | rule-configured-fingerprint-limit |
| source-11c6eda712b2f301761a6dd5 | `packages/processing-budget-runtime/README.md` | t14-bounded-doc-readme |
| source-122cdfe84d37c5f2d7462bdc | `packages/processing-budget-runtime/test/boundedZipRetention.test.js` | ooxml-single-retention |
| source-15ac07e0adbade462b24c3d7 | `extensions/bob-code-consistency-review/src/sharedProcessingBudgetRuntime.ts` | bounded-document-consumer-facade |
| source-212b25dd59af07e1690b14f0 | `packages/processing-budget-runtime/runtime/bounded-zip.js` | ooxml-single-retention |
| source-55668c6c4fc0ac2d3e153762 | `packages/processing-budget-runtime/test/fixtures/workflow-register-consumer.ts` | t14-bounded-doc-workflow-register-consumer |
| source-61060f515b48c9284440815f | `packages/processing-budget-runtime/src/boundedDocumentIo.ts` | bounded-document-io |
| source-6e47fdc9c880c66578479d9e | `packages/processing-budget-runtime/scripts/copy-bounded-document-runtime.js` | copy-bounded-document-runtime |
| source-757ca93020f46db1d64ffa69 | `extensions/bob-bazaar-review/src/sharedProcessingBudgetRuntime.ts` | bounded-document-consumer-facade |
| source-766a64b493cd8b3b12542bb6 | `packages/processing-budget-runtime/test/fixtures/bob-bazaar-review-consumer.ts` | t14-bounded-doc-bob-bazaar-review-consumer |
| source-77efe876583486afd84bc446 | `packages/processing-budget-runtime/test/boundedDocumentRuntime.test.js` | bounded-document-runtime |
| source-79eaa2908653365204363bca | `extensions/bob-bazaar-review/src/ruleAuthoring/extraction/docxExtractor.ts` | docx-bounded-input-budget-adapter |
| source-88eaed95118bf51f812a1b91 | `packages/processing-budget-runtime/scripts/copy-extension-runtime.js` | copy-extension-runtime |
| source-8921fb578f27dc51782bedbb | `packages/processing-budget-runtime/runtime/bounded-document-runtime.js` | bounded-document-runtime |
| source-8bc8f4d403d2a239104b230b | `packages/processing-budget-runtime/test/boundedDocumentIo.test.js` | bounded-document-io |
| source-8c8b935c16fbfd490ffaed7c | `packages/processing-budget-runtime/test/fixtures/bob-code-consistency-review-consumer.ts` | t14-bounded-doc-bob-code-consistency-review-consumer |
| source-8e4006e199b552802bd3321e | `packages/processing-budget-runtime/src/index.ts` | bounded-document-public-exports |
| source-92c9c09c80024b9a183e6a25 | `extensions/bob-code-consistency-review/test/sizeLimits.test.js` | t14-bounded-doc-size-limits |
| source-9364e198f4b4e13273dfe750 | `extensions/bob-bazaar-review/src/ruleAuthoring/extraction/documentExtractor.ts` | t14-bounded-doc-document-extractor |
| source-98d63195b541433bc119f411 | `extensions/bob-code-consistency-review/src/analyzers/documentXlsxExtractor.ts` | t14-bounded-doc-document-xlsx-extractor |
| source-9c736d36f51e003acd61ec67 | `packages/processing-budget-runtime/runtime/bounded-file.js` | bounded-file |
| source-9e6d125b619471c4637173cb | `extensions/bob-bazaar-review/test/ruleNoLegacyOoxmlPreflight.test.js` | rule-no-legacy-ooxml-preflight |
| source-a2f4e841de98c10855985c8d | `packages/processing-budget-runtime/package.json` | t14-bounded-doc-package |
| source-a7bc4d9c841743268ccca70c | `packages/processing-budget-runtime/test/helpers/boundedDocumentFixtures.js` | bounded-document-fixtures |
| source-b4ab7cc1ae4820e5605f057e | `extensions/bob-bazaar-review/test/ruleConfiguredOoxmlLimitForwarding.test.js` | rule-configured-ooxml-limit-forwarding |
| source-c4a71884a59c961e40fd6866 | `packages/processing-budget-runtime/test/boundedArchiveInputLimit.test.js` | bounded-archive-input-limit |
| source-c7840f4d1fe2e382e974f73a | `extensions/bob-code-consistency-review/package.json` | bounded-document-build-and-setting-contract |
| source-d2c3714904c50e0fe41bbb09 | `extensions/bob-code-consistency-review/test/documentSourceLimitDescription.test.js` | document-source-limit-description |
| source-da39f68ce042cc7d54b5e92b | `extensions/bob-bazaar-review/src/ruleAuthoring/ruleSourceHash.ts` | t14-bounded-doc-rule-source-hash |
| source-db0dcef3635a43637cc9c2f3 | `extensions/bob-code-consistency-review/src/analyzers/documentExtractor.ts` | t14-bounded-doc-document-extractor |
| source-e056445cbc6911cd4866e520 | `extensions/bob-bazaar-review/src/ruleAuthoring/extraction/xlsxExtractor.ts` | xlsx-bounded-input-budget-adapter |
| source-e1425c0445b88a037b0c09af | `packages/processing-budget-runtime/test/boundedDocumentPackaging.test.js` | bounded-document-packaging |
| source-e6b932cf56ceda58b85a155f | `packages/processing-budget-runtime/runtime/errors.js` | errors |
| source-e8f3a56005a262a9606c1e60 | `packages/processing-budget-runtime/test/packageContract.test.js` | t14-bounded-doc-package-contract |
| source-e9d5a1e9d34f3ddaa30417cb | `packages/processing-budget-runtime/runtime/bounded-zip.js` | bounded-zip |
| source-f67f10f4f0b705f9399609cd | `packages/processing-budget-runtime/test/extensionIntegrationContract.test.js` | extension-integration-contract |
