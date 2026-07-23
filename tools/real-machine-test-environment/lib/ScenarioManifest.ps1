Set-StrictMode -Version Latest

$script:AllowedLauncherPaths = @(
  "docs/workflows/bazaar-project-rule-review/integration/launch-bob-bazaar-review-sandbox.ps1",
  "docs/workflows/code-consistency-review/integration/launch-bob-code-consistency-sandbox.ps1"
)
$script:AllowedSamples = @(
  "simple-timeout-bugfix",
  "ai-verification-matrix",
  "live-traceability-sidecar",
  "multi-language-git-review"
)
$script:AllowedDocumentFixtureProfiles = [ordered]@{
  "bazaar-core" = "bazaar-core"
  "consistency-ai-matrix" = "consistency-ai-matrix"
}

function Get-NormalizedFullPath {
  param([Parameter(Mandatory)][string]$Path)

  $fullPath = [System.IO.Path]::GetFullPath($Path)
  $pathRoot = [System.IO.Path]::GetPathRoot($fullPath)
  if ($fullPath -eq $pathRoot) { return $fullPath }
  return $fullPath.TrimEnd(
    [System.IO.Path]::DirectorySeparatorChar,
    [System.IO.Path]::AltDirectorySeparatorChar
  )
}

function Test-PathInsideRoot {
  param(
    [Parameter(Mandatory)][string]$Root,
    [Parameter(Mandatory)][string]$Candidate
  )

  $rootFull = Get-NormalizedFullPath $Root
  $candidateFull = Get-NormalizedFullPath $Candidate
  $relative = [System.IO.Path]::GetRelativePath($rootFull, $candidateFull)
  return $relative -eq "." -or (
    -not [System.IO.Path]::IsPathRooted($relative) -and
    $relative -ne ".." -and
    -not $relative.StartsWith("..$([System.IO.Path]::DirectorySeparatorChar)") -and
    -not $relative.StartsWith("..$([System.IO.Path]::AltDirectorySeparatorChar)")
  )
}

function Assert-RepositoryRelativePath {
  param(
    [Parameter(Mandatory)][string]$RepoRoot,
    [Parameter(Mandatory)][string]$RelativePath,
    [Parameter(Mandatory)][string]$FieldName,
    [switch]$MustExist
  )

  if (-not $RelativePath.Trim()) { throw "$FieldName must not be empty" }
  if ([System.IO.Path]::IsPathRooted($RelativePath)) { throw "$FieldName must be repository-relative: $RelativePath" }
  if (($RelativePath -split "[\\/]+") -contains "..") { throw "$FieldName must not contain ..: $RelativePath" }
  $repoFull = Get-NormalizedFullPath $RepoRoot
  $resolved = Get-NormalizedFullPath (Join-Path $repoFull $RelativePath)
  if (-not (Test-PathInsideRoot $repoFull $resolved)) { throw "$FieldName resolves outside RepoRoot: $RelativePath" }

  if ($MustExist) {
    if (-not (Test-Path -LiteralPath $resolved)) { throw "$FieldName not found: $RelativePath" }
    $repoRealPath = (Resolve-Path -LiteralPath $repoFull).Path
    $realPath = (Resolve-Path -LiteralPath $resolved).Path
    if (-not (Test-PathInsideRoot $repoRealPath $realPath)) { throw "$FieldName escapes RepoRoot after resolution: $RelativePath" }
  }
  return $resolved
}

function Assert-ScenarioRelativePath {
  param(
    [Parameter(Mandatory)][string]$RelativePath,
    [Parameter(Mandatory)][string]$FieldName
  )

  if (-not $RelativePath.Trim()) { throw "$FieldName must not be empty" }
  if ([System.IO.Path]::IsPathRooted($RelativePath)) { throw "$FieldName must be scenario-relative: $RelativePath" }
  if (($RelativePath -split "[\\/]+") -contains "..") { throw "$FieldName must not contain ..: $RelativePath" }
  return $RelativePath
}

function Assert-TestCaseExists {
  param(
    [Parameter(Mandatory)][string]$RepoRoot,
    [Parameter(Mandatory)][string]$TestCaseId
  )

  $specPath = if ($TestCaseId.StartsWith("BZR-")) {
    Join-Path $RepoRoot "extensions/bob-bazaar-review/docs/real-machine-test-spec-ja.md"
  } elseif ($TestCaseId.StartsWith("CCR-")) {
    Join-Path $RepoRoot "extensions/bob-code-consistency-review/docs/real-machine-test-spec-ja.md"
  } elseif ($TestCaseId.StartsWith("PRA-WIN-")) {
    Join-Path $RepoRoot "extensions/bob-bazaar-review/docs/project-rule-authoring-windows-uat.md"
  } else {
    throw "Unsupported testcase prefix: $TestCaseId"
  }
  if (-not (Test-Path -LiteralPath $specPath)) { throw "Real-machine specification not found: $specPath" }
  $content = [System.IO.File]::ReadAllText($specPath)
  if ($content -notmatch "(?m)^#{3,4}\s+$([regex]::Escape($TestCaseId))(?:\s|$)") {
    throw "Testcase not found in real-machine specification: $TestCaseId"
  }
}

function Read-ScenarioManifest {
  param(
    [Parameter(Mandatory)][string]$RepoRoot,
    [string]$ManifestPath = "tools/real-machine-test-environment/scenarios.json"
  )

  $resolved = Assert-RepositoryRelativePath $RepoRoot $ManifestPath "ManifestPath" -MustExist
  try {
    return [System.IO.File]::ReadAllText($resolved) | ConvertFrom-Json -Depth 50
  } catch {
    throw "Unable to parse scenario manifest ${ManifestPath}: $($_.Exception.Message)"
  }
}

function Assert-ScenarioManifest {
  param(
    [Parameter(Mandatory)][string]$RepoRoot,
    [Parameter(Mandatory)][pscustomobject]$Manifest
  )

  $errors = [System.Collections.Generic.List[string]]::new()
  if ($Manifest.schemaVersion -ne 1) { $errors.Add("Unsupported schemaVersion: $($Manifest.schemaVersion)") }
  $scenarios = @($Manifest.scenarios)
  if ($scenarios.Count -eq 0) { $errors.Add("At least one scenario is required") }
  $ids = @($scenarios | ForEach-Object { [string]$_.id })
  if ($ids.Count -ne @($ids | Select-Object -Unique).Count) { $errors.Add("Scenario IDs must be unique") }

  foreach ($scenario in $scenarios) {
    try {
      $scenarioId = [string]$scenario.id
      if ($scenarioId -notmatch "^[a-z0-9][a-z0-9-]*$") { throw "Unsafe scenario ID: $scenarioId" }
      if ([string]$scenario.extension -notin @("bob-bazaar-review", "bob-code-consistency-review")) {
        throw "Unsupported extension: $($scenario.extension)"
      }
      if ($scenario.generator.kind -ne "existing-launcher") { throw "Unsupported generator kind: $($scenario.generator.kind)" }
      $launcher = [string]$scenario.generator.path
      if ($script:AllowedLauncherPaths -notcontains $launcher) { throw "Launcher is not allowlisted: $launcher" }
      Assert-RepositoryRelativePath $RepoRoot $launcher "$scenarioId.generator.path" -MustExist | Out-Null
      Assert-RepositoryRelativePath $RepoRoot ([string]$scenario.checklistTemplate) "$scenarioId.checklistTemplate" -MustExist | Out-Null

      if (@($scenario.requiredCommands).Count -eq 0) { throw "requiredCommands must not be empty" }
      foreach ($requiredPath in @($scenario.requiredRepositoryPaths)) {
        Assert-RepositoryRelativePath $RepoRoot ([string]$requiredPath) "$scenarioId.requiredRepositoryPaths" | Out-Null
      }
      if (@($scenario.expectedArtifacts).Count -eq 0) { throw "expectedArtifacts must not be empty" }
      foreach ($artifactPath in @($scenario.expectedArtifacts)) {
        Assert-ScenarioRelativePath ([string]$artifactPath) "$scenarioId.expectedArtifacts" | Out-Null
      }
      if ($scenario.psobject.Properties.Name -contains "postSeed") {
        Assert-RepositoryRelativePath $RepoRoot ([string]$scenario.postSeed) "$scenarioId.postSeed" -MustExist | Out-Null
      }
      if ($scenario.psobject.Properties.Name -contains "documentFixtureProfile") {
        $profile = [string]$scenario.documentFixtureProfile
        if (-not $script:AllowedDocumentFixtureProfiles.Contains([string]$scenarioId)) {
          throw "Scenario is not allowed to declare documentFixtureProfile: $scenarioId"
        }
        $expectedProfile = [string]$script:AllowedDocumentFixtureProfiles[[string]$scenarioId]
        if ($profile -ne $expectedProfile) {
          throw "documentFixtureProfile must be ${expectedProfile} for ${scenarioId}: $profile"
        }
      }

      $argumentNames = @($scenario.generator.arguments.psobject.Properties | ForEach-Object { [string]$_.Name })
      if ($launcher -like "*bazaar-project-rule-review*") {
        if ($argumentNames.Count -ne 0) { throw "Bazaar manifest arguments are not allowed" }
      } else {
        foreach ($name in $argumentNames) {
          if ($name -ne "Sample") { throw "Unsupported manifest argument: $name" }
        }
        if ($argumentNames -notcontains "Sample") { throw "Code consistency scenario requires Sample" }
        if ($script:AllowedSamples -notcontains [string]$scenario.generator.arguments.Sample) {
          throw "Unsupported Sample: $($scenario.generator.arguments.Sample)"
        }
      }
      foreach ($testCaseId in @($scenario.testCases)) { Assert-TestCaseExists $RepoRoot ([string]$testCaseId) }
    } catch {
      $errors.Add("$($scenario.id): $($_.Exception.Message)")
    }
  }

  $documentProfileScenarios = @(
    $scenarios | Where-Object { $_.psobject.Properties.Name -contains "documentFixtureProfile" }
  )
  if ($documentProfileScenarios.Count -ne $script:AllowedDocumentFixtureProfiles.Count) {
    $errors.Add("Exactly two approved documentFixtureProfile mappings are required")
  }

  $groupIds = @($Manifest.groups."p0-p1" | ForEach-Object { [string]$_ })
  if ($groupIds.Count -eq 0) { $errors.Add("p0-p1 group is required") }
  if ($groupIds.Count -ne @($groupIds | Select-Object -Unique).Count) { $errors.Add("p0-p1 contains duplicate IDs") }
  foreach ($groupId in $groupIds) {
    if ($ids -notcontains $groupId) { $errors.Add("p0-p1 references unknown scenario: $groupId") }
  }
  if ($groupIds.Count -ne $ids.Count -or [string]::Join("`n", $groupIds) -ne [string]::Join("`n", $ids)) {
    $errors.Add("p0-p1 must list every scenario exactly once in manifest order")
  }
  if ($errors.Count -gt 0) { throw "Scenario manifest is invalid:`n- $($errors -join "`n- ")" }
}

function Resolve-ScenarioSelection {
  param(
    [Parameter(Mandatory)][pscustomobject]$Manifest,
    [Parameter(Mandatory)][string]$Scenario
  )

  $requestedIds = if ($Scenario -eq "all") { @($Manifest.groups."p0-p1") } else { @($Scenario) }
  return @($requestedIds | ForEach-Object {
    $id = [string]$_
    $matches = @($Manifest.scenarios | Where-Object { $_.id -eq $id })
    if ($matches.Count -ne 1) { throw "Unknown scenario: $id" }
    $matches[0]
  })
}
