# WF2 P7 Deterministic Manifest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Execute inline; use one fresh-context review of the complete candidate after local gates.

**Goal:** 選択済み `WF2-P7-MANIFEST` の13 source itemsを現mainへ再構成し、明示したcollectionとcompile-only登録宣言から、Ubuntu/Windowsで同一bytesになるcompiled plan manifestを生成する。

**Architecture:** P2 Node filesystem loaderとP4 sole compilerを使う。offlineの `ActionRegistry` が所有するF6 registryへ明示catalog宣言を登録し、そのbranded snapshotを既存audited constructorへ渡す。P7は公開planの不変evidenceだけを生成し、P5 cache/lease ownerやP6 product gatewayを増設しない。

**Tech Stack:** 既存TypeScript / Node.js / node:test / npm lockfile / canonical JSON。新規依存なし。

**Spec:** `docs/superpowers/specs/2026-08-23-feature-selection-and-sequential-main-integration-design.md` §§7.1,10.2,12.1 と `docs/superpowers/plans/2026-07-17-workflow-contract-v2-package-compiler.md` のP7。現行selection ledger/source universeを採否の正本とし、旧planの直接standalone registry作成はowned registryへの適応に置き換える。

**Intended tracked path:** `docs/superpowers/plans/2026-10-09-wf2-p7-manifest.md`。承認前はprimaryをcleanに保つため、review copyとignored preparation内へ保存する。承認後、隔離worktreeへ同じbytesを取り込む。

## Global Constraints

- base/main `bb9773a37d52e2dd06fb8a38f40b55ce4d030766`、tree `cefc011d1f1c45e499417d9bae04ce0b40a11965`。P6 VERIFIED、P7 planned、nextSliceId `WF2-P7-MANIFEST`。
- 最大activationはshadow。product runtimeはinactive。provider dispatch、Bob task、run directory、artifact staging、P5 runtime lease、workspace有効化switchを追加・実行しない。
- compiler literal `workflow-register-compiler/v2`。P4 `compileWorkflowPackage` とP2 loaderだけを使う。legacy compiler、ad-hoc environment、unbranded catalog、manual evidence snapshotのfallbackを禁止する。
- catalogの `workflow-provider-catalog-source/v1` は登録宣言であり、provider truthではない。digest/brandはF6が生成する。product environmentは現在のlive owned registryのsnapshotを使い続け、offline fileをproductへ接続しない。
- public manifest schemaは `workflow-compiled-plan-manifest/v1`。相対POSIX `(collection,slot)` でsort/unique。異なるcollectionの同名slotは許可する。clock、host path、temp/worktree path、dispatch、Bufferをmanifestへ含めない。
- manifest上限4,096 packages、collection UTF-8上限1,024 bytes。control file上限8,388,608 bytes、provider宣言とcollection-listは各256 entries。digestは `sha256:` + lowercase64 hex。
- collection/catalog inputは明示、closed schema、canonical JSON + LF。ASCII portable segments、NFC、case-fold alias、Windows reserved names、absolute/escaping/overlapping roots、symlink/junction、同一physical rootを検証する。入力scopeを暗黙に拡張しない。
- current loaderのgeneration identity、file/size/depth limitsを変更しない。staging/forged handle、slot mismatch、generation driftをmanifestへ採用しない。
- manifestは全package compile成功後だけ、exclusive temporary fileからrenameで公開する。rename失敗時に既存targetを削除して再試行しない。失敗前のtarget bytesを保ち、自分のtemporary fileだけを片付ける。
- VSIX上限: Workflow Register 1,200,000、Bazaar 12,000,000、CCR 11,000,000 bytes。現Workflow VSIXは1,197,704 bytesで余白2,296。上限を増やさず、required runtime moduleを除外して逃げない。新しいrepo用CLI2ファイルだけをVSIXから除外し、core manifest exportは含める。
- `.gitattributes` の既存 `test/fixtures/workflow-contract-v2/** text eol=lf` を利用する。static index/ledger/source universe、完了record、既存v1 API/GUI/persistenceを変更しない。新記録はmutationAuthority:false。
- source全carrierをapply/cherry-pickしない。13 items / 11 owner-stage pathsだけを根拠に現mainへ適応し、追加の補助変更は下記file mapに限定する。

## Review Focus

1. catalogが正常に見えてもbrand/digestを外部JSONからhydrateしない。Task 2のunknown field・unbranded input・owned registration tests。
2. prototype差替え後もCLI helperからowned registry／audited compile-only cloneへの信頼済みmethod delegationを保つ。Task 2のF6/ActionRegistry mutation tests。
3. Windows alias、junction、control file差替え、同名slotがmanifest identityを変えない。Task 3/4のportable paths、physical containment、duplicate pair tests。
4. 二つ目のpackageが失敗、またはrenameがEPERM/EEXISTで失敗しても既存targetを失わない。Task 3のfailure/atomic replacement tests。
5. 同一fixtureでもhost path、autocrlf、provider順序、非選択providerがbytesを変えない。Task 4のLF/fixture/digest/cross-host evidence tests。

## Execution Setup

- [x] 開始条件を再検証し、native managed worktree v2-p7-manifest / branch codex/v2-p7-manifestを用意する。actual HEAD/tree、clean状態、owned short TMPを記録する。
- [x] lockfileを保持してnpm ci、compile、下記existing focused commandを実行し、RED前baselineを保存する。
- [x] Existing focused command (cwd extensions/workflow-register): node --test test/workflowContractV2PackageSchema.test.js test/workflowContractV2PackageLoader.test.js test/workflowContractV2Lock.test.js test/workflowContractV2Compiler.test.js test/workflowContractV2PlanStore.test.js test/workflowContractV2PlanStoreIdentity.test.js test/workflowContractV2PlanStoreRuntimeWiring.test.js test/workflowContractV2Entrypoints.test.js test/workflowContractV2ProviderRegistry.test.js
- [x] Test cleanupはowned TMP内だけ。Windowsのrecursive delete前にabsolute resolved targetとownership markerを確認する。

## Admission and Source Binding

- exact source owner stage: `95d245ce2eba9ac1412038afe96dc509bd6735de` → `e860d1ebbafe7068fc6871b16c9586a11b4fe19d`。
- source universe: `tools/main-consolidation/feature-selection-source-universe.json`。13 itemsはすべてowner-stage blob OIDと実bytesを検証済み。11 unique paths / 66,073 bytes。
- binding: primary ignored `.superpowers/sdd/2026-10-09-wf2-p7-manifest-preparation/source-binding.json`。source snapshotは同directoryの `source/`。
- 長い `commit:path` に対するWindows git showのstat失敗はraw probeを保全済み。以後はcommit:pathのblob OIDを検証し、`git cat-file blob <OID>` で読む。Git設定を変更せず、hash-objectでもbytesを照合する。
- P6 metadata PR183 merged mainと、C9保存・復元refをpreflightで再照合する。現在remoteはmain一件、open PR=0、active managed worktree=0、primary tracked clean。未追跡の既存ユーザー3項目は触らない。
- 開始時にmain、source binding、projection、branch `codex/v2-p7-manifest` と新native worktree不存在を再検証する。driftなら実装を開始しない。

## File Map

**New product/evidence implementation:**
- `extensions/workflow-register/src/core/contractV2/compiledPlanManifest.ts`: detached canonical manifest codec。
- `extensions/workflow-register/scripts/compile-workflow-contract-v2-packages.js`: explicit standalone CLI。
- `extensions/workflow-register/scripts/lib/workflow-contract-v2-environment.js`: bounded control files / owned offline registry / audited evidence environment。

**Modified adapters only:**
- `extensions/workflow-register/src/core/contractV2/index.ts`: selected manifest exportsを明示追加。
- `extensions/workflow-register/src/core/actionRegistry.ts`: owned registry register/snapshotのmodule-load captured delegation。既存method signatures、ownership、registration behaviorは維持。
- `extensions/workflow-register/src/core/contractV2/compilerEnvironment.ts`: 既存compile-only cloneのregister/snapshot delegationをcapture。同じconstructor/clone policyを使い、新cloneを作らない。
- `extensions/workflow-register/.vscodeignore`: 新しいrepo-only CLI本体/helperのexact2 pathsだけを除外。

**New tests:**
- `extensions/workflow-register/test/workflowContractV2Manifest.test.js`
- `extensions/workflow-register/test/workflowContractV2ManifestPortability.test.js`
- `extensions/workflow-register/test/workflowContractV2ManifestFixture.test.js`
- `extensions/workflow-register/test/workflowContractV2ManifestOwnedCatalog.test.js`

**New selected fixtures:**
- `extensions/workflow-register/test/fixtures/workflow-contract-v2/manifest-provider-catalog.json`
- `extensions/workflow-register/test/fixtures/workflow-contract-v2/manifest-collection/minimal/current.json`
- 同slotの `versions/sha256-f63effff0027607a3f0443e787c3055bf60394f5eb2a2fd256581db90d6528cc/workflow.yaml` と `workflow.lock.json`。

package.json、CI job contract、workflow yaml、P6 product gatewayは変更しない。既存quality jobが新test filesを自動収集する。

### Task 1: Detached canonical manifest codec

**Files:** core manifest、public index、Manifest.test.jsのpure codec cases。

**Consumes:** `CompiledWorkflowPlanHandle` / `requireCompiledWorkflowPlanState(handle)`、`canonicalJsonBytes`、`WORKFLOW_COMPILER_CONTRACT_VERSION`。

**Produces:**
- `COMPILED_WORKFLOW_PLAN_MANIFEST_SCHEMA_VERSION = "workflow-compiled-plan-manifest/v1"`。
- `CompiledWorkflowPlanManifestPackage`: readonly collection, slot, generation, packageDigest, lockfileDigest, environmentDigest, planDigest。
- `CompiledWorkflowPlanManifest`: readonly schemaVersion, compilerContractVersion, packages。
- `createCompiledWorkflowPlanManifestPackage({collection:string,slot:string,generation:Sha256Digest,handle:CompiledWorkflowPlanHandle}): CompiledWorkflowPlanManifestPackage`。
- `createCompiledWorkflowPlanManifest({packages:readonly CompiledWorkflowPlanManifestPackage[]}): CompiledWorkflowPlanManifest`。
- `encodeCompiledWorkflowPlanManifest(value:CompiledWorkflowPlanManifest): Buffer`。canonical JSON bytes + one LF。

- [x] RED: published trusted handlesから同名slot/別collectionを作り、permutationでexact LF bytes一致、detached/frozen resultをassert。duplicate pair、case alias、forged/staging handle、workflowId/generation mismatch、unknown fields/proxy/getter/sparse arrayを拒否し、getterは0回をassert。
- [x] Run: `npm run compile` と `node --test --test-name-pattern="compiled-plan manifest|manifest rejects" test/workflowContractV2Manifest.test.js`。REDはmissing manifest API/moduleという新契約の不在であることを記録する。
- [x] GREEN: current canonical JSON / strict JSON value helpersとtrusted private handle readerを再利用し、sourceのlimits/sort/identity契約を実装する。captured imported functionsを使い、共通hardeningを不用意に複製しない。
- [x] 同じfocused commandを実行しGREENを記録。explicit barrelに8 selected symbols/typesを追加し、既存exportsを保持する。
- [x] Commit: `feat(workflow): add deterministic compiled plan manifest codec`。

### Task 2: Owned compile-only catalog and bounded control files

**Files:** environment helper、OwnedCatalog.test.js、ActionRegistry / compilerEnvironmentのdelegation。

**Consumes:** `ActionRegistry.registerWorkflowProviderContract(input)`、`snapshotWorkflowProviderCatalog()`、`createAuditedWorkflowCompilerEnvironment({purpose:"evidence",providerCatalog,bobProfile})`、F7 `snapshotBobContractProfile`。

**Produces:**
- `CATALOG_SCHEMA_VERSION = "workflow-provider-catalog-source/v1"`。
- `COLLECTIONS_SCHEMA_VERSION = "workflow-contract-v2-collections/v1"`。
- async `createWorkflowContractV2EvidenceEnvironment({repositoryRoot:string,providerCatalogPath:string}): Promise<WorkflowCompilerEnvironment>`。
- async `readWorkflowContractV2Collections({repositoryRoot:string,collectionsPath:string}): Promise<readonly string[]>`。
- selected helper signatures: `canonicalRepositoryRoot(value)`、`inspectDirectRepositoryPath(repositoryRoot,relative,expectedKind,label)`、`portablePathKey(value)`、`readCanonicalJsonFile(repositoryRoot,relative,label)`、`repositoryRelativePath(value,label)`。

- [x] RED: 明示canonical registration declarationsをowned registryへ登録し、catalog順序変更でも同一digest、non-leaseable evidence environmentをassert。input fieldsはid/version/inputSchema/output/errorSchema/sideEffect/idempotency/requiredCapabilitiesだけ。brand、contractDigest、dispatch、legacy snapshot schema、duplicate registration、missing providerを拒否。
- [x] RED: F6 registryとActionRegistryのregister/snapshot prototypeをmodule load後に差し替えても、captured trusted delegatesを使用する。dispatch/Bob/provider lookup/lease spiesは0。これはsource portability familyの適応であり、新registry lifecycle featureではない。
- [x] RED: control file size、unknown fields、canonical+LF、symlink/junction components、read中identity/mtime/size差替え、collection count/provider count上限を検証。
- [x] Run `npm run compile` と `node --test test/workflowContractV2ManifestOwnedCatalog.test.js`、RED理由を保存。
- [x] GREEN: helperは一つのoffline ActionRegistryを作り、固定sourceId `workflow-contract-v2-manifest` とthrowing dispatchで宣言を登録する。snapshotをaudited constructorへ一度渡す。既存constructorによるcompile-only cloneを再利用する。上記2 core adaptersはtrusted F6 register/snapshotのcaptureだけを変更する。
- [x] 同focused commandに加えnode --test test/workflowContractV2ProviderRegistry.test.js test/workflowContractV2Compiler.test.js test/workflowContractV2Entrypoints.test.js を実行し、method signaturesとproduct owned registry behaviorが不変であることを確認。
- [x] Commit: `feat(workflow): build manifest evidence from owned catalog declarations`。

### Task 3: Explicit CLI and output preservation

**Files:** CLI、Manifest.test.jsのCLI cases、Portability.test.jsのpaths cases。

**Consumes:** Tasks 1/2、P2 `createNodeWorkflowPackageFileSystem` / `createWorkflowPackageRoot` / `loadCurrentWorkflowPackage`、P4 `compileWorkflowPackage`。

**Produces:** CommonJS exported async `main(argv:string[]): Promise<CompiledWorkflowPlanManifest>` とstandalone exit code 0/1。options: required `--root`, `--manifest`, `--provider-catalog`、repeated `--collection` または一つの `--collections` の排他的選択。

- [x] RED: explicit collection permutation/list-fileで同一bytes。implicit discovery、overlap、escaping、case-fold/physical alias、invalid slot、同slot同pair duplicate、slot/current generation driftを拒否。独立collectionの同名slotは許可。
- [x] RED: 二つ目のpackage compile failureでtargetなし／既存target不変。fs.renameのEPERM/EEXIST failureで既存target bytesを保持し、own temporary fileだけをcleanupする。既存targetを削除する旧fallbackを採らない。
- [x] Run `node --test test/workflowContractV2Manifest.test.js test/workflowContractV2ManifestPortability.test.js`。missing CLI/新atomic契約のREDを記録。
- [x] GREEN: 明示rootのdirect-child current slotsだけをP2→P4でcompileし、成功後だけone manifestをwriteする。loader/compiler failureをlegacyへfallbackさせない。outputはsame-directory exclusive temp→renameのみ。
- [x] 同focused commandとCLI二回の生成を実行し、Buffer.equals / SHA-256一致を記録。
- [x] Commit: `feat(workflow): emit manifests from explicit bounded collections`。

### Task 4: Committed fixture and cross-host evidence

**Files:** selected4 fixture files、Fixture.test.js、Portability.test.jsのremaining captured-intrinsic cases。

**Consumes:** Tasks 1–3とsource bindingのexact fixture blobs。既存CompilerTestSupport / EntrypointTestSupportのlocked package fixture builderを再利用する。

**Produces:** same-input manifest bytes + SHA-256のinspectable evidence。product activationではない。

- [x] RED: committed minimal fixtureからCLI二回を生成し、exact LF bytes一致、schema/version、single package、collection/slot/generation `sha256:f63effff0027607a3f0443e787c3055bf60394f5eb2a2fd256581db90d6528cc` をassert。
- [x] RED: sourceのcanonical encoder/private handle reader capture、portable alias rejection、prompt/schema/provider/Bob bindingのidentity変化を継承。non-selected provider追加はplan evidenceを変えない。CRLF control filesは拒否する。
- [x] GREEN: source fixtureを実bytesで取り込み、既存LF attributesでcanonicalityを保つ。metadataをgeneration directoryへ追加しない。
- [x] Fixture testの成功時diagnosticに、単一JSON `{event:"wf2_p7_manifest_fixture",actualHeadSha,fixtureInputSha256,manifestSha256,manifestBase64}` を出力する。host path/clockをmanifestへ加えず、base64から復元したbytesとSHAをassertしてから出す。actualHeadShaはfixtureが属するrepositoryのGit HEAD。
- [ ] Ubuntu/Windowsの既存quality jobは同じtestを実行する。将来のC publication evidenceで、exact run/job/head/nonceを確認した両Unit tests成功ログからこのdiagnosticを取得し、base64復元bytes・fixtureInputSha256・manifestSha256を照合する。digestだけを自己申告として採用せず、raw bytesを比較する。
- [x] Local verificationは4 manifest filesのfocused testsとCLI生成2回。cross-host CIはローカルで先に成功と書かない。旧C8 cutoverのrepository-wide artifact aggregationは今回へ取り込まない。
- [x] Commit: `test(workflow): pin portable manifest fixture evidence`。

### Task 5: Full gates, package budget and one candidate review

**Files:** `.vscodeignore` のexact CLI2 exclusions、tracked copy of this plan、append-only external technical records。必要なruntime core manifest moduleはVSIXに残す。

- [x] focused: P1-P3 package loader/lock、P4 compiler、P5 store/lease、P6 entrypoints、P7 manifestの7 groupsを実行。
- [x] Workflow Register: `npm run compile`、`npm test`、`dependency:policy`、`architecture:policy`、`source:policy`、`schema:policy`、`unused:report`、`audit:prod`、`package`、`package:policy`。
- [x] fresh VSIXでcore manifest exportの存在を確認し、1,200,000 bytes以下を実測する。CLI/helperだけを `.vscodeignore` にexact exclusionで追加。上限増加、required module除外、無関係なdependency削除を禁止。容量超過ならP7 codec/helperの重複をcurrent helpersで削減して同gateを再実行する。
- [x] Bazaar/CCRのsource tree不変、P6 product gateway / v1 commands / persistence / runtime policy不変を確認し、three-extension qualityの必要checksを実行する。
- [ ] reviewed candidateはlocal focused/full/policy/package gatesのraw記録、source13 items mapping、omissions、head/tree、VSIX hashesに結合する。fresh reviewer一回。Critical/Importantだけを一回のRED→GREEN修正passで解消し、Minorは記録。
- [ ] ローカルcandidate完成後だけ、exact reviewed headに対するDraft PR・4 manual workflows・fixed nonce・自動CI・Ubuntu/Windows manifest raw-byte comparisonを含む具体的C publication案を作る。このB計画の承認ではpush/PR/mergeを実行しない。

## Execution Order and Completion Boundary

Execution Setupを先に実施し、Tasks 1→2→3→4のTDDとcommits、最後にTask 5の全gates/reviewを実施する。インターフェース依存が強いため本スレッドのinline実装を維持し、reviewは全体に一回。独立したread-only確認だけを必要に応じて並列化する。

このlocal B scopeではmain変更、remote publication、branch deletion/native archive、P7 VERIFIED record import、Gate P完了観測、Workflow C/R1/R2実装、runtime activationを行わない。local greenとVERIFIEDを区別し、正本はP7 plannedのまま維持する。将来のCI/UAT/merge/cleanup結果はappend-only observationへ実際の成功後に記録する。

## Self-review

- [x] 13 source items / 11 owner-stage pathsをTask 1–4へ割当。直接standalone F6 registryをowned ActionRegistryへ適応。
- [x] five Review Focus conditionsをowning taskのRED試験へ割当。
- [x] core/CLI/helperのsignature・schema literal・limits・LF・sort/unique keysを固定。
- [x] atomic outputのWindows destructive fallbackを除外し、failure preservationを試験する。
- [x] VSIX budgetとdev-only CLI packagingを明示。future cross-host/head/merge/UAT successを先書きしない。
- [x] 静的source universe/ledgerと既存完了recordを変更しない。新規runtime、cache、registry lifecycle subsystemを追加しない。
## Local execution rulings before candidate review

The approved original is retained in the external preparation record (SHA-256 `c135602c395d300fa85d59f00b4dabe1eceeb3950e04bd414eeacb842a999f39`). Checked steps record observed local work; future cross-host CI remains unchecked. Task 5 review/publication observations are recorded externally to bind the exact candidate head without self-reference.

- Windows npm.cmd direct spawn failed EINVAL; use cmd.exe /d /c npm with the same lockfile/scripts.
- P5 facade exact allowlist adds only the four selected P7 runtime exports; private factories remain excluded. Ancillary test path: `test/workflowContractV2PlanStoreRuntimeWiring.test.js`.
- The first bare npm test retained three failures. Two unchanged Bob deadline cases passed in isolation; a concurrency4 complete run passed before packaging changes; the final concurrency4 run retained two different Bob10s deadline failures, which passed2.6s/3.9s in isolation. The identical full file set now runs with Node `--test-concurrency=1` locally. CI workflow/scripts remain unchanged and must pass at the eventual exact head.
- Budget refactors reuse F3 JSON snapshots and normalize once, while retaining original branded-handle identity and all limits.
- Whitespace/comment-only build compaction covers only the four P7-changed compiled modules (`compiledPlanManifest`, public index, ActionRegistry, compilerEnvironment). Complete AST/token equality is required; unsupported trivia-sensitive input falls back to original. No module is removed and no package budget is raised.
- Necessary ancillary packaging paths: `scripts/lib/compact-manifest-module.js`, `scripts/recompress-vsix.js`, `test/workflowContractV2ManifestPackaging.test.js`. The new build-only helper is the third exact dev-tool exclusion, uses the existing TypeScript dependency, and is not an extension runtime entrypoint. Tests compare independent ZIP contents/attributes, idempotence and real codec behavior.
- Local VSIX1,199,959 bytes is below the fixed1,200,000 cap by41 bytes. Hosted Windows/Ubuntu package gates are still required; the small margin is recorded, not assumed portable.
- Candidate, failed/partial logs, selected source snapshots and all prior preservation remain retained under the user-approved B scope. No cleanup or publication follows from local green.

Final local gate observation before candidate review: entire unchanged file set2,059 tests /2,058 pass /1 skip /0 fail under concurrency2, short owned OS TMP and owned-process AboveNormal priority (preload recorded externally). Bare and concurrency4 failures, interrupted serial execution and whole-Bob27/26/1 diagnostic remain preserved. Production audit retry0 vulnerabilities after retained registry DNS ENOTFOUND. Policies and3-extension68 contracts pass. No Bob code, assertions, deadlines, dependencies or CI workflow changed.
