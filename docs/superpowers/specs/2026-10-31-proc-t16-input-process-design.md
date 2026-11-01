# PROC-T16-INPUT-PROCESS 詳細設計

## 1. 目的と基点

CCRの一回の前処理で、T15の文書・workbook台帳とdiff・文書抜粋・Bob入力・管理生成物の予算を接続する。外部コマンドはstdoutとstderrを独立して制限し、取得後の巨大Bufferや結合済みBob入力を作ってから切り詰める経路を置き換える。通常の文書抽出、変更ファイルmetadata、必須prompt、既存のプロセス終了待ちを保つ。

設計基点mainは `b3d18e2d9c3aa272f861a28c69e8e963572186c8`、treeは `d717938a095bfd2872e46af40ed1ed04f35df03c`。正式進捗は15 completion references・13/20（65%）、next=`PROC-T16-INPUT-PROCESS`、V2 activationは全てinactive。本書やlocal実装では進捗を進めない。

正本は `2026-08-23-feature-selection-and-sequential-main-integration-design.md` §7.3/§10.1とimmutable selection ledger/source universe、受入済みT13/T14/T15である。T16はordinal14、PROCESSING-CONTROL境界の必須sliceで、依存はT13/T15。出典範囲は `7fc7a371e6506290d8626d06e9b12c2a67888b47...49f39e1a6ec35e5db98e9ef698d4ce43369c9760`。選択された **29 source items / 28 paths / 27 distinct blobs** は全て後者のowner-stage snapshotで照合した。rawコピーは設計証拠であり、適用・実行していない。

## 2. 方式と範囲

### 2.1 採る方式

一つのT13 ledgerを所有するprocessing operationから、T15のdocument operationを一度だけ作る方式を採用案とする。process launcherとprompt/package生成は現行extensionに残す。既存のBuffer/ZIP owner、workbook予約、profile検証を再利用し、archiveの`budgetLedger`引数をそのまま各所へ公開する移植はしない。

別のledgerをdiff/packageごとに作る方式ではtotal operation上限が分断される。T15台帳のsnapshotから別台帳を作り直す方式では予約・確定・admission identityが失われる。新しいdeadline/process controllerへ全面置換する方式はT17の責務を先取りする。このため、既承認の「同じcontextをT16で再利用」に沿う上記方式を基準とする。APIの細部と下記のreviewInput安定読取り・構造化stream識別・書込み前artifact予約は、現行との差を解決するための設計者判断であり、個別に既承認だったものとは扱わない。

### 2.2 必須の結果

- CCR `preprocessReview`はreviewInput読取り前にprofileとoperationを作り、文書件数確定後も同じledgerを使う。diff、原本文書、抜粋、Bob入力はそのoperation内で合算する。
- B/Cのrunnerは明示`maxStdoutBytes`と固定256 KiBのstderr枠を使う。両streamの正確な境界・超過時の保持量・既存の終了待ちを検証する。
- Gitは完全な変更metadataと切詰めた本文を両立し、Bazaarは不完全な変更一覧を成功扱いしない。changed_filesは解析対象`maxFiles`で間引く前の全件数を数える。
- 抜粋とBob入力はUTF-8の実bytesを数える。Bobの必須情報は切り詰めず、必須部分だけで上限を越えれば失敗する。
- CCRの既存管理生成物を全て数え、失敗時はこの試行の未確定予約と管理生成物を片付ける。ユーザーが配置した非管理ファイルは容量計上・削除の対象外とする。

### 2.3 非目標と保持する境界

T17のabsolute monotonic deadline、authenticated first cause、新process-tree controller、全経路のphysical containmentは追加しない。ただし既存のcancel/timeout/overflow時のprocess-tree終了待ち、preflight/listener間取消検査は維持する。T18のdeterministic processing report、complete-only handoff、旧package復元・atomic replacementは実装しない。T16の失敗cleanupをT18のrollback証明とは呼ばない。

Bazaarの変更対象は選別されたrunner、Bazaar実行caller、PDF出力callerとその試験である。BazaarのBob/artifact/handoff全体へCCRのpackage会計を広げない。Workflow/registry/Discovery、V2 activation、parser/dependencyの更新、UI設定追加は対象外とする。

T14/T15の単一OOXML owner、元Buffer identity、全entry検査、expanded bytesの構造制限、XLSXのpre-parser一括sheet/row予約、lazy parser load、source post-check、原本一回計上を保つ。既存GUIの一回log・pathを含まない表示・queue継続、selector/locator/文書ID、通常parser失敗のwarning経路を維持する。resource-control/cancel/cleanup failureはwarning成功へ変換しない。

## 3. 現行との差と接続先

| 現行 | T16での変更 |
| --- | --- |
| `createDocumentOperation`内部でledgerを新設し、CCR pipelineが文書参照数確定hook内で作成する | 同じprivate document ownerをprocessing operationから作る。既存standalone APIもそのownerを使用する |
| B/C runnerの`maxBufferBytes`をstdout/stderrで共有する | 全callerを明示stdout optionへ移し、stderrを独立256 KiBにする |
| Git本文をVCS headroom枠で取得後に切り詰める | raw diff用cap+1までのbounded captureと行境界clip。stderrやtimeoutはclip成功へ変換しない |
| fixtureは通常read、reviewInputはsize中心の限定read | handle保持・前後identity/完全read検査を行うstable bounded readへ接続する |
| CCR文書抜粋は`maxBobInputBytes`だけをローカルcounterで制限する | 表示用byte counterを残し、確定量は同じT13台帳で会計する |
| Bob入力を全て結合してから一括clipする | templateをtoken化し、必須部分を確保して任意Markdownのみclipする |
| packageは順次writeし、生成物合計の台帳制限がない | 管理writerの各実bytesをwrite前に予約し、全成功時にBob予約と一括確定する |

追加のcurrent-main prerequisitesは、`packages/processing-budget-runtime/src/documentBudget.ts`とroot exports/型試験、B/Cの`sharedProcessingBudgetRuntime.ts`、CCR `reviewInputValidator.ts`、共通copy/build/packaging/host proofと新admission/CI契約である。`core/processingBudgetPipeline.ts`と`core/reviewPackageBudgets.ts`は現行に存在しないため、新規helperとして必要な意味だけを移植する。古いdocument extractorのpath parser入力、別ledger、古いcancel型は復活させない。

## 4. 一つのoperationと確定点

### 4.1 APIと所有権

Pに `createProcessingOperation({ profile, signal? })` を加える。戻り値はread-only profile/signal、`snapshot()`、T13と同じtyped `reserve(...)`、`documents(selectedDocumentCount)`を持つclosure所有のhandleとする。ledger自体、skipCharge、skipValidation、admission生成関数は公開しない。`documents`はcount=0を含め一度だけ呼べ、document_countをcommitして既存DocumentOperationを返す。無効count・二度目の呼出し・pre-cancelは文書I/O前に拒否する。

`createDocumentOperation({ selectedDocumentCount, profile, signal? })`は既存の閉じた引数と戻り値の互換を保持し、同じprivate factoryへ委譲する。P内でdocument ownerを複製せず、既存`documentBudget.ts`に小さなoperation owner/factoryを配置して14 flat modulesを保つ。Pはprocessを起動せず、prompt/VS Code/拡張固有型にも依存しない。

CCR pipelineはこのownerを一つだけ生成する。reviewInputのschema/reference数検査後、artifact path検査前の既存hookで`operation.documents(countDocumentSelections(...))`を呼ぶ。extractorへはdocument handleと同じprocessing handleを渡す。count/profile/signalの整合と、両handleが同じownerから作られたことをprivate identityで検証し、同値snapshotやplain objectで代用させない。直接extractDocuments/collectGitDiff/buildReviewPackageを呼ぶAPIは、owner省略時に同じprofile factoryで独立した一操作を作る。指定済みownerのある処理では新ledgerを作らない。

旧extractorの`operation?: DocumentOperation`によるT15内部callerは全て移行し、standalone `createDocumentOperation`自体の互換は残す。processing ownerを必要とする新しい内部APIの引数整理はbuilderに委ねるが、渡されたdocument handleだけを別ledgerへ接続したことにしない。

### 4.2 何を数えるか

| 論理入力／出力 | debitと確定点 |
| --- | --- |
| reviewInput YAML/JSONの原本 | 既存public maxDocumentBytesで限定し、raw bytesを`total_operation_input_bytes`へ直接一度reserve。stable read・close成功後、parse前にcommit。文書件数/total_documentには含めない |
| 選択文書 | T15どおり`document_count`と各選択の`single_document_bytes → total_document_bytes → total_operation_input_bytes`。fingerprint admission後の再読取りでは追加debitしない |
| 変更一覧／diff本文 | 完全一覧件数を`changed_files`、採用したUTF-8本文（切詰めsuffix込み）を`raw_diff_bytes → total_operation_input_bytes`。両reserve成功後にまとめてcommit |
| document-excerpts Markdown | header/metadata/区切り/切詰めsuffixを含む最終採用bytesを`document_excerpt_bytes → total_operation_input_bytes`。return前にreserve/commit |
| Bob入力 | templateのliteralと全placeholderを含む最終採用bytesを`bob_input_bytes → total_operation_input_bytes`。生成物成功までpendingにし、失敗ならrelease |
| 管理生成物 | 実際にwriteする全ファイルの実bytesを`managed_artifact_bytes`。Bobファイルもこの出力として含める。operation inputの祖先は持たない |

reviewInputの直接root debitは他のleaf予約の祖先をもう一度reserveするものではない。原本・抜粋・Bobは異なる論理表現として各一度数える。total operationの入力式は **reviewInput原本 + 選択文書原本 + 採用diff本文 + 採用抜粋 + 採用Bob入力**。workbook sheet/rowとchanged_filesは件数予算、artifactは独立出力予算である。

stdout/stderrは独立した物理capture上限であり、13カテゴリに追加しない。stderr、Git revision/name-status/numstat、repository-index列挙等をraw_diffとして重複debitしない。diff fixtureはdiffのtransportであるため、JSON container自体はbounded readだけを行い、採用diffを上記leafで一回数える。既存upstream rule-pack/indexやsource code解析の全物理read・全heap使用量をこの13カテゴリで網羅したとは扱わない。

### 4.3 原子性・取消

leaf予約はT13が祖先まで原子的に行う。diffの2予約とpackageのBob/artifact予約群は、全reserve成功前に部分commitしない。失敗は逆順releaseし、どの経路もreserved=0へ収束させる。既に採用した原本・reviewInput・diff・抜粋のcommitは後続失敗で巻き戻さない。全操作のtransactionを装わない。

各content read前後、await後、結果採用前、write前と最終commit前に同じsignalを検査する。Error reasonのidentity、非Error reasonのtyped cancellation、falseyな最初のthrowをT15どおり保持する。並列siblingを放置せず、T16の新接続は既存順次pipelineを維持する。同期parserの途中停止や新absolute deadlineはT17へ残す。

## 5. Profileと公開上限

T13の13カテゴリ、default/absolute maxima、9 error codesは変更しない。新規カテゴリ・新ユーザー設定を作らない。overrideはgetter/coercionを実行しないclosed own-dataとして先に検証し、未知key、非safe整数、負値、絶対max超過をclampで隠さず拒否する。

| CCR設定／カテゴリ | mapping |
| --- | --- |
| single_document / total_document | public maxDocumentBytes default5/max50 MiBを維持。暗黙total_document=max(public leaf,32 MiB)。明示parentが低い場合はeffective leafをparent以下へ制限する |
| sheet/row | T15どおりpublic20/100 sheets・500/5,000 rows、total_sheets100/1,000・total_rows25,000/250,000。明示aggregate以下へlocalを制限する |
| changed_files | T13 default5,000/max20,000。reviewの解析対象maxFilesとは独立 |
| raw_diff | min(public maxRawDiffBytes default1/max10 MiB, 明示leaf, operation parent) |
| document_excerpt | min(public maxBobInputBytes default2/max8 MiB, 明示leaf, operation parent)。各chunkは既存maxExcerptBytesPerDocument default64KiB/max1MiBも守る |
| bob_input | min(public maxBobInputBytes default2/max8 MiB, 明示leaf, operation parent) |
| managed_artifact | T13 default16/max64 MiB。入力parentと独立 |
| total_operation_input | 暗黙max(64 MiB, 要求total_document, raw_diff, excerpt, Bob)。明示値があるときはその値を上限とし、total_documentを含む子カテゴリをそれ以下へ制限する |

共通のCCR profile factoryへ統合し、pipeline/直接diff/直接extractor/直接packageで値の解釈を分岐させない。明示aggregateによる拒否を通常のpublic per-source oversize warningへ落とさず、T15同様constrained categoryを保つ。remaining値を別の手書き累積counterの正本にしない。

カテゴリ上限0はT13どおり有効。reviewInputの非空原本はoperation=0ならallocation前にrootで失敗する。raw_diff=0ではVCS captureは検出用1byte、採用本文は空とし、非空入力には切詰めwarningを残す。excerpt=0では採用抜粋0、Bob=0では必須部分が非空なら失敗する。runnerのstdout optionはカテゴリprofileとは別のAPIで、archive契約どおり正の値を必要とする。public limitsを内部overrideの0で書き換えない。

Bazaarの既存20 sources / 25 MiB per-source / 100 MiB batch / 32 KiB chunks、PDF出力上限とcallerのより低い設定を維持する。T16でarchiveの32 MiB親上限へ変更しない。

## 6. 外部プロセスとdiff取得

### 6.1 二つのstream

B/C runnerの`maxBufferBytes`を`maxStdoutBytes`へ置換し、全production caller/test fixtureを同時移行する。alias/default fallbackは残さない。stderrはexportした`EXTERNAL_PROCESS_STDERR_MAX_BYTES = 256 * 1024`で固定する。stdout用callerはBazaar client、PDF extractor/document forwarding、CCR Git/Bazaar collector、repositorySymbolIndexProducerを列挙して契約試験で検証する。

各streamのbyte counterは独立で、chunkの保持前に残量を確認する。capを越えるchunkはcap以内のprefixだけを所有Bufferとして保持し、巨大な元chunkのbacking storeをsubarrayだけで保持し続けない。合計保持bytesはstdout cap + 256 KiB以下とし、超過で`bufferExceeded`にする。stdout/stderrの識別は構造化したreadonly fieldで保持し、message部分一致からclip許可を判断しない。従来error kind/command/args/cwd/bounded buffers/allowedExitCodesは維持する。

超過時は既存termination helperを呼び、そのsettlement後だけrejectする。`shell:false`、Windows `windowsHide:true`、POSIX process group、Windows taskkill tree待ち、timeout正規化1,000..600,000msと取消race対策を維持する。終了保証の新しい一般理論やT17 controllerの置換は行わず、既存の成功・fallback・上限待ちを後退させない。PDFは既存のsanitized blocked/requires_ocr、ページ空白、chunk locator、取消分類を保持する。

### 6.2 GitとBazaarの違い

Git revisionをSHAへ固定してから、完全なname-status/numstatとbounded unified diffを得る。metadataコマンドは現行VCS headroom枠を明示stdout capとして使い、超過はfatal。unified diffはraw_diff上限+1までcaptureして超過を検出する。**stdout超過だけ**を、終了待ち後にbounded prefixへ変換できる。stderr超過、spawnFailure、nonZeroExit、timeout、cancelは成功へ変換しない。

採用本文はUTF-8 byte境界と完了行境界でprefixを切り、既存`[truncated: maxRawDiffBytes]`suffixを含めcap以下へ収める。完全一覧件数を失わない。変換後の文字列がbyte capを越えるencodingも最終UTF-8計測でclipする。cap途中の未完了UTF-8末尾を有効文字へ誤認して採用しない。stdout超過時の元の全文長は不明なので、observedに架空の全長を記録しない。

Bazaarは`--no-aliases`と既存exit0/1を保つ。変更一覧をdiff本文から作るため、本文が超過したらheader/metadata parse前に失敗する。部分本文から不完全な一覧を作らない。fixtureは完全なmetadataを持つためGit同様のfinalizerでchanged_filesと採用本文を会計する。

diff finalizerはchanged_filesとraw_diffの両予約を保留し、全成功でcommitする。親operation不足・changed_files超過はfatalであり、さらに黙って小さい本文へ切り詰めて成功させない。raw leafに対する明示clipとaggregate failureを区別する。

### 6.3 stable bounded file read

reviewInputとdiff fixtureはopen handleを保持し、bigint statでregular file・安全整数・size capを確認してからallocationする。全bytesを読み切り、短いreadをEOF成功にせず、前後dev/ino/size/mtimeNs/ctimeNs/modeの一致、named pathとのidentity、cancelを確認してcloseする。decode/JSONまたはYAML parseは検証後に行う。max超過をparse errorへ落とさない。

reviewInputの予約はallocation前にraw sizeでrootへ行う。読取り・identity・close失敗ではreleaseする。fixtureのcontainer capはmin(現行VCS headroom(raw_diff profile), total_operationのremaining)であり、最低1MiBのheadroomが低い明示parentを越える入口を作らない。既存`maxDocumentBytes`によるreviewInputエラーと500 artifact referencesのschema後・path前検査を保つ。T17のjunction/UNC等の包括的physical adapterを新設したと主張しない。

## 7. 抜粋とBob入力

抜粋は既存のper-chunk制限、document/evidence ID、header、separator、line/suffix表示を保つ。aggregate枠はmin(public maxBobInputBytes, profile.document_excerpt_bytes)。表示を組み立てるbyte counterはこの枠を超えないように使い、最終join結果のUTF-8実bytesと一致させて同じoperationへreserve/commitする。operation parent不足はclip warningで隠さずfatal。既にcommitした原本文書はそのまま残る。

Bob templateはliteralとplaceholder tokenへ分解する。literalと、明示された下記5 bulk placeholder以外の全値を必須とする。後から追加されたplaceholderもdefault必須であり、分類漏れでmetadataを切り詰めない。

`document_excerpts`、`diff_context`、`changed_symbols_summary`、`traceability_map`、`evidence_index_summary`だけを任意bulkとする。system/task/output_format、review summary、change summary、deterministic checksは全て残す。必須suffix bytesを先に計算し、残量に合わせて任意bulkをUTF-8・完了行境界でclipする。任意部分が入らなければ空にできるが、必須部分を削らない。

全量Bob stringを先に生成しない。元の理論bytesはtokenのbyte lengthを加算して求め、safe integer overflowを検査する。最終textの実bytesでbob_input予約を行う。必須だけでleaf超過なら`processing_budget_exceeded`、親不足ならT13の実constrained categoryを返す。truncation warningはmanifestとdeterministic-checksへ反映する。Bob中のdeterministic checksにも同じ最終warningを反映するため、必要ならwarning確定後にbounded assemblyをもう一度行い、最終一つだけを予約する。警告の自己参照を避け、初回判定の元bytes/limitを固定し、再組立てで必須部分が収まらなければ失敗する。

## 8. 管理生成物と失敗時の状態

管理集合は現行`MANAGED_PACKAGE_OUTPUTS`とその配下の通常ファイルで固定する。prompts/、code-slices/、tables/、input-normalized.json、changed-files.json、changed-symbols.json、document-index.json、evidence-index.json、traceability-map.json、context-budget-report.json、manifest.yaml、change-summary.md、diff-context.md、document-excerpts.md、traceability-map.md、deterministic-checks.md、bob-input.md。存在しないoptional出力は0、directory metadataは数えない。ユーザー非管理fileやupstream artifact ledger/indexの別producer出力をここへ含めない。

すべての管理writeは一つのbudgeted writerを経由する。serialized UTF-8 bytes/Buffer lengthをwrite前にreserveし、予約をpackage完了まで保留する。JSONのindent/newline、templateの改行、code slice/table/promptを含む実write bytesで会計する。既存直接fs writerが一つでも枠外へ残らないよう、archiveのpost-write総和検査に加えてwrite前制限を行う。最後に管理集合の実size総和と予約総和を照合し、Bobファイル実bytesとも照合してから全commitする。

既存の管理集合cleanupと非管理file保持を保つ。mandatory Bob failure、artifact overflow、write/検査/cancel failureでは未commit予約を全releaseし、この試行の管理出力をcleanupし、成功resultや新しいfresh package observationを返さない。cleanup失敗を黙殺せず失敗の証拠に残す。先行stageのcommitやupstream ledger更新を全rollbackしたとは扱わない。

この手順は旧有効packageを保存してから置換するtransactionではない。既存cleanupが消す管理集合の復元、complete-only手渡し、reportとの一致、atomic promotion、symlink/junctionの一般的なoutput adapterはT17/T18で扱う。通常の下位write helperまで広範囲に置き換えず、CCR package writerの所有範囲を限定する。

## 9. 配布・証拠・受入

Pは14 flat modules、46 tarball paths（42 compiled＋4 assets）、rootと`./validated-ooxml` exports、production deps0/private0.1.0を保つ。新operation APIのjs/d.ts/型consumerを同じ14-module payloadで検証する。各B/C VSIXは同じcanonical buildの14 JS＋manifestをコピーし、manifest/alias/未知payloadの拒否を保つ。28 runtime bindings＋8 parser bindingsをactual package/hostで照合する。

parser pinsはB read-excel-file9.3.1/C9.2.0、Mammoth1.12.0/Cheerio1.2.0/fflate0.8.3、TS5.9.3を保持する。現行source-fixed parser583 filesの拘束を弱めない。capsはWorkflow1,200,000 / B12,000,000 / C11,000,000bytes。Workflowの圧縮は基点の実scriptを正本として保持する（113宣言・111 present・2 absentを前段で確認済み。古い設計の79という記述へ戻さない）。容量不足なら実candidateの追加案を検証してから別の具体的承認を得る。

29 source itemsの対応と全675 partition・未割当0をcoverageで固定する。immutable ledger/universe/archiveと旧15 completion refs、Owner/Discovery/T13–T15のraw/blob拘束を変更しない。新literal source admissionで実差分のbefore/after blob・working/index・unknown payloadを検証し、追加prerequisiteの理由とliteral pathを記録する。新coverage/completionのLFルールもsource側で準備し、別metadata側の許容差分を先に契約化する。

sourceと別metadataの二段受入を維持する。各段階でfresh reviewし、Critical/Importantを修正して検証し、Minorも明示記録する。具体的なimmutable candidateを用意してから、そのcandidate固有のC承認を得る。通常push/PR、候補exact-headの実CI、条件成立時のみ通常merge、main exact-headの実CIと非force同期を行う。候補変更時に別headへ承認・CI成功を転用しない。旧CI免除を継承しない。

各candidate/mainで5 workflow・18契約行を確認する。PR時は18実成功、非PR dispatch/mainでPR専用metricsだけskipを許す場合は17実成功＋skip1と明記する。同一hashの実VSIXでUbuntu/Windows host proofを行い、skip/代用/元subjectの異なる証拠を新head実成功と呼ばない。実装計画で現在のworkflow/event条件を再照合する。

## 10. 検証設計

- Operation/profile：同一ownerのrootへreviewInput/raw/excerpt/Bobが合算されること、standalone互換、document初期化一回、別owner/偽handle/profile/signal不一致、closed own-data、absolute超過、明示低parent、カテゴリ0、既存50MiB文書とB20/25/100境界。全経路で未確定予約0。
- Runner：B/Cそれぞれstdout exact/+1、stderr256KiB exact/+1、両stream同時exact、chunk分割・一つの巨大chunk、bounded retained buffers、stdout識別、invalid optionのspawn前拒否。timeout/allowed exits/pre-cancel/race、POSIX child終了、Windows親先終了とtaskkill完了待ちを保持する。
- Diff：default/max changed_files exact/+1、rename/NUL/日本語、UTF-8途中・完了行・suffix、real Git overflowの完全metadata、stderr overflowが成功しないこと、Bazaar overflowのparse0、aggregate失敗時changed_files release、metadataコマンドoverflow。fixture/reviewInputはoversize parse0、短いread、同size置換・identity drift、cancel/close failure、上限0とexact/+1を確認する。
- Excerpt/Bob：複数文書に跨る実bytes、header/separator/suffix、default/max exact/+1、mandatory-only不足、新規placeholder default必須、重複/不存在の任意key、巨大任意bulkを全結合しないこと、最終warning一致、leaf対root不足を確認する。
- Artifact：管理集合全種類の実byte総和、JSON/newline、exact/+1、書込み前超過拒否、途中write/cancel/cleanup failure、Bobとartifact予約全release、非管理file保持、失敗時package observationなし。旧package復元を試験済みと扱わない。
- 回帰・配送：T13–T15のraw once/OOXML単一owner/workbook pre-parser/cancellationと通常warning/GUI/locator parityを保持する。affected B/C全tests、three-extension quality、root必須tests/4生成器、新旧admission、Gate R15 suite/5 effects0、実46-path tarballと3型consumer、2VSIXと両OS hostを確認する。既存Windows host17ケースを維持し、T16の共通台帳/runner/diff/Bob/artifactケースを追加する。

具体的fixture名、RED→GREENのタスク分割、hostケース名と証拠subject表は実装計画で固定する。設計段階で製品testsやhostを実行したとは扱わない。

## 11. Builder裁量・承認・作業保護

細かな型名/引数順、closure/private helper配置、stream Buffer copyの方法、template scanner、管理writerの小さな分割、fixture/証拠directory名はbuilder判断とする。同じledger、debitの意味と確定点、13カテゴリ/14module/46paths、必須情報保持、Git/Bazaar差、既存終了待ち、原本一回計上、source/metadata分離は変更しない。設計時点の未解消事項やチェックの代替は別のbuilder-check記録へ残す。

本書の承認は実装計画を作るための書面reviewであり、製品実装・依存導入・host起動・remote操作の承認は含まない。承認後にwriting-plansへ進み、計画承認後に主スレッドでlocal実装する。source/metadataのremote Cは具体的candidateごとに別途確認する。

primaryのbranch `codex/bob-auto-response-probe`/HEAD `90f926e0045405625f1f40d20a41346a94d1981a`、未追跡15項目とOwner57 raw SHA256 `1665c66acd04a535b08116e639f5119b98e03609d9bb4d5f8efacc9bba37b5a4`を保持する。保護された`.integration-xlsx-on-prereq/`、`docs/analysis/`、`docs/superpowers/plans/2026-09-28-premium-informed-three-extension-improvements.md`の内容を読まない。既存branches/worktrees/profiles/artifacts/evidenceをcleanupしない。

## 付録A. 29 source items

下表の全originは `49f39e1a6ec35e5db98e9ef698d4ce43369c9760` の `owner_stage_snapshot`。同じpath/blobの複数familyを重複排除せず29項目のまま対応する。B=`extensions/bob-bazaar-review`、C=`extensions/bob-code-consistency-review`。raw/blob/現行比較は設計証拠の `source-inventory.json` に保存する。

| sourceItemId | family | path | owner blob |
| --- | --- | --- | --- |
| `source-05f184a5094441d208a847c2` | changed-file-and-raw-diff-operation-budget | `C/src/core/gitDiffCollector.ts` | `f792fb13540c44a141da9e4d72093dbfd8f81f2a` |
| `source-0bff6322ffa2774f6f27a3ee` | bazaar-diff-overflow | `C/test/bazaarDiffOverflow.test.js` | `637c609b93caf7b4b75706fa4508040356016342` |
| `source-2447bc3569e6ac90c8ecf0b0` | review-package-budgets | `C/test/reviewPackageBudgets.test.js` | `227256733f31c9f2352dd9fa12bf5b5966afc19c` |
| `source-31502d818e0b6147aa6f3275` | pdf-independent-stdout-budget | `B/src/ruleAuthoring/extraction/pdfExtractor.ts` | `ab4ef68738ce43fd50397a41ab40c0a5cc436e1b` |
| `source-44d30d8b4cc747498d0a7117` | t16-input-process-pipeline | `C/src/core/pipeline.ts` | `4622f465b6807a00124482e3bad8cd49788b2e2e` |
| `source-4c4c58c4f1546e0176ba06a2` | windows-explicit-stdout-budget-fixture-contract | `B/test/windowsProcessTreeTermination.test.js` | `df8955f53728dcc23912c80ee1b565477602fc4d` |
| `source-50af63c7c4cda00775f5a5a2` | processing-budget-pipeline | `C/src/core/processingBudgetPipeline.ts` | `7619c5dc9864a41c5043349fc7d587d4c07ec2b3` |
| `source-6109286cf50be04f67f2b427` | review-package-budgets | `C/src/core/reviewPackageBudgets.ts` | `d43d195871ad38c92fbeb505c2eb00a74cd24f5a` |
| `source-61e92951d83f50818aab7248` | stable-bounded-diff-fixture-read | `C/test/diffFixtureBudget.test.js` | `3f97c87f8f77d1a5c20eedfdc7c4a4baab139f66` |
| `source-68752b504e6e6d0a501987f7` | pdf-explicit-stdout-budget-forwarding | `B/src/ruleAuthoring/extraction/documentExtractor.ts` | `3cefab3d222c178520b5250df392af2fb8d621bd` |
| `source-7b6a8ca9b6683dfebe539566` | external-process-independent-output-budgets | `B/src/bazaar/externalProcessRunner.ts` | `1f48dab7e063a3b32528441fb713ed91ef76aa59` |
| `source-7c4ba109c3323751bd6c0460` | review-package-budget-integration | `C/test/reviewPackageBudgetIntegration.test.js` | `5389d8e852d0695684e26b1ead436a8337032dec` |
| `source-8f20d598ea0db48f404c389e` | bazaar-explicit-stdout-budget-callers | `B/src/bazaar/bazaar.ts` | `c1a99c82e58dc367008ac7cfeb6ae8f943a506bc` |
| `source-9b5a3df1781361b2e783d0d0` | pipeline-shared-input-ledger-contract | `C/test/processingBudgetPipelineContract.test.js` | `f9f4197f466b87b778321c6f26db3913de769cef` |
| `source-a67f1076c6e1454f31fa386e` | t16-input-process-external-process-runner | `B/test/externalProcessRunner.test.js` | `34a75a2ad0947cec2ef4aec18cbba61bf5edb16b` |
| `source-a7a47b2c4935ee934a70ff9f` | external-process-independent-output-budgets | `C/src/core/externalProcessRunner.ts` | `1f48dab7e063a3b32528441fb713ed91ef76aa59` |
| `source-a988f317012704304ff20d34` | external-process-option-contract | `C/test/externalProcessOptionContract.test.js` | `74e233b9ab8a474cd7631a52954802db83e0ffaf` |
| `source-aa14b45b9a62c15e216b1e7a` | stable-bounded-diff-fixture-read | `C/src/core/gitDiffCollector.ts` | `f792fb13540c44a141da9e4d72093dbfd8f81f2a` |
| `source-ad6ac90a37b17ebc84947235` | pdf-explicit-stdout-process-contract | `B/test/rulePdfExtraction.test.js` | `189aaeb8ff72ee0bfac74de00f7690bff54c5a6c` |
| `source-b3f1242a2d63fad26d27bd6d` | document-excerpt-budget | `C/test/documentExcerptBudget.test.js` | `634dca7784f9aeafa851368b5a0beeefbe651ceb` |
| `source-c07621bcfe509d992b18e1c9` | processing-budget-pipeline-profile | `C/test/processingBudgetPipelineProfile.test.js` | `0e55312b806d51752a54532f1dde0746d68bd208` |
| `source-c3731cfb10994c67a2629d82` | external-process-option-contract | `B/test/externalProcessOptionContract.test.js` | `3a5e35cedc350b5f5fd81752991d651c413e2b82` |
| `source-c6293fce78faaf8b47f702b4` | repository-index-git-explicit-stdout-budget | `C/src/evidenceScope/repositorySymbolIndexProducer.ts` | `2be3011c74fe05af2f64aa685d8a461e33994043` |
| `source-c7bb6706403b362f18e01e4d` | operation-excerpt-byte-accounting | `C/src/analyzers/documentExtractor.ts` | `d26869773107abfc17313310444177a7d31cd917` |
| `source-c96bb205f0c1fa19b450db1a` | windows-explicit-stdout-budget-fixture-contract | `C/test/windowsProcessTreeTermination.test.js` | `7b6c5b3b1454222897989d740fa94774842999d2` |
| `source-dda090c32e79effef12b5905` | diff-processing-budget | `C/test/diffProcessingBudget.test.js` | `7c9e08f5e19a8719ecc8bed29a7db2cac09b0b21` |
| `source-e08fa31f4527651e1c53a428` | t16-input-process-external-process-runner | `C/test/externalProcessRunner.test.js` | `3a8310fba2ec475405fa498abc0f3e800fd0419c` |
| `source-f0138af267eed6886093ed36` | review-package-builder | `C/src/core/reviewPackageBuilder.ts` | `e0ded581108a5c61b9dbf348754e3b55b0b0d043` |
| `source-fd93b64d67682284ad2a0ac1` | t16-input-process-size-limits | `C/test/sizeLimits.test.js` | `8407addffcd23631ab8eb574bdd9102da723a2ec` |
