# Build bundled Lambda + deploy scanOmr only.
Set-Location $PSScriptRoot
$env:SLS_TELEMETRY_DISABLED = "1"
$env:NODE_OPTIONS = "--max-old-space-size=4096"

Write-Host "Building OMR bundle..."
npm run build:omr
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Deploying scanOmr..."
npx --yes serverless@3.39.0 deploy function -f scanOmr --verbose
exit $LASTEXITCODE
