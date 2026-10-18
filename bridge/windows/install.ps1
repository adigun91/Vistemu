$ErrorActionPreference = 'Stop'
$sourceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$installRoot = Join-Path $env:LOCALAPPDATA 'Programs\VistemuBridge'
$startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Vistemu Bridge'

if (-not (Test-Path (Join-Path $sourceRoot 'runtime\node.exe'))) {
  throw 'Bundled Node runtime was not found. Extract the complete VistemuBridge release archive first.'
}
if (-not (Test-Path (Join-Path $sourceRoot 'app\platform-tools\adb.exe'))) {
  throw 'Bundled ADB was not found. Rebuild the Vistemu Bridge release package with Android Platform-Tools.'
}

New-Item -ItemType Directory -Path $installRoot -Force | Out-Null
Copy-Item (Join-Path $sourceRoot 'runtime') $installRoot -Recurse -Force
Copy-Item (Join-Path $sourceRoot 'app') $installRoot -Recurse -Force
New-Item -ItemType Directory -Path $startMenu -Force | Out-Null
Copy-Item (Join-Path $sourceRoot 'start.ps1') $startMenu -Force
Copy-Item (Join-Path $sourceRoot 'stop.ps1') $startMenu -Force
Copy-Item (Join-Path $sourceRoot 'README.txt') $startMenu -Force

$shell = New-Object -ComObject WScript.Shell
foreach ($action in @('start', 'stop')) {
  $label = if ($action -eq 'start') { 'Start' } else { 'Stop' }
  $shortcut = $shell.CreateShortcut((Join-Path $startMenu "$label Vistemu Bridge.lnk"))
  $shortcut.TargetPath = Join-Path $PSHOME 'powershell.exe'
  $shortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $startMenu "$action.ps1") + '"'
  $shortcut.WorkingDirectory = $installRoot
  $shortcut.Save()
}

Write-Host "Vistemu Bridge installed for this Windows user at $installRoot"
Write-Host 'Start it from the Start Menu shortcut: Start Vistemu Bridge'
Write-Host 'The first start creates a private pairing token under %APPDATA%\Vistemu\bridge-token.txt.'
Write-Host 'Pair the extension in Vistemu Settings. No administrator rights are required.'
