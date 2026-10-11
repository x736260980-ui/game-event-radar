import type {Research} from './contract.ts';
import {materialOutcomes} from './contract.ts';
import {evidenceHash} from './scoring.ts';
export interface BoundaryCorrection {run_id:string;event_id:string;snapshot_hash:string;source_refs:string[];reason:string}
/** Corrections affect the current reading projection, never an immutable input or score. */
export function applyBoundaryCorrections(original:Research,corrections:BoundaryCorrection[]):Research{
 const relevant=corrections.filter(c=>c.run_id===original.run.id&&original.events.some(e=>e.id===c.event_id&&evidenceHash(original.materials,e)===c.snapshot_hash));
 if(!relevant.length)return original;
 const data=structuredClone(original),removed=new Set(relevant.map(c=>c.event_id));
 data.events=data.events.filter(e=>!removed.has(e.id));
 const used=new Set(data.events.flatMap(e=>e.members.map(m=>m.material_id)));
 const reasons=new Map(relevant.flatMap(c=>c.source_refs.map(ref=>[ref,c.reason] as const)).filter(([ref])=>!used.has(ref)));
 for(const material of data.materials)if(reasons.has(material.id)){material.decision='exclude';material.selection_reason=reasons.get(material.id)!;}
 data.material_outcomes=materialOutcomes(original).map(o=>reasons.has(o.material_id)?{material_id:o.material_id,status:'excluded',event_ids:[],reason:reasons.get(o.material_id)!}:{...o,status:o.status==='legacy_unassigned'?'pending':o.status,event_ids:o.event_ids.filter(id=>!removed.has(id))});
 data.limitations=[...data.limitations,...relevant.map(c=>`来源边界核查移除${c.event_id}：${c.reason}；原始输入及两次评分仍保留。`)];
 return data;
}
