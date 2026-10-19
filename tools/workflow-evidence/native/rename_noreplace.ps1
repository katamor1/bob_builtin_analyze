param(
  [Parameter(Mandatory)][ValidateSet('build','promote')][string]$Mode,
  [Parameter(Mandatory)][string]$BuildDirectory,
  [string]$Source,
  [string]$Destination
)
$ErrorActionPreference = 'Stop'
$dll = Join-Path $BuildDirectory 'rename_noreplace.dll'
try {
  if ($Mode -eq 'build') {
    if (Test-Path -LiteralPath $dll) { exit 4 }
    $sourceCode = @'
using System;
using System.Runtime.InteropServices;
public static class WorkflowEvidenceNativeRename {
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool MoveFileExW(string source, string destination, uint flags);
}
'@
    [System.IO.File]::WriteAllText((Join-Path $BuildDirectory 'rename_noreplace.cs'), $sourceCode, [System.Text.UTF8Encoding]::new($false))
    Add-Type -TypeDefinition $sourceCode -Language CSharp -OutputAssembly $dll -CompilerOptions '/optimize+'
    Write-Output (@{ powershell = $PSVersionTable.PSVersion.ToString(); runtime = [System.Environment]::Version.ToString() } | ConvertTo-Json -Compress)
    exit 0
  }
  Add-Type -LiteralPath $dll
  function LongPath([string]$value) {
    $full = [System.IO.Path]::GetFullPath($value)
    if ($full.StartsWith('\\?\')) { return $full }
    if ($full.StartsWith('\\')) { return '\\?\UNC\' + $full.Substring(2) }
    return '\\?\' + $full
  }
  # Zero flags: no replacement, no copy/delete fallback, no delayed operation.
  if ([WorkflowEvidenceNativeRename]::MoveFileExW((LongPath $Source), (LongPath $Destination), 0)) { exit 0 }
  $nativeError = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
  if ($nativeError -eq 80 -or $nativeError -eq 183) { exit 2 }
  exit 4
} catch {
  exit 3
}
