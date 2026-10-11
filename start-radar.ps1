param([switch]$NoBuild,[ValidateRange(1024,65535)][int]$Port=8788)
$env:RADAR_PORT=[string]$Port
$ErrorActionPreference='Stop'
$OutputEncoding=[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new()
Push-Location (Join-Path $PSScriptRoot 'engine')
try {
  docker info --format '{{.ServerVersion}}' | Out-Null
  if($LASTEXITCODE -ne 0){throw '请先打开 Docker Desktop。'}
  if(-not(Test-Path -LiteralPath '.env')){node scripts/init-radar-env.ts;if($LASTEXITCODE -ne 0){throw '本地配置初始化失败。'}}
  if($NoBuild){docker compose -f compose.radar.yml up -d --no-build db setup api web}
  else{docker compose -f compose.radar.yml up -d --build db setup api web}
  if($LASTEXITCODE -ne 0){throw '启动失败，请检查本项目容器日志。其他项目未处理。'}

  Write-Host "游戏雷达：http://127.0.0.1:$Port/；事件雷达：http://127.0.0.1:$Port/research"
} finally {Pop-Location}
