$ErrorActionPreference = "Stop"

$desktop = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktop "Open Termer.lnk"
$vbsPath = Join-Path $PSScriptRoot "open-termer.vbs"
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "wscript.exe"
$shortcut.Arguments = "`"$vbsPath`""
$shortcut.WorkingDirectory = $repoRoot
$shortcut.Description = "Starts Termer in the background if needed and opens http://localhost:3001."
$shortcut.Save()

Write-Output "Installed desktop shortcut at '$shortcutPath'."
