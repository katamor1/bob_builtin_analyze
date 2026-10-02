# Wave 0B Selection Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 履歴ソースを網羅的に分類し、採否の静的台帳と、Wave 0A受入を反映した検証可能な状態表示を追加する。

**Architecture:** Git履歴と固定archive identitiesからsource universeを生成し、人がreviewしたsymbol/contract/test-familyの所有割当をclosed-schema policyで検証する。静的採否・依存関係と実行結果を別artifactにし、JSONからMarkdownとstatus projectionを決定的に生成する。既存Programの20 slice順序を利用し、旧executorや承認captureを復活させない。

**Tech Stack:** Node.js 22、ES modules、node:test、Gitのread-only plumbing、既存canonicalJson。

**Spec:** `docs/superpowers/specs/2026-08-23-feature-selection-and-sequential-main-integration-design.md` §3・§6・§9–12（technical-only）、`docs/superpowers/specs/2026-08-31-wave0a-risk-tiered-approval-and-evidence-design.md` §4–8（承認・証跡）、`tools/main-consolidation/feature-integration-program-index.json`。

## Global Constraints

- `ONE_ACTIVE_SLICE`、`ONE_CONTINUOUS_SLICE_WORKSPACE`。Wave 0AがVERIFIEDになった後だけ開始。
- `no_product_runtime_change`、`wave0a_manifest_hash_bound`。履歴archiveはread-only、patch apply/cherry-pick/旧branch再作成なし。
- planning baselineは `c59db06ecb32eb7a57beeb3e932acdd5b4774de5`、今回のexecution baseは `ec136225bf2737a2f2c8053dce69d3acb6f4be3d`。二つを混同しない。
- dispositionは `selected / conditional / rejected_current_snapshot / superseded` の一つ。dynamic keysと未来のhead/merge/UAT placeholderは静的artifactに入れない。
- raw commit/path/testは一つのtranche、sourceItemIdは一つのprimary owner。共有利用は `consumedBy`。Contribution prerequisiteをProcessing Aへ二重計上しない。
- P6の最大activationはshadow、R2のproduct reachabilityは0、R3–R5はconditionalかつinactive、R6 archived snapshotはrejected_current_snapshot。現行Workflow A、OOXML、GUI診断を正本とする。
- 人の承認本文、request hash、raw provider transcript、claim/receipt/旧bootstrapは保存・実行しない。検証結果は実行許可を発行しない。
- network/credentialなし。公開・push・PR・main更新・既存worktree/branch削除・publishなし。local commitだけを新規作業branchに作る。

## Workspace and Output Scope

managed worktree: `C:/Users/stell/.codex/worktrees/v2-selection-ledger/bob_builtin_analyze`、branch: `codex/v2-selection-ledger`、base: accepted main `ec136225…`。native create_worktreeで作成した返却pathを確認し、このworkspaceだけで実装を行った。

test-owned fixture/output root: `<worktree>/.superpowers/sdd/2026-10-01-wave0b-selection-ledger/fixtures`。fresh childだけを生成し、既存保全データは置換しない。新planのtracked保存先は `<worktree>/docs/superpowers/plans/2026-10-01-wave0b-selection-ledger.md`。root mainの未追跡データは編集しない。

## Review Focus

1. range endpointで消えたpathやmerge内の変更を落とさない（Task 1の履歴fixture）。
2. Contribution prerequisiteに架空のPR番号を与えず、Processing Aと二重所有しない（Task 1・2のprovenance fixture）。
3. mixed-purpose T17/T18のpathを丸ごと一機能へ割り当てない（Task 1のsemantic ownership fixtureと独立review）。
4. conditional/rejected機能や未検証の前sliceをstatusから実行可能へ昇格しない（Task 3のreplay・negative fixture）。
5. 静的JSONとMarkdownのdrift、改変されたarchive/完了証跡を受理しない（Task 2・3のbyte/digest fixture）。

## File Map

| File | Responsibility |
| --- | --- |
| `tools/main-consolidation/featureSelectionSourcePolicy.mjs` | tranche、履歴manifest、symbol/contract/test-family ownershipの検証 |
| `tools/main-consolidation/create-feature-selection-source-universe.mjs` | read-only Git/archive inputsからcanonical universeを生成・check |
| `tools/main-consolidation/feature-selection-semantic-inventory.json` | reviewされたsourceItemId・primary owner・consumedBy・remainderの入力 |
| `tools/main-consolidation/feature-selection-source-universe.json` | 固定range、commit/path/test manifests、itemsとprovenanceの正本 |
| `tools/main-consolidation/featureSelectionLedgerPolicy.mjs` | disposition、dependency閉包、activation上限、静的schemaの検証 |
| `tools/main-consolidation/create-feature-selection-ledger.mjs` | JSONに基づくMarkdownの決定的生成・check |
| `docs/release-evidence/feature-selection-ledger-2026-08-23.json` | 採否・理由・受入要件の静的decision record |
| 同 `.md` | JSONの読取り用projection |
| `tools/main-consolidation/featureIntegrationStatusPolicy.mjs` | 完了証跡とstatus/admission/workspace-dispositionのpure検証 |
| `tools/main-consolidation/create-feature-integration-status.mjs` | 検証済み観測に基づくstatus projectionの生成・check |
| `docs/release-evidence/wave0a-completion-2026-10-01.json` | 今回の受入済みmain・CI・保全・topologyに結び付けた通常の完了証跡 |
| `docs/release-evidence/feature-integration-status.json` | 実際のWave 0A完了と、将来sliceの未実施状態 |
| `tools/main-consolidation/test/featureSelectionSourcePolicy.test.mjs` | source universe / provenance / semantic ownershipのRED・GREEN |
| `tools/main-consolidation/test/featureSelectionLedgerPolicy.test.mjs` | 採否・dependency・静的/dynamic分離・生成bytes |
| `tools/main-consolidation/test/featureIntegrationStatusPolicy.test.mjs` | recovery replay・admission・workspace disposition・projection |

既存Program/Campaign/Risk policyの変更は、上記とのdata契約接続に必要な最小差分だけ。歴史的authorityを有効化せず、既存のlegacy rejection testsを維持する。

### Task 1: Complete Source Universe and Semantic Ownership

**Files:** source policy、source generator、semantic inventory、source universe、source policy test。

**Interfaces:**
- `buildSourceUniverse({ archiveIdentities, carrierRanges, historyManifests, semanticInventory }) -> SourceUniverse`
- `validateSourceUniverse(universe, { programIndex, archiveIdentities }) -> void`（違反はthrow）
- `readRangeHistory({ fromSha, toSha }, { readGit }) -> { commits, changedPaths, sourceTests }`
- `renderSourceUniverse(inputs) -> Buffer`、generator `--check | --print`（生成先の任意path引数なし）。

- [x] **Step 1: Write failing tests.** `includes_deleted_and_merge_only_paths` はendpointにないpathを履歴から含める。`partitions_contribution_prerequisite_once` は25 prerequisite commitsを専用trancheにし、Processing Aの残余46/54 commitsとの多重割当を拒否する。`requires_one_primary_owner_per_source_item` は未割当・重複・未承認overlapを拒否し、consumedByを所有へ数えない。`binds_exact_archive_history` は40桁SHA・blob・manifest digestの改変を拒否する。
- [x] **Step 2: Run RED.** `node --test tools/main-consolidation/test/featureSelectionSourcePolicy.test.mjs`。上記機能が未実装で失敗することを確認。
- [x] **Step 3: Implement history manifests.** `carrier-patches/carrier-patches.json` のWorkflow B/C、Processing A/B/Cと独立Contribution rangeを固定入力にする。closed PR mappingと保存ref inventoryから旧P4–R6、Processing prerequisite/T13–T18の各headも結合し、range内の中間headは二重trancheへ数えない。既存original/recovery bundle双方の期待headを確認。全commitとmergeのfirst-parent changed pathsを収集し、rename両側・削除pathを含める。canonical sorted manifestsをhashへ結合する。
- [x] **Step 4: Implement reviewed semantic inventory.** path/export数をsourceItem数の代替にしない。Contribution lifecycle/discoveryとexplicit remainder、T17 cancellation/deadline vs physical-path containment、T18 report vs CCR/Bazaar handoffをsymbol/contract/test-family単位で割り当てる。blob/path、代表symbol/contract/test-family、primaryOwner、consumedBy、理由を記録する。
- [x] **Step 5: Run GREEN and review semantics.** focused testと `node tools/main-consolidation/create-feature-selection-source-universe.mjs --check` が成功。独立reviewで途中消滅path・mixed-purpose itemの欠落0を確認。
- [x] **Step 6: Commit.** 新規branchへTask 1所有ファイルのみを明示stageし、`feat: inventory archived v2 source ownership`。

### Task 2: Static Selection Ledger and Deterministic Markdown

**Files:** ledger policy、ledger generator、ledger JSON/Markdown、ledger policy test。

**Interfaces:**
- Task 1の `SourceUniverse` を消費。
- `validateSelectionLedger(ledger, { universe, programIndex }) -> void`
- `renderSelectionLedgerMarkdown(ledger) -> Buffer`
- `checkSelectionLedgerArtifacts({ ledgerBytes, markdownBytes, universe, programIndex }) -> void`

- [x] **Step 1: Write failing tests.** `rejects_missing_duplicate_capability_and_dependency` は全sourceItem/capabilityの一意分類と依存閉包を検査。`preserves_conditional_and_rejected_runtime_limits` はR3–R5 conditional/inactive、R6 rejected、P6 shadow、R2 reachability0を固定。`accepts_explicit_prerequisite_without_fake_pr` はarchive provenanceを保持しながらPRを持たない実prerequisiteを識別し、架空番号0や捏造PRを拒否。`rejects_dynamic_keys_and_markdown_drift` はmergeSha、status、UAT placeholder、編集済みMarkdownを拒否。
- [x] **Step 2: Run RED.** `node --test tools/main-consolidation/test/featureSelectionLedgerPolicy.test.mjs`。
- [x] **Step 3: Implement closed static schema and decisions.** spec §6.2のsourceOrigin、disposition、rationale、hardDependsOn、sequenceAfter、goConditionRequirement、approvalRequirement、maxAuthorizedActivation、target surfaces/invariants/omissions、acceptance requirementsを明示。履歴由来はclosed PRまたは実prerequisiteのdiscriminantで表現し、架空のPRを作らない。program catalogを正本とし、4 dispositionsのいずれかへ全itemを対応させる。
- [x] **Step 4: Implement deterministic generator.** 既存 `canonicalJson` を再利用。JSONは静的decision、Markdownは同一decisionのprojection。`--print` はstdoutだけ、`--check` は既存bytesとの差分を拒否。
- [x] **Step 5: Run GREEN.** focused test、source universe check、ledger checkが成功し、JSON/Markdownの採否・依存差分0。
- [x] **Step 6: Commit.** Task 2所有ファイルを明示stageし、`feat: validate v2 feature selection ledger`。

### Task 3: Recovery Evidence, Status Projection and Downstream Protocols

**Files:** status policy/generator/test、Wave 0A completion JSON、feature-integration-status JSON。必要な既存data-contract接続のみ。

**Interfaces:**
- `validateCompletionObservation(record, { programIndex, evidenceDigests }) -> void`
- `projectIntegrationStatus({ programIndex, ledger, completionObservations }) -> StatusProjection`
- `deriveNextSlice({ programIndex, statusProjection }) -> ProgramCatalogDescriptor | null`（caller descriptorを受け取らない）
- `validateWorkspaceDisposition({ sliceDescriptor, terminalObservation, preservationObservation, decision }) -> void`
- `renderIntegrationStatus(inputs) -> Buffer`。

- [x] **Step 1: Write failing tests.** `replays_verified_wave0a_and_planned_slices` は実ec136225の証跡だけをWave 0A VERIFIEDとし、未実施20 slicesをmerged/activeにしない。`rejects_forged_terminal_or_stale_main` は未検証predecessor・古いCI・証跡digest不一致・caller-supplied descriptorを拒否。`requires_complete_workspace_disposition` は preserve_external→remove_exact_worktree→delete_exact_local_ref→verify_main_only の欠落を拒否し、retain_same_workspaceでも次sliceを並列開始しない。`keeps_gate_p_observational` はGate Pをmutation sliceへ昇格しない。`rejects_legacy_authorization_import` は旧request-hash/claim/captureから権限を受け取らない。
- [x] **Step 2: Run RED.** `node --test tools/main-consolidation/test/featureIntegrationStatusPolicy.test.mjs`。
- [x] **Step 3: Implement observation binding and projection.** 今回保存したCI snapshots/raw logs、PR175 parents/tree、保全manifest、native archive readbacks、exact ref deletion、final topologyを通常の完了証跡に結合。JSONは事実を記録するだけでmutation authorityを返さない。native Codex snapshot refs・既存stash・保持user3群は削除対象外として明記し、active branch/worktreeと区別する。
- [x] **Step 4: Implement pure downstream protocols.** validated Program catalogから次sliceを導き、immediatePredecessor VERIFIEDを要求。workspace dispositionは実証跡と一致させ、automatic cleanupはfalse。risk escalationは既存Risk policyに従い、人の承認をartifact/tokenへ置換しない。
- [x] **Step 5: Run GREEN and full relevant checks.** `node --test tools/main-consolidation/test/*.test.mjs`、Program/source universe/ledger/status各generatorの `--check` を実行。生成bytes drift0、legacy rejection維持。独立reviewのCritical/Important 0。製品runtime sourceのdiff0を確認。
- [x] **Step 6: Commit.** Task 3所有ファイルと新計画を明示stageし、`feat: project verified v2 migration prerequisites`。結果とlocal headを報告し、push/PR/main/cleanupへ進む前に具体的なC対象を提示。

## Acceptance and Handoff

Wave 0Bのlocal成果物は全sourceItem一意分類、archive provenance結合、静的/動的分離、決定的Markdown/status、downstream replay成功でreview可能となる。local testsとcommitだけでWave 0B VERIFIEDやV2 runtime completeを宣言しない。exact-head CI、統合後main CI、workspace cleanupは後続の明示的なC確認で実施する。

## Local Execution Notes — 2026-10-02

履歴入力は910 commits、586 raw path memberships、675 semantic source itemsを分類する。Contribution prerequisiteの25 commitsはProcessing T13/T14の46/54 commitsから独立している。source itemの`symbols`は代表identifierとfull-range history内のhistorical aliasを含み、owner-stage snapshotはfamilyの契約を確認する代表blobである。途中renameされた全test titleがその一つのblobへ残ることは要求しない。

source入力とsource universeはreview済みcanonical digestへ固定する。generatorは入力bytes自体もcanonical JSONと一致させ、任意output flagを受け付けない。完了registryは実際のWave 0Aだけを受理し、将来の完了はreview済み証跡を加算してから利用する。workspace dispositionのpure validatorはterminalと保全・削除・topologyの整合性を検査するもので、live filesystem検査、completion registryへの受入、人のC承認、cleanup実行を代替しない。

新規policy testsは23/23成功し、修正後の独立reviewはCritical 0 / Important 0 / Minor 0。Wave 0Bのlocal成果物は将来の受入結果と分離し、status上のWave 0Bを含む20 sliceはplanned/inactiveを維持する。公開・統合・実worktree cleanupは後続の具体的C対象を確認してから実施する。

Task 1のlocal commitは `0877c24d`、Task 2は `e97c220c`。全体testの初回実行ではWindowsのGit fixture object pathがMAX_PATHを超えて84件失敗した。最終実行はtest子プロセスの環境だけで `core.longpaths=true` を設定し、Git設定ファイルや製品コードは変更しない。

最終の `tools/main-consolidation/test/*.test.mjs` は843/843成功、failure/cancelled/skipped/todoはすべて0。Program/source universe/ledger/statusの4 generator `--check`、`git diff --check`、製品runtime sourceのdiff0を確認した。下記の完了checkboxはlocal実装・検証・commitに限り、Wave 0BのVERIFIED受入や公開・main統合・cleanupの実施を示さない。
