import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {config,credential} from '@aihot/backend/config';
import {closeDb} from '@aihot/backend/db';
import {runUpdate} from '../modules/game-radar/update.ts';
import {safeMessage} from '../modules/game-radar/update-utils.ts';
import {claimDay,saveDay,readDay,beijingDay,nextSchedule,scheduleDirectory} from '../modules/game-radar/schedule.ts';

const credentialsFile=path.join(config.dataDir,'radar-search-credentials.json');
if(process.argv.includes('--configure')){
  const raw=JSON.parse(readFileSync(0,'utf8').replace(/^\uFEFF/,''));
  const keys={tavily:String(raw.tavily??'').trim(),firecrawl:String(raw.firecrawl??'').trim()};
  if(!keys.tavily)throw new Error('Tavily credential missing');
  mkdirSync(config.dataDir,{recursive:true});writeFileSync(credentialsFile,JSON.stringify(keys),{encoding:'utf8',mode:0o600});
  console.log(JSON.stringify({configured:true,tavily:!!keys.tavily,firecrawl:!!keys.firecrawl}));
  await closeDb();
}else{
  if(process.env.RADAR_SCHEDULES_ENABLED!=='true'||!config.modelCallsEnabled||process.env.COLLECT_ENABLED!=='true')throw new Error('Scheduler/model/collection switches must be explicitly enabled');
  const stored=existsSync(credentialsFile)?JSON.parse(readFileSync(credentialsFile,'utf8')):{};
  const keys={tavily:credential('collectors','TAVILY_API_KEY')??stored.tavily??'',firecrawl:credential('collectors','FIRECRAWL_API_KEY')??stored.firecrawl??''};
  if(!credential('models','LLM_API_KEY')&&!credential('models','DEEPSEEK_API_KEY'))throw new Error('Required DeepSeek credential missing; no calls started');
  // An interrupted process may have spent its budget: never automatically start it again.
  const previous=readDay(config.dataDir,beijingDay());
  if(previous?.status==='running'){saveDay(config.dataDir,{...previous,status:'interrupted',finished_at:new Date().toISOString(),error:'进程中断；当日不自动重试。过程和预算已保留。'});}
  mkdirSync(scheduleDirectory(config.dataDir),{recursive:true});
  writeFileSync(path.join(scheduleDirectory(config.dataDir),'config.json'),JSON.stringify({enabled:true,time:'08:00',timezone:'Asia/Shanghai',window_days:3,max_materials:30,web_cap:24,firecrawl_cap:3}),'utf8');
  console.log(JSON.stringify({scheduler:'enabled',timezone:'Asia/Shanghai',time:'08:00',next:nextSchedule()}));
  let busy=false,stopping=false;
  const tick=async()=>{
    writeFileSync(path.join(scheduleDirectory(config.dataDir),'heartbeat.json'),JSON.stringify({at:new Date().toISOString()}),'utf8');
    if(busy||stopping)return;
    const day=claimDay(config.dataDir);if(!day)return;
    busy=true;saveDay(config.dataDir,day);console.log(JSON.stringify({day:day.day,status:'running',run_id:day.run_id}));
    try{
      const result=await runUpdate({runId:day.run_id,game:'崩坏：星穹铁道',asOf:day.day,windowDays:3,maxMaterials:30,root:'/update-runs',publish:true},keys);
      saveDay(config.dataDir,{...day,status:'published',finished_at:new Date().toISOString(),materials:result.materials,events:result.events,recommendations:result.recommendations});
      console.log(JSON.stringify({day:day.day,status:'published',materials:result.materials,events:result.events,recommendations:result.recommendations}));
    }catch(e){
      const error=safeMessage(e,[keys.tavily,keys.firecrawl,credential('models','LLM_API_KEY')??'']);
      saveDay(config.dataDir,{...day,status:'failed',finished_at:new Date().toISOString(),error});console.error(JSON.stringify({day:day.day,status:'failed',error}));
    }finally{busy=false;if(stopping){await closeDb();process.exit(0);}}
  };
  const timer=setInterval(()=>void tick().catch(e=>console.error(safeMessage(e,[keys.tavily,keys.firecrawl]))),60000);
  for(const signal of ['SIGTERM','SIGINT'] as const)process.on(signal,()=>{stopping=true;clearInterval(timer);if(!busy)void closeDb().then(()=>process.exit(0));});
  await tick();
}
