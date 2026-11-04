# PROC-T17-PATH 詳細設計

日付: 2026-11-04 JST。状態: 書面レビュー待ち。独立builder checkの重要な未決事項は0件。今回の承認対象は詳細設計であり、製品実装・依存取得・remote操作の承認を含まない。

## 1. 目的・基点・範囲

ワークスペース、文書、artifact、出力先の判定を一つのnative TypeScript pathPolicyへ集約し、3拡張の判定差をなくす。文字列上の包含と実体の包含を区別し、日本語・空白・Windows drive/UNC・複数rootを扱う。存在しない出力先は検証した既存directoryからだけ構成する。

基点M0=`cf96788dbdd6836b449b7a31ecd3bae4ee4302a4`、tree=`4955685da8d99efbb7424efcf278be3262d34dac`。T17-DEADLINE source PR206とmetadata PR207は受入済み。正式進捗は17 completion refs／15 of 20 VERIFIED（75%）、next=`PROC-T17-PATH`。本sliceはordinal16、boundary=`PROCESSING-CONTROL`、前提はT17-DEADLINE VERIFIED。本件だけで後続T18や最終validationを完了にしない。

選定台帳の22項目／22origin rows／22paths／21unique blobsを扱う。symbol8・contract8・test family6。owner commit=`7ea786afd5715d841526000a402c831d6c2a203c`、全origin blob OIDの照合不一致0。付録Aは全22項目を列挙する。全675 source assignmentsと未割当0、旧17 completionのbytes・blob・subjectを保持する。

P=`packages/processing-budget-runtime`、B=`extensions/bob-bazaar-review`、C=`extensions/bob-code-consistency-review`、W=`extensions/workflow-register`。Pの旧`runtime/*.js`やCの機械的`*Base`分割を復活させず、現行native TS ownerと既存compositionへ意味を適応する。

## 2. 比較した方式と利用者の選択

利用者は`call_06f7fd2afd8e414d8c6a5ef2dd47061b`で「共通pathPolicy方式で進める（推奨）」を選択した。

| 方式 | 利点 | 代償・判断 |
| --- | --- | --- |
| 共通Pの単独pathPolicy＋Wへの限定配送 | 一つの意味・一つのcanonical build。既存B/C配送に接続し、Wはpathだけを持つ | full/path-only profileの明示検証が必要。今回の選択 |
| 共通の構文検査とOS filesystem adapterを別層にする | 模擬OS差を注入しやすい | インターフェースと同値検証が増える。今回は採用しない |
| 拡張ごとのpath検査を個別修正 | 各修正が小さい | 共通physical containment authorityという選定条件を満たさず除外 |

`src/pathPolicy.ts`一つが構文・実体検査を所有する。依存は`node:fs`と`node:path`だけで、ledger、deadline、document、index、product、動的import、子process、network APIに依存しない。UNCアクセス自体はOS filesystem経由である。FS操作をmodule import時に行わず、呼出し時に限る。

## 3. 不変条件・対象外

- 13カテゴリ・9 budget error codes・全default/max・一操作一台帳・原本一回計上・workbook事前予約・期限/取消cause認証・owner disposal・現行Error互換を保持する。pathは新予算カテゴリにしない。
- parser pins、583固定ファイル、拡張version、P private0.1.0・production dependencies0を保持する。P既存root/validated-ooxml exportsは維持する。
- Wの上限1,200,000 bytes、固定compaction113 declared／111 present／2 absentを保持する。新pathPolicyのcanonical bytesをAST圧縮しない。上限や固定圧縮対象の変更が必要なら、実測した案を用意して別確認する。
- raw report path表示、T18 report/complete-only handoff/atomic promotion/既存package復元、V2 activation、新UI・設定key、executable allowlist・trusted bzr設定規則は追加しない。ワークスペース内pathとグローバル実行ファイル設定を混同しない。
- OS sandbox、任意のreparse tag列挙、directory-handle起点のatomic traversal、競合のない出力作成、悪意ある並行renameからの完全隔離を保証しない。検査済み文字列/recordは観測結果であり、後のI/Oを永続的に認可するcapabilityではない。

## 4. 公開APIと入力契約

Pはrootと新subpath`./path-policy`から次を公開する。Wのfacadeはpath APIだけを公開する。

```ts
type PortablePathPlatform = string // win32だけWindows、その他はPOSIX。構文比較専用
type PhysicalPathExpectedType = 'file' | 'directory'
interface CanonicalPhysicalPath {
  readonly path: string
  readonly existing_ancestor: string
  readonly exists: boolean
}
interface PhysicalContainedPath {
  readonly root_path: string
  readonly path: string
  readonly relative_path: string
  readonly exists: boolean
}
interface CanonicalizePhysicalPathOptions {
  readonly label?: string
  readonly mustExist?: boolean
  readonly rejectLinks?: boolean
  readonly expectedType?: PhysicalPathExpectedType
}
interface ResolvePhysicalContainedPathInput {
  readonly rootPath: string
  readonly candidatePath: string
  readonly allowAbsolute?: boolean
  readonly mustExist?: boolean
  readonly expectedType?: PhysicalPathExpectedType
}
const MAX_PUBLIC_PATH_UTF8_BYTES = 4096
normalizeWorkspaceRelativePath(value: string, label?: string): string
isPortablePathContained(root: string, target: string, platform?: PortablePathPlatform): boolean
canonicalizePhysicalPathSync(value: string, options?: CanonicalizePhysicalPathOptions): CanonicalPhysicalPath
resolvePhysicalContainedPathSync(input: ResolvePhysicalContainedPathInput): PhysicalContainedPath
resolvePhysicalContainedPath(input: ResolvePhysicalContainedPathInput): Promise<PhysicalContainedPath>
selectDeepestPhysicalRoot(roots: readonly string[], filePath: string): Promise<string | undefined>
```

上記は契約を示す擬似宣言であり、そのままcompileするコードではない。options/inputはclosed own-data、booleanはbooleanだけ、expectedTypeは2値だけを受ける。accessor・symbol・継承されたoption・unknown keyを拒否し、入力を文字列化しない。戻り値はfrozen plain data。labelも安全なstringとして検証する。native Errorをそのまま外へserializeしない。

SharedPathPolicyErrorはErrorに次のreadonly codeを加えたexport型であり、PathPolicyErrorが実装する。PathPolicyErrorのcodeは`path_policy_invalid/device/drive_relative/absolute/escape/symlink/unavailable/not_directory/not_file`の9個（各々`path_policy_` prefix）で固定する。これは既存9 budget codesとは別体系。公開code/nameから認可やcancel causeを推測しない。generic path入力失敗はPathPolicyError、predicateは不正入力をfalse、selectorは不正候補rootを除外し、不正filePathならundefinedを返す。I/O consumerでの既存エラー変換は§8による。

既定値はarchiveと同じ: label=`path`、mustExist=true、rejectLinks=true、allowAbsolute=true、expectedTypeなし。resolverのrootは常に存在するdirectory・rejectLinks=true。candidateも常にrejectLinks=trueとし、callerが解除できない。`rejectLinks:false`はselectorのactive-file物理同定だけに用い、管理対象read/write/root選定の許可には使わない。async resolver/selectorは同一policyをPromiseで公開するが、内部sync FSの途中preemptionは保証しない。

## 5. 正規化前の構文検査

各公共path文字列を`path.resolve/join/normalize`より先に検査する。非空、4096 UTF-8 bytes以下、NFCそのもの、C0/C1 controls・NUL・不正surrogate・外側空白なし。segmentは空・`.`・`..`・端の空白・末尾`.`・Windows予約文字`<>:"|?*`・ADS・reserved device名を拒否する。CON/PRN/AUX/NUL、COM/LPTの1–9と上付き¹²³、拡張子付き同名も含む。日本語とsegment内の通常空白は受ける。黙ってtrim/NFC変換して別ファイル名を作らない。

relativeは`\`も区切りとして検査し、返り値は`/`。空segmentは重複/末尾separatorを含め拒否する。ただしPOSIX `/`、drive `C:\`、UNC share rootの構文上必要なroot separatorは許す。完全なhost絶対pathを許す境界とrelative専用境界をAPIで区別する。`C:relative`、`\\?\`/`\\.\`等device syntax、root-relative Windows path、foreign-platform absolute syntaxはphysical resolverで拒否する。WindowsでPOSIX絶対pathをcurrent driveへ補完せず、POSIXでWindows絶対pathを普通のfilenameへ読み替えない。

UNCはserver/shareの非空・segment妥当性をparsed rootの外で先に検査する。`//server/share`はUNCとして扱い、POSIX `/`の重複に読み替えない。share rootにdrive用colon例外を広げない。Windows drive letterのcolonだけをその位置で許す。case-insensitive比較はWindowsルールの文字列比較であり、あらゆるfilesystem/Unicode aliasの同一性を証明するものではない。

portable containmentはFSへ触れず、rootとtargetのraw構文を検査し、同じpath kindとvolume/shareの下でboundary-awareに比較する。Windows drive/UNCが含まれる場合はhostにかかわらずwin32規則を用いる。POSIXはcase-sensitive。`/root2`を`/root`配下とせず、`..name`という正常segmentは受ける。root自身も包含とする。`path.isAbsolute`は包含証明として使わない。[Node pathのOS差とabsolute判定](https://nodejs.org/download/release/v22.23.0/docs/api/path.html#pathisabsolutepath)。

## 6. 実体pathと不存在target

処理順はraw構文→host絶対path→lexical containment→root/各既存componentのlstatとrealpath→physical containment→expectedType。rootは既存directoryに限り、symlink/junctionおよびrealpathで検出したaliasを拒否する。filesystem/UNC parsed root自体も読取り失敗を無視せず検査する。caseのみのWindows差は許す。physical結果の各prefixを比較し、単なる文字列prefixで認めない。

mustExist=falseでも許すのは**ENOENTで確認した不存在**だけ。EACCES/EPERM/EIO/ELOOP/ENOTDIR等を不存在へ変換しない。最寄り既存ancestorはdirectoryでなければ失敗する。不在suffix全componentにも同じ構文検査を適用し、ancestorがroot内であることを確認して組み立てる。複数の不存在componentは許す。exists=falseではexpectedTypeは将来作るkindの意図であり、存在しないfile/directoryの型を確認済みとは書かない。後のmkdir/open/writeはその時点で同じpolicyと実際の型を再確認する。

rootと同じtargetはrelative_path=`.`。archiveが持つこの表現を新規入力の`.`許可に使わない。結果`path/root_path/existing_ancestor`はhost absolute、relative_pathは`/`区切り。root外・別volume/share・link・型不一致・確認不能は成功結果を返さない。

**設計者による明示的な適応:** archiveの広いcatchによるabsence扱い、file ancestor、不検査UNC server/share、helperの先行path.resolveによるraw syntax消失は維持しない。§5/6の厳しい入口へ置換し、それぞれRED→GREENを追加する。これは既存契約の機械的コピーとは区別してsource coverageに記録する。

`lstat`/realpath/O_NOFOLLOWの観測と再検査を組み合わせても、間のrenameやnetwork filesystemの挙動を完全には排除できない。Nodeもaccess後openの競合を指摘している。全reparse tagのOS固有検査や全race解消を主張しない。[Node FS・open flags・競合の説明](https://nodejs.org/download/release/v22.23.0/docs/api/fs.html#fspromisesaccesspath-mode)、[Windows junction](https://nodejs.org/download/release/v22.23.0/docs/api/fs.html#fspromisessymlinktarget-path-type)。

## 7. 3拡張のroot discovery・選択

B/C/WのworkspaceRootsは共通policyで既存physical directoryを確認し、markerも存在する非link directoryだけを認める。root/markerが不正または確認不能なら候補から外す。安全なrootの一段下だけを探索し、link/junction childを辿らない。glob/深いrecursive探索を追加しない。direct marker候補が一つでもあればchild候補より優先する現行規則、安定sort、read failure→[]を保つ。

候補の重複はphysical identityで除き、Windowsはcase差を同一とする。明示rootを含めraw検査より前にpath.resolveしない。CのexplicitRootはmarkerなしでも安全な既存directoryなら採用できる。BのexplicitRootは要求marker（.bob/.bzr）を必要とする。markerなしfolder fallbackもphysical検査後に限る。既存QuickPick/warningの意味は保つ。

active fileはroot認可とは異なりaliasを辿って実体同定する。不在なら正常な最寄り既存directoryとsuffixを用いる。候補rootはlinkなしの既存directoryだけ。実体で包含する候補からcomponent depth降順、physical text順のtie breakで選び、元のroot文字列を返す。root Aのalias経由で開いたroot BのfileはBへ属する。この選択結果だけでfile readを許可せず、read時にはrejectLinks=trueの管理path検査を別に行う。

WのworkspaceRootFromFileはraw検査→最後の完全一致marker component→候補rootとmarkerのphysical directory検査→file containment（missing可）で返す。文字列に`.bob`を含むだけのcomponentや不正rootを認めない。relative表示は安全な観測pathからだけ作り、新しいraw-path report表示を追加しない。

## 8. 文書read・CCR artifact/outputへの接続

Pの`boundedDocumentRequest.normalizeReadInput`はraw root/file構文を消す先行path.resolveをやめる。physical resolverを`boundedDocumentFile`のsourcePath/verifyで再利用し、root/fileの初回・open後・consume後・admitted reread時の検証を保つ。opened/named statのtype/dev/ino/nlink/size/mtimeNs/ctimeNsを照合し、通常document readはnlink=1のregular fileを必要とする。既存sha256・fingerprintの公開形は変更せず、ctime/nlinkは実行中の検査値として保持する。source changedとsource invalidの区別、close failure、予約release、原本一回計上、T17の取消優先・Error identityを保つ。pathPolicy失敗は既存BoundedDocumentErrorへ境界で変換し、取消をpath errorへ包み直さない。

CのfileSystemは`resolveWorkspacePathStrict`にcontained host absoluteとrelativeを許し、missingを許す場合も§6に従う。`normalizeChangedFilePathStrict`はrelative専用の共通構文検査、`isInsidePath`は検証済みportable lexical predicateへ委譲する。`resolveWorkspacePathForKind`は現行9 kind allowlist（.bob-review/.bob-trace/.bob/evidence-scope/.customと拡張子・reserved用途）を保持し、allowAbsolute=falseのphysical containmentを最後にも確認する。安全な名前の`..name`を誤ってroot外としない。

reviewInputBuilderはcandidate.pathをtrimしてから検査せず、全nonblank string artifactのraw値へ共通検査を適用する。strictPaths=falseでも構文/包含/linkは省略せず、不存在だけ許す。strictPaths=trueはfile存在・型も確認する。未知kind/schema失敗とpath失敗を既存error resultに集約し、dedupeする。stored artifact pathは検証済みrelative pathへ揃える。outputPathはbuild/readExisting/backup/mkdir/writeより前にworkspace内physical pathとして検査し、mkdir後と実際のbackup/write直前にも再確認する。backup名も同じ検査を受ける。拒否時は既存authoring behaviorへ進まない。

reviewInputValidatorの500 artifact上限→path検査という順序を保つ。review-inputとdiff fixtureのproduction callsitesは既にworkspaceRootを持つので、そのrootをstableReviewInputの内部optional rootPathへ渡す。root指定時はread前後にも同じphysical resolverを使い、親directory置換を検出した結果は採用しない。既存standalone stable readerはoptional rootを省略できる互換を保ち、一般的なworkspace包含を認証したとは扱わない。これらの現行接続filesは22出典に追加するcurrent-main prerequisitesとして列挙する。

VCS cwdは既存resolveWorkspacePathStrict経由で同じphysical ownerへ接続する。bzr/git executable文字列をworkspace配下に制限したり、既存trusted configのsourceを変更したりしない。一般の全writeTextFile/readTextFileを新APIへ一括置換せず、選定境界のcallsiteを閉じる。

## 9. build・package・配送の閉包

PはpathPolicy一つを増やし、16flat modules／48compiled files（js/d.ts/map各16）／52tarball paths（compiled48＋既存4assets）とする。旧rootとvalidated-ooxml、新path-policy subpathを実tarballから解決する。既存3型consumerを更新し、W consumerはpath-policy subpathだけを参照する。root indexからpath APIをexportするが、pathPolicyからindexをimportしない。

B/Cはfull profile: canonical buildの48rowsをmanifestへ記録し、installed payloadは16JS＋manifest。既存copy/v1 manifest形を保ち、full inventoryだけを意図的に更新する。repo/sibling fallback、alias、未知payload、改変/stale build拒否を保持する。

Wは別のpath-only profile: development copyはpathPolicy.js/.d.ts/.js.mapの3rows＋manifest、VSIXはpathPolicy.js＋manifestだけ。manifest schemaを`bob-builtin-analyze/processing-runtime-path-copy/v1`、profile=`path-only`としてfull/v1と取り違えない。sourceInputDigestと3選択rowsをcanonical全48row build receiptへ結び、Wがfull index/ledger/deadline等を受け入れないようruntime facade・source dependency policy・VSIX policyの三層で拒否する。Wのfacadeが公開するのも§4のpath APIだけとする。

既存build-runtimeのpublish destination allowlistとcopy-extension-runtimeを、決め打ちfull B/C・path-only Wの組合せだけへ拡張する。caller指定module配列や任意destinationを受けない。原本canonical buildのverifiedBuild、入力digest freshness、lock、同volume staging/publish、前payload保持を共通利用する。Wにbuild-shared-runtime.jsを追加し、canonical build→W tsc→選択copyの順で実行する。外部P型参照はtype-onlyに限り、WのrootDir外product sourceをcompileしない。新build tool/d.ts/mapをW VSIXから除く。extension identity、profile、exact filesとhashをlocal/installed双方で検査する。

P/W build scripts、payload list、copy profiles、host harness/CIのhash owner inventoryを必要範囲で明示更新する。変更のないfrozen owner hashを更新しない。WのContract-v2 R1/R2到達制約・Gate R 15 suite/5 effects0・inactiveを保持し、path追加をruntime activation根拠にしない。

Wの歴史的VSIXはUbuntu1,187,246／Windows1,187,787 bytes、余裕12,754／12,213（source S1=13d6bc08の観測）。これは新candidateの容量成功ではない。新3VSIXを両OSで実際に作り、path bytes同一と上限内を確認する。超過ならその失敗を残して原因/容量案を作り、cap変更や固定compaction対象拡張を無断で行わない。

## 10. テストと実hostの証拠

native testsは実装前にREDを保存し、以下を最低条件とする。正確なnamed casesとappend件数は実装計画で固定し、設計承認だけでcase削減しない。

| 群 | 検証内容 |
| --- | --- |
| portable syntax | 日本語/空白、4096 exact/+1、NFC/invalid Unicode、control/C1、reserved names/ADS、raw dot/traversal/empty、device/drive-relative/foreign absolute、UNC server/share、prefix境界、正常..name |
| physical resolver | regular file/directory、root自身、multiple missing components、missing ancestor file、EACCES等fail closed、root/intermediate/leaf link/junction、outside/別volume、type mismatch、raw root保持 |
| multi-root | physical deepest、deterministic tie、aliasesのあるactive file、missing file、linked root除外、direct/child marker、safe fallback、C/B explicitの差 |
| reads | opened/named/root置換、hardlink、ctime/nlink、consume中変更、同じ帳簿/取消/close・予約release、read前後の親link置換、standalone互換 |
| authoring | strictPaths true/false双方、全artifact、host absolute、backup/output拒否と書込み前再検査、kind allowlist/schema/500上限順、拒否した静的escape先の書込み0 |
| delivery | 52tar/3型consumer、B/C16JSとW1JS、all-three canonical path hash、W full payload/unknown export/改変manifest/stale copy拒否、source/sibling fallback0 |

新`pathPolicy.test.js`、`pathPolicyAbsoluteSegments.test.js`、C`task17PathSyntax.test.js`、W`task17SharedPathRuntime.test.js`/workspaceRoots tests相当を現行native構成へ置く。source familyの2つの歴史的W test titleはaliasとして明示し、実在するphysical版の意味へ対応付ける。旧textual wiring assertionはcompiled canonical module/installed proofへ適応し、製品意味のテストと区別する。

新PATH installed harnessはT17-DEADLINEの37 baseline意味を保持したうえでPATH casesを追加する。historical T13–T17 source receipts・case数・17 completion bytesは書き換えない。新subjectに合わせてbaseline loader/countの適応を明記する。P48compiled／52packed／3型consumer、B16＋C16＋W1=33loaded runtime identities、parser8／583pinsを固定し、WはpathPolicyだけの実ロードを証明する。実際に作った同一hash VSIXから両OSの隔離extension hostを起動し、3拡張activation、module resolved path/hash、parser、ケース順/結果をcaptureする。PATH consumerからの文書処理は現行operation・deadlineを共有する。

UNCはportable syntax/閉じたfixture adapterの検査と、Windows native share上の実体検査を別case/receiptにする。**実体UNCの正例とroot/parent/target拒否をWindows CIの実共有で必須とし、mockだけで置換しない。** runnerに限定したbootstrapが、nonce付きowned fixture directoryとloopback共有を用意し、現在runner identityにだけ権限を付ける。既存共有/ACL/firewallを変更せず、接続identity・UNC path・native realpath/lstat・subject・actual caseを記録する。終了時は作成した共有定義だけを確認して解除し、fixture/evidence自体を保存する。既存local hostで共有管理権限がなければUNC caseはnot_runと明記し、runnerでの実検証を必要とする。CIでも準備不能ならrequired failure/未検証として受入を止め、skipを成功へ読み替えない。SMB credentialsを生成・表示・永続化しない。junctionはWindows native、symlinkは対応OSで実体を作り、OS固有非対応は対象外のcaseだけ区別する。

full P/B/C/W品質、root必須4・4生成器、新旧admission、Gate R単独15 suite・5 effects0、diff、real3VSIX capsを確認する。Gate Rの120秒を増やさず、初回失敗を保持し原因を調査する。テスト用置換hook/clockは内部test DIでありpublic configから受けない。

## 11. admission・CI・source/metadata受入

M0をliteral baseにするpath source coverage/admissionを独立layerとして作る。22selected origins→actual native target/test/semantic adaptationを全件対応付け、既存675 partition・未割当0を閉じる。current prerequisites（P原本normalizer/identity、C stable reader/validator/collector、3facades/copy/build、host/CI・新admission）を実際の全diffから列挙し、選定22itemsと混ぜない。旧admission validators、historical fixtures、17completionのbytesとsubjectsは保持する。current-generator observerだけ将来の新projectionへ適応する。

local全gate・実package・Windows native host、whole-source一回review、具体candidate freezeの後に、repository/branch/head/tree/paths/limitationsを示して新C承認を得る。通常push→PR→fresh candidate CI→条件成立時だけnormal merge→fresh main CI/artifacts→非force同期とする。5workflow/18契約行、PR quality18success／nonPR quality17success＋PR-only metrics skip1、不足workflowは同headの新nonce dispatch。両OS PATH host、実52tar/3型/33runtime/8parser/583pins、3VSIX bytes/ZIP CRC/path joinsを同じsubjectで確認する。旧CI免除・旧headの成功は流用しない。修正headなら新candidateと新C承認を要する。

source observationを先にimmutable freezeし、別metadataでpath completion validator/registry/status/testsを追加する。source受入だけでは17refs/75%を進めない。別metadataも独立reviewと具体candidate固有C、fresh候補/main CIを要する。両者を混ぜたsubject/portable replayと元runner実観測の混同を拒否する。metadata受入後は18refs／16of20（80%）、next=`PROC-T18-REPORT`、PROCESSING-CONTROLを初めてVERIFIEDにする。全capability inactiveとfinal UAT not_runを維持する。最終progressの実際の静的program順は実装前にも照合する。

全既存19worktreeとprimary作業・Owner57を保持し、本設計用20番目以降のworktree/証拠も削除しない。完了済みmetadata worktreeはcf96788のまま保持する。原本JSONに後のmetadata mainを書き込まず、実行head/index tree/current bytesの違いを記録する。remote承認はこの設計への承認には含まれない。

## 12. 設計者判断とbuilderへ残す事項

設計者判断は、strict absence/UNC-root/raw-input検査、document nlink/ctime再検査、standalone stable reader互換、W path-only manifest隔離、real UNCをrequiredにすること、52/33の新payload契約、既存19workspace保持である。利用者が選択した方式と、設計者が具体化したこれらを区別する。

private helper配置、テストの分割/名前、同期APIの内部ループ、manifest validatorのprivate実装、nonce/fixture名、詳細task順・PATH append件数はbuilder判断。共通authority、selected22全対応、fail-closed境界、既存台帳/期限互換、W capability隔離、容量上限、required native UNC、fresh exact-head/event CI、source/metadata分離、保証しないrace範囲はbuilderが変更しない。

## 付録A. 選定22項目と現行への対応

以下のOIDとsymbol一覧の完全形は同じworkspaceのignored `RECONNAISSANCE.json`に保持する。表中の新fileは予定であり、既に実装済みとは扱わない。全originのcommitはowner7ea786afである。

| Source item | 種別 / family | Owner path | Owner blob OID | 現行target |
| --- | --- | --- | --- | --- |
| `source-02309bad381271a510d344c9` | symbol / workspace-roots | `C/src/workspaceRoots.ts` | `d542cd5d3027978358ebf3ab8a989079355350e4` | `C/src/workspaceRoots.ts`の現行compositionへ適応 |
| `source-04120694790d10c80bb7040c` | contract / review-input-artifact-and-output-path-validation | `C/src/core/reviewInputBuilder.ts` | `9a4740038c57f4d42f117af4b055051d5ddc945f` | `C/src/core/reviewInputBuilder.ts`の現行compositionへ適応 |
| `source-1004a4fe0de3bc511f445d9c` | test_family / path-policy | `P/test/pathPolicy.test.js` | `3d69664e292ccd51c6cafcc8ad966dd4bbe4f4c6` | `P/test/pathPolicy.test.js`の現行compositionへ適応 |
| `source-3ded212f1168d24021187d9e` | symbol / physical-path-policy-facade | `P/src/pathPolicy.ts` | `43c703c7dc1e7f498fa6e03f83a8e2eb80911591` | P/src/pathPolicy.ts（wrapperを再生せずnative実装） |
| `source-3e7af2df20c39b189fbd1629` | symbol / workspace-resolver | `C/src/workspaceResolver.ts` | `619a26741fb763b2d1bfe07d0e1777aec48d1e2a` | `C/src/workspaceResolver.ts`の現行compositionへ適応 |
| `source-434d0ac63b4a746f6d3a9e20` | contract / bounded-file-physical-path-and-identity | `P/runtime/bounded-file.js` | `2d52d68f9f854a177c5416bd17907cc258cb2a89` | P/src/boundedDocumentFile.ts＋boundedDocumentRequest.ts |
| `source-47976894c870049312761832` | test_family / physical-path-runtime-consumer-wiring | `P/test/task17IntegrationContract.test.js` | `eb9040f527f40ea451a5c83f43e6ec1b1dea6999` | `P/test/task17IntegrationContract.test.js`の現行compositionへ適応 |
| `source-4f031a975bf8b94eb8d72e84` | symbol / physical-path-policy-runtime | `P/runtime/path-policy.js` | `3cc2caa539ff3d91ab620a95464e605dc37b31d5` | P/src/pathPolicy.ts（新native owner） |
| `source-50e11b6b638f7049f18b0e16` | test_family / path-policy-absolute-segments | `P/test/pathPolicyAbsoluteSegments.test.js` | `ead6ead6f53e227bddec8073c62f9412782b513f` | `P/test/pathPolicyAbsoluteSegments.test.js`の現行compositionへ適応 |
| `source-5219013542fc29ba1d534591` | symbol / workspace-resolver | `B/src/workspace/workspaceResolver.ts` | `16c8e3d2b0b05162825a85f12237c55b2d5b8dcf` | `B/src/workspace/workspaceResolver.ts`の現行compositionへ適応 |
| `source-62df0f711e5ae203237bb4a1` | test_family / workspace-roots | `W/test/workspaceRoots.test.js` | `86a77c02a98914b32dceef5c4f3d2e9596d74fce` | `W/test/workspaceRoots.test.js`の現行compositionへ適応 |
| `source-6f36d055862923caea3a35e1` | test_family / task17shared-path-runtime | `W/test/task17SharedPathRuntime.test.js` | `3b4f32993b9ed6c93ac43a7aa3d10ec5602f2868` | `W/test/task17SharedPathRuntime.test.js`の現行compositionへ適応 |
| `source-aa62885d24943041e4096545` | contract / workspace-kind-physical-path-policy | `C/src/core/fileSystem.ts` | `1610eae4a33f583c76dfa9e82c7cb9cd2ffdae0e` | `C/src/core/fileSystem.ts`の現行compositionへ適応 |
| `source-b33145fb261ad05c13b57e8d` | contract / physical-path-consumer-facade | `C/src/sharedProcessingBudgetRuntime.ts` | `9b9ee324b096b84dc9edb3ebd2886d74973d0855` | `C/src/sharedProcessingBudgetRuntime.ts`の現行compositionへ適応 |
| `source-ca4e97785c37f540250cf9fa` | contract / physical-path-consumer-facade | `W/src/sharedProcessingBudgetRuntime.ts` | `d928d281c48d51100229a5151fe2b107fe841c88` | `W/src/sharedProcessingBudgetRuntime.ts`の現行compositionへ適応 |
| `source-caf09c280275a6ebe087fe80` | symbol / workspace-roots | `B/src/workspace/workspaceRoots.ts` | `3c0e404074a86e704034da40a29bf5ba562ddb6f` | `B/src/workspace/workspaceRoots.ts`の現行compositionへ適応 |
| `source-d04f52986688fcbd24d8cda7` | contract / shared-physical-path-runtime-packaging | `W/tsconfig.json` | `56cd9ee701cba719840eed126b877c3c142cc3cd` | W tsconfig＋build/copy/VSIXの現行配送契約 |
| `source-de3b9139421e60c0585e67ab` | contract / physical-path-consumer-facade | `B/src/sharedProcessingBudgetRuntime.ts` | `238a28e4f37e578fe8fc486858f92b17cfcda0ff` | `B/src/sharedProcessingBudgetRuntime.ts`の現行compositionへ適応 |
| `source-ebfc5cdf5f699bf21c7f452d` | contract / physical-path-public-exports | `P/src/index.ts` | `05dc203acfc5a2fb4fef82c7e75e14d811c58f09` | `P/src/index.ts`の現行compositionへ適応 |
| `source-ef195dcb7064aa411dcd1bb3` | symbol / physical-path-policy-runtime | `W/src/shared-processing-budget-runtime/path-policy.js` | `3cc2caa539ff3d91ab620a95464e605dc37b31d5` | P/src/pathPolicy.tsからW outへ検証済みpath-only copy |
| `source-f7857de29e60e9f3caa993eb` | test_family / task17path-syntax | `C/test/task17PathSyntax.test.js` | `b50843c4d44cfc4f0d77b36004285bbf1560b6a1` | `C/test/task17PathSyntax.test.js`の現行compositionへ適応 |
| `source-f81376e6cca60ec0168ede79` | symbol / workspace-roots | `W/src/core/workspaceRoots.ts` | `c2f4573b4f411ef53fef87e5eb764f5a46610573` | `W/src/core/workspaceRoots.ts`の現行compositionへ適応 |

## 付録B. 出典と独立チェック

- 選定根拠: `docs/release-evidence/feature-selection-ledger-2026-08-23.json` のPROC-T17-PATH、`tools/main-consolidation/feature-selection-source-universe.json` の22items。
- 実行順/境界: `tools/main-consolidation/feature-integration-program-index.json`、`docs/release-evidence/feature-integration-status.json`。
- 現行保証: T14/T15/T16/T17-DEADLINE specs、accepted mainのnative P/B/C/W codeとpackage/build/copy/host policies。
- 独立チェックはfresh `t17_path_design_builder_check`（gpt-6.1-terra/high）が実施し、回答は「nothing important left」。重要質問0件。記録はignored `BUILDER-CHECK.md`へ保存した。親で全22出典表、基点と順序、配送数、対象外、既存workspace保全を再確認し、書面承認を依頼する。
