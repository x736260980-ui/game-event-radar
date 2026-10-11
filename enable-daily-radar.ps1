param([switch]$NoBuild)
$ErrorActionPreference='Stop'
$OutputEncoding=[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)
. (Join-Path $PSScriptRoot 'search-credentials.ps1')
$keys=Get-RadarSearchCredentials
if(-not $keys.tavily){throw '未找到已有的 Tavily 配置，未启用任务。'}
Push-Location (Join-Path $PSScriptRoot 'engine')
try {
 if(-not $NoBuild){docker compose -f compose.radar.yml build radar-scheduler;if($LASTEXITCODE -ne 0){throw '构建失败。'}}
 $payload=$keys|ConvertTo-Json -Compress
 $payload|docker compose -f compose.radar.yml run --rm --no-deps -T radar-scheduler node scripts/radar-scheduler.ts --configure
 if($LASTEXITCODE -ne 0){throw '私有凭据配置失败。'}
 docker compose -f compose.radar.yml up -d --no-build radar-scheduler
 if($LASTEXITCODE -ne 0){throw '定时服务启动失败。'}
 Write-Host '已启用北京时间每日08:00；今天08:00后首次启动会补跑一次。失败不自动重复付费。'
} finally {$payload=$null;$keys=$null;Pop-Location}
