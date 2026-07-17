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
. (Join-Path $PSScriptRoot "lib\ScenarioFixtureValidation.ps1")
. (Join-Path $PSScriptRoot "lib\ScenarioExecution.ps1")
. (Join-Path $PSScriptRoot "lib\RunEvidence.ps1")

if ($Open -and $OpenScenario) { throw "-Open and -OpenScenario cannot be used together" }
if ($ValidateOnly -and ($Open -or $OpenScenario)) { throw "-ValidateOnly cannot launch VS Code" }

$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
$manifest = Read-ScenarioManifest -RepoRoot $RepoRoot
Assert-ScenarioManifest -RepoRoot $RepoRoot -Manifest $manifest
Assert-ScenarioFixtureCopies -RepoRoot $RepoRoot -Manifest $manifest
$selected = @(Resolve-ScenarioSelection -Manifest $manifest -Scenario $Scenario)

if ($Open -and $selected.Count -ne 1) { throw "-Open requires exactly one selected scenario" }
if ($OpenScenario -and (@($selected.id) -notcontains $OpenScenario)) {
  throw "-OpenScenario must identify a selected scenario: $OpenScenario"
}

if ($ValidateOnly) {
  foreach ($validationScenario in $selected) {
    if ($validationScenario.psobject.Properties.Name -contains "postSeed") {
      $seedPath = Assert-RepositoryRelativePath $RepoRoot ([string]$validationScenario.postSeed) "$($validationScenario.id).postSeed" -MustExist
      & $seedPath -ValidateOnly
    }
  }
  Write-Host "Manifest validation succeeded: $($manifest.scenarios.Count) scenarios; selected=$($selected.Count)"
  return
}

if (-not $OutputRoot) {
  $OutputRoot = Join-Path $env:TEMP ("bob-review-real-machine-{0}" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
}
$outputFull = Assert-SafeOutputRoot -RepoRoot $RepoRoot -OutputRoot $OutputRoot
New-Item -ItemType Directory -Path $outputFull | Out-Null
Assert-NoReparsePointTraversal -Root $outputFull -Target $outputFull
New-Item -ItemType Directory -Path (Join-Path $outputFull "_logs") | Out-Null

Write-Host "Output root: $outputFull"
Write-Host "Selected scenarios: $(@($selected.id) -join ', ')"

$repositorySnapshot = Get-RepositorySnapshot $RepoRoot
$versions = Get-ToolVersionSnapshot -CodeCommand $CodeCommand -BzrCommand $BzrCommand
$scenarioRecords = [System.Collections.Generic.List[object]]::new()

foreach ($selectedScenario in $selected) {
  $scenarioRoot = Join-Path $outputFull ([string]$selectedScenario.id)
  $logPath = Join-Path $outputFull ("_logs\{0}.log" -f $selectedScenario.id)
  $prerequisites = [pscustomobject]@{ ready = $false; missingCommands = @(); missingPaths = @(); packageHints = @() }
  $launch = $null
  $errorMessage = $null
  $postSeedResult = $null
  $artifactResult = [pscustomobject]@{ valid = $false; checks = @() }
  $status = "not_started"

  try {
    $prerequisites = Get-ScenarioPrerequisiteReport -RepoRoot $RepoRoot -Scenario $selectedScenario -CodeCommand $CodeCommand -BzrCommand $BzrCommand
    if (-not $prerequisites.ready) {
      $status = "blocked"
      New-Item -ItemType Directory -Force -Path $scenarioRoot | Out-Null
      $blockedLines = @(
        "BLOCKED: prerequisites are missing",
        "Missing commands: $([string]::Join(', ', @($prerequisites.missingCommands)))",
        "Missing paths: $([string]::Join(', ', @($prerequisites.missingPaths)))"
      )
      [System.IO.File]::WriteAllLines($logPath, $blockedLines, [System.Text.UTF8Encoding]::new($false))
    } else {
      $invocation = New-LauncherInvocation -RepoRoot $RepoRoot -ScenarioRoot $scenarioRoot -Scenario $selectedScenario -CodeCommand $CodeCommand -BzrCommand $BzrCommand
      $execution = Invoke-ScenarioLauncher -Invocation $invocation -LogPath $logPath
      if (-not $execution.succeeded) {
        $status = "failed"
        $errorMessage = $execution.error
        New-Item -ItemType Directory -Force -Path $scenarioRoot | Out-Null
      } else {
        Assert-NoReparsePointTraversal -Root $outputFull -Target $scenarioRoot
        if ($selectedScenario.psobject.Properties.Name -contains "fixtureCopies") {
          Copy-ScenarioFixtureFiles -RepoRoot $RepoRoot -ScenarioRoot $scenarioRoot -FixtureCopies @($selectedScenario.fixtureCopies)
        }
        if ($selectedScenario.psobject.Properties.Name -contains "postSeed") {
          $seedPath = Assert-RepositoryRelativePath $RepoRoot ([string]$selectedScenario.postSeed) "$($selectedScenario.id).postSeed" -MustExist
          Assert-NoReparsePointTraversal -Root $RepoRoot -Target $seedPath
          & $seedPath -ScenarioRoot $scenarioRoot
          $postSeedResult = [ordered]@{ path = $seedPath; status = "completed" }
        }
        $artifactResult = Test-ExpectedScenarioArtifacts -ScenarioRoot $scenarioRoot -ExpectedArtifacts @($selectedScenario.expectedArtifacts)
        if (-not $artifactResult.valid) { throw "Expected artifact validation failed" }
        $launch = Get-ScenarioLaunchDescriptor -RepoRoot $RepoRoot -ScenarioRoot $scenarioRoot -Scenario $selectedScenario -CodeCommand $CodeCommand
        $status = "ready"
      }
    }
  } catch {
    $status = "failed"
    $errorMessage = $_.Exception.Message
    New-Item -ItemType Directory -Force -Path $scenarioRoot | Out-Null
    [System.IO.File]::AppendAllText(
      $logPath,
      "ERROR: $errorMessage`n",
      [System.Text.UTF8Encoding]::new($false)
    )
  }

  $record = [ordered]@{
    id = [string]$selectedScenario.id
    extension = [string]$selectedScenario.extension
    status = $status
    root = $scenarioRoot
    launchTarget = if ($launch) { $launch.target } else { $null }
    launchCommand = if ($launch) { $launch.commandLine } else { $null }
    logPath = $logPath
    missingCommands = @($prerequisites.missingCommands)
    missingPaths = @($prerequisites.missingPaths)
    packageHints = @($prerequisites.packageHints)
    error = $errorMessage
    postSeed = $postSeedResult
    artifactChecks = @($artifactResult.checks)
    testCases = @($selectedScenario.testCases)
  }
  $tokens = [ordered]@{
    SCENARIO_ID = $selectedScenario.id
    SCENARIO_ROOT = $scenarioRoot
    WORKSPACE_PATH = if ($selectedScenario.extension -eq "bob-bazaar-review") { Join-Path $scenarioRoot "bob-bazaar-review.code-workspace" } else { Join-Path $scenarioRoot "workspace" }
    BOB_ROOT = if ($selectedScenario.extension -eq "bob-bazaar-review") { Join-Path $scenarioRoot "bob-managed" } else { Join-Path $scenarioRoot "workspace" }
    VCS_ROOT = if ($selectedScenario.extension -eq "bob-bazaar-review") { Join-Path $scenarioRoot "bazaar-source" } else { Join-Path $scenarioRoot "workspace" }
    REVIEW_TARGET = if ($selectedScenario.extension -eq "bob-bazaar-review") { "revision range 1..2" } else { [string]$selectedScenario.generator.arguments.Sample }
    LAUNCH_COMMAND = if ($launch) { $launch.commandLine } elseif ($status -eq "blocked") { "blocked: prerequisites are missing" } else { "unavailable: generation failed" }
    TEST_CASES = @($selectedScenario.testCases | ForEach-Object { "- ``$_``" }) -join "`n"
    EXPECTED_ARTIFACTS = @($selectedScenario.expectedArtifacts | ForEach-Object { "- ``$_``" }) -join "`n"
  }

  try {
    Write-ScenarioEvidence -RepoRoot $RepoRoot -ScenarioRoot $scenarioRoot -Scenario $selectedScenario -ScenarioRecord $record -ChecklistTokens $tokens
  } catch {
    $status = "failed"
    $evidenceError = "Unable to write scenario evidence: $($_.Exception.Message)"
    $errorMessage = if ($errorMessage) { "$errorMessage; $evidenceError" } else { $evidenceError }
    $record.status = $status
    $record.error = $errorMessage
    [System.IO.File]::AppendAllText($logPath, "ERROR: $evidenceError`n", [System.Text.UTF8Encoding]::new($false))
  }

  if ($status -eq "failed") {
    try {
      Write-JsonUtf8 (Join-Path $scenarioRoot "generation-failure.json") ([ordered]@{
        scenarioId = $selectedScenario.id
        error = $errorMessage
        logPath = $logPath
      })
    } catch {
      [System.IO.File]::AppendAllText($logPath, "ERROR: Unable to write generation-failure.json: $($_.Exception.Message)`n", [System.Text.UTF8Encoding]::new($false))
    }
  }
  $scenarioRecords.Add([pscustomobject]$record)
}

Write-RunEvidence -OutputRoot $outputFull -Repository $repositorySnapshot -Versions $versions -ScenarioRecords @($scenarioRecords)

$requestedOpenId = if ($Open) { [string]$selected[0].id } else { $OpenScenario }
if ($requestedOpenId) {
  $record = @($scenarioRecords | Where-Object id -eq $requestedOpenId)[0]
  if ($record.status -ne "ready") { throw "Cannot open non-ready scenario: $requestedOpenId ($($record.status))" }
  $scenarioRecord = @($selected | Where-Object id -eq $requestedOpenId)[0]
  $descriptor = Get-ScenarioLaunchDescriptor -RepoRoot $RepoRoot -ScenarioRoot $record.root -Scenario $scenarioRecord -CodeCommand $CodeCommand
  Start-Process -FilePath $descriptor.command -ArgumentList $descriptor.arguments
}

$readyCount = @($scenarioRecords | Where-Object status -eq "ready").Count
$blockedCount = @($scenarioRecords | Where-Object status -eq "blocked").Count
$failedCount = @($scenarioRecords | Where-Object status -eq "failed").Count
Write-Host "Ready: $readyCount; Blocked: $blockedCount; Failed: $failedCount"
Write-Host "Summary: $(Join-Path $outputFull 'run-summary.md')"
if ($blockedCount -gt 0 -or $failedCount -gt 0) { exit 1 }
