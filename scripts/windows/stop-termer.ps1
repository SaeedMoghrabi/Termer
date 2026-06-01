$ErrorActionPreference = "Stop"

function Get-RepoRoot {
  return Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
}

$repoRoot = Get-RepoRoot
$serverScript = Join-Path $repoRoot "server.cjs"
$runtimeDir = Join-Path $repoRoot "data\\runtime"
$pidPath = Join-Path $runtimeDir "termer-server.pid"

$processes = Get-CimInstance Win32_Process |
  Where-Object {
    $_.Name -eq "node.exe" -and $_.CommandLine -match [regex]::Escape($serverScript)
  }

if (-not $processes) {
  if (Test-Path $pidPath) {
    Remove-Item $pidPath -Force
  }
  Write-Output "Termer is not running."
  exit 0
}

$processes | ForEach-Object {
  Stop-Process -Id $_.ProcessId -Force
  Write-Output "Stopped Termer PID $($_.ProcessId)."
}

if (Test-Path $pidPath) {
  Remove-Item $pidPath -Force
}
