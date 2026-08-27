# Wave 0A Approved Root and Removal Addenda Composed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 文書identityが承認・固定済みで実装は未承認の root-path contract と removal cap / mutable-directory identity の二追補を、停止中の Wave 0A Task 6A phase 2B から元の依存順へ合成し、root materialization と worktree removal を同じ検証済み契約で producer・campaign publication・Windows native consumer・recoveryまで閉じる。

**Architecture:** Task 6A の process-free policy を唯一の closed schema / graph / cap validator とし、Task 6G を唯一の plan producer、Task 6B を唯一の aggregate precondition publisher、Task 6E を campaign-owned plan の held-handle native consumer とする。root は疑似 path に変換せず tagged parent/root row で表現する。worktree removal は完全 immutable plan 全体から exact BigInt 合計を再導出し、削除中に内容が変わる directory は stable `DirectoryHandleIdentity` と action 時の完全空判定へ分離する。Task 6C の final-diff boundary は凍結75-path配列へexact 6 pathsだけを加えた81-path closed arrayとし、`B...H`との差分一致をtest-owned literalで保証する。

**Tech Stack:** Node.js ESM、`node:test`、PowerShell 7、Windows native `NtOpenFile` / `NtCreateFile` / `FileDispositionInformationEx` / handle-relative no-replace rename、Git、既存 `tools/main-consolidation` canonical JSON / SHA-256 policy。

**Spec:** 文書identity承認済みの root design `docs/superpowers/specs/2026-08-27-wave0a-root-path-contract-addendum-design.md` と root plan `docs/superpowers/plans/2026-08-27-wave0a-root-path-contract-addendum.md` を `WAVE0A-ROOT-PATH-CONTRACT-ADDENDUM-V1`（commit `86670e2b7a76c9f866270314c000e1da9a8a43c2`、design blob `700b539bab9c5740736af9a1b0432a80eaf82ce2`、design SHA-256 `8104d3e24b4fd826d450de0464db24880166c3795232cf74b488afe930c24c4d`、plan blob `21d05822ec7c51d947a60beec1db27c7c93c4fac`、plan SHA-256 `c9bb9e2eaa4143b3b060d57b2bb7813e01928b461f5cfd8a56cf76cfa97d320d`）で固定する。文書identity承認済みの removal design `docs/superpowers/specs/2026-08-27-wave0a-removal-cap-and-mutable-directory-identity-design.md` は `WAVE0A-REMOVAL-BOUNDARIES-ADDENDUM-V1`（commit `3f70335f96d7fb14dceab7f6d3e2d4b71f07f98f`、blob `74d2f02adf937123338dca91843635d10dfa8abe`、SHA-256 `0b50db92aa59014226595b30a291a191feaa0f69a4229ce8ee7d45b2dea3a868`）で固定する。これらは実装authorityではなく、本合成計画の別途exact承認まで実装を開始しない。元の凍結計画 `docs/superpowers/plans/2026-08-23-feature-integration-program-index-and-wave-0a.md` は commit `f4a9023990cca2774f0e8ea57792d68b4ae9b1c2`、blob `8822828c49c94e3aa4d6d3a5ea69527da0f7b8a7`、SHA-256 `da634d96eafe938d730ba2ab7f93fdeced1adb63c0f2bf2b7913330cda91d372`。元の凍結設計 `docs/superpowers/specs/2026-08-23-feature-selection-and-sequential-main-integration-design.md` は commit `819d6261d52d8dc7037d7fae8b852ad4b6a52e21`、blob `ccf3f833e32f48e583a6c6fac4796fa30756e1a4`、SHA-256 `709872ba8fa3188c666473248bf5196d1131672cfdec388929ecdb8c4c0292f5`。

## Global Constraints

- この文書は上記二追補を一つの実装順へ合成する。文書identity固定済み・実装未承認の addendum spec / plan、元の凍結 plan / spec、Program index、`wave0a-first-root-install-policy.json` の原本 bytes は編集しない。
- 作業先は `C:/Users/stell/source/repos/bob_builtin_analyze/.worktrees/feature-integration-selection-design`、branch は `codex/feature-integration-selection-design`。この計画作成時の HEAD は `3f70335f96d7fb14dceab7f6d3e2d4b71f07f98f`、その親は root-path 追補 commit `86670e2b7a76c9f866270314c000e1da9a8a43c2`。
- 停止中の tracked draft `tools/main-consolidation/test/featureIntegrationCampaignPolicy.test.mjs` は +290 行、SHA-256 `17234f43c7c264ff4d0c2abf04158c666fd81a0c434f88fcf6c5d3e11e1b877d`。R1開始までは変更・stage・commitせず、R1では履歴を保持したまま完成させる。reset、checkout、stash、再生成で破棄しない。
- `C:/Users/stell/source/repos/bob_builtin_analyze/.integration-xlsx-on-prereq` は保護cloneである。descendantを走査・変更せず、current project / 保護clone / configured campaign rootのbranch/worktree/topology、main / origin/main、remote、PR、artifact、campaign authority、provisioning、実campaignを変更・削除しない。R2/R3/R4 testが各test-owned fresh temporary root内だけに作成・破棄するbounded disposable repository/worktree fixtureは許可し、root path、作成物inventory、破棄完了、fixture外sentinel不変を証跡化する。R3のtest-owned Git/native fixtureと5,384-file repository fixtureもこの範囲だけで作成し、current project、保護clone、configured campaign rootへ代用しない。
- 二追補は未実装・未投入の nested v1 contract を最初の producer / consumer より前に訂正する。旧 `DirectoryIdentity & { entryCount: 0 }` shape の admitted campaign payload または実行済み intent が見つかった場合は停止し、schema version / migration の別判断を得る。dual parser、auto-upgrade、既存bytes書換えは追加しない。
- 外側の `root-materialization-plan/v1` / `worktree-removal-plan/v1`、42-schema registry、15-operation roster、20-node DAG、21 evidence-contract rows、公開CLI、保存先、authority、外部API、dependency、VSIXは変更しない。
- removal cap は inclusive `4_294_967_296` bytes。`MAX_WORKTREE_REMOVAL_TOTAL_FILE_BYTES = 4_294_967_296n` とし、各 file row の logical `byteSize` を target/admin 全体で一度だけ exact `BigInt` 加算する。独立 per-file cap、新しい cap field、cap-proof attachment、caller overrideを追加しない。
- `delete_empty_directory` は `expectedTarget: DirectoryHandleIdentity` と own literal `expectedEmptyAtDeleteOrdinal: true` を持つ closed arm に置換する。`mtimeNs`、`ctimeNs`、`entryCount`、`treeSha256` を黙って無視・保持・runtime差替えしない。
- Task 6Cの`allowedChangedPaths`は凍結75件へ下記exact 6 pathsだけを追加した81件とする。glob、directory prefix、一般docs許可へ広げず、`git diff --name-only B...H`とのbyte-for-byte一致を維持する。
- 実装順は凍結済み corridor `1A -> 1B -> 6A -> 1C -> 2 -> 3A -> 3B -> 4A -> 4B -> 5A -> 6E -> 5B -> 6B -> 6C -> 6D -> 6F -> 6G -> 6H` を維持する。R1は現在の6A phase 2B、R2は6E到達時、R3は6G到達時にだけ実施し、連続して先行実装しない。
- 各 task は test-first、fresh implementer、fresh spec reviewer、fresh code-quality reviewerを使い、Critical 0 / Important 0、exact owned-path staging、exact commit確認後に次へ進む。portable GREENをWindows native acceptanceへ読み替えない。
- 実行証跡は `.superpowers/sdd/2026-08-23-feature-integration-program-index-and-wave-0a/` の `progress.md`、`task-6A-context.md`、`task-6A-report.md` と後続task report/reviewへ加法的に追記する。`wave0a-local-implementation-handoff-2026-08-27.md` は停止時点の履歴として保持し、過去の342 REDをGREENへ書き換えない。

---

## Approved Supersession Matrix

| 先行記述 | この合成計画でのexact置換 |
| --- | --- |
| root-path plan 211/257/321行のremoval total-file cap停止 | 凍結計画由来のinclusive `4_294_967_296` bytesをR1/R2/R3で実装・再導出し、境界testを必須化する |
| root-path plan 239/322行のmutable directory identity停止 | `DirectoryHandleIdentity` + `expectedEmptyAtDeleteOrdinal:true`、same-handle lifecycle、exact-prefix recoveryをR1/R2/R3で実装・検証する |
| root-path planのroot/descendant union、graph、hash、prefix、ownership | 一切緩和せず両置換と合成する |
| frozen Task 6Cの75-path allowlist | identity固定済みaddendum / 今回の合成文書4件と、既存計画から漏れたfirst-root policy / Task 4A fixtureのexact 6 pathsを追加し81件へ訂正する |
| 元のcorridor、schema/roster/DAG/public authority、後続approval | 変更しない |

この表以外のidentity固定済みroot-path plan/spec記述をsupersedeしない。

Task 6Cへ追加するsort済みpathは次の6件だけである。

```text
docs/superpowers/plans/2026-08-27-wave0a-approved-root-removal-addenda-composed-implementation.md
docs/superpowers/plans/2026-08-27-wave0a-root-path-contract-addendum.md
docs/superpowers/specs/2026-08-27-wave0a-removal-cap-and-mutable-directory-identity-design.md
docs/superpowers/specs/2026-08-27-wave0a-root-path-contract-addendum-design.md
tools/main-consolidation/test/fixtures/exactHeadRunDiscovery.fixture.mjs
tools/main-consolidation/wave0a-first-root-install-policy.json
```

前四件はidentity固定済みaddendum文書と今回の実装approval scopeを定義する合成文書であり、それ自体を実装authorityへ読み替えない。第五件は元Task 4Aのowned literal fixture、第六件は元Task 6A phase 2Aで既にcommit済みのimmutable assetである。これらをproduct-source変更へ読み替えず、81件以外の差分を許可しない。このallowlist補正自体も下記composed-plan approvalのexact scopeに含める。

## Composed-Plan Implementation Approval Protocol

この文書のcommitはplanningだけを完了し、Task 0/R1を自動承認しない。実装再開には同一trusted Codex task transcript内の次の三つのdistinct message observationを順番どおり要求する。

1. assistant announcementのnormalized body全体を `Wave 0A composed addenda plan committed planCommit=C planBlob=O planSha256=S` とする。`C/O/S` はこの文書を固定したlowercase 40/40/64-hex identityである。
2. 後のdistinct assistant promptのnormalized body全体を、同じ値を代入した `WAVE0A-APPROVED-ADDENDA-COMPOSED-IMPLEMENTATION-V1 を承認 planCommit=C planBlob=O planSha256=S` とし、そこでyieldする。
3. さらに後のdistinct user messageのnormalized body全体がassistant promptとbyte-identicalな場合だけ承認とする。

captureはliteral `source:'codex_trusted_transcript_v1'`、同一`threadId`、roles `assistant_announcement -> assistant_prompt -> user_approval`、distinct provider message IDs、strictly increasing ordinals/timestamps、`maxUses:1`、`purpose:'implement_approved_wave0a_root_and_removal_addenda'`、`mutationAuthority:false`を持つclosed recordとする。prefix/suffix、second line、generic `承認`、assistant echo、user-authored announcement/prompt、cross-thread/copy、identity crossing、duplicate/reuseを拒否する。provider-backed observationをcaller JSONから捏造しない。

承認captureはrepository/campaign/protected clone外のfresh non-reparse root `C:/Users/stell/source/archives/bob_builtin_analyze/2026-08-27-wave0a-approved-addenda-composed-plan-approval/` のfixed leaf `approval.json` へcreate-newで保存する。親からleafまでno-followで確認し、canonical bytesを書いてfileと親directoryをsyncし、no-follow handleでreopenしてexact byte size、SHA-256、`FileIdentity`を記録し、その同一bytesだけをTask 0で再検証する。既存leaf、symlink/reparse、identity/size/hash driftでは停止し、上書き・別名fallback・caller-provided captureを許可しない。このapprovalが許可するのは同一workspaceでの本計画owned source/test/docs edits、local tests、review、local commits、candidate evidenceだけであり、control authority、live campaign、remote/PR/main、current project branch/worktree cleanupを許可しない。条件を満たすまで`BLOCKED_PENDING_COMPOSED_PLAN_IMPLEMENTATION_APPROVAL`とする。

## Task 0: 承認identity、workspace、schema互換性を再確認する

**Files:** Read only: fixed external approval leaf `C:/Users/stell/source/archives/bob_builtin_analyze/2026-08-27-wave0a-approved-addenda-composed-plan-approval/approval.json` and its parent metadata, identity-fixed/frozen documents, Git metadata, current draft, configured campaign evidence roots. Repository files are not modified; the approval leaf is the preceding protocol's single create-new external capture, not a Task 0 rewrite.

**Interfaces:** 二追補のユーザー承認identity、この文書を固定したcommit/blob/SHA-256に対する後続のexact実装承認identity、live worktreeを入力とし、`R1_READY` または一つの具体的な停止理由を出力する。production payloadは出力しない。

- [ ] **Step 1: 実行用toolとworkspaceを固定する。** PowerShell sessionで次を実行し、resolved executable pathとHEADを記録する。

```powershell
$composedWorktree = 'C:/Users/stell/source/repos/bob_builtin_analyze/.worktrees/feature-integration-selection-design'
$composedNode = (Get-Command node.exe -ErrorAction Stop).Source
$composedGit = (Get-Command git.exe -ErrorAction Stop).Source
Set-Location -LiteralPath $composedWorktree
& $composedGit rev-parse --show-toplevel HEAD HEAD^
& $composedGit status --short
& $composedGit diff --cached --name-only
```

Expected: top-levelは`$composedWorktree`、HEADはこの文書を固定した後続ユーザー承認が名指すexact composed-plan commit、`HEAD^`は`3f70335f96d7fb14dceab7f6d3e2d4b71f07f98f`、stagingは空、tracked変更は既知draft一件だけ。drift時は現状を保存して停止し、修復操作をしない。

- [ ] **Step 2: approval captureとidentity固定済み/frozen bytesを再照合する。** まず`C=HEAD`、`O=HEAD:docs/superpowers/plans/2026-08-27-wave0a-approved-root-removal-addenda-composed-implementation.md`、`S=working-tree SHA-256`を再計算する。固定approval leafと親をcapture時と同じidentity-safe no-follow methodでreopenし、non-reparse、capture operationが返したimmutable receiptの`FileIdentity`、exact byte size、SHA-256へ一致させる。canonical JSONのclosed keys、`source:'codex_trusted_transcript_v1'`、同一`threadId`、三つのdistinct provider message IDs、roles/order、strict ordinal/time、各normalized bodyと再計算したUTF-8 SHA、`maxUses:1`、exact purpose、`mutationAuthority:false`を再検証する。announcementは上のapproval protocol item 1へ動的`C/O/S`を入れたliteralだけ、promptとuser approvalは同じ動的`C/O/S`を入れたapproval protocol item 2のliteral全体だけを受理し、provider-backed metadataと現task transcript observationを一致させる。missing leaf/receipt、identity・size・hash drift、wrong/extra key、prefix/suffix/second line、wrong role/thread/order/time、duplicate ID、assistant echo、caller-shaped transcript、plan identity crossingのいずれかなら`BLOCKED_PENDING_COMPOSED_PLAN_IMPLEMENTATION_APPROVAL`と具体的diagnosticを記録してR1へ進まない。続いてこの文書のblob/working-tree SHAを同じ`O/S`へ一致させ、次のexact identityを全て一致させる。

```powershell
$identityRows = @(
  @('86670e2b7a76c9f866270314c000e1da9a8a43c2', 'docs/superpowers/specs/2026-08-27-wave0a-root-path-contract-addendum-design.md', '700b539bab9c5740736af9a1b0432a80eaf82ce2', '8104d3e24b4fd826d450de0464db24880166c3795232cf74b488afe930c24c4d'),
  @('86670e2b7a76c9f866270314c000e1da9a8a43c2', 'docs/superpowers/plans/2026-08-27-wave0a-root-path-contract-addendum.md', '21d05822ec7c51d947a60beec1db27c7c93c4fac', 'c9bb9e2eaa4143b3b060d57b2bb7813e01928b461f5cfd8a56cf76cfa97d320d'),
  @('3f70335f96d7fb14dceab7f6d3e2d4b71f07f98f', 'docs/superpowers/specs/2026-08-27-wave0a-removal-cap-and-mutable-directory-identity-design.md', '74d2f02adf937123338dca91843635d10dfa8abe', '0b50db92aa59014226595b30a291a191feaa0f69a4229ce8ee7d45b2dea3a868'),
  @('f4a9023990cca2774f0e8ea57792d68b4ae9b1c2', 'docs/superpowers/plans/2026-08-23-feature-integration-program-index-and-wave-0a.md', '8822828c49c94e3aa4d6d3a5ea69527da0f7b8a7', 'da634d96eafe938d730ba2ab7f93fdeced1adb63c0f2bf2b7913330cda91d372'),
  @('819d6261d52d8dc7037d7fae8b852ad4b6a52e21', 'docs/superpowers/specs/2026-08-23-feature-selection-and-sequential-main-integration-design.md', 'ccf3f833e32f48e583a6c6fac4796fa30756e1a4', '709872ba8fa3188c666473248bf5196d1131672cfdec388929ecdb8c4c0292f5'),
  @('137faf0f8a42768af41421951cb8ac13d411fba2', 'tools/main-consolidation/wave0a-first-root-install-policy.json', 'c56127df580fbf3924e28c29ac0b752539c7ffd9', '5eec79895488e4629292883211cc71ec3eb0ec99145396e13fb93380e2d21f6c')
)
foreach ($identityRow in $identityRows) {
  $actualBlob = (& $composedGit rev-parse "$($identityRow[0]):$($identityRow[1])").Trim()
  if ($actualBlob -ne $identityRow[2]) { throw "Blob drift: $($identityRow[1])" }
  $actualSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $identityRow[1]).Hash.ToLowerInvariant()
  if ($actualSha256 -ne $identityRow[3]) { throw "SHA-256 drift: $($identityRow[1])" }
}
$programIndexSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath 'tools/main-consolidation/feature-integration-program-index.json').Hash.ToLowerInvariant()
if ($programIndexSha256 -ne '7840c3b81dd72051a89c858547683cd6697698905727b1e8658141ccd73f7e04') {
  throw 'Program index SHA-256 drift'
}
```

- [ ] **Step 3: legacy admitted payloadを監査する。** repository-owned fixture/recordsと、承認範囲にある全configured campaign evidence rootをbounded no-followでread-only監査する。`root-materialization-plan/v1` の `delete_empty_directory.expectedTarget` に mutable keysがある admitted bytes、または当該shapeを束縛した実行済み intent を発見したら `BLOCKED_PENDING_SCHEMA_VERSION_DECISION` で停止する。source test literalや未投入draftだけの旧shapeはR1のRED対象でありadmitted payloadに数えない。保護clone descendantや別workspaceを探索しない。

- [ ] **Step 4: draft保全値を記録する。** 次を実行してR1の開始checkpointへ添付する。

```powershell
Get-FileHash -Algorithm SHA256 'tools/main-consolidation/test/featureIntegrationCampaignPolicy.test.mjs'
& $composedGit diff --numstat -- 'tools/main-consolidation/test/featureIntegrationCampaignPolicy.test.mjs'
& $composedNode --check 'tools/main-consolidation/test/featureIntegrationCampaignPolicy.test.mjs'
& $composedGit diff --check
```

Expected: SHA-256 `17234f43c7c264ff4d0c2abf04158c666fd81a0c434f88fcf6c5d3e11e1b877d`、`290` added lines、syntax exit 0、diff-check exit 0。

## Task R1: Task 6A phase 2B の42 attachment policyを完成させる

**Files:** Modify: `tools/main-consolidation/featureIntegrationCampaignPolicy.mjs`; Modify existing draft: `tools/main-consolidation/test/featureIntegrationCampaignPolicy.test.mjs`. Do not modify `tools/main-consolidation/wave0a-first-root-install-policy.json`.

**Interfaces:** 既存 phase 2B APIを完成させる。

```js
getAttachmentSchemaRegistry()
validateAttachmentPayload(payload, { producer })
parseAttachmentBytes(bytes, { schemaVersion, producer, byteSize, sha256 })
buildAttachmentFixture(schemaVersion)
validateAttachmentByteSize(schemaVersion, byteSize)
validateRawCandidatePayload(bytes, ref, preservation)
validateRawCandidateByteSize(kind, byteSize)
buildFullArchivePreflightFixture()
validateFullArchivePreflightFixture(fixture)
decodeArchiveFixtureLiteral(index, compressedBytes)
```

上記は未完成だが元Task 6Aですでに計画済みのmodule exportであり、このphaseで実装する。これ以外のmodule export、product/CLI/public APIは追加しない。既存 `canonicalBytes(value, cap)`、`shape`、`check`、`define`、`defineValue`、`hash`、`pathEquals` を再利用し、一般 `canonicalJson()` の1 MiB上限を引き上げない。

- [ ] **Step 1: draftを保持したままREDを追加・確認する。** 42-schema corpus、3 raw candidates、archive literalの既存draftを残し、次のroot/removal専用test familyを追加する。

  - materialization root branchは `{ parentActionOrdinal:0, rootAnchor:'root_worktree' }` だけを持ち、`parentRelativePath` own propertyを拒否する。
  - descendant branchはpositive parent ordinalと非空`parentRelativePath`を持ち、`rootAnchor`を拒否する。
  - 全5 action kind、delete-directoryへの合法forward parent、cycle/file parent/missing parent/path/depth/order違反を固定する。
  - 独立した`A_EMPTY_MATERIALIZATION` positive variantは`actions:[]`、`actionCount:0`、`maxDepth:0`、`totalPathBytes:0`、`maxFileBytes:0`、`totalBlobBytes:'0'`、`chunkCount:0`、test-owned literalのempty action digestを持つ。canonical bytesとSHA-256の期待値をproduction fixture builderから生成せず固定し、未知fieldまたはzero aggregate crossingを拒否する。
  - removalはtarget/admin各一つの`owner_root`、root直下/nested、owner内path一意、両owner横断physical identity一意、別owner同一relativePath受理を固定する。
  - nine-row literalはordinals `1..9`、delete order `[5,2,3,4,1,7,8,9,6]` とし、`.git` / `gitdir` outer anchorを各一度含める。
  - `delete_empty_directory` はstable 5-key identityと`expectedEmptyAtDeleteOrdinal:true`を受理し、mutable/unknown keys、missing/false/null/undefined/string literal、action hash driftを拒否する。
  - capはsingle-file `4_294_967_295` / `4_294_967_296`受理、`4_294_967_297`拒否、multi-file `[4_294_967_295,1]`受理、`[4_294_967_296,1]`拒否、declared total不一致とnoncanonical decimal拒否を4 GiB bufferなしで検証する。
  - noncanonical decimalはleading zero、sign、空文字、whitespace、指数表記を個別に拒否する。entry count `16_383/16_384/16_385` とcanonical plan bytes `16_777_215/16_777_216/16_777_217` はaggregate capと独立に検証する。

  test名は少なくとも `campaign attachment: root-contract materialization root parent union`、`campaign attachment: root-contract accepts exact empty materialization plan`、`campaign attachment: root-contract removal root and descendant graph`、`campaign attachment: worktree removal total file bytes inclusive boundary`、`campaign attachment: worktree removal rejects noncanonical total file bytes`、`campaign attachment: delete empty directory uses stable identity and exact empty literal` とし、name-patternで個別再実行できるようにする。

```powershell
& $composedNode --check tools/main-consolidation/test/featureIntegrationCampaignPolicy.test.mjs
$priorPreference = $PSNativeCommandUseErrorActionPreference
try {
  $PSNativeCommandUseErrorActionPreference = $false
  & $composedNode --test --test-name-pattern '^campaign attachment:' tools/main-consolidation/test/featureIntegrationCampaignPolicy.test.mjs
  $redExit = $LASTEXITCODE
  if ($redExit -ne 1) { throw "Expected RED exit 1; actual=$redExit" }
} finally {
  $PSNativeCommandUseErrorActionPreference = $priorPreference
}
```

Expected: missing phase 2B production APIs/validatorsによるexit 1。root-only patternのskipを全体件数として報告しない。

- [ ] **Step 2: 非空fixtureと合法empty variantを独立固定する。** `A_MATERIALIZATION` はroot-level fileとnested directory/fileを持つ非空plan、別の`A_ALL_KIND_MATERIALIZATION`は全5 kindとdelete-directory親への合法forward referenceを持つ。`A_EMPTY_MATERIALIZATION`はStep 1のexact zero aggregatesとempty digestを持つ第三のpositive planとし、三者のcanonical bytes/SHA期待値をtest-owned literalで別々に固定する。`A_REMOVAL_PLAN` は次の9行を完全に持つ。

| ordinal | owner | scope | path | parent | kind | deleteOrdinal |
| ---: | --- | --- | --- | ---: | --- | ---: |
| 1 | target | owner_root | absent | absent | directory | 5 |
| 2 | target | descendant | `.git` | 0 | file | 2 |
| 3 | target | descendant | `package.json` | 0 | file | 3 |
| 4 | target | descendant | `src` | 0 | directory | 4 |
| 5 | target | descendant | `src/rule.md` | 4 | file | 1 |
| 6 | admin | owner_root | absent | absent | directory | 9 |
| 7 | admin | descendant | `HEAD` | 0 | file | 6 |
| 8 | admin | descendant | `gitdir` | 0 | file | 7 |
| 9 | admin | descendant | `index` | 0 | file | 8 |

`absent` はpayload valueではなくown property不在を表す。test expected bytes/hashはproduction fixture builderから生成せずtest-owned canonical helperで固定する。plan変更後の`A_REMOVAL_OBSERVATION.planSha256`も同じtest scopeで再計算する。

- [ ] **Step 3: closed root/descendant unionとgraphを実装する。** primitive/closed-key検証後、process-free selectorで次のbranchを選ぶ。

```js
function materializationParentSelector(action) {
  if (action.parentActionOrdinal === 0) {
    requireThat(action.rootAnchor === 'root_worktree', 'root materialization anchor')
    requireThat(!Object.hasOwn(action, 'parentRelativePath'), 'root parent path must be absent')
    return { kind: 'root_worktree' }
  }
  requireThat(Number.isSafeInteger(action.parentActionOrdinal) && action.parentActionOrdinal >= 1,
    'directory materialization parent ordinal')
  requireThat(!Object.hasOwn(action, 'rootAnchor') && Object.hasOwn(action, 'parentRelativePath'),
    'directory materialization parent fields')
  return { kind: 'directory_action', actionOrdinal: action.parentActionOrdinal }
}
```

root-parentを使うroot-level child actionは`repositoryPath===leaf`かつdepth 1。root自身のactionは作らない。正親は同planのdirectory actionのみで、path/leaf/depth/cycle/orderを再構築する。`totalPathBytes` は各actionの`repositoryPath`と、存在する`parentRelativePath`だけのUTF-8 byte lengthを各actionごとに合計する。root token、leaf、scratch leaf、absolute identity pathを加算しない。actions `16_384`、depth `256`、path bytes `67_108_864`、file bytes `1_073_741_824`、total blob bytes `17_179_869_184`、1 chunk `1_024` actions、chunks `16`、plan bytes `16_777_216` の各上限を独立に検証し、`actionsSha256`を完全action列から再導出する。removalも`owner_root`、descendant parent 0、positive descendant-directory parentの3 branchを別々に扱う。entries ordinal順とdeleteOrdinal prefixを別配列で検証する。

- [ ] **Step 4: exact cap導出を実装する。** safe-integer `entry.byteSize` を`Number`で合計せず、次のprivate helperをproducer、parser、fixture validatorの共通意味論に使う。

```js
const MAX_WORKTREE_REMOVAL_TOTAL_FILE_BYTES = 4_294_967_296n

function deriveWorktreeRemovalTotalFileBytes(entries) {
  let runningTotal = 0n
  for (const entry of entries) {
    if (entry.kind !== 'file') continue
    const byteSize = BigInt(entry.byteSize)
    requireThat(byteSize <= MAX_WORKTREE_REMOVAL_TOTAL_FILE_BYTES - runningTotal,
      'worktree removal total file byte cap')
    runningTotal += byteSize
  }
  return runningTotal.toString(10)
}
```

完全inventory内の同一physical identity aliasはowner横断も先に拒否する。directory/rootは0、outer `.git` / `gitdir` anchorは対応entryとidentity/size/hashを照合するだけで二重加算しない。外部hardlinkのlink-count規則は新設しない。16 MiB plan、16,384 entries、depth 256、1,024-entry chunk、16 progress/ack上限を独立検証する。

- [ ] **Step 5: delete-directory armをclosed stable identityへ置換する。** exact own-key shapeを次に固定する。

```js
{
  kind: 'delete_empty_directory',
  sourceTreeOid,
  expectedTarget: { canonicalPath, dev, ino, attributes, reparseTag: '0' },
  expectedEmptyAtDeleteOrdinal: true
}
```

`expectedTarget` は既存`DirectoryHandleIdentity` validatorを使う。`sourceTreeOid`、初期root snapshot、完全B→M graphは維持し、`actionsSha256`を新armを含む全actionsのcanonical bytesから再導出する。

- [ ] **Step 6: phase 2B全体をGREENにする。** root/removalだけで完了とせず、42 attachments、3 raw candidates、schema producer、canonical bytes、SHA、byte caps、semantic correlations、full archive fixtureを全て完成させる。

```powershell
& $composedNode --check tools/main-consolidation/featureIntegrationCampaignPolicy.mjs
& $composedNode --check tools/main-consolidation/test/featureIntegrationCampaignPolicy.test.mjs
& $composedNode --test tools/main-consolidation/test/featureIntegrationProgramPolicy.test.mjs tools/main-consolidation/test/create-feature-integration-program-index.test.mjs tools/main-consolidation/test/featureIntegrationCampaignPolicy.test.mjs scripts/three-extension-documentation-contract.test.js
& $composedGit diff --check
```

Expected: exit 0、対象全pass、top-level skip 0。実測件数を記録し、過去件数を転記しない。

- [ ] **Step 7: 二段階レビューと限定commitを行う。** spec reviewerは両追補/凍結計画との適合、code-quality reviewerはclosed keys、BigInt overflow order、accessor/canonical safety、fixture独立性を確認する。指摘修正後に全GREENを再実行し、二fileだけをstageする。

```powershell
& $composedGit diff --name-only
& $composedGit add -- tools/main-consolidation/featureIntegrationCampaignPolicy.mjs tools/main-consolidation/test/featureIntegrationCampaignPolicy.test.mjs
& $composedGit diff --cached --name-only
& $composedGit diff --cached --check
& $composedGit commit -m "feat: validate campaign evidence attachments"
& $composedGit show --stat --oneline --decorate HEAD
```

Expected: commitにpolicy/testの二fileだけを含む。Task 6A phase 2CとTask 6A全体reviewを飛ばさない。

## Task 1: 凍結済みdependency corridorをR2まで進める

**Files:** この合成計画固有の変更なし。元計画が各taskに割り当てたowned filesだけを、各taskの別plan/checkpointで変更する。

**Interfaces:** R1 exact reviewed commitを元Task 6A phase 2Cへ返し、`6A -> 1C -> 2 -> 3A -> 3B -> 4A -> 4B -> 5A -> 6E` のpredecessor evidenceを順に生成する。

- [ ] **Step 1: Task 6Aを閉じる。** phase 2C、aggregate test、fresh final review、exact commit/evidenceを元計画どおり完了する。R1 commitだけをTask 6A completionと扱わない。

- [ ] **Step 2: 1Cから5Aを順番に実行する。** 各taskのapproval、RED/GREEN、review、commit、checkpointを元計画のexact orderで完了する。失敗やdriftは当該taskで停止し、R2を先行作成しない。

- [ ] **Step 3: Task 6E開始条件を照合する。** R1と全predecessor exact commits、Task 6A shared attachment validator、native capability test用disposable volumeを確認する。現在不在のTask 6E filesは元Task 6Eで新規作成し、R2だけを現在のtreeへ先行追加しない。

## Task R2: 元Task 6EでWindows native consumerを実装する

**Files:** Create within original Task 6E: `tools/main-consolidation/wave0a-windows-native.ps1`; Create test: `tools/main-consolidation/test/wave0a-windows-native.test.mjs`. Task 6Eの他filesは元計画のowned stepsで作成し、この追補を理由に変更範囲を広げない。

**Interfaces:** 既存の列挙済み9 mode、`inspect-path`、`run-job`、`publish-operation-no-spawn-fence`、`prove-operation-supervisor-terminated`、`recover-operation-publication-exact`、`prove-campaign-publisher-terminated`、`remove-generated-paths-exact`、`materialize-root-exact`、`remove-worktree-exact`をclosed source gateとする。そのうち後二つがcampaign intent、campaign-owned plan、derived progress root、fresh payload/output rootだけを受ける。caller argvは次の二形に固定し、start/count/chunk/ordinal/action/scratch leaf/identityを追加しない。

```text
materialize-root-exact --intent INTENT --plan PLAN --progress-root PROGRESS_ROOT --payload-root PAYLOAD_ROOT --output-root OUTPUT_ROOT
remove-worktree-exact --intent INTENT --plan PLAN --progress-root PROGRESS_ROOT --output-root OUTPUT_ROOT
```

上の大文字tokenはschema上の位置を示し、実行時にはTask 6Gが認証済みcanonical absolute pathを各一要素として渡す。新mode、CLI、launcher、caller-selected rangeを追加しない。

- [ ] **Step 1: native RED fixtureを作る。** disposable volume上の実linked-worktree fixtureでtarget/adminの完全inventoryを生成し、`commondir`、logs、`.git`、`gitdir`、root/root直下/nestedを含める。synthetic nine-row fixtureを実Git inventoryの代用にしない。物理fixtureのentry数を`N`として`P=0..N`の全prefix、`.git`/`gitdir`前後、target root前後、admin root前後を固定し、pure fixtureではdelete order `[5,2,3,4,1,7,8,9,6]` がentries sliceと異なることを固定する。native crash matrixは各該当prefixで`child disposition`直前/直後、parentのexact-empty enumeration/check直前/直後、`parent disposition`直前/直後の6 injection pointを独立fixtureにする。disposition直前は同じ`P`から一度だけ適用し、child/parent disposition直後はfilesystem observationから`P+1`を再構成して同じobjectを再dispositionしない。empty check直前/直後とparent disposition直前はいずれもparent action未適用の同じ`P`であり、recovery processがsame stable objectを再openして完全空を再確認してから一度だけparent dispositionする。

  test名は少なくとも `wave0a native: helper mode set is exactly the approved nine modes`、`wave0a native: removal progress follows delete ordinal prefix`、`wave0a native: removal crash matrix resumes exact prefix without duplicate disposition`、`wave0a native: directory replacement stops with zero next dispositions`、`wave0a native: delete empty directory holds one object through child removal and disposition`、`wave0a native: removal cap boundaries reject before first disposition` とする。10個目、alias、cross-mode flagをsource gateで拒否する。

```powershell
& $composedNode --test tools/main-consolidation/test/wave0a-windows-native.test.mjs
```

Expected: helper不在または旧mandatory-path parserによるexit 1。対象repository/保護cloneをfixtureに使わず、外部sentinel bytesを記録する。

- [ ] **Step 2: 六つのheld-parent branchを実装する。** closed plan検証後に次だけを選ぶ。

| branch | held parent | validated leaf |
| --- | --- | --- |
| materialization parent 0 | `rootWorktree` | `action.leaf`、root-level path一致 |
| materialization positive parent | directory-action handle | graphから再構築 |
| removal target owner_root | `featureParent` | `featureRootLeaf` |
| removal admin owner_root | `adminParent` | `adminRootLeaf` |
| removal descendant parent 0 | same-owner root | entry path一致 |
| removal positive parent | same-owner descendant-directory | graphから再構築 |

`NtOpenFile` / `NtCreateFile`へ渡すのはheld immediate-parent handleと検証済みsingle leafだけ。削除対象handleは元計画どおり要求accessとshare exactly `FILE_SHARE_READ`で保持する。root handleを自分の親にせず、外部親を削除しない。absolute/composite path、recursive string delete、`git worktree remove`、mutating prune、ignore-readonly、fallbackを禁止する。

- [ ] **Step 3: same-handle directory lifecycleを実装する。** existing directoryをrootから`FILE_OPEN_REPARSE_POINT`付きno-followで開く。fileは`FILE_READ_DATA|FILE_READ_ATTRIBUTES|DELETE|SYNCHRONIZE`、directoryは`FILE_LIST_DIRECTORY|FILE_READ_ATTRIBUTES|DELETE|SYNCHRONIZE`、planned-node shareはexactly `FILE_SHARE_READ`とする。stable identity、parent-leaf mapping、初期member集合を確認し、最初のdescendant accessからdirectory dispositionまで同じheld handleを保持する。各prefixでremaining child集合を同じhandleからexact enumerationし、action ordinalで完全空を確認した場合だけ同じhandleへ`FileDispositionInformationEx(FILE_DISPOSITION_DELETE|FILE_DISPOSITION_POSIX_SEMANTICS)`を適用する。mutable timestamps/tree hashを比較せず、stable attributes/reparse/device/inode/canonical handle pathは完全一致を要求する。

  最初のmutation前にexact B filesystem、index/clean tracked-untracked-ignored policy、`FeatureAndRootWorktreeRegistryFence`、root/admin `HEAD`、linked `.git` / admin `gitdir` backpointer bytes/identity、release/CWD/control-file boundariesを再検証し、deny-write/delete fenceを保持する。progressとfilesystem absenceは`deleteOrdinal`のcontiguous prefix `1..P`であり、root-first `entries.slice(0,P)`ではない。

- [ ] **Step 4: crash recoveryをexact prefixへ閉じる。** durable progressと欠落actionsは`1..P`だけを許可する。新processはremaining directoryをplan-bound parent chainから再openし、同じstable identityとprefix時点の残存child集合を検証する。OS handleがcrashを跨ぐとは主張しない。Step 1の6 injection pointを全て実行し、child/parent disposition後またはaction後/progress前だけはplan/action hashとfilesystem prefixから完了ordinal`P+1`を再構成する。disposition前とempty check前/後はaction未適用の`P`を維持し、empty observationをdurable authorityにせず同じhandle lifecycleを新processで再構築して再確認する。削除済みordinal/objectは再open・再dispositionせず、gap・別prefix・別plan/intentへ進まない。

- [ ] **Step 5: capとraceをnative entry/disposition前に検証する。** native entryはimmutable full planの全file rowsからBigInt相当で合計を再導出し、4 GiB超過、declared total不一致、alias、plan/hash/cap違反をfirst disposition前に拒否する。Task 6G側のpre-spawn拒否はR3で別に固定する。recoveryでも全planの宣言値を合計し、live size/hash/identityはremaining suffixだけを照合する。

  race fixtureはparent/root/ancestor/leaf replacement、reparse、unexpected child、readonly/share violation、同一identity別owner、nonempty-at-ordinalを注入し、次のdisposition 0件とsentinel不変を要求する。entry `16_383/16_384/16_385`、depth `255/256/257`、1,024境界、canonical plan byte境界をcap testと独立に覆う。4 GiB fileは確保せずmetadata/injected bounded readerで境界を作る。

- [ ] **Step 6: real Windows capabilityとTask 6E全体をGREENにする。** Windows 10 1709 build 16299 / Server 2019 build 17763以上で`PROC_THREAD_ATTRIBUTE_JOB_LIST`、`FileDispositionInformationEx`、handle-relative no-replace rename、同一handle file/empty-directory dispositionを実測する。能力不足なら`BLOCKED_PENDING_WINDOWS_NATIVE_CAPABILITY`で停止する。

```powershell
& $composedNode --test tools/main-consolidation/test/boundedNativeProcess.test.mjs tools/main-consolidation/test/wave0a-bootstrap.test.mjs tools/main-consolidation/test/wave0a-stage-minus-one.test.mjs tools/main-consolidation/test/run-wave0a-host.test.mjs tools/main-consolidation/test/wave0a-windows-native.test.mjs
& $composedNode --test tools/main-consolidation/test/boundedNativeProcess.test.mjs tools/main-consolidation/test/wave0a-bootstrap.test.mjs tools/main-consolidation/test/wave0a-stage-minus-one.test.mjs tools/main-consolidation/test/run-wave0a-host.test.mjs tools/main-consolidation/test/wave0a-windows-native.test.mjs
& $composedNode --test tools/main-consolidation/test/featureIntegrationCampaignPolicy.test.mjs tools/main-consolidation/test/wave0a-windows-native.test.mjs
& $composedGit diff --check
```

Expected: two consecutive native-suite passes、portable fallback/Ubuntu skipなし、sentinel不変。

- [ ] **Step 7: fresh reviewと元Task 6E commit境界を守る。** reviewerは9-mode source gate、held-parent/same-handle/share/no-follow/prefix/cap、caller argvを確認する。R2のowned two-file diffを元Task 6E native sliceのcommitだけに含め、Task 6Eの別sliceを混在させない。

```powershell
& $composedGit add -- tools/main-consolidation/wave0a-windows-native.ps1 tools/main-consolidation/test/wave0a-windows-native.test.mjs
& $composedGit diff --cached --name-only
& $composedGit diff --cached --check
& $composedGit commit -m "feat: add Wave 0A Windows process boundary"
& $composedGit show --stat --oneline --decorate HEAD
```

Expected: review修正後にStep 6を再実行済みで、staged/committed pathsは上記二fileだけ。

## Task 2: 凍結済みdependency corridorをR3まで進める

**Files:** この合成計画による新規pathは追加しない。元計画の `5B -> 6B -> 6C -> 6D -> 6F -> 6G` owned filesのみを使い、Task 6Cでは予定済みの `tools/main-consolidation/wave0a-local-gates.json` と `tools/main-consolidation/test/wave0aLocalGatePolicy.test.mjs` に81-path closed arrayとliteral assertionsを実装する。

**Interfaces:** Task 6E exact reviewed commitから、Task 6B aggregate publication、Task 6F recovery/checkpoint consumerを含むpredecessor evidenceをR3へ渡す。

- [ ] **Step 1: 5Bから6Fを順に完了する。** Task 6Bはvalidated planをfinal aggregate preconditionとしてrequest/intentと同一transactionでのみ公開し、失敗時にplan/request/intentの部分公開をしない。Task 6Cは凍結済み75 pathsへSupersession Matrixのsort済みexact 6 pathsだけを加え、`allowedChangedPaths.length === 81`、ordinal sort、重複なし、`git diff --name-only B...H`とのbyte-for-byte一致をpolicy testで固定する。75のまま、80、82、追加6件の欠落・順序違反・余分なpath、globまたはdirectory-prefix許可はすべてREDにする。Task 6Fはshared schema/hashを再利用し、新attachment/approvalを作らない。

- [ ] **Step 2: Task 6G開始条件を照合する。** R1/R2 exact commits、Task 6B reserve transaction、Task 6F checkpoint/recovery、authenticated `VerifiedHandoff`、exact `B/M`、held B filesystem、native inspectorを確認する。現在不在のR3 filesは元Task 6Gで新規作成し、先行stubを作らない。

## Task R3: 元Task 6Gで唯一のproducer、runner、recoveryを実装する

**Files:** Addendum-owned R3 files are Create: `tools/main-consolidation/wave0aMutationPolicy.mjs`; Create: `tools/main-consolidation/run-wave0a-mutation.mjs`; Create tests: `tools/main-consolidation/test/wave0aMutationPolicy.test.mjs`, `tools/main-consolidation/test/run-wave0a-mutation.test.mjs`. Inherited original Task 6G files are Create: `tools/main-consolidation/wave0a-mutations.json` in the policy slice; Create: `tools/main-consolidation/wave0a-tool-bundle.json`, `tools/main-consolidation/run-wave0a-operator.ps1`, `tools/main-consolidation/test/run-wave0a-operator.test.mjs` in the separate operator slice. The three commit boundaries remain separate.

**Interfaces:** policy moduleの公開boundaryとrunnerのprivate controller boundaryを分ける。

```text
buildWave0aMutation({ operationId, verifiedHandoff, topology, evidence })
assessWave0aMutationResult({ request, intent, processResult, postObservation })
runWave0aSupervisedOperation(request: Wave0aSupervisedOperationRequest): Promise<VerifiedNativeOutput<Wave0aSupervisedOperationResult>>
buildTerminationProofReservation(request: TerminationProofReservationBuildRequest): TerminationProofReservationBuildResult
recoverOperationPublication(request: OperationPublicationRecoveryRequest): Promise<VerifiedNativeOutput<OperationPublicationRecoveryResult>>
```

後三つはexport/CLIにせず`run-wave0a-mutation.mjs`内部だけから到達可能にする。

- [ ] **Step 1: producer/runner REDを追加する。** root-level/nested/全5 kind、forward deleted-parent、two-owner complete removal、root delete prefix、stable delete-directory arm、cap boundaries、zero-intent overflow、claim/spawn再検証、crash suffixをtest-owned Git tree/native inventory fixtureで固定する。orchestration crash matrixはack publication、progress publication、native result publication、mutation receipt publicationの各直前/直後を個別に注入し、同一intent/plan/action-range/rolling-prefix digestだけをreopenできることを固定する。

  test名は少なくとも `wave0a mutation: root materialization emits the closed root-parent union`、`wave0a mutation: removal overflow rejects before intent claim and spawn`、`wave0a mutation: claim revalidates the full immutable removal plan`、`wave0a mutation: removal recovery resumes only the exact suffix`、`wave0a mutation: removal crash matrix covers ack progress result and receipt boundaries`、`wave0a mutation: complete 5384-file removal fixture retains positive headroom` とする。

```powershell
& $composedNode --test tools/main-consolidation/test/wave0aMutationPolicy.test.mjs
& $composedNode --test tools/main-consolidation/test/run-wave0a-mutation.test.mjs
```

Expected: producer/runner未実装によるexit 1。

- [ ] **Step 2: root materialization producerを一意にする。** authenticated `VerifiedHandoff`、exact `B/M` tree、held B filesystemからcomplete union diffを導出する。root actionは作らず、root-level actionは次だけを持つ。

```js
{ parentActionOrdinal: 0, rootAnchor: 'root_worktree' }
```

descendantはpositive parentとnonempty `parentRelativePath`。全actionsのsource/target OID、mode、size/hash、root/registry fence、initial B member集合を照合し、`validateAttachmentPayload(plan,{producer:'6G'})`を通してからTask 6Bへ渡す。`delete_empty_directory`は同じno-follow handleからstable identityを採り、mutable snapshotをplan fieldへ保存しない。

- [ ] **Step 3: worktree removal producerを一意にする。** reviewed no-follow inspectorでintent直前にtarget/adminの完全inventoryを列挙し、各owner root row、`.git`、`gitdir`、admin control filesを含める。entriesはtarget root、target relative path unsigned UTF-8順、admin root、admin relative path順でstable ordinalを与える。deleteOrdinalはtarget descendants deepest-first、target root、admin descendants deepest-first、admin rootの連続列にし、root rowsをentry count、tuple hash、plan hash、progress prefixへ含める。identity uniqueness確認後、各fileで次の順を守る。

```js
if (byteSize > MAX_WORKTREE_REMOVAL_TOTAL_FILE_BYTES - runningTotal) {
  throw new TypeError('worktree removal total file byte cap')
}
runningTotal += byteSize
```

overflow判定は当該fileのcontent read/hash、plan serialization、publicationより前。全entry確定後にcanonical decimal total、tuple SHA、plan bytesを再検証する。外側anchorを二重加算せず、caller値を受理しない。overflowは既存のcheckpointed nonterminal integrity stopに留まり、cap引上げ、partial plan/removal、fallbackへ進まない。

- [ ] **Step 4: aggregate publicationとprecondition ordinalを固定する。** Task 6Bだけが内部生成planをfinal preconditionとしてatomic reserveする。root materializationはsuccess `0004` / checkpoint failure `0005`、worktree removalはsuccess `0003` / checkpoint failure `0004`。plan/request/intentの部分公開、caller-supplied plan path/hash、overflow時intent/claim/spawnを拒否する。

- [ ] **Step 5: claim/spawn/recoveryでfull immutable planを再検証する。** campaign-owned planをreopenし、全plan entriesのsum/cap/hash/schemaを再導出してからclaim/spawnする。live filesystem照合はremaining suffixのみ。Step 1のack/progress/result/receipt各直前/直後crashを全て実行し、未公開memberだけを同じreserved ordinalへ一度だけ公開する。after側は既存memberをno-follow reopen/hashしてadoptし、native helperまたは既適用dispositionを再spawnせず、同じintent/planのcontiguous suffixだけを再開する。plan再生成・置換、mutable expectedTarget更新、既削除ordinal再実行、別prefix/別receiptへのforkを禁止する。

- [ ] **Step 6: real 5,384-file fixtureを固定する。** complete repository fixtureからtarget/admin全inventoryを省略せずplan化し、実測`totalFileBytes`、4 GiBまでのpositive headroom、entry/depth/plan/campaign capsを同時に記録する。Git blob合計をcampaign authorityと呼ばず、最終Hのintent前planを権威とする。

- [ ] **Step 7: 元Task 6G全契約と横断consumerをGREENにする。** root/removalだけでなく、15 operations、20-node cumulative execution DAG v2、serialization roster/evidence projection、exact CLI argv/stdin/environment/source gates、tool-bundle、operator six-mode matrix、`success/failure/timeout/signal/overflow`の全process outcomes、no-replay recoveryを元のTask 6Gどおり完成させる。operator slice開始時は`run-wave0a-operator.test.mjs`を一度実行し、tool-bundle/operator不在によるexit 1を確認してから、その三fileだけを実装する。manage-campaign/native/Task 6B consumerを含める。

```powershell
& $composedNode --check tools/main-consolidation/wave0aMutationPolicy.mjs
& $composedNode --check tools/main-consolidation/run-wave0a-mutation.mjs
& $composedNode --test tools/main-consolidation/test/run-wave0a-operator.test.mjs
& $composedNode --test tools/main-consolidation/test/run-wave0a-operator.test.mjs
& $composedNode --test tools/main-consolidation/test/featureIntegrationCampaignPolicy.test.mjs tools/main-consolidation/test/wave0aMutationPolicy.test.mjs tools/main-consolidation/test/run-wave0a-mutation.test.mjs tools/main-consolidation/test/run-wave0a-operator.test.mjs tools/main-consolidation/test/manage-feature-integration-campaign.test.mjs tools/main-consolidation/test/wave0a-windows-native.test.mjs
& $composedGit diff --check
```

Expected: exit 0、全対象pass、root/removal以外のoperationをstub化しない。

- [ ] **Step 8: 元Task 6Gの三commit境界でレビューする。** fresh reviewと再GREENの後、policyとrunnerを別々にstage/commitする。

```powershell
& $composedGit add -- tools/main-consolidation/wave0a-mutations.json tools/main-consolidation/wave0aMutationPolicy.mjs tools/main-consolidation/test/wave0aMutationPolicy.test.mjs
& $composedGit diff --cached --name-only
& $composedGit diff --cached --check
& $composedGit commit -m "feat: define Wave 0A mutation policy"
& $composedGit show --stat --oneline --decorate HEAD

& $composedGit add -- tools/main-consolidation/run-wave0a-mutation.mjs tools/main-consolidation/test/run-wave0a-mutation.test.mjs
& $composedGit diff --cached --name-only
& $composedGit diff --cached --check
& $composedGit commit -m "feat: execute bounded Wave 0A mutations"
& $composedGit show --stat --oneline --decorate HEAD

& $composedGit add -- tools/main-consolidation/wave0a-tool-bundle.json tools/main-consolidation/run-wave0a-operator.ps1 tools/main-consolidation/test/run-wave0a-operator.test.mjs
& $composedGit diff --cached --name-only
& $composedGit diff --cached --check
& $composedGit commit -m "feat: orchestrate authenticated Wave 0A operations"
& $composedGit show --stat --oneline --decorate HEAD
```

各commitはreview修正後にStep 7を再実行し、exact pathsだけを含み、Critical 0 / Important 0を記録する。

## Task R4: Task 6Hまでの横断acceptanceとfinal-H再検証を行う

**Files:** 元計画のTask 6B/6C/6F/6Hとfinal-review/candidate evidenceのowned pathsだけ。新production schema/attachmentは追加しない。

**Interfaces:** R1/R2/R3 exact commitsと全predecessor evidenceを入力とし、portable/local gate、real-Windows native gate、independent review、exact-final-H evidenceを出力する。remote mutation authorityは出力しない。

- [ ] **Step 1: shared bytesをconsumer間で照合する。** Task 6A fixture、Task 6G producer、Task 6B final precondition、Task 6E native input、Task 6F checkpoint/recovery、Task 6H archive/candidate evidenceでschema literal、canonical plan bytes、plan SHA、tuple/actions SHA、derived total、prefix digestがbyte-identicalであることを固定する。

- [ ] **Step 2: complete portable gatesを実行する。** 凍結計画Task 6Cのcommitted closed command contractをexact candidate Hで実行する。`wave0a-local-gates.json` の `allowedChangedPaths` はSupersession Matrixどおりexact 81 pathsでなければならず、policy testは凍結75件と追加6件のliteral集合・sort順・重複なし・`B...H`差分の完全一致を独立に再計算する。これはrootの14-script test、exact-head/pin check二本、main-consolidationの28-test aggregate、scaffold 4 npm commands、Workflow Register 11 npm commands、Bazaar 14 npm commands、Code Consistency 10 npm commands、read-only Git observationsを契約順で全て含む。Task 6Hのlifecycle policy/CLI testsも実行し、実測command/exit/pass/skipを記録する。focused subsetを代用しない。

- [ ] **Step 3: real-Windows destructive-capability fixtureを再実行する。** disposable repository/volumeだけでsame-handle file/empty-directory disposition、root materialization、complete worktree removal、crash prefixes、external sentinel不変を確認する。Windows capabilityと5,384-file capacityの両方を満たさなければcandidate readyを主張しない。

- [ ] **Step 4: independent final reviewを行う。** reviewerへ両承認identity、凍結文書、R1/R2/R3 exact commits、full diff、RED/GREEN/native/cap/capacity evidenceを渡す。Critical/Importantを修正し、全affected gatesを再実行する。

- [ ] **Step 5: Task 7/8B static contractとexact-final-Hを再固定する。** Task 7のproduction-fileなしstatic/portable testsで、6C/6D/6F/6G/6H evidence、final `B/H/tree`、Task 6I final-H control authority、lifecycle acceptance、campaign approvalが全て揃った場合だけLOCAL handoff tripleを作れることを検証する。このR4では実LOCAL handoff tripleを生成しない。Task 8Bもportable/native contract fixtureで`M^1=B`、`M^2=H`、`tree(M)=tree(H)`、four dispatches、MAIN_ONLY、held-handle cleanupを検証するだけで、live Task 7/8Bは各別approval前に実行しない。final H/tree、all commits、archive hashes、Program index、protected clone identity、draft lineage、main/origin main不変、remote/PR未変更を区別して記録し、identity固定済み/frozen docsとfirst-root assetのhash不変を再照合する。

- [ ] **Step 6: 実装完了で停止する。** この計画の完了はlocal implementation/candidate evidenceまでであり、control-authority provisioning、disposable GitHub lifecycle、campaign execution、main/remote/PR mutation、branch/worktree cleanupを許可しない。後続は凍結計画が要求する別request-hash approvalを取得する。

## Completion Evidence Checklist

- [ ] Task 0の全identityとdraft checkpointが一致した。
- [ ] R1は42 attachments / 3 raw candidates / root-removal contractsを完成し、二file限定commitになった。
- [ ] R1は非空root/all-kind materializationとは独立した合法empty-actions planのcanonical bytes/SHAを受理した。
- [ ] R2は元Task 6E到達時だけ実施され、9-mode native boundary、same-handle、4 GiB、crash prefixを実Windowsで通した。
- [ ] R3は元Task 6G到達時だけ実施され、唯一のproducer、atomic publication、claim/spawn/recovery再検証、5,384-file fixtureを通した。
- [ ] R2/R3のcrash matrixはchild disposition、parent empty check、parent disposition、ack、progress、result、receiptの各直前/直後を覆い、duplicate disposition/spawn/publicationなしで同一exact prefixだけを再開した。
- [ ] Task 6B/6F/6H consumerは新schema/attachmentなしでshared bytesを一致させた。
- [ ] Task 6Cの`allowedChangedPaths`は凍結75件とSupersession Matrixのexact 6件から成るsort済み81件だけで、`git diff --name-only B...H`とbyte-for-byte一致した。
- [ ] portable/full/native/final review gatesがexact Hで成功した。
- [ ] approved/frozen docs、Program index、first-root asset、protected clone、external sentinelは不変だった。
- [ ] main/origin main、remote、PR、現在のproject/protected/campaign branch・worktree、campaign authority、artifactには未承認mutationがなかった。計画内で明示したbounded disposable fixtureだけは作成・破棄範囲とsentinel不変を証跡化した。

## Plan Authoring Closure

この文書自体は実装承認前に次の文書限定gateで固定する。

```powershell
$composedWorktree = 'C:/Users/stell/source/repos/bob_builtin_analyze/.worktrees/feature-integration-selection-design'
$composedNode = (Get-Command node.exe -ErrorAction Stop).Source
$composedGit = (Get-Command git.exe -ErrorAction Stop).Source
Set-Location -LiteralPath $composedWorktree
if ((& $composedGit rev-parse HEAD).Trim() -ne '3f70335f96d7fb14dceab7f6d3e2d4b71f07f98f') { throw 'Unexpected pre-plan HEAD' }
if (@(& $composedGit diff --cached --name-only).Count -ne 0) { throw 'Pre-plan staging is not empty' }
& $composedNode --test scripts/three-extension-documentation-contract.test.js
& $composedGit diff --check
Get-FileHash -Algorithm SHA256 'tools/main-consolidation/test/featureIntegrationCampaignPolicy.test.mjs'
& $composedGit add -- docs/superpowers/plans/2026-08-27-wave0a-approved-root-removal-addenda-composed-implementation.md
& $composedGit diff --cached --name-only
& $composedGit diff --cached --check
& $composedGit commit -m "docs: compose approved Wave 0A addenda plan"
& $composedGit show --stat --oneline --decorate HEAD
& $composedGit status --short
```

Expected: documentation tests/diff-checkはexit 0、commit前のcached pathはこのplan一件だけ、commit後の`HEAD^`は`3f70335f96d7fb14dceab7f6d3e2d4b71f07f98f`、未commit変更は元のdraft一件だけでSHA-256 `17234f43c7c264ff4d0c2abf04158c666fd81a0c434f88fcf6c5d3e11e1b877d`。その後にcommit/blob/SHA-256を再計算し、上の三message protocolを別messageから開始する。

## Execution Handoff

この計画自身を文書限定commitへ固定し、commit/blob/SHA-256をユーザーが明示承認した後にだけTask 0/R1を開始する。実行方式は次のいずれかとする。

1. **Subagent-Driven（推奨）:** 現sessionでtaskごとにfresh implementerと二段階reviewerを起動し、各checkpointでexact diff/test/commitを確認する。
2. **Inline Execution:** 同sessionの主agentがtaskを逐次実装し、独立reviewだけをfresh subagentへ委譲する。

どちらを選んでもR2/R3を依存taskより前へ移動せず、Task 0または各stop conditionで停止する。
