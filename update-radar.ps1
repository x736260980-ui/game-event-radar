param(
 [Parameter(Mandatory=$true)][ValidatePattern('^[a-zA-Z0-9_-]{1,100}$')][string]$RunId,
 [string]$Game='崩坏：星穹铁道',
 [ValidateSet(3,7,14)][int]$WindowDays=3,
 [ValidateRange(1,30)][int]$MaxMaterials=30,
 [string]$Focus='',
 [string]$CodexSearchFile='',
 [switch]$Publish,
 [switch]$CheckCredentials
)
$ErrorActionPreference='Stop'
$OutputEncoding=[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)
. (Join-Path $PSScriptRoot 'search-credentials.ps1')
$keys=Get-RadarSearchCredentials
if($CheckCredentials){[pscustomobject]@{tavily=[bool]$keys.tavily;firecrawl=[bool]$keys.firecrawl}|ConvertTo-Json;return}
Push-Location (Join-Path $PSScriptRoot 'engine')
try {
 $payload=$keys|ConvertTo-Json -Compress
 if($CodexSearchFile){
  $codexAbsolute=(Resolve-Path -LiteralPath $CodexSearchFile).Path.Replace('\','/')
 }
 $dockerArgs=@('compose','-f','compose.radar.yml','run','--rm','--no-deps','-T','-e','MODEL_CALLS_ENABLED=true','-e','COLLECT_ENABLED=true',
 '-v',"$($PSScriptRoot.Replace('\','/'))/runs:/update-runs")
 if($CodexSearchFile){$dockerArgs+=@('-v',"${codexAbsolute}:/codex-search.json:ro")}
 $dockerArgs+=@('api','node','scripts/update-radar.ts','--run',$RunId,'--game',$Game,'--window',"$WindowDays",'--max',"$MaxMaterials",'--root','/update-runs','--stdin-credentials')
 if($CodexSearchFile){$dockerArgs+=@('--codex-search','/codex-search.json')}
 if($Publish){$dockerArgs+='--publish'}
 if($Focus){$dockerArgs+=@('--focus',$Focus)}
 # Credentials travel via stdin, never command arguments or study files.
 $payload | & docker @dockerArgs
 if($LASTEXITCODE -ne 0){throw '本轮更新未完成；中间记录已保留，可用同一 RunId 继续。旧批次不覆盖。'}
 if($Publish){node ../export-radar.mjs $RunId;if($LASTEXITCODE -ne 0){throw '已发布，但本地导出失败；网页不受影响。'}}
} finally {$payload=$null;$keys=$null;Pop-Location}
