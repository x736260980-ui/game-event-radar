import {buildMaterialOutcomes,validateResearch,type Research,type Mapping} from './contract.ts';

/** Global input errors remain fatal. Only independently invalid events are quarantined. */
export function isolateEvents(input:Research,mapping:Mapping,check:(mapping:Mapping,events:Research['events'])=>void=()=>{}){
  const subset=(events:Research['events'])=>{
    const ids=new Set(events.map(e=>e.id));
    const pick=(values:Record<string,any>)=>Object.fromEntries(Object.entries(values).filter(([id])=>ids.has(id)));
    const m:Mapping={categories:pick(mapping.categories),existing_stories:pick(mapping.existing_stories),existing_relations:pick(mapping.existing_relations??{})};
    const free=input.materials.filter(x=>x.decision!=='exclude'&&!events.some(e=>e.members.some(r=>r.material_id===x.id)));
    const data={...input,events,material_outcomes:buildMaterialOutcomes(input.materials,events,free.map(x=>({material_id:x.id,status:'pending' as const,reason:'保留材料，等待事件核查或归组。'})))};
    check(m,events);return validateResearch(data,m);
  };
  subset([]); // malformed materials, dates, run metadata must not become partial success
  if(new Set(input.events.map(e=>e.id)).size!==input.events.length)throw new Error('Duplicate event IDs cannot be isolated');
  const rejected:Array<{event:Research['events'][number];reason:string}>=[];
  const accepted=input.events.filter(event=>{
    try{subset([event]);return true;}catch(error){rejected.push({event,reason:error instanceof Error?error.message:String(error)});return false;}
  });
  const result=subset(accepted); // cross-event constraints still apply
  return {...result,rejected};
}
