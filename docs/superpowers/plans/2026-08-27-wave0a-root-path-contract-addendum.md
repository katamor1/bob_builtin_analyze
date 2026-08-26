# Wave 0A Root Path Contract Addendum Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 元の非空相対パス規則を維持し、root materialization と worktree removal のルート境界を一意に表現・検証できるようにする。

**Architecture:** 二つの既存 attachment の nested type を閉じた root/descendant union に訂正する。Task 6A の純粋 validator と独立 literal fixture を先に固定し、元の依存順で Task 6E の Windows native consumer、Task 6G の唯一の producer に同一契約を適用する。ルート選択を疑似 path へ変換せず、既存の held-parent + single-leaf 操作を維持する。

**Tech Stack:** Node.js ESM / built-in `node:test` / built-in crypto、PowerShell 7、既存計画の Windows no-follow handle primitive。新規 dependency なし。

**Spec:** `docs/superpowers/specs/2026-08-27-wave0a-root-path-contract-addendum-design.md`。本計画と同一のローカル commit に固定し、両文書の blob/SHA-256 を承認対象として提示する。

## Global Constraints

- Addendum ID: `WAVE0A-ROOT-PATH-CONTRACT-ADDENDUM-V1`。状態は文書作成のみ承認済み、設計変更・実装再開は別途承認待ち。
- 元計画 commit `f4a9023990cca2774f0e8ea57792d68b4ae9b1c2`、blob `8822828c49c94e3aa4d6d3a5ea69527da0f7b8a7`、SHA-256 `da634d96eafe938d730ba2ab7f93fdeced1adb63c0f2bf2b7913330cda91d372` の原本 bytes を変更しない。
- 元設計 commit `819d6261d52d8dc7037d7fae8b852ad4b6a52e21`、blob `ccf3f833e32f48e583a6c6fac4796fa30756e1a4`、SHA-256 `709872ba8fa3188c666473248bf5196d1131672cfdec388929ecdb8c4c0292f5` の原本 bytes を変更しない。
- 元計画の Global Constraints と全承認境界を継承する。追補の優先範囲は設計書 3-5 節に明記した型・root graph・順序・集計のみ。
- `SafeRepositoryPath` / `SafeRelativePath` は 1..4096 UTF-8 bytes、canonical forward-slash relative path、空 segment / `.` / `..` / backslash / colon / control / NUL を禁止する。
- `?: never` は own property の不存在。null、undefined、空文字、dot、未知 field、暗黙の root token を受理しない。
- schema literal、42-schema registry、15-operation roster、20-node DAG、21 evidence-contract rows、public CLI、authority schema、Program index、first-root policy は変更しない。
- `owner_root` は target/admin 各1行、directory、depth 0。descendant は depth 1..256。root 行も 16,384-entry cap と全 hash / journal に含める。
- materialization は root 自身の action を作らず、root-level action は depth 1。親 graph の forward reference を許すが、cycle と不正な依存順を拒否する。
- native 操作は保持済み immediate-parent handle と single safe leaf のみ。recursive string delete、Git worktree remove、mutating prune、fallback を追加しない。
- branch `codex/feature-integration-selection-design` の既存 worktree を使用し、承認後も表の所有 file に変更を限る。root/main、remote、PR、archive、保護 clone、旧 VSIX、他 worktree と worktree 登録構成を変更・削除しない。
- 本計画の作成完了は実装完了ではない。全体の残る Task 6A/後続工程と final-`H` gate を省略しない。

---

## 1. 再開 checkpoint と作業範囲

作業先は `C:/Users/stell/source/repos/bob_builtin_analyze/.worktrees/feature-integration-selection-design`。追補作成前の HEAD は `b7add4940c0ee41957cbe6addd30bf7ef4703d64`。Task 1A/1B と Task 6A phase 2A はレビュー済みだが、phase 2B は未実装で停止している。

停止中の唯一の tracked draft は `tools/main-consolidation/test/featureIntegrationCampaignPolicy.test.mjs` の +290 行、SHA-256 `17234f43c7c264ff4d0c2abf04158c666fd81a0c434f88fcf6c5d3e11e1b877d`。342 RED は未実装 API による初回観測であり、fixture の妥当性や phase 2B 全体の完成を示さない。追補作成中はこの draft を変更・stage・commit しない。承認後は履歴を保持して続きを編集し、破棄・復元しない。

local main と `origin/main` の追跡 ref は確認時点で `c59db06ecb32eb7a57beeb3e932acdd5b4774de5`。これは live remote の新規確認ではない。Program index SHA-256 は `7840c3b81dd72051a89c858547683cd6697698905727b1e8658141ccd73f7e04`。

再開担当は `.superpowers/sdd/2026-08-23-feature-integration-program-index-and-wave-0a/` の `progress.md`、`wave0a-local-implementation-handoff-2026-08-27.md`、`task-6A-context.md`、`task-6A-root-parent-contract-check.md` を読んでから、元計画の該当 task と両追補を読む。元の承認 capture を再実行しない。

| 追補 task | 適用時点 | 所有する変更 file |
| --- | --- | --- |
| R1 | Task 6A phase 2B の再開時 | `tools/main-consolidation/featureIntegrationCampaignPolicy.mjs`、`tools/main-consolidation/test/featureIntegrationCampaignPolicy.test.mjs` |
| R2 | 元の Task 6E に到達した時 | `tools/main-consolidation/wave0a-windows-native.ps1`、`tools/main-consolidation/test/wave0a-windows-native.test.mjs` |
| R3 | 元の Task 6G に到達した時 | `tools/main-consolidation/wave0aMutationPolicy.mjs`、`tools/main-consolidation/run-wave0a-mutation.mjs`、対応する `test/wave0aMutationPolicy.test.mjs` と `test/run-wave0a-mutation.test.mjs` |
| R4 | R3 と元の 1-6H 実装/レビュー完了後 | 追加 production file なし。元の aggregate / 独立レビュー証跡のみ |

R1 -> R2 -> R3 と連続先行実装しない。元の `1A -> 1B -> 6A -> 1C -> 2 -> 3A -> 3B -> 4A -> 4B -> 5A -> 6E -> 5B -> 6B -> 6C -> 6D -> 6F -> 6G -> 6H` 順序に挿入する。6I / 7 / 8 の live 実行は別承認。書込み担当を同じ file に重ねず、レビューは新しい read-only 担当へ必要資料だけ渡す。

## 2. 実行時の共通 command 規約

以下の code block は **追補の実装承認後** に実行する。現在の文書作成では production/test code を実行・変更して進捗を作らない。

各実行 shell は上記 worktree を cwd にし、次を設定する。

```powershell
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
$rootContractNode = 'C:/Program Files/nodejs/node.exe'
$rootContractGit = 'C:/Program Files/Git/cmd/git.exe'
```

GREEN command は直後の実 exit を記録する。RED は native preference を一時的に下げて期待する exit 1 を区別し、必ず元へ戻す。expected RED を終了理由不明、syntax error、fixture の import failure、skip に置き換えない。

```powershell
$rootContractPreference = $PSNativeCommandUseErrorActionPreference
try {
  $PSNativeCommandUseErrorActionPreference = $false
  & $rootContractNode --test --test-name-pattern '^campaign attachment: root-contract ' tools/main-consolidation/test/featureIntegrationCampaignPolicy.test.mjs
  $rootContractRedExit = $LASTEXITCODE
  if ($rootContractRedExit -ne 1) { throw "Expected RED exit 1; actual=$rootContractRedExit" }
} finally {
  $PSNativeCommandUseErrorActionPreference = $rootContractPreference
}
```

root 専用 name pattern では既存非対象 test が skip 表示になる場合がある。選択対象の件数を明示し、これを全体 skip 0 と報告しない。最終 GREEN は必ず pattern なしの全 file / aggregate で確認する。

## Task R1: Task 6A phase 2B の閉型・fixture を修正する

**Files:** この task は上表の policy/test の2 file だけを変更する。`wave0a-first-root-install-policy.json` は変更しない。

**Interfaces:**

- Consumes: 設計書の `RootMaterializationAction`、`WorktreeRemovalEntry` と元計画の外側 `AttachmentPayload`、既存 canonical bytes / path / identity validator。
- Produces: 元の phase 2B API `validateAttachmentPayload(payload, { producer })`、`parseAttachmentBytes(bytes, { schemaVersion, producer, byteSize, sha256 })`、`buildAttachmentFixture(schemaVersion)` による新しい二 schema の検証/fixture。新しい公開関数や schema は追加しない。
- fixture producer は synthetic な共有資料に限り、物理ファイル・native 検証・campaign authority を主張しない。

- [ ] **Step 1: 承認と保全を確認する。** 両追補の commit/blob/SHA-256 とユーザーの限定承認を照合し、旧計画/spec/index/first-root の identity、draft、branch、staging を再確認する。drift は保存して停止し、reset/checkout で修復しない。

- [ ] **Step 2: 独立した非空 fixture を固定する。** test の `A_MATERIALIZATION` に root-level file と nested action を含める。別の positive variant で全5 action kind、delete-directory 親への forward reference、正当な empty actions を覆う。`A_REMOVAL_PLAN` は empty entries を廃し、下の9行 graph を持つ complete synthetic plan にする。graph 外の kind/bytes/hash/attributes と `.git` / `gitdir` の identity は test-owned literal / 既存 test helper から構成し、production fixture builder から期待値を生成しない。

| ordinal | owner | entryScope | relativePath | parentOrdinal | parentRelativePath | leaf | depth | kind | deleteOrdinal |
| ---: | --- | --- | --- | ---: | --- | --- | ---: | --- | ---: |
| 1 | target | owner_root | field なし | field なし | field なし | feature | 0 | directory | 5 |
| 2 | target | descendant | .git | 0 | field なし | .git | 1 | file | 2 |
| 3 | target | descendant | package.json | 0 | field なし | package.json | 1 | file | 3 |
| 4 | target | descendant | src | 0 | field なし | src | 1 | directory | 4 |
| 5 | target | descendant | src/rule.md | 4 | src | rule.md | 2 | file | 1 |
| 6 | admin | owner_root | field なし | field なし | field なし | feature | 0 | directory | 9 |
| 7 | admin | descendant | HEAD | 0 | field なし | HEAD | 1 | file | 6 |
| 8 | admin | descendant | gitdir | 0 | field なし | gitdir | 1 | file | 7 |
| 9 | admin | descendant | index | 0 | field なし | index | 1 | file | 8 |

`field なし` は説明であり payload 値ではない。各 identity は衝突しない synthetic 値とし、root は outer root identity、`.git` / `gitdir` は outer file identity と一致させる。変更された plan SHA を参照する `A_REMOVAL_OBSERVATION` と既存の関連 fixture も同じ test scope で再計算する。別 owner で同じ relativePath を持つ positive variant も追加する。

- [ ] **Step 3: root omission の回帰 test を先に追加する。** 次は既存 test file の `test`、`assert`、`policy`、`A_ATTACHMENT_FIXTURES`、`clone`、`hash`、`bytes`、`digest` を使う実際の test 例。`undefined` は JSON にできないので、その case だけ digest を再計算せず拒否を直接検証する。他のケースでは内容 hash/集計を更新する。合法path `src` では既存closed-shape helperの `closed record keys` 診断を要求し、optional SafeRelativePathを誤って許した実装ではPASSできないことを確認する。既存のaccessor拒否/安全なcanonical検証順を維持する。

```js
test('campaign attachment: root-contract materialization root parent is absent', () => {
  const good = A_ATTACHMENT_FIXTURES.get('root-materialization-plan')
  assert.deepEqual(policy.validateAttachmentPayload(good, { producer: '6G' }), good)
  const rootAction = good.actions.find(action => action.parentActionOrdinal === 0)
  assert.ok(rootAction)
  assert.equal(rootAction.rootAnchor, 'root_worktree')
  assert.equal(Object.hasOwn(rootAction, 'parentRelativePath'), false)
  assert.equal(rootAction.repositoryPath, rootAction.leaf)
  assert.equal(rootAction.depth, 1)
  for (const value of [null, '', '.', 'src', undefined]) {
    const bad = clone(good)
    bad.actions[rootAction.actionOrdinal - 1].parentRelativePath = value
    if (value !== undefined) {
      bad.totalPathBytes = bad.actions.reduce((total, action) => total +
        Buffer.byteLength(action.repositoryPath, 'utf8') +
        (typeof action.parentRelativePath === 'string' ? Buffer.byteLength(action.parentRelativePath, 'utf8') : 0), 0)
      bad.actionsSha256 = hash(bad.actions)
    }
    const expected = value === 'src' ? { name: 'TypeError', message: 'closed record keys' } : TypeError
    assert.throws(() => policy.validateAttachmentPayload(bad, { producer: '6G' }), expected)
  }
})

test('campaign attachment: root-contract removal roots have no relative path fields', () => {
  const good = A_ATTACHMENT_FIXTURES.get('worktree-removal-plan')
  assert.deepEqual(policy.validateAttachmentPayload(good, { producer: '6G' }), good)
  const roots = good.entries.filter(entry => entry.entryScope === 'owner_root')
  assert.deepEqual(roots.map(entry => [entry.ordinal, entry.owner, entry.depth, entry.deleteOrdinal]),
    [[1, 'target', 0, 5], [6, 'admin', 0, 9]])
  assert.equal(good.entries.length, 9)
  assert.equal(good.entryCount, 9)
  assert.equal(good.maxDepth, 2)
  for (const root of roots) {
    assert.equal(root.kind, 'directory')
    for (const key of ['relativePath', 'parentRelativePath', 'parentOrdinal']) {
      assert.equal(Object.hasOwn(root, key), false)
      const bad = clone(good)
      bad.entries[root.ordinal - 1][key] = key === 'parentOrdinal' ? 0 : 'src'
      bad.tupleSha256 = hash(bad.entries)
      assert.throws(() => policy.validateAttachmentPayload(bad, { producer: '6G' }),
        { name: 'TypeError', message: 'closed record keys' })
    }
  }
  const badChild = clone(good)
  badChild.entries[2].parentRelativePath = 'src'
  badChild.tupleSha256 = hash(badChild.entries)
  assert.throws(() => policy.validateAttachmentPayload(badChild, { producer: '6G' }),
    { name: 'TypeError', message: 'closed record keys' })
  const encoded = bytes(good)
  assert.deepEqual(policy.parseAttachmentBytes(encoded, {
    schemaVersion: good.schemaVersion, producer: '6G',
    byteSize: encoded.length, sha256: digest(encoded)
  }), good)
  assert.deepEqual(policy.buildAttachmentFixture(good.schemaVersion), good)
})
```

- [ ] **Step 4: 相関 graph の RED を追加する。** 下表の1行を1 test family とし、必ず valid control を先に通す。変更 fixture の entry/action count、path-byte 集計、plan SHA、tuple SHA、関連 observation SHA を更新し、canonical/hash failureでgraph検証を隠さない。cycleのようにpath/depth制約にも必然的に違反する場合はその相関を記録し、graph検証に到達した診断を確認する。上の RED command と `node --check` で構文・失敗理由を確認する。

| 正常 control | 一つずつ拒否する変更 |
| --- | --- |
| root action | rootAnchor 欠落/別値、parentRelativePath 追加、depth 0/2、path と leaf 不一致 |
| nested action | 親 path 欠落、rootAnchor 追加、親 file/欠落/自己/cycle、親 path 取り違え |
| deleted-directory の子 | forward reference の正当ケースは受理。create/install を消える親に向ける case は拒否 |
| removal roots 2行 | 0/1/3 roots、owner 重複、root file化、depth 1、outer leaf/identity/attributes mismatch |
| immediate root child | 親 path 追加、root row の正 ordinal を親に指定、root selector を別 owner に解決 |
| nested descendant | parent file/欠落/owner crossing/self/cycle、path/parent/leaf/depth mismatch |
| 正規 inventory / delete順 | ordinal重複/gap、root先行削除、owner交差、tie-break変更、tupleからroot除外 |
| owner内 path 一意 / 全体 identity 一意 | 同 owner case-fold collision、両 owner 横断の同一 volume/file ID |

- [ ] **Step 5: 設計書の union と graph を純粋 policy に実装する。** 共通 path validator は変更しない。既存の安全なplain-data/canonical検証を維持し、型別の exact own-key set を確認してから graph と aggregate を照合する。root omission を `value || ''`、nullable common path、fallback で扱わない。materialization の private な親解決は次の分岐で固定する。戻り値は process-free の検証用 selector であり native handle ではない。

```js
function materializationParentSelector(action) {
  if (action.parentActionOrdinal === 0) {
    if (action.rootAnchor !== 'root_worktree' || Object.hasOwn(action, 'parentRelativePath')) {
      throw new TypeError('invalid root materialization parent')
    }
    return { kind: 'root_worktree' }
  }
  if (!Number.isSafeInteger(action.parentActionOrdinal) || action.parentActionOrdinal < 1 ||
      Object.hasOwn(action, 'rootAnchor') || !Object.hasOwn(action, 'parentRelativePath')) {
    throw new TypeError('invalid directory materialization parent')
  }
  return { kind: 'directory_action', actionOrdinal: action.parentActionOrdinal }
}
```

この private helper の前に closed fields / primitives、後に同一 plan 内の directory kind/path、cycle、実行順、depth を検証する。removal は `entryScope` と `parentOrdinal` で設計書 4.1/4.2 の3 branchを選択する。root自体・root直下・nestedを同じ sentinel に潰さない。`entries` tuple は ordinal 順、prefix は deleteOrdinal 順の別配列を使う。

- [ ] **Step 6: producer fixture を独立 literal に合わせる。** `buildAttachmentFixture` の二 schema を新しい完全 fixture に更新し、test の expected bytes は production helper を呼ばず既存 test-owned canonical/hash helper で固定する。schema registry の42件と producer/cap は元のままとする。16 MiB plan の内部 canonical path を使い、1 MiB の一般 `canonicalJson()` 公開上限を全体的に引き上げない。

- [ ] **Step 7: 元の phase 2B 全体を完成させて GREEN を取る。** root 部分だけで phase 2B 完了としない。現在の342 RED、残る42 payloadの相関検証・schema/canonical/cap testを元計画どおり完成させ、次を実行する。

```powershell
& $rootContractNode --check tools/main-consolidation/featureIntegrationCampaignPolicy.mjs
& $rootContractNode --check tools/main-consolidation/test/featureIntegrationCampaignPolicy.test.mjs
& $rootContractNode --test tools/main-consolidation/test/featureIntegrationProgramPolicy.test.mjs tools/main-consolidation/test/create-feature-integration-program-index.test.mjs tools/main-consolidation/test/featureIntegrationCampaignPolicy.test.mjs scripts/three-extension-documentation-contract.test.js
& $rootContractGit diff --check
```

Expected: native exit 0、対象全 test pass、top-level skip 0。件数は今回の実測を記録し、過去の239件を流用しない。removal total-file-byte cap の数値が未確定なら、その受入を含む全体 GREEN/phase 完了を主張せず、設計書 6 節の別判断で停止する。未定上限を無制限扱いにした stub は作らない。

- [ ] **Step 8: 独立レビュー、修正、限定 commit。** fresh reviewer に元計画、追補、exact diff、RED/GREEN証跡を渡し、Critical/Important を解消する。stage はこの2 fileだけ。stage内容を確認してから phase 2B の元の commit 境界で commit する。R1だけの成功から6A phase 2C/全体レビューを飛ばして次工程へ進まない。

## Task R2: 元の Task 6E で native のルート解決を揃える

**Files:** 上表の native script/test のみ。この追補のために新しい CLI/mode/launcher を追加しない。

**Interfaces:**

- Consumes: Task 6A が検証する新 union の campaign-owned plan、元の intent / progress root / fresh output root、materialization の fresh payload root。
- Produces: 元の `materialize-root-exact` / `remove-worktree-exact` の acknowledgement / result。schema、exit、claimed process、同一 handle の契約は元計画 5149-5161 行を維持する。

- [ ] **Step 1: native RED fixture を追加する。** R1のroot/root直下/nested構造と5 kindの materialization variantを、元の Task 6E が所有する disposable fixture volume 内の実際の linked-worktree fixture で検証する。9行のsynthetic planをそのまま実Gitの完全inventoryだと扱わず、native fixtureでは実際のadmin `commondir` / logs等も含む全nodeを計画へ入れる。対象repositoryの実 worktree/保護cloneを fixture にしない。各 owner の外部親・root・root直下・nested node の open と disposition を元のテスト観測へ記録し、fixture作成時に保持した親 handle identity と leaf を独立 expected tuple で固定する。正当な root row を旧 mandatory-path parser が拒否する RED を確認する。

- [ ] **Step 2: 3種類の親選択を native に実装する。** 下記の選択表どおり、所有する held-handle table から親を解決する。表の全 branch は closed union 検証後にのみ到達する。`NtOpenFile` にはこの親 handle と一つの leaf を渡す。

| 入力 | 親 handle | leaf の検証元 |
| --- | --- | --- |
| materialization / ordinal 0 | held rootWorktree | action.leaf、repositoryPath と一致 |
| materialization / 正親 | held directory-action handle | action.leaf、graph 再構築 |
| removal / owner_root target | held featureParent | plan.featureRootLeaf == entry.leaf |
| removal / owner_root admin | held adminParent | plan.adminRootLeaf == entry.leaf |
| removal / descendant 親0 | held same-owner root | entry.leaf、relativePath と一致 |
| removal / descendant 正親 | held same-owner descendant-directory | entry.leaf、graph 再構築 |

root handle を自分自身の親として使わない。outer parent は削除せず保持し続ける。削除済み root がある prefix ではその owner に remaining descendant がないことを先に証明し、不在 root の reopen を試さない。materialization は後で削除する directory の handle を子処理前に取得するが、削除 action を前倒ししない。

設計書6節の別問題である `delete_empty_directory.expectedTarget` の可変snapshot照合が未確定なら、該当native分岐の実装を停止する。R1のpure graph positiveを物理identity検証の合格へ読み替えず、mtime/ctime/treeShaを無視したり期待値を実行時に差し替えたりしない。

- [ ] **Step 3: ordinal と prefix の取り違えを RED/GREEN にする。** R1 graph の正規 delete列は `[5,2,3,4,1,7,8,9,6]`。これはpure fixture専用のtest-owned expected stable ordinalとして下のコードで固定する。native observationの期待順は、実際のcomplete physical fixture inventoryから独立に導出・固定して照合する。両方で `entries.slice(0,P)` に置換した mutation が検出されることを確認する。

```js
const expectedDeletionOrdinals = [5, 2, 3, 4, 1, 7, 8, 9, 6]
const fixture = policy.buildAttachmentFixture('bob-builtin-analyze/worktree-removal-plan/v1')
const orderedEntries = [...fixture.entries].sort((left, right) => left.deleteOrdinal - right.deleteOrdinal)
assert.deepEqual(orderedEntries.map(entry => entry.ordinal), expectedDeletionOrdinals)
assert.deepEqual(orderedEntries.slice(0, 5).map(entry => entry.ordinal).sort((a, b) => a - b), [1, 2, 3, 4, 5])
assert.equal(orderedEntries[4].entryScope, 'owner_root')
assert.equal(orderedEntries[4].owner, 'target')
assert.equal(orderedEntries[8].entryScope, 'owner_root')
assert.equal(orderedEntries[8].owner, 'admin')
```

この純粋 assertion は物理 native gate の代わりではない。native test は実際のcomplete inventoryの件数を `N` とし、小さい物理fixtureの `P=0..N` 全境界、`.git` / `gitdir` の前後、target root前後、admin root前後で crash/reconcile する。9というsynthetic件数をnativeへ固定しない。既に消えた行を再 disposition しないことと、prefixに対応する registration/backpointer 状態を検証する。

- [ ] **Step 4: race と cap を検証する。** 外部親/root/ancestor/leafの置換、reparse、同一identity別owner、unexpected child、readonly/share違反を最終確認前後に注入し、次のdispositionが0件でsentinelが不変であることを確認する。16,383/16,384/16,385 entriesには必ずroot2行を含め、depth255/256/257、1,024-entry境界、plan byte上限を測定する。総ファイルバイト cap は設計書6節の決定が必要で、推測値で native gate を通さない。

- [ ] **Step 5: 元の native task 全体の GREEN・レビュー・commit。** 次の2 testと元Task6Eの全process/bootstrap/host testsを実行する。Windows capabilityが不足なら native acceptance は未確認として停止し、portable passへ読み替えない。fresh reviewerはroot表現だけでなく元のheld-handle/claim/share/no-follow条件が維持されたことを確認する。

```powershell
& $rootContractNode --test tools/main-consolidation/test/featureIntegrationCampaignPolicy.test.mjs tools/main-consolidation/test/wave0a-windows-native.test.mjs
& $rootContractGit diff --check
```

## Task R3: 元の Task 6G で唯一の producer と再開処理を揃える

**Files:** 上表の mutation policy/adapter と対応する2 test。tool-bundle/operation manifestの元task内の生成作業は維持するが、この追補を理由に roster、公開引数、authorityを変更しない。

**Interfaces:**

- Consumes: authenticated `VerifiedHandoff`、exact `B/M` trees、held `B` filesystem、同一 intent の native inventory/progress、Task 6A の `validateAttachmentPayload`。
- Produces: 新表現の `RootMaterializationPlanAttachment` / `WorktreeRemovalPlanAttachment`。Task 6B がそれぞれ既存の internally generated aggregate precondition に発行し、Task 6G が再openしてTask6Eへ渡す。

- [ ] **Step 1: producer の非空 RED を固定する。** test-owned Git tree fixture は root `package.json` の更新、root-level新規/削除file、保持/新規/削除directory、nested fileを含める。対象Git fixtureの構築/破棄は元Task6Gのdisposable test domainだけ。pure producerはR1の独立literalと照合し、物理fixtureは作成時に独立保持した全node/identityからexpected bytes/hashを構成する。物理identityを削除・正規化してsynthetic hashに合わせない。全5kind、root omission、forward parent、2ownerのroot行、実admin完全inventoryをassertする。

- [ ] **Step 2: 正規形をproducerで構成する。** root materialization は親がrootなら `parentActionOrdinal:0,rootAnchor:'root_worktree'` の2 fieldだけを追加し、配下親なら正ordinalと非空parentRelativePathだけを追加する。root actionは作らない。removalはroot2行をouter identityから構成し、descendant graphを列挙した後、設計書4.3のinventory順・delete順を別々に割り当てる。ordinal、bytes、hashはcaller inputから受け取らない。

```js
function materializationParentFields(parentActionOrdinal, parentRepositoryPath) {
  if (parentActionOrdinal === 0) {
    if (parentRepositoryPath !== undefined) throw new TypeError('root has no parent path field')
    return { parentActionOrdinal: 0, rootAnchor: 'root_worktree' }
  }
  if (!Number.isSafeInteger(parentActionOrdinal) || parentActionOrdinal < 1 ||
      typeof parentRepositoryPath !== 'string' || parentRepositoryPath.length === 0) {
    throw new TypeError('invalid materialization directory parent')
  }
  return { parentActionOrdinal, parentRelativePath: parentRepositoryPath }
}
```

このprivate組立helperの入力はverified tree graph由来に限る。組立後は全primitive/path/identity/graph/cap/hashをTask6Aで再検証する。producerが渡す検証済みByte payloadもnativeは独立再検証する。common path validatorをこのhelper内のlengthチェックで置き換えない。

- [ ] **Step 3: success/failure両preconditionを検証する。** materializationは成功`0004`/checkpoint failure`0005`、removalは成功`0003`/failure`0004`のまま。request path/ordinal override、caller-root identity、旧root表現、plan再生成によるprefix置換をrejectし、claim/mutation開始が0件であることをassertする。

- [ ] **Step 4: prefix/hashの消費を全経路で照合する。** `tupleSha256`はordinal配列、rolling prefixはdeleteOrdinal列、progress/observationは同一plan SHAに拘束する。native result、Task6G reconciliation、Task6B publication/reopen、Task6Fcheckpoint、operator bootstrap/hostの既存fixtureを通して同じrows/bytesが消費されることを確認する。admitted旧payloadを見つけても変換せず停止する。

- [ ] **Step 5: 元Task6G全体のGREEN・独立レビュー・commit。** 次を実行した上で、元Task6Gの全operation/DAG/argv/authority/no-replay testsとTask6B consumer testを実行する。根だけ成功して他operationをstub化したcandidateはcommit完了にしない。

```powershell
& $rootContractNode --test tools/main-consolidation/test/featureIntegrationCampaignPolicy.test.mjs tools/main-consolidation/test/wave0aMutationPolicy.test.mjs tools/main-consolidation/test/run-wave0a-mutation.test.mjs tools/main-consolidation/test/manage-feature-integration-campaign.test.mjs tools/main-consolidation/test/wave0a-windows-native.test.mjs
& $rootContractGit diff --check
```

## Task R4: 限定追補の横断受入と次の承認境界

**Files:** production変更なし。元の task report / review evidence に結果を加法的に保存する。

**Interfaces:** R1-R3のexact commits、実test/native結果、設計書7節の受入項目を入力とし、元のfinal review/candidate evidenceへ渡す。本追補用の新しいruntime schemaは出力しない。

- [ ] **Step 1: 要件対応を自己照合する。** 設計書3節→R1/R2/R3、4節→R1/R2/R3、5節→R2/R3、6節→保全/registry/承認/停止条件、7節→全test証跡を対応付け、欠けたnegative/positive/physical gateを埋める。
- [ ] **Step 2: 元Task6Cの完全local gatesをexact candidate headで実行する。** 元計画指定のcompile→test→package順、source/dependency/architecture/unused/artifact/audit/package gatesを省略しない。今回のfocused testだけでそれらを代用しない。
- [ ] **Step 3: fresh independent review。** 読取専用担当にexact diffと固定原本/追補を渡し、root-shaped payloadの閉性、native親handleの選択、prefix順、capのroot算入、caller権限不拡張を確認する。Critical/Importantを解消後、再検証する。
- [ ] **Step 4: 原本/承認/draft履歴の保全と境界を確認する。** 原本3資料/first-root assetのhash不変、新規dependency/publicAPI/schemaなし、保護clone未変更、main/remote/PR未変更を区別して報告する。既存draftの後続変更は承認後の2 file限定commitとして追跡できることを確認する。
- [ ] **Step 5: candidateと残る承認を引き渡す。** root追補の実装受入、元Wave0Aローカル実装、native受入、live campaign、main統合、branch/worktree整理は別々の状態で報告する。全体が実際に完了していない限りmain一本化完了とは言わない。

## 3. 明示的な停止条件

- 追補作成許可しかない間はR1を開始しない。設計書/計画のexact identityを提示し、限定的な設計変更とローカル実装再開の承認を待つ。
- worktree-removal総ファイルバイト上限は元計画で数値が確定できていない。本追補はroot表現だけを決める。該当cap受入を要求する工程では元の権威にある値を確認するか、別の限定承認を得るまで停止する。
- `delete_empty_directory.expectedTarget` の可変 `DirectoryIdentity` snapshot の照合時点は別判断を要する。子削除後の親を扱うnative実装/受入は、その規則が確定するまで停止する。本追補のroot graph承認をidentity弱化の承認に使わない。
- 実際のadmitted旧payload、frozen identity drift、未承認file変更、native能力不足、契約にないroot/alias、別の設計矛盾を発見したら、推測の互換処理・例外・stubを入れず証跡と次に必要な判断を示す。
- 現在の文書作成を終えても、旧承認の書換え、live provisioning、remote push/merge、branch/worktree削除は実行しない。

## 4. 文書作成時の検証と handoff

本節だけは今回の文書作成範囲で実施する。2つの新規Markdownのみを対象に自己レビューと独立レビューを行い、元文書/hash・draftが不変であることを確認する。既存 `scripts/three-extension-documentation-contract.test.js` と `git diff --check` を実行するが、停止中phase2BをGREEN化しない。

文書だけをstageしたことをpath単位で確認してからローカルcommitに固定する。commit後は両blobとSHA-256、未stageのdraft、main追跡ref不変を再検証してユーザーへ提示する。完了するのは追補案の作成であり、承認待ちの状態はこの文書内で自動的にapprovedへ書き換えない。
