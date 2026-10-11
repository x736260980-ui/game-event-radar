$ErrorActionPreference='Stop'
$OutputEncoding=[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new()
Push-Location (Join-Path $PSScriptRoot 'engine')
try {docker compose -f compose.radar.yml stop web api worker radar-scheduler db;if($LASTEXITCODE -ne 0){throw '停止失败。'};Write-Host '仅停止本项目；数据库文件保留。'} finally{Pop-Location}
