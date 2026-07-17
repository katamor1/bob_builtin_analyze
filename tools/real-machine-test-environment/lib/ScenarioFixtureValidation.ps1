Set-StrictMode -Version Latest

function Assert-ScenarioFixtureCopies {
  param(
    [Parameter(Mandatory)][string]$RepoRoot,
    [Parameter(Mandatory)][pscustomobject]$Manifest
  )

  $errors = [System.Collections.Generic.List[string]]::new()
  foreach ($scenario in @($Manifest.scenarios)) {
    if ($scenario.psobject.Properties.Name -notcontains "fixtureCopies") { continue }
    try {
      $scenarioId = [string]$scenario.id
      $fixtureDestinations = [System.Collections.Generic.List[string]]::new()
      foreach ($copy in @($scenario.fixtureCopies)) {
        Assert-RepositoryRelativePath $RepoRoot ([string]$copy.source) "$scenarioId.fixtureCopies.source" -MustExist | Out-Null
        $destination = Assert-ScenarioRelativePath ([string]$copy.destination) "$scenarioId.fixtureCopies.destination"
        if ($destination -notmatch "^workspace/test-data/invalid/[A-Za-z0-9._-]+$") {
          throw "Invalid fixture destination must remain isolated: $destination"
        }
        if ($destination -in @(
          "workspace/review-input.yaml",
          "workspace/.bob-review/bob-output/bob-output.yaml",
          "workspace/.bob-trace/ai-traceability-draft/ai-draft.json"
        )) {
          throw "Invalid fixture destination must not be an active artifact path: $destination"
        }
        if (@($scenario.expectedArtifacts) -notcontains $destination) {
          throw "Invalid fixture destination must be listed in expectedArtifacts: $destination"
        }
        $fixtureDestinations.Add($destination)
      }
      if ($fixtureDestinations.Count -ne @($fixtureDestinations | Select-Object -Unique).Count) {
        throw "Invalid fixture destinations must be unique"
      }
    } catch {
      $errors.Add("$($scenario.id): $($_.Exception.Message)")
    }
  }
  if ($errors.Count -gt 0) {
    throw "Scenario fixture declarations are invalid:`n- $($errors -join "`n- ")"
  }
}
