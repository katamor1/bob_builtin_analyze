# Task Snapshot Import Preview / Selective Apply

## 目的

`Bob Workflow: Task Snapshotから成果物をImport` は、古いrunやartifact未生成runのtask snapshotを、再開可能なartifactへ変換する救済導線です。

この導線は、artifact fileを書き込む前に必ずpreviewを表示します。preview中はrun、manifest、artifact fileを変更しません。

## 操作手順

1. Command Paletteまたはrun操作から`Task Snapshotから成果物をImport`を実行します。
2. 対象runを選びます。
3. Markdown previewで次を確認します。
   - producing stepとartifact ID
   - snapshot作成日時とreason
   - 抽出元が`lastAssistantText`か`taskExport`か
   - target pathとschema
   - UTF-8 byte数とSHA-256
   - snapshotがtruncatedか
   - redaction markerの可能性
   - 既存fileのSHA-256と差分
4. QuickPickでimportするartifactを選択します。
5. 既存fileと内容が異なるartifactを選んだ場合、diffを確認したことをmodal confirmationで承認します。
6. Apply後のreportでimport件数、manifest更新、preview digest、warningを確認します。
7. 生成されたmanifestを使い、通常の`成果物から開始`へ進みます。

## 初期選択

次のcandidateは安全側に倒し、初期選択しません。

- snapshotに`truncated: true`がある
- textに`[REDACTED]`が含まれる
- target fileが存在し内容が異なる
- target state keyにすでに値がある

利用者が内容を確認した場合だけ明示選択できます。

## Preview digest

Previewはrun identity、workflow definition hash、snapshot identity、target content hash、既存file hashからdigestを作ります。

Applyは同じplannerを再実行し、digestが一致しない場合は書き込み前に停止します。Preview後にsnapshot、workflow、run state、既存fileが変化した場合は、新しいpreviewを取得してください。

## Transaction

選択したartifactだけが次のtransactionへ入ります。

```text
artifact files
+ artifacts/manifest.json
+ run.state result keys
+ workflow.artifactManifest
+ workflow.taskSnapshotImport provenance
```

既存のworkspace file transactionとrun-state rollbackを使用します。途中で失敗した場合、不完全なmanifestや一部だけ更新されたrun stateを残しません。

## Provenance表示

Import後は次で確認できます。

- Operation Hub: `Imported from task snapshot: N artifact(s)` badge
- Bob Workflow Runs: `snapshot N` description、import日時を含むtooltip、download icon
- Run Diagnostics / run.json: `workflow.taskSnapshotImport`

表示にはsnapshot本文を含めません。

## 互換性

- command IDは`workflowRegister.importArtifactsFromTaskSnapshots`のままです。
- artifact manifestは`workflow-register/artifact-manifest/v1`を維持します。
- core APIでselectionを省略した既存callerは、従来どおりimport可能candidateを対象にします。
- task snapshot自体は再開の正本ではありません。Import後のartifact fileとmanifestが正本です。

## 対象外

- snapshot本文の意味的な正しさの自動判定
- redacted値の復元
- truncated textの自動補完
- artifact schemaの自動推論
- IBM Bob実機でのUI互換性確認（製品配布UATで実施）
