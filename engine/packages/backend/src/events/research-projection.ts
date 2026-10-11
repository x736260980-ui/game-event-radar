import type { Db } from "@aihot/backend/db";
import { digestInputsHash, digestReports } from "@aihot/backend/publication/story-evidence";
import type {Research} from '@aihot/game-radar/contract';
import {researchDigest} from './research-digest.ts';
import {audit} from '../audit.ts';

/** Save only a digest already written by the research Agent; never call a model. */
export async function refreshResearchDigests(db: Db, storyIds: number[], newlyWritten = false, research?:Research) {
  let updated = 0;
  for (const id of storyIds) {
    const [story] = await db<{id:number; digest:string|null; version:number; latest:string|null; frame:{batch:string;event_id:string;cumulative_digest?:boolean}}[]>`
      SELECT id,digest,version,latest,frame FROM stories WHERE id=${id} AND merged_into IS NULL
      AND frame->>'provenance'='external_agent' FOR UPDATE`;
    if (!story?.digest) continue;
    const reports = await digestReports(db,[id]);
    if (!reports.length) continue;
    const inputsHash = digestInputsHash(reports);
    const [last] = await db<{digest:string; inputs_hash:string|null}[]>`SELECT digest,inputs_hash FROM story_digests WHERE story_id=${id} ORDER BY version DESC LIMIT 1`;
    let rerendered=false;
    if(research&&story.frame.batch===research.run.id&&!story.frame.cumulative_digest){
      // Presentation-only rebuild is permitted only while the last snapshot's
      // evidence is unchanged. It cannot bless corrected/withdrawn evidence.
      if(last&&!newlyWritten&&last.inputs_hash!==inputsHash)continue;
      const event=research.events.find(e=>e.id===story.frame.event_id);
      if(!event)continue;
      const rows=await db<{material_id:string}[]>`SELECT raw->'material'->>'id' AS material_id FROM articles WHERE id=ANY(${reports.map(r=>r.id)}::text[])`;
      const text=researchDigest(research,event,new Set(rows.map(r=>r.material_id)));
      if(text!==story.digest){
        await db`UPDATE stories SET digest=${text} WHERE id=${id}`;
        story.digest=text;
        rerendered=true;
      }
    }
    if (last?.digest === story.digest && last.inputs_hash === inputsHash) {if(rerendered)updated++;continue;}
    // Repair only the missing initial snapshot. Changed evidence must never silently
    // revalidate an old digest; a new explicit research import writes a new digest.
    if (last && !newlyWritten && !research) continue;
    const version = story.version + 1;
    const latest = [...reports].sort((a,b)=>b.at.getTime()-a.at.getTime())[0]!.title;
    await db`INSERT INTO story_digests (story_id,version,digest,latest,article_ids,inputs_hash,receipt_id)
      VALUES (${id},${version},${story.digest},${latest},${reports.map(r=>r.id)},${inputsHash},NULL)`;
    await db`UPDATE stories SET version=${version},digest_updated_at=now(),latest=${latest},updated_at=now() WHERE id=${id}`;
    updated++;
  }
  return updated;
}

/** Re-render immutable saved research, not a new semantic judgment or API call. */
export async function renderStoredResearch(db:Db,batchId:string){
  const [row]=await db<{after:{research:Research}}[]>`SELECT after FROM audit_log WHERE subject=${`radar-batch:${batchId}`} AND action IN ('radar.import','radar.snapshot') AND after->'research' IS NOT NULL ORDER BY id DESC LIMIT 1`;
  if(!row)throw new Error('No immutable research snapshot for this batch');
  const rows=await db<{id:number}[]>`SELECT id FROM stories WHERE frame->>'provenance'='external_agent' AND frame->>'batch'=${batchId} AND merged_into IS NULL`;
  const updated=await refreshResearchDigests(db,rows.map(r=>Number(r.id)),false,row.after.research);
  if(updated)await audit('research-agent','radar.render',`radar-batch:${batchId}`,'Re-render unchanged evidence with citation labels; no new research or model calls',null,{updated,api_calls:0},{db});
  return updated;
}
