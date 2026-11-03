# PROC-T17-DEADLINE 詳細設計

日付: 2026-11-02 JST。状態: 書面レビュー待ち。今回の文書は設計であり、製品実装・依存取得・remote操作の承認ではない。

## 1. 目的と受入境界

T16の一操作・一台帳に、更新されないmonotonic absolute deadlineと、内部で認証した最初の取消原因を結びつける。CCRの前処理、Bazaarの一client操作、rule documentの一batchを、各工程や子コマンドの開始で時間が増えない処理にする。外部コマンドの失敗ではprocess group/tree終了処理を開始し、その処理が定義済みの終端に達するまでrejectを返さない。

基点M0は `6ce384313c1072e34ced342260304c9c7dd07e9e`、treeは `8b2738d648aeff346be05167cd30d952e974686a`。T16のsource PR204と別metadata PR205は受入済み。正式進捗は16 completion refs／14 of 20 VERIFIED（70%）、next=`PROC-T17-DEADLINE`。本sliceはordinal15、boundary=`PROCESSING-CONTROL`。次の `PROC-T17-PATH` はordinal16の独立sliceであり、本件では完了にしない。

選定済み54項目を対象とする。54paths／53unique blobs／56origin rows／54unique origin identities、owner commit=`7ea786afd5715d841526000a402c831d6c2a203c`。P19・B20・C15、contract14・symbol11・test family29。全origin blob identityは照合済み、不一致0。全675 source assignmentsと未割当0、旧16 completionのbytes／blob／subjectを保持する。付録Aは54項目すべてを列挙する。

P=`packages/processing-budget-runtime`、B=`extensions/bob-bazaar-review`、C=`extensions/bob-code-consistency-review`、W=`extensions/workflow-register`。旧archiveの `P/runtime/*.js` は現行には存在しない。native TypeScriptの現行ownerへ意味を適応し、削除済みCJS wrapper層を復活させない。

## 2. 方針の比較と選択

利用者は `call_251e6e7d06b24122994b7c760077d376` で「既存operationに期限を結びつける（推奨）」を選択した。承認されたのはこの方式と設計作成である。

| 方式 | 利点 | 代償・判断 |
| --- | --- | --- |
| 既存ProcessingOperationがdeadline/scopeを所有 | 台帳、文書owner、signal、期限の組合せが一意。T16の所有権検査を再利用できる | factoryとconsumer入口にlifecycleを追加する。今回の選択 |
| 独立deadline capabilityをoperationと併用 | 単独PDF／Bazaarから直接使いやすい | ownerとのpairing、dispose責任、再生成防止の検査が増える。主方式には採用しない |
| 子コマンドごとに相対timeoutを設定 | 現行の小さな修正で済む | 非更新absolute deadlineの選定条件を満たさないため除外 |

単独処理に必要なdeadline/scope primitive自体はPが提供する。製品の一操作でresource ownerがある場合には必ずそのownerに結び、別台帳や並行した時間authorityを作らない。archiveのAPI名は出典であり、現行の型・互換性・native module構成への適応は以下の設計者判断である。

## 3. 変更しない契約・対象外

- T13の13カテゴリ、default/max、aggregate関係、既存9個のProcessingBudgetError codeを保持する。時間を数量台帳の新カテゴリにしない。T15/T16の原本一回計上、workbook parser前予約、未commit予約release、過去commit非rollback、owner/document認証を保持する。
- CCRのdocument5/50MiB、sheet20/100、row500/5000、excerpt64KiB/1MiB、raw diff1/10MiB、Bob2/8MiBと、Bの20sources／25MiB each／100MiB batch／32KiB chunksを保持する。stdout caller cap、stderr256KiBと所有prefixも保持する。
- parser pins、extension versions、P private0.1.0／production dependencies0、既存exports、固定Workflow compaction113declared／111present／2absentを保持する。
- `PROC-T17-PATH` のjunction/UNC/executable/output path adapter、T18のreport・旧package復元・atomic promotion・complete-only handoff、V2 activation／新UI／新設定keyは追加しない。
- 同期native parser/inflateの途中停止、RSS/CPU上限、OS sandbox、PID birth identity、OS Job Object、残存process0を認証するreceipt、durable Workflow event arbiterは保証しない。T17の時間境界はcheck可能な処理と非同期外部processの制御である。
- `2026-07-17-workflow-reproducible-runtime-v2-budgets-cancellation.md` は歴史的Workflow設計であり、UTC/event-authority/provider receipt要件をProcessingへ自動輸入しない。

## 4. 現行との差

現行Pの `documentBudget.ts` はfrozen ProcessingOperation／WeakSet、private ledger、documentとのWeakMap pairingを持つが、時間を持たない。`boundedDocumentRequest.ts` はnative AbortSignal intrinsic getterを使い、通常T14は `bounded_document_cancelled`、operationはError reasonのidentityを保つ。

B/C runnerはbyte同一だが、各実行で1000–600000msへ再clampしたrelative timerを作る。allowed close時に期限を再検査せず、nonzero exitではtree cleanupを開始しない。親が既にexitした場合のhelper早期returnも、descendant終了の根拠にはならない。

CCRは最初に作ったownerを使いながら元 `input.abortSignal` を各層へ渡している。新scopeを作るだけでは接続できない。rule batchの現行signal優先順位はcommon > request > PDFであり、archiveの「複数explicit signalをすべて拒否」とは異なる。MCP registryは長寿命clientを保持しているため、client constructorでabsolute deadlineを作るならcallごとのclient生成へ変更する。

## 5. Deadlineとclock

Pにnative `src/deadlineCancellation.ts` を一つ追加する。基本型はimmutable closed own-dataの `AbsoluteProcessingDeadline { expires_at_monotonic_ms: number }`。expiryはfinite・非負・MAX_SAFE_INTEGER以下。unknown keys、accessor、symbol、継承config、NaN/Infinity、UTC文字列を拒否する。fractionalなmonotonic timestampは許す。

公開primitiveは `monotonicNowMilliseconds()`、`createAbsoluteDeadline(timeoutMs, nowMs?)`、`constrainAbsoluteDeadline(parent, timeoutMs, nowMs?)`、`remainingDeadlineMilliseconds(deadline, nowMs?)`、`createCancellationScope(input)`、`cancellationKindFromSignal(signal)`、`cancellationOriginalReason(signal)` とする。factoryのtimeoutはpositive safe integer。残量は `max(0, ceil(expiry-now))`、子制約は `min(parent.expiry, now+duration)`。新durationを足して親期限を更新しない。絶対値は同じNode processのmonotonic clock domain内でのみ使用し、永続化・別processへtransferしない。deadline/clockの不正入力は固定messageのTypeErrorとし、ledger9codesを増やさない。

本番clockは `performance.now()`。テスト用now/schedule/cancelScheduleはtrusted native DIとしてscope生成にだけ渡せる。JSON/config/requestからfunctionを受け取らず、製品consumerは本番clockを使う。clockの非finite値・安全域超過・後退はfail closed。テストclockも同じdomainで一貫させる。

設定の正規化はoperation入口で一回だけ行う。nonnumber/nonfinite/<=0は120000ms、その他はfloor後1000–600000msへclampする。既存 `bobBazaar.commandTimeoutMs` と `bobCodeConsistency.vcsCommandTimeoutMs` のkey/default/rangeを保持する。C設定の説明だけを「前処理一回全体で共有する期限」へ直す。Pのprimitiveやrunnerに1000msの最小残量を追加しない。残り50msの子実行は50ms以内、pre-expiredならspawn前に失敗する。

明示的な親deadlineは既存scopeのauthorityである。借用consumerはその同一deadlineを継承し、nested timeoutを再正規化・再適用しない。追加の短縮制約が必要ならowner生成前に集約し、一度確定したownerを別deadlineと組み合わせない。明示deadlineがない独立入口だけが正規化durationから新しい期限を作る。Rule batchは明示deadline群の最小値を採用し、なければ各requestのPDF timeout正規化値の最小から一つ作る。後続PDFに別のrelative timeoutを与えて延長しない。

Nodeのtimerは正確な発火時刻・順序を保証しない。最大delayは `0x7fffffff` とし、長deadlineは残量を再scheduleする。早いcallbackはexpiryを再確認して再scheduleし、callbackが遅れても同期checkpointが期限を観測する。timerはunref可能な本番handleでunrefし、必ずdispose可能にする。[Node22 timers](https://nodejs.org/download/release/v22.23.0/docs/api/timers.html)、[performance.now](https://nodejs.org/download/release/v22.23.0/docs/api/perf_hooks.html#performancenow)。

## 6. 認証したfirst cause

scopeはnative AbortController/AbortSignalを使い、private WeakMapにsignal identity・実際のreason identity・内部kind・元reason・refresh関数を結ぶ。公開errorのclass名/code/kind、structured object、別signalへ転載したreasonだけではdeadlineと認証しない。別のcopied runtime instanceのsignalも内部認証できなければuserとして扱う。

`ProcessingCancellationError` は既存9個のbudget errorとは別のError型。code=`processing_cancelled`、kind=`user|deadline`、opaque `original_reason?` を持つ。constructorは公開しても認証authorityにはならない。内部分類はWeakMapのsnapshotを使い、error propertyを書き換えても変わらない。未知reasonの文字列化・getter・diagnosticへのraw保存は行わない。

scope作成時はsourceの既存cancelを先に確認し、その後にdeadlineを確認する。listener登録直後にもsourceを再確認する。以後は最初に観測した取消原因を一つだけ保持する。同一checkpointでsource cancelとexpiryを初めて観測した場合もsourceを先に扱う。これは観測順の規則であり、観測されなかった実世界の時刻を復元する規則ではない。後から来たuser/deadlineで既存の取消causeを置換しない。transportのoverflow/nonzero等のfirst failureは別のrunner settlement状態であり、outer操作の最終採用規則は§9.2に従う。

内部parent scopeの認証済みcauseはchildへ同じreason identityで継承する。scopeの `throwIfCancelled()`、分類関数、Pのbounded checkpointはtrusted signalのrefreshを呼び、native intrinsic getterだけを読んで同期expiryを見逃さない。untrusted signalのown `.aborted`/`.reason` getterをauthorityとして実行しない。`AbortSignal.any()`によるreason転載だけで内部分類を推測しない。[Node22 AbortController](https://nodejs.org/download/release/v22.23.0/docs/api/globals.html#class-abortcontroller)。

### 6.1 現行Error互換

新scope API自身はtyped ProcessingCancellationErrorを返す。既存product境界では、認証済みuser causeの元reasonがErrorなら同じErrorをthrowし、非Errorなら従来の `BoundedDocumentError('bounded_document_cancelled')` を使う。通常T14 APIのuser cancelも従来codeを保つ。認証済みdeadlineはtyped ProcessingCancellationErrorを保持し、普通のparser warningや成功へ変換しない。untrusted Errorがdeadlineに見える場合も、user Errorとしてidentityを保つ。

この互換処理はscopeの認証情報を参照し、public errorのkindから推測しない。C VCS catchではoperation取消確認をstdout overflow parsingより先に行い、operator ErrorがExternalProcessErrorに似ていてもT16のidentity維持を壊さない。bounded file/OOXMLのcatchもtyped deadlineを一般的なI/Oエラーへ包み直さない。

## 7. ProcessingOperationへの所有権集約とdispose

`ProcessingOperationInput` に `deadline?` を追加し、未指定時は120000msのdeadlineを一度作る。新operationは必ず一つのscopeを所有する。既存profile/13カテゴリのschemaは変更しない。`ProcessingOperation` にreadonly `deadline`、effective native `signal`、`throwIfCancelled()`、`dispose()` を追加する。既存snapshot/reserve/documents/assertDocumentsとprivate ledger/WeakSet/symbol pairingはそのまま使う。

reserve/documents/assertDocumentsは時間・取消を検査し、snapshotは失敗後の診断にも使える。documentsは一度だけ、count0も初期化一回を消費する。入力のsource signalと生成後のeffective signalを混同しない。consumerにoperationとsignal/deadlineを併記する場合はownerのeffective capabilityと一致させる。不一致はI/O前に拒否し、同値profileで別ownerを作らない。

`DocumentOperation` は同じdeadline/effective signalを借用する。`createDocumentOperation` の隠れたProcessingOperationもdefault deadlineを一度だけ持つ。DocumentOperationには `dispose()` を追加し、直接factoryが所有する隠れたownerだけをdisposeする。親operationから借用したdocument handleは自身のtimer/listenerを持たず、そのdisposeは親を解除しない。主な製品入口は明示ProcessingOperationを所有し、finallyでそのownerをdisposeする。

disposeはidempotentで、timerとsource listenerを解除するがcancelを要求しない。archiveと同じく、その後の明示checkpointはsourceとdeadlineを同期refreshし、disposeで期限を無効化しない。既存causeも消さない。失敗時のfile close・tree termination・未commit release・managed cleanupは取消signalで中断せず、最初の原因を保持してsettleする。借用consumerはparentをdisposeしない。

P primitiveは単独caller向けにも公開するが、resource ownerを持つ製品処理ではそのownerのscopeを使う。BのBazaarClientのようにquantity debitをしない操作でも、同じProcessingOperation factoryを用いて一操作一scopeにする。数量使用量は0のままで、追加ledgerや新budget categoryは作らない。

## 8. Rule batchのsignal互換性

現行T15の `common batch signal > request.signal > request.pdf.signal` を保持する。上位signalが選ばれた場合、下位signalを勝手に合成・採用しない。このためarchiveの「すべてのexplicit signalを集め複数なら拒否」というtestは、そのまま移植せず適応理由をsource coverageへ記録する。

commonがない場合には各requestのeffective signalを選び、異なるeffective signalも従来どおり受け付ける。batchはそれらの最初の取消を監視する一つのownerを作る。選択されたsourceの取消はbatchのresource-control failureとして全体へ伝える。未選択の下位signalの取消は影響しない。複数pre-cancelはrequest順、実行中は最初に観測した選択sourceの通知を採る。

この適応のためscope/factoryにoptional `signals?: readonly AbortSignal[]` を追加できる。single `signal`との同時指定は拒否し、配列は作成時にsnapshot・identity dedupする。各sourceはnative signalで、内部causeはその実source identityから認証する。構造化reasonを新しいcomposite signalへ転載してkindを認証しない。これはarchiveに対する設計者の互換拡張であり、利用者が方式選択時に個別承認済みだったものとはしない。

fingerprint前にすべてのeffective pre-cancelを確認し、fingerprint/extractionは引き続き逐次とする。失敗後のsibling処理を残さず、DOCX/XLSX/PDFのnested options・command/runner・locator・通常warning・dedup前の原本会計を維持する。

## 9. B/C external runner

両runnerのsourceをbyte同一に維持する。`ExternalProcessOptions` のrequired relative `timeoutMs` をrequired `deadline` に置換し、全4production callsitesとinjected runner契約を一括更新する。互換relative timeoutはconsumer入口の設定入力にのみ残す。shell:false、Windows hidden、POSIX detached group、fixed argv、stdout caller cap／stderr256KiB、独立outputStreamとowned prefixを保持する。

runnerは受け取ったabsolute deadlineとsignalで局所scopeを作り、parentの期限を延長しない。preflight、spawn直前、data/error/closeの採用前にrefreshする。allowed closeであってもdeadline到達後は成功しない。timer callbackが遅れてもcloseで検知する。source Error/typed deadlineを消さず、runner Errorには `terminationCause = deadline|user|stdout_limit|stderr_limit|spawn_failure|non_zero_exit` を固定する。従来kindはtimeout/cancelled/bufferExceeded/spawnFailure/nonZeroExitを保つ。最初のsettlementだけが選ばれ、後続eventは原因を上書きしない。

nonzero exitと、spawn後のerror/timeout/cancel/overflowは必ずtree terminationへ進む。同期spawn throwはchildが存在しないためcleanup不要としてrejectする。失敗時はtimer/listenerとstdio callbackを止め、bounded prefixを固定し、controller settle後に元failureをrejectする。trueなallowed successだけが通常resolveする。

### 9.1 Windows/POSIX settlement

Windowsはhidden `taskkill /pid PID /T /F`、POSIXはdetached groupへのSIGKILLと25ms間隔のgroup存在確認を用いる。親exitだけで終了扱いにしない。parentが既にexitしたnonzero failureでもcleanupを試みる。Windowsはtaskkill成功、またはkillerの失敗settlement＋親終了へ進み、必要ならdirect-child fallbackを使う。POSIXは親終了とgroup不在を観測するまで待つ。

termination待ちは別の固定2000ms graceで上限を持つ。この待ちはoperation期限から新たな仕事を許す時間ではない。fallback上限・失敗時はcleanup未確認という内部状態を残して元failureをrejectし、成功へ昇格しない。`cleanupStatus` はcontroller_settled／best_effort_failure／bounded_wait_expired／not_required等のclosed metadataとし、詳細な命名はbuilder判断でよい。元causeをcleanupエラーで置き換えない。

archiveも2000ms fallbackを持つため、これはbounded best effortであって残存process0の証明ではない。特にWindowsの既に終了した親のdescendant探索やPID reuseは証明しない。`child.killed` はsignal送信の成否であって終了証明ではない。[Node22 child_process](https://nodejs.org/download/release/v22.23.0/docs/api/child_process.html)。

### 9.2 終了待ち中にownerが取消・期限到達した場合

runnerのfirst transport failureとownerのfirst cancellation causeは別の観測である。runnerはoverflow/nonzero等を記録した後、終了待ち中のexpiryでそのrunner failureを上書きしない。一方、outer consumerが結果・warning・切詰めdiffを採用する時点では、T16の既存規則どおりownerの認証済み取消を先に確認する。

| 時系列 | runnerのsettlement | outer操作の結果 |
| --- | --- | --- |
| overflow/nonzero→cleanup完了、ownerは有効 | 最初のrunner error | 元errorまたは既存の許可されたoverflow処理 |
| overflow119900ms→cleanup中expiry120000ms→settle120100ms | 元overflow errorを保持してreject | 認証deadlineをthrow。prefix／warning／fresh packageを採用しない |
| nonzero→cleanup中user cancel→settle | 元nonzero errorを保持してreject | 元operator Error同一性を保ってthrow。非Errorなら既存typed取消 |
| user cancelが既に選択→その後expiry | 最初のrunner settlementのみ | 最初のuser causeを保持 |

このouter優先順位は現行C `gitDiffCollector.ts` のtransport後取消確認と、T15/T16の「取消をwarningへ変換しない」契約を保つ。cleanup failureそれ自体でprimary runner errorを置換することとは異なる。user/deadline競合をtransport eventの見掛けのcodeから認証しない。低レベルrunner error／cleanup観測とouter最終結果をテストで別々に確認し、新durable reportは追加しない。

standalone PDFの既存blocked-result APIは例外的な表現である。owner停止時はその認証済み原因を使うblocked診断と空chunksを返し、本文のsuccess採用や追加処理は行わない。borrowed PDFは§10.2どおりouterへthrowする。standalone PDFについてoperator ErrorをthrowするAPIへ変えたとは主張しない。

## 10. Consumerの接続

### 10.1 CCR前処理とVCS

`preprocessReview` の既存 `commandTimeoutMs` をoperation全体の設定として一回正規化し、optional `deadline` と制約してowner生成時に確定する。ownerはreviewInput read/path resolution前に生成する。以後は元abortSignalではなくownerのeffective signalとdeadlineをvalidateReviewInput、Git/Bazaar revision/diff、repository-index Git、文書抽出、package writerへ渡す。

code analysis/context/traceabilityなど選定されていない内部subsystemは全面改造せず、そのawait前後と採用前に同じownerをcheckする。artifact ledger後・最終return前もcheckし、期限後のfresh package成功を返さない。同期処理や非対応async API自体の強制中断は主張しない。package失敗cleanupと過去有効package復元は別で、T18を先取りしない。

`collectGitDiff` とrepository indexはcaller ownerがあればそれを借用する。単独呼出しは入口で一つの期限つきownerを作ってfinallyでdisposeする。fixtureはpre-expired時にreadしない。全revision／metadata／raw diffコマンドで同じdeadlineを使う。repository indexのstandalone `positiveInteger` input制約は保持し、新たな緩和を行わない。親期限がある場合にそこへstandalone durationを足さない。

### 10.2 BazaarClient、MCP、PDF

BazaarClientはconstructorで既存timeoutを一回正規化し、一つのoperation deadlineを作る。nested commandは同じdeadlineを使い、再呼出しでrefreshしない。ownerを持つ側だけがdisposeする。long-lived MCP registryはclientを閉じ込めず、各tool callでfresh clientを作りfinallyでdisposeする。BZR_PATH/BZR_MAX_BUFFER/BZR_TEXT_ENCODINGの既存意味を保ち、新timeout envや設定keyを追加しない。

単独PDFは自分の一つのownerを作り、固定argvで実行してfinallyでdisposeする。既存のstandalone blocked/ocr result契約は保持し、deadline/取消で本文をsuccessとして採用しない。batch等のownerを借用するPDFは、process failureをblockedへ変換する前後にowner取消をcheckし、認証deadline/user failureをouter操作へ戻す。通常のspawn/nonzero/OCR不足は従来の診断経路を保持する。

### 10.3 Rule DocumentとGUI

single/batchはfingerprint前に一つのownerを作る。Bの既存profile builderをそのownerへ接続し、doc operationを一度だけ生成する。request/PDF deadlineは§5の最小値規則、signalは§8。DOCX/XLSX import/parse、PDF process、source post-check、manifest/chunks採用の前後で同じ期限を観測する。

`ruleAuthoringGui` の一runにAbortControllerを持たせ、cancelRun／panel dispose／置換runの終了でそのrunだけをabortする。既存generation guard・UI状態・非管理file保持を残し、extraction dependency signatureからbatch optionsへeffective signalを渡す。新設定や一般Bob handoffの改造は行わない。run完了finallyはtimer/listenerもdisposeする。

## 11. Bounded read/OOXMLの同期checkpoint

`boundedDocumentRequest` のauth-aware checkを共通にし、T14 ordinary／T15 operationの既存Error互換を§6.1どおり分ける。readExactlyの各chunk前後、fingerprint/verify、allocation・予約・結果採用・commit前に確認する。file closeは取消でも完了させる。clone前のpre-cancelでallocation／reserveを行わない。

OOXMLのsnapshot、EOCD探索、central/local header、extra field、各entry、decode/inflate前後、CRC loop、workbook列挙へtrusted checkpointを通す。untrusted callbackや構造化reasonを実行authorityとして受け取らない。同期native inflate/parserは途中preemptできないため、前後で期限を確認して採用を拒否する。

予約群は最後のcheck後にawaitを挟まず同期commitする。commitごとに途中cancel判定を挟んで半分だけ確定させない。失敗では未commitをreleaseし、既に確定したraw/document/workbook使用量は巻き戻さない。parser lazy load、正しいBuffer identity、構造上限と583 parser filesを保つ。

## 12. Packagingとimmutable admission

Pに追加するflat moduleは `deadlineCancellation` 一つ。14→15modules、42→45compiled files、tarball46→49paths（compiled45＋既存4assets）を新しいcurrent契約へ明示する。rootと `./validated-ooxml` exports、3type consumers、production deps0は保持する。B/C copied runtimeは15JSとmanifest、実host loaded runtimeは30entriesへ更新する。parser8entries／583fixed filesは不変。

旧T13–T16の歴史的coverage/admission・completion bytes、source subject、package count46の過去観測は書換えない。T17 current admissionをその上に独立layerとして追加する。54selected itemsへのsemantic adaptationと全675 partition、追加current-main prerequisiteを列挙し、unknown path/alias/working-index drift／wrong originを拒否する。W source/deps/compactionを変更しない。

実VSIX capはW1200000／B12000000／C11000000bytes。現物packageで確認し、超過したらbytesと検証済み対策を揃えて、その変更だけ別承認を得る。新規scopeのため容量制限を緩めない。失敗した旧CIやmutable producer outputを別headの成功として再利用しない。

## 13. 検証とReview Focus

各実装変更はRED→GREENとし、元archiveのtest名・目的と現在のowning testの対応をcoverageへ残す。固定clockのままtimer callbackだけでexpiryを期待するarchive testは、clockを進めるテストへ訂正する。early callback再scheduleとの矛盾をそのまま輸入しない。

必須matrix:

1. nested deadline非更新、残量50ms、pre-expiry、境界丁度、NaN/unsafe/closed config、長timer、early/late callback、clock DI整合。
2. pre-cancelとexpired同時のuser優先、listener登録race、最初の観測cause固定、nested deadline/user継承、forged structured reason、公開constructor偽装、別signal転載、別runtime instance、opaque falsey/nonError reason。
3. T15/T16 Error identity、BoundedDocumentError互換、operator Errorがstdout overflowに似た場合、普通のT14取消、typed deadlineがI/O/parser warningへ変換されないこと。
4. owner一つ・document初期化一度・fake/cross-owner拒否、owned/borrowed dispose、dispose後の同期refresh、timer/listener解放、snapshotと既commit usage保持。
5. runner spawn直前expiry、delayed timer下のallowed close拒否、独立stream exact/+1とprefix、nonzero親exit後tree cleanup、Windows killer終了待ち、POSIX group polling、2s未確認fallbackが成功にならずrunner primary causeを維持すること。overflow/nonzero→cleanup中expiry/user cancelでは、元runner errorとouter認証取消の両観測を分けて確認する。
6. common/request/PDF優先順位、ignored lower signalが影響しないこと、複数effective sourceの最初の取消、batch逐次fingerprint、同deadlineを全PDFへ伝播、MCP callごとのfresh client、GUI cancelRun/disposeから実signalまでの接続。
7. bounded read chunk／OOXML entry/CRC/workbookで同期expiry、pre-cancel時clone/reserve0、途中失敗でrelease/close、全commit前の最後のcheck、現在のbyte・parser・locator・warning契約。
8. CCR input/path前とfinal ledger後の同owner check、fixture pre-expiry read0、package writer reserve-before-write／cleanup／非管理file保持、期限後のfresh package成功0。

独立reviewは特に、(a) public error dataと認証authorityの混同、(b) scope後に元signalを渡す漏れ、(c)子durationの再clamp、(d)disposeでparent timerを失う経路、(e)2秒fallbackを残存process0と誤認する記録、(f)archive複数signal拒否と現行互換性、(g)同期parser preemptionの過大主張、を確認する。

実package/型consumerと、実VSIXを使うUbuntu/Windows isolated hostで新matrixを追加する。T16の25case baselineと旧parser/quantityケースを保持し、追加case総数と名前は実装計画で固定する。fake controllerのテストをnative process-tree終了証明と呼ばない。

## 14. 実CI、受入、保持

sourceと別completion metadataを分け、それぞれ一回fresh read-only review、Critical/Important一回のTDD fix pass、Minorは記録する。具体的なcandidateのlocal verification・commit/index tree・package/host evidenceを整えてから、そのcandidate固有の新C承認を得る。headが変われば承認/実CIを転用しない。旧CI免除は継承しない。

候補/mainとも5workflow・18契約行を新規確認する。PRは18actual success、非PRは17actual success＋PR専用metrics skip1。不足workflowは同じhead＋新32hex nonceでdispatchし、runner/checkout/event/attempt/log/artifactを結ぶ。queue/403/未起動/失敗を成功にしない。両OSの実host receipts、同じcompiled runtime/pins、元runner captureとportable replayを分け、実artifact bytesを保持する。

条件成立時のみnormal mergeし、parents/treeとsource observationの不変を確認する。main actual CI後、対象WT ff-only・未checkout local main非force FFを行う。primaryのbranch/head=`codex/bob-auto-response-probe`／`90f926e0045405625f1f40d20a41346a94d1981a`、未追跡15、Owner57 rawSHA256=`1665c66acd04a535b08116e639f5119b98e03609d9bb4d5f8efacc9bba37b5a4`を保持する。全existing worktrees、named branches、初回失敗・記録・physical artifactsを削除しない。

`.integration-xlsx-on-prereq/`、`docs/analysis/`、`docs/superpowers/plans/2026-09-28-premium-informed-three-extension-improvements.md` の内容を読まない。設計作業用の新WTを加えた18worktreesを保持する。

source受入だけでは正式進捗を進めない。別metadata受入後に17refs／15of20（75%）／next=`PROC-T17-PATH`とする。PROCESSING-CONTROL boundary全体をT17-DEADLINEだけでVERIFIEDにしない。V2 inactive、visual/live Bob/final Program UAT not_runを維持する。別metadataのremote候補は完成後に別C承認を得る。

## 15. 設計者判断とbuilderに残す事項

利用者が選んだのは§2のowner集約方式。新native module一つ、default deadlineのfactory付与、Error互換adapter、owned/borrowed dispose、複数effective sourceの監視、standalone PDFのblocked互換、bounded best-effort controllerと未確認状態、旧archiveの矛盾test修正は設計者提案であり、この文書の承認対象とする。fresh builder checkの唯一の重要質問「終了待ち中のexpiryが先行overflowを上書きするか」は、現行T16の取消優先を保持する§9.2で解決した。runnerとouterの別観測として記録し、未決の利用者要件には残さない。

関数内のprivate helper配置、cleanup metadataの厳密な名称、mockの実装、named test分割、receipt local root名はbuilder判断。one owner／nonrefresh deadline／認証first cause／現行Errorとsignal優先互換／source54対応／数量とparser保持／whole-operation disposal／終了待ちの保証範囲／source-metadata分離はbuilderが変更しない。詳細なtask順、各Expectedと実CI/native hostのcase数を次の実装計画で固定する。

## 付録A. Immutable source54項目

全行のorigin commitは `7ea786afd5715d841526000a402c831d6c2a203c`。runtime旧pathは§1/§11のnative TSへ適応し、表のpathを復活させる指示ではない。full origin rows／symbols／selected partitionは設計証拠 `SOURCE-INVENTORY.json` に固定する。

| Item | Family | Origin path | Blob |
| --- | --- | --- | --- |
| `source-01a9655f527e3c20b24c6835` | ooxml-facade-cancellation-forwarding | `packages/processing-budget-runtime/runtime/bounded-document-runtime.js` | `4ea9d346f7840f1b35507aa914a3c01deb8e68aa` |
| `source-01f7821ee897fedfb488ca62` | t17-deadline-windows-process-tree-termination | `extensions/bob-bazaar-review/test/windowsProcessTreeTermination.test.js` | `2f64c1813e21e012915cc06f63397b6783ee67df` |
| `source-0242818ae8483b31a38c73a6` | t17-deadline-document-extractor | `extensions/bob-bazaar-review/src/ruleAuthoring/extraction/documentExtractor.ts` | `0330703b737cbdfb86315403699a073599a03218` |
| `source-2b646d5d315a539415d3e73c` | external-process-wiring | `extensions/bob-code-consistency-review/test/externalProcessWiring.test.js` | `afd22bd57b8a8b62737fddeaab4eeefa2133d729` |
| `source-2df85f46e62ea5d5fc8545f9` | mcp-tool-deadline | `extensions/bob-bazaar-review/test/mcpToolDeadline.test.js` | `2137c9f2830cf41879f1ddd8cf1bfb8056eca090` |
| `source-3492db8bbbc56bda287a9055` | ooxml-authenticated-synchronous-cancellation | `packages/processing-budget-runtime/runtime/bounded-zip.js` | `e8f50acb88a82bea77ae5fbc84fe7a55bea14881` |
| `source-3af20d158a95f6e5eb6bc244` | deadline-reason-authentication | `packages/processing-budget-runtime/test/deadlineReasonAuthentication.test.js` | `43f30155889f80f0457aae84fca9c8da469adbf1` |
| `source-3df4b118944857706a292a71` | deadline-cancellation | `packages/processing-budget-runtime/src/deadlineCancellation.ts` | `df7e5fe0dd4500abbd09442c8dd9e33a77d79879` |
| `source-401a97fced069da2bee6384b` | posix-process-tree-termination | `extensions/bob-bazaar-review/test/posixProcessTreeTermination.test.js` | `1b81bd5a23f37ee4e45e102182efa027f25d83bc` |
| `source-422ee5e3fe35e7ae1ca2f981` | cancellation-reason-propagation | `packages/processing-budget-runtime/test/cancellationReasonPropagation.test.js` | `9e5887e3608d76cee8aecd123e69ad28ef72ad8a` |
| `source-48166ff553110df8983d5257` | vcs-single-operation-deadline-and-cause | `extensions/bob-code-consistency-review/src/core/gitDiffCollector.ts` | `c8bb4fe15b0f8f96d36766d82ce8378701c65cb0` |
| `source-4b4730055bf291daeb1a9b42` | t17-deadline-rule-pdf-extraction | `extensions/bob-bazaar-review/test/rulePdfExtraction.test.js` | `83100c20037d27237552a852d4dfbcdb6de183f4` |
| `source-4d3c8c1d47eea6437944309c` | t17-deadline-external-process-runner | `extensions/bob-code-consistency-review/test/externalProcessRunner.test.js` | `892949c97c8a148f5bb70b6c3daeb54c9fc6dd52` |
| `source-4d84e287ca61db22836ab0d4` | deadline-cancellation-public-exports | `packages/processing-budget-runtime/src/index.ts` | `05dc203acfc5a2fb4fef82c7e75e14d811c58f09` |
| `source-4e660869aa1ada148aeb2bda` | bounded-source-archive-cancellation-contract | `packages/processing-budget-runtime/src/boundedDocumentIo.ts` | `52c0b0e27d70010b0214b5fb2e6bccf1caec8a55` |
| `source-5237c6af1c153c9400cd06cf` | diff-fixture-pre-expired-deadline | `extensions/bob-code-consistency-review/test/diffFixturePathBoundary.test.js` | `c9adc1c01b87d751ab9f4268f1e5e761341e5ff0` |
| `source-5af29fd63ef8b7045a65ff67` | t17-deadline-rule-source-hash | `extensions/bob-bazaar-review/src/ruleAuthoring/ruleSourceHash.ts` | `c26b867d387a838c3147b8e0fd1f7d8b190ca59c` |
| `source-6b16cf78cbd9cf1ded5f9240` | package | `extensions/bob-code-consistency-review/package.json` | `99ad6e6dd0cdde4c406c31cb588b77d97b36bc99` |
| `source-6c4642fcb7b9c15c901d72c2` | deadline-configuration-contract | `extensions/bob-code-consistency-review/test/deadlineConfigurationContract.test.js` | `49f43891dd2752ca28609d50dd2cffc26919bb54` |
| `source-6d627a871a7f238b34893ad7` | deadline-cancellation-consumer-facade | `extensions/bob-bazaar-review/src/sharedProcessingBudgetRuntime.ts` | `238a28e4f37e578fe8fc486858f92b17cfcda0ff` |
| `source-6e83ef7a0f958789ba1fa2ed` | rule-document-deadline | `extensions/bob-bazaar-review/test/ruleDocumentDeadline.test.js` | `6afed8995f177f733442e39dd2dac5869694cb53` |
| `source-6eeca2d26a9aa16ab8ef600e` | t17-deadline-workbook-budget | `packages/processing-budget-runtime/test/workbookBudget.test.js` | `75f1fa3064e2327d104fa2129a3fd392153955b2` |
| `source-70c2dea15f32dc8ddf7a81e4` | deadline-settlement | `extensions/bob-code-consistency-review/test/deadlineSettlement.test.js` | `9bbb249cd21e761ed5d18a709e3996e2a8db3ba5` |
| `source-730c5e064055f1b7adffeb69` | deadline-runtime-consumer-wiring | `packages/processing-budget-runtime/test/task17IntegrationContract.test.js` | `eb9040f527f40ea451a5c83f43e6ec1b1dea6999` |
| `source-7d745b5944c1a7b68cfb1465` | bazaar-client-nonrefreshing-deadline | `extensions/bob-bazaar-review/src/bazaar/bazaar.ts` | `f44addff45e33ea0b8554fb747b39ab8d595db0f` |
| `source-84c0ecbeece6f1a6ebd7f215` | bounded-document-cancellation | `packages/processing-budget-runtime/test/boundedDocumentCancellation.test.js` | `97840d900a5b62e38410673499bb79260d9673b6` |
| `source-859cf9b394d1bc84511ef37d` | tools | `extensions/bob-bazaar-review/src/mcp/tools.ts` | `71bed029c888aeb33d37706985fd4795d570c17b` |
| `source-85b0b67dff73be4be2abfbd4` | t17-deadline-windows-process-tree-termination | `extensions/bob-code-consistency-review/test/windowsProcessTreeTermination.test.js` | `69db24bae007c9d348d740e26d66df224a834c7b` |
| `source-9659ba5cde0d919ac0a0e8c8` | external-process-authenticated-cause-and-tree-settlement | `extensions/bob-code-consistency-review/src/core/externalProcessRunner.ts` | `44bdbdeed3ad959b63937710cd2530a848e2afe5` |
| `source-9909fe163821c8d49a50588a` | t17-deadline-document-extractor | `extensions/bob-code-consistency-review/src/analyzers/documentExtractor.ts` | `10bc28f90970dc9131b2c8f13c766f74c6b9a371` |
| `source-9ce8c736275573d2f95cb081` | deadline-synchronous-expiry | `packages/processing-budget-runtime/test/deadlineSynchronousExpiry.test.js` | `fc8f8c6301e6189a4fc748767a447738ce50f5d5` |
| `source-a2b03f10fed5ed28286aed02` | t17-deadline-pipeline | `extensions/bob-code-consistency-review/src/core/pipeline.ts` | `9fa140c95e9966fe491080cb75b518ec36095aa4` |
| `source-ad09a42bee1d878c41fe9e79` | posix-process-tree-termination | `extensions/bob-code-consistency-review/test/posixProcessTreeTermination.test.js` | `8f5633125f65ffaed305859a9eb5bccc99a1d4c2` |
| `source-b335aea38d77e70867dbff68` | bounded-archive-cancellation | `packages/processing-budget-runtime/test/boundedArchiveCancellation.test.js` | `dbecb6dde522573975bfb8f12045f6fe968be2dc` |
| `source-b81959ae019101dc335c9c98` | t17-deadline-external-process-runner | `extensions/bob-bazaar-review/test/externalProcessRunner.test.js` | `34c5d6ad884371df40a0e641488da01c75672566` |
| `source-b8b9df65d1f3050c70c13f7c` | deadline-settlement | `extensions/bob-bazaar-review/test/deadlineSettlement.test.js` | `dde02ac917bbdb84342670ac4011555a4c9e3c88` |
| `source-bb91584f71612f3e175e76f2` | task17rule-authoring-cancellation | `extensions/bob-bazaar-review/test/task17RuleAuthoringCancellation.test.js` | `ea102e9bb191d78629a1f6cbc98d41df6f9ba369` |
| `source-bda3c142c71b53f9bbdd6e2d` | t17-deadline-xlsx-extractor | `extensions/bob-bazaar-review/src/ruleAuthoring/extraction/xlsxExtractor.ts` | `67efc20cf7efa49c8ee0f6c5acdba4ff2433099f` |
| `source-bf5a1d63ef4b8f946cc8f95b` | deadline-cancellation | `packages/processing-budget-runtime/runtime/deadline-cancellation.js` | `00cb83cedcc72a7713a32e0b530deefa712d4fd6` |
| `source-c22f6c70eb524373f02f229b` | deadline-long-timer | `packages/processing-budget-runtime/test/deadlineLongTimer.test.js` | `5e1a827ccf8def2ec8785893790cf8676006261f` |
| `source-c3ad921f37b6a82d27d7af4e` | ooxml-cancellation-wiring | `packages/processing-budget-runtime/test/ooxmlCancellationWiring.test.js` | `27faa86b47498fa491efeac0c33924cb14ef82cb` |
| `source-c7836f19ab61ab5583ec71aa` | t17-deadline-pdf-extractor | `extensions/bob-bazaar-review/src/ruleAuthoring/extraction/pdfExtractor.ts` | `bce9d19678b03380f57d699a6d1bfdf6b2ddf7ae` |
| `source-c84f819d75a53bfcc42d3531` | external-process-wiring | `extensions/bob-bazaar-review/test/externalProcessWiring.test.js` | `183ac427126ab37d140ac28e4680154e0d0d63a8` |
| `source-ca7404fcccfb8012f2637dd7` | trusted-synchronous-bounded-deadline | `packages/processing-budget-runtime/test/synchronousBoundedDeadline.test.js` | `56032e4c2eb234a3ef01ab4c86950e3e9c02c833` |
| `source-cadf6df2cd6d0b41cd4b897f` | deadline-cancellation | `packages/processing-budget-runtime/test/deadlineCancellation.test.js` | `12a4e78e02aa6f0deb68d6756113d11649f37561` |
| `source-cdf15f7d0d73f91e0a022cfd` | preserve-authenticated-processing-cancellation-error | `packages/processing-budget-runtime/runtime/errors.js` | `7d74f56a82329e413bf717d094477412ee965d11` |
| `source-d0917810045b5739bc8f6370` | repository-index-git-deadline-forwarding | `extensions/bob-code-consistency-review/src/evidenceScope/repositorySymbolIndexProducer.ts` | `db5a97f5888b758e602049fca58fffea7a8495af` |
| `source-d47d8a1ad7e651d178c4ecb1` | bounded-file-authenticated-cancellation | `packages/processing-budget-runtime/runtime/bounded-file.js` | `2d52d68f9f854a177c5416bd17907cc258cb2a89` |
| `source-d51d0f0701cb68ddc04dc206` | bazaar-client | `extensions/bob-bazaar-review/test/bazaarClient.test.js` | `5331c89343220ad2a6343b44b3f522ea70cc783b` |
| `source-d6e35ead5bdf9406a3ec4f01` | external-process-authenticated-cause-and-tree-settlement | `extensions/bob-bazaar-review/src/bazaar/externalProcessRunner.ts` | `44bdbdeed3ad959b63937710cd2530a848e2afe5` |
| `source-dd222a5fc261fb64b45fba8b` | rule-authoring-operation-cancellation-adapter | `extensions/bob-bazaar-review/src/ui/ruleAuthoringGui.ts` | `ee30758fa33856110067e97d06a631e9deb8a34e` |
| `source-e69de915da3b2c2508e9cb90` | t17-deadline-docx-extractor | `extensions/bob-bazaar-review/src/ruleAuthoring/extraction/docxExtractor.ts` | `5c2fa3c8893d405e92ada7ae568c4f2ffa151617` |
| `source-ea3a1c93f1943b1e70e5990c` | pipeline-final-deadline-check | `extensions/bob-code-consistency-review/test/pipelineFinalCancellation.test.js` | `ceea1a98709869745daf6cacbcef37855a3ba5ae` |
| `source-ed1e49e2ede1bb77d9551e9d` | deadline-cancellation-consumer-facade | `extensions/bob-code-consistency-review/src/sharedProcessingBudgetRuntime.ts` | `9b9ee324b096b84dc9edb3ebd2886d74973d0855` |
