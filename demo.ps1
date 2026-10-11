param([switch]$NoBuild,[ValidateRange(1024,65535)][int]$Port=8788)
$ErrorActionPreference='Stop'
$OutputEncoding=[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)
& (Join-Path $PSScriptRoot 'start-radar.ps1') -NoBuild:$NoBuild -Port $Port
Push-Location (Join-Path $PSScriptRoot 'engine')
try {
  foreach($name in @('crossover','pearl')) {
    docker compose -f compose.radar.yml exec -T api node scripts/import-research.ts "/examples/$name/research-input.json" "/examples/$name/engine-mapping.json"
    if($LASTEXITCODE -ne 0){throw "示例导入失败：$name"}
  }
  Write-Host "两个历史案例已导入。打开 http://127.0.0.1:$Port/research；未调用付费 API、未启用定时任务。"
} finally {Pop-Location}
