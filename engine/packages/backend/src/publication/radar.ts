// Immutable research decisions are historical snapshots, not a live news claim.
// Read source visibility again so withdrawal also removes source links and dependent claims.
import { sql } from "../db.ts";
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {config} from '../config.ts';
import {beijingDay,nextSchedule,scheduleDirectory} from '../../../../modules/game-radar/schedule.ts';
import {recommendationSupport} from '@aihot/game-radar/contract';
import {weightedScore} from '../../../../modules/game-radar/scoring.ts';
import {hasRecentEvidence} from '../../../../modules/game-radar/attention.ts';
import { storyReportCondition } from "./scope.ts";
import {materialOutcomes,type Research,type ResearchBatch} from "@aihot/game-radar/contract";
import {applyBoundaryCorrections,type BoundaryCorrection} from '../../../../modules/game-radar/corrections.ts';
export async function radarOverview(now=new Date()){
  const dir=scheduleDirectory(config.dataDir);
  const read=(file:string)=>{try{return JSON.parse(readFileSync(path.join(dir,file),'utf8'));}catch{return null;}};
  const settings=read('config.json'),heartbeat=read('heartbeat.json'),state=read('status.json');
  const active=!!heartbeat?.at&&now.getTime()-Date.parse(heartbeat.at)<180000;
  const batches=await researchBatches(now),today=beijingDay(now);
  const root=batches.find(b=>b.run.as_of===today&&!b.run.retrospective&&!b.run.parent_run_id&&!b.run.id.startsWith('starrail-auto-'));
  const batch=root?(batches.find(b=>b.run.parent_run_id===root.run.id)??root):undefined;
  const attention=batch?batch.events.filter(e=>e.decision!=='drop'&&hasRecentEvidence(batch,e,today)).map(e=>({...e,independent_sources:recommendationSupport(batch.materials,e).independent_sources})).sort((a,b)=>b.independent_sources-a.independent_sources||b.score-a.score).slice(0,5).map(e=>({id:e.id,title:e.title,decision:e.decision,score:e.score,independent_sources:e.independent_sources})):[];
  return {today,batch_id:batch?.run.id??null,attention,schedule:{enabled:settings?.enabled===true,active,time:'08:00',timezone:'Asia/Shanghai',next:nextSchedule(now),
    status:state?.status??'waiting',day:state?.day??null,run_id:state?.run_id??null,error:state?.error??null}};
}
export async function researchBatches(now=new Date()):Promise<ResearchBatch[]> {
  const corrections=await sql<{after:BoundaryCorrection}[]>`SELECT after FROM audit_log WHERE action='radar.boundary_exclusion' ORDER BY id`;
  const rows=await sql<{after:{research:Research;material_ids:Record<string,string>;result:{stories:Array<{event_id:string;public_id:string}>}}}[]>`
    SELECT DISTINCT ON(subject) after FROM audit_log WHERE action IN ('radar.import','radar.snapshot') AND after ? 'research' ORDER BY subject,id DESC`;
  const ids=[...new Set(rows.flatMap(r=>Object.values(r.after.material_ids??{})))];
  const publicRows=ids.length?await sql<{article_id:string}[]>`SELECT p.article_id FROM publications p JOIN sources s ON s.id=p.source_id WHERE p.article_id=ANY(${ids}::text[]) AND ${storyReportCondition(now)}`:[];
  const visible=new Set(publicRows.map(r=>r.article_id));
  return rows.map(({after})=>{
    const d=applyBoundaryCorrections(after.research,corrections.map(c=>c.after));
    const materials=d.materials.filter(m=>visible.has(after.material_ids[m.id]!));
    const available=new Set(materials.map(m=>m.id));
    const events=d.events.map(e=>{
      const scores=e.scores;
      const dates=e.members.filter(m=>m.relation==='same_occurrence').map(m=>d.materials.find(x=>x.id===m.material_id)?.published_at).filter((v):v is string=>!!v).sort();
      return {...e,confirmed_facts:e.confirmed_facts.filter(f=>f.refs.every(r=>available.has(r))),source_claims:e.source_claims.filter(f=>f.refs.every(r=>available.has(r))),
        dual_score:e.members.every(m=>available.has(m.material_id))&&e.dual_score?{...e.dual_score,first:{...e.dual_score.first,total:weightedScore(e.dual_score.first.scores)},second:e.dual_score.second?{...e.dual_score.second,total:weightedScore(e.dual_score.second.scores)}:null}:undefined,
        score_visibility:e.dual_score&&!e.members.every(m=>available.has(m.material_id))?'evidence_withdrawn':undefined,
        members:e.members.filter(m=>available.has(m.material_id)),score:scores.impact.value*3+scores.novelty.value*2+scores.evidence.value*2+scores.audience.value*2+scores.investigability.value,
        event_date:dates[0]??null,public_id:after.result.stories.find(s=>s.event_id===e.id)?.public_id??null};
    });
    // Excerpts are deliberately omitted at this public endpoint; originals stay in local research files.
    const material_outcomes=materialOutcomes(d).filter(o=>available.has(o.material_id));
    return {run:d.run,materials:materials.map(m=>({...m,excerpt:""})),events,material_outcomes,limitations:d.limitations,search_log:[],original_material_count:d.materials.length,hidden_material_count:d.materials.length-materials.length,api_calls:d.run.model_api_calls??0};
  }).sort((a,b)=>b.run.as_of.localeCompare(a.run.as_of)||(b.run.derived_on??b.run.as_of).localeCompare(a.run.derived_on??a.run.as_of)||b.run.id.localeCompare(a.run.id));
}
