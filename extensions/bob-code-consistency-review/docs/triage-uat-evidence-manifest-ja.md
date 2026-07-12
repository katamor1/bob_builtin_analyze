# Human Triage UAT Evidence Manifest

## 1. 目的

`triage-uat-evidence.js`は、実IBM Bob UAT後のHuman Triage成果物をmachine-readableなJSON manifestへ記録する。

記録対象は次の通り。

- tested commit SHA
- VSIX build commit SHA
- commit一致判定
- 必須artifactの存在
- artifactごとのbytes
- artifactごとのSHA-256
- triage directoryに残る`*.bak-*` backup

本manifestは、成果物の完全性とcommit provenanceを記録する補助証跡である。`status: complete`だけでUAT合格とは判定しない。Bob Workflow UI、Bob agent、result handoff、MCP、Webview視覚表示、keyboard操作、Developer Tools Console、sign-offは、日付入りUAT evidence Markdownで別途確認する。

## 2. 実行場所

対象branchから作成したVSIXを導入し、UAT対象sandboxにHuman Triage成果物を生成した後で実行する。

```powershell
cd <repository>\extensions\bob-code-consistency-review
```

manifest自体はsandbox外のevidence directoryへ出力してよい。

## 3. コマンド

```powershell
$TestedCommit = "<40-character-tested-commit-sha>"
$VsixCommit = "<40-character-vsix-build-commit-sha>"
$Workspace = "C:\uat\CCR74-sandbox"
$Output = "C:\uat\CCR74-evidence\triage-uat-artifact-manifest.json"

node scripts\triage-uat-evidence.js `
  --workspace $Workspace `
  --tested-commit $TestedCommit `
  --vsix-commit $VsixCommit `
  --output $Output

if ($LASTEXITCODE -ne 0) {
  throw "Triage UAT evidence manifest is incomplete or invalid. Exit code: $LASTEXITCODE"
}
```

再現試験で時刻を固定する必要がある場合だけ`--generated-at`を指定する。

```powershell
--generated-at "2026-07-12T16:00:00.000Z"
```

help:

```powershell
node scripts\triage-uat-evidence.js --help
```

## 4. Exit code

| Exit code | 意味 |
| ---: | --- |
| `0` | commitが一致し、必須artifactがすべて存在する。 |
| `1` | CLI引数、commit SHA、timestamp、workspace pathなどの入力が不正。 |
| `2` | manifestは生成したが、commit不一致または必須artifact不足。 |

exit code `2`でもmanifestは出力される。`missing_required`と`commit_match`を確認し、VSIXまたはUAT操作を修正して最初から再実施する。

## 5. 必須artifact

```text
.bob-review/bob-output/bob-output.yaml
.bob-review/human-triage/accepted-findings.md
.bob-review/human-triage/follow-up-actions.md
.bob-review/human-triage/investigation-items.md
.bob-review/human-triage/migration-report.md
.bob-review/human-triage/questions-to-author.md
.bob-review/human-triage/rejected-findings.md
.bob-review/human-triage/triage-decisions.yaml
.bob-review/human-triage/triage-result.yaml
.bob-review/human-triage/triage-source.yaml
```

triage directory直下に存在する`*.bak-*`は任意artifactとしてmanifestへ追加される。backupが無いこと自体は`incomplete`の理由にしない。migrationや複数回保存を確認するtestcaseでは、UAT evidence側で必要なbackupが存在するかを別途判定する。

## 6. Manifest schema

```json
{
  "schema_version": "triage-uat-evidence-manifest/v1",
  "generated_at": "2026-07-12T16:00:00.000Z",
  "workspace_name": "CCR74-sandbox",
  "tested_commit_sha": "1111111111111111111111111111111111111111",
  "vsix_build_commit_sha": "1111111111111111111111111111111111111111",
  "commit_match": true,
  "status": "complete",
  "missing_required": [],
  "artifacts": [
    {
      "path": ".bob-review/bob-output/bob-output.yaml",
      "bytes": 2048,
      "sha256": "<64-character-sha256>"
    }
  ]
}
```

artifactはpathのstable orderで並ぶ。manifestにはabsolute workspace pathを保存せず、workspace directoryのbasenameだけを`workspace_name`へ記録する。

## 7. UAT evidenceへの登録

1. manifestをUAT evidence directoryへ保存する。
2. manifest自身のSHA-256を取得する。
3. 日付入りUAT evidenceのartifact inventoryまたは添付証跡欄へ、pathとSHA-256を記録する。
4. manifestの`tested_commit_sha`と`vsix_build_commit_sha`が、evidence Markdownのmetadataと一致することをreviewerが確認する。

PowerShell例:

```powershell
Get-FileHash `
  "C:\uat\CCR74-evidence\triage-uat-artifact-manifest.json" `
  -Algorithm SHA256
```

## 8. 判定規則

次のすべてを満たした場合だけ、artifact manifest項目をpassにする。

- CLI exit codeが`0`
- `status`が`complete`
- `commit_match`が`true`
- `missing_required`が空
- manifestのcommit SHAとUAT metadataが一致
- manifest fileのSHA-256をevidenceへ記録済み

ただし、artifact manifest項目のpassはPhase 1 release判定ではない。UAT runbookの全必須testcase、Console確認、defect disposition、三者sign-offが別途必要である。

## 9. 安全性とprivacy

- 本番workspaceではなく破棄可能なsandboxで実行する。
- 顧客data、秘密情報、access tokenを成果物へ含めない。
- manifestはabsolute workspace pathを保存しない。
- 必須artifactまたはbackupがsymbolic linkの場合は拒否する。
- manifest生成後にartifactを編集した場合は、manifestを再生成する。
- hashだけを根拠に内容の正しさを判定しない。operatorとreviewerが内容も確認する。

## 10. 関連文書

- `triage-integrity-ibm-bob-uat-runbook-ja.md`
- `triage-integrity-ibm-bob-uat-evidence-template.md`
- `triage-integrity-release-evidence-2026-07-12.md`
- `triage-operator-extension-host-test-spec-ja.md`
- `../../../docs/superpowers/plans/2026-07-12-bob-code-consistency-review-triage-uat-evidence-manifest.md`
