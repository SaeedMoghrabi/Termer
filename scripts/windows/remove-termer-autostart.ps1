$ErrorActionPreference = "Stop"

$startupFolder = [Environment]::GetFolderPath("Startup")
$shortcutPath = Join-Path $startupFolder "Termer Auto Start.lnk"

if (Test-Path $shortcutPath) {
  Remove-Item $shortcutPath -Force
  Write-Output "Removed Windows Startup shortcut '$shortcutPath'."
} else {
  Write-Output "Windows Startup shortcut does not exist."
}
