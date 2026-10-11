# Only explicit local configuration; no reads from the author's personal app/plugin folders.
function Get-RadarSearchCredentials {
    $result=@{tavily=$env:TAVILY_API_KEY;firecrawl=$env:FIRECRAWL_API_KEY}
    $envPath=Join-Path $PSScriptRoot 'engine/.env'
    if(Test-Path -LiteralPath $envPath){
        foreach($line in (Get-Content -LiteralPath $envPath -Encoding UTF8)){
            if($line -match '^\s*(TAVILY_API_KEY|FIRECRAWL_API_KEY)\s*=\s*(.*?)\s*$'){
                $name=if($Matches[1] -eq 'TAVILY_API_KEY'){'tavily'}else{'firecrawl'}
                if(-not $result[$name]){$result[$name]=$Matches[2].Trim('"',"'")}
            }
        }
    }
    return $result
}
