import type {ResearchBatch} from './contract.ts';

/** Reprocessing an old announcement does not make it today's news. */
export function hasRecentEvidence(batch:ResearchBatch,event:ResearchBatch['events'][number],today:string){
 const cutoff=Date.parse(today+'T00:00:00Z');
 return event.members.some(member=>{
  if(member.relation==='context')return false;
  const source=batch.materials.find(m=>m.id===member.material_id);
  if(!source?.published_at||source.decision==='exclude'||source.access!=='body')return false;
  const age=(cutoff-Date.parse(source.published_at+'T00:00:00Z'))/86400000;
  return age>=0&&age<3;
 });
}
