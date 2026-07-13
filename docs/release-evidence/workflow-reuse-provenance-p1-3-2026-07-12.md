# Workflow Reused / Skipped Provenance P1-3 Release Evidence

## 1. 判定

| 項目 | 値 |
| --- | --- |
| 実施日 | 2026-07-12 / 2026-07-13 UTC |
| Repository | `katamor1/bob_builtin_analyze` |
| Component | `extensions/workflow-register` |
| Branch | `agent/workflow-reuse-provenance-p1-3-20260712` |
| Pull request | #90 |
| Base | `main` at `382ae7dd1f0096415129734f573a613389c0433e` |
| Latest implementation head before evidence | `ae90d370d1af81a78cd7a2fd1a446613f4088e08` |
| Focused projector／UI／diagnostics／Bob control tests | PASS |
| Whole-diff review | Critical 0 / Important 0 after fixes |
| Merge gate | **NO-GO until final evidence-tail matrix is green** |

## 2. Delivered behavior

- Existing run provenanceから副作用なしの共通projectionを生成する。
- 通常completedとartifact reuseによるreused completedを区別する。
- Reuse source run、start step、reused step IDs、hydrated state key IDsを表示する。
- `workflow.artifactHydration`へ記録されたentryだけを`Artifact verified`として表示する。
- Task snapshot import artifactをproducing stepへ紐づける。
- Definition mismatchを許容したrunを表示する。
- Operation Hub、Bob Workflow Runs、Run Diagnostics、Bob chat control blockで同じprojectionを利用する。
- Bob Todoへ新しいstatusを追加せず、`run.json`を正本として維持する。
- Live Bob taskがない保存済みsync projectionをOKのlive syncとして表示しない。

## 3. Persisted-data compatibility

新しい永続schemaは追加していない。

利用する既存record:

```text
workflow.artifactReuse/v1
workflow.artifactHydration/v1
workflow-register/task-snapshot-import/v1
workflow.definitionMismatch
workflow-register/bob-task-sync/v1
```

次は変更していない。

```text
WorkflowRunState schema
RunStepState.status values
artifact manifest schema
Bob Todo completion API
```

## 4. TDD evidence

### Pure projector

- Test-only head: `ce4c34d30a3eaed3e95a41096dce6fe47e5f3ce9`
- RED: `extensions-quality` run `29214166123`; `workflow-register` unit test failed because `out/core/runProvenance` did not exist.
- Implementation head: `345542a7dc4acb20454a99cb2a4088742b425b0a`
- GREEN: `extensions-quality` run `29214262332`; projector tests and Linux workflow-register unit suite passed.

### Operation Hub

- Test-only head: `e2d56ecd13a7de750cbf508be2f6509ae73e2292`
- RED: `extensions-quality` run `29214337990`.
- Focused apply／verify run: `29214462310`.
- Verified implementation head: `d20d74d87bc807f0eb2222e1968ae9150268fd26`.

### Runs View and Run Diagnostics

- Test-only heads: `444306f1d6f1d3f1ec0e8955070ea0bcc5b86266`, `02260e6eb681b0acb5c8cbde5db6ffbed7e5d714`.
- RED: `extensions-quality` run `29214580853`.
- First focused apply found diagnostic field-order mismatch: run `29214704133`.
- Corrected focused GREEN: run `29214808090`.
- Verified implementation head: `2ded8ae453e27d8de5bb5a793469e483a0569f46`.

### Bob control provenance

- Test-only head: `67016e4b0c225859fac02e4fc5ccf41841fa04cb`.
- RED: `extensions-quality` run `29214892808`.
- Focused GREEN: run `29215014851`.
- Verified implementation head: `bb32533b28d12b854a8282df518931143cf39545`.

### Display bounds and metadata sanitization

- Test-only heads: `6c7432563a3c70593c5063b56205160182eebce7`, `9bbebfd30cc687f94785a03b5038819f96d8a114`.
- RED: `extensions-quality` run `29215123830`.
- Focused GREEN: run `29215248587`.
- Verified implementation head: `ae90d370d1af81a78cd7a2fd1a446613f4088e08`.

## 5. Display contract

### Operation Hub

- Step provenanceを8件まで表示する。
- 超過件数を`N more step(s); see Run Diagnostics`で示す。
- Reused stepは`Reused`と`Skipped by artifact reuse`を表示する。
- Source run、verified artifact IDs、hydrated state key IDsを表示する。
- `bobTaskSync`がstored syncedでもlive taskがない場合はwarning表示する。

### Runs View

Tooltipに次を表示する。

- reused step IDs
- source run
- reuse start step
- hydrated state key IDs
- verified artifact IDs
- task snapshot import件数
- definition mismatch allowed

### Run Diagnostics

`Workflow provenance:` sectionとstep-level `completionSource`を表示する。

### Bob chat

- ID／件数だけをcontrol blockへ表示する。
- ID一覧は種類ごとに最大20件。
- Control lineは最大12行。
- 超過は`(+N more)`で表示する。

## 6. Privacy and malformed-input behavior

Projectionへ含めないもの:

```text
artifact body
snapshot body
hydrated state value
preview diff
checksum value
```

Optional provenanceの次のmetadata tokenは無視する。

```text
ASCII control characterを含む
256文字超
空文字
必須ID欠落
```

Malformed JSONやunknown shapeは、そのoptional recordだけを無視してrun一覧を継続する。

## 7. Residual and external gates

- Final evidence-tailのUbuntu／Windows matrix、policy、package、VSIX、Extension Host smokeを完了する。
- 実IBM Bobでcontrol messageとlive task unavailable表示を確認する。
- Multi-rootで同一run IDを持つ別rootのprojectionが混線しないことを実機確認する。
- P1-4 Detached Held Run recovery assistantは次の独立PRで実装する。

## 8. Cleanup

TDD／mutationに使用したtemporary workflowは、検証成功時に自身を削除している。Final PR diffにはproduction code、tests、design／plan、operator document、release／review evidenceだけを残す。
