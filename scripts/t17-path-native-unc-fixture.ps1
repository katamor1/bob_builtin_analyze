[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][ValidateSet('identity','query','create','remove')][string]$Mode,
  [Parameter(Mandatory=$true)][string]$FixtureRoot,
  [Parameter(Mandatory=$true)][string]$EvidenceRoot,
  [Parameter(Mandatory=$true)][string]$Nonce,
  [Parameter(Mandatory=$true)][string]$SourceHeadSha,
  [Parameter(Mandatory=$true)][string]$SourceTreeSha,
  [string]$RunnerPrincipal = '',
  [string]$RunnerSid = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$script:createdShareFlag = $false
$script:removedShareFlag = $false
$script:currentIdentity = $null
$shareName = 'bob-t17path-' + $Nonce
$shareDescription = 'bob-t17-path:' + $Nonce + ':' + $SourceHeadSha

function Write-NativeReply([string]$ResultState, $ShareRecord, $FailureText) {
  $nativeReply = [ordered]@{
    schemaVersion = 'bob-builtin-analyze/t17-path-native-unc-powershell/v1'
    operation = $Mode
    state = $ResultState
    identity = $script:currentIdentity
    share = $ShareRecord
    created = $script:createdShareFlag
    removed = $script:removedShareFlag
    error = $FailureText
  }
  [Console]::Out.WriteLine(($nativeReply | ConvertTo-Json -Depth 10 -Compress))
}

function Assert-OwnedDirectory([string]$DirectoryPath) {
  if ($DirectoryPath.Length -gt 200 -or $DirectoryPath -cne $DirectoryPath.Trim() -or $DirectoryPath -cne $DirectoryPath.Normalize([Text.NormalizationForm]::FormC) -or $DirectoryPath -match '[\x00-\x1f\x7f-\x9f]' -or $DirectoryPath -notmatch '^[A-Za-z]:[\\/]') { throw 'fixture local path syntax rejected' }
  foreach ($component in $DirectoryPath.Substring(3).Split([char[]]'\/')) {
    if (-not $component -or $component -ceq '.' -or $component -ceq '..' -or $component -cne $component.Trim() -or $component.EndsWith('.') -or $component.IndexOfAny([char[]]'<>:"|?*') -ge 0) { throw 'fixture raw path component rejected' }
  }
  $resolvedPath = [IO.Path]::GetFullPath($DirectoryPath)
  $tempPath = [IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd([char[]]'\/')
  if (-not $resolvedPath.StartsWith($tempPath + '\', [StringComparison]::OrdinalIgnoreCase) -or -not ([IO.Path]::GetFileName($resolvedPath).Contains($Nonce))) { throw 'fixture path outside owned runner temp or nonce' }
  $currentDirectory = [IO.DirectoryInfo]::new($resolvedPath)
  while ($null -ne $currentDirectory) {
    if (-not $currentDirectory.Exists -or ($currentDirectory.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'fixture directory missing or reparse alias' }
    $currentDirectory = $currentDirectory.Parent
  }
  return $resolvedPath
}

function Read-OwnedShare {
  # Enumerating successfully, then selecting an exact name, distinguishes a
  # missing definition from Get-SmbShare access/query failure without broad catch.
  $selected = @(Get-SmbShare -ErrorAction Stop | Where-Object { $_.Name -ceq $shareName })
  if ($selected.Count -gt 1) { throw 'ambiguous share scope' }
  if ($selected.Count -eq 0) { return $null }
  $shareObject = $selected[0]
  $accessRecords = @()
  foreach ($entry in @(Get-SmbShareAccess -InputObject $shareObject -ErrorAction Stop)) {
    $account = [Security.Principal.NTAccount]::new([string]$entry.AccountName)
    $accountSid = $account.Translate([Security.Principal.SecurityIdentifier]).Value
    $principalName = [string]$entry.AccountName
    if ($accountSid -ceq $script:currentIdentity.sid) { $principalName = $script:currentIdentity.principal }
    $accessRecords += [ordered]@{ principal=$principalName; sid=$accountSid; type=[string]$entry.AccessControlType; right=[string]$entry.AccessRight }
  }
  return [ordered]@{ name=[string]$shareObject.Name; path=[string]$shareObject.Path; description=[string]$shareObject.Description; scopeName=[string]$shareObject.ScopeName; access=@($accessRecords) }
}

function Assert-ShareOwner($ShareRecord) {
  if ($null -eq $ShareRecord -or $ShareRecord.name -cne $shareName -or -not [string]::Equals($ShareRecord.path, $FixtureRoot, [StringComparison]::OrdinalIgnoreCase) -or $ShareRecord.description -cne $shareDescription -or $ShareRecord.scopeName -cne '*') { throw 'share path/name/subject ownership mismatch' }
  if ($ShareRecord.access.Count -ne 1) { throw 'share principal ACL mismatch' }
  $entry = $ShareRecord.access[0]
  if ($entry.sid -cne $RunnerSid -or $entry.principal -cne $RunnerPrincipal -or $entry.type -cne 'Allow' -or $entry.right -cne 'Full') { throw 'share principal ACL mismatch' }
}

try {
  if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT -or $env:GITHUB_ACTIONS -cne 'true' -or $env:RUNNER_OS -cne 'Windows') { throw 'Windows GitHub runner required' }
  if ($Nonce -cnotmatch '^[a-f0-9]{32}$' -or $SourceHeadSha -cnotmatch '^[a-f0-9]{40}$' -or $SourceTreeSha -cnotmatch '^[a-f0-9]{40}$') { throw 'fixture nonce/source subject invalid' }
  if ($env:EXPECTED_HEAD_SHA -cne $SourceHeadSha -or $env:CI_VERIFIED_HEAD_SHA -cne $SourceHeadSha -or $env:GITHUB_EVENT_NAME -cnotin @('push','pull_request','workflow_dispatch')) { throw 'fixture CI head guard missing' }
  if ($env:GITHUB_EVENT_NAME -ceq 'workflow_dispatch') {
    if ($env:DISPATCH_HEAD_SHA -cne $SourceHeadSha -or $env:DISPATCH_NONCE -cnotmatch '^[a-f0-9]{32}$') { throw 'fixture dispatch head guard mismatch' }
  } elseif ($env:GITHUB_EVENT_NAME -cne 'pull_request' -and $env:GITHUB_SHA -cne $SourceHeadSha) { throw 'fixture trigger head mismatch' }
  $repositoryRoot = Split-Path -Parent $PSScriptRoot
  $actualHead = (& git -C $repositoryRoot rev-parse --verify HEAD | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or $actualHead -cne $SourceHeadSha) { throw 'fixture checkout head mismatch' }
  $actualTree = (& git -C $repositoryRoot rev-parse --verify 'HEAD^{tree}' | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or $actualTree -cne $SourceTreeSha) { throw 'fixture checkout tree mismatch' }
  $null = Assert-OwnedDirectory $FixtureRoot
  $null = Assert-OwnedDirectory $EvidenceRoot
  $windowsIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $script:currentIdentity = [ordered]@{ principal=$windowsIdentity.Name; sid=$windowsIdentity.User.Value }
  if ($Mode -ceq 'identity') { Write-NativeReply 'ok' $null $null; exit 0 }
  if ($RunnerPrincipal -cne $script:currentIdentity.principal -or $RunnerSid -cne $script:currentIdentity.sid) { throw 'fixture current runner principal mismatch' }

  $markerPath = Join-Path $FixtureRoot '.t17-path-owner.json'
  $markerInfo = Get-Item -LiteralPath $markerPath -Force -ErrorAction Stop
  if ($markerInfo.PSIsContainer -or ($markerInfo.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or $markerInfo.Length -gt 8192) { throw 'fixture owner marker invalid' }
  $ownerRecord = Get-Content -LiteralPath $markerPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $ownerKeys = @('schemaVersion','sourceHeadSha','sourceTreeSha','nonce','fixtureRoot','shareName','runnerPrincipal','runnerSid')
  $actualKeys = @($ownerRecord.PSObject.Properties.Name)
  if ($actualKeys.Count -ne $ownerKeys.Count -or @($actualKeys | Where-Object { $_ -cnotin $ownerKeys }).Count -ne 0) { throw 'fixture marker exact keys' }
  if ($ownerRecord.schemaVersion -cne 'bob-builtin-analyze/t17-path-native-unc-owner/v1' -or $ownerRecord.sourceHeadSha -cne $SourceHeadSha -or $ownerRecord.sourceTreeSha -cne $SourceTreeSha -or $ownerRecord.nonce -cne $Nonce -or $ownerRecord.fixtureRoot -cne $FixtureRoot -or $ownerRecord.shareName -cne $shareName -or $ownerRecord.runnerPrincipal -cne $RunnerPrincipal -or $ownerRecord.runnerSid -cne $RunnerSid) { throw 'fixture marker owner mismatch' }

  if ($Mode -ceq 'query') { $observed = Read-OwnedShare; Write-NativeReply 'ok' $observed $null; exit 0 }
  if ($Mode -ceq 'create') {
    if ($null -ne (Read-OwnedShare)) { throw 'foreign or existing share collision' }
    # WhatIf does not work for New-SmbShare. This branch runs only after the
    # runner/head/owned-path guards; local tests inject the Node transport.
    $null = New-SmbShare -Name $shareName -Path $FixtureRoot -Description $shareDescription -FullAccess $RunnerPrincipal -CachingMode None -FolderEnumerationMode AccessBased -Confirm:$false -ErrorAction Stop
    $script:createdShareFlag = $true
    $observed = Read-OwnedShare
    Assert-ShareOwner $observed
    Write-NativeReply 'ok' $observed $null
    exit 0
  }
  if ($Mode -ceq 'remove') {
    $observed = Read-OwnedShare
    Assert-ShareOwner $observed
    $selected = @(Get-SmbShare -ErrorAction Stop | Where-Object { $_.Name -ceq $shareName -and $_.ScopeName -ceq '*' })
    if ($selected.Count -ne 1 -or -not [string]::Equals([string]$selected[0].Path, $FixtureRoot, [StringComparison]::OrdinalIgnoreCase) -or [string]$selected[0].Description -cne $shareDescription) { throw 'share changed before owned definition removal' }
    $null = Remove-SmbShare -InputObject $selected[0] -Force -Confirm:$false -ErrorAction Stop
    $script:removedShareFlag = $true
    if ($null -ne (Read-OwnedShare)) { throw 'owned share removal unconfirmed' }
    Write-NativeReply 'ok' $null $null
    exit 0
  }
  throw 'unsupported fixture operation'
} catch {
  $failureText = [string]$_.Exception.Message
  if ($failureText.Length -gt 1024) { $failureText = $failureText.Substring(0,1024) }
  Write-NativeReply 'failed' $null $failureText
  exit 1
}
