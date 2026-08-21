# Main Consolidation Control Plane and Archive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 承認済みmain一本化設計の実行に先立ち、全ref・PR・worktree・artifactをfail-closedで棚卸しし、復元可能なbundle、hash付きartifact archive、6本のcarrier patchを非破壊で凍結する。

**Architecture:** `tools/main-consolidation`へ、immutable topology map、pure validation policy、read-only inventory CLI、write-once archive CLI、carrier patch freezerを分離して実装する。大容量bundle・VSIX・fixtureはrepository外のdurable archiveへ保存し、repositoryにはschema化したinventory/archive summaryだけを残す。この計画はbranch、worktree、clone、PR、artifactを削除せず、製品コードも変更しない。

**Tech Stack:** Node.js 22 ESM、`node:test`、Git CLI、GitHub CLI、PowerShell、Git bundle、SHA-256

**Spec:** `docs/superpowers/specs/2026-08-21-main-consolidation-and-branch-retirement-design.md`

## Global Constraints

- Repositoryは`katamor1/bob_builtin_analyze`、default branchは`main`である。
- Design baselineは`44027562fe201d47f8f4cf08241ffe29384e9902`である。実行時のmainはこのcommitをancestorとして含む必要がある。
- この計画中はremote/local branch、worktree、standalone clone、PR、artifactを削除しない。旧PRをcloseしない。
- Primary checkoutの`main`、未追跡`.integration-xlsx-on-prereq/`、既存二つのfeature worktreeを変更しない。
- 新規実装は最新`origin/main`起点の`.worktrees/main-consolidation-inventory-archive`で行う。
- Archive rootは`C:\Users\stell\source\archives\bob_builtin_analyze\2026-08-21-main-consolidation`である。既に存在する場合は上書き、merge、削除をせず停止する。
- Archiveはwrite-once staging directoryからatomic renameでpublishし、source fileは読取専用で扱う。
- 既存の2026-07-16 branch-retirement map/evidenceはhistorical recordとして変更しない。
- CLI commandはshell文字列に連結せず、commandとargvの配列で実行する。
- Remote URLにcredentialが含まれる場合、stdout、stderr、JSON、Markdownへ露出させない。
- `main`、process branch、unexpected ref、moved ref、open PR mismatchはすべてfail-closedにする。
- Accepted VSIXはSHA-256 `4E0A9961FA1CD50882CAA89D3EEECC9BCFC8A31871A5ECA6262A37D99700A1DC`、size `3,758,108` bytesである。
- Old comparison VSIXはSHA-256 `CE335C40F2D2A003B932134C02A2875E3996C6C7409863B9CF14956DCA7C0D85`、size `3,757,611` bytesである。
- 本計画のproduct source変更は0件であるためextension packageは作らない。Node tests、documentation contract、existing retirement tests、`git diff --check`を必須gateとする。

## Frozen topology contract

`consolidation-map.json`は以下の30 non-main remote headsをexact name/SHAで一度ずつ所有する。`codex/main-consolidation-control-plane`だけはprocess branchとしてnameを固定し、実行時に存在する場合のSHAをinventoryへ記録する。

### Workflow carriers

| Owner | Branch | Expected SHA | PR |
| --- | --- | --- | --- |
| `workflow-a` | `codex/workflow-contract-v2-f7` | `2af41862b61d3e0f53218cc0f760b19292870a3b` | #143 |
| `workflow-a` | `codex/workflow-contract-v2-p1` | `a0da0c8f17cbb648873577a573230c8241f755f2` | #148 |
| `workflow-a` | `codex/workflow-contract-v2-p2` | `629f53ade7fcb42481fad6906d36ef6425fd1071` | #149 |
| `workflow-a` | `codex/workflow-contract-v2-p3` | `683e794eb4a39eea7bc3630bedbd2a557f4af8af` | #151 |
| `workflow-b` | `codex/workflow-contract-v2-p4` | `e0766f9448033688964fabbcfa6ae73b3d849ed0` | #153 |
| `workflow-b` | `codex/workflow-contract-v2-p5` | `45260e0b5a96e50bf01b820b71103b33f2067d8c` | #154 |
| `workflow-b` | `codex/workflow-contract-v2-p6` | `95d245ce2eba9ac1412038afe96dc509bd6735de` | #155 |
| `workflow-b` | `codex/workflow-contract-v2-p7` | `e860d1ebbafe7068fc6871b16c9586a11b4fe19d` | #157 |
| `workflow-c` | `codex/workflow-contract-v2-r1` | `66e005faf0046ca931c83abc41ce533488d2f581` | #158 |
| `workflow-c` | `codex/workflow-contract-v2-r2` | `7bad4e42f2146b8ae229e05427a5d2ae013cdb2e` | #160 |
| `workflow-c` | `codex/workflow-contract-v2-r3` | `e0a4b1b25166c4d47cf8f5564c01cf30c63d9180` | #161 |
| `workflow-c` | `codex/workflow-contract-v2-r4` | `266f13f8544338ce0445c749f4625a1f80791c36` | #162 |
| `workflow-c` | `codex/workflow-contract-v2-r5` | `de65647c18a122b6f88af3967ba509282b64d6db` | #163 |
| `workflow-c` | `codex/workflow-contract-v2-r6` | `a18c09b10fa51702d312e34940a694ad971a48cc` | #164 |

Carrier ranges:

- `workflow-a`: `56ba084d07f1641fa0454fe1da024f14fe99fd37..683e794eb4a39eea7bc3630bedbd2a557f4af8af`
- `workflow-b`: `683e794eb4a39eea7bc3630bedbd2a557f4af8af..e860d1ebbafe7068fc6871b16c9586a11b4fe19d`
- `workflow-c`: `e860d1ebbafe7068fc6871b16c9586a11b4fe19d..a18c09b10fa51702d312e34940a694ad971a48cc`

### Processing carriers

| Owner | Branch | Expected SHA | PR |
| --- | --- | --- | --- |
| `processing-a` | `codex/three-extension-p1-release-gates` | `3e2dd68d4a0a880e7fa7ed065f5a1be2bd25a0ca` | prerequisite |
| `processing-a` | `codex/task13-processing-budget-runtime-20260723` | `bd29233dac84922e2f868dcb9d654644f6ee0d6a` | #145 |
| `processing-a` | `codex/task14-bounded-document-extraction-20260723` | `4d0fb728763db9d13c87d000790a88c45900733e` | #146 |
| `processing-b` | `codex/task15-workbook-document-aggregate-caps-20260724` | `7fc7a371e6506290d8626d06e9b12c2a67888b47` | #147 |
| `processing-b` | `codex/task16-review-input-process-budgets-20260724` | `49f39e1a6ec35e5db98e9ef698d4ce43369c9760` | #150 |
| `processing-c` | `codex/task17-deadlines-process-control-paths-20260724` | `7ea786afd5715d841526000a402c831d6c2a203c` | #152 |
| `processing-c` | `codex/task18-processing-budget-report-handoff-20260726` | `2d8a570fa1c0646fd662346744449b1abc1142b2` | #159 |

Carrier ranges:

- `processing-a`: `8793804f2f99fd1d545cb496064bcbdc7df4bf40..4d0fb728763db9d13c87d000790a88c45900733e`
- `processing-b`: `4d0fb728763db9d13c87d000790a88c45900733e..49f39e1a6ec35e5db98e9ef698d4ce43369c9760`
- `processing-c`: `49f39e1a6ec35e5db98e9ef698d4ce43369c9760..2d8a570fa1c0646fd662346744449b1abc1142b2`

### Checkpoint, triage, and merged-XLSX heads

| Owner | Branch | Expected SHA |
| --- | --- | --- |
| `workflow-checkpoint` | `codex/contract-v2-f5-rebased` | `3e82579a45291604ccd3313b561d8bc62557b1ce` |
| `workflow-checkpoint` | `codex/contract-v2-f6-rebased` | `9a0bd62d817992bca8fa31f3b7c986c8c0fe97f8` |
| `workflow-checkpoint` | `codex/workflow-contract-v2-r5-rebased` | `2920dc4f15b35532fbbb4e22f4d286afc2e8b19f` |
| `independent-triage` | `codex/contract-v2-design` | `7d8225a2547095ae587c4a4ff1ca9a43b2ec08d9` |
| `independent-triage` | `codex/operator-ux-closure` | `b9773edf61882c3092e63d73997d2b35c2352b0f` |
| `independent-triage` | `codex/reproducible-runtime-v2-design-20260717` | `f7f65b0d42df953cfe46b64b0d7a9dcec652ee2c` |
| `independent-triage` | `codex/workflow-contract-v2-r5-pre-r4-merge` | `6c9684f2a11b14adc2a8d3a600c09d47c865f133` |
| `merged-xlsx` | `codex/fix-bazaar-minimal-xlsx` | `5adc59d50fa54d54b883ba8be2e9fe3571aa406f` |
| `merged-xlsx` | `codex/harden-ooxml-snapshot-input` | `64b5f3c293e379f8877a0cf11a41c19ea6f58fb7` |

Expected open PR set is exactly `143, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 157, 158, 159, 160, 161, 162, 163, 164` until a separately authorized carrier phase changes it.

The exact head → base chain is:

| PR | Head | Base |
| --- | --- | --- |
| #143 | `codex/workflow-contract-v2-f7` | `main` |
| #145 | `codex/task13-processing-budget-runtime-20260723` | `codex/three-extension-p1-release-gates` |
| #146 | `codex/task14-bounded-document-extraction-20260723` | `codex/task13-processing-budget-runtime-20260723` |
| #147 | `codex/task15-workbook-document-aggregate-caps-20260724` | `codex/task14-bounded-document-extraction-20260723` |
| #148 | `codex/workflow-contract-v2-p1` | `codex/workflow-contract-v2-f7` |
| #149 | `codex/workflow-contract-v2-p2` | `codex/workflow-contract-v2-p1` |
| #150 | `codex/task16-review-input-process-budgets-20260724` | `codex/task15-workbook-document-aggregate-caps-20260724` |
| #151 | `codex/workflow-contract-v2-p3` | `codex/workflow-contract-v2-p2` |
| #152 | `codex/task17-deadlines-process-control-paths-20260724` | `codex/task16-review-input-process-budgets-20260724` |
| #153 | `codex/workflow-contract-v2-p4` | `codex/workflow-contract-v2-p3` |
| #154 | `codex/workflow-contract-v2-p5` | `codex/workflow-contract-v2-p4` |
| #155 | `codex/workflow-contract-v2-p6` | `codex/workflow-contract-v2-p5` |
| #157 | `codex/workflow-contract-v2-p7` | `codex/workflow-contract-v2-p6` |
| #158 | `codex/workflow-contract-v2-r1` | `codex/workflow-contract-v2-p7` |
| #159 | `codex/task18-processing-budget-report-handoff-20260726` | `codex/task17-deadlines-process-control-paths-20260724` |
| #160 | `codex/workflow-contract-v2-r2` | `codex/workflow-contract-v2-r1` |
| #161 | `codex/workflow-contract-v2-r3` | `codex/workflow-contract-v2-r2` |
| #162 | `codex/workflow-contract-v2-r4` | `codex/workflow-contract-v2-r3` |
| #163 | `codex/workflow-contract-v2-r5` | `codex/workflow-contract-v2-r4` |
| #164 | `codex/workflow-contract-v2-r6` | `codex/workflow-contract-v2-r5` |

## Shared data contracts

All JSON arrays are sorted by stable identifiers before serialization. SHA values are lowercase in JSON even when PowerShell displays uppercase hashes.

```javascript
/** @typedef {{
 * readyForArchive: true,
 * mainSha: string,
 * legacyHeadCount: 30,
 * processHeadCount: number,
 * openPullRequestCount: 20
 * }} TopologyAssessment */

/** @typedef {{
 * path: string,
 * head: string,
 * branch: string | null,
 * detached: boolean,
 * status: string[]
 * }} WorktreeRecord */

/** @typedef {{
 * label: string,
 * sourcePath: string,
 * byteSize: number,
 * sha256: string
 * }} ArtifactObservation */

/** @typedef {{
 * schemaVersion: 'bob-builtin-analyze/main-consolidation-inventory/v1',
 * generatedAt: string,
 * repository: 'katamor1/bob_builtin_analyze',
 * readyForArchive: boolean,
 * topology: TopologyAssessment,
 * remoteHeads: Array<{ branch: string, sha: string, owner: string }>,
 * openPullRequests: Array<{ number: number, headRefName: string, headRefOid: string, baseRefName: string, url: string }>,
 * localBranches: Array<{ branch: string, sha: string }>,
 * worktrees: WorktreeRecord[],
 * externalRepositories: Array<{ label: string, path: string, head: string, branch: string | null, status: string[] }>,
 * artifacts: ArtifactObservation[],
 * blockers: string[]
 * }} InventoryEvidence */

/** @typedef {{
 * id: 'workflow-a' | 'workflow-b' | 'workflow-c' | 'processing-a' | 'processing-b' | 'processing-c',
 * fromSha: string,
 * toSha: string,
 * targetTreeSha: string,
 * reconstructedTreeSha: string,
 * archivePath: string,
 * byteSize: number,
 * sha256: string,
 * commitCount: number,
 * pathCount: number
 * }} CarrierPatchEvidence */

/** @typedef {{
 * kind: 'bundle' | 'artifact' | 'inventory' | 'carrier-patch' | 'carrier-manifest',
 * label: string,
 * archivePath: string,
 * byteSize: number,
 * sha256: string
 * }} ArchiveEntry */

/** @typedef {{
 * schemaVersion: 'bob-builtin-analyze/main-consolidation-archive/v1',
 * archiveId: '2026-08-21-main-consolidation',
 * generatedAt: string,
 * inventorySha256: string,
 * entries: ArchiveEntry[],
 * carrierPatches: CarrierPatchEvidence[],
 * bundleVerification: Array<{ label: string, verified: true, headCount: number }>
 * }} ArchiveManifest */

/** @typedef {{
 * archiveId: '2026-08-21-main-consolidation',
 * manifestSha256: string,
 * entryCount: number,
 * bundleCount: 3,
 * carrierPatchCount: 6,
 * verified: true
 * }} ArchiveSummary */
```

---

### Task 1: Publish the approved design and this plan

**Files:**

- Verify: `docs/superpowers/specs/2026-08-21-main-consolidation-and-branch-retirement-design.md`
- Verify: `docs/superpowers/plans/2026-08-21-main-consolidation-control-plane-and-archive.md`

**Interfaces:**

- Consumes: local branch `codex/main-consolidation-control-plane` based on `44027562fe201d47f8f4cf08241ffe29384e9902`.
- Produces: a merged documentation PR and its exact `origin/main` merge SHA; no deleted branch.

- [ ] **Step 1: Verify the branch contains only the approved documents**

```powershell
$baseline = '44027562fe201d47f8f4cf08241ffe29384e9902'
$paths = @(git diff --name-only $baseline HEAD)
$expected = @(
  'docs/superpowers/plans/2026-08-21-main-consolidation-control-plane-and-archive.md',
  'docs/superpowers/specs/2026-08-21-main-consolidation-and-branch-retirement-design.md'
) | Sort-Object
if (@(Compare-Object ($paths | Sort-Object) $expected).Count -ne 0) { throw 'unexpected control-plane documentation diff' }
git status --short --branch
```

Expected: the two paths above and a clean worktree.

- [ ] **Step 2: Run documentation and retirement baselines**

```powershell
$retirementTests = @(Get-ChildItem tools\branch-retirement\test -Filter '*.test.mjs' | Sort-Object Name | ForEach-Object FullName)
node --test $retirementTests
node --test scripts/three-extension-documentation-contract.test.js
git diff --check $baseline..HEAD
```

Expected: 11 retirement tests pass, documentation contract passes, diff check exits 0.

- [ ] **Step 3: Push without deleting any branch**

```powershell
git push --set-upstream origin codex/main-consolidation-control-plane
```

Expected: remote branch head equals local `HEAD`.

- [ ] **Step 4: Open the design/plan PR**

```powershell
gh pr create --repo katamor1/bob_builtin_analyze --base main --head codex/main-consolidation-control-plane --title 'docs: design main branch consolidation' --body '承認済みのmain一本化設計と、非破壊inventory/archiveフェーズの実装計画です。branch、worktree、PR、artifactの削除は含みません。'
$pr = @(gh pr list --repo katamor1/bob_builtin_analyze --state open --head codex/main-consolidation-control-plane --json number,headRefOid | ConvertFrom-Json)
if ($pr.Count -ne 1) { throw 'expected exactly one control-plane PR' }
if ($pr[0].headRefOid -ne (git rev-parse HEAD)) { throw 'PR head does not match local HEAD' }
```

Expected: exactly one PR whose head OID equals local `HEAD`.

- [ ] **Step 5: Wait for exact-head checks and merge**

```powershell
$prNumber = $pr[0].number
gh pr checks $prNumber --repo katamor1/bob_builtin_analyze --watch
gh pr merge $prNumber --repo katamor1/bob_builtin_analyze --squash
git fetch --no-tags origin main
$mainSha = git rev-parse refs/remotes/origin/main
$merged = gh pr view $prNumber --repo katamor1/bob_builtin_analyze --json state,mergedAt,mergeCommit | ConvertFrom-Json
if ($merged.state -ne 'MERGED' -or -not $merged.mergeCommit.oid) { throw 'control-plane PR is not merged' }
if ($mainSha -ne $merged.mergeCommit.oid) { throw 'origin/main does not equal the merged control-plane head' }
```

Expected: PR is merged and exact merge SHA equals fresh `origin/main`. Do not delete `codex/main-consolidation-control-plane`.

### Task 2: Define the immutable consolidation map and pure topology policy

**Files:**

- Create: `tools/main-consolidation/consolidation-map.json`
- Create: `tools/main-consolidation/consolidationPolicy.mjs`
- Create: `tools/main-consolidation/test/consolidationPolicy.test.mjs`

**Interfaces:**

- Consumes: the exact branches, SHAs, PRs, carrier ranges, and process branch in “Frozen topology contract”.
- Produces:
  - `validateConsolidationMap(map): object`
  - `flattenLegacyHeads(map): Array<{ branch, expectedSha, owner }>`
  - `assessTopology({ map, mainSha, baselineIsAncestor, remoteRefs, openPullRequests, processRefs }): TopologyAssessment`

- [ ] **Step 1: Create a fresh isolated execution worktree**

```powershell
$repo = 'C:\Users\stell\source\repos\bob_builtin_analyze'
$worktree = Join-Path $repo '.worktrees\main-consolidation-inventory-archive'
if (Test-Path -LiteralPath $worktree) { throw "worktree path already exists: $worktree" }
if (@(git -C $repo branch --list 'codex/main-consolidation-inventory-archive').Count -ne 0) { throw 'execution branch already exists' }
git -C $repo fetch --no-tags origin main
git -C $repo worktree add $worktree -b codex/main-consolidation-inventory-archive refs/remotes/origin/main
git -C $worktree status --short --branch
```

Expected: clean branch at fresh `origin/main`; existing root and feature worktrees remain unchanged.

- [ ] **Step 2: Write the failing map-policy tests**

```javascript
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { assessTopology, flattenLegacyHeads, validateConsolidationMap } from '../consolidationPolicy.mjs'

const map = JSON.parse(await readFile(new URL('../consolidation-map.json', import.meta.url), 'utf8'))

test('the frozen map owns all 30 legacy remote heads exactly once', () => {
  validateConsolidationMap(map)
  const heads = flattenLegacyHeads(map)
  assert.equal(heads.length, 30)
  assert.equal(new Set(heads.map((entry) => entry.branch)).size, 30)
  assert.deepEqual(
    [...new Set(map.carriers.flatMap((carrier) => carrier.pullRequests))].sort((a, b) => a - b),
    [143,145,146,147,148,149,150,151,152,153,154,155,157,158,159,160,161,162,163,164]
  )
})

test('topology assessment rejects an unexpected remote branch', () => {
  const remoteRefs = new Map(flattenLegacyHeads(map).map((entry) => [entry.branch, entry.expectedSha]))
  remoteRefs.set('main', map.baselineMain)
  remoteRefs.set('unknown/branch', '1'.repeat(40))
  assert.throws(() => assessTopology({
    map,
    mainSha: map.baselineMain,
    baselineIsAncestor: true,
    remoteRefs,
    openPullRequests: map.carriers.flatMap((carrier) => carrier.branches
      .filter((entry) => Number.isInteger(entry.pullRequest))
      .map((entry) => ({
        number: entry.pullRequest,
        headRefName: entry.branch,
        headRefOid: entry.expectedSha,
        baseRefName: entry.baseBranch
      }))),
    processRefs: new Map()
  }), /unexpected remote branch/)
})
```

- [ ] **Step 3: Run the tests to capture RED**

```powershell
node --test tools/main-consolidation/test/consolidationPolicy.test.mjs
```

Expected: FAIL because `consolidationPolicy.mjs` and the map do not exist.

- [ ] **Step 4: Create the exact map**

Create `consolidation-map.json` with schema `bob-builtin-analyze/main-consolidation-map/v1`, repository `katamor1/bob_builtin_analyze`, baseline main `44027562fe201d47f8f4cf08241ffe29384e9902`, process branch `codex/main-consolidation-control-plane`, and the six carriers plus checkpoint/triage/merged-XLSX entries listed in “Frozen topology contract”. Every carrier entry has this shape:

```json
{
  "id": "workflow-a",
  "fromSha": "56ba084d07f1641fa0454fe1da024f14fe99fd37",
  "toSha": "683e794eb4a39eea7bc3630bedbd2a557f4af8af",
  "pullRequests": [143, 148, 149, 151],
  "branches": [
    {
      "branch": "codex/workflow-contract-v2-f7",
      "expectedSha": "2af41862b61d3e0f53218cc0f760b19292870a3b",
      "pullRequest": 143,
      "baseBranch": "main"
    }
  ]
}
```

The other three categories use `{ "branch", "expectedSha", "owner" }`. Do not infer entries from a prefix at runtime.

- [ ] **Step 5: Implement the minimal pure policy**

```javascript
const MAP_SCHEMA = 'bob-builtin-analyze/main-consolidation-map/v1'
const SHA = /^[0-9a-f]{40}$/u

export function flattenLegacyHeads(map) {
  return [
    ...map.carriers.flatMap((carrier) => carrier.branches.map(({ branch, expectedSha }) => ({ branch, expectedSha, owner: carrier.id }))),
    ...map.checkpoints,
    ...map.independentTriage,
    ...map.mergedXlsx
  ]
}

export function validateConsolidationMap(map) {
  if (map?.schemaVersion !== MAP_SCHEMA) throw new Error('unsupported consolidation map schema')
  if (map.repository !== 'katamor1/bob_builtin_analyze') throw new Error('unexpected repository')
  if (!SHA.test(map.baselineMain ?? '')) throw new Error('invalid baseline main SHA')
  if (!Array.isArray(map.carriers) || map.carriers.length !== 6) throw new Error('exactly six carriers are required')
  const heads = flattenLegacyHeads(map)
  if (heads.length !== 30) throw new Error('exactly 30 legacy remote heads are required')
  if (new Set(heads.map((entry) => entry.branch)).size !== heads.length) throw new Error('duplicate legacy branch')
  for (const entry of heads) if (!SHA.test(entry.expectedSha ?? '')) throw new Error(`invalid SHA for ${entry.branch}`)
  return map
}

export function assessTopology({ map, mainSha, baselineIsAncestor, remoteRefs, openPullRequests, processRefs }) {
  validateConsolidationMap(map)
  if (!SHA.test(mainSha) || baselineIsAncestor !== true) throw new Error('main does not contain the approved baseline')
  if (remoteRefs.get('main') !== mainSha) throw new Error('remote main observation does not match the audited main SHA')
  const expected = new Map(flattenLegacyHeads(map).map((entry) => [entry.branch, entry]))
  for (const [name, sha] of processRefs) {
    if (!map.processBranches.includes(name)) throw new Error(`unexpected process branch: ${name}`)
    if (remoteRefs.get(name) !== sha) throw new Error(`process branch observation mismatch: ${name}`)
  }
  const allowed = new Set(['main', ...expected.keys(), ...processRefs.keys()])
  for (const name of remoteRefs.keys()) if (!allowed.has(name)) throw new Error(`unexpected remote branch: ${name}`)
  for (const [name, entry] of expected) {
    if (remoteRefs.get(name) !== entry.expectedSha) throw new Error(`remote branch moved or disappeared: ${name}`)
  }
  const expectedPrs = [...new Set(map.carriers.flatMap((carrier) => carrier.pullRequests))].sort((a, b) => a - b)
  const observedPrs = openPullRequests.map((pr) => pr.number).sort((a, b) => a - b)
  if (JSON.stringify(expectedPrs) !== JSON.stringify(observedPrs)) throw new Error('open pull request set does not match the frozen map')
  const mappedPrs = new Map(map.carriers.flatMap((carrier) => carrier.branches
    .filter((entry) => Number.isInteger(entry.pullRequest))
    .map((entry) => [entry.pullRequest, entry])))
  for (const pr of openPullRequests) {
    const mapped = mappedPrs.get(pr.number)
    if (pr.headRefName !== mapped.branch || pr.headRefOid !== mapped.expectedSha || pr.baseRefName !== mapped.baseBranch) {
      throw new Error(`pull request mapping mismatch: #${pr.number}`)
    }
  }
  return { readyForArchive: true, mainSha, legacyHeadCount: expected.size, processHeadCount: processRefs.size, openPullRequestCount: observedPrs.length }
}
```

Complete `assessTopology` by indexing observed PRs by number and requiring `headRefName`, `headRefOid`, and `baseRefName` to equal the mapped `branch`, `expectedSha`, and `baseBranch`. Extend the tests in Step 2 to reject duplicate names, invalid SHA, wrong carrier count, missing/moved branch, baseline ancestry failure, PR head/base/SHA mismatch, duplicate PR ownership, and a process ref not named in `map.processBranches`.

- [ ] **Step 6: Run GREEN and commit**

```powershell
node --test tools/main-consolidation/test/consolidationPolicy.test.mjs
git diff --check
git add tools/main-consolidation/consolidation-map.json tools/main-consolidation/consolidationPolicy.mjs tools/main-consolidation/test/consolidationPolicy.test.mjs
git commit -m 'feat: define main consolidation topology'
```

Expected: all policy tests pass and the commit contains only the three files.

### Task 3: Implement the read-only inventory CLI

**Files:**

- Create: `tools/main-consolidation/capture-main-consolidation-inventory.mjs`
- Create: `tools/main-consolidation/test/capture-main-consolidation-inventory.test.mjs`

**Interfaces:**

- Consumes: `validateConsolidationMap`, `assessTopology`, `consolidation-map.json`, Git/GitHub observations.
- Produces:
  - `parseRemoteRefs(text): Map<string,string>`
  - `parseWorktreePorcelain(text): Array<WorktreeRecord>`
  - `inventoryFromObservations(input): InventoryEvidence`
  - `renderInventoryMarkdown(evidence): string`
  - CLI JSON schema `bob-builtin-analyze/main-consolidation-inventory/v1`

- [ ] **Step 1: Write failing parser and fail-closed tests**

```javascript
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  inventoryFromObservations,
  parseRemoteRefs,
  parseWorktreePorcelain,
  renderInventoryMarkdown
} from '../capture-main-consolidation-inventory.mjs'

test('parses exact heads without accepting symbolic or malformed refs', () => {
  assert.deepEqual([...parseRemoteRefs(`${'a'.repeat(40)}\trefs/heads/main\n`)], [['main', 'a'.repeat(40)]])
  assert.throws(() => parseRemoteRefs('ref: refs/heads/main\tHEAD\n'), /invalid remote head/)
})

test('inventory records dirty state and blocks archive readiness', () => {
  const evidence = inventoryFromObservations({
    topology: { readyForArchive: true },
    primaryStatus: ['?? .integration-xlsx-on-prereq/'],
    worktrees: [{ path: 'C:/repo', head: 'a'.repeat(40), branch: 'refs/heads/main', status: [] }],
    externalRepositories: [{ label: 'integration-xlsx-on-prereq', head: 'b'.repeat(40), branch: 'codex/fix-bazaar-minimal-xlsx-final', status: [' M file.txt'] }],
    artifacts: []
  })
  assert.equal(evidence.readyForArchive, false)
  assert.match(renderInventoryMarkdown(evidence), /integration-xlsx-on-prereq.*dirty/u)
})
```

- [ ] **Step 2: Run RED**

```powershell
node --test tools/main-consolidation/test/capture-main-consolidation-inventory.test.mjs
```

Expected: FAIL because the inventory module does not exist.

- [ ] **Step 3: Implement observation-only collection**

The CLI runs these commands with argv arrays and does not write Git refs:

```text
git fetch --no-tags origin +refs/heads/*:refs/remotes/origin/*
git rev-parse refs/remotes/origin/main
git merge-base --is-ancestor 44027562fe201d47f8f4cf08241ffe29384e9902 refs/remotes/origin/main
git ls-remote --heads origin
git for-each-ref --sort=refname --format=%(refname:short)%09%(objectname) refs/heads
git worktree list --porcelain
git status --porcelain=v1
gh api repos/katamor1/bob_builtin_analyze --jq .default_branch
gh pr list --repo katamor1/bob_builtin_analyze --state open --limit 100 --json number,headRefName,headRefOid,baseRefName,url,title
```

For each registered worktree, call `run('git', ['-C', worktree.path, 'status', '--porcelain=v1'])`. For `.integration-xlsx-on-prereq` call `run('git', ['-c', `safe.directory=${external.path}`, '-C', external.path, 'status', '--porcelain=v1'])`; do not edit global Git config. For artifact sources use `lstat`, regular-file validation, size, and SHA-256. Reuse `atomicWriteText` from `tools/branch-retirement/audit-branch-retirement.mjs` for tracked JSON/Markdown writes.

The CLI interface is:

```text
node tools/main-consolidation/capture-main-consolidation-inventory.mjs
  --repository katamor1/bob_builtin_analyze
  --remote origin
  --map tools/main-consolidation/consolidation-map.json
  --external-repository integration-xlsx-on-prereq=C:\Users\stell\source\repos\bob_builtin_analyze\.integration-xlsx-on-prereq
  --external-repository accepted-main=C:\Users\stell\AppData\Local\Temp\bob-ooxml-final-main-44027562
  --artifact old-vsix=C:\Users\stell\source\repos\bob_builtin_analyze\.integration-xlsx-on-prereq\extensions\bob-bazaar-review\bob-bazaar-review-0.3.0.vsix
  --artifact accepted-vsix=C:\Users\stell\AppData\Local\Temp\bob-review-ooxml-final-44027562\bazaar-core\accepted-artifacts\bob-bazaar-review-0.3.0-main-44027562.vsix
  --json docs/release-evidence/main-consolidation-inventory-2026-08-21.json
  --markdown docs/release-evidence/main-consolidation-inventory-2026-08-21.md
```

Repeated `--external-repository` and `--artifact` arguments are parsed into ordered arrays. Reject duplicate labels, relative paths, missing paths, symlinks/junctions, non-regular artifact files, credential-bearing output, unexpected remote refs, moved heads, PR mapping mismatch, and dirty registered/external repositories. The primary root is allowed to contain exactly the known untracked `.integration-xlsx-on-prereq/` entry and nothing else.

- [ ] **Step 4: Add CLI runner tests**

Use an injected `run(command, args, options)` fake. Assert the command sequence above, command-local safe-directory use, no global `git config`, no delete/push/checkout/reset command, atomic JSON/Markdown writes, and sanitized failures. Add a mutation-sensitive test where the fake inserts `unknown/branch`; the CLI must return nonzero before writing `readyForArchive: true`.

- [ ] **Step 5: Run GREEN and commit**

```powershell
node --test tools/main-consolidation/test/consolidationPolicy.test.mjs tools/main-consolidation/test/capture-main-consolidation-inventory.test.mjs
git diff --check
git add tools/main-consolidation/capture-main-consolidation-inventory.mjs tools/main-consolidation/test/capture-main-consolidation-inventory.test.mjs
git commit -m 'feat: capture main consolidation inventory'
```

Expected: all main-consolidation tests pass.

### Task 4: Implement write-once archive creation

**Files:**

- Create: `tools/main-consolidation/archivePolicy.mjs`
- Create: `tools/main-consolidation/create-main-consolidation-archive.mjs`
- Create: `tools/main-consolidation/test/archivePolicy.test.mjs`
- Create: `tools/main-consolidation/test/create-main-consolidation-archive.test.mjs`

**Interfaces:**

- Consumes: a ready inventory JSON, exact archive root, explicit repository/artifact source lists.
- Produces:
  - `validateArchiveRequest({ repoRoot, archiveRoot, expectedLeaf, inventory }): true`
  - `assertArchiveDestinationAvailable({ archiveRoot, exists }): true`
  - `hashFile(filePath): Promise<{ byteSize, sha256 }>`
  - `buildArchiveManifest(entries): ArchiveManifest`
  - `verifyExistingArchive({ archiveRoot, manifest }): Promise<ArchiveSummary>`
  - CLI local schema `bob-builtin-analyze/main-consolidation-archive/v1`

- [ ] **Step 1: Write failing safety-policy tests**

```javascript
import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { assertArchiveDestinationAvailable, validateArchiveRequest } from '../archivePolicy.mjs'

test('archive root must be outside the repository and use the exact leaf', () => {
  const repoRoot = path.resolve('repo')
  assert.throws(() => validateArchiveRequest({
    repoRoot,
    archiveRoot: path.join(repoRoot, 'archive'),
    expectedLeaf: '2026-08-21-main-consolidation',
    inventory: { readyForArchive: true }
  }), /outside the repository/)
})

test('archive creation refuses an existing final root', () => {
  assert.throws(() => assertArchiveDestinationAvailable({
    archiveRoot: path.resolve('archives', '2026-08-21-main-consolidation'),
    exists: () => true
  }), /already exists/)
})
```

- [ ] **Step 2: Run RED**

```powershell
node --test tools/main-consolidation/test/archivePolicy.test.mjs tools/main-consolidation/test/create-main-consolidation-archive.test.mjs
```

Expected: FAIL because archive modules do not exist.

- [ ] **Step 3: Implement path and source safety**

```javascript
export function validateArchiveRequest({ repoRoot, archiveRoot, expectedLeaf, inventory }) {
  const repository = path.resolve(repoRoot)
  const target = path.resolve(archiveRoot)
  const relative = path.relative(repository, target)
  if (relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..')) {
    throw new Error('archive root must stay outside the repository')
  }
  if (path.basename(target) !== expectedLeaf) throw new Error('archive root leaf does not match the approved name')
  if (inventory?.readyForArchive !== true) throw new Error('inventory is not ready for archive')
  return true
}

export function assertArchiveDestinationAvailable({ archiveRoot, exists }) {
  if (exists(archiveRoot)) throw new Error(`archive root already exists: ${archiveRoot}`)
  return true
}
```

Before copying, resolve and `lstat` every source. Reject source symlinks/junctions and directories supplied as artifacts. Read each regular file through one open handle, compare BigInt stat before/after, hash the read bytes, copy with exclusive create, then hash the destination and require equality.

- [ ] **Step 4: Implement staged archive publishing**

The CLI creates a sibling staging directory named `.2026-08-21-main-consolidation.staging-${process.pid}-${randomUUID()}` with exclusive creation, writes `.archive-incomplete`, and never removes an existing final/staging directory. It then:

1. creates `bundles/repository-all-refs.bundle` with `git bundle create ... --all`;
2. creates `bundles/integration-xlsx-on-prereq-all-refs.bundle` using command-local safe.directory;
3. creates `bundles/accepted-main-all-refs.bundle`;
4. runs `git bundle verify` and `git bundle list-heads` for each bundle;
5. copies each explicit artifact into `artifacts/${artifact.label}/${path.basename(artifact.sourcePath)}` with exclusive create;
6. writes `inventory/remote-heads-before.txt`, `local-branches-before.txt`, `worktrees-before.txt`, and `open-prs-before.json` from the approved inventory;
7. writes sorted `archive-manifest.json` and detached `archive-manifest.sha256`;
8. removes only the tool-created `.archive-incomplete` file;
9. atomically renames the staging directory to the final archive root.

On failure, the final root must remain absent and the uniquely named staging directory remains for diagnosis. The CLI must not delete source or staging content.

Add `--verify-existing` mode for recovery after successful archive publication but failed tracked-summary writing. This mode requires an existing final root, rehashes every manifest entry, reruns all bundle verification, writes only the requested repository summary files, and never copies, renames, or deletes archive content. Normal create mode continues to reject an existing final root.

- [ ] **Step 5: Add restore and mutation-sensitive tests**

Create a small temporary Git repository with two branches and an unmerged commit. Run the real Git bundle path, clone/fetch from the bundle into a tool-created `mkdtemp` directory, and assert both exact heads are recoverable. Mutate a copied artifact after source hashing in the fake hook and assert publication fails. Also verify source bytes/stat are unchanged, destination collision fails, a dirty external repository fails, bundle verification failure prevents publish, the manifest is path-sorted and deterministic when `generatedAt` is injected, and `--verify-existing` succeeds without invoking copy/bundle-create/rename/delete.

- [ ] **Step 6: Run GREEN and commit**

```powershell
node --test tools/main-consolidation/test/archivePolicy.test.mjs tools/main-consolidation/test/create-main-consolidation-archive.test.mjs
git diff --check
git add tools/main-consolidation/archivePolicy.mjs tools/main-consolidation/create-main-consolidation-archive.mjs tools/main-consolidation/test/archivePolicy.test.mjs tools/main-consolidation/test/create-main-consolidation-archive.test.mjs
git commit -m 'feat: create verified consolidation archive'
```

Expected: policy, copy-integrity, bundle restore, and no-overwrite tests pass.

### Task 5: Freeze and verify the six carrier patches

**Files:**

- Create: `tools/main-consolidation/carrierPatchPolicy.mjs`
- Create: `tools/main-consolidation/freeze-carrier-patches.mjs`
- Create: `tools/main-consolidation/test/carrierPatchPolicy.test.mjs`
- Create: `tools/main-consolidation/test/freeze-carrier-patches.test.mjs`
- Modify: `tools/main-consolidation/create-main-consolidation-archive.mjs`
- Modify: `tools/main-consolidation/test/create-main-consolidation-archive.test.mjs`

**Interfaces:**

- Consumes: validated map, local Git object database, archive staging `carrier-patches/`.
- Produces:
  - `validateCarrier(carrier): true`
  - `carrierPatchName(id): string`
  - `verifyPatchedTree({ fromSha, toSha, patchPath, run, temporaryIndex }): CarrierPatchEvidence`
  - `freezeCarrierPatches({ map, repoRoot, carrierDirectory, run }): Promise<Array<CarrierPatchEvidence>>`
  - `carrier-patches.json` with exact range, SHA-256, byte size, commit count, path count, and reconstructed tree SHA.

- [ ] **Step 1: Write failing pure-policy tests**

```javascript
import assert from 'node:assert/strict'
import test from 'node:test'
import { carrierPatchName, validateCarrier } from '../carrierPatchPolicy.mjs'

test('carrier IDs map to fixed safe patch names', () => {
  assert.equal(carrierPatchName('workflow-a'), 'workflow-a.patch')
  assert.throws(() => carrierPatchName('../escape'), /invalid carrier id/)
})

test('carrier requires distinct exact SHAs and a non-empty PR or prerequisite mapping', () => {
  assert.throws(() => validateCarrier({ id: 'workflow-a', fromSha: 'a'.repeat(40), toSha: 'a'.repeat(40), pullRequests: [] }), /distinct/)
})
```

- [ ] **Step 2: Run RED**

```powershell
node --test tools/main-consolidation/test/carrierPatchPolicy.test.mjs tools/main-consolidation/test/freeze-carrier-patches.test.mjs
```

Expected: FAIL because carrier patch modules do not exist.

- [ ] **Step 3: Implement patch generation with exact argv**

For each carrier, run:

```javascript
run('git', ['cat-file', '-e', `${carrier.fromSha}^{commit}`])
run('git', ['cat-file', '-e', `${carrier.toSha}^{commit}`])
run('git', ['merge-base', '--is-ancestor', carrier.fromSha, carrier.toSha])
run('git', ['diff', '--binary', '--full-index', `--output=${temporaryPatch}`, carrier.fromSha, carrier.toSha])
run('git', ['rev-list', '--count', `${carrier.fromSha}..${carrier.toSha}`])
run('git', ['diff', '--name-only', carrier.fromSha, carrier.toSha])
run('git', ['rev-parse', `${carrier.toSha}^{tree}`])
```

Do not pass through a shell. Patch output uses exclusive creation: create a unique temporary patch file, hash it, then rename it to `carrier-patches/${carrierPatchName(carrier.id)}` only if the target is absent.

- [ ] **Step 4: Verify each patch reconstructs the target tree**

Use a unique temporary index outside the repository working tree:

```javascript
run('git', ['read-tree', carrier.fromSha], { env: { ...process.env, GIT_INDEX_FILE: temporaryIndex } })
run('git', ['apply', '--cached', patchPath], { env: { ...process.env, GIT_INDEX_FILE: temporaryIndex } })
run('git', ['write-tree'], { env: { ...process.env, GIT_INDEX_FILE: temporaryIndex } })
```

The returned tree SHA must equal `run('git', ['rev-parse', `${carrier.toSha}^{tree}`])`. Delete only the exact tool-created temporary index after verification. Assert repository status before and after is byte-identical.

- [ ] **Step 5: Add a real synthetic repository test**

The test repository contains a text edit, executable-mode change, rename, deletion, and binary file. Freeze a patch, reconstruct through a temporary index, and assert the target tree matches. Mutations that omit `--binary`, swap from/to, alter one patch byte, or skip the tree comparison must make the test fail.

- [ ] **Step 6: Integrate patch freezing into archive publication**

After bundle verification and artifact copying but before `archive-manifest.json`, `create-main-consolidation-archive.mjs` calls `freezeCarrierPatches()` with `path.join(stagingRoot, 'carrier-patches')`. Include `carrier-patches.json` and all six patch files in the archive hash manifest. If any range, reconstruction, or hash check fails, final archive publication must not occur. Extend the archive CLI test to assert exactly six carrier evidence entries and to fail before final rename when one target tree differs.

- [ ] **Step 7: Run GREEN and commit**

```powershell
node --test tools/main-consolidation/test/carrierPatchPolicy.test.mjs tools/main-consolidation/test/freeze-carrier-patches.test.mjs tools/main-consolidation/test/create-main-consolidation-archive.test.mjs
git diff --check
git add tools/main-consolidation/carrierPatchPolicy.mjs tools/main-consolidation/freeze-carrier-patches.mjs tools/main-consolidation/test/carrierPatchPolicy.test.mjs tools/main-consolidation/test/freeze-carrier-patches.test.mjs tools/main-consolidation/create-main-consolidation-archive.mjs tools/main-consolidation/test/create-main-consolidation-archive.test.mjs
git commit -m 'feat: freeze verified carrier patches'
```

Expected: all six-carrier policy and synthetic reconstruction tests pass.

### Task 6: Capture the live inventory and publish the durable archive

**Files:**

- Create: `docs/release-evidence/main-consolidation-inventory-2026-08-21.json`
- Create: `docs/release-evidence/main-consolidation-inventory-2026-08-21.md`
- Create: `docs/release-evidence/main-consolidation-archive-2026-08-21.json`
- Create: `docs/release-evidence/main-consolidation-archive-2026-08-21.md`
- External create: `C:\Users\stell\source\archives\bob_builtin_analyze\2026-08-21-main-consolidation`

**Interfaces:**

- Consumes: Tasks 2–5 CLIs, the live refs/PRs/worktrees, and exact evidence sources below.
- Produces: ready inventory, verified external archive, six frozen patches, tracked sanitized archive summary.

- [ ] **Step 1: Reconfirm all source paths and the empty target**

```powershell
$archive = 'C:\Users\stell\source\archives\bob_builtin_analyze\2026-08-21-main-consolidation'
if (Test-Path -LiteralPath $archive) { throw "approved archive root already exists: $archive" }
$sources = @(
  'C:\Users\stell\source\repos\bob_builtin_analyze\.integration-xlsx-on-prereq',
  'C:\Users\stell\AppData\Local\Temp\bob-ooxml-final-main-44027562',
  'C:\Users\stell\source\repos\bob_builtin_analyze\.integration-xlsx-on-prereq\extensions\bob-bazaar-review\bob-bazaar-review-0.3.0.vsix',
  'C:\Users\stell\AppData\Local\Temp\bob-review-ooxml-final-44027562\bazaar-core\accepted-artifacts\bob-bazaar-review-0.3.0-main-44027562.vsix',
  'C:\Users\stell\AppData\Local\Temp\bob-review-ooxml-final-44027562\bazaar-core\operator-result.json',
  'C:\Users\stell\AppData\Local\Temp\bob-review-ooxml-final-44027562\bazaar-core\PRA-WIN-001-evidence.json',
  'C:\Users\stell\AppData\Local\Temp\bob-review-ooxml-final-44027562\bazaar-core\scenario-manifest.json',
  'C:\Users\stell\AppData\Local\Temp\bob-review-ooxml-final-44027562\bazaar-core\input-documents\document-fixture-manifest.json',
  'C:\Users\stell\AppData\Local\Temp\bob-review-ooxml-final-44027562\bazaar-core\input-documents\project-review-rules.docx',
  'C:\Users\stell\AppData\Local\Temp\bob-review-ooxml-final-44027562\bazaar-core\input-documents\review-traceability-ledger.xlsx',
  'C:\Users\stell\AppData\Local\Temp\bob-review-ooxml-final-44027562\bazaar-core\input-documents\system-review-guidelines.pdf',
  'C:\Users\stell\AppData\Local\Temp\bob-review-ooxml-final-44027562\_logs\bazaar-core.log'
)
foreach ($source in $sources) { if (-not (Test-Path -LiteralPath $source)) { throw "missing archive source: $source" } }
```

Expected: all sources exist and final archive root is absent.

- [ ] **Step 2: Capture inventory**

Run `capture-main-consolidation-inventory.mjs` with the exact repository, map, external repositories, old/accepted VSIX, and tracked JSON/Markdown paths from Task 3. Add the remaining evidence files as repeated `--artifact` arguments using labels `operator-result`, `pra-win-001-evidence`, `scenario-manifest`, `fixture-manifest`, `fixture-docx`, `fixture-xlsx`, `fixture-pdf`, and `bazaar-core-log`.

```powershell
node tools/main-consolidation/capture-main-consolidation-inventory.mjs --repository katamor1/bob_builtin_analyze --remote origin --map tools/main-consolidation/consolidation-map.json --external-repository 'integration-xlsx-on-prereq=C:\Users\stell\source\repos\bob_builtin_analyze\.integration-xlsx-on-prereq' --external-repository 'accepted-main=C:\Users\stell\AppData\Local\Temp\bob-ooxml-final-main-44027562' --artifact 'old-vsix=C:\Users\stell\source\repos\bob_builtin_analyze\.integration-xlsx-on-prereq\extensions\bob-bazaar-review\bob-bazaar-review-0.3.0.vsix' --artifact 'accepted-vsix=C:\Users\stell\AppData\Local\Temp\bob-review-ooxml-final-44027562\bazaar-core\accepted-artifacts\bob-bazaar-review-0.3.0-main-44027562.vsix' --artifact 'operator-result=C:\Users\stell\AppData\Local\Temp\bob-review-ooxml-final-44027562\bazaar-core\operator-result.json' --artifact 'pra-win-001-evidence=C:\Users\stell\AppData\Local\Temp\bob-review-ooxml-final-44027562\bazaar-core\PRA-WIN-001-evidence.json' --artifact 'scenario-manifest=C:\Users\stell\AppData\Local\Temp\bob-review-ooxml-final-44027562\bazaar-core\scenario-manifest.json' --artifact 'fixture-manifest=C:\Users\stell\AppData\Local\Temp\bob-review-ooxml-final-44027562\bazaar-core\input-documents\document-fixture-manifest.json' --artifact 'fixture-docx=C:\Users\stell\AppData\Local\Temp\bob-review-ooxml-final-44027562\bazaar-core\input-documents\project-review-rules.docx' --artifact 'fixture-xlsx=C:\Users\stell\AppData\Local\Temp\bob-review-ooxml-final-44027562\bazaar-core\input-documents\review-traceability-ledger.xlsx' --artifact 'fixture-pdf=C:\Users\stell\AppData\Local\Temp\bob-review-ooxml-final-44027562\bazaar-core\input-documents\system-review-guidelines.pdf' --artifact 'bazaar-core-log=C:\Users\stell\AppData\Local\Temp\bob-review-ooxml-final-44027562\_logs\bazaar-core.log' --json docs/release-evidence/main-consolidation-inventory-2026-08-21.json --markdown docs/release-evidence/main-consolidation-inventory-2026-08-21.md
```

Expected: `readyForArchive: true`; legacy heads 30; open PRs 20; no unexpected remote; all registered/external repositories clean except the explicitly allowed root entry.

- [ ] **Step 3: Create bundles, copy evidence, and freeze patches**

```powershell
node tools/main-consolidation/create-main-consolidation-archive.mjs --inventory docs/release-evidence/main-consolidation-inventory-2026-08-21.json --map tools/main-consolidation/consolidation-map.json --archive-root 'C:\Users\stell\source\archives\bob_builtin_analyze\2026-08-21-main-consolidation' --repository-root 'C:\Users\stell\source\repos\bob_builtin_analyze' --bundle-repository 'integration-xlsx-on-prereq=C:\Users\stell\source\repos\bob_builtin_analyze\.integration-xlsx-on-prereq' --bundle-repository 'accepted-main=C:\Users\stell\AppData\Local\Temp\bob-ooxml-final-main-44027562' --summary-json docs/release-evidence/main-consolidation-archive-2026-08-21.json --summary-markdown docs/release-evidence/main-consolidation-archive-2026-08-21.md
```

The archive CLI reads artifact sources from the signed inventory instead of accepting a second copy of the path list. It calls `freeze-carrier-patches.mjs` through its exported function before final publish; it does not spawn a shell command string.

Expected: final archive exists once, three bundles verify, six patches reconstruct their exact target trees, and all copied hashes match the inventory.

- [ ] **Step 4: Independently verify artifact invariants**

```powershell
$old = 'C:\Users\stell\source\archives\bob_builtin_analyze\2026-08-21-main-consolidation\artifacts\old-vsix\bob-bazaar-review-0.3.0.vsix'
$accepted = 'C:\Users\stell\source\archives\bob_builtin_analyze\2026-08-21-main-consolidation\artifacts\accepted-vsix\bob-bazaar-review-0.3.0-main-44027562.vsix'
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $old).Hash -ne 'CE335C40F2D2A003B932134C02A2875E3996C6C7409863B9CF14956DCA7C0D85') { throw 'old VSIX hash mismatch' }
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $accepted).Hash -ne '4E0A9961FA1CD50882CAA89D3EEECC9BCFC8A31871A5ECA6262A37D99700A1DC') { throw 'accepted VSIX hash mismatch' }
git bundle verify 'C:\Users\stell\source\archives\bob_builtin_analyze\2026-08-21-main-consolidation\bundles\repository-all-refs.bundle'
git bundle list-heads 'C:\Users\stell\source\archives\bob_builtin_analyze\2026-08-21-main-consolidation\bundles\repository-all-refs.bundle'
```

Expected: both exact hashes and bundle verification succeed.

- [ ] **Step 5: Commit only tracked evidence**

```powershell
git add docs/release-evidence/main-consolidation-inventory-2026-08-21.json docs/release-evidence/main-consolidation-inventory-2026-08-21.md docs/release-evidence/main-consolidation-archive-2026-08-21.json docs/release-evidence/main-consolidation-archive-2026-08-21.md
git commit -m 'docs: record pre-consolidation archive'
```

Expected: no bundle, VSIX, fixture binary, temp file, or absolute source file is staged in the repository.

### Task 7: Run the control-plane acceptance gates

**Files:**

- Verify: `tools/main-consolidation/**`
- Verify: `docs/release-evidence/main-consolidation-*-2026-08-21.*`
- Verify: external archive root

**Interfaces:**

- Consumes: all preceding tasks.
- Produces: a clean, independently reviewable control-plane branch ready for PR.

- [ ] **Step 1: Run all focused tests in a fresh process**

```powershell
$mainTests = @(Get-ChildItem tools\main-consolidation\test -Filter '*.test.mjs' | Sort-Object Name | ForEach-Object FullName)
$retirementTests = @(Get-ChildItem tools\branch-retirement\test -Filter '*.test.mjs' | Sort-Object Name | ForEach-Object FullName)
node --test $mainTests $retirementTests
```

Expected: all tests pass; no skipped or cancelled main-consolidation test.

- [ ] **Step 2: Run repository documentation and hygiene gates**

```powershell
node --test scripts/three-extension-documentation-contract.test.js
node --test scripts/real-machine-input-document-fixtures.test.js
git diff --check
git status --short --branch
```

Expected: both suites pass, diff check exits 0, and only intentional commits are present.

- [ ] **Step 3: Prove no source or destructive ref mutation**

```powershell
$base = git merge-base refs/remotes/origin/main HEAD
$changed = @(git diff --name-only $base HEAD)
$invalid = @($changed | Where-Object { $_ -notmatch '^(tools/main-consolidation/|docs/release-evidence/)' })
if ($invalid.Count -ne 0) { $invalid; throw 'unexpected product or repository file changed' }
git ls-remote --heads origin | Sort-Object
gh pr list --repo katamor1/bob_builtin_analyze --state open --limit 100 --json number,headRefName,headRefOid,baseRefName
git worktree list --porcelain
```

Expected: changed paths are only tool/evidence paths; the 30 legacy remote heads and 20 legacy PRs still exist; all pre-existing worktrees remain.

- [ ] **Step 4: Run independent review**

Reviewer checks:

1. exact map owns all 30 legacy heads and all 20 open PRs;
2. an unexpected/moved ref cannot produce `readyForArchive: true`;
3. archive cannot overwrite or delete anything;
4. source and destination hashes are checked around copy;
5. bundles preserve unmerged/local-only heads;
6. each patch reconstructs the exact `toSha` tree;
7. no credential, token, or unsafe remote URL is logged;
8. no personal absolute source path is included in Markdown beyond the approved archive/evidence locator fields;
9. no branch, worktree, PR, clone, or artifact was deleted or closed.

Expected review verdict: Critical 0 / Important 0.

### Task 8: Publish and merge the inventory/archive PR

**Files:**

- Push: committed `tools/main-consolidation/**`
- Push: committed `docs/release-evidence/main-consolidation-*-2026-08-21.*`

**Interfaces:**

- Consumes: clean reviewed branch from Task 7.
- Produces: merged control-plane tooling/evidence on main and exact merge SHA; no cleanup.

- [ ] **Step 1: Push and create the PR**

```powershell
git push --set-upstream origin codex/main-consolidation-inventory-archive
gh pr create --repo katamor1/bob_builtin_analyze --base main --head codex/main-consolidation-inventory-archive --title 'chore: freeze pre-consolidation inventory and archive' --body '全legacy ref、open PR、worktree、VSIX、実機証跡を非破壊で棚卸しし、外部bundle/archiveと6本の検証済みcarrier patchを凍結します。削除・PR close・製品コード変更は含みません。'
```

- [ ] **Step 2: Bind checks to the exact PR head**

```powershell
$pr = @(gh pr list --repo katamor1/bob_builtin_analyze --state open --head codex/main-consolidation-inventory-archive --json number,headRefOid | ConvertFrom-Json)
if ($pr.Count -ne 1) { throw 'expected exactly one inventory/archive PR' }
$localHead = git rev-parse HEAD
if ($pr[0].headRefOid -ne $localHead) { throw 'PR head mismatch' }
gh pr checks $pr[0].number --repo katamor1/bob_builtin_analyze --watch
```

Expected: all required checks pass against `$localHead`.

- [ ] **Step 3: Re-run archive hash verification after CI**

```powershell
$manifest = Get-Content -LiteralPath 'C:\Users\stell\source\archives\bob_builtin_analyze\2026-08-21-main-consolidation\archive-manifest.json' -Raw | ConvertFrom-Json
foreach ($entry in $manifest.entries) {
  $path = Join-Path 'C:\Users\stell\source\archives\bob_builtin_analyze\2026-08-21-main-consolidation' $entry.archivePath
  if ((Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash.ToLowerInvariant() -ne $entry.sha256) { throw "archive drift: $($entry.archivePath)" }
}
```

Expected: every archived entry still matches the committed summary.

- [ ] **Step 4: Merge without branch deletion**

```powershell
gh pr merge $pr[0].number --repo katamor1/bob_builtin_analyze --squash
git fetch --no-tags origin main
$merged = gh pr view $pr[0].number --repo katamor1/bob_builtin_analyze --json state,mergeCommit | ConvertFrom-Json
$mainSha = git rev-parse refs/remotes/origin/main
if ($merged.state -ne 'MERGED' -or $merged.mergeCommit.oid -ne $mainSha) { throw 'merged PR does not match origin/main' }
```

Expected: tooling/evidence reaches exact main. Retain all process/legacy branches and worktrees.

### Task 9: Produce the Workflow A conflict inventory and next-plan boundary

**Files:**

- Create: `docs/release-evidence/workflow-carrier-a-preflight-2026-08-21.json`
- Create: `docs/release-evidence/workflow-carrier-a-preflight-2026-08-21.md`
- Create later plan: `docs/superpowers/plans/2026-08-21-workflow-contract-v2-carrier-a.md`

**Interfaces:**

- Consumes: merged main from Task 8 and archived `workflow-a.patch`.
- Produces: branch `codex/workflow-contract-v2-carrier-a-plan` containing the exact clean/conflict path list and a separate Workflow A implementation plan. It does not apply or commit product changes in this plan.

- [ ] **Step 1: Create the Workflow A planning worktree from exact main**

```powershell
$repo = 'C:\Users\stell\source\repos\bob_builtin_analyze'
$planning = Join-Path $repo '.worktrees\workflow-carrier-a-plan'
if (Test-Path -LiteralPath $planning) { throw "planning path already exists: $planning" }
if (@(git -C $repo branch --list 'codex/workflow-contract-v2-carrier-a-plan').Count -ne 0) { throw 'Workflow A planning branch already exists' }
git -C $repo fetch --no-tags origin main
git -C $repo worktree add $planning -b codex/workflow-contract-v2-carrier-a-plan refs/remotes/origin/main
```

Expected: a clean planning branch at exact merged main from Task 8.

- [ ] **Step 2: Create a disposable preflight worktree from the same main**

```powershell
$repo = 'C:\Users\stell\source\repos\bob_builtin_analyze'
$probe = Join-Path $repo '.worktrees\workflow-carrier-a-preflight'
if (Test-Path -LiteralPath $probe) { throw "preflight path already exists: $probe" }
git -C $repo worktree add --detach $probe refs/remotes/origin/main
```

- [ ] **Step 3: Run check-only three-way application**

```powershell
$patch = 'C:\Users\stell\source\archives\bob_builtin_analyze\2026-08-21-main-consolidation\carrier-patches\workflow-a.patch'
git -C $probe apply --check --3way --index $patch 2>&1 | Tee-Object -Variable applyOutput
$applyStatus = $LASTEXITCODE
git -C $probe status --porcelain=v1
```

Expected: `--check` leaves the worktree/index unchanged. Record exit code and every reported path; do not resolve or apply in this task.

- [ ] **Step 4: Record exact preflight evidence**

In `$planning`, use `apply_patch` to create the JSON and Markdown. The JSON stores current main SHA, patch SHA-256, archived from/to SHA, apply exit code, sorted clean paths, sorted conflict paths, and `productChangesApplied: false`. The Markdown renders the same facts and highlights the seven cross-stack overlap paths from the design.

- [ ] **Step 5: Remove only the clean disposable preflight worktree**

```powershell
$status = @(git -C $probe status --porcelain=v1)
if ($status.Count -ne 0) { throw 'preflight worktree is not clean; preserve it for inspection' }
git -C $repo worktree remove $probe
git -C $repo worktree prune --dry-run --verbose
```

Expected: only the tool-created clean detached probe is removed; no branch is deleted.

- [ ] **Step 6: Write the next implementation plan from observed paths**

Use `superpowers:writing-plans` to create `2026-08-21-workflow-contract-v2-carrier-a.md`. It must name every actual conflict path from Step 3, the exact existing tests protecting each path, RED/merge-resolution/GREEN steps, Linux/Windows exact-head checks, PR #143/#148/#149/#151 replacement comments, and an explicit prohibition on deleting their branches.

Expected: no Workflow A product change begins until this next plan is reviewed.

- [ ] **Step 7: Commit the preflight evidence and next plan**

```powershell
git -C $planning add docs/release-evidence/workflow-carrier-a-preflight-2026-08-21.json docs/release-evidence/workflow-carrier-a-preflight-2026-08-21.md docs/superpowers/plans/2026-08-21-workflow-contract-v2-carrier-a.md
git -C $planning diff --cached --check
git -C $planning commit -m 'docs: plan workflow contract v2 carrier a'
git -C $planning status --short --branch
```

Expected: one documentation-only commit and a clean planning worktree. Do not push it until the Workflow A plan is reviewed.

## Spec coverage and sub-project boundaries

| Approved design section | This plan | Follow-on plan |
| --- | --- | --- |
| §1–§4 objective, observed state, safety, archive architecture | Tasks 1–8 implement and verify | none |
| §5.1 Workflow carriers | Freeze all three patches; preflight Workflow A | `2026-08-21-workflow-contract-v2-carrier-a.md`, then B/C plans created from each merged exact main |
| §5.2 Processing carriers | Freeze all three patches | `2026-08-21-processing-budget-carrier-a.md`, then B/C plans created from each merged exact main |
| §5.3 carrier PR contract | Preserve range, patch hash, PR mapping in archive | each carrier plan owns apply, conflict evidence, CI, review, merge, and replacement comments |
| §6 conflict and source-of-truth rules | Archive current OOXML baseline and carrier patch; record Workflow A conflicts | Workflow/Processing carrier plans own source edits and invariant-specific regressions |
| §7 independent branch triage | Preserve all heads in bundle and inventory | `2026-08-21-independent-branch-triage.md` |
| §8 validation strategy | Control-plane tests and docs gates | carrier-specific gates plus `2026-08-21-final-main-validation-and-uat.md` |
| §9 PR/evidence convergence | Establish inventory/archive evidence schemas | carrier plans and independent triage close replacement PRs after merge |
| §10 remote retirement | Reuse constraints only; no deletion | `2026-08-21-main-consolidation-retirement.md` |
| §11 local cleanup | Preserve exact worktree/clone inventory | `2026-08-21-main-consolidation-local-cleanup.md`, executed only after separate approval |
| §12–§14 phases, acceptance, rejected alternatives | Establish first phase and next-plan gate | every named follow-on plan preserves the same stop conditions |

## Plan completion boundary

This plan is complete only when:

- approved design/plan and inventory/archive PRs are merged to exact `origin/main`;
- external archive, three bundles, explicit artifact copies, six carrier patches, and detached hashes verify;
- tracked inventory/archive evidence is on main;
- the 30 legacy remote heads, 20 legacy PRs, existing worktrees, nested clone, and artifacts remain intact;
- Workflow A preflight evidence identifies the actual application boundary;
- no deletion approval has been requested or consumed.

The next executable subsystem is Workflow Carrier A. Workflow B/C, Processing A/B/C, independent triage, final main/UAT, and retirement each receive a separate plan after the preceding exact main and conflict evidence exists.
