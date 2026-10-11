import {mkdirSync,openSync,closeSync,writeFileSync,readFileSync,existsSync,renameSync} from 'node:fs';
import path from 'node:path';

export function beijingDay(now=new Date()):string {
  const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  return ['year','month','day'].map(k=>p.find(x=>x.type===k)!.value).join('-');
}
export function scheduleTime(day:string){return new Date(`${day}T08:00:00+08:00`);}
export function dueDay(now=new Date()):string|null {const day=beijingDay(now);return now>=scheduleTime(day)?day:null;}
export function nextSchedule(now=new Date()):string {
  const at=scheduleTime(beijingDay(now));if(now>=at)at.setUTCDate(at.getUTCDate()+1);return at.toISOString();
}
export interface DailyState {day:string;run_id:string;status:'running'|'published'|'failed'|'interrupted';started_at:string;finished_at?:string;error?:string;materials?:number;events?:number;recommendations?:number;manual_resumes?:number}
export function scheduleDirectory(dataDir:string){return path.join(dataDir,'radar-schedule');}
export function claimDay(dataDir:string,now=new Date()):DailyState|null {
  const day=dueDay(now);if(!day)return null;
  const dir=scheduleDirectory(dataDir);mkdirSync(path.join(dir,'days'),{recursive:true});
  const file=path.join(dir,'days',`${day}.json`);
  let fd:number;try{fd=openSync(file,'wx',0o600);}catch(e){if((e as NodeJS.ErrnoException).code==='EEXIST')return null;throw e;}
  const state:DailyState={day,run_id:`starrail-daily-${day.replaceAll('-','')}-v13`,status:'running',started_at:now.toISOString()};
  try{writeFileSync(fd,JSON.stringify(state,null,2)+'\n','utf8');}finally{closeSync(fd);}
  return state;
}
export function saveDay(dataDir:string,state:DailyState){
  const dir=scheduleDirectory(dataDir),file=path.join(dir,'days',`${state.day}.json`);
  const dayTmp=file+`.${process.pid}.tmp`;writeFileSync(dayTmp,JSON.stringify(state,null,2)+'\n','utf8');renameSync(dayTmp,file);
  const tmp=path.join(dir,`status-${process.pid}.tmp`);writeFileSync(tmp,JSON.stringify(state,null,2)+'\n','utf8');renameSync(tmp,path.join(dir,'status.json'));
}
export function readDay(dataDir:string,day:string):DailyState|null {
  const file=path.join(scheduleDirectory(dataDir),'days',`${day}.json`);
  if(!existsSync(file))return null;
  try{return JSON.parse(readFileSync(file,'utf8'));}catch{return {day,run_id:`starrail-daily-${day.replaceAll('-','')}-v7`,status:'interrupted',started_at:'',error:'当日领取记录不完整；为避免重复付费，不自动重跑。'};}
}
