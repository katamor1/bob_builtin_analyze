# Human Triage IBM Bob UAT fixtures

このdirectoryは、実IBM Bob / VS Code環境でHuman Triageの競合・migration・projectionを決定論的に再現するための入力を保持する。

## Files

- `bob-output-initial.yaml`
  - 初回生成、保存、再open、two-window revision conflictで使う。
- `bob-output-regenerated.yaml`
  - `review_id`を維持しつつpackage、summary、severity、evidenceを変更している。
  - stale画面からの保存が`TRIAGE_SOURCE_CHANGED`になることを確認する。
- `legacy-triage-result.yaml`
  - current sourceに存在する`PRE-001`と、存在しない`OLD-999`を含む。
  - matching decisionだけが移行され、unmatched IDがmigration reportへ出ることを確認する。

## Usage

PowerShell例:

```powershell
$fixture = "extensions\bob-code-consistency-review\test\fixtures\triage-operator-uat"
$workspace = "<sandbox-root>"

New-Item -ItemType Directory -Force "$workspace\.bob-review\bob-output" | Out-Null
Copy-Item "$fixture\bob-output-initial.yaml" "$workspace\.bob-review\bob-output\bob-output.yaml" -Force
```

source conflict:

```powershell
Copy-Item "$fixture\bob-output-regenerated.yaml" "$workspace\.bob-review\bob-output\bob-output.yaml" -Force
```

legacy migration:

```powershell
Remove-Item "$workspace\.bob-review\human-triage" -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force "$workspace\.bob-review\human-triage" | Out-Null
Copy-Item "$fixture\legacy-triage-result.yaml" "$workspace\.bob-review\human-triage\triage-result.yaml" -Force
```

## Constraints

- fixture evidence IDは任意のreview-packageの`evidence-index.json`とは対応しない。
- Bob output validationを含むE2Eには使わない。
- triage生成、保存、競合、migration、projectionのoperator UAT専用とする。
- generated `.bob-review` dataはこのdirectoryへcommitしない。
- 実施手順と証跡形式は`docs/triage-integrity-ibm-bob-uat-runbook-ja.md`に従う。
