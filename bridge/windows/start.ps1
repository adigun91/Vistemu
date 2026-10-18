$ErrorActionPreference = 'Stop'
$installRoot = Join-Path $env:LOCALAPPDATA 'Programs\VistemuBridge'
$node = Join-Path $installRoot 'runtime\node.exe'
$entry = Join-Path $installRoot 'app\src\server.mjs'
$stateRoot = Join-Path $env:LOCALAPPDATA 'VistemuBridge'
$pidFile = Join-Path $stateRoot 'bridge.pid'
$logFile = Join-Path $stateRoot 'bridge.log'

if (-not (Test-Path $node) -or -not (Test-Path $entry)) {
  throw 'Vistemu Bridge is not installed. Run install.ps1 from the extracted release archive.'
}
New-Item -ItemType Directory -Path $stateRoot -Force | Out-Null
if (Test-Path $pidFile) {
  $oldPid = [int](Get-Content $pidFile -Raw)
  if (Get-Process -Id $oldPid -ErrorAction SilentlyContinue) {
    Write-Host "Vistemu Bridge is already running (PID $oldPid)."
    exit 0
  }
  Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
}

$errorLogFile = "$logFile.err"
$process = Start-Process -FilePath $node -ArgumentList @('"' + $entry + '"') -WorkingDirectory (Join-Path $installRoot 'app') -WindowStyle Hidden -PassThru -RedirectStandardOutput $logFile -RedirectStandardError $errorLogFile
Set-Content -Path $pidFile -Value $process.Id -NoNewline
Write-Host "Vistemu Bridge started (PID $($process.Id)); listening only on 127.0.0.1:8787."
Write-Host "Pair token file: $env:APPDATA\Vistemu\bridge-token.txt"
Write-Host "Logs: $logFile and $errorLogFile"
