$ErrorActionPreference = "Stop"

$vbsPath = Join-Path $PSScriptRoot "start-termer-hidden.vbs"
$startupFolder = [Environment]::GetFolderPath("Startup")
$shortcutPath = Join-Path $startupFolder "Termer Auto Start.lnk"
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "wscript.exe"
$shortcut.Arguments = "`"$vbsPath`""
$shortcut.WorkingDirectory = $repoRoot
$shortcut.Description = "Starts the Termer backend in the background when you log into Windows."
$shortcut.Save()

Write-Output "Installed Windows Startup shortcut at '$shortcutPath'."
