import { readFileSync,existsSync } from 'node:fs';
import path from 'node:path';
import { credential,config } from '@aihot/backend/config';
import { closeDb } from '@aihot/backend/db';
import { runUpdate } from '../modules/game-radar/update.ts';
import { safeMessage } from '../modules/game-radar/update-utils.ts';
import {beijingDay,readDay,saveDay,type DailyState} from '../modules/game-radar/schedule.ts';
const args=process.argv.slice(2);const arg=(k:string,fallback='')=>args.includes(k)?args[args.indexOf(k)+1]:fallback;
let keys={tavily:'',firecrawl:''};
let daily:DailyState|null=null;
try{
  if(!config.modelCallsEnabled||process.env.COLLECT_ENABLED!=='true')throw new Error('Explicit manual model/collection switches are required');
  if(args.includes('--stdin-credentials')){const raw=JSON.parse(readFileSync(0,'utf8').replace(/^\uFEFF/,''));keys={tavily:String(raw.tavily??''),firecrawl:String(raw.firecrawl??'')};}
  else {const file=path.join(config.dataDir,'radar-search-credentials.json'),stored=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{};
    keys={tavily:credential('collectors','TAVILY_API_KEY')??stored.tavily??'',firecrawl:credential('collectors','FIRECRAWL_API_KEY')??stored.firecrawl??''};}
  const today=beijingDay();
  const codexFile=arg('--codex-search');
  const codexSearch=codexFile?JSON.parse(readFileSync(codexFile,'utf8').replace(/^\uFEFF/,'')):undefined;
  const days=Number(arg('--window','3'));if(days!==3&&days!==7&&days!==14)throw new Error('Window must be 3, 7 or 14');
  const existing=readDay(config.dataDir,today);
  if(existing?.run_id===arg('--run')&&args.includes('--publish')){
    daily={...existing,status:'running',manual_resumes:(existing.manual_resumes??0)+1};delete daily.error;delete daily.finished_at;saveDay(config.dataDir,daily);
  }
  const result=await runUpdate({runId:arg('--run'),game:arg('--game','崩坏：星穹铁道'),asOf:today,windowDays:days,maxMaterials:Number(arg('--max','12')),root:arg('--root','/update-runs'),publish:args.includes('--publish'),...(arg('--focus')?{focus:arg('--focus')}: {}),...(codexSearch?{codexSearch}:{})},keys);
  if(daily)saveDay(config.dataDir,{...daily,status:'published',finished_at:new Date().toISOString(),materials:result.materials,events:result.events,recommendations:result.recommendations});
  console.log(JSON.stringify(result));
}catch(e){const error=safeMessage(e,[keys.tavily,keys.firecrawl,process.env.LLM_API_KEY??'']);if(daily)saveDay(config.dataDir,{...daily,status:'failed',finished_at:new Date().toISOString(),error});console.error(JSON.stringify({ok:false,error}));process.exitCode=1;}
finally{keys={tavily:'',firecrawl:''};await closeDb();}
