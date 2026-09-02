$ErrorActionPreference = "Stop"

$projectPath = "C:\BOT CCS"
$nodePath = "C:\Program Files\nodejs\node.exe"
$pm2Path = "C:\Users\Usuario\AppData\Roaming\npm\node_modules\pm2\bin\pm2"
$env:PM2_HOME = "C:\Users\Usuario\.pm2"
$ecosystemPath = Join-Path $projectPath "ecosystem.config.cjs"
$logPath = Join-Path $projectPath "logs\bot-ccs-watchdog.log"

New-Item -ItemType Directory -Path (Split-Path $logPath) -Force | Out-Null

function Test-BotCcsHealth {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:3010/" -TimeoutSec 10
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

if (Test-BotCcsHealth) {
  exit 0
}

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Add-Content -LiteralPath $logPath -Value "$timestamp - Health check failed; starting bot-ccs-web."

Push-Location $projectPath
try {
  & $nodePath $pm2Path startOrReload $ecosystemPath --update-env 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "PM2 startOrReload exited with code $LASTEXITCODE."
  }

  & $nodePath $pm2Path save 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "PM2 save exited with code $LASTEXITCODE."
  }
} catch {
  Add-Content -LiteralPath $logPath -Value "$timestamp - Recovery failed: $($_.Exception.Message)"
  exit 1
} finally {
  Pop-Location
}

if (-not (Test-BotCcsHealth)) {
  Add-Content -LiteralPath $logPath -Value "$timestamp - Recovery command completed but health check still fails."
  exit 1
}

Add-Content -LiteralPath $logPath -Value "$timestamp - bot-ccs-web recovered successfully."
