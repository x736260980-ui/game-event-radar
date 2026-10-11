import type {ResearchBatch,MaterialOutcome} from './contract.ts';
export const materialLabels={grouped:'已归入事件',pending:'待归组',excluded:'已排除'} as const;
// Presentation-only name correction. Stored evidence and review hashes are never rewritten.
export function displayEvent(event:ResearchBatch['events'][number]){
  const name=(s:string)=>s.replaceAll('珍珠','Pearl').replaceAll('海瑟音','Hyacine');
  return {...event,title:name(event.title),occurrence:name(event.occurrence),research_question:name(event.research_question),keywords:event.keywords.map(name),decision_reason:name(event.decision_reason)};
}
export function displayOutcome(o:MaterialOutcome){
  if(o.status==='grouped'||o.event_ids.length)return 'grouped' as const;
  if(o.status==='excluded')return 'excluded' as const;
  if(o.status==='not_pursued'&&/无关|无直接关联|重复|噪声|广告|不值得|无研究价值|旧闻无新|旧版本.*无.*近期进展|没有新增|无实质.*内容|虚构\/娱乐|常规.*(?:签到|福利)|仅.*(?:周边|促销)/.test(o.reason))return 'excluded' as const;
  return 'pending' as const;
}
export function visibleBatches(batches:ResearchBatch[]){return batches.filter(b=>!b.run.id.startsWith('starrail-auto-'));}
export function archiveDates(batches:ResearchBatch[]){return [...new Set(visibleBatches(batches).flatMap(b=>b.materials.flatMap(m=>m.published_at?[m.published_at]:[])))].sort().reverse();}
export function archiveEvents(batches:ResearchBatch[]){
  const map=new Map<string,{batch:ResearchBatch;event:ResearchBatch['events'][number]}>();
  for(const batch of visibleBatches(batches).sort((a,b)=>Number(b.events.some(e=>e.dual_score?.status==='complete'))-Number(a.events.some(e=>e.dual_score?.status==='complete'))||b.run.as_of.localeCompare(a.run.as_of))){
    for(const event of batch.events){const key=event.public_id??`${event.title}|${event.event_date??''}`;if(!map.has(key))map.set(key,{batch,event:!event.dual_score&&event.decision==='recommend'?{...event,decision:'watch',decision_reason:'历史建议待独立复评。'+event.decision_reason}:event});}
  }
  return [...map.values()].map(item=>({...item,event:displayEvent(item.event)}));
}
export function archiveMaterials(batches:ResearchBatch[]){
  const map=new Map<string,{batch:ResearchBatch;material:ResearchBatch['materials'][number];outcome:MaterialOutcome}>();
  for(const batch of visibleBatches(batches)){for(const material of batch.materials){if(map.has(material.url))continue;const outcome=batch.material_outcomes.find(o=>o.material_id===material.id);if(outcome)map.set(material.url,{batch,material,outcome});}}
  return [...map.values()];
}

/** Representative reading is separate from the event's formal research verdict. */
export function featuredMaterials(batches:ResearchBatch[]){
  const archive=archiveMaterials(batches),picked=new Map<string,typeof archive[number]>();
  for(const {batch,event} of archiveEvents(batches)){
    if(event.decision==='drop')continue;
    const ranked=event.members.filter(m=>m.relation!=='context').flatMap(member=>{
      const material=batch.materials.find(m=>m.id===member.material_id);
      const outcome=batch.material_outcomes.find(o=>o.material_id===member.material_id);
      if(!material||!outcome||material.decision==='exclude'||displayOutcome(outcome)==='excluded'||material.access!=='body')return [];
      return [{batch,material,outcome,rank:Number(member.relation==='same_occurrence')*100+Number(material.source_kind==='official')*20+Number(material.decision==='use')*10}];
    }).sort((a,b)=>b.rank-a.rank);
    if(ranked[0]){const {rank,...entry}=ranked[0];picked.set(entry.material.url,entry);}
  }
  return [...picked.values()];
}
