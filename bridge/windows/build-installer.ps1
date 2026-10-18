param(
  [string]$CertificateThumbprint = ""
)

$ErrorActionPreference = 'Stop'
$bridgeRoot = Split-Path -Parent $PSScriptRoot
$stageRoot = Join-Path $bridgeRoot 'release\windows-x64'
$iss = Join-Path $stageRoot 'VistemuBridge.iss'
$installerDir = Join-Path $bridgeRoot 'release\installer'
$iscc = Get-Command ISCC.exe -ErrorAction SilentlyContinue
$isccPath = if ($iscc) { $iscc.Source } else { $null }

if (-not $isccPath) {
  $candidates = @(
    (Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 6\ISCC.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe'),
    (Join-Path $env:ProgramFiles 'Inno Setup 6\ISCC.exe')
  )
  $isccPath = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}

if (-not $isccPath) {
  throw 'Inno Setup 6 is not installed. Install it, then run npm run package:windows followed by this script.'
}
if (-not (Test-Path $iss)) {
  throw 'Windows release staging is missing. Run npm run package:windows first.'
}
New-Item -ItemType Directory -Path $installerDir -Force | Out-Null
& $isccPath "/O$installerDir" $iss
if ($LASTEXITCODE -ne 0) { throw "Inno Setup failed with exit code $LASTEXITCODE." }

$installer = Get-ChildItem $installerDir -Filter 'VistemuBridgeSetup-*-x64.exe' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $installer) { throw 'Inno Setup completed but did not produce the expected installer.' }

if (-not $CertificateThumbprint) {
  Write-Warning "Installer created unsigned: $($installer.FullName). Do not publish this executable until it is signed with your publisher certificate."
  exit 0
}

$certificate = Get-Item "Cert:\CurrentUser\My\$CertificateThumbprint" -ErrorAction Stop
if (-not $certificate.HasPrivateKey) { throw 'The selected signing certificate does not have an accessible private key.' }
$signtool = Get-Command signtool.exe -ErrorAction SilentlyContinue
if (-not $signtool) { throw 'signtool.exe not found. Install the Windows SDK signing tools.' }
& $signtool.Source sign /fd SHA256 /tr "http://timestamp.digicert.com" /td SHA256 /sha1 $CertificateThumbprint $installer.FullName
if ($LASTEXITCODE -ne 0) { throw "Authenticode signing failed with exit code $LASTEXITCODE." }
& $signtool.Source verify /pa /v $installer.FullName
if ($LASTEXITCODE -ne 0) { throw 'Installer signature verification failed.' }
Write-Host "Signed and verified $($installer.FullName)"
