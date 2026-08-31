# Wave 0A 削除境界の限定設計追補

> **Current scope note:** Removal cap、mutable-directory identity、path safetyの技術要件はcurrent referenceとして保持する。この文書に記録した承認・実行方式だけは `docs/superpowers/specs/2026-08-31-wave0a-risk-tiered-approval-and-evidence-design.md` に置換され、ここでexecution permitを与えない。

- Addendum ID: `WAVE0A-REMOVAL-BOUNDARIES-ADDENDUM-V1`
- Status: 提案。設計案の作成のみ承認済み。設計変更、実装計画、ソース・テスト変更は別途承認待ち。
- Date: 2026-08-27
- Repository: `katamor1/bob_builtin_analyze`
- Design checkpoint: `86670e2b7a76c9f866270314c000e1da9a8a43c2`
- Scope: `WorktreeRemovalPlanAttachment.totalFileBytes` の既存上限の復元と、`RootMaterializationAction.delete_empty_directory.expectedTarget` の可変snapshot問題。

## 1. 元の権威と今回の境界

次の原本は上書きしない。本追補は承認後、後述する限定された2点についてのみ、直前のroot-path追補に追加して適用する。それ以外の型、schema、実行順、安全ゲート、承認境界は原本とroot-path追補を継承する。

| 文書 | 固定 identity |
| --- | --- |
| `docs/superpowers/plans/2026-08-23-feature-integration-program-index-and-wave-0a.md` | commit `f4a9023990cca2774f0e8ea57792d68b4ae9b1c2`; blob `8822828c49c94e3aa4d6d3a5ea69527da0f7b8a7`; SHA-256 `da634d96eafe938d730ba2ab7f93fdeced1adb63c0f2bf2b7913330cda91d372` |
| `docs/superpowers/specs/2026-08-23-feature-selection-and-sequential-main-integration-design.md` | commit `819d6261d52d8dc7037d7fae8b852ad4b6a52e21`; blob `ccf3f833e32f48e583a6c6fac4796fa30756e1a4`; SHA-256 `709872ba8fa3188c666473248bf5196d1131672cfdec388929ecdb8c4c0292f5` |
| `tools/main-consolidation/feature-integration-program-index.json` | SHA-256 `7840c3b81dd72051a89c858547683cd6697698905727b1e8658141ccd73f7e04` |
| `docs/superpowers/specs/2026-08-27-wave0a-root-path-contract-addendum-design.md` | commit `86670e2b7a76c9f866270314c000e1da9a8a43c2`; blob `700b539bab9c5740736af9a1b0432a80eaf82ce2`; SHA-256 `8104d3e24b4fd826d450de0464db24880166c3795232cf74b488afe930c24c4d` |
| `docs/superpowers/plans/2026-08-27-wave0a-root-path-contract-addendum.md` | commit `86670e2b7a76c9f866270314c000e1da9a8a43c2`; blob `21d05822ec7c51d947a60beec1db27c7c93c4fac`; SHA-256 `c9bb9e2eaa4143b3b060d57b2bb7813e01928b461f5cfd8a56cf76cfa97d320d` |

今回の `よい` は、直前に質問した「残る2点の設計案を作成する」ことへの許可である。実装の再開、実装計画の確定、main / remote / PR / branch / worktree の変更や削除、provisioning、実campaign実行を許可するものではない。停止中のTask 6A draft、staging、保護clone、凍結文書を変更しない。

## 2. 調査結果と採用案

### 2.1 worktree removal の合計file bytes

直前のroot-path追補6節は、worktree-removalの数値上限を「確定できなかった」とした。しかし凍結計画4588行には次の既存権威が明記されている。

```text
MAX_WORKTREE_REMOVAL_TOTAL_FILE_BYTES=4_294_967_296
```

したがって、この論点では新しい値を選ばない。正しい値は `4_294_967_296` bytes（4 GiB）であり、materializationやgenerated cleanupからの類推ではない。前追補の「数値が未確定」という事実認定だけを訂正する。

### 2.2 空directory削除時のidentity

凍結計画3250、3251、3899行では、可変content snapshotを含む `DirectoryIdentity` と、同じopened directory objectの安定部分だけを表す `DirectoryHandleIdentity` が区別されている。子を削除すると少なくとも親directoryのmember集合とtree hashが変わり、filesystemが時刻metadataも更新し得るため、intent前の `DirectoryIdentity & {entryCount:0}` を子削除後の照合権威にはできない。

| 案 | 判断 |
| --- | --- |
| 安定した `DirectoryHandleIdentity` をplanへ束縛し、action時の完全空判定を別literalで要求する | 採用提案。同一objectの保証と、削除可能な現在状態の保証を分離できる |
| intent前と削除直前の2つの `DirectoryIdentity` をplanへ記録する | 不採用。後者は子削除の結果であり、intent時点では予測できない |
| 現行 `DirectoryIdentity` を維持し、mtime/ctime/treeだけ比較しない | 不採用。closed schemaとaction hashが権威を持つように見えながら、一部fieldを黙って無視する |
| 削除直前に `expectedTarget` を現在snapshotへ差し替える | 不採用。mutation後の観測値がintent前の期待値を自己承認する |

採用案は、凍結計画4421、4529行の「可変directoryはstable handle identityを先に束縛し、final content snapshotは完了後にだけ導出する」という既存分離と、3734-3737行のgenerated deletionにある `expectedEmptyAtDeleteOrdinal:true` の先例に一致する。

## 3. 合計file-byte上限の正確な意味

### 3.1 値と集計対象

```ts
const MAX_WORKTREE_REMOVAL_TOTAL_FILE_BYTES = 4_294_967_296n

let runningTotal = 0n
for (const entry of entries) {
  if (entry.kind !== 'file') continue
  const byteSize = BigInt(entry.byteSize)
  if (byteSize > MAX_WORKTREE_REMOVAL_TOTAL_FILE_BYTES - runningTotal) reject()
  runningTotal += byteSize
}
const totalFileBytes = runningTotal.toString(10)
```

規則は次のとおりとする。

- `WorktreeRemovalPlanAttachment.entries` に含まれる `kind:'file'` のno-follow statで得た論理file length `byteSize` を、target/adminの両ownerにわたり各entry一度だけ合計する。Git blob size、disk allocation size、canonical JSON sizeへ置換しない。
- target側のtracked fileと `.git`、admin側の `gitdir`、`HEAD`、`index`、`commondir`、logsその他、完全inventory内の全fileが対象である。directory行とowner-root行は0 bytesである。
- 外側の `gitFile` と `adminGitdirBackpointer` は同じfileを照合するanchorであり、entryに加えて二重課金しない。
- planのidentity uniqueness規則を維持する。完全inventory内のhard-link alias、同一物理identityの別entry、ownerを跨いだaliasを合計時にdeduplicateして受理せず、先にplan自体を拒否する。inventory外の外部hard-linkを探索・加算・拒否するlink-count規則は現行型にないため新設しない。外部aliasが存在しても、計画されたdirectory entry一件のlogical lengthだけを数える。
- `totalFileBytes` はleading zeroのないcanonical `DecimalString` とし、producer、pure validator、native consumer、reconciliationが同じentry列から再導出する。計算と比較には `BigInt` 相当のexact unsigned arithmeticを使い、JavaScript `Number` の加算へ縮退させない。
- 合計は `4_294_967_296` 以下だけを受理する。境界は `4_294_967_295`、`4_294_967_296` を受理し、`4_294_967_297` を拒否する。
- 16 MiBのcanonical removal-plan byte cap、16,384 entries、depth 256、1,024-entry chunk、16 progress/ack capsは独立であり、どれか一つを満たして他を省略できない。独立したper-file capは追加せず、一fileに対する実効上限もaggregateによる4 GiBである。generated deletionやmaterializationのper-file capをworktree removalへ流用しない。

### 3.2 強制時点と失敗状態

凍結計画5617行の順序を維持する。

1. Task 6Gのreview済みno-follow native inspectorが、intent前にtarget/adminの完全inventoryを列挙する。各fileのmetadataとplan内identity uniquenessを確認後、`byteSize > cap - runningTotal` をexact arithmeticで判定し、overflowならcontent read/hash、serialization、publicationへ進まない。
2. producerは全entryのexact sum、canonical `DecimalString`、`tupleSha256`、canonical plan bytesを確定し、declared `totalFileBytes` 不一致、identity/path/member不一致をstaging plan sourceの完成前に拒否する。
3. Task 6Bのaggregate `reserve_intent` は、同じvalidatorで再導出済みのplanだけをcampaign-owned final preconditionとしてrequest/intentと同時公開する。失敗時にplan、request、intentの一部だけをcanonical pathへ公開しない。
4. Task 6Gはclaim/spawn直前にcampaign-owned planを再度開き、consumer側で**全plan entry**の合計を再導出する。回復時も削除済みprefixをlive filesystemから再加算せず、immutable plan全体の宣言値を再計算し、live size/hash/identity照合はremaining suffixへ行う。
5. overflowではremoval intent、claim、child spawn、dispositionを行わず、既存のcheckpointed nonterminal integrity stopに留める。上限を上げるfallback、partial removal、caller overrideはない。

凍結計画5159行の「最初のremote mutation前」と「removal intent直前」のnative gateは、handle-relative capabilityを使い捨てfixtureで証明する別ゲートである。合計byte数のために新しいpre-remote attachmentやpublic fieldを追加しない。早期の回帰確度は凍結計画5155、5646行どおりcomplete 5,384-file real-repository fixtureでtarget/admin双方を含む実測totalと正のheadroomを示すが、Git blob合計で代用せず、live worktreeに対するmutation authorityにも使わない。実worktreeの権威的な判定はfinal `H` の完全inventoryが確定する既存のintent前plan生成で行う。

既存artifactだけで閉じる。`tupleSha256` は全entryを、campaign-owned plan SHAはentries、derived total、top-level identityを束縛し、intent/progress/observationは同じplan SHAを参照する。ただしhash一致だけを意味論検証の代用にせず、各producer/consumerがsum equalityとcapを再計算する。新しいcap-proof attachmentは追加しない。

## 4. `delete_empty_directory` の置換型

root-path追補3節の `RootMaterializationAction` のうち、`delete_empty_directory` armだけを次に置換する。他の4 arm、parent union、action base、外側plan shapeは変えない。

```ts
type RootMaterializationDeleteEmptyDirectoryAction =
  RootMaterializationActionBase &
  RootMaterializationParentRef & {
    kind: 'delete_empty_directory'
    sourceTreeOid: LowercaseSha
    expectedTarget: DirectoryHandleIdentity
    expectedEmptyAtDeleteOrdinal: true
  }
```

closed shapeとして次を要求する。

- `expectedTarget` は `canonicalPath`、`dev`、`ino`、`attributes`、`reparseTag:'0'` の正確な5 fieldだけを持つ。元の `mtimeNs`、`ctimeNs`、`entryCount`、`treeSha256` は未知fieldとして拒否する。
- `expectedEmptyAtDeleteOrdinal` はown propertyとして存在し、当該actionの `actionOrdinal` で完全空を要求するliteral `true` でなければならない。missing、`false`、`null`、`undefined`、文字列化した値を拒否する。
- `sourceTreeOid` はB側の元directory treeを、`RootFastForwardPlan` のheld rootと `expectedBeforeEntryCount` / `expectedBeforeTreeSha256` は物理的な初期root snapshotを、complete B→M action graphは削除すべき全子孫を束縛する。安定identityだけを使うことは、初期member検証やunexpected-child拒否を省略する許可ではない。
- `actionsSha256` は、新しいclosed `expectedTarget` と `expectedEmptyAtDeleteOrdinal:true` を含む完全action列のcanonical bytesから再導出する。

## 5. producer、native、recoveryの照合規則

### 5.1 intent前producer

- exact `B^{tree}` と `M^{tree}` から完全union diffを作り、Bにだけ存在するdirectoryについて `sourceTreeOid` と全descendant actionを一意に導出する。
- `RootFastForwardPlan` のheld root、`baseTreeOid`、`expectedBeforeEntryCount`、`expectedBeforeTreeSha256` と各actionのsource identityを一体で検証し、初期child集合を固定する。per-directoryの可変snapshotを新しいplan fieldとして複製しない。
- no-followでrootから親chainを開き、対象directory objectの `DirectoryHandleIdentity` を同じhandleから導出する。initial rootがB tree、index、clean tracked/untracked/ignored条件と一致し、unexpected member、reparse、alias、replacementがないことを既存の完全検証で確認する。
- action順は「子孫のdeleteが親の `delete_empty_directory` より先」のままとする。親actionへの正のforward referenceを許すroot-path追補のgraph規則は変えない。
- plan生成後にmutable `DirectoryIdentity` を期待値として保存しない。observed current snapshotを `expectedTarget` に代入する互換shimも設けない。

### 5.2 mutation直前から同一handle dispositionまで

native entryは最初のfilesystem mutationより前に、plan/schema/hash/graph/caps、rootとregistry/HEAD fence、Bの完全filesystem状態を再検証する。全existing directoryをheld rootからno-followで解決し、stable identity、parent-leaf mapping、初期member集合を確認する。missing/extra/reparse/replacement、未知scratch、hash driftがあればaction 0件で停止する。

1. retained root handleから、planのparent graphに従って各対象directoryをno-followで開く。directory自身のdelete ordinalより前でも、最初のdescendant accessで必要になった時点からそのhandleを保持する。
2. `expectedTarget:DirectoryHandleIdentity` をそのhandleから再導出し、canonical path、device/inode、attributes、zero reparse tagを完全一致させる。held immediate-parentのplan-bound leafが引き続きその同じobjectを指すことも確認する。
3. descendant actionに必要なparent handleとして同じdirectory handleを保持する。子file/directoryの削除でそのdirectoryのmtime/ctime/member treeが変化しても、それをidentity driftと扱わない。
4. 各action prefixで、既存のafter-prefix/before-suffix規則から導出される残存child集合を同じhandleからexact enumerationする。unexpected child、既処理childの再出現、未処理childの欠落、object replacementは次のdisposition前に停止する。
5. 親の `delete_empty_directory` ordinalに到達したら、同じ保持handleから完全空を再列挙する。`expectedEmptyAtDeleteOrdinal:true` とempty observationが一致したときだけ、その同じhandleへ `FileDispositionInformationEx(DELETE | POSIX_SEMANTICS)` を適用し、held immediate-parentからplan-bound leafの不在を確認して次へ進む。

pre-intentの `mtimeNs`、`ctimeNs`、`entryCount`、`treeSha256` をaction時に比較してはならない。一方で、安定identityの一部である `attributes` や `reparseTag`、device/inode、canonical handle pathのdriftは拒否する。空判定はdirectory名の再openやstring path enumerationで代替しない。

### 5.3 crash recoveryとprogress

- durable progressとfilesystemの欠落actionは厳密なprefix `1..P` でなければならない。directory actionがprefix内ならそのdirectoryは欠落し、prefix外なら存在しなければならない。
- prefix外のdirectoryは、新しいrecovery processがplan-bound parent chainからno-followで再openし、元planの `DirectoryHandleIdentity` と同じdirectory objectであることを照合する。OS handleそのものがcrashを跨いだとは主張しない。既に子actionが完了している場合は、そのprefixに対応する残存child集合だけをexactに要求する。
- directory action直前でcrashした場合、子が全て欠落し同じdirectory objectが空である状態だけを再開可能とする。別objectの同名empty directory、missing action gap、unexpected childはcontradictoryである。
- action後・progress前のcrashは、同じplan/action hashとexact prefix observationから完了prefixを再構成する。削除済みdirectoryを再open・再dispositionしない。
- reconciliationが新しい `DirectoryIdentity` を採取してplan期待値を更新したり、mtime/tree差を無視したcopyを新しいauthorityとして発行したりしない。ack/progressは既存どおりplan SHA、action range、rolling prefix digest、exact after-prefix/before-suffix observationへ束縛する。

## 6. schema互換性と優先関係

外側のschema literalは引き続き次のとおりとする。

- `bob-builtin-analyze/root-materialization-plan/v1`
- `bob-builtin-analyze/worktree-removal-plan/v1`

これは未実装・未投入のnested contractを最初の本番producer/consumerより前に訂正する限定設計である。legacy parser、old/new dual acceptance、auto-upgradeを追加しない。既存のadmitted campaign payloadまたは実行済みintentに旧 `DirectoryIdentity & {entryCount:0}` shapeが見つかった場合は停止し、別schema version / migration判断を得る。本追補は既存bytesの書換え権限を与えない。

優先関係は次のとおりとする。

| 先行文書の記述 | 本追補による扱い |
| --- | --- |
| root-path追補設計6節の「removal cap数値は未確定」 | 凍結計画4588行の明記を見落とした事実誤認として訂正。値は4 GiBで既に固定済み |
| root-path追補設計6節のmutable `DirectoryIdentity` 停止 | 本設計が承認された時点で、4-5節のstable handle + action時empty規則へ置換 |
| root-path追補実装計画のcap未確定停止とdirectory identity停止 | 本設計承認後に作成する実装計画追補で、該当停止条件だけを具体的な実装・test taskへ置換 |
| root-path追補のroot/descendant union、graph、hash、prefix規則 | 変更なし。本追補と合成して適用 |

42-schema registry、15-operation roster、20-node DAG、21 evidence-contract rows、public CLI、保存先、外部API、Program index、authority、VSIX、dependencyは変更しない。`GeneratedDeletionPlanEntry` は先例として参照するだけで型変更しない。

## 7. 実装対象と受入条件

本設計が承認された後の実装計画では、少なくとも次を割り当てる。

| 元task | 対応 |
| --- | --- |
| Task 6A phase 2B | exact cap constant、BigInt集計、closed delete-directory arm、shared fixture、pure producer/consumer validation |
| Task 6E | same-handle directory lifecycle、exact-empty-at-ordinal、replacement/unexpected-child/crash native fixture |
| Task 6G | intent前のcomplete inventory、cap overflow zero-intent、stable expectedTarget生成、claim/spawn前再検証、recovery |
| Task 6B / 6F / 6H | campaign-owned plan publicationとshared fixture/hash消費の回帰。新attachmentやapprovalは追加しない |
| Task 6C / 7 / 8B | portable aggregate gate、real-Windows native gate、独立レビュー、exact-final-H再検証 |

回帰は次の境界を固定する。

- `totalFileBytes` の `4_294_967_295` / `4_294_967_296` は受理、`4_294_967_297` はproducer/consumer/native spawn前に拒否する。
- 複数fileの `[4_294_967_295, 1]` は受理、`[4_294_967_296, 1]` は拒否する。4 GiB相当のbufferや一括readをfixture内に確保せず、metadata加算と既存のbounded streaming hash adapterで境界を作る。
- declared total不一致、leading zero、符号、空文字その他の非canonical `DecimalString` を拒否する。entry count `16_383/16_384/16_385` とcanonical plan bytes `16_777_215/16_777_216/16_777_217` はaggregate byte境界と独立に試す。
- complete 5,384-file real-repository fixtureを省略・縮約せずplan化し、実測total、4 GiBまでの正のheadroom、entries/plan/campaign byte capsとの同時適合を記録する。synthetic境界fixtureだけで運用可能と主張しない。
- target/adminの全fileを各一度数え、directory/rootは0、外側 `.git` / `gitdir` anchorは二重加算しない。declared total、entry byteSize、tuple hashのいずれかのdriftを拒否する。
- 完全inventory内のhard-link/identity aliasはdedup受理せず、ownerを跨ぐ場合もplan validationで拒否する。外部hard-linkの存在だけを新しい拒否理由にしない。
- valid nested deletionでは、子削除によりparentのmutable snapshotが変わっても同一held handleのstable identityと完全空判定で成功する。
- pre-intentまたはpre-actionのdirectory replacement、attributes/reparse drift、unexpected child、nonempty at ordinalをzero-next-dispositionで拒否する。
- old `DirectoryIdentity` keys、missing/falseのempty literal、stable identityの不足/未知field、action hash driftを拒否する。
- crashをchild disposition前後、parent empty確認前後、parent disposition前後、ack/progress/result/receipt前後へ注入し、同じexact prefixだけを再開する。
- real-Windows gateは同一handle file/empty-directory dispositionを証明し、portable mockのGREENだけでnative受入を主張しない。
- frozen plan/spec/index、root-path追補identity、停止中draft、保護clone、外部sentinel bytesを不変に保つ。

## 8. 現在の停止点

本書の作成とcommitは設計候補の固定であり、設計承認ではない。ユーザーが `WAVE0A-REMOVAL-BOUNDARIES-ADDENDUM-V1` と本書のcommit/blob/SHA-256を明示承認した後に限り、`writing-plans`でroot-path追補計画へ合成する限定実装計画を作成する。

それまではTask 6A draftを再開せず、source/test、campaign authority、main/remote、PR、branch/worktree、artifactを変更・削除しない。root-path追補自体の設計承認も未取得のため、実装再開には両追補の承認関係を明示する。
