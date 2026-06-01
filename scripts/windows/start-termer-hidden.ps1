$ErrorActionPreference = "Stop"

function Get-RepoRoot {
  return Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
}

function Get-ServerScriptPath {
  $repoRoot = Get-RepoRoot
  return Join-Path $repoRoot "server.cjs"
}

function Get-ExistingTermerProcesses {
  $repoRoot = Get-RepoRoot
  $serverScript = Get-ServerScriptPath
  $frontendWrapper = Join-Path $repoRoot "CoursePlannerr\\server.cjs"
  $serverScriptPattern = [regex]::Escape($serverScript)
  $frontendWrapperPattern = [regex]::Escape($frontendWrapper)
  $processes = Get-CimInstance Win32_Process |
    Where-Object {
      $commandLine = [string]$_.CommandLine
      $matchesServer = $commandLine -match $serverScriptPattern
      $matchesWrapper = $commandLine -match $frontendWrapperPattern
      $matchesGeneric = $commandLine -match 'server\.cjs'
      $_.Name -eq "node.exe" -and ($matchesServer -or $matchesWrapper -or $matchesGeneric)
    }

  $listenerPids = @(Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique)

  if (-not $listenerPids.Count) {
    return $processes | Sort-Object ProcessId -Unique
  }

  $allProcessIds = @($processes | Select-Object -ExpandProperty ProcessId) + @($listenerPids)
  return Get-CimInstance Win32_Process |
    Where-Object { $allProcessIds -contains $_.ProcessId } |
    Sort-Object ProcessId -Unique
}

$repoRoot = Get-RepoRoot
$runtimeDir = Join-Path $repoRoot "data\\runtime"
$clientDistIndex = Join-Path $repoRoot "CoursePlannerr\\dist\\index.html"
$stdoutLog = Join-Path $runtimeDir "termer-server.out.log"
$stderrLog = Join-Path $runtimeDir "termer-server.err.log"
$pidPath = Join-Path $runtimeDir "termer-server.pid"

New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

$existingProcesses = @(Get-ExistingTermerProcesses)
if ($existingProcesses.Count -gt 0) {
  $existingProcesses | ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Seconds 2
}

Push-Location $repoRoot
try {
  & npm.cmd --prefix CoursePlannerr run build
  if ($LASTEXITCODE -ne 0) {
    throw "Frontend build failed."
  }
} finally {
  Pop-Location
}

$launcherProcess = Start-Process `
  -FilePath "node.exe" `
  -ArgumentList $([string](Get-ServerScriptPath)) `
  -WorkingDirectory $repoRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput $stdoutLog `
  -RedirectStandardError $stderrLog `
  -PassThru

Start-Sleep -Seconds 4
$pidToPersist = $launcherProcess.Id
Set-Content -Path $pidPath -Value $pidToPersist -Encoding ASCII

$healthUrl = "http://localhost:3001/api/health"
try {
  $response = Invoke-WebRequest -UseBasicParsing $healthUrl
  if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 300) {
    throw "Health check returned HTTP $($response.StatusCode)."
  }
  Write-Output "Termer started successfully on $healthUrl with PID $pidToPersist."
} catch {
  throw "Termer process started, but health check failed. Check $stderrLog for details. $($_.Exception.Message)"
}
