Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot "ScenarioManifest.ps1")

$script:PackageHints = @{
  "extensions/workflow-register/workflow-register-0.1.0.vsix" = "cd extensions/workflow-register; npm.cmd run package"
  "extensions/bob-bazaar-review/bob-bazaar-review-0.3.0.vsix" = "cd extensions/bob-bazaar-review; npm.cmd run package"
  "extensions/bob-code-consistency-review/bob-code-consistency-review-0.1.0.vsix" = "cd extensions/bob-code-consistency-review; npm.cmd run package"
  "bob2/bob-code" = "Restore the expanded IBM Bob extension at bob2/bob-code"
}

function Assert-NoReparsePointTraversal {
  param(
    [Parameter(Mandatory)][string]$Root,
    [Parameter(Mandatory)][string]$Target,
    [switch]$AllowMissingLeaf
  )

  $rootFull = Get-NormalizedFullPath $Root
  $targetFull = Get-NormalizedFullPath $Target
  if (-not (Test-Path -LiteralPath $rootFull)) { throw "Root does not exist: $rootFull" }
  if (-not (Test-PathInsideRoot $rootFull $targetFull)) { throw "Path is outside root: $targetFull" }

  $rootItem = Get-Item -LiteralPath $rootFull -Force
  if (($rootItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "Root must not be a symlink or junction: $rootFull"
  }
  $rootReal = (Resolve-Path -LiteralPath $rootFull).Path
  $relative = [System.IO.Path]::GetRelativePath($rootFull, $targetFull)
  $current = $rootFull

  foreach ($segment in @($relative -split "[\\/]+" | Where-Object { $_ -and $_ -ne "." })) {
    $current = Join-Path $current $segment
    if (-not (Test-Path -LiteralPath $current)) {
      if ($AllowMissingLeaf) { return }
      throw "Path does not exist: $current"
    }
    $item = Get-Item -LiteralPath $current -Force
    if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "Path must not traverse a symlink or junction: $current"
    }
    $currentReal = (Resolve-Path -LiteralPath $current).Path
    if (-not (Test-PathInsideRoot $rootReal $currentReal)) {
      throw "Path escapes root after resolution: $current"
    }
  }
}

function Assert-SafeOutputRoot {
  param(
    [Parameter(Mandatory)][string]$RepoRoot,
    [Parameter(Mandatory)][string]$OutputRoot
  )

  $repoFull = Get-NormalizedFullPath $RepoRoot
  $outputFull = Get-NormalizedFullPath $OutputRoot
  if (Test-Path -LiteralPath $outputFull) { throw "OutputRoot already exists: $outputFull" }
  if (Test-PathInsideRoot $repoFull $outputFull) { throw "OutputRoot must be outside RepoRoot: $outputFull" }

  $parent = Split-Path -Parent $outputFull
  if (-not $parent -or -not (Test-Path -LiteralPath $parent)) { throw "OutputRoot parent does not exist: $parent" }
  $volumeRoot = [System.IO.Path]::GetPathRoot((Get-NormalizedFullPath $parent))
  Assert-NoReparsePointTraversal -Root $volumeRoot -Target $parent

  $repoReal = (Resolve-Path -LiteralPath $repoFull).Path
  $parentReal = (Resolve-Path -LiteralPath $parent).Path
  $candidateReal = Join-Path $parentReal (Split-Path -Leaf $outputFull)
  if (Test-PathInsideRoot $repoReal $candidateReal) { throw "OutputRoot resolves inside RepoRoot: $outputFull" }
  return $outputFull
}

function Get-ScenarioPrerequisiteReport {
  param(
    [Parameter(Mandatory)][string]$RepoRoot,
    [Parameter(Mandatory)][pscustomobject]$Scenario,
    [Parameter(Mandatory)][string]$CodeCommand,
    [Parameter(Mandatory)][string]$BzrCommand
  )

  $missingCommands = [System.Collections.Generic.List[string]]::new()
  foreach ($commandName in @($Scenario.requiredCommands)) {
    $probe = if ($commandName -eq "code") {
      $CodeCommand
    } elseif ($commandName -eq "bzr") {
      $BzrCommand
    } else {
      [string]$commandName
    }
    if (-not (Get-Command $probe -ErrorAction SilentlyContinue)) { $missingCommands.Add($probe) }
  }

  $missingPaths = [System.Collections.Generic.List[string]]::new()
  $hints = [System.Collections.Generic.List[string]]::new()
  foreach ($relativePathValue in @($Scenario.requiredRepositoryPaths)) {
    $relativePath = [string]$relativePathValue
    $resolved = Join-Path $RepoRoot $relativePath
    if (-not (Test-Path -LiteralPath $resolved)) {
      $missingPaths.Add($relativePath)
      if ($script:PackageHints.ContainsKey($relativePath)) { $hints.Add($script:PackageHints[$relativePath]) }
    }
  }

  return [pscustomobject]@{
    ready = $missingCommands.Count -eq 0 -and $missingPaths.Count -eq 0
    missingCommands = @($missingCommands)
    missingPaths = @($missingPaths)
    packageHints = @($hints | Select-Object -Unique)
  }
}

function New-LauncherInvocation {
  param(
    [Parameter(Mandatory)][string]$RepoRoot,
    [Parameter(Mandatory)][string]$ScenarioRoot,
    [Parameter(Mandatory)][pscustomobject]$Scenario,
    [Parameter(Mandatory)][string]$CodeCommand,
    [Parameter(Mandatory)][string]$BzrCommand
  )

  $arguments = [ordered]@{
    RepoRoot = $RepoRoot
    SandboxRoot = $ScenarioRoot
    CodeCommand = $CodeCommand
    NoLaunch = $true
  }
  if ([string]$Scenario.generator.path -like "*bazaar-project-rule-review*") {
    $arguments.BzrCommand = $BzrCommand
  } else {
    $arguments.Sample = [string]$Scenario.generator.arguments.Sample
  }
  return [pscustomobject]@{
    launcherPath = Join-Path $RepoRoot ([string]$Scenario.generator.path)
    arguments = $arguments
  }
}

function Invoke-ScenarioLauncher {
  param(
    [Parameter(Mandatory)][pscustomobject]$Invocation,
    [Parameter(Mandatory)][string]$LogPath
  )

  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $LogPath) | Out-Null
  $lines = [System.Collections.Generic.List[string]]::new()
  try {
    $arguments = $Invocation.arguments
    & $Invocation.launcherPath @arguments 2>&1 | ForEach-Object {
      $text = [string]$_
      $lines.Add($text)
      Write-Host $text
    }
    [System.IO.File]::WriteAllLines($LogPath, $lines, [System.Text.UTF8Encoding]::new($false))
    return [pscustomobject]@{ succeeded = $true; error = $null }
  } catch {
    $lines.Add("ERROR: $($_.Exception.Message)")
    [System.IO.File]::WriteAllLines($LogPath, $lines, [System.Text.UTF8Encoding]::new($false))
    return [pscustomobject]@{ succeeded = $false; error = $_.Exception.Message }
  }
}

function Copy-ScenarioFixtureFiles {
  param(
    [Parameter(Mandatory)][string]$RepoRoot,
    [Parameter(Mandatory)][string]$ScenarioRoot,
    [object[]]$FixtureCopies = @()
  )

  Assert-NoReparsePointTraversal -Root $ScenarioRoot -Target $ScenarioRoot
  foreach ($copy in @($FixtureCopies)) {
    $source = Assert-RepositoryRelativePath $RepoRoot ([string]$copy.source) "fixtureCopies.source" -MustExist
    Assert-NoReparsePointTraversal -Root $RepoRoot -Target $source
    Assert-ScenarioRelativePath ([string]$copy.destination) "fixtureCopies.destination" | Out-Null
    $destination = Get-NormalizedFullPath (Join-Path $ScenarioRoot ([string]$copy.destination))
    if (-not (Test-PathInsideRoot $ScenarioRoot $destination)) { throw "Fixture destination escapes scenario root: $destination" }
    $parent = Split-Path -Parent $destination
    Assert-NoReparsePointTraversal -Root $ScenarioRoot -Target $parent -AllowMissingLeaf
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
    Assert-NoReparsePointTraversal -Root $ScenarioRoot -Target $parent
    if (Test-Path -LiteralPath $destination) { Assert-NoReparsePointTraversal -Root $ScenarioRoot -Target $destination }
    Copy-Item -LiteralPath $source -Destination $destination -Force
    Assert-NoReparsePointTraversal -Root $ScenarioRoot -Target $destination
  }
}

function Test-ExpectedScenarioArtifacts {
  param(
    [Parameter(Mandatory)][string]$ScenarioRoot,
    [Parameter(Mandatory)][object[]]$ExpectedArtifacts
  )

  $checks = foreach ($value in @($ExpectedArtifacts)) {
    $relativePath = Assert-ScenarioRelativePath ([string]$value) "expectedArtifacts"
    $candidate = Get-NormalizedFullPath (Join-Path $ScenarioRoot $relativePath)
    $exists = Test-Path -LiteralPath $candidate
    $safe = $false
    $errorMessage = $null
    try {
      if ($exists) {
        Assert-NoReparsePointTraversal -Root $ScenarioRoot -Target $candidate
        $safe = $true
      }
    } catch {
      $errorMessage = $_.Exception.Message
    }
    [pscustomobject]@{
      path = $relativePath
      resolvedPath = $candidate
      exists = $exists
      safe = $safe
      error = $errorMessage
    }
  }
  return [pscustomobject]@{
    valid = @($checks | Where-Object { -not $_.exists -or -not $_.safe }).Count -eq 0
    checks = @($checks)
  }
}

function ConvertTo-DisplayArgument {
  param([Parameter(Mandatory)][string]$Value)
  if ($Value -notmatch '[\s"]') { return $Value }
  return '"{0}"' -f $Value.Replace('"', '\"')
}

function Get-ScenarioLaunchDescriptor {
  param(
    [Parameter(Mandatory)][string]$RepoRoot,
    [Parameter(Mandatory)][string]$ScenarioRoot,
    [Parameter(Mandatory)][pscustomobject]$Scenario,
    [Parameter(Mandatory)][string]$CodeCommand
  )

  $target = if ([string]$Scenario.generator.path -like "*bazaar-project-rule-review*") {
    Join-Path $ScenarioRoot "bob-bazaar-review.code-workspace"
  } else {
    Join-Path $ScenarioRoot "workspace"
  }
  $arguments = @(
    "--user-data-dir", (Join-Path $ScenarioRoot "user-data"),
    "--extensions-dir", (Join-Path $ScenarioRoot "extensions"),
    "--extensionDevelopmentPath", (Join-Path $RepoRoot "bob2/bob-code"),
    $target
  )
  $display = @((ConvertTo-DisplayArgument $CodeCommand)) + @($arguments | ForEach-Object { ConvertTo-DisplayArgument ([string]$_) })
  return [pscustomobject]@{
    command = $CodeCommand
    arguments = $arguments
    target = $target
    commandLine = $display -join " "
  }
}
