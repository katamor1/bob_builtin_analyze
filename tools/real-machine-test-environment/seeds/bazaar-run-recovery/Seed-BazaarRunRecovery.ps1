param(
  [string]$ScenarioRoot,
  [switch]$ValidateOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$script:CampaignId = "real-machine-recovery"

function ConvertTo-JsonText {
  param([Parameter(Mandatory)]$Value)
  return "$(($Value | ConvertTo-Json -Depth 50))`n"
}

function New-PhaseProgress {
  param(
    [Parameter(Mandatory)][string]$Status,
    [string]$StartedAt,
    [string]$CompletedAt
  )

  $result = [ordered]@{ status = $Status }
  if ($StartedAt) { $result.startedAt = $StartedAt }
  if ($CompletedAt) { $result.completedAt = $CompletedAt }
  return $result
}

function Get-RelativeReviewDirectory {
  param([Parameter(Mandatory)][string]$ReviewId)
  return ".bob-review-records/campaigns/$script:CampaignId/records/$ReviewId"
}

function New-ValidReviewResult {
  param([Parameter(Mandatory)][string]$ReviewId)

  return [ordered]@{
    review_id = $ReviewId
    vcs = [ordered]@{
      type = "bazaar"
      repository = "bazaar-source"
      revision_mode = "revisionRange"
      base_revision = "1"
      target_revision = "2"
    }
    checklist_results = @([ordered]@{
      rule_id = "RT-001"
      title = "RT path must not use console I/O"
      status = "fail"
      severity = "warning"
      confidence = "high"
      evidence = @([ordered]@{
        file = "src/rt_control.c"
        start_line = 1
        end_line = 40
        summary = "printf is present in RT_CONTROL"
      })
      reason = "Human triage is required for the seeded recovery run."
    })
    findings = @([ordered]@{
      id = "F-RT-001"
      rule_id = "RT-001"
      severity = "warning"
      file = "src/rt_control.c"
      start_line = 1
      end_line = 40
      title = "Console I/O in RT path"
      description = "The seeded result exercises Review Run resume and triage."
    })
    summary = [ordered]@{
      pass = 0
      fail = 1
      unknown = 0
      not_applicable = 0
      blocked = 0
    }
  }
}

function New-ReviewRun {
  param(
    [Parameter(Mandatory)][string]$WorkspaceRoot,
    [Parameter(Mandatory)][string]$RepositoryRoot,
    [Parameter(Mandatory)][string]$ReviewId,
    [Parameter(Mandatory)][string]$Phase,
    [Parameter(Mandatory)][string]$UpdatedAt,
    [Parameter(Mandatory)][System.Collections.IDictionary]$Artifacts,
    [Parameter(Mandatory)][System.Collections.IDictionary]$Phases,
    [Parameter(Mandatory)][int]$BobReviewSeconds,
    [Parameter(Mandatory)][int]$HumanTriageSeconds
  )

  $metrics = [ordered]@{
    bobReviewSeconds = $BobReviewSeconds
    humanTriageSeconds = $HumanTriageSeconds
    timingSource = "auto_wall_clock"
    correctedByUser = $false
    bobReviewStartedAt = "2026-07-17T00:00:10.000Z"
  }
  if ($BobReviewSeconds -gt 0) {
    $metrics.humanTriageStartedAt = "2026-07-17T00:01:00.000Z"
  }

  return [ordered]@{
    schemaVersion = "bazaar-review-run/v1"
    workspaceRoot = $WorkspaceRoot
    campaignId = $script:CampaignId
    reviewId = $ReviewId
    phase = $Phase
    status = "in_progress"
    createdAt = "2026-07-17T00:00:00.000Z"
    updatedAt = $UpdatedAt
    target = [ordered]@{
      mode = "revisionRange"
      repositoryRoot = $RepositoryRoot
      baseRevision = "1"
      targetRevision = "2"
    }
    artifacts = $Artifacts
    phases = $Phases
    metrics = $metrics
    issues = @()
  }
}

function New-BazaarRecoverySeedPlan {
  param([Parameter(Mandatory)][string]$ScenarioRoot)

  $workspaceRoot = [System.IO.Path]::GetFullPath((Join-Path $ScenarioRoot "bob-managed"))
  $repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $ScenarioRoot "bazaar-source"))
  $files = [System.Collections.Generic.List[object]]::new()
  $definitions = @(
    [ordered]@{
      id = "resume-result-capture"
      phase = "result"
      updated = "2026-07-17T00:01:00.000Z"
      result = $false
      triage = $false
    },
    [ordered]@{
      id = "resume-human-triage"
      phase = "triage"
      updated = "2026-07-17T00:02:00.000Z"
      result = $true
      triage = $false
    },
    [ordered]@{
      id = "resume-finalize"
      phase = "triage"
      updated = "2026-07-17T00:03:00.000Z"
      result = $true
      triage = $true
    }
  )

  foreach ($definition in $definitions) {
    $reviewId = [string]$definition.id
    $recordDir = Get-RelativeReviewDirectory $reviewId
    $packetPath = "$recordDir/review-packet.md"
    $resultJsonPath = ".bob/review/results/$reviewId.json"
    $resultMarkdownPath = ".bob/review/results/$reviewId.md"
    $triagePath = "$recordDir/triage.yaml"
    $artifacts = [ordered]@{ reviewPacketPath = $packetPath }
    if ($definition.result) {
      $artifacts.reviewResultJsonPath = $resultJsonPath
      $artifacts.reviewResultMarkdownPath = $resultMarkdownPath
    }
    if ($definition.triage) { $artifacts.triageYamlPath = $triagePath }

    $phases = [ordered]@{
      target = New-PhaseProgress "completed" "2026-07-17T00:00:00.000Z" "2026-07-17T00:00:00.000Z"
      packet = New-PhaseProgress "completed" "2026-07-17T00:00:05.000Z" "2026-07-17T00:00:10.000Z"
      result = if ($definition.result) {
        New-PhaseProgress "completed" "2026-07-17T00:00:10.000Z" "2026-07-17T00:01:00.000Z"
      } else {
        New-PhaseProgress "in_progress" "2026-07-17T00:00:10.000Z" $null
      }
      triage = if ($definition.triage) {
        New-PhaseProgress "completed" "2026-07-17T00:01:00.000Z" "2026-07-17T00:02:00.000Z"
      } elseif ($definition.result) {
        New-PhaseProgress "in_progress" "2026-07-17T00:01:00.000Z" $null
      } else {
        New-PhaseProgress "not_started" $null $null
      }
      record = New-PhaseProgress "not_started" $null $null
      summary = New-PhaseProgress "not_started" $null $null
    }
    $bobSeconds = if ($definition.result) { 50 } else { 0 }
    $triageSeconds = if ($definition.triage) { 60 } else { 0 }
    $run = New-ReviewRun `
      -WorkspaceRoot $workspaceRoot `
      -RepositoryRoot $repositoryRoot `
      -ReviewId $reviewId `
      -Phase $definition.phase `
      -UpdatedAt $definition.updated `
      -Artifacts $artifacts `
      -Phases $phases `
      -BobReviewSeconds $bobSeconds `
      -HumanTriageSeconds $triageSeconds

    $files.Add([pscustomobject]@{
      relativePath = "bob-managed/$recordDir/review-run.json"
      content = ConvertTo-JsonText $run
      kind = "review-run"
    })
    $files.Add([pscustomobject]@{
      relativePath = "bob-managed/$packetPath"
      content = "# Bazaar Revision Review Request`n`nSeeded recovery packet for $reviewId.`n"
      kind = "packet"
    })
    if ($definition.result) {
      $files.Add([pscustomobject]@{
        relativePath = "bob-managed/$resultJsonPath"
        content = ConvertTo-JsonText (New-ValidReviewResult $reviewId)
        kind = "result-json"
      })
      $files.Add([pscustomobject]@{
        relativePath = "bob-managed/$resultMarkdownPath"
        content = "# Review Result`n`nSeeded valid result for $reviewId.`n"
        kind = "result-markdown"
      })
    }
    if ($definition.triage) {
      $files.Add([pscustomobject]@{
        relativePath = "bob-managed/$triagePath"
        kind = "triage"
        content = @"
schema_version: bazaar-review-triage/v1
review_id: $reviewId
triaged_by: real-machine-fixture
triaged_at: 2026-07-17T00:02:00.000Z
items:
  - finding_id: F-RT-001
    rule_id: RT-001
    decision: accepted
    owner: rt-team
    action: remove console I/O from RT_CONTROL
summary:
  accepted: 1
  rejected: 0
  needs_investigation: 0
  deferred: 0
"@
      })
    }
  }

  $files.Add([pscustomobject]@{
    relativePath = "bob-managed/.bob-review-records/campaigns/$script:CampaignId/records/malformed-run-hidden/review-run.json"
    content = '{"schemaVersion":"bazaar-review-run/v1","reviewId":'
    kind = "malformed-run"
  })

  $schemaError = New-ValidReviewResult "review-result-schema-error"
  $schemaError.Remove("summary")
  $files.Add([pscustomobject]@{
    relativePath = "bob-managed/test-data/invalid/review-result-schema-error.json"
    content = ConvertTo-JsonText $schemaError
    kind = "invalid-result"
  })
  $files.Add([pscustomobject]@{
    relativePath = "bob-managed/test-data/invalid/review-result-id-mismatch.json"
    content = ConvertTo-JsonText (New-ValidReviewResult "different-payload-review-id")
    kind = "invalid-result"
  })

  return @($files)
}

function Assert-BazaarRecoverySeedPlan {
  param([Parameter(Mandatory)][object[]]$Plan)

  $paths = @($Plan.relativePath)
  if ($paths.Count -ne @($paths | Select-Object -Unique).Count) {
    throw "Bazaar recovery seed paths must be unique"
  }
  foreach ($relativePath in $paths) {
    if ([System.IO.Path]::IsPathRooted([string]$relativePath)) {
      throw "Bazaar recovery seed path must be scenario-relative: $relativePath"
    }
    if (([string]$relativePath -split "[\\/]+") -contains "..") {
      throw "Bazaar recovery seed path must not contain ..: $relativePath"
    }
  }
  $requirements = [ordered]@{
    packet = @("reviewPacketPath")
    result = @("reviewResultJsonPath", "reviewResultMarkdownPath")
    triage = @("triageYamlPath")
    record = @("recordYamlPath")
    summary = @("summaryJsonPath", "summaryMarkdownPath")
  }

  $reviewRuns = @($Plan | Where-Object kind -eq "review-run")
  if ($reviewRuns.Count -ne 3) { throw "Exactly three valid recovery review runs are required" }
  foreach ($runFile in $reviewRuns) {
    $run = $runFile.content | ConvertFrom-Json -Depth 50
    foreach ($phaseName in $requirements.Keys) {
      if ($run.phases.$phaseName.status -ne "completed") { continue }
      foreach ($fieldName in $requirements[$phaseName]) {
        if (-not $run.artifacts.$fieldName) { throw "$fieldName is required for completed $phaseName phase" }
        if ($paths -notcontains "bob-managed/$($run.artifacts.$fieldName)") {
          throw "Planned artifact is missing: $($run.artifacts.$fieldName)"
        }
      }
    }
  }
  $malformedRuns = @($Plan | Where-Object kind -eq "malformed-run")
  if ($malformedRuns.Count -ne 1) { throw "Exactly one malformed run is required" }
  try {
    $malformedRuns[0].content | ConvertFrom-Json -Depth 50 | Out-Null
    throw "Malformed Review Run must not parse as JSON"
  } catch {
    if ($_.Exception.Message -eq "Malformed Review Run must not parse as JSON") { throw }
  }

  $invalidResults = @($Plan | Where-Object kind -eq "invalid-result")
  if ($invalidResults.Count -ne 2) { throw "Exactly two invalid review results are required" }
  foreach ($invalidResult in $invalidResults) {
    if ([string]$invalidResult.relativePath -notlike "bob-managed/test-data/invalid/*") {
      throw "Invalid review result must remain isolated: $($invalidResult.relativePath)"
    }
  }
  $schemaError = @($invalidResults | Where-Object relativePath -like "*review-result-schema-error.json")[0].content | ConvertFrom-Json -Depth 50
  if ($schemaError.psobject.Properties.Name -contains "summary") { throw "Schema-error fixture must omit summary" }
  $idMismatch = @($invalidResults | Where-Object relativePath -like "*review-result-id-mismatch.json")[0].content | ConvertFrom-Json -Depth 50
  if ($idMismatch.review_id -eq "review-result-id-mismatch") { throw "ID-mismatch fixture payload must differ from its file name" }
}

function Write-BazaarRecoverySeedPlan {
  param(
    [Parameter(Mandatory)][string]$ScenarioRoot,
    [Parameter(Mandatory)][object[]]$Plan
  )

  . (Join-Path $PSScriptRoot "..\..\lib\ScenarioManifest.ps1")
  . (Join-Path $PSScriptRoot "..\..\lib\ScenarioExecution.ps1")
  Assert-NoReparsePointTraversal -Root $ScenarioRoot -Target $ScenarioRoot

  foreach ($file in $Plan) {
    Assert-ScenarioRelativePath ([string]$file.relativePath) "seed.relativePath" | Out-Null
    $target = Get-NormalizedFullPath (Join-Path $ScenarioRoot ([string]$file.relativePath))
    if (-not (Test-PathInsideRoot $ScenarioRoot $target)) { throw "Seed target escapes ScenarioRoot: $target" }
    $parent = Split-Path -Parent $target
    Assert-NoReparsePointTraversal -Root $ScenarioRoot -Target $parent -AllowMissingLeaf
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
    Assert-NoReparsePointTraversal -Root $ScenarioRoot -Target $parent
    if (Test-Path -LiteralPath $target) { Assert-NoReparsePointTraversal -Root $ScenarioRoot -Target $target }
    [System.IO.File]::WriteAllText(
      $target,
      [string]$file.content,
      [System.Text.UTF8Encoding]::new($false)
    )
    Assert-NoReparsePointTraversal -Root $ScenarioRoot -Target $target
  }
}

$validationRoot = if ($ScenarioRoot) {
  $ScenarioRoot
} else {
  Join-Path $env:TEMP "bob-review-seed-validation-root"
}
$plan = New-BazaarRecoverySeedPlan -ScenarioRoot $validationRoot
Assert-BazaarRecoverySeedPlan -Plan $plan
if ($ValidateOnly) {
  Write-Host "Bazaar recovery seed plan valid: 4 recovery cases; 2 invalid review results"
  return
}
if (-not $ScenarioRoot) { throw "ScenarioRoot is required unless -ValidateOnly is used" }
if (-not (Test-Path -LiteralPath $ScenarioRoot)) { throw "ScenarioRoot does not exist: $ScenarioRoot" }
Write-BazaarRecoverySeedPlan -ScenarioRoot $ScenarioRoot -Plan $plan
