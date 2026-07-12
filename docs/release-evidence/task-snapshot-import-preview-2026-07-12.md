# Task Snapshot Import Preview / Selective Apply Release Evidence

## 1. 判定

| 項目 | 値 |
| --- | --- |
| 実施日 | 2026-07-12 |
| Repository | `katamor1/bob_builtin_analyze` |
| Component | `extensions/workflow-register` |
| Branch | `agent/task-snapshot-import-preview-p1-2-20260712` |
| Pull request | #88 |
| Final code head | `784864813169492709edd2536d9236fbb2f00d17` |
| Documentation gate head | `c7db2e9d2be63a744cb55397a6e5d452289246a1` |
| Focused preview / apply / report / projection tests | PASS |
| Focused final diagnostic | run `29206130109`: compile 0 / 7 passed / 0 failed |
| Final code matrix | `extensions-quality` run `29206419912`: all 7 jobs success |
| Documentation-tail matrix | `extensions-quality` run `29206741706`: all 7 jobs success |
| Documentation-tail workflow contracts | run `29206741679`: success |
| Documentation-tail review scaffold | run `29206741682`: success |
| Whole-diff review | Critical 0 / Important 0 |
| Merge gate | **GO** |

## 2. Delivered behavior

- Task snapshot importはartifactを書き込む前にread-only previewを表示する。
- Previewは`lastAssistantText`と`taskExport`を区別する。
- Candidateごとにstep、snapshot日時、reason、target path、schema、UTF-8 bytes、SHA-256を表示する。
- Snapshotの`truncated`、omitted message数、`[REDACTED]` markerの可能性を表示する。
- 既存fileが異なる場合、既存SHA-256とサイズ上限付きdiffを表示する。
- Truncated、redacted、既存file変更、既存state keyは初期選択しない。
- Selection未指定のcore callerもdefault-safe candidateだけを自動importする。
- Review済みのunsafe candidateはartifact IDを明示選択した場合だけ救済できる。
- QuickPickによるartifact単位のselective applyを提供する。
- 既存fileの上書きはmodal confirmationを必須にする。
- Previewとapplyは同じplannerを使用し、preview digest mismatchをtransaction開始前に拒否する。
- 選択したartifactだけをartifact files、manifest、run state、import provenanceの既存transactionへ入れる。
- Operation HubとRuns Viewへtask snapshot import provenanceを本文なしで表示する。

## 3. TDD evidence

### Preview planner

- Test-only head: `4883d39e0983e463720288cdce476cbb7744a278`
- RED: `extensions-quality` run `29204608010`; preview moduleが存在しないことを確認。
- Production/export heads: `ffe032fc63a9d642bb7f204fbfcea50b84330f60` / `828e64bd5f8d5f4b9dd1952c380a76d9786407f2`
- GREEN: focused run `29204768009`。

### Selective apply and stale-preview protection

- Test-only head: `6eabe2b0d8c0b7088b8e0a5a825f0688ccab5404`
- RED: focused run `29204842338`。
- Production head: `e3dab6f6b464f6cc466dc98c1c0d979723b2c2d0`
- GREEN: focused run `29204907855`。

### Preview report and selection order

- Test-only head: `e643a3a114293e592e47bbdddc4d7aafaa110861`
- RED: focused run `29204972610`。
- Report/selection production head: `8b7594f114695f6421b1f78c1f52ac66353b51a5`
- GREEN: focused run `29205015256`。
- Command adapterはpreview → QuickPick → overwrite confirmation → gate → execution lease → applyの順序で実装し、source contract testで固定した。

### Provenance projection

- Test-only head: `85acc46a62ce3f30b687b358300a84ec0cbe7faa`
- RED: focused run `29205308654`。
- Operation Hub / Runs View projectionを追加し、corrected contract head `68926406455d1947343b7fa73315d6783e79e1e8`以降でGREENを確認した。

### Markdown diff containment

Whole-diff reviewで、snapshot diff内のbacktick runがMarkdown fenceを閉じ得ることを検出した。

- Regression head: `edd7b4ecd72244864f55bde0057c9d671c580910`
- Fix head: `3c2665ed280bc294a8a2f8a260b1412de5e20547`
- Fenceはdiff内の最長backtick runより1文字長く生成する。
- Focused diagnostic run `29206130109`: compile 0、7 tests passed、0 failed。

### Safe implicit defaults

Reviewで、selectionを省略したcore callerがtruncated/redacted candidateまで暗黙importし得る境界を検出した。

- Final code head: `784864813169492709edd2536d9236fbb2f00d17`
- Selection未指定時は`defaultSelected === true`のcandidateだけを対象にする。
- Safe candidateが0件ならfile、manifest、run stateを変更しない。
- Explicit selectionではreview済みtruncated candidateをimportできる。
- `workflowTaskSnapshotImportSafeDefaults.test.js`で両契約を固定した。

## 4. Full quality gates

Final code head `784864813169492709edd2536d9236fbb2f00d17`に対する`extensions-quality` run `29206419912`は、次の7ジョブをすべて成功させた。

- Linux / Windows `workflow-register`
- Linux / Windows `bob-code-consistency-review`
- Linux / Windows `bob-bazaar-review`
- Extension source metrics

両OSの`workflow-register`はunit、dependency / architecture / source policy、package、VSIX policy、Extension Host smokeまで完走した。Linuxではschema policy、unused report、production auditも成功した。

Documentation gate head `c7db2e9d2be63a744cb55397a6e5d452289246a1`に対するrun `29206741706`でも同じ7ジョブがすべて成功した。Workflow contracts run `29206741679`とreview scaffold run `29206741682`も成功した。

## 5. Transaction and concurrency contract

Previewと利用者の選択中はrun execution leaseを保持しない。選択後に次を行う。

```text
reload run / workflow
→ acquire review gate and execution lease
→ recompute preview
→ compare preview digest and existing-file hashes
→ write selected artifact files
→ write artifacts/manifest.json
→ update run state and workflow.taskSnapshotImport
→ persist run
```

`writeWorkspaceFilesAtomically()`とrun-state rollbackを維持する。空選択、digest mismatch、上書き未確認、unsafe path、transaction failureでは部分commitしない。

## 6. Security and privacy

- Preview readはphysical workspace containmentを通す。
- Apply writeは既存workspace transactionのcontainment、symlink/junction拒否、rollbackを維持する。
- Snapshot本文、既存file本文、diffはrelease evidenceへ保存しない。
- UI reportではdiffだけをsize boundし、Markdown fenceを内容に応じて拡張する。
- Operation Hub / Runs Viewは件数と日時だけを表示し、snapshot本文を表示しない。

## 7. Compatibility

- Command ID `workflowRegister.importArtifactsFromTaskSnapshots`を維持する。
- Artifact manifest `workflow-register/artifact-manifest/v1`を維持する。
- `workflow-register/task-snapshot-import/v1` provenanceを維持する。
- Selection省略時はdefault-safe candidateだけを自動importする。
- Unsafe candidateを救済するcallerはpreview後に`selectedArtifactIds`を明示する。
- Task snapshotは再開の正本ではなく、import後のartifact fileとmanifestが正本である。

## 8. Residual and external gates

- P1-3 Reused / Skipped状態の統一表示は次の実装単位。
- P1-4 Detached Held Run recovery assistantは後続。
- 実IBM Bob、実Bazaar、multi-root、distribution signingは製品配布UATで確認する。

## 9. Cleanup

TDD、command mutation、provenance mutation、safe-default mutation、full-log diagnosticに使ったtemporary workflowsは最終PR diffから削除した。最終差分はproduction code、tests、design/plan、operator document、release/review evidenceだけに限定する。
