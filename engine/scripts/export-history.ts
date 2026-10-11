// Read-only publication export. Dates come from stored source publication dates,
// not from the day the backfill was performed. No model, search or DB writes.
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {archiveEvents} from '../modules/game-radar/view.ts';
import type {ResearchBatch} from '../modules/game-radar/contract.ts';
const [start='2026-09-01',end='2026-10-11',out='../exports/history-20261011']=process.argv.slice(2);
if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||start>end)throw new Error('Invalid date range');
const response=await fetch('http://127.0.0.1:8788/api/site/radar/batches');
if(!response.ok)throw new Error('Published history is unavailable');
const {batches}=await response.json() as {batches:ResearchBatch[]};
const archive=archiveEvents(batches.filter(b=>b.run.retrospective||b.events.some(e=>e.dual_score?.status==='complete'))).filter(x=>x.event.dual_score?.status==='complete'&&x.event.decision!=='drop');
const items=archive.map(({batch,event})=>({event_id:event.public_id??event.id,local_id:event.id,title:event.title,summary:event.occurrence,decision:event.decision,batch:batch.run.id,
  recorded_at:batch.run.review_completed_at??batch.run.derived_on??batch.run.as_of,retrospective:!!batch.run.retrospective,
  scores:{deepseek:event.dual_score!.first.total,codex:event.dual_score!.second?.total,final:event.score},
  sources:[...new Map(batches.filter(b=>!b.run.id.startsWith('starrail-auto-')).flatMap(b=>b.events.filter(e=>(e.public_id??e.id)===(event.public_id??event.id)).flatMap(e=>e.members.filter(m=>m.relation!=='context').flatMap(member=>{const m=b.materials.find(m=>m.id===member.material_id);return m&&m.decision!=='exclude'?[{url:m.url,title:m.title,published_at:m.published_at,observed_on:m.observed_on,access:m.access,source_kind:m.source_kind,date_basis:m.date_basis??m.access_note,relation:member.relation}]:[];}))).map(m=>[m.url,m])).values()]
})).filter(x=>x.sources.some(s=>!s.published_at||(s.published_at>=start&&s.published_at<=end)));
const days=[] as Array<{date:string;records:Array<{event_id:string;local_id:string;batch:string;title:string;decision:string;sources:typeof items[number]['sources']}>}>;
for(let d=new Date(start+'T00:00:00Z');d.toISOString().slice(0,10)<=end;d.setUTCDate(d.getUTCDate()+1)){
 const date=d.toISOString().slice(0,10);days.push({date,records:items.flatMap(e=>{const sources=e.sources.filter(s=>s.published_at===date);return sources.length?[{event_id:e.event_id,local_id:e.local_id,batch:e.batch,title:e.title,decision:e.decision,sources}]:[]})});
}
const unknown=items.flatMap(e=>e.sources.filter(s=>!s.published_at).map(s=>({event_id:e.event_id,title:e.title,...s})));
mkdirSync(out,{recursive:true});
const data={exported_at:new Date().toISOString(),coverage:{start,end},basis:'按已保存、已核查的来源发布日期整理；同事件后续材料可出现在不同日期。不表示当时每日运行，也不保证覆盖全部事件。',days,events:items,unknown_dates:unknown};
writeFileSync(path.join(out,'history.json'),JSON.stringify(data,null,2)+'\n','utf8');
const labels={recommend:'推荐',watch:'观察',drop:'不研究'};
const lines=['# 星铁历史事件清单：'+start+'—'+end,'','本清单于2026年10月11日回溯整理。按来源发布日期列出，不把补录日当成事件日；空白日期只表示当前未补到可靠材料。不同日期出现同一事件，表示不同发布或后续，不是重复制造新事件。','','## 按日索引',''];
for(const day of days){lines.push('### '+day.date,'');if(!day.records.length)lines.push('当前未补到可归入事件的可靠材料。','');else for(const r of day.records){lines.push('- '+r.title+'（'+labels[r.decision as keyof typeof labels]+'） · [事件](http://127.0.0.1:8788/research?batch='+encodeURIComponent(r.batch)+'#event-'+r.local_id+')');for(const s of r.sources)lines.push('  - ['+s.title+']('+s.url+') · '+s.access);lines.push('');}}
lines.push('## 日期未知','');for(const s of unknown)lines.push('- '+s.title+' · ['+s.source_kind+'来源]('+s.url+') · '+String(s.date_basis));
lines.push('','## 数量与边界','',`覆盖${days.length}个日期，其中${days.filter(d=>d.records.length).length}个日期有记录；${items.length}个已完成双评分的非排除事件。数量不是完整覆盖率。`,`${unknown.length}条事件来源日期未知，未硬塞到日历。`,'','具体发生、完整来源和两次评分见同目录history.json。');
writeFileSync(path.join(out,'按日历史清单.md'),lines.join('\n')+'\n','utf8');
console.log(JSON.stringify({ok:true,days:days.length,days_with_records:days.filter(d=>d.records.length).length,events:items.length,unknown_dates:unknown.length,paid_calls:0}));
