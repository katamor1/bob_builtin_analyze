# Workflow Reused / Skipped Provenance P1-3 Whole-Diff Review

## Scope

- pure run provenance projector
- existing artifact reuse／hydration／task snapshot import parsing
- Operation Hub model and HTML
- Bob Workflow Runs tooltip
- Run Diagnostics
- Bob chat control block and runner wiring
- Bob Todo live availability distinction
- tests, design, plan, operator documentation and release evidence
- temporary workflow cleanup

## Review method

1. `main`との差分をfile単位で確認した。
2. 新しい永続schemaやstep statusが追加されていないことを確認した。
3. Artifact body、snapshot body、hydrated state value、checksumがprojectionへ混入しないことを確認した。
4. Malformed optional JSONがrun一覧全体を壊さないことを確認した。
5. Operation Hub、Runs View、Diagnostics、Bob controlが同じprojectorを利用することを確認した。
6. Bob Todo stored projectionとlive task availabilityが分離されていることを確認した。
7. Long workflow、control character、oversized metadata、unknown step IDを確認した。
8. Temporary mutation workflowsが最終差分に残らないことを確認した。

## Findings fixed during review

### Important — Operation Hub step provenance was unbounded

初期実装は全stepをRun cardへ展開していた。長いworkflowでRun Monitorが過度に肥大化するため、8 stepへ制限し、省略件数をRun Diagnosticsへの誘導とともに表示した。

回帰test:

```text
operationHubStepProvenanceBound.test.js
```

### Important — Optional provenance metadata could contain control characters

Optional state recordはJSON shapeだけを検査し、source run、step ID、artifact ID、state keyに改行やNULを含められた。HTML escapingはmarkup injectionを防ぐが、Runs View tooltip、diagnostic line、control messageの構造を壊し得る。

Projectorで次を拒否するよう修正した。

```text
ASCII control characterを含むmetadata token
256文字を超えるmetadata token
空token
```

回帰test:

```text
workflowRunProvenanceSanitization.test.js
```

### Important — Stored Bob Todo sync could be mistaken for a live sync

`bobTaskSync.drift.status`が`synced`でも`liveTaskAvailable=false`の場合、従来表示は単に`Bob Todo: synced`だった。保存済みprojectionと現在操作可能なtask handleを混同しないよう、warning表示へ変更した。

```text
Bob Todo: saved projection only; live task unavailable
```

### Important — Diagnostic field order did not satisfy the stable output contract

最初のadapterではstep-level `sourceRun`をartifact／hydrationより前に出し、stable diagnostic assertionと不一致になった。Run-level sourceを先に表示し、step lineはcompletion source、skip、artifact、hydrated key、source runの順へ固定した。

## Non-destructive invariants

- Projectorはrunを変更しない。
- `RunStepState.status`を変更しない。
- Bob Todoへ新しいstatusを書かない。
- Artifact reuse／hydration／snapshot import recordを再保存しない。
- Malformed optional recordは無視するだけでrunを隔離しない。
- Existing Operation Hub actions、run mutation revision guard、Bob Todo drift statusを変更しない。

## Privacy invariants

- State valueを表示しない。
- Artifact／snapshot本文を表示しない。
- Checksum値を表示しない。
- DisplayするのはID、件数、timestamp、completion sourceだけ。
- Bob control lineは制御文字を除去し、件数上限を持つ。

## Verification used

- Projector RED: run `29214166123`。
- Projector GREEN: run `29214262332`。
- Operation Hub RED: run `29214337990`。
- Operation Hub focused GREEN: run `29214462310`。
- Runs View／Diagnostics RED: run `29214580853`。
- Runs View／Diagnostics focused GREEN: run `29214808090`。
- Bob control RED: run `29214892808`。
- Bob control focused GREEN: run `29215014851`。
- Bounds／sanitization RED: run `29215123830`。
- Bounds／sanitization focused GREEN: run `29215248587`。
- Final matrix: pending on evidence tail.

## Final result before evidence-tail matrix

| Severity | Open findings |
| --- | ---: |
| Critical | 0 |
| Important | 0 |

Code-review gate is GO. Merge gate remains NO-GO until the final Ubuntu／Windows matrix, package, VSIX policy and Extension Host smoke succeed on the final evidence head.
