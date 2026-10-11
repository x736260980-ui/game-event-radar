import {materialOutcomes,type Research,type ResearchBatch,type Mapping} from './contract.ts';
import {canonicalUrl} from './update-utils.ts';
import {displayOutcome} from './view.ts';
export type AttemptKind='model'|'deepseek_search'|'tavily'|'firecrawl';
export type Attempt={kind:AttemptKind;stage:string;status:'reserved'|'complete'|'failed';receipt_id?:number;reused?:boolean;usage?:Record<string,unknown>|null;error?:string};
/** Standalone score import gets at most one retry, including resumed processes. */
export function standaloneScoreAttempt(attempts:Attempt[],receiptStatus?:string){
  const previous=attempts.filter(a=>a.stage==='deepseek_independent_score');
  if(previous.length>=2)throw new Error('独立初评的一次修复已用完；保留失败，不继续调用');
  if(previous.length){const last=previous.at(-1)!;
    if(last.status!=='failed'||!last.receipt_id||receiptStatus!=='failed')throw new Error('上次评分回执不确定，不能自动重复购买');
  }
  return previous.length;
}
export function reserveAttempt(attempts:Attempt[],kind:AttemptKind,stage:string):Attempt {
  const count=(k:AttemptKind)=>attempts.filter(a=>a.kind===k).length;
  if(kind!=='model'&&count('tavily')+count('firecrawl')+count('deepseek_search')>=24)throw new Error('Per-run web request cap reached (including failed attempts)');
  if(kind==='firecrawl'&&count(kind)>=3)throw new Error('Per-run Firecrawl cap reached');
  const a:Attempt={kind,stage,status:'reserved'};attempts.push(a);return a;
}
/** Each stage has one persistent repair slot, also when resuming a task. */
export function claimOutputRepair(stages:{repairs?:Record<string,boolean>},_attempts:Attempt[],stage='output'):boolean{
  stages.repairs??={};if(stages.repairs[stage])return false;
  stages.repairs[stage]=true;return true;
}
export function repairTokenBudget(current:number,error:unknown):number{
  return /finish_reason=length|output token limit reached/.test(String(error))?Math.min(16000,Math.max(current+1500,current*2)):current;
}
const tokens=(text:string)=>new Set((text.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu)??[]).flatMap(w=>w.length>2?[...w].slice(0,-1).map((c,i)=>c+[...w][i+1]):[w]));
export interface Continuation {public_id:string;title:string;occurrence:string;date:string|null;source_urls:string[];decision:string}
/** This is candidate retrieval, not a verdict that two events are the same. */
export function continuationCandidates(batches:ResearchBatch[],materials:Research['materials'],max=8):Continuation[]{
  const query=tokens(materials.filter(m=>m.decision!=='exclude').map(m=>m.title+' '+m.summary).join(' '));
  const urls=new Set(materials.map(m=>canonicalUrl(m.url)));const unique=new Map<string,Continuation>();
  for(const b of batches)for(const e of b.events){if(!e.public_id||!e.members.length||unique.has(e.public_id))continue;
    unique.set(e.public_id,{public_id:e.public_id,title:e.title,occurrence:e.occurrence,date:e.event_date,decision:e.decision,
      source_urls:e.members.filter(m=>m.relation!=='context').map(m=>b.materials.find(x=>x.id===m.material_id)?.url).filter((u):u is string=>!!u)});
  }
  return [...unique.values()].map(c=>({c,score:c.source_urls.some(u=>urls.has(canonicalUrl(u)))?1000:[...tokens(c.title+' '+c.occurrence)].filter(t=>query.has(t)).length}))
    .filter(x=>x.score>=3).sort((a,b)=>b.score-a.score||String(b.c.date).localeCompare(String(a.c.date))).slice(0,max).map(x=>x.c);
}
export type ContinuationDetail={relation:'same_occurrence'|'development'|'uncertain';reason:string};
export function validateContinuations(mapping:Mapping,details:Record<string,ContinuationDetail>,candidates:Continuation[]){
  const allowed=new Set(candidates.map(c=>c.public_id));
  for(const [id,uuid] of Object.entries(mapping.existing_stories)){
    if(!allowed.has(uuid))throw new Error(`Unknown continuation UUID: ${id}`);
    if(!details[id]||details[id].relation==='uncertain'||details[id].reason.trim().length<8)throw new Error(`Unverified continuation: ${id}`);
  }
}
export function compactMaterial(m:Research['materials'][number]){
  return {id:m.id,title:m.title,source_kind:m.source_kind,origin_group:m.origin_group,published_at:m.published_at,
    access:m.access,decision:m.decision,summary:m.summary,excerpt:m.excerpt,selection_reason:m.selection_reason};
}
/** An event membership / explicit exclusion already determines disposition. */
export function normalizeUnassigned(materials:Research['materials'],events:Research['events'],unassigned:Array<{material_id:string;status:string;reason:string}>){
  const assigned=new Set(events.flatMap(e=>e.members.map(m=>m.material_id)));
  const excluded=new Set(materials.filter(m=>m.decision==='exclude').map(m=>m.id));
  return unassigned.filter(u=>!assigned.has(u.material_id)&&!excluded.has(u.material_id));
}
export function eventCategories(events:Array<{id:string;category:string}>){return Object.fromEntries(events.map(e=>[e.id,e.category]));}
export function eventContinuations(events:Array<{id:string;previous_event:{public_id:string;relation:ContinuationDetail['relation'];reason:string}|null}>){
  // An explicitly uncertain relationship is retained in the analysis, not used to merge IDs.
  return {existing_stories:Object.fromEntries(events.filter(e=>e.previous_event&&e.previous_event.relation!=='uncertain').map(e=>[e.id,e.previous_event!.public_id])),
    details:Object.fromEntries(events.filter(e=>e.previous_event).map(e=>[e.id,{relation:e.previous_event!.relation,reason:e.previous_event!.reason}]))};
}
export const isModelAttempt=(a:Attempt)=>a.kind==='model'||a.kind==='deepseek_search';
export function usageSummary(attempts:Attempt[]){return {attempts,model_attempts:attempts.filter(isModelAttempt).length,web_attempts:attempts.filter(a=>a.kind!=='model').length,
  deepseek_search_attempts:attempts.filter(a=>a.kind==='deepseek_search').length,
  firecrawl_attempts:attempts.filter(a=>a.kind==='firecrawl').length,actual_tokens:attempts.filter(a=>isModelAttempt(a)&&!a.reused).reduce((n,a)=>n+Number(a.usage?.total_tokens??0),0),
  token_reporting_complete:attempts.filter(isModelAttempt).every(a=>a.reused||typeof a.usage?.total_tokens==='number'),reused:attempts.filter(a=>a.reused).length,cost:null};}
/** Independent prose is not a second source of truth: derive it from final validated data. */
export function finalReview(data:Pick<Research,'materials'|'events'|'material_outcomes'>){
  const m=data.materials,e=data.events;
  const outcomes=materialOutcomes(data);
  return {verdict:`保留 ${m.length} 条材料，归组 ${e.length} 个事件；推荐 ${e.filter(x=>x.decision==='recommend').length} 个。推荐是研究建议，不代表来源主张已获证实。`,
    material_disposition:`按去重材料计：已归入事件 ${outcomes.filter(x=>displayOutcome(x)==='grouped').length} 条；待归组 ${outcomes.filter(x=>displayOutcome(x)==='pending').length} 条；已排除 ${outcomes.filter(x=>displayOutcome(x)==='excluded').length} 条。`,
    useful:e.length?e.map(x=>`${x.title}：${x.decision_reason}`):['没有合格候选，如实输出空结果。'],
    failures:[`正文片段 ${m.filter(x=>x.access==='body').length} 条；仅摘要 ${m.filter(x=>x.access==='excerpt_only').length} 条；无法读取 ${m.filter(x=>x.access==='unavailable').length} 条。`,
      ...e.flatMap(x=>x.unknowns.map(u=>`${x.title}：${u}`))],
    next_steps:[]};
}
export function continuationDigest(previous:string|null,next:string,batch:string){
  return previous?`${previous}\n\n—— 本次补充（${batch}；引用编号仅属于本批次，原证据不撤回）——\n\n${next}`:next;
}
