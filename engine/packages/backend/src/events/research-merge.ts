// Explicit, evidence-reviewed reconciliation. No worker jobs or model requests.
import {sql} from '../db.ts';
import {audit} from '../audit.ts';
import {publishArticleTx} from '../publication/publish.ts';
import {digestReports,digestInputsHash} from '../publication/story-evidence.ts';
import {refreshResearchDigests} from './research-projection.ts';
import {continuationDigest} from '@aihot/game-radar/update-policy';
export async function mergeResearchStories(fromUuid:string,intoUuid:string,reason:string,reviewedUrls:string[]){
  if(fromUuid===intoUuid||reason.trim().length<20||reviewedUrls.length<2)throw new Error('A distinct pair and concrete evidence review are required');
  return sql.begin(async tx=>{
    const rows=await tx<{id:number;public_id:string;digest:string|null;merged_into:number|null;frame:Record<string,unknown>}[]>`
      SELECT id,public_id,digest,merged_into,frame FROM stories WHERE public_id IN (${fromUuid},${intoUuid}) ORDER BY id FOR UPDATE`;
    const from=rows.find(r=>r.public_id===fromUuid),into=rows.find(r=>r.public_id===intoUuid);
    if(!from||!into||into.merged_into||from.frame.provenance!=='external_agent'||into.frame.provenance!=='external_agent')throw new Error('Only active research stories can be reconciled');
    if(from.merged_into===into.id)return {reused:true,into:intoUuid};
    if(from.merged_into)throw new Error('Source story is already merged elsewhere');
    for(const r of rows){
      const [saved]=await tx<{digest:string;inputs_hash:string;article_ids:string[]}[]>`SELECT digest,inputs_hash,article_ids FROM story_digests WHERE story_id=${r.id} ORDER BY version DESC LIMIT 1`;
      const reports=await digestReports(tx,[r.id]);const ids=new Set(saved?.article_ids??[]);
      if(!saved&&!reports.length){r.digest=null;continue;}
      if(!r.digest||!saved||saved.digest!==r.digest||digestInputsHash(reports.filter(p=>ids.has(p.id)))!==saved.inputs_hash)throw new Error('Stale research digest cannot be silently revalidated by merging');
    }
    const urls=await tx<{story_id:number;url:string}[]>`SELECT DISTINCT f.story_id,a.url FROM facts f JOIN fact_articles fa ON fa.fact_id=f.id JOIN articles a ON a.id=fa.article_id WHERE f.story_id IN (${from.id},${into.id}) AND fa.role<>'mention'`;
    if(reviewedUrls.some(u=>!urls.some(x=>x.url===u))||!rows.every(r=>urls.some(x=>x.story_id===r.id&&reviewedUrls.includes(x.url))))throw new Error('Review URLs must cover both actual event roots');
    await tx`UPDATE facts SET story_id=${into.id},updated_at=now() WHERE story_id=${from.id}`;
    await tx`INSERT INTO story_signals(story_id,article_id,participant_key,source_id,kind,observed_at)
      SELECT ${into.id},article_id,participant_key,source_id,kind,observed_at FROM story_signals WHERE story_id=${from.id} ON CONFLICT(story_id,article_id) DO NOTHING`;
    await tx`DELETE FROM story_signals WHERE story_id=${from.id}`;
    await tx`UPDATE stories SET merged_into=${into.id},version=version+1,updated_at=now() WHERE id=${from.id}`;
    await tx`UPDATE story_aliases SET story_id=${into.id} WHERE story_id=${from.id}`;
    await tx`INSERT INTO story_aliases(public_id,story_id) VALUES(${fromUuid},${into.id}) ON CONFLICT DO NOTHING`;
    const decision=from.frame.decision==='recommend'||into.frame.decision==='recommend'?'recommend':into.frame.decision;
    const digest=continuationDigest(into.digest,from.digest??'旧批次仅有待核实线索，未提升为确认事实；请在原研究批次查看读取边界。',String(from.frame.batch));
    await tx`UPDATE stories SET digest=${digest},frame=${tx.json({...into.frame,decision,cumulative_digest:true} as never)},version=version+1,
      latest_at=greatest(latest_at,(SELECT latest_at FROM stories WHERE id=${from.id})),updated_at=now() WHERE id=${into.id}`;
    const reports=await digestReports(tx,[into.id]);for(const p of reports)await publishArticleTx(tx,p.id);
    await refreshResearchDigests(tx,[into.id],true);
    await audit('research-agent','radar.merge',`story:${from.id}`,reason,{from:fromUuid,into:intoUuid},{reviewed_urls:reviewedUrls,model_calls:0},{db:tx});
    return {reused:false,into:intoUuid,moved:reports.length};
  });
}
