# PROC-T15-AGGREGATE 詳細設計

## 1. 目的と現在地

T13の13カテゴリ台帳と、T14のbounded原本・OOXML ownerを、一回の文書抽出操作に接続する。選択文書の件数・原本合計bytes、workbook内／操作全体のsheet・rowをparser materialization前に制限し、取消をfingerprint・読取り・module load・parser・結果採用の各境界へ伝播する。

基点main M2は`a826dc20c0e71f472401adf644ca8cc777b74c58`、treeは`fa3a7ed1ea9aca00965ebe16d786096033d5f39e`。T14 source main `46a923a3f09e83a60a45cca887f612d7187e38c3`と、その別metadata main M2は別subjectである。正式進捗は12/20（60%）、14 completion references、next=`PROC-T15-AGGREGATE`。本設計を書いたことやlocal実装だけで進捗を進めない。

正本は`2026-08-23-feature-selection-and-sequential-main-integration-design.md` §7.3/§10.1、immutable selection ledger/source universe、および受入済みT13/T14である。対象はT15 ordinal13の**30 source items / 25 paths / 23 distinct blobs**。全owner-stage originは`7fc7a371e6506290d8626d06e9b12c2a67888b47`で、T16–T18のcarrierに再登場するものもprimary ownerをT15のまま扱う。

## 2. 範囲・非目標・選択した方式

### 2.1 必須の結果

- 一回のBazaar single/batch抽出、CCR `extractDocuments`、CCR `preprocessReview`に、それぞれ独立したoperation contextを一つ置く。同一操作内の全選択で同じT13 ledgerを使う。
- 全選択件数を各文書参照のcontent read/fingerprint/path resolution/parserより前に確保する。reviewInput自体の読取り予算はT16の別scopeであり、JSONから参照集合を得た後に文書件数を確定する。同じ物理pathを別論理文書として選んだ場合も各選択を数える。
- 原本の論理bytesを各選択につき一度だけ計上し、後続のfingerprint／parser用再読取りで加算しない。祖先への手動二重reserveもしない。
- 全宣言sheetとrow spanを検査してからworkbook予算を一括確保し、parser import/callより前に全予約をcommitする。途中失敗ならworkbookの未commit予約をすべてreleaseする。
- pre-cancel、await後のcancel、resource-control failureをwarningへ変換しない。通常のCCR抽出失敗・既存locator/manifest/excerpt/GUI診断の意味は保つ。

### 2.2 非目標

T16のdiff/stdout/stderr/excerpt/Bob input/artifact会計、T17のdeadline・process tree・完全なphysical-path adapter、T18のcomplete-only handoff/report、PDF process実装の置換、GUI構成変更、V1/V2 activation、R3–R6の実装は行わない。RSS・sandbox・全filesystem race・同期inflate/parserの途中停止を保証しない。13カテゴリ/default/max/error9codes、parser versions、extension versions、Workflow source/deps/fixed compactionは変更しない。

### 2.3 Approaches

既承認programが要求する「一操作一台帳・単一ZIP owner」を正本とし、**T14 ownerに操作単位のadmissionとXLSX検査を接続する案**を採用提案とする。具体的なAPI配置・一passの検査接続は実装者の判断であり、本詳細設計の承認対象に含める。新たな製品方針への既存承認を捏造しない。

| 比較した方式 | 結果とtradeoff |
| --- | --- |
| 既存owner・既存ledgerの共有（採用提案） | 同じ原本・CRC検査・post-checkを使い、全選択の会計とworkbook事前検査を追加できる。opaque admissionとowner内の検査seamが必要。 |
| 文書ごとのledger／別のZIP owner | 各文書は安全でも操作aggregateを越え得る。正本が分かれ、T14安全検査の収束にも反するため除外。 |
| callbackのBufferをもう一度独立したZIP検査passへ渡す | 実現は可能だがinflate／CRC／XML準備が重複する。現行ownerが既にentry bytesを検証するため、同passで構造情報を作る方を選ぶ。 |

## 3. 現行との差分とarchiveからの適応

現行Bazaarは全requestを`Promise.all`でfingerprintした後に合計bytesを検査し、canonical hash groupだけを抽出する。T14のOOXML facadeは文書ごとに`createDocumentLedger`を作る。現行CCRも文書ごとにledgerを作り、`preprocessReview.abortSignal`を文書抽出へ渡さない。XLSXの現行sheet/row処理はparserが全workbookを作った後に行われる。

archiveではBazaar fingerprintを操作台帳へ計上し、さらにarchive展開も同じaggregateへ計上する試験がある。**展開bytesの台帳debitは採用しない**。T14で承認された原本C一回会計と展開Eの構造制限を保持する。C=10 MiB/E=245 MiBや60 MiBの単一entryを新しい25/50 MiB entry capで拒否しない。ZIP 5,000 entries・250 MiB expanded・32 MiB central directory、実inflate長/CRC/全compressed input消費は現行ownerのまま維持する。

archiveのworkbook atomicityは「全sheet/row予約が成立するまで一件もcommitしない」であり、操作全体のtransaction rollbackではない。commit後のparser failureで既に消費した件数・原本・workbook会計を巻き戻す仕様にはしない。このタイミングは§6で明示する。

## 4. Operation contextと原本一回会計

### 4.1 所有者とlogical selection

共有runtimeに`documentBudget.ts`を追加する。`createDocumentOperation`はvalidated profile・selectedDocumentCount・任意のsignalからfrozen operation objectを作り、内部でT13 ledgerを一つ所有する。global/module/GUI sessionのledger cacheを作らない。CCR pipelineはcontextを一つ生成して文書抽出に渡し、直接`extractDocuments`を呼ぶ場合は同じfactoryで自分のcontextを作る。両拡張をまたぐglobal ledgerではない。

logical selectionは入力順のordinalとdigestから作るopaque targetで識別する。path/logicalName/sheetNameをそのままtargetにせず、256 UTF-8 bytes以内にする。同じpath・同じbytesでもselection ordinalが異なれば別のcount/raw debitになる。constructorで確保したNを越えるordinal、同じordinalへの再admission、別operationのhandleは拒否する。

call-levelのpre-cancelを最初に確認する。Bazaarでは全requestのeffective signalもI/O前に確認する。件数は入力長だけで確保できるBazaarではfilePathの解決・fingerprint前、CCRでは既存artifact array内のtruthy pathを持つ全entryを数えてpath解決前に、`reserve('document_count',N).commit()`する。CCRの非配列／pathなしentryの既存warningは維持する。欠pathをcountに足すために意味を変えない。BZR count超過では入力のcontent prefixやpath coercionを実行しない。

### 4.2 Admissionと解析の二段階

T15の操作APIは、概念的に次を持つ。具体的な型の引数順序はplanで固定するが、以下の意味を変えない。

```ts
createDocumentOperation({ selectedDocumentCount, profile, signal? }): DocumentOperation
operation.fingerprintSelection(selectionIndex, boundedFileRequest): Promise<DocumentAdmission>
operation.readSelection(selectionIndex, boundedFileRequest): Promise<BoundedDocumentSnapshot>
operation.withValidatedOoxml(admission, { documentKind, structuralLimits, xlsxBudget? }, parse): Promise<T>
operation.verifyAfterExternalRead(admission): Promise<void> // existing PDF/legacy post-check
operation.snapshot(): Readonly<ProcessingBudgetLedgerReport>
```

`DocumentAdmission`はmodule-private WeakMapでoperation/ledger/ordinal/target、正規化file/root、maximum、完全fingerprintを結ぶopaque handleとする。plain object、別operation、別file/root/target/fingerprint、二重使用、同時使用を、content I/O前に拒否する。handleは`admitted → in_progress → completed|failed`の一方向。snapshot/reportをhandleの代わりに使わない。

`fingerprintSelection`はT14と同じ保持handle ownerでstat/size/identityを確認し、**content allocation前に**操作台帳へraw bytesをreserveする。read→SHA/stat/path再検査→closeが成功した時点で一度だけcommitし、admissionを発行する。失敗時は未commit raw予約をreleaseする。以後はその論理選択が受け入れられた原本bytesとして記録され、parser failure後もcommitted usageは巻き戻さない。

後続のadmitted OOXML readはledgerを新設せず、同じownerのprivate accounting policyで二重raw debitだけを避ける。**物理検査は一切省略しない**。再openするfile/root、sizeと完全fingerprintの一致、同じhandleでのread/ZIP検証/await callback/post SHA・stat・named path/closeを実行する。mtimeとsizeを復元した変更もSHAで拒否する。原本Bufferをcaller-supplied parserInputで置換する入口や、公開`skipCharge`/`skipValidation` booleanを作らない。

既存T14の`readBoundedDocumentFile`/`fingerprintBoundedDocumentFile`/`withValidatedOoxmlParserInput`は通常APIとして維持する。通常APIは従来どおりcallback/post-check/close完了後にrawをcommitし、失敗はreleaseする。T15だけが明示的な論理admissionを使う。private coreの分岐を共有し、file/ZIP ownerを複製しない。fingerprintの物理再読取り量を13カテゴリで報告しているとは扱わない。

### 4.3 間違った制約カテゴリを作らない

public per-source cap超過は現行のleaf error/warning経路を保つ。公開leaf以内でも操作のremaining document bytes/operation bytesを越える場合は、allocation前に対応するaggregateカテゴリの`ProcessingBudgetError`を返す。低いaggregate overrideに合わせてeffective leafを縮めた結果を、単なるper-source warningとして飲み込ませない。remainingの観測とT13 reserveは同じ同期区間で行い、独立した手書きaggregate counterを正本にしない。

件数・原本admission・workbookは別の確定点である。全操作rollbackはしないが、どの失敗経路でもopen reservationを残さず、待機中のowned sibling処理を放置しない。Bazaar fingerprint準備は入力順でsettleする方式を採り、`Promise.all`の一件reject後に別のfingerprintが生き続ける形を避ける。sort/dedup後の成果物順序は現行どおりとする。

## 5. Profileと公開上限

T13の13カテゴリ定義/default/max/error9codesはimmutable。default/maxはsingle_document 5/50 MiB、total_document 32/256 MiB、document_count 128/1,024、sheets_per_workbook 20/100、total_sheets 100/1,000、rows_per_sheet 500/5,000、total_rows 25,000/250,000。残り6カテゴリも定義を変更しない。全入力はsafe integerとclosed own-dataで検証し、getter/coercionでI/Oを誘発しない。

| consumer | mapping |
| --- | --- |
| Bazaar | maxSourceFiles<=20、maxSourceBytes<=25 MiB、maxAggregateSourceBytes<=100 MiBを維持。document_countを有効maxSourceFiles、total_documentを有効maxAggregateSourceBytes、single_documentをmin(有効source,aggregate)、total_operationを少なくともtotal_documentへ写す。sheet/rowはT13 defaultを使う。新しいUI設定は作らない。 |
| CCR | public maxDocumentBytes default5/max50 MiBを維持。aggregate明示overrideがないときtotal_document=max(public leaf,32 MiB)、total_operation=max(total_document,64 MiB)。total_sheets=max(public workbook cap,100)、total_rows=max(public row cap,25,000)。明示aggregate overrideが低い場合はeffective local=min(public local,aggregate)とする。public workbook20/max100・data rows500/max5,000は維持。 |

CCRの追加profile入力は型付き内部APIとして公開し、現行VS Code settings/schemaの意味を暗黙に変更しない。正規化済みprofileはT13の絶対上限とlocal<=aggregate<=operationを満たすものだけを受け入れる。`maxDocumentBytes=50 MiB`だけを設定した有効文書を、暗黙の32 MiB parentで拒否しない。意図して低いaggregateを指定した場合の拒否はaggregate failureとする。

T15ではraw bytesの祖先debit以外にdiff/excerpt/Bob/artifact等を接続しない。CCRの既存excerpt/Bob clippingと上限はそのまま。T16はこの同じcontextを再利用する前提で別に設計する。

## 6. XLSX inspectionとatomic workbook budgets

### 6.1 単一検証passの接続

`workbookBudget.ts`にXML inspectionとworkbook reservation helperを置く。依存方向は`documentBudget → bounded owner/ooxml owner`、`ooxml owner → workbookBudget`、`workbookBudget → ledger/types/error`とし、runtime import cycleを作らない。

budgeted XLSXではT14 ownerの`decodeEntry`検証passにprivate observerを接続する。observerはentryのCRC/長さ/全入力消費検証済みbytesをその場で読み、workbook declaration、relationship、row span等の構造情報だけを残す。decoded worksheet Bufferを蓄積せず、通常入力での一entryずつのinflate/retentionを維持する。ZIP entryの物理順序に依存しない。workbook/relsよりworksheetが先でも扱う。

参照先が後で分かるため、候補partのXML失敗は一旦記録し、最終的に必要なworkbook/rels/宣言worksheetに対してだけ適用する。無関係なimage/custom partがXMLでないことを新しい拒否理由にしない。文字列/構造metadataも既存entry数・expanded総量で有限であり、無制限cacheを作らない。新しいsheet-name/relationship-id/entry-size capを暗黙に加えない。実装上のstreaming/bounded scanner分割はbuilderに委ねるが、追加XML passのために全worksheetを再inflateする設計へ変えない。

全ZIP entryの既存安全検証と必要XML inspectionが成功してから、以下のhelperを呼ぶ。public helperは検証済みの構造dataを会計するもので、filesystem/ZIP信頼性や権限を与えるtokenではない。product requestはcaller-supplied inspectionを受け取らず、owner自身が現在のsnapshotから作ったものだけを使う。

```ts
commitWorkbookBudget({ ledger, workbookTarget, sheets, cancellation? }): WorkbookBudgetCommit
commitXlsxWorkbookBudget({ ledger, workbookTarget, inspection, headerRows, sheetTarget?, cancellation? }): XlsxWorkbookBudgetCommit
assertParsedXlsxWorkbookWithinBudget(parsedWorkbook, inspection): void
```

従来T14 callbackの3 fieldsはそのまま保ち、T15 budgeted XLSXのtyped callbackにだけread-only workbook inspectionを追加できる。normal OOXMLは元Buffer identity・再圧縮0、missing-both XLSXだけlazy fflate最小styles補修という既存挙動を維持する。inspectionは元snapshotの内容であり、補修はworksheet/row構造を変えない。

### 6.2 XMLとrow span

必須entryは`xl/workbook.xml`、workbook relationship part、および全宣言worksheet。sheetはnameと一つのrelationship-idを持ち、参照IDは一意・存在・worksheet type suffix・非externalであることを要求する。同じworksheet partへの重複参照、package root escape、backslash、query/fragment/controlを拒否する。relative segmentsはpackage規則で解決し、必要entry不在はparser前に拒否する。

fatal UTF-8、DTD/entity宣言、非対応宣言、不正tag/attribute/quote、重複attribute、不正entity/numeric Unicode scalarを拒否する。コメント/CDATA/PIは原契約どおり扱う。local-nameベースのscannerであり、完全なnamespace/XML schema validatorと主張しない。

rowsは非空行数ではなく、実際のrow/cell referenceから得る**最大row span**。正のsafe decimalの明示`row r`、省略時の直前rowからのincrement、cell referenceを扱う。`row r=100`の後にr省略rowが二つならspan102。`dimension`だけでは増減させない。空行やsparse位置を削った数で事前予約しない。

BazaarはheaderRows=0で全spanをrow予算へ計上する。CCRはheaderRows=1でmax(0,span−1)を計上するが、parser materializationの検証にはfull spanを保持する。CCRの選択sheet/sections/rows等はexcerpt filterであり、全宣言sheetの資源会計を狭めない。

### 6.3 Atomicityと失敗後のusage

1. 全宣言sheet/row countsを安全に列挙・検証する。
2. `sheets_per_workbook`、各`rows_per_sheet`を同じledgerへreserveする。祖先total_sheets/total_rowsはT13が自動debitする。
3. 途中のlocal/aggregate超過、列挙失敗、取消では、それまでの未commit予約を逆順releaseし、最初の失敗を保持する。
4. 全予約と最後のcancel確認が成功したら、awaitを挟まず全予約をcommitする。その後で初めてparser moduleをload/callする。

atomicityはworkbook一件のsheet/row groupに限る。既にcommitされたdocument_count、原本admission、workbook usageは、後続のparser/source post-check/close/cancel失敗で巻き戻さない。これは受け入れた入力とparser materializationに許可した資源の会計であり、公開した結果数ではない。操作は新しく作り直され、失敗したcontextを別operationに使い回さない。T14通常APIのraw failure releaseは§4.2のまま別に保つ。

parser await後、parsed sheet数増加、duplicate/unknown sheet names、parsed `data.length`が検査済みfull spanを越える場合を拒否する。少ないsheet/rowは許す。cell/column予算や全schema正当性をT15で新設しない。

## 7. Consumerと取消・エラーの接続

### Bazaar

single/batch entryでcontextを一つ作る。全request countとeffective signalをI/O前に確認し、各logical selectionをadmission fingerprintしてから、現行の既存manifest/hash dedup・canonical選択・sourceId割当・sortを行う。duplicateも選択のcount/rawを消費するが、canonical parserは一回だけで、workbook会計も実際にparserへ渡すcanonical workbookだけに行う。現行hash/locator/manifest/diagnostics/legacy requires_conversionを維持する。

`RuleDocumentExtractionRequest.signal?`を追加する。operation signalを優先し、未指定時は既存`pdf.signal`をfallbackにする。nested PDF optionsを落とさない。singleのeffective signalは`request.signal ?? request.pdf?.signal`。batchは既存3引数を保持し、任意の第4引数`{ signal? }`だけを追加でき、effectiveは`batch signal ?? request.signal ?? request.pdf?.signal`とする。未選択signalを暗黙にAbortSignal.anyで結合しない。common signalがなければselectionごとのsignalをownerへ渡す。DOCX/XLSX/PDF/legacyともfingerprint前・await後・結果採用前を確認する。PDFは既存processへsignalを渡すだけで、process deadline/buffer/path implementationは変更しない。外部選択文書のrootは従来どおり明示root/その親を使い、workspace内だけに狭めない。

### CCR

`preprocessReview.abortSignal`を文書抽出まで渡し、直接呼出しにも`signal?`と型付きprofile/context optionを用意する。追加名は`processingBudgetLimits?: Readonly<Partial<SharedProcessingBudgetLimits>>`と`operation?: DocumentOperation`を基本とし、既存optionsを壊さない。外部からoperationと矛盾するprofileを同時指定した場合は入力不正として拒否する。pipelineのcontext生成はreviewInput検証後・collectGitDiff前、文書件数確定後とし、直接呼出しと同じfactoryを使う。pipeline入口のpre-cancelをpath解決/validateReviewInput/git diff等の前に確認し、既存Git/index signal経路も保つ。T15ではそれらのprocess budgetを先取りしない。

全artifact arrayのtruthy path参照数を一度commitする。MarkdownはT14 bounded snapshotで直接一回admit/read、OOXMLはadmission fingerprintと同一snapshot ownerのbudgeted parser経路を使う。毎文書の`createDocumentLedger`はoperation contextに置き換える。path/拡張子選択、document/evidence ID、selector、空行filter、header、excerpt clippingとlocation表示は現行を保つ。

cancelled signal、aggregate budget、workbook safety、source change、cleanup/OOXML-kind mismatchは上位へthrowし、部分warning成功にしない。ordinary unsupported/parser抽出失敗とpublic per-source oversizeは既存warning経路を保つ。取消はcoordinator catchでも再確認し、Error reasonは同一Errorを保つ。非Error reasonは固定typed cancellationへ正規化し、未知objectのcoercionで診断を作らない。signalが取消されていないときの`undefined/null/0`など最初のthrowはtruthinessで失わない。

両consumerとも、module import前／後、parser await後、materialization検証前、source post-check前後と結果採用前に確認する。同期処理の途中停止・時間上限はT17の領域である。

## 8. 配布・admission・受入

Pのflat moduleは現行12に`documentBudget`と`workbookBudget`を加えた14個とする。packageは14×js/d.ts/js.map＋既存4assetsの**46 paths**、development compiledは42 files、各B/C VSIXは14JS＋manifest（d.ts/maps除外）を同じcanonical buildからコピーする。小さなprivate関数は既存module内へ置き、別runtime ownerを作らない。production deps0、private0.1.0、rootと`./validated-ooxml`のexports map、deep import拒否、compiler pinsを保持する。

parserはBazaar read-excel-file9.3.1、CCR9.2.0、両Mammoth1.12.0/Cheerio1.2.0/fflate0.8.3を維持。現行source-fixed parser583filesと各extensionのactual entry resolutionを継続検証する。新14module×2 extension＝28runtime physical bindings＋8parser bindingsをactual VSIX/hostへ結ぶ。Workflow source/deps/fixed79 compaction対象は不変。capsはWorkflow1,200,000／B12,000,000／C11,000,000bytesのまま。

T15 coverageには30items/675 partition/unassigned0を固定し、変更が必要な現行owner/context/consumer/build/test/CI/admission filesをadditional current-main prerequisitesとして列挙する。immutable ledger/universe/archiveを書き換えない。新literal admission layerでbefore/after blob・working/index・alias・未知payloadを検証し、Gate R shippingとprocessing-budgetの既存domainを区別してunionを検証する。旧Owner/Discovery/T13/T14 admission、coverage、completion、既存14refsのraw/blob拘束を弱めない。新completion/coverageのLF ruleはsource段階で準備する。

実装は既存の主スレッド方式を継続。source全体のfresh review一回、別metadataのfresh review一回、C/I一回のTDD fix pass、Minorは記録を維持する。製品sourceを固定してから新しいcandidate固有C承認を取り、normal push/PR・候補のactual exact-head CI・条件成立時のnormal merge・実main CI・非force同期を行う。旧CI免除を継承しない。

required CIは同じ5workflow/18契約行。PR18実成功、非PRではPR専用metrics skip1だけを許す。各workflowの実event・runner・checkout SHA・nonce・attempt・logを確認する。Ubuntu/Windowsでactual tarball・VSIX・同じhashed artifactsのisolated hostを収集し、元runner path検証と捕捉bytesのportable replayを分ける。mock成功をactual installed successへ置き換えない。

source完了観測をbyte-fixedにした後、別metadataで旧14refs prefixを保って15refs/13of20（65%）/next=`PROC-T16-INPUT-PROCESS`へ進める。T13/T14/T15のaccepted source観測が全て揃った時だけ`PROCESSING-FOUNDATION`をVERIFIEDにする。metadata SHAをsource成功に転用しない。runtime activation/automatic cleanup/mutation authorityはfalseを維持する。final Program UAT、visual operator、live Bobは実施した証拠が揃うまでnot_runである。

## 9. 検証設計と失敗class

- REDを先に観測：full count前I/O、同一path別選択、exact/+1 count/raw/default/max、低aggregateからのlocal導出、B25/100・CCR50MiBの有効境界。
- Admission：forge/別operation/ordinal超過/別path-root-target/fingerprint/二重・同時使用をallocation前に拒否。二回物理readでもrawと祖先は一回。source同size/mtime復元・path置換・callback Buffer変更・close失敗のT14試験を保持。
- Workbook：default/absolute全境界、後半sheetのaggregate超過・列挙中cancel・不正countsで未commit全release、全成功までcommit0、commit前後のcancel、過去commitの非rollback。
- XLSX：entry順序の置換、relationship/target/UTF-8/DTD/entity、explicit/implicit/cell sparse span、header0/1、全sheet対選択excerpt、誤dimension、parsed names/span不一致。parser/module call countersでpre-parser拒否を証明する。
- 取消：pre-cancel時fingerprint/read/codec/parser0、import await後とparser await後のcancel、Error reason同一性、非Error reason、取消とordinary failureの競合、PDF nested signal互換、CCR pipeline relay。
- 新たに規定するbudget/structural拒否以外の有効入力について、現行GUI/locator/manifest/diagnostic/excerpt/dedup parity、全affected extension tests、three-extension quality、4生成器/root必須tests、新旧admission、Gate R15/five effects0、actual46-file tarball/3type consumers/2VSIX/両OS host・parser identityを確認。
- actual hostは既存T14ケースを保持し、count/raw aggregate、pre-cancel、sparse worksheet前拒否、post-await取消、ordinary warning対fatal failureを同じhashのVSIXで追加確認する。詳細fixture/case名と独立RED→GREENの分割は実装計画で固定する。

## 10. Builderに委ねる範囲と承認境界

関数引数の細かな順序、private helper名、既存module内の小さな配置、XML scannerのchunk化、named testsの分割、byte-proof receiptのローカルroot名はbuilder判断とする。論理admissionの確定点、通常T14 APIの意味、全sheet/span/header/取消/atomicity、profile mapping、parser前確保、単一owner、46payload・13カテゴリ、source/metadata分離は変更しない。

本書の承認は詳細実装計画を作るための書面reviewである。製品実装・依存導入・新host起動・remote publication/integrationの承認を兼ねない。設計承認後はwriting-plansへ進み、その計画承認後にlocal実装へ進む。remote Cは具体的candidateごとに別に確認する。

primaryは`codex/bob-auto-response-probe`/`90f926e0045405625f1f40d20a41346a94d1981a`、未追跡15項目、Owner57 raw SHA256=`1665c66acd04a535b08116e639f5119b98e03609d9bb4d5f8efacc9bba37b5a4`を保持する。保護済み3領域の内容を読まない。既存worktrees/branches/profiles/artifacts/evidenceをcleanupしない。

## 付録A. 選別source inventory

全originはowner-stage `7fc7a371e6506290d8626d06e9b12c2a67888b47`。以下はimmutable source universeから生成した30項目であり、carrierの重複を新ownerとして数えない。Git treeと23blobのraw bytesを設計時に照合済み。

| sourceItemId | family | path | owner blob |
| --- | --- | --- | --- |
| `source-0079608c934fd2c8521b4c4b` | xlsx-workbook-budget | `packages/processing-budget-runtime/test/xlsxWorkbookBudget.test.js` | `52ce9513975e4c260d3bcc2b463014dce80956eb` |
| `source-0209178d37fa1d85d707a3b7` | pre-parser-cancellation-closeout | `extensions/bob-code-consistency-review/src/analyzers/documentXlsxExtractor.ts` | `695fb55d263ff049bbda125a07a275b267d0d7b1` |
| `source-029c3450e572ca500b56d997` | aggregate-workbook-public-exports | `packages/processing-budget-runtime/src/index.ts` | `05a6107983e8b919174395a4b2279fe11a6864ac` |
| `source-0b1db8b46876527efe49b608` | t15-aggregate-rule-source-hash | `extensions/bob-bazaar-review/src/ruleAuthoring/ruleSourceHash.ts` | `8c7a7fb2f0e01a0df1e7e0fc2e0949b8ce62ba91` |
| `source-0dc3160ff443203c1012c332` | t15-aggregate-workflow-register-consumer | `packages/processing-budget-runtime/test/fixtures/workflow-register-consumer.ts` | `8e881abcb64c9221704876d8e476b2baabf38c5b` |
| `source-13c44626c0be971142e83fc1` | t15-aggregate-package-contract | `packages/processing-budget-runtime/test/packageContract.test.js` | `2a7871d784fd0965e90a62bb123cbd570bd7e068` |
| `source-2cc51fa85468ac0ed1130ba8` | pipeline-document-cancellation | `extensions/bob-code-consistency-review/test/pipelineDocumentCancellation.test.js` | `e13a7251bdb55dcd97b02ec04b66319afdf0ee07` |
| `source-308b45cdc82376d66646f04c` | pre-parser-cancellation-closeout | `extensions/bob-bazaar-review/src/ruleAuthoring/extraction/documentExtractor.ts` | `3cefab3d222c178520b5250df392af2fb8d621bd` |
| `source-51bcaeb41bc1a68cec561182` | document-aggregate-budget | `extensions/bob-code-consistency-review/test/documentAggregateBudget.test.js` | `d47e378099b36c3e0f0bf14455720004861d55a0` |
| `source-54284087d47d7b028ce71bb0` | t15-aggregate-xlsx-extractor | `extensions/bob-bazaar-review/src/ruleAuthoring/extraction/xlsxExtractor.ts` | `a49df906020dfa65c2b956ee0e7e98c1c0ea1406` |
| `source-59393027dc9303c0772d3255` | rule-document-signal-compatibility | `extensions/bob-bazaar-review/test/ruleDocumentSignalCompatibility.test.js` | `c079f6dc8852b4af5225cd254994dedf1062f6ae` |
| `source-70fef9b583863580a47ddc75` | pre-parser-cancellation-closeout | `extensions/bob-code-consistency-review/src/analyzers/documentExtractor.ts` | `be365b921cffd24b1d00aec6b85b195d9bcc529b` |
| `source-7b83c4602a45112783d66e76` | t15-aggregate-workbook-budget | `packages/processing-budget-runtime/test/workbookBudget.test.js` | `2897b0f1ceb957cd9448802672a50acf32f3ef60` |
| `source-933f4d876b1f1a77bdef2c3d` | t15-aggregate-document-extractor | `extensions/bob-code-consistency-review/src/analyzers/documentExtractor.ts` | `be365b921cffd24b1d00aec6b85b195d9bcc529b` |
| `source-a454f8df9fcade23d410f8f9` | aggregate-workbook-consumer-facade | `extensions/bob-bazaar-review/src/sharedProcessingBudgetRuntime.ts` | `04f7ddd3067cbe189498f9d3d5825d0f95e126ba` |
| `source-a542dff0e366e0cd08fb9506` | workbook-budget | `packages/processing-budget-runtime/src/workbookBudget.ts` | `a40ed49afea2159c33dbc7ce9273e743a4268cbf` |
| `source-af2bee558009aa5c69c8e766` | pre-parser-cancellation-closeout | `extensions/bob-bazaar-review/src/ruleAuthoring/extraction/xlsxExtractor.ts` | `a49df906020dfa65c2b956ee0e7e98c1c0ea1406` |
| `source-b11e3d49cc49cbfcfc612cea` | t15-aggregate-bob-bazaar-review-consumer | `packages/processing-budget-runtime/test/fixtures/bob-bazaar-review-consumer.ts` | `8e881abcb64c9221704876d8e476b2baabf38c5b` |
| `source-b9febf9c1b199ac9a861df0a` | aggregate-workbook-consumer-facade | `extensions/bob-code-consistency-review/src/sharedProcessingBudgetRuntime.ts` | `0808fa78d2d2a6fbd202575a3cf79258c9699688` |
| `source-bb1f1886f02fe1d15e4ddf67` | ooxml-pre-parser-cancellation | `extensions/bob-bazaar-review/test/ooxmlPreCancelled.test.js` | `1e835bfc2bfd2c2b6fb0fa944d056d703e0d23f4` |
| `source-bc1c6595fef769aedee758f4` | t15-aggregate-bob-code-consistency-review-consumer | `packages/processing-budget-runtime/test/fixtures/bob-code-consistency-review-consumer.ts` | `8e881abcb64c9221704876d8e476b2baabf38c5b` |
| `source-c07e349e46e5969f9dd00866` | rule-document-aggregate-budget | `extensions/bob-bazaar-review/test/ruleDocumentAggregateBudget.test.js` | `49b34956a5c4d3a1b867a615b2018f92a73187cd` |
| `source-d00fdc4453525c52ab2e44a2` | t15-aggregate-docx-extractor | `extensions/bob-bazaar-review/src/ruleAuthoring/extraction/docxExtractor.ts` | `1f8f5a03bfadc3565293d137823f112d8ab08c02` |
| `source-d4a33aff27a5fdfe2ef009b7` | document-aggregate-budget | `packages/processing-budget-runtime/test/documentAggregateBudget.test.js` | `53da9b930355482b3a2ca7a1c3f95f45c03e3574` |
| `source-d4e08dcfed03d4704221716b` | t15-aggregate-document-extractor | `extensions/bob-bazaar-review/src/ruleAuthoring/extraction/documentExtractor.ts` | `3cefab3d222c178520b5250df392af2fb8d621bd` |
| `source-d869381edc302fee73a78b09` | t15-aggregate-pipeline | `extensions/bob-code-consistency-review/src/core/pipeline.ts` | `72b6f87f4e900dc05fd2c51a329f35d7c6611bb7` |
| `source-dc1308461f2b82bbe709d2a9` | t15-aggregate-document-xlsx-extractor | `extensions/bob-code-consistency-review/src/analyzers/documentXlsxExtractor.ts` | `695fb55d263ff049bbda125a07a275b267d0d7b1` |
| `source-df389420fc16a7c3191f1011` | pre-parser-cancellation-closeout | `extensions/bob-bazaar-review/src/ruleAuthoring/extraction/docxExtractor.ts` | `1f8f5a03bfadc3565293d137823f112d8ab08c02` |
| `source-e4aab2d934795fa338eb336a` | xlsx-parser-await-cancellation-order | `extensions/bob-code-consistency-review/test/documentXlsxCancellationOrder.test.js` | `1b4a00c1388318c5f7e4849a05f9a637b0acc5b4` |
| `source-ebbc80adbe86accc7deb0bb0` | aggregate-integration-contract | `packages/processing-budget-runtime/test/aggregateIntegrationContract.test.js` | `b9f4393b23f8cc9bb8af3aa7161f1047a85eba16` |
