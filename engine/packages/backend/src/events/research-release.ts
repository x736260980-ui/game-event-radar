import type {Tx} from '../db.ts';
import {audit} from '../audit.ts';
import {repairSyntheticResearchReleaseTx} from '../publication/publish.ts';

/** Narrow repair for our former synthetic-noon release, never a withdrawal override. */
export async function repairSyntheticResearchRelease(db:Tx,batch:string,now=new Date()) {
  const rows=await repairSyntheticResearchReleaseTx(db,batch,now);
  if(rows.length)await audit('research-agent','radar.release_repair',`radar-batch:${batch}`,
    'Clamp synthetic same-day noon release to actual repair time; no change to source dates or research',
    rows,{released_at:now.toISOString(),article_ids:rows.map(r=>r.article_id),api_calls:0},{db});
  return rows.length;
}
