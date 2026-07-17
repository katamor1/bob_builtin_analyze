# Bob Review 実機テスト用データ環境

`bob-bazaar-review` と `bob-code-consistency-review` の P0 + P1 sandbox を repository 外に生成します。実機操作の合否は自動判定せず、各 scenario の `operator-result.json` に記録します。

## VSIX を package

```powershell
Push-Location extensions\workflow-register
npm.cmd run package
Pop-Location
Push-Location extensions\bob-bazaar-review
npm.cmd run package
Pop-Location
Push-Location extensions\bob-code-consistency-review
npm.cmd run package
Pop-Location
```

## 書き込みなしの contract 検証

```powershell
pwsh -NoProfile -File tools\real-machine-test-environment\Invoke-BobReviewTestEnvironment.ps1 -ValidateOnly
```

## P0 + P1 の全環境を生成

```powershell
pwsh -NoProfile -File tools\real-machine-test-environment\Invoke-BobReviewTestEnvironment.ps1 -Scenario all
```

全生成では VS Code を自動起動しません。

## 1 scenario を生成して開く

```powershell
pwsh -NoProfile -File tools\real-machine-test-environment\Invoke-BobReviewTestEnvironment.ps1 `
  -Scenario consistency-ai-matrix `
  -Open
```

## 全生成後に 1 scenario だけ開く

```powershell
pwsh -NoProfile -File tools\real-machine-test-environment\Invoke-BobReviewTestEnvironment.ps1 `
  -Scenario all `
  -OpenScenario bazaar-run-recovery
```

## 出力先を固定

```powershell
pwsh -NoProfile -File tools\real-machine-test-environment\Invoke-BobReviewTestEnvironment.ps1 `
  -Scenario bazaar-core `
  -OutputRoot C:\bob-uat\run-001
```

既存 path と repository 配下は拒否します。

## 結果記録

- `run-manifest.json`: repository revision、tool version summary、scenario status。
- `run-summary.md`: `ready` / `blocked` / `failed` と package hint。
- `<scenario>/scenario-manifest.json`: launcher、artifact、post-seed、log の結果。
- `<scenario>/operator-checklist.md`: 実機操作手順。
- `<scenario>/operator-result.json`: testcase ごとの `not_run` / `pass` / `fail` / `blocked`。

Generator は `pass` を自動設定しません。Invalid fixture は `test-data/invalid` に隔離されます。

## Cleanup

結果と再現用 evidence が不要になった場合だけ、生成時に表示された output root を削除します。

```powershell
Remove-Item C:\bob-uat\run-001 -Recurse -Force
```
