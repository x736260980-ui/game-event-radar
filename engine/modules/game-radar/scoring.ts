import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {Research} from './contract.ts';

export const SCORE_WEIGHTS={impact:3,novelty:2,evidence:2,audience:2,investigability:1} as const;
const dimension=z.object({value:z.number().int().min(0).max(10),reason:z.string().min(1)}).strict();
export const ScoresSchema=z.object({impact:dimension,novelty:dimension,evidence:dimension,audience:dimension,investigability:dimension}).strict();
// A flat list is easier for providers to close correctly than five nested score objects.
// Only the transport shape changes; evidence, dimensions, weights and stored scores do not.
export const IndependentReviewWireSchema=z.object({items:z.array(z.object({id:z.string(),ratings:z.array(z.object({dimension:z.enum(['impact','novelty','evidence','audience','investigability']),value:z.number().int().min(0).max(10),reason:z.string().min(1)}).strict()).length(5),decision:z.enum(['recommend','watch','drop']),reason:z.string().min(1),source_refs:z.array(z.string()).min(1)}).strict()).max(8)}).strict().superRefine((data,ctx)=>{
 for(const [i,item] of data.items.entries())if(new Set(item.ratings.map(r=>r.dimension)).size!==5)ctx.addIssue({code:'custom',path:['items',i,'ratings'],message:'Each dimension must appear exactly once'});
});
export function firstReviewsFromWire(input:unknown){
 const wire=IndependentReviewWireSchema.parse(input);
 return {items:wire.items.map(({ratings,...review})=>({...review,scores:ScoresSchema.parse(Object.fromEntries(ratings.map(({dimension,...score})=>[dimension,score])))}))};
}
export const ScoreReviewSchema=z.object({reviewer:z.enum(['deepseek','codex']),model:z.string().min(1),recorded_at:z.string().datetime(),receipt_id:z.number().int().positive().nullable(),
  blind:z.boolean(),scores:ScoresSchema,total:z.number().int().min(0).max(100).optional(),decision:z.enum(['recommend','watch','drop']),reason:z.string().min(1),source_refs:z.array(z.string()).min(1)}).strict().superRefine((v,ctx)=>{if(v.total!==undefined&&v.total!==weightedScore(v.scores))ctx.addIssue({code:'custom',path:['total'],message:'Score total mismatch'});});
export const DualScoreSchema=z.object({snapshot_hash:z.string().regex(/^[a-f0-9]{64}$/),first:ScoreReviewSchema,second:ScoreReviewSchema.nullable(),
  status:z.enum(['pending','complete']),resolution:z.object({decision:z.enum(['recommend','watch','drop']),reason:z.string().min(1)}).nullable()}).strict();
export type ScoreReview=z.infer<typeof ScoreReviewSchema>;
export type DualScore=z.infer<typeof DualScoreSchema>;
export function weightedScore(scores:z.infer<typeof ScoresSchema>){return Object.entries(SCORE_WEIGHTS).reduce((sum,[k,w])=>sum+scores[k as keyof typeof SCORE_WEIGHTS].value*w,0);}
function canonical(v:unknown):string {if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';if(v&&typeof v==='object')return '{'+Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>JSON.stringify(k)+':'+canonical(x)).join(',')+'}';return JSON.stringify(v)??'null';}
/** Both reviewers see this exact packet, without either reviewer's score or verdict. */
export function evidencePacket(materials:Research['materials'],event:Research['events'][number]){
  const ids=new Set(event.members.map(m=>m.material_id));
  return {id:event.id,title:event.title,occurrence:event.occurrence,research_question:event.research_question,members:event.members,
    ...(event.qualification_version?{qualification_version:event.qualification_version,kind:event.kind??'event',player_discussion:event.player_discussion??'',related_events:event.related_events??[]}:{}),
    confirmed_facts:event.confirmed_facts,source_claims:event.source_claims,unknowns:event.unknowns,platforms:event.platforms,keywords:event.keywords,
    materials:materials.filter(m=>ids.has(m.id)).map(m=>({id:m.id,title:m.title,url:m.url,source_kind:m.source_kind,origin_group:m.origin_group,published_at:m.published_at,
      access:m.access,...(event.qualification_version?{}:{decision:m.decision}),access_note:m.access_note,summary:m.summary,excerpt:m.excerpt,...(event.qualification_version?{published_basis:m.date_basis??m.access_note,revised_at:m.revised_at??null,discovered_at:m.discovered_at??m.observed_on}:{} )}))};
}
export function evidenceHash(materials:Research['materials'],event:Research['events'][number]){return createHash('sha256').update(canonical(evidencePacket(materials,event))).digest('hex');}
export function pendingScore(materials:Research['materials'],event:Research['events'][number],first:ScoreReview):DualScore{
  return {snapshot_hash:evidenceHash(materials,event),first:ScoreReviewSchema.parse({...first,total:weightedScore(first.scores)}),second:null,status:'pending',resolution:null};
}
export function resolveScores(first:ScoreReview,second:ScoreReview,eligible:boolean){
  const decision=first.decision==='drop'&&second.decision==='drop'?'drop':first.decision==='recommend'&&second.decision==='recommend'&&eligible?'recommend':'watch';
  const reason=first.decision!==second.decision?`两次判断不同：DeepSeek为${first.decision}，Codex为${second.decision}；暂列观察。${second.reason}`:
    decision==='recommend'?`两次均建议研究，来源资格通过。${second.reason}`:decision==='drop'?`两次均不建议研究。${second.reason}`:`两次判断为观察，或推荐所需来源尚不足。${second.reason}`;
  const scores=Object.fromEntries(Object.keys(SCORE_WEIGHTS).map(k=>{const key=k as keyof typeof SCORE_WEIGHTS,a=first.scores[key],b=second.scores[key];return [key,{value:Math.min(a.value,b.value),reason:a.value<=b.value?a.reason:b.reason}];})) as z.infer<typeof ScoresSchema>;
  return {decision,reason,scores} as const;
}
export function validateDualScore(materials:Research['materials'],event:Research['events'][number],eligible:boolean){
  const pair=DualScoreSchema.parse(event.dual_score);
  if(pair.first.reviewer!=='deepseek'||pair.first.blind!==true)throw new Error(`Invalid first reviewer: ${event.id}`);
  if(pair.snapshot_hash!==evidenceHash(materials,event))throw new Error(`Stale score evidence: ${event.id}`);
  const refs=new Set(event.members.map(m=>m.material_id));
  for(const review of [pair.first,pair.second].filter((v):v is ScoreReview=>!!v))if(review.source_refs.some(id=>!refs.has(id)))throw new Error(`Invalid score reference: ${event.id}`);
  if(pair.status==='pending'){
    if(pair.second||pair.resolution||event.decision==='recommend')throw new Error(`Pending review cannot recommend: ${event.id}`);
    if(canonical(event.scores)!==canonical(pair.first.scores))throw new Error(`Pending score mismatch: ${event.id}`);
  }else{
    if(!pair.second||pair.second.reviewer!=='codex'||!pair.second.blind||pair.second.receipt_id!==null||!pair.resolution)throw new Error(`Missing independent Codex review: ${event.id}`);
    const final=resolveScores(pair.first,pair.second,eligible);
    if(pair.resolution.decision!==final.decision||event.decision!==final.decision||canonical(event.scores)!==canonical(final.scores))throw new Error(`Score resolution mismatch: ${event.id}`);
  }
  return pair;
}
