# Task Snapshot Import Preview / Selective Apply Whole-Diff Review

## Scope

- task snapshot preview planner and digest
- selective apply and existing-file overwrite boundary
- safe implicit-selection defaults
- existing artifact/manifest/run-state transaction and rollback
- command preview / QuickPick / confirmation / lease ordering
- Markdown preview report
- Operation Hub and Runs View provenance projection
- focused tests, operator document, plan and release evidence
- temporary workflow cleanup

## Review method

1. `main`との差分をfile単位で確認した。
2. Previewが副作用を起こさず、UI確認中にrun leaseを保持しないことを確認した。
3. Applyが同じplannerを再実行し、digest mismatchをwrite前に拒否することを確認した。
4. Artifact file、manifest、run state、provenanceが既存transactionに含まれ、失敗時にrollbackされることを確認した。
5. Physical workspace containmentとunsafe path rejectionを確認した。
6. Snapshot本文がrelease evidenceやprovenance badgeへ混入しないことを確認した。
7. Selection省略時にunsafe candidateを暗黙importしないことを確認した。
8. Linux / Windows unit、policy、package、VSIX、Extension Host gateを確認した。

## Findings fixed during review

### Important — preview diff Markdown fence could be closed by snapshot content

Snapshot本文にtriple backtickが含まれる場合、固定3文字fenceではpreview reportのdiff blockを途中で閉じられた。Diff内の最長backtick runより1文字長いfenceを生成するよう修正し、回帰testを追加した。

### Important — command contract test matched confirmation text in the wrong order

Production codeはconfirmation labelを変数へ定義してから`showWarningMessage`へ渡していたが、source contract testがlabelをcall後に要求していた。実装のmodal confirmation契約を分離assertionで固定した。Production behaviorの変更はない。

### Important — task snapshot import provenance was not visible in primary run projections

Import recordはrun stateに存在したが、Operation HubとRuns Viewでは通常artifact manifestと区別できなかった。本文を表示せず、件数とimport日時だけをbadge、description、tooltipへ投影した。

### Important — omitted selection could import unsafe snapshots implicitly

Core APIで`selectedArtifactIds`を省略すると、previewで初期選択されないtruncated/redacted candidateまで自動importできる経路があった。Selection省略時は`defaultSelected === true`だけを対象にし、安全candidateが0件ならno-opに変更した。明示選択ではreview済みtruncated candidateを救済できる回帰testを追加した。

## Non-destructive invariants

- Previewはartifact file、manifest、run stateを変更しない。
- Explicit empty selectionはno-opである。
- Implicit selectionはdefault-safe candidateだけを対象にする。
- Existing changed fileは確認なしで上書きしない。
- Unselected candidateはfile、manifest、stateへ入らない。
- Preview digest mismatchはtransaction開始前に停止する。
- Partial file writeまたはrun-state persistence failureはrollbackする。
- Existing command ID、manifest schema、provenance schemaを変更しない。

## Privacy invariants

- Reportはartifact本文全体を表示せず、既存fileとの差分だけをsize boundして表示する。
- Release evidenceはsnapshot本文、既存file本文、diffを保存しない。
- Run projectionsはimport件数と日時だけを表示する。

## Verification used

- Preview RED: run `29204608010`。
- Preview GREEN: run `29204768009`。
- Selective apply RED: run `29204842338`。
- Selective apply GREEN: run `29204907855`。
- Report RED: run `29204972610`。
- Report GREEN: run `29205015256`。
- Provenance RED: run `29205308654`。
- Focused final diagnostic: run `29206130109`, 7 passed / 0 failed, compile status 0。
- Final code head: `784864813169492709edd2536d9236fbb2f00d17`。
- Final code matrix: `extensions-quality` run `29206419912`, all 7 jobs success。
- Documentation gate head: `c7db2e9d2be63a744cb55397a6e5d452289246a1`。
- Documentation gate matrix: `extensions-quality` run `29206741706`, all 7 jobs success。
- Documentation workflow contracts / review scaffold: `29206741679` / `29206741682`, success。

## Final result

| Severity | Open findings |
| --- | ---: |
| Critical | 0 |
| Important | 0 |

Code, review, cross-platform CI, package, VSIX, Extension Host, workflow-contract, and documentation gates are GO. Product release remains separately gated by real IBM Bob、Bazaar、multi-root、and distribution-signing UAT.
