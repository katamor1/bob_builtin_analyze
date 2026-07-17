param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path,
  [string]$OutputRoot,
  [string]$Scenario = "all",
  [string]$CodeCommand = "code",
  [string]$BzrCommand = "bzr",
  [switch]$Open,
  [string]$OpenScenario,
  [switch]$ValidateOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "lib\ScenarioManifest.ps1")

if ($Open -and $OpenScenario) { throw "-Open and -OpenScenario cannot be used together" }
if ($ValidateOnly -and ($Open -or $OpenScenario)) { throw "-ValidateOnly cannot launch VS Code" }

$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
$manifest = Read-ScenarioManifest -RepoRoot $RepoRoot
Assert-ScenarioManifest -RepoRoot $RepoRoot -Manifest $manifest
$selected = @(Resolve-ScenarioSelection -Manifest $manifest -Scenario $Scenario)

if ($Open -and $selected.Count -ne 1) { throw "-Open requires exactly one selected scenario" }
if ($OpenScenario -and (@($selected.id) -notcontains $OpenScenario)) {
  throw "-OpenScenario must identify a selected scenario: $OpenScenario"
}

if ($ValidateOnly) {
  Write-Host "Manifest validation succeeded: $($manifest.scenarios.Count) scenarios; selected=$($selected.Count)"
  return
}

throw "Generation modules are introduced in Tasks 3 and 4; run -ValidateOnly at this checkpoint"
