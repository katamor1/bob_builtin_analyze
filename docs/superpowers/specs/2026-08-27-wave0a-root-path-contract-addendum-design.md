# Wave 0A ルート表現の限定設計追補

> **Current scope note:** Root identity、no-follow、cap、TOCTOUの技術要件はcurrent referenceとして保持する。この文書に記録した承認・実行方式だけは `docs/superpowers/specs/2026-08-31-wave0a-risk-tiered-approval-and-evidence-design.md` に置換され、ここでexecution permitを与えない。

- Addendum ID: `WAVE0A-ROOT-PATH-CONTRACT-ADDENDUM-V1`
- Status: 提案。文書作成のみ承認済み。設計変更・実装再開は別途承認待ち。
- Date: 2026-08-27
- Repository: `katamor1/bob_builtin_analyze`
- Implementation checkpoint: `b7add4940c0ee41957cbe6addd30bf7ef4703d64`
- Scope: `RootMaterializationAction` と `WorktreeRemovalEntry` のルート表現、および同じ表現を扱う validator / fixture / producer / native consumer。

## 1. 元の権威と承認境界

次の原本は上書きしない。本追補は承認後、後述する限定された矛盾についてのみ原本に優先する。それ以外の仕様・実装順・安全ゲート・承認境界は原本をそのまま継承する。

| 原本 | 固定 identity |
| --- | --- |
| `docs/superpowers/plans/2026-08-23-feature-integration-program-index-and-wave-0a.md` | commit `f4a9023990cca2774f0e8ea57792d68b4ae9b1c2`; blob `8822828c49c94e3aa4d6d3a5ea69527da0f7b8a7`; SHA-256 `da634d96eafe938d730ba2ab7f93fdeced1adb63c0f2bf2b7913330cda91d372` |
| `docs/superpowers/specs/2026-08-23-feature-selection-and-sequential-main-integration-design.md` | commit `819d6261d52d8dc7037d7fae8b852ad4b6a52e21`; blob `ccf3f833e32f48e583a6c6fac4796fa30756e1a4`; SHA-256 `709872ba8fa3188c666473248bf5196d1131672cfdec388929ecdb8c4c0292f5` |
| `tools/main-consolidation/feature-integration-program-index.json` | SHA-256 `7840c3b81dd72051a89c858547683cd6697698905727b1e8658141ccd73f7e04` |

今回の `yoi` は追補文書の作成許可であり、ソース・テストの変更許可ではない。元の承認 capture、v4 instruction、Program index、first-root policy は再生成しない。本追補は新しい runtime authority schema、approval flag、campaign attachment を追加しない。

追補の設計書と実装計画をローカル commit に固定し、commit、両 blob、両 SHA-256 を示して設計変更の承認を得る。その承認はローカル実装の限定的な補足であり、後続の final-`H` provisioning / lifecycle / campaign の各承認を兼ねない。旧承認記録は保持し、新承認を旧記録へ転記・置換しない。将来の candidate `H` は両追補文書とその実装を含み、従来の独立レビューと exact-head ゲートを通る。

main / remote ref、PR、branch / worktree の削除、保護 clone、archive、実機環境はこの追補作成の変更対象外である。最終的な main 一本化の目的や機能採否は変更しない。

## 2. 問題と採用案

元計画 3098-3099 行の `SafeRepositoryPath` / `SafeRelativePath` は、1..4096 UTF-8 bytes の非空 canonical forward-slash relative path であり、空 segment、`.`、`..`、backslash、colon、control、NUL を禁止する。

元計画 3894-3896 行は `parentActionOrdinal:0, rootAnchor:'root_worktree'` にも `parentRelativePath:SafeRepositoryPath` を要求する。このため `package.json` の親を表せない。3890-3893 行は worktree の全行に `relativePath` と `parentRelativePath` を要求する一方、5155-5161 行は target/admin ルート自身も削除対象として要求する。所有ルート自身と直下の子の親を表せない。

| 案 | 判断 |
| --- | --- |
| ルート専用の閉じた union。ルートを指す branch には相対パス field を置かない | 採用提案。一般 path grammar を維持し、native の親 handle と明示的に対応できる |
| 相対パス一般に空文字、`.`、特別文字列を許す | 不採用。共通 validator の許容範囲を拡張し、他の削除契約へ波及する |
| ルートを inventory から除外し、末尾で別処理する | 不採用。完全 inventory、tuple hash、prefix journal にルート disposition が含まれなくなる |

`?: never` は「own property が存在してはいけない」を意味する。`null`、空文字、`.`、値が `undefined` の own property、未知 field を代替表現として許可しない。既存の plain-data / accessor 拒否 / Unicode / canonical 検証を維持し、型別の閉じた shape も必ず検証する。property getterを評価する形で先行検証を追加しない。内部で欠落 field を空文字へ補完してから共通 path validator / native API へ流す実装も禁止する。

## 3. Root materialization の置換型

元計画の同名型を次の定義で置換する。ここで使用する primitive、identity、chunk 型は元計画の定義をそのまま参照し、緩和しない。外側の `RootMaterializationPlanAttachment`、5種類の action payload、schema literal は変えない。

```ts
type RootMaterializationParentRef =
  | {
      parentActionOrdinal: 0
      rootAnchor: 'root_worktree'
      parentRelativePath?: never
    }
  | {
      parentActionOrdinal: PositiveSafeInteger
      rootAnchor?: never
      parentRelativePath: SafeRepositoryPath
    }

type RootMaterializationActionBase = {
  actionOrdinal: PositiveSafeInteger
  chunkOrdinal: RootMaterializationChunkOrdinal
  repositoryPath: SafeRepositoryPath
  leaf: SafeWindowsLeafName
  depth: PositiveSafeInteger
}

type RootMaterializationAction =
  RootMaterializationActionBase & RootMaterializationParentRef & (
    | {
        kind: 'retain_directory'
        sourceTreeOid: LowercaseSha
        targetTreeOid: LowercaseSha
        expectedTarget: DirectoryHandleIdentity
      }
    | {
        kind: 'delete_regular_file'
        sourceObjectOid: LowercaseSha
        sourceGitMode: '100644' | '100755'
        sourceByteSize: NonnegativeSafeInteger
        sourceBlobSha256: LowercaseSha256
        expectedTarget: FileIdentity
      }
    | {
        kind: 'delete_empty_directory'
        sourceTreeOid: LowercaseSha
        expectedTarget: DirectoryIdentity & { entryCount: 0 }
      }
    | {
        kind: 'create_directory'
        targetTreeOid: LowercaseSha
        expectedAbsent: true
      }
    | {
        kind: 'install_regular_file'
        targetObjectOid: LowercaseSha
        targetGitMode: '100644' | '100755'
        targetByteSize: NonnegativeSafeInteger
        targetBlobSha256: LowercaseSha256
        expectedAbsent: true
        scratchLeaf: SafeWindowsLeafName
      }
  )
```

### 3.1 親 graph と実行

- action は root 自身を表さず、必ず root 配下の非空 `repositoryPath` を持つ。
- `parentActionOrdinal:0` は保持済み `rootWorktree` handle を選ぶ。`rootAnchor` は上の literal と完全一致し、`repositoryPath === leaf`、`depth === 1` とする。
- 正の親 ordinal は同じ plan に存在する一つの directory action を指す。親 action の `repositoryPath === parentRelativePath`、子の `repositoryPath === parentRelativePath + '/' + leaf`、`depth === parent.depth + 1` を要求する。親 file、自己参照、cycle、欠落親、別 path、case-fold 衝突を拒否する。
- 親 graph は必ず ordinal 0 に到達する。retained/created directory は依存 action より先、deleted directory は全削除子孫より後という既存実行条件を維持する。`delete_empty_directory` への正の forward reference は正当であり、一律の `parentActionOrdinal < actionOrdinal` 制限を追加しない。消える親の配下への create/install は拒否する。
- 親 directory を開く graph 順と action の実行順を混同しない。削除予定の親も子の処理前に no-follow で開いて保持するが、親の空判定と disposition は親 action の時点に限る。
- root の親選択は tagged branch のまま native adapter へ渡す。配下 node に対する操作は元計画どおり、保持済み immediate-parent handle と一つの検証済み leaf だけで行う。absolute/composite path の mutating API 呼出しを追加しない。

### 3.2 集計と固定 bytes

`actions` は元計画の正規実行順、`actionOrdinal` は配列位置 + 1、chunk は連続 1,024 actions ごととする。変更ファイルの隣接 delete/install のみ同じ `repositoryPath` を2回持てるという既存規則を維持する。

この追補で root omission の集計を明確化する。`totalPathBytes` は各 action の `repositoryPath` の UTF-8 byte length と、存在する `parentRelativePath` の UTF-8 byte length の総和とする。同じ path の delete/install はそれぞれ数える。欠落親は加算しない。`leaf`、`scratchLeaf`、absolute identity path はこの指標へ重複加算しないが、canonical plan 全体の byte cap には含まれる。root token を生成して加算しない。

`maxDepth` は action の最大 depth、空 actions では 0。`actionsSha256 = SHA256(CanonicalJson(actions))` とし、canonical JSON は既存の UTF-8 / key order / terminal LF 契約を使う。新しい domain separator、ハッシュからの field 除外、旧 root 表現の正規化は加えない。plan 全体の SHA は外側の root/registry identity を含む全 bytes を引き続き拘束する。

上限は元計画どおり、actions 16,384、depth 256、totalPathBytes 67,108,864、plan bytes 16,777,216、1 file 1,073,741,824 bytes、total blob bytes 17,179,869,184、1 chunk 1,024 actions、16 chunks。一般 path の 4,096-byte 上限も維持する。

## 4. Worktree removal の置換型

root row と descendant row を `entryScope` で区別する。両方とも inventory、ordinal、tuple hash、delete prefix に含める。

```ts
type WorktreeRemovalEntryBase = {
  ordinal: PositiveSafeInteger
  deleteOrdinal: PositiveSafeInteger
  owner: 'target' | 'admin'
  leaf: SafeWindowsLeafName
  volumeSerial: DecimalString
  fileId: DecimalString
  attributes: DecimalString
  reparseTag: '0'
}

type WorktreeRemovalOwnerRootEntry = WorktreeRemovalEntryBase & {
  entryScope: 'owner_root'
  kind: 'directory'
  depth: 0
  byteSize: 0
  sha256: null
  parentOrdinal?: never
  relativePath?: never
  parentRelativePath?: never
}

type WorktreeRemovalDescendantParentRef =
  | { parentOrdinal: 0; parentRelativePath?: never }
  | {
      parentOrdinal: PositiveSafeInteger
      parentRelativePath: SafeRelativePath
    }

type WorktreeRemovalDescendantEntry =
  WorktreeRemovalEntryBase & WorktreeRemovalDescendantParentRef & {
    entryScope: 'descendant'
    relativePath: SafeRelativePath
    depth: PositiveSafeInteger
  } & (
    | {
        kind: 'file'
        byteSize: NonnegativeSafeInteger
        sha256: LowercaseSha256
      }
    | { kind: 'directory'; byteSize: 0; sha256: null }
  )

type WorktreeRemovalEntry =
  WorktreeRemovalOwnerRootEntry | WorktreeRemovalDescendantEntry
```

### 4.1 root row の唯一の解決方法

| `owner` | root identity | 外部の保持親 | leaf |
| --- | --- | --- | --- |
| `target` | `featureWorktree` | `featureParent` | `featureRootLeaf` |
| `admin` | `adminDirectory` | `adminParent` | `adminRootLeaf` |

`owner_root` は各 owner に必ず1行、全体で2行だけ存在する。root row はその root handle identity の volume/file ID、attributes、zero reparse tag、directory kind と一致し、leaf は表の field と完全一致する。native identity の canonical decimal `dev/ino` と entry の `volumeSerial/fileId` の対応も既存 identity 契約どおりに照合する。canonical handle path と outer parent + leaf の一致は検証用であり、文字列で root を再度開く権限にはならない。

root row 自身に `parentOrdinal:0` を書かない。root は表の外部親 handle から leaf 一つで開く。外部親は inventory に入れず、削除しない。root row の正の `ordinal` は node / disposition identity であり、仮想親 selector の 0 とは別物である。

### 4.2 descendant graph

- `parentOrdinal:0` は同一 owner の root row に対応する保持済み root handle を選ぶ。`parentRelativePath` は存在せず、`relativePath === leaf`、`depth === 1`。
- 正の親 ordinal は同じ owner の **descendant directory** だけを指す。root row の正の ordinal を親として使う別名表現は禁止する。親の `relativePath === parentRelativePath`、子の `relativePath === parentRelativePath + '/' + leaf`、`depth === parent.depth + 1` を要求する。
- owner crossing、欠落親、親 file、自己参照、cycle、深さ不一致、ordinal-ignore-case の sibling collision、重複 path / identity、root/parent の alias・置換を拒否する。path の一意性は owner 内、正規化された volume/file ID の一意性は両 owner 横断で要求する。別 owner が同じ相対文字列を持つこと自体は合法。親 chain は同一 owner の仮想 0 で終わる。
- 完全 inventory は target の `.git` と admin の `gitdir` を depth 1 の file row としてそれぞれ一度含み、outer `gitFile` / `adminGitdirBackpointer` の identity、size、bytes hash に一致する。全 tracked node と必要な admin node を含め、tracked modifications / untracked / ignored は従来どおり 0。
- root は depth 0、descendant は従来の相対 segment 数で depth 1..256。外側の `maxDepth:PositiveSafeInteger` は変えない。有効な完全 plan には必須の depth-1 file が存在するため最小値は 1 であり、空 inventory / root 2行のみの plan は拒否する。

### 4.3 正規順序・集計・hash

以下は既存の stable ordinal / deepest-first 契約を root row にも一意に適用するための明確化である。

1. `entries` の owner 順は target、admin。owner 内は root row が先頭、続いて descendant の `relativePath` を unsigned UTF-8 bytes 昇順に並べる。root を空 path として sort せず、明示的に先頭に置く。`ordinal === 配列位置 + 1`。
2. `deleteOrdinal` は target descendants の depth 降順、同 depth では relativePath の unsigned UTF-8 bytes 昇順、target root、admin descendants の同じ順、admin rootの連続 1..N とする。root は各 owner 内の最後、admin root は全体の最後。
3. `entryCount === entries.length`、root 2行を含めて上限 16,384。`maxDepth` は全行の depth の最大値。`totalFileBytes` は file 行の `byteSize` のみを精度を失わず加算した canonical decimal string。directory / root は 0。
4. `tupleSha256 = SHA256(CanonicalJson(entries))`。新しい `entryScope`、全 identity、両 ordinal、kind-specific fields を含む完全行を hash し、root row を除外しない。plan 全体の SHA は外部親・root・`.git`・backpointer identity も拘束する。
5. progress の prefix と rolling digest はこの `deleteOrdinal` 列について解釈する。root-first の `entries.slice(0,P)` で代用しない。`missingEntryOrdinals` は欠落行の stable `ordinal` を昇順に記録する。既存 progress / observation の schema、claim、chunk、rolling digest の framing は変更せず、新しい完全行と plan SHA に結び付ける。

root 追加分を cap の外へ出したり、root 専用の無記録 disposition を追加したりしない。plan bytes 上限 16,777,216 も維持する。

## 5. native と crash recovery の不変条件

Task 6E は新しい schema を独立に再解釈せず、同じ閉じた union と graph を検証する。portable Node validator が成功しても native の held-identity / no-follow / share / current-state 検証は省略しない。

- feature/admin の外部親を保持し、残存 root row はその外部親から開く。remaining descendants は root 0 selector または同一 owner の保持済み descendant-directory handle から、leaf 一つで開く。
- 削除は元計画 5157 行の同一 handle、要求 access、share exactly `FILE_SHARE_READ`、`FileDispositionInformationEx(DELETE | POSIX_SEMANTICS)` を維持する。recursive string delete、Git worktree remove、mutating prune、fallback、ignore-readonly は追加しない。
- open/検証は親から子へ、disposition は plan の `deleteOrdinal` 順。次の disposition 前に全 remaining nodes を検証・保持する既存条件を維持する。
- filesystem の欠落集合は delete prefix `1..P` と完全一致し、durable progress はその prefix を超えない。target root が欠落する境界では全 target descendant が既に欠落し、admin の残りは adminParent から独立して解決できる。削除済み root を再度開いたり再 disposition したりしない。
- registration / `.git` / backpointer 状態は **完全な entry prefix** から導く。root が存在するかだけでは判定しない。各 control file は root より前に消えるため、その各境界も照合する。全完了は両 root 不在、root-only worktree observation、empty prune dry-run を要求する。
- 不正 shape、graph、hash、未知 root、gap、置換、reparse、未計画 child、release/CWD/registration drift は停止し、残存証跡を保全する。拒否した plan から mutation を一つも開始しない。適用済み prefix がある場合も、次の disposition を行わず既存の矛盾 checkpoint へ進む。

## 6. 互換性と対象外

対象の schema literal は引き続き `bob-builtin-analyze/root-materialization-plan/v1` と `bob-builtin-analyze/worktree-removal-plan/v1`。未実装・未投入の契約を最初の本番 producer/consumer より前に訂正するためであり、legacy parser、auto-upgrade、二重表現の受理は設けない。既存の admitted campaign payload が見つかった場合は停止し、別の version / migration 判断を得る。本追補はその bytes の書換え権限を与えない。

42-schema registry と producer/cap の対応、15-operation roster、20-node DAG、21 evidence-contract rows、public CLI、保存先、外部 API、VSIX version、dependency、Program index、authority の field/cardinality は変更しない。`GeneratedDeletionPlanEntry`、一般 path grammar、first-root installation の schema は対象外。

元計画 5155/5159 行は worktree-removal の total-file-byte cap を要求するが、その数値は対象型・native 契約の調査で確定できなかった。**本追補では値を選ばない。** materialization の 16 GiB や generated-cleanup の値を借用しない。完全 removal cap の実装/受入を通す前に、元の権威から数値を確定するか、別の限定承認を得る。それまでは該当 cap の受入を PASS としない。これは root 表現とは別の未決事項であり、本追補による完了主張の対象外である。

別の継承した未決事項として、`delete_empty_directory.expectedTarget` は元計画 3250/3899 行の `DirectoryIdentity & {entryCount:0}` のままであり、可変の `mtimeNs/ctimeNs/treeSha256` を含む。子の削除後に親を削除する positive case では、intent前のsnapshotと削除時のsnapshotの照合時点が未確定である。元計画4421/4529行も別のstaging文脈でこれらを可変として区別している。**本追補はこのidentity型・照合強度を変えない。** 3.1節のforward referenceはgraph表現の決定に限り、空判定の延期だけで物理的なidentity問題も解消したとは扱わない。該当native動作を実装・PASSにする前に元の権威から照合規則を確定するか、別の限定承認を得る。時刻/hashの無視、実行直前の無承認なexpected値更新、型の差替えで進めない。

## 7. 変更箇所と受入条件

| 原 task | 追補の適用 | 主な file |
| --- | --- | --- |
| 6A phase 2B | 閉じた nested union、相関 graph、集計、非空 literal fixture | `tools/main-consolidation/featureIntegrationCampaignPolicy.mjs`、同 `test/featureIntegrationCampaignPolicy.test.mjs` |
| 6E | root/descendant の解決、held-parent open、root prefix 境界 | `tools/main-consolidation/wave0a-windows-native.ps1`、同 `test/wave0a-windows-native.test.mjs` |
| 6G | exact Git tree / native inventory から一意の新表現を生成し再検証 | `tools/main-consolidation/wave0aMutationPolicy.mjs`、`run-wave0a-mutation.mjs`、対応する2つの test |
| 6B/6F/6H、全体レビュー | shared fixture を通じた schema/hash の消費を確認。新規 authority は増やさない | 元計画が指定する既存の consumer tests / gate |

受入は次の全条件とする。

- 全5 action kind の root-level と nested path、delete-directory 親への forward reference を positive fixture で受理し、producer と独立 literal が canonical bytes で一致する。
- removal fixture は root 2行、target `.git`、admin `gitdir`、root-level regular file、nested directory/file を含む。empty/root-only fixture を positive control にしない。
- 必須 field の missing、未知 field、禁止 field の存在を区別して拒否する。禁止 field の omission は受理し、null/undefined/empty/dotだけでなく有効な非空pathを入れた別表現も拒否する。有効pathを入れたcaseは集計/hashを更新し、一般path grammarでなく閉形による拒否を確認する。negative graph fixture は metadata/hash を正しく再計算し、単なる digest 不一致で止まったことを根拠にしない。
- 両 owner/root の取り違え、root ordinal の別名親、cycle、親 file、path/leaf/depth mismatch、根の欠落/重複/file化、ordinal/hash改変を拒否する。
- rootを含む 16,383/16,384/16,385 entries、depth 255/256/257、root omission を含む path/plan byte cap、各 chunk と target-root/admin-root の前後 prefix を実測・検証する。
- Windows native の root/ancestor/leaf 置換、reparse、share、unexpected child、crash/reconcile と同一 handle 証明を通し、外部 sentinel bytes が不変。portable test のみで native gate 成功を名乗らない。
- 元の frozen plan/spec/index、承認 capture、保護 clone、停止中 draft の履歴を保全する。Task 6A phase 2B/2C、後続 task、独立レビュー、final-`H` の全ゲートを省略しない。

実装手順は `docs/superpowers/plans/2026-08-27-wave0a-root-path-contract-addendum.md` に固定する。文書完成と設計承認は別であり、現時点で implementation / main integration / cleanup は完了していない。
