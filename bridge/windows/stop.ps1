$ErrorActionPreference = 'Stop'
$stateRoot = Join-Path $env:LOCALAPPDATA 'VistemuBridge'
$pidFile = Join-Path $stateRoot 'bridge.pid'

if (-not (Test-Path $pidFile)) {
  Write-Host 'Vistemu Bridge is not running (no PID file).'
  exit 0
}
$bridgePid = [int](Get-Content $pidFile -Raw)
$process = Get-Process -Id $bridgePid -ErrorAction SilentlyContinue
if ($process) {
  $processPath = $process.Path
  if ($processPath -and $processPath -ne (Join-Path $env:LOCALAPPDATA 'Programs\VistemuBridge\runtime\node.exe')) {
    throw 'PID file points to a process other than the bundled Vistemu Node runtime; refusing to stop it.'
  }
  Stop-Process -Id $bridgePid
  Write-Host 'Vistemu Bridge stopped.'
} else {
  Write-Host 'Vistemu Bridge process was already stopped.'
}
Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
