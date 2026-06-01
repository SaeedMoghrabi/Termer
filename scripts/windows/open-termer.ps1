$ErrorActionPreference = "Stop"

$scriptRoot = $PSScriptRoot
$startScript = Join-Path $scriptRoot "start-termer-hidden.ps1"

& powershell -NoProfile -ExecutionPolicy Bypass -File $startScript | Out-Null
Start-Sleep -Seconds 2
Start-Process "http://localhost:3001"
