param([Parameter(Mandatory=$true)][ValidatePattern('^[a-zA-Z0-9_-]{1,100}$')][string]$RunId)
$ErrorActionPreference='Stop'
$OutputEncoding=[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new()
$run=Join-Path (Join-Path $PSScriptRoot 'runs') $RunId
foreach($name in @('research-input.json','engine-mapping.json')){if(-not(Test-Path -LiteralPath (Join-Path $run $name))){throw "缺少 $RunId/$name；导入不执行搜索。"}}
Push-Location (Join-Path $PSScriptRoot 'engine')
try {
  docker compose -f compose.radar.yml exec -T api node scripts/import-research.ts "/research/$RunId/research-input.json" "/research/$RunId/engine-mapping.json"
  if($LASTEXITCODE -ne 0){throw '校验或导入失败，未发布本轮数据。'}
  docker compose -f compose.radar.yml exec -T api node scripts/refresh-research.ts
  if($LASTEXITCODE -ne 0){throw '证据投影检查失败，请查看本项目日志。'}
  node ../export-radar.mjs $RunId
  if($LASTEXITCODE -ne 0){throw '已导入，但本地展示记录导出失败。网页仍可查看。'}
  Write-Host '完成。刷新 http://127.0.0.1:8788/research 查看。'
} finally {Pop-Location}
