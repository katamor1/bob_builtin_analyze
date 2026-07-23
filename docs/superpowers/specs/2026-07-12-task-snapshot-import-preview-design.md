Replaced: `workflowRegister.openOperationHub` and `workflowRegister.openWorkflowBuilder` are the current workflow operator routes; the legacy snapshot-import command and run-view references below are retained only as historical P1-2 design evidence.

# Task Snapshot Import Preview / Selective Apply Design

## Goal

Task snapshot から artifact を生成する前に、抽出元、生成先、既存ファイルとの差分、checksum、truncation/redaction の可能性を確認し、artifact ごとに選択して transaction 単位で適用できるようにする。

## User flow

1. 利用者が `Bob Workflow: Task Snapshotから成果物をImport` を実行する。
2. run を選択する。
3. extension host が副作用なしの preview を構築する。
4. Markdown preview に run / workflow / step / snapshot / source / path / schema / bytes / checksum / existing-file diff を表示する。
5. QuickPick で artifact を複数選択する。
6. truncated、redacted、既存file変更、既存state keyのcandidateは初期選択しない。
7. 既存ファイルを書き換える選択がある場合、diff を確認したことを明示する modal confirmation を必須にする。
8. apply は preview と同じ planner を再実行し、preview digest と現在の既存ファイル hash が一致した場合だけ transaction を開始する。
9. artifact files、manifest、run state、import provenance を同じ transaction 境界でcommitする。

## Architecture

### Pure preview planner

`src/core/artifacts/taskSnapshotImportPreview.ts` に、I/O を注入する副作用のない境界を追加する。

```ts
previewArtifactsFromTaskSnapshots(input): Promise<TaskSnapshotArtifactImportPreview>
```

Candidate は次を保持する。

- artifact ID / state key / producing step
- snapshot createdAt / reason
- extraction source: `lastAssistantText` または `taskExport`
- target path / schema / UTF-8 byte length / SHA-256
- snapshot truncated flag / omitted message count
- text に `[REDACTED]` が含まれる可能性
- existing file existence / byte length / SHA-256 / changed flag
- size-bound unified-style diff text
- defaultSelected
- blocker / warning

Preview digest は、run identity、workflow definition hash、candidate target content hash、existing file hash、snapshot identityをcanonical JSONにしてSHA-256化する。

### Apply boundary

既存 `importArtifactsFromTaskSnapshots()` は preview planner を再利用する。

追加入力:

```ts
selectedArtifactIds?: readonly string[]
expectedPreviewDigest?: string
overwriteExisting?: boolean
readFile?: (relativePath: string) => Promise<string | undefined>
```

Apply は次を拒否する。

- preview digest mismatch
- preview 後に既存ファイルが変化した場合
- selected candidate がblockerを持つ場合
- existing changed file を `overwriteExisting` なしで選択した場合
- explicit empty selection

Selection未指定のcore callerは`defaultSelected === true`のcandidateだけを自動対象にする。Truncated、redacted、既存file変更、既存state keyは自動importしない。利用者がpreviewを確認して`selectedArtifactIds`を明示した場合は、truncated/redacted candidateも救済できる。

選択なしの場合はファイル、manifest、run stateを一切変更しない。

### Command UX

`WorkflowRunCommandService.importArtifactsFromTaskSnapshots()` は、最初にpreview reportを表示し、その後QuickPickを表示する。Apply時にpreview digestとselected IDsを渡す。

Reportはartifact本文全体を無制限に埋め込まず、diff previewをサイズ上限付きで表示する。checksumとbyte数は常に表示する。Diff fenceは本文中の最長backtick runより長くしてMarkdown境界を維持する。

利用者のpreview確認中はexecution leaseを保持しない。Selection後にrunを再loadし、review gate / execution lease内でplannerを再実行してdigestを検証する。

## Safety and compatibility

- 既存command IDは維持する。
- 引数なしの既存呼び出しはpreview-first UXへ移行する。
- core APIを直接使いselectionを省略するcallerは、default-safe candidateだけを自動importする。
- unsafe candidateを救済するcallerは`selectedArtifactIds`を明示する。
- `writeWorkspaceFilesAtomically()` によるtransactionとrun-state rollbackを維持する。
- workspace-relative containmentは既存runtime boundaryを利用する。
- snapshot本文、既存ファイル本文、diffをrelease evidenceへ保存しない。

## Acceptance tests

- previewは副作用を起こさない。
- `lastAssistantText`と`taskExport`のsourceを区別する。
- truncated / redacted / existing-changed / existing-state candidateはdefault unselected。
- selection省略時はdefault-safe candidateだけをimportする。
- explicit selectionならreview済みtruncated candidateをimportできる。
- existing changed fileはdiffと明示confirmationを必要とする。
- selective applyは選択したartifactだけを書き込む。
- preview/apply digest mismatchを拒否する。
- batch中の失敗はartifact、manifest、run stateをrollbackする。
- commandはpreview → selection → overwrite confirmation → gate / lease → applyの順序を守る。
- Operation Hub / Runs Viewはsnapshot本文なしでimport件数と日時を表示する。
