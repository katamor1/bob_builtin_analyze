# REG-BRIDGE-DISCOVERY-EVIDENCE Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 固定Git tree・同一VSIX bytes・既存P4/P7 authorityから再現可能なDiscovery証拠を作り、独立したsource/metadata統合でProgram ordinal 10を受け入れる。

**Architecture:** build専用`tools/workflow-evidence/`が一度捕捉したopaque subjectをcatalog、tracked discovery、read-only P1 loader、P4/P7 compiler、reportへ渡す。runtime contribution metadataとP4 branded provider catalogを分離し、公開する4ファイルを一括生成する。既存V1文書はinventory_only、V2 runtimeはinactiveを維持する。

**Tech Stack:** Node.js 22 ESM/JSDoc、node:test、既存TypeScript compilerのcompiled out、Git plumbing、標準zlib/crypto/fs。Linuxのno-overwrite出版には小さなbuild専用C helperを`cc`で生成する。npm依存は追加しない。

**Spec:** `docs/superpowers/specs/2026-10-20-reg-bridge-discovery-evidence-design.md`、承認済みcommit `6805c7de8cfb4775cdc1ab7abb0924d38f8658c4`、SHA256 `b728747ae2f682433edaa4d9e57d08688f4c2eb09cb88fe3988d9a7065b7b525`。ユーザー回答「設計を承認して実装計画へ進む」。設計と本計画を両方読む。

実行場所: `C:/Users/stell/.codex/worktrees/v2-registry-discovery/bob_builtin_analyze`、branch `codex/v2-registry-discovery`。以下のpath/commandはこのroot基準。実行方法は既承認の主スレッドinline（executing-plans）。本計画の書面レビュー前に製品実装しない。

## Global Constraints

- source baseは`3d3d25c296dc798c7eb2fd786625775bca1152f0`。開始時にmain/remote、設計hash、extensions treeを再確認し、変動があれば差分を判定してから進む。
- `workflow-contributions/v1`のroot fields・registry negotiation・handler契約を維持。runtime public API、version、engine、dependencies/lockfiles、既存79圧縮対象、容量上限1,200,000 bytesを維持する。
- 正式進捗はsource/metadata受入までは9/20。旧11 completion referencesはimmutable prefix。source D1とmetadata D2は別subject。
- Ownerの57-delta source admissionと元baselineを変更しない。Discovery専用literal deltaを積む。wildcard許可、forbidden root縮小、旧dynamic gate/旧six-kind compiler/manual provider lookup/global command allowlistを追加しない。
- Gitは40桁commit object→treeを固定し、`ls-tree -rz --full-tree`/`cat-file --batch`を使用。作業tree、未追跡ファイル、caller指定workflow一覧を正本にしない。sortはUTF-16 code-unit順。
- VSIX archive: 64 MiB/個、64個、入力合計256 MiB。ZIP: 10,000 entries/個、uncompressed 8 MiB/entry、32 MiB/archive、全体256 MiB。
- Git tree metadata: 32 MiB、200,000 rows。捕捉対象blob/control: 8 MiB/個、合計256 MiB。workflow候補・宣言: 各20,000件。
- report/catalog/discoveryの各canonical出力: 8 MiB。diagnostic表示: 256 UTF-8 bytes/件、4,096件。escaping後の実出力byte数も検査する。
- P1/P4/P7既存上限を引き上げない（package 512 files、depth 3、path 240、workflow/lock各1 MiB、prompt/schema各4 MiB、package total32 MiB、manifest4096 packages、P7 control8 MiB、providers/collections各256）。
- canonical artifactにはhost絶対path、OS、現在時刻、stackを含めない。locator/commit/OS/CI情報は外部receiptへ置く。digestの自己参照を作らない。
- 同一hashの実3 VSIXをUbuntu/Windowsへ渡す。既存4 workflowのexact checkout/SHA/32桁nonce契約を保つ。OwnerのCI免除は今回へ継承しない。
- 五効果（dispatch/Bob/run directory/artifact stagingを含む既存effect counters）は0。R3–R5 inactive、R6 absent。GUI/live Bob model・Program最終三拡張UAT・topology cleanupはnot_runのまま。
- worktree/profile/branch/失敗staging/proofを保持。primaryの保護8 untracked statusを開始・終了で比較し、`.integration-xlsx-on-prereq/`、`docs/analysis/`、`docs/superpowers/plans/2026-09-28-premium-informed-three-extension-improvements.md`を読取・走査しない。

## Review Focus

1. ZIPのlocal/central不一致、NFC/case alias、壊れたdescriptorを検証前に正規化して見逃さない → Task1 `rejects_zip_structure_and_path_aliases`。
2. capture中のFD/path差替えは拒否し、capture後のcheckout/Buffer変異は証拠を変えない → Task2 `capture_is_stable_after_return_and_rejects_inflight_replacement`。
3. owner/versionが一致してもpayload・command・mirrorが違えば同一証拠にしない → Task3 `same_version_payload_and_command_drift_is_not_equivalent`。
4. JSON化したcatalog/compiled DTOや別subjectのDTOはauthorityを持たず、evidence handleからlease/dispatchできない → Task5/6 `evidence_authority_cannot_be_rehydrated_or_crossed`。
5. 空/非空の既存出力、遅延write失敗、同時二出版で上書き・部分公開しない → Task6 `publication_is_atomic_no_replace_under_collision_and_late_failure`。

---

## ファイルと境界

新root領域は次のliteral集合に限定する。表の各`.test.mjs`は同じprefixの責務を試験する。native生成binary、VSIX、実行receiptはtracked sourceへ置かない。

| Task | 新規/変更path | 責務 |
|---|---|---|
| 1 | `tools/workflow-evidence/lib/primitives.mjs`, `lib/vsixArchive.mjs`, `test/testSupport.mjs`, `test/primitives.test.mjs`, `test/vsixArchive.test.mjs` | closed own-data、canonical/digest/bounds、単一ZIP validator、owned fixture |
| 2 | `lib/gitSnapshot.mjs`, `lib/vsixCapture.mjs`, `lib/subjectState.mjs`, `lib/evidenceSubject.mjs`, `test/evidenceSubject.test.mjs` | fixed tree/blob、bounded fd capture、private WeakMap provenance |
| 3 | `lib/discoveryClaims.mjs`, `lib/contributionCatalog.mjs`, `schemas/workflow-discovery-claims.v1.schema.json`, `schemas/workflow-discovery-catalog.v1.schema.json`, `test/contributionCatalog.test.mjs` | claims、byte-derived commands/assets、mirror、closed catalog |
| 4 | `lib/trackedDiscovery.mjs`, `test/trackedDiscovery.test.mjs` | single classification、V1/V2 inventory、coverage |
| 5 | `lib/snapshotPackageFileSystem.mjs`, `lib/compileEvidence.mjs`, `test/compileEvidence.test.mjs` | read-only P1 adapter、既存P4/P7の再利用 |
| 6 | `lib/contractReport.mjs`, `lib/publishEvidence.mjs`, `lib/cli.mjs`, `native/rename_noreplace.c`, `schemas/workflow-discovery-report.v1.schema.json`, `discover-tracked-workflows.mjs`, `generate-workflow-contract-report.mjs`, `test/contractReport.test.mjs`, `test/publication.test.mjs`, `test/cli.test.mjs` | shared report/CLI、bounded serialization、一括no-overwrite公開 |
| 7 | `lib/ciSubjects.mjs`, `ci-evidence.mjs`, `compare-evidence.mjs`, `test/ciEvidence.test.mjs`, `test/fixtures/ci-collections.json`, `README.md` | actual VSIX/control handoff、cross-OS比較、build/run契約 |

変更先: Task3は3拡張各`contracts/workflow-contributions.json`と新`contracts/workflow-discovery-claims.json`、`.gitattributes`、workflow-registerの既存manifest契約testとcompanion各新manifest test。Task5は`extensions/workflow-register/scripts/lib/workflow-contract-v2-environment.js`と`test/workflowContractV2ManifestOwnedCatalog.test.js`。Task7は後述のliteral admission/4 CI workflow/exact-head test。Task8/9は新製品機能を追加せず検証・review修正・source受入。Task10は6 metadata pathsだけを変更する。

### 共通interface（全Taskでこの綴りを使う）

新しい証拠の`Digest`は小文字64hex SHA256、`TreeSha`/`CommitSha`は小文字40hex。既存P4/P7のgeneration/package/lock/environment/plan digestは`sha256:`付きの既存型をそのまま保持し、strip/再解釈しない。`canonicalBytes(value, maxBytes=8*1024*1024): Buffer`は既存`canonicalJsonBytes(value)`にLFを1個付けたdocument bytesで、`digestBytes(bytes): Digest`を返す関数とは分離する。`WorkflowEvidenceError`は固定`code`とbounded `diagnostics:[{code,path,message}]`を持つ。untrusted stack/messageを再送しない。

`WorkflowEvidenceSubject`と各結果はfrozen token/DTO。module-private WeakMapは`lib/subjectState.mjs`だけに置き、public entrypointからstate accessorをexportしない。DTOのsubject associationも同じprivate stateへ登録する。検証はProxy判定→own descriptor→copy/freezeの順、Bufferはcopy-on-input/output。portable DTOにBufferを含めない。

| Producer | Interface | Consumer |
|---|---|---|
| 1 | `validateVsixArchive(bytes:Uint8Array): CapturedArchive`（内部copied bytes、`readEntry(path):Buffer`はcopy） | 2/3 |
| 2 | `captureWorkflowEvidenceSubject({commitSha,vsixSubjects:[{path,expectedSha256,expectedBytes}],providerCatalogPath,collectionsPath}): Promise<WorkflowEvidenceSubject>` | 3/4/5/6 |
| 3 | `buildWorkflowContributionCatalog(subject): WorkflowContributionCatalog` | 4/6 |
| 4 | `discoverTrackedWorkflows(subject,catalog): WorkflowDiscovery` | 5/6 |
| 5 | `compileWorkflowEvidence(subject,discovery): Promise<CompiledWorkflowEvidence>` | 6 |
| 6 | `createWorkflowContractReport(subject,catalog,discovery,compiled): WorkflowContractReport` | CLI/CI |
| 6 | `generateEvidenceBytes(subject): Promise<EvidenceFiles>`、`publishEvidenceDirectory({outputDirectory,files,check}): Promise<PublicationReceipt>` | both CLI/7 |

`EvidenceFiles`は4 exact keys `catalog.json`, `discovery.json`, `report.json`, `compiled-plan-manifest.json`とcopied Buffer値。`generateEvidenceBytes`は上の4段階を同じsubjectで順に呼ぶ唯一のpipeline。`PublicationReceipt`は`{state,artifactDigests,reportDigest,outputLocator,stagingLocator}`、locatorを4 artifactへ混ぜない。invalid input/unclassified/compile failureは固定errorで失敗し、verified reportや出力directoryを作らない。

catalog closed root: `{schemaVersion:'workflow-discovery-catalog/v1',sourceTreeSha,owners}`。owner rowは`{owner,ownerDirectory,archive,package,manifest,claims,registryApi,commands,declarations,assets}`。archiveはraw `{sha256,bytes}`、package/manifest/claimsは各`{source:{path,sha256,bytes},vsix:{path,sha256,bytes}}`。source pathはrepo相対、vsix pathはarchive entry名。manifest/claimsの両raw bytesは一致を要求する。commandsはVSIX-derived sorted strings、declarationsは既存manifestのkind/id/contractVersionまたはid/pathを保持、assetsは`{kind,id,path,bytes,sha256}`。semantic digest対象はsourceTreeShaとownersからarchiveのみを除いたcanonical subset。package source/VSIXのraw digestは別に保持し、owner/version/commandsの選択semanticだけを照合する（VSCEの合法metadata変換をraw driftと誤認しない）。

discovery closed root: `{schemaVersion:'workflow-tracked-discovery/v1',sourceTreeSha,candidates,coverage,diagnostics}`。candidateは`{owner,path,role,classification,sha256,bytes}`、classificationは`inventory_only|published_v2|unselected_v2|negative_fixture|excluded|unclassified`。roleは`template|sample|fixture`、exclusion由来/unclassifiedはrole null。role=fixtureだけでは負例と決めず、明示negative_fixture exclusionだけが負例の宣言証拠になる。coverageは`{total,classified,excluded,unclassified,ambiguous}`、1candidateは1rowだけ。report closed root: `{schemaVersion:'workflow-discovery-report/v1',sourceTreeSha,subjectDigest,catalogDigest,semanticCatalogDigest,discoveryDigest,compiledManifestDigest,providerSourceDigest,environmentDigest,coverage,owners,workflows,diagnostics,state:'verified'}`。対応するJSON Schemaを同時に閉じる。

`CompiledWorkflowEvidence`のfrozen public fieldsは`{manifest,packages,providerSourceDigest,environmentDigest,manifestDigest}`、private stateにsubjectとactual compiled handlesを保持。packagesはP7 manifest package rowsを使い、新しいcompiler result形式を定義しない。reportDigestはreceiptだけに置く。subjectDigestは`{sourceTreeSha,vsix:[{owner,version,sha256,bytes}],providerSourceDigest,collectionsDigest}`のcanonical digest。rawVSIX順序をownerでsortし、同tree別commitでもportable artifactは同じにする。

## Task 1: bounded primitivesと厳密なZIP validator

**Files:** 上表Task1。**Interfaces:** Consumes: Node標準API/既存canonical JSON規則。Produces: `canonicalBytes`, `digestBytes`, `boundedDiagnosticText(text):string`, `snapshotClosedData(value):FrozenData`, `WorkflowEvidenceError`, `validateVsixArchive`。

- [ ] **Step 1: baselineをreceiptへ保存する。** 設計hash、main/base、worktree clean、protected primary status、3拡張のpackage/lock/version/engineとextensions treeを記録する。専用`.superpowers/sdd/2026-10-20-reg-bridge-discovery-evidence/`をprimaryに作り、以後ここを`E`と呼ぶ。3拡張へ`npm ci`、`npm run compile`を実行し、root必須試験（Task8）と既存P7 owned-catalog testのbaselineを取る。既存エラーを新実装のREDに数えない。
- [ ] **Step 2: failing testsを書く。** `testSupport.mjs`に`makeZip({entries,mutate}):Buffer`、`makeEvidenceRepository({v2Packages=1}={}):Promise<{root,commitSha,vsixSubjects,providerCatalogPath,collectionsPath}>`、`runInRepository(root,modulePath,args):Promise<{code,stdout,stderr}>`を定義する。Git init/commitはfixture内部、P7 package生成は既存`workflowContractV2CompilerTestSupport.js`の`createLockedRawPackage()`とgeneration path helperを使う。fixture全部をowned tempに保持し削除しない。test名とassertions:
  - `primitives_are_closed_bounded_and_locale_independent`: getter invocation=0、Proxy/revoked Proxy/accessor/sparse/alias/cycle/prototype key拒否、invalid UTF8/unpaired surrogate拒否、非ASCII並びは`a<b`順、diagnostic UTF8<=256、records<=4096、escaped canonical出力8MiB+1拒否。
  - `rejects_zip_structure_and_path_aliases`: local/central filename/flags/method/size/CRC差、encrypted/ZIP64/multidisk/unsupported method/descriptor/gap/overlap/tail/duplicate、NFC/case/drive/escape/backslash path、非regular/symlink assetを拒否。不要entryのCRC破損も拒否する。
  - `zip_budgets_are_enforced_before_inflate`: 10001 entries、8MiB+1/entry、32MiB+1/archiveで固定code。valid stored/deflate/対応descriptorは同payloadになる。64MiB archive境界も検査する。

  ```js
  assert.ok(Buffer.byteLength(boundedDiagnosticText('界'.repeat(300)), 'utf8') <= 256)
  let getterCalls = 0
  assert.throws(() => snapshotClosedData(Object.defineProperty({}, 'x', { enumerable: true, get() { getterCalls++; return 1 } })))
  assert.equal(getterCalls, 0)
  assert.throws(() => canonicalBytes({ x: '"'.repeat(4 * 1024 * 1024) }))
  assert.deepEqual(canonicalBytes({ b: 2, a: 1 }), Buffer.from('{"a":1,"b":2}\n'))
  ```
- [ ] **Step 3: REDを実行する。** `node --test tools/workflow-evidence/test/primitives.test.mjs tools/workflow-evidence/test/vsixArchive.test.mjs` → 未実装のexport/moduleに起因するFAILを保存する。
- [ ] **Step 4: primitivesを実装する。** 固定limits、descriptor-only bounded copy、fatal UTF8、sanitized diagnostics、canonical bytes/digestを`lib/primitives.mjs`へ実装する。既存P4 canonical encoderとbyte parityを取る。
- [ ] **Step 5: ZIP validatorを実装する。** `lib/vsixArchive.mjs`へcentral/local/descriptor/range/CRC検証を一つに置き、inflateは上限付き標準zlibのみを使う。archive全entryの構造とCRCを確認し、symlink/非regularはrequired asset読取時にも拒否する。archive code実行・disk展開・recompressor importは禁止。
- [ ] **Step 6: GREENを実行する。** Step3の2suiteを再実行し全pass。limitsを越えたentryを巨大展開しないこともassertする。
- [ ] **Step 7: Task1のliteral pathsだけをstageしcommitする。** `feat: add bounded workflow evidence archive primitives`。この段階では既存Gate Rのsource seal不一致を解消済みと報告しない（Task7で新layerを導入する）。

## Task 2: fixed Git/FD captureとopaque subject

**Files:** 上表Task2。**Interfaces:** Consumes: Task1 archive/primitives。Produces: public capture API、内部`captureGitTree({repositoryRoot,commitSha,controlPaths}):Promise<GitSnapshot>`、`captureVsixFile(descriptor):Promise<CapturedVsix>`。GitSnapshotはcopy読取`readBlob(path):Buffer`とimmutable metadata rows、FDやlive fsを外へ渡さない。

- [ ] **Step 1: failing testsを書く。** `capture_is_stable_after_return_and_rejects_inflight_replacement`でcaller byte変異/checkout file変異/untracked追加/branch tip移動後もdigestとreadBlob bytes不変、capture中のpath rename/reparse/hardlink alias/FD identity/size±1/partial read差をreject。`git_snapshot_is_nul_safe_and_bounded`でnewline/tabを含むraw tracked pathを壊さず保持し、selected nonportable/case/NFC/symlink/escapeと200001 rows/32MiB+1 metadata/8MiB+1 blob/256MiB+1 aggregateを拒否する。bare tree/short SHA/branch/ref/重複VSIX/65inputs/expected hash-size不一致をrejectし、capture帰還後Git/VSIX再open=0をspyする。

  ```js
  const subject = await captureWorkflowEvidenceSubject(request)
  assert.equal(Object.isFrozen(subject), true)
  await assert.rejects(() => captureWorkflowEvidenceSubject({ ...request, commitSha: 'main' }))
  assert.deepEqual(beforeCaptureMutationProof, afterCaptureMutationProof)
  assert.equal(readsAfterCapture, 0)
  ```
- [ ] **Step 2: REDを実行する。** `node --test tools/workflow-evidence/test/evidenceSubject.test.mjs` → capture module/export不在のFAIL。
- [ ] **Step 3: fixed Git captureを実装する。** CLIのcwdからrepo rootを一度確定し、40hex commit objectを検証してtreeを捕捉する。NUL-safe `git ls-tree -rz --full-tree <tree>`、必要blobだけの`git cat-file --batch`をbounded child stdoutとして読み、blob OID/sizeと返却contentを照合する。必要path集合はtracked runtime manifests→claims/declared assets/mirrors、workflow candidates、明示P7 controls/collectionsの閉包から導く。protected/untrackedのfilesystem探索はしない。
- [ ] **Step 4: VSIX captureを実装する。** open前/path/open後/read後/path後のregular identityを照合し、size+1のbounded read、合計budget、expected hash/sizeを検証する。再open fallbackなし。host pathは内部/receipt専用。
- [ ] **Step 5: subject bindingを実装する。** private WeakMapにimmutable Git/VSIX/control bytesとresult associationを保持する。JSON clone、shape互換object、別module tokenはreject。root entrypointからstate accessorを公開しない。
- [ ] **Step 6: GREENを実行する。** `node --test tools/workflow-evidence/test/primitives.test.mjs tools/workflow-evidence/test/vsixArchive.test.mjs tools/workflow-evidence/test/evidenceSubject.test.mjs` → 全pass、source acquisition budgetをreceiptへ保存。
- [ ] **Step 7: Task2のliteral pathsだけをcommitする。** `feat: capture immutable workflow evidence subjects`。

## Task 3: claims・実asset宣言・catalog・mirror

**Files:** 上表Task3、3拡張のmanifest/claims、`.gitattributes`、変更`extensions/workflow-register/test/contributionManifest.test.js`、新規`extensions/bob-bazaar-review/test/workflowContributionManifest.test.js`, `extensions/bob-code-consistency-review/test/workflowContributionManifest.test.js`。**Interfaces:** Consumes: Task2 subject。Produces: `parseDiscoveryClaims(bytes,owner):DiscoveryClaims`とpublic catalog API。

- [ ] **Step 1: failing testsを書く。** `same_version_payload_and_command_drift_is_not_equivalent`でsame owner/versionのpackage/manifest/schema/template bytes変更を独立digestへ反映し、required mismatchをreject。package UTF8 decode回数1、invalid UTF8/duplicate commands/owner mismatch/namespace collision/registry-range不整合/missing/wrong-type assetをrejectする。`claims_are_scoped_and_mirrors_bind_exact_bytes`で重複scope/不存在exclusion/escape/orphan mirror/1byte drift拒否、external commandの別scope流用不可。`archive_metadata_only_changes_full_identity`でentry順序/timestampだけの変更はsemantic digest同一・full catalog/subject digest相違、同じarchiveは完全一致をassert。3拡張testで宣言assetが実在しaction provider数を変えないことを確認する。

  ```js
  assert.equal(catalog.schemaVersion, 'workflow-discovery-catalog/v1')
  assert.deepEqual(catalog.owners.map(x => x.archive.sha256).sort(), request.vsixSubjects.map(x => x.expectedSha256).sort())
  assert.equal(packageDecodeCalls, 1)
  assert.notEqual(originalAsset.sha256, changedAsset.sha256)
  assert.equal(originalSemanticDigest, reorderedArchiveSemanticDigest)
  assert.notEqual(originalCatalogDigest, reorderedArchiveCatalogDigest)
  ```
- [ ] **Step 2: REDを実行する。** `node --test tools/workflow-evidence/test/contributionCatalog.test.mjs`と変更した3 manifest test → claims/catalog/asset宣言不在によるFAIL。
- [ ] **Step 3: closed claims/schemaを実装する。** root fieldsは設計どおり6個。row fieldsはscopes `{prefix,role}`、exclusions `{path,reason}`、externalCommands `{id,scope}`、mirrors `{source,destination}`。reason enumは`negative_fixture|compatibility_fixture|non_published_example`。scope/exclusion/external scope/mirror sourceはowner-bound、mirror destinationは明示repo相対tracked path（owner外の既存mirror可）。tracked存在、nonoverlap、strict portable paths、各20000上限。externalCommandsは該当scopeのV1文書にある実command宣言だけを記録し、host存在/dispatch成功を表さない。3 owner/versionは現packageと同一のまま。
- [ ] **Step 4: 実assetだけをmanifest/claimsへ追加する。** Bazaarは`templates/.bob/workflows/bazaar-project-rule-authoring/WORKFLOW.md`と`bazaar-project-rule-review/WORKFLOW.md`をtemplate、CCRは`templates/.bob/workflows/code-consistency-review/WORKFLOW.md`をtemplateとして既存workflow_templatesへ宣言し、同名`.bob/workflows/<name>/WORKFLOW.md`をmirrorへ指定する。IDは`bobBazaarReview.projectRuleAuthoringTemplate`, `bobBazaarReview.projectRuleReviewTemplate`, `bobCodeConsistencyReview.reviewTemplate`。workflow-registerはworkflow_templatesを空のまま、samples配下の4既存`.bob/workflows/`をsample prefixでclaimする。既存test/fixtures配下の候補はfixture prefixでclaimし、負例をpublishedにしない。schema宣言はworkflow `schema/workflow-contributions.v1.schema.json` ID `workflowRegister.contributionManifestSchema`、Bazaar `templates/.bob/review/review-result.schema.json` ID `bobBazaarReview.reviewResultSchema`、CCR `resources/schemas/review-input.schema.json` ID `bobCodeConsistencyReview.reviewInputSchema`。データのpathはowner相対とする。
- [ ] **Step 5: catalog/mirrorを実装する。** VSIXのpackage/manifest/claimsを各1回fatal decodeし、package publisher.name/version/contributes.commandsを導出する。Git packageはowner/version/commandsのselected semanticsだけを照合し、source/VSIX raw digestsは区別する。manifestは現行compiled `contributionManifest.js` validatorを使用する。3 raw asset/mirror経路（Git source、Git destination、VSIX source）がexact bytes一致することを検証し、sorted frozen catalogとprivate provenanceを返す。
- [ ] **Step 6: literal LFルールを追加する。** `.gitattributes`に変更manifest/新claims/宣言済み3templates・3mirrors・3schemasだけを列挙し`text eol=lf`とする。canonical newtool schemas/admissionにもliteral LF指定を足す。checkout/indexのactual byte parityをowned fresh fixtureで試し、repository全体のrenormalizeやautocrlf設定変更はしない。
- [ ] **Step 7: GREENと早期容量測定を実行する。** catalog/変更3manifest testをpassさせ、3拡張で`npm run package`と`npm run package:policy`を実行しactual VSIXのhash/bytes/entriesとassetを確認する。workflow-register<=1,200,000。容量不足なら固定79対象/上限を変えず、隔離検証した具体案を追加承認へ出す。
- [ ] **Step 8: Task3のliteral pathsだけをcommitする。** `feat: bind discovery claims and declared assets to VSIX bytes`。

## Task 4: tracked workflowの一意分類

**Files:** 上表Task4。**Interfaces:** Consumes: same subject/catalog、Task3 claims。Produces: public discovery API、上記closed WorkflowDiscovery。catalogを返したsubject以外との組合せは拒否。

- [ ] **Step 1: failing testsを書く。** `tracked_discovery_has_exact_classification_without_live_reads`でroot/nested/fixture/NUL-safe候補、untracked除外、unclassified/ambiguousの件数と失敗codeをassert。`v1_inventory_does_not_invoke_a_compiler`でV1行のclassification=`inventory_only`、compiler calls=0。`only_explicit_published_v2_is_compile_eligible`でcurrent.jsonでpublishedかつP7明示collections内だけ`published_v2`、未選択V2は`unselected_v2`、明示negative exclusionは`negative_fixture`、検出数を固定19にしない。literal POSIX backslashはraw metadataで保持しselected pathではrejectする。

  ```js
  assert.equal(discovery.coverage.total, discovery.candidates.length)
  assert.equal(discovery.coverage.unclassified, 0)
  assert.equal(discovery.coverage.ambiguous, 0)
  for (const row of discovery.candidates.filter(x => x.role !== null && x.path.endsWith('/WORKFLOW.md'))) assert.equal(row.classification, 'inventory_only')
  assert.equal(compilerCallsForV1, 0)
  ```
- [ ] **Step 2: REDを実行する。** `node --test tools/workflow-evidence/test/trackedDiscovery.test.mjs` → discovery export不在のFAIL。
- [ ] **Step 3: discoveryを実装する。** captured tree上のowner rootとclaimsから`.bob/workflows/**/WORKFLOW.md`、`workflow.yaml`、publication `current.json`を一度列挙する。directory候補を重複計上せず、そのpathの分類/bytes/digestを固定する。正当なexclusionと負例を可視化し、unclassified/ambiguousを正常coverageへ足さない。探索やrole判定でlive fsを参照しない。
- [ ] **Step 4: GREENを実行する。** `node --test tools/workflow-evidence/test/contributionCatalog.test.mjs tools/workflow-evidence/test/trackedDiscovery.test.mjs` → 全pass。unclassified=0と候補総数の等式をfixtureでassertする。
- [ ] **Step 5: Task4のliteral pathsだけをcommitする。** `feat: classify tracked workflows from captured contribution claims`。

## Task 5: owned P4/P7へのsnapshot接続

**Files:** 上表Task5、既存P7 environment/owned-catalog test。**Interfaces:** Consumes: subject/discovery。Produces: `createSnapshotPackageFileSystem(subject):WorkflowPackageFileSystem`、public compile API。既存environment moduleには`createWorkflowContractV2EvidenceEnvironmentFromBytes({providerCatalogBytes}):AuditedWorkflowCompilerEnvironment`と`readWorkflowContractV2CollectionsFromBytes({collectionsBytes}):readonly string[]`を追加し、既存filesystem wrappersが委譲する。

- [ ] **Step 1: failing testsを書く。** `snapshot_p4_p7_matches_existing_filesystem_compilation`で同fixture/controlのmanifest bytesとpackage/lock/environment/plan digestsが全一致。`evidence_authority_cannot_be_rehydrated_or_crossed`でJSON provider catalog/contract_version変換/caller callback/forged handleをreject、evidence handleのruntime lease不可と既存five effect counters全0をassert。`snapshot_filesystem_is_read_only_and_identity_bound`でlstat/open/read/stat/readDirectory/realpath/isWithinがcaptured bytesだけを返し、flush/rename methodsが無いことをassert。invalid control/canonical LF/duplicate provider/257collectionsの既存拒否も維持する。

  ```js
  assert.deepEqual(snapshotManifestBytes, filesystemManifestBytes)
  assert.equal(compiled.manifest.schemaVersion, 'workflow-compiled-plan-manifest/v1')
  assert.equal(fileSystem.flushFile, undefined)
  assert.equal(fileSystem.rename, undefined)
  for (const count of Object.values(effectCounters)) assert.equal(count, 0)
  ```
- [ ] **Step 2: REDを実行する。** workflow cwdで`node --test test/workflowContractV2ManifestOwnedCatalog.test.js`とroot `node --test tools/workflow-evidence/test/compileEvidence.test.mjs` → 新bytes export/adapter不在のFAIL。
- [ ] **Step 3: P7 bytes処理を最小抽出する。** existing canonical parser・256provider/collection制限・own-data検証・ActionRegistry.registerWorkflowProviderContract→owned snapshot→purpose evidenceをそのまま共有する。filesystem wrapperのbounded FD読取/CLI引数/拒否条件は残す。source JSONをP4 public catalog DTOへhydrateしない。
- [ ] **Step 4: read-only adapterを実装する。** `WorkflowPackageFileSystem`のstat identityをtree/blob tableへ固定し、P1 `createWorkflowPackageRoot`と既存loader factoryを通す。`openFile`はinitialStat/read/stat/closeを実装し毎回copyを返す。hostRootは内部synthetic rootでcanonical出力に出さない。
- [ ] **Step 5: compiler接続を実装する。** 明示collections内published packageだけをP1→P4 `compileWorkflowPackage`→P7 `createCompiledWorkflowPlanManifestPackage`/`createCompiledWorkflowPlanManifest`/`encodeCompiledWorkflowPlanManifest`へ渡す。4096packagesと既存package boundsを適用する。失敗diagnosticを成功へ変換せずthrow、actual handlesとsubjectをprivate stateへ束縛する。
- [ ] **Step 6: GREENを実行する。** workflow cwdで`npm run compile`後、`node --test test/workflowContractV2ManifestOwnedCatalog.test.js test/workflowContractV2Manifest.test.js test/workflowContractV2ManifestPackaging.test.js`、rootで`node --test tools/workflow-evidence/test/compileEvidence.test.mjs` → 全pass、parity/effect countersを保存。
- [ ] **Step 7: Task5のliteral pathsだけをcommitする。** `feat: reuse owned P4 and P7 compilation over captured package bytes`。

## Task 6: closed report・shared CLI・一括no-overwrite出版

**Files:** 上表Task6。**Interfaces:** Consumes: Task2–5 results。Produces: report/generation/publication APIs、`runEvidenceCli(argv,{mode:'discover'|'report'}):Promise<number>`。2entrypointsはimport時実行せずdirect executionだけこの同じ関数を呼ぶ。discoverモードは同pipelineのdiscoveryを表示し、`--output-directory`指定時は4ファイル全体を出版する。

- [ ] **Step 1: failing testsを書く。** `report_joins_only_same_subject_verified_results`で別subject、JSON clone、unverified compile、mutated DTOをreject、閉じたschemaとself-digest非循環をassert。`publication_is_atomic_no_replace_under_collision_and_late_failure`で既存empty/nonempty directory/file/symlink、二CLIの同時publish、最後のwrite/fsync失敗、親identity差替えを注入し、既存bytes不変・partial公開0・失敗staging保持をassertする。`cli_is_import_safe_bounded_and_check_is_read_only`でimport effect=0、unknown/repeated args/branch SHA/manual catalog/compiler選択をreject、--check一致はwrite/open-for-write/rename=0、1byte差は非zero。report/catalog/discovery各8MiB+1と大量escapeをrejectする。

  ```js
  assert.throws(() => createWorkflowContractReport(subject, JSON.parse(JSON.stringify(catalog)), discovery, compiled))
  await assert.rejects(() => publishEvidenceDirectory({ outputDirectory: occupiedDirectory, files, check: false }))
  assert.deepEqual(await fs.readFile(existingFile), existingBytes)
  assert.equal(partiallyPublishedDirectories, 0)
  assert.equal(checkModeWriteCalls, 0)
  ```
- [ ] **Step 2: REDを実行する。** `node --test tools/workflow-evidence/test/contractReport.test.mjs tools/workflow-evidence/test/publication.test.mjs tools/workflow-evidence/test/cli.test.mjs` → report/publisher/entrypoint不在のFAIL。
- [ ] **Step 3: report/schema/pipelineを実装する。** 上記closed root/field shapes、private provenance、各digest/budgetを検証し、same subjectの4 artifactsを一度だけ生成する。pathやarchive errorのuntrusted textはTask1 sanitizerへ渡し、diagnosticでhost pathを漏らさない。
- [ ] **Step 4: no-overwrite promotion backendを実装する。** Linuxは`native/rename_noreplace.c`の小さなhelperで同parent directory FDに対し`renameat2(...,RENAME_NOREPLACE)`を一回呼ぶ。固定引数/relative basename、regular trusted helper、same-volume/parent identityを検査する。C source bytesを一度copyしてowned build directoryで`cc`をshell無し起動し、compiler/binary/source hashを外部receiptへ保存する。caller helper path/CC override、通常rename fallback、cross-device copyは禁止。ENOSYS/EINVAL/cc不在は固定codeでfail closed。WindowsはNode22 directory renameを使用する前にowned fixtureでdestination empty/nonempty directory/file collisionがすべて保持されることをcapability probeし、unsupportedならfail closed。OS別backendとも親/元/先identityを照合する。

  普通のPOSIX renameは既存空directoryを置換するため採用しない。根拠: [Linux rename/RENAME_NOREPLACE](https://man7.org/linux/man-pages/man2/rename.2.html)。Windowsの選択は[MoveFileExW](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw)と[libuv 1.51.0実装](https://raw.githubusercontent.com/libuv/libuv/v1.51.0/src/win/fs.c)に基づき、実fixture試験を必須にする。これはbuild用publisherでありR3 runtime artifact adapterを実装しない。

- [ ] **Step 5: publisherを実装する。** 全検証/生成後だけ同volumeのprivate stagingへ4 filesをexclusive-createし、flush/close後にStep4で一回promoteする。任意失敗時は公開せずstaging/proofを保持し、変更されたpathへrecursive cleanup/retryをしない。receiptの保存先はE/CI external artifactとし、4ファイルに追加のhost metadataを入れない。
- [ ] **Step 6: CLIを実装する。** 2entrypointsは`--commit <40hex> --subjects <canonical descriptor JSON> --provider-catalog <tracked relative path> --collections <tracked relative path> --output-directory <fresh path> [--check]`だけを受ける。subjectsはbounded arrayの`{path,expectedSha256,expectedBytes}`だけ、control bytesはGit subject由来。既存out未compile時は固定build-required error。成功0/入力・比較・出版失敗1、部分成功0は禁止。
- [ ] **Step 7: GREENを実行する。** Step2の3suiteと`node --test tools/workflow-evidence/test/*.test.mjs` → 全pass。Windows現機のcollision fixtureを実行して保存し、Linux backend実試験はTask7実CIでも行う。未実行OSを成功と記録しない。
- [ ] **Step 8: Task6のliteral pathsだけをcommitする。** `feat: publish canonical workflow evidence atomically without replacement`。

## Task 7: literal admission・source対応・実cross-platform CI

**Files:** 上表Task7、新`tools/main-consolidation/registryDiscoveryAdmissionPolicy.mjs`, `registry-discovery-source-admission.json`, `test/registryDiscoveryAdmissionPolicy.test.mjs`、既存`gateRMainAdmissionPolicy.mjs`, `test/gateRMainAdmissionPolicy.test.mjs`, `exact-head-ci-contract.json`, `scripts/exact-head-ci-contract.test.js`, `.gitattributes`, `.github/workflows/{extensions-quality,workflow-contracts,code-consistency-review-scaffold,three-extension-ui-contracts}.yml`。source mappingは新`docs/release-evidence/reg-bridge-discovery-source-coverage-2026-10-20.json`へ保存する。

**Interfaces:** `applyRegistryDiscoverySourceAdmission(input,ownerExpectedFiles):PathRow[]`はOwner57適用後の集合へだけ適用。新admission rootは`{schemaVersion,baseMainSha,baseFilesDigest,deltas,toolFiles,sourceCoverageDigest}`、schema=`bob-builtin-analyze/registry-discovery-source-admission/v1`。deltaはliteral `{path,mode,beforeBlobSha,afterBlobSha,sourceItemIds}`、toolFilesは上表のexact tracked file paths/modes/blob OIDs。sealing対象は製品/新roottool sourceだけ、admission JSON/policy自身の自己hashは含めず独立literal allowlistで検査する。

- [ ] **Step 1: failing testsを書く。** `discovery_admission_is_additive_literal_and_remainder_complete`でOwner57 JSON/hash/base不変、unexpected file/forbidden root/path wildcard拒否、27 unique selected IDsとorigin OID/commit/symbol/target path/testの完全対応、remainder全IDのdisposition有り・unassigned0をassert。`cross_os_ci_consumes_identical_actual_vsix`でdescriptor hash/bytes/source treeの差、artifact取り違え、欠落OS、出力1byte差をrejectする。`exact_head_adds_four_required_evidence_jobs_without_relaxation`で旧12jobs保持、合計16 PRsuccess/dispatch15success+metrics1skip、各new jobのcheckout guardがsetup/artifact実行より前にあることをassert。

  ```js
  assert.equal(new Set(coverage.items.map(x => x.sourceItemId)).size, 27)
  assert.equal(remainderClosure.unassigned, 0)
  assert.equal(contract.workflows.flatMap(x => x.jobs).length, 16)
  assert.deepEqual(ubuntuArtifactBytes, windowsArtifactBytes)
  assert.deepEqual(ownerAdmissionBytesAfter, ownerAdmissionBytesBefore)
  ```
- [ ] **Step 2: REDを実行する。** `node --test tools/main-consolidation/test/registryDiscoveryAdmissionPolicy.test.mjs tools/workflow-evidence/test/ciEvidence.test.mjs scripts/exact-head-ci-contract.test.js` → 新admission/CI契約不在のFAIL。
- [ ] **Step 3: source対応とadmissionを実装する。** 下表27行を固定source universeから再取得し、exact origins（archive manifest `36e477ee9b752ebf7f07a208c166fec24e14a89bf7ba6a7921cf6bdf708c9f31`、carrier patch `6913ddddcffb150eb207aee99bdbbad158b4ed05e9c3ca8714693d31f6122536`）と共にcoverageへ保存する。remainderは現ledgerの全IDを照合し、shared owner参照/superseded/rejected理由を維持する。旧dynamic orchestration `source-eb7aeef897a4f48ed72d6900`は導入しない。current expected sourceはOwner layer→Discovery layerの順に導く。root tools literal inventoryも実ファイル集合と一致させる。final candidate sealはindex相当Git blob bytesで計算し、working CRLFで誤sealしない。
- [ ] **Step 4: actual VSIX handoff/CI runnerを実装する。** `ciSubjects.mjs`は3 actual VSIXからexpected hash/size descriptorとsource tree receiptを作る。controlは既存`extensions/workflow-register/test/fixtures/workflow-contract-v2/manifest-provider-catalog.json`と新`tools/workflow-evidence/test/fixtures/ci-collections.json`（canonical `workflow-contract-v2-collections/v1`、collectionsは既存`extensions/workflow-register/test/fixtures/workflow-contract-v2/manifest-collection`の1個だけ）を使う。この既存collectionのpublished minimal packageを一つcompileし、空compileだけでparityを済ませない。`ci-evidence.mjs prepare|generate`のprepareはactual checked-out commit/treeと上記tracked controlsを検証し、同3VSIX/descriptor/receiptをartifact化する。generateは同source commitのGit blobsとdownloadしたVSIXを検証して共通pipelineを実行する。別fixture treeやVSIX抽出内容からGit sourceを捏造しない。`compare-evidence.mjs <ubuntu-dir> <windows-dir>`は4 filesとsubject/tree/VSIX bindingsのexact bytes/digestを照合し、receiptのOS/locatorだけ比較から除く。import safe、bounded args、missing artifactは失敗。
- [ ] **Step 5: 4 workflow/exact-head契約を更新する。** `extensions-quality`の既存3 Ubuntu jobがpackage/policy合格後、実VSIX+hash/size/head/tree receiptをuploadする。新`evidence-subject`（name `Workflow evidence subject`）は3jobをneedsし共通subjectを作る。新`evidence-portability`はubuntu-latest/windows-latest matrix（names `Workflow evidence / ubuntu-latest`, `Workflow evidence / windows-latest`）で同3VSIX/fixtureをdownloadし、Node22、現compiler compile、新root suite、生成を実施する。新`evidence-byte-parity`（name `Workflow evidence byte parity`）が両OS結果を比較する。全new jobに現行exact checkout guardをsetup前に入れる。upload/download actionsはofficial stable releaseのfull commit SHAを解決・記録してpinする（floating tagを使わない）。4workflowの必要path filterへ`tools/workflow-evidence/**`と新claims/data pathsを追加し、既存filter/skip/deadlineを緩めない。
- [ ] **Step 6: GREENを実行する。** Step2のtests、新root suite、`node --test tools/main-consolidation/test/gateRMainAdmissionPolicy.test.mjs`とTask8 root必須/4生成器/`node tools/main-consolidation/run-gate-r.mjs --check` → 全pass。READMEにbuild-before-run、正確なCLI例、同hash artifact比較、Linux cc要件、保持方針を書く。
- [ ] **Step 7: Task7 literal pathsだけをcommitする。** `ci: verify immutable workflow discovery evidence across platforms`。実CI結果はまだnot_run、coverage local完了をformal VERIFIEDへ投影しない。

### source coverageの固定対応（suffix全てに`source-`を前置）

各行にoriginal path/blob/symbolsも保存し、`consumedBy`を実装済みの根拠にしない。5つのclaims rowsを一つのruntime fieldへまとめて旧schemaを復活させない。

| ID suffix | 適応先/試験 | Task |
|---|---|---:|
| 0bd231a3c17b7b56bbbbda21 | workflow-register claims/既存asset宣言 | 3 |
| a3b4ca6a0b1e4db038b83ee2 | Bazaar claims/templates/mirrors | 3 |
| f894324f170cd6b0e3e013d0 | CCR claims/template/mirror | 3 |
| 42a51209abb3930bdea6ba64 | closed claims schema | 3 |
| 94c75d7f2b39527bdd46537b | claims descriptor-only validation/runtime互換test | 3 |
| c9f9168d602096cc4dd38962 | gitSnapshot/trackedDiscovery | 2,4 |
| b70d9366a8f58c57853ffb5c | contributionCatalog | 3 |
| 5337bde73cf849b77a4ec168 | VSIX package command derivation | 3 |
| 7b4478e568123faa4d57384b | primitives digest/canonical parity | 1 |
| 108b6d1a970be1f538f3602d | boundedDiagnosticText | 1 |
| e97fb940447f8795f030dd5a | raw Git/VSIX mirror validation | 3 |
| ae53a107be8a2a34e41640fa | vsixArchive facade | 1 |
| ecd28ff2184f030296cb7e8f | same single ZIP engine structural/CRC/bounds test | 1 |
| 6ed53a774d194de006046976 | shared subject/generate CLI | 2,6 |
| 2d2e01542f2b8de11ef04afb | contractReport/P4-P7 join | 5,6 |
| 1913ba4170b45960fbe64027 | workflow-discovery-catalog/v1 schema | 3 |
| bbf2ca2bcc7c77ab957b9da0 | workflow-discovery-report/v1 schema | 6 |
| 00e1139e1829c12246ddfc93 | claims path/role/reason tests | 3 |
| 12d9b78e71be42e5711771f4 | CCR exact mirror test | 3 |
| 26b6488e607378d4c655a690 | fatal UTF8/immutable asset/mirror tests | 1,3 |
| 3b47ba9ceb1a183e4b4b72b6 | shared pipeline/late failure/atomic output tests | 6 |
| 773145e87b6df693130cda15 | shipped manifest/declared payload tests | 3 |
| 81dbd3422d5271c2937c1f2d | report provenance/closed diagnostics tests | 6 |
| b07af6a4536e3f305f2cbd96 | owner/scoped external command tests | 3 |
| b0d34954e5c18ba7b31098a5 | strict VSIX hostile archive tests | 1,3 |
| ded09201e927f84b96d1ea91 | tracked discovery NUL/ownership/classification tests | 2,4 |
| f10cf7e3aac8376a0cd86693 | immutable catalog/digest/collision tests | 3 |

## Task 8: 全品質・容量・same-hash installed proof・source全体review

**Files:** 新機能追加なし。E内receipts/review package、修正が必要なら該当Taskのliteral source/testとDiscovery seal。**Interfaces:** Consumes: committed source candidateとTask7 coverage/admission。Produces: exact candidate/tree/hash付き検証記録とfresh source review disposition。

- [ ] **Step 1: rootと3拡張のrequired checksを実行する。** 以下の範囲を一巡し、actual counts/skips/exitcodes/inputsをEへ保存する。同じtreeのbroad suiteを理由なく反復しない。

  Root: `node --test scripts/exact-head-ci-contract.test.js tools/main-consolidation/test/featureIntegrationProgramPolicy.test.mjs tools/main-consolidation/test/featureIntegrationStatusPolicy.test.mjs tools/main-consolidation/test/featureSelectionLedgerPolicy.test.mjs`、新root suite、新admission suite、4生成器の`--check`（`create-feature-integration-program-index.mjs`, `create-feature-selection-source-universe.mjs`, `create-feature-selection-ledger.mjs`, `create-feature-integration-status.mjs`）、Gate R `--check`（既存15 families/120s/3 slots/1MiB出力上限を維持）。

  3拡張それぞれのcwdで`npm run compile`, `dependency:policy`, `architecture:policy`, `source:policy`, `unused:report`, `audit:prod`, `test`。workflow-registerは追加`schema:policy`と`node scripts/check-contract-v2-runtime-reachability.js`、Bazaarは追加`artifact:policy`, `unused:policy`。無いscriptを作ってpass扱いにしない。actual executed failureを旧CI免除で隠さない。
- [ ] **Step 2: 最終3 VSIXを生成し検証する。** 各拡張`npm run package`, `package:policy`、Bazaar追加`package:smoke`。workflow<=1,200,000、Bazaar<=12,000,000、CCR<=11,000,000。79対象/AST等価/他payload不変は現policyで確認し、Git source/VSIX/mirrorのraw parityを新engineで確認する。versions/engines/locks/deps不変をdiffでassert。最終hash以外の過去packageへinstalled証拠を転用しない。
- [ ] **Step 3: same hashed VSIXのinstalled native proofを実施する。** 現行の隔離native Bob profile/CLI手順に3実VSIXをinstallし、現Owner registration/activation/cleanup互換、操作ハブ、unregister/disposeを確認する。native V2 five effects全0とR3–R5 inactive/R6 absentを保存し、profile/worktreeを保持する。GUI/live model/finalProgramUATはnot_runと明記する。
- [ ] **Step 4: source全体をfresh contextで一度reviewする。** immutable base..candidate diff、設計、計画、27coverage/remainder、local proofs/3VSIX hashesを最小review packageとして渡す。source reviewerは実装を行わずCritical/Important/Minorと根拠を返す。per-task reviewerは使わない。
- [ ] **Step 5: 必要なCritical/Importantを一回のTDD fix passで処理する。** findingごとに先にfailing regression→RED→最小fix→GREEN、変更した影響範囲だけ再検証しseal/package/hash/installed bindingを必要に応じ更新する。未解決Critical/Importantがあればsource受入へ進めない。Minorを便乗修正しない。修正不要ならこのstepはnot_neededとして記録する。
- [ ] **Step 6: 最終diff/clean stateとcandidateを固定する。** Task8にsource変更があればliteral stageで`fix: close discovery evidence review findings`をcommit。各proofの実treeを照合し、Git cleanを確認してC_D/treeを記録する。検証だけなら空commitを作らない。

## Task 9: source PR・実CI・通常merge D1

**Files:** GitHub PR/CIとEのexternal receiptsのみ。**Interfaces:** Consumes: C_D/tree/local review。Produces: normal merge D1、parents/tree、exact-head CI/Ubuntu-Windows比較成功と同一source bindings。

- [ ] **Step 1: source PRを作成する。** branchをpushしdraft PRを作る。本文は具体的なsnapshot/evidence behavior、runtime inactive、local checks、実CI待ちを記載し`--body-file`でactual newlinesを保持する。成功後は必ず`attach_artifact`でPRをこのchatへ紐付ける。
- [ ] **Step 2: candidate C_Dの4workflow実CIを確認する。** Task7の16required PR jobs、checkout SHA、run ID/attempt/nonce、共通VSIX hashesと両OS output bytesを取得する。path-filter未起動分は同SHA/32桁nonceでdispatchして15success+metrics skipを確認する。queued/起動前失敗/403/not_runは実状態のまま。実行済みコード失敗は原因を修正・必要範囲再検証して新candidateへ更新する。
- [ ] **Step 3: 通常mergeする。** candidate/review/required jobsが一致したらdraftをreadyにしnormal merge（admin override/偽status無し）。D1のtree/parentsからC_Dを含むことを確認する。今回固有の起動制約だけで進めない場合は、完成候補・実失敗・影響を提示して新しい例外判断をユーザーへ求める。過去のOwner免除は使わない。
- [ ] **Step 4: primaryをff-only同期する。** protected status snapshotが一致することを確認してmainをD1へff-only更新し、指定3領域を読まず8件のstatusを再比較する。ユーザーの未追跡をstage/deleteしない。
- [ ] **Step 5: source D1の実CIを受け入れる。** 同exact-head契約の4workflow・required jobs・Ubuntu/Windows比較を確認し、missingは同SHA/nonce dispatchする。source bytes/3VSIX/packages/外部proofをD1へ束縛したimmutable closure receiptを保存する。失敗したmainをVERIFIEDと記録しない。

## Task 10: D1に束縛した別metadata D2

**Files（6 paths限定）:** `.gitattributes`、新`docs/release-evidence/reg-bridge-discovery-evidence-completion-2026-10-20.json`、既存`tools/main-consolidation/featureIntegrationStatusPolicy.mjs`, `create-feature-integration-status.mjs`, `test/featureIntegrationStatusPolicy.test.mjs`, `docs/release-evidence/feature-integration-status.json`。

**Interfaces:** 新completion schema=`bob-builtin-analyze/reg-bridge-discovery-evidence-completion/v1`。既存Owner completionのclosed base keysを踏襲し、追加`discovery`=`{sourceCoverage,remainderClosure,subject,catalog,discovery,compiledManifest,report,crossPlatform}`を設ける。各external bindingは`{path,sha256,bytes}`でactual captured bytesへ束縛。base keysのsource head/tree/accepted main/parentsはC_D/D1を使いD2を使わない。CIは今回のactual run/attempt/SHA/job resultと、もし別途承認されたならその固有waiverを正直に保持する。

- [ ] **Step 1: D1起点の別metadata branch/worktreeを作る。** native managed worktreeを用い、branchは`codex/v2-registry-discovery-completion`。既存source worktree/proofを保持する。Task9以前にcompletion registryを追加しない。
- [ ] **Step 2: failing metadata testsを書く。** `discovery_completion_binds_source_not_metadata_and_preserves_prefix`で11refsのdeep equality prefix/12refs、static20、ordinal10だけVERIFIED、10/20、next=`PROC-T13-LEDGER`、旧OwnerM1不変、C_D/tree/parents/D1一致をassert。`safe_prefix_terminal_requires_all_gates_and_remainder`でsourceCoverage27/remainder unassigned0と全既存gateが揃う時だけWORKFLOW-C-SAFE-PREFIX terminal VERIFIED。欠落byte/hash/OS比較/実CI、JSON偽claim、D2 subjectへの置換、activeRuntimeをrejectする。

  ```js
  assert.deepEqual(status.completionReferences.slice(0, 11), previousStatus.completionReferences)
  assert.equal(status.completionReferences.length, 12)
  assert.equal(status.slices.length, 20)
  assert.equal(status.slices.filter(x => x.state === 'VERIFIED').length, 10)
  assert.equal(status.nextSliceId, 'PROC-T13-LEDGER')
  assert.equal(status.acceptedMainSha, sourceD1)
  ```
- [ ] **Step 3: REDを実行する。** `node --test tools/main-consolidation/test/featureIntegrationStatusPolicy.test.mjs` → 未登録Discovery completionによるFAIL。
- [ ] **Step 4: closed completion/policy/generatorを実装する。** actual external proofsをcaptureしてhash/size registryへ一度登録し、旧11refs/旧evidence hashesを変更せず12番目を追加する。safe-prefix boundaryはgate/remainder条件を個別検証してからterminal化する。新completionへliteral LFルールを1行追加し、statusをgeneratorのprint bytesから生成する。GUI/model/finalProgramUAT not_run、inactive/retentionを明記する。
- [ ] **Step 5: GREENを実行する。** metadata test、Task8 root必須4、4生成器`--check`、Gate R15、`git diff --check`をpassさせる。diffが6pathsだけ、extensions/source/selected universe/Owner57/Program20不変を確認する。
- [ ] **Step 6: metadataを一度独立reviewする。** 6path immutable diffとsource D1/closure/actual external-byte proofsをfresh contextへ渡す。Critical/Importantがあれば同testのRED/GREENで修正し、必要範囲を再検証する。source reviewを繰り返さない。
- [ ] **Step 7: metadata PRを作成しattachする。** literal6path stage/commit `docs: record verified registry discovery evidence completion`、push、別PR作成、`attach_artifact`。metadata candidate exact-head4workflowを実確認し、missingは同SHA/nonce dispatchする。source waiverがあってもmetadataへの適用範囲を勝手に広げない。
- [ ] **Step 8: metadataを通常mergeしmain検証する。** D2へff-only同期し、root必須4/4生成器/Gate Rと必要なexact-head CIを確認する。protected8status、旧11refs、新12ref、10/20、nextT13、source subject D1、runtime inactiveを最終照合する。worktree/profile/branches/receiptをすべて保持する。

## Self-reviewと完了判定

設計§1–3/9のscope・27出典・layerはTask1/7、§4captureはTask2、§5claims/catalog/discoveryはTask3/4、§6P4/P7はTask5、§7boundsはTask1/2/6、§8CLI/出版はTask6、§10受入試験はTask1–8、§11source/CI/metadataはTask7–10へ対応する。Review Focus5項目はそれぞれnamed testsへ割り当て済み。Task間interfaceは上の共通表を正本とし、runtime public APIを追加しない。

計画承認前はdocument-only。実装完了の宣言は、source D1/metadata D2の受入、actual proofのbyte binding、12refs/10of20とinactive/保護statusの検証後だけ行う。CI不実行や局所native proofを実CI/GUI/最終Program UAT成功と書き換えない。
