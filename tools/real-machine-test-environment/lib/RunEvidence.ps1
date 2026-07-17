Set-StrictMode -Version Latest

function Write-JsonUtf8 {
  param(
    [Parameter(Mandatory)][string]$Path,
    [Parameter(Mandatory)]$Value
  )

  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Path) | Out-Null
  [System.IO.File]::WriteAllText(
    $Path,
    "$(($Value | ConvertTo-Json -Depth 50))`n",
    [System.Text.UTF8Encoding]::new($false)
  )
}

function Invoke-VersionProbe {
  param(
    [Parameter(Mandatory)][string]$Command,
    [string[]]$Arguments = @()
  )

  try {
    $output = @(& $Command @Arguments 2>&1 | ForEach-Object { [string]$_ })
    $exitCode = if ($LASTEXITCODE -is [int]) { $LASTEXITCODE } else { 0 }
    return [ordered]@{
      available = $exitCode -eq 0
      exitCode = $exitCode
      normalized = if ($output.Count -gt 0) { $output[0].Trim() } else { "" }
      rawOutput = $output
    }
  } catch {
    return [ordered]@{
      available = $false
      exitCode = $null
      normalized = "unavailable"
      rawOutput = @($_.Exception.Message)
    }
  }
}

function Get-ToolVersionSnapshot {
  param(
    [Parameter(Mandatory)][string]$CodeCommand,
    [Parameter(Mandatory)][string]$BzrCommand
  )

  return [ordered]@{
    code = Invoke-VersionProbe $CodeCommand @("--version")
    node = Invoke-VersionProbe "node" @("--version")
    git = Invoke-VersionProbe "git" @("--version")
    bzr = Invoke-VersionProbe $BzrCommand @("--version")
  }
}

function Get-RepositorySnapshot {
  param([Parameter(Mandatory)][string]$RepoRoot)

  try {
    $commit = @(& git -C $RepoRoot rev-parse HEAD 2>$null)[0]
    $branch = @(& git -C $RepoRoot branch --show-current 2>$null)[0]
    $dirtyLines = @(& git -C $RepoRoot status --porcelain 2>$null)
    return [ordered]@{
      root = $RepoRoot
      commit = if ($commit) { $commit.Trim() } else { "unavailable" }
      branch = if ($branch) { $branch.Trim() } else { "detached-or-unavailable" }
      dirty = $dirtyLines.Count -gt 0
    }
  } catch {
    return [ordered]@{
      root = $RepoRoot
      commit = "unavailable"
      branch = "detached-or-unavailable"
      dirty = $null
      error = $_.Exception.Message
    }
  }
}

function New-OperatorResult {
  param([Parameter(Mandatory)][pscustomobject]$Scenario)

  return [ordered]@{
    schemaVersion = 1
    scenarioId = [string]$Scenario.id
    operator = ""
    startedAt = $null
    completedAt = $null
    results = @($Scenario.testCases | ForEach-Object {
      [ordered]@{
        testCaseId = [string]$_
        status = "not_run"
        notes = ""
        evidencePaths = @()
      }
    })
  }
}

function Expand-ChecklistTemplate {
  param(
    [Parameter(Mandatory)][string]$Template,
    [Parameter(Mandatory)][System.Collections.IDictionary]$Tokens
  )

  $expanded = $Template
  foreach ($name in $Tokens.Keys) { $expanded = $expanded.Replace("{{$name}}", [string]$Tokens[$name]) }
  if ($expanded -match "\{\{[A-Z0-9_]+\}\}") { throw "Checklist contains unresolved token: $($Matches[0])" }
  return $expanded
}

function Write-ScenarioEvidence {
  param(
    [Parameter(Mandatory)][string]$RepoRoot,
    [Parameter(Mandatory)][string]$ScenarioRoot,
    [Parameter(Mandatory)][pscustomobject]$Scenario,
    [Parameter(Mandatory)][System.Collections.IDictionary]$ScenarioRecord,
    [Parameter(Mandatory)][System.Collections.IDictionary]$ChecklistTokens
  )

  New-Item -ItemType Directory -Force -Path $ScenarioRoot | Out-Null
  $templatePath = Join-Path $RepoRoot ([string]$Scenario.checklistTemplate)
  $template = [System.IO.File]::ReadAllText($templatePath)
  $checklist = Expand-ChecklistTemplate -Template $template -Tokens $ChecklistTokens
  [System.IO.File]::WriteAllText(
    (Join-Path $ScenarioRoot "operator-checklist.md"),
    $checklist,
    [System.Text.UTF8Encoding]::new($false)
  )
  Write-JsonUtf8 (Join-Path $ScenarioRoot "operator-result.json") (New-OperatorResult $Scenario)
  Write-JsonUtf8 (Join-Path $ScenarioRoot "scenario-manifest.json") $ScenarioRecord
}

function Write-RunEvidence {
  param(
    [Parameter(Mandatory)][string]$OutputRoot,
    [Parameter(Mandatory)][System.Collections.IDictionary]$Repository,
    [Parameter(Mandatory)][System.Collections.IDictionary]$Versions,
    [Parameter(Mandatory)][object[]]$ScenarioRecords
  )

  Write-JsonUtf8 (Join-Path $OutputRoot "environment-versions.json") $Versions
  $tools = [ordered]@{}
  foreach ($name in @("code", "node", "git", "bzr")) { $tools[$name] = $Versions[$name].normalized }
  Write-JsonUtf8 (Join-Path $OutputRoot "run-manifest.json") ([ordered]@{
    schemaVersion = 1
    createdAt = (Get-Date).ToUniversalTime().ToString("o")
    repository = $Repository
    tools = $tools
    scenarios = $ScenarioRecords
  })

  $lines = [System.Collections.Generic.List[string]]::new()
  $lines.Add("# Bob Review Real-Machine Environment")
  $lines.Add("")
  $lines.Add("- Repository commit: ``$($Repository.commit)``")
  $lines.Add("- Branch: ``$($Repository.branch)``")
  $lines.Add("- Dirty: ``$($Repository.dirty)``")
  $lines.Add("")
  $lines.Add("| Scenario | Status | Missing commands | Missing paths | Error |")
  $lines.Add("| --- | --- | --- | --- | --- |")
  foreach ($record in $ScenarioRecords) {
    $errorText = if ($record.error) { ([string]$record.error).Replace("|", "\|") } else { "" }
    $lines.Add("| $($record.id) | $($record.status) | $([string]::Join(', ', @($record.missingCommands))) | $([string]::Join(', ', @($record.missingPaths))) | $errorText |")
  }
  $lines.Add("")
  $lines.Add("## Package hints")
  $lines.Add("")
  $hints = @($ScenarioRecords | ForEach-Object { @($_.packageHints) } | Select-Object -Unique)
  if ($hints.Count -eq 0) {
    $lines.Add("- None")
  } else {
    foreach ($hint in $hints) { $lines.Add("- ``$hint``") }
  }
  [System.IO.File]::WriteAllLines(
    (Join-Path $OutputRoot "run-summary.md"),
    $lines,
    [System.Text.UTF8Encoding]::new($false)
  )
}
