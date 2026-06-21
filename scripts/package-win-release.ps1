$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$packageName = "AIGC-Credit-Radar-0.0.1-win-x64"
$releaseDir = Join-Path $root "release"
$sourceDir = Join-Path $releaseDir "win-unpacked"
$stageDir = Join-Path $releaseDir $packageName
$zipPath = Join-Path $releaseDir "$packageName.zip"

if (-not (Test-Path -LiteralPath $sourceDir)) {
  throw "Missing $sourceDir. Run npm run pack:desktop first."
}

if (Test-Path -LiteralPath $stageDir) {
  Remove-Item -LiteralPath $stageDir -Recurse -Force
}

if (Test-Path -LiteralPath $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}

New-Item -ItemType Directory -Path $stageDir | Out-Null
Get-ChildItem -LiteralPath $sourceDir | Copy-Item -Destination $stageDir -Recurse -Force

@"
AIGC Credit Radar 0.0.1

How to run:
1. Extract this ZIP.
2. Open "AIGC Credit Radar.exe".
3. Keep the whole folder together. Do not move only the exe out of this folder.

Notes:
- Higgsfield and Jimeng use local connectors.
- Platforms without real connectors can be tracked through Manual Import.
- Auto checks run while the app is open.
"@ | Set-Content -LiteralPath (Join-Path $stageDir "README.txt") -Encoding UTF8

Compress-Archive -LiteralPath $stageDir -DestinationPath $zipPath -CompressionLevel Optimal

Write-Host "Packaged $zipPath"
