import { z } from "zod";
import { CATEGORIES } from "@aihot/industry/taxonomy";
import {DualScoreSchema,validateDualScore} from './scoring.ts';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
}, "Invalid calendar date");
const text = z.string().trim().min(1);
const refs = z.object({ text, refs: z.array(text).min(1) });
const dimension = z.object({ value: z.number().int().min(0).max(10), reason: text });
export const UnassignedSchema = z.object({material_id:text,status:z.enum(['pending','not_pursued']),reason:text}).strict();
const outcomeSchema=z.object({material_id:text,status:z.enum(['grouped','pending','not_pursued','excluded']),event_ids:z.array(text),reason:text}).strict();
export const ResearchSchema = z.object({
  schema_version: z.literal("game-event-radar-input-1.0"),
  run: z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/), game: text, as_of: date, researcher: text, method: text, window_days: z.union([z.literal(3), z.literal(7), z.literal(14)]),
    model_api_calls:z.number().int().min(0).optional(),model_receipt_ids:z.array(z.number().int().positive()).optional(),
    web_receipt_ids:z.array(z.number().int().positive()).optional(),execution_mode:z.enum(['manual_backend_api','scheduled_backend_api','conversation_research']).optional(),
    derived_on:date.optional(),retrospective:z.boolean().optional(),coverage:z.object({start:date,end:date}).optional(),
  }).passthrough(),
  materials: z.array(z.object({
    id: z.string().regex(/^SRC-\d{3}$/), title: text,
    url: z.string().url().refine(v => ["http:", "https:"].includes(new URL(v).protocol)),
    source_name: text, source_kind: z.enum(["official", "media", "community"]),
    origin_group: text, published_at: date.nullable(), observed_on: date,
    access: z.enum(["body", "excerpt_only", "unavailable"]), access_note: text,
    excerpt: z.string(), summary: z.string(), decision: z.enum(["use", "watch", "exclude"]), selection_reason: text,
  }).passthrough()).max(30),
  events: z.array(z.object({
    id: z.string().regex(/^EVT-\d{3}$/), title: text, occurrence: text,
    decision: z.enum(["recommend", "watch", "drop"]), decision_reason: text,
    research_question: text, unknowns: z.array(text), platforms: z.array(text), keywords: z.array(text),
    members: z.array(z.object({ material_id: text, relation: z.enum(["same_occurrence", "development", "context"]), reason: text })).min(1),
    confirmed_facts: z.array(refs), source_claims: z.array(refs),
    scores: z.object({ impact: dimension, novelty: dimension, evidence: dimension, audience: dimension, investigability: dimension }),
    qualification_version:z.literal('investigation-v1').optional(),
    kind:z.enum(['event','issue']).optional(),
    player_discussion:z.string().max(1000).optional(),
    related_events:z.array(z.object({title:text,relation:text,refs:z.array(text).min(1)})).optional(),
    dual_score:DualScoreSchema.optional(),
  }).passthrough()),
  material_outcomes:z.array(outcomeSchema).optional(),
  search_log: z.array(z.unknown()), limitations: z.array(text).min(1), review: z.unknown(),
}).passthrough();
export type Research = z.infer<typeof ResearchSchema>;
export type MaterialOutcome=Omit<z.infer<typeof outcomeSchema>,'status'>&{status:z.infer<typeof outcomeSchema>['status']|'legacy_unassigned'};
/** Input qualification and final research disposition are deliberately separate. */
export function buildMaterialOutcomes(materials:Research['materials'],events:Research['events'],unassigned:z.infer<typeof UnassignedSchema>[]){
  const notes=new Map<string,z.infer<typeof UnassignedSchema>>();
  for(const raw of unassigned){const note=UnassignedSchema.parse(raw);if(notes.has(note.material_id))throw new Error(`Duplicate disposition: ${note.material_id}`);notes.set(note.material_id,note);}
  const result=materials.map(m=>{
    const memberships=events.filter(e=>e.members.some(x=>x.material_id===m.id));
    if(memberships.length||m.decision==='exclude'){
      if(notes.has(m.id))throw new Error(`Disposition for assigned/excluded material: ${m.id}`);
      return {material_id:m.id,status:memberships.length?'grouped' as const:'excluded' as const,event_ids:memberships.map(e=>e.id),reason:memberships.length?memberships.map(e=>`${e.id}：${e.members.find(x=>x.material_id===m.id)!.reason}`).join('；'):m.selection_reason};
    }
    const note=notes.get(m.id);if(!note)throw new Error(`Missing final disposition: ${m.id}`);notes.delete(m.id);
    return {...note,event_ids:[]};
  });
  if(notes.size)throw new Error(`Unknown disposition material: ${[...notes.keys()].join(', ')}`);
  return result;
}
export function materialOutcomes(data:Pick<Research,'materials'|'events'|'material_outcomes'>):MaterialOutcome[]{
  if(data.material_outcomes)return data.material_outcomes;
  return data.materials.map(m=>{
    const es=data.events.filter(e=>e.members.some(x=>x.material_id===m.id));
    return {material_id:m.id,status:es.length?'grouped':m.decision==='exclude'?'excluded':'legacy_unassigned',event_ids:es.map(e=>e.id),
      reason:es.length?es.map(e=>`${e.id}：${e.members.find(x=>x.material_id===m.id)!.reason}`).join('；'):m.decision==='exclude'?m.selection_reason:'旧批次未记录最终去向；材料可用性不等于已选为研究事件。'};
  });
}
export interface ResearchBatch {
  run:Research["run"]; materials:Research["materials"]; events:Array<Research["events"][number]&{score:number;public_id:string|null;event_date:string|null}>;
  limitations:string[];search_log:unknown[];original_material_count:number;hidden_material_count:number;api_calls:number;
  material_outcomes:MaterialOutcome[];
}
export const MappingSchema = z.object({
  categories: z.record(z.string(), z.string()),
  // Cross-batch continuations must point to an existing story UUID, not guessed titles.
  existing_stories: z.record(z.string(), z.string().uuid()).default({}),
  existing_relations:z.record(z.string(),z.enum(['same_occurrence','development'])).optional(),
}).strict();
export type Mapping = z.infer<typeof MappingSchema>;

/** Do not mistake awaiting/denying confirmation for asserting confirmation. */
export function assertsConfirmation(text:string){
  const positive=/官方(?:已|已经|正式)?(?:确认|证实)|已(?:被)?(?:实锤|证实)|确凿事实/g;
  for(const match of text.matchAll(positive)){
    const prefix=text.slice(Math.max(0,match.index-12),match.index);
    if(!/(?:待|等待|有待|尚待|未|尚未|并非|不是|不代表|不等于|不能(?:据此)?|无法|未经|没有(?:得到)?|无|缺少|是否)$/.test(prefix))return true;
  }
  return false;
}

export function validateResearch(value: unknown, mappingValue: unknown) {
  const data = ResearchSchema.parse(value);
  const mapping = MappingSchema.parse(mappingValue);
  const workflow=Number(data.run.workflow_version??0);
  const ids = new Set<string>();
  if(data.run.retrospective&&(!data.run.coverage||data.run.coverage.start>data.run.coverage.end||data.run.coverage.end>data.run.as_of))throw new Error('Invalid retrospective coverage');
  for (const m of data.materials) {
    if (ids.has(m.id)) throw new Error(`Duplicate material: ${m.id}`);
    ids.add(m.id);
    if(m.content_kind==='video_metadata'&&m.access==='body')throw new Error(`Video metadata cannot be body evidence: ${m.id}`);
    if (m.observed_on > data.run.as_of || (m.published_at && m.published_at > m.observed_on)) throw new Error(`Future material: ${m.id}`);
    const age = m.published_at ? (Date.parse(`${data.run.as_of}T00:00:00Z`) - Date.parse(`${m.published_at}T00:00:00Z`)) / 86400000 : null;
    const inWindow=data.run.retrospective&&data.run.coverage?!!m.published_at&&m.published_at>=data.run.coverage.start&&m.published_at<=data.run.coverage.end:age!==null&&age>=0&&age<data.run.window_days;
    if (m.decision === "use" && (m.access === "unavailable" || !inWindow)) throw new Error(`Unusable selected material: ${m.id}`);
  }
  const byId = new Map(data.materials.map(m => [m.id, m]));
  if(data.events.filter(e=>e.decision==='recommend').length>5)throw new Error('At most five recommended events per batch');
  const events = new Set<string>();
  for (const event of data.events) {
    if(event.dual_score)validateDualScore(data.materials,event,recommendationSupport(data.materials,event).eligible);
    if(workflow>=6&&!event.dual_score)throw new Error(`Missing dual review record: ${event.id}`);
    if (events.has(event.id)) throw new Error(`Duplicate event: ${event.id}`);
    events.add(event.id);
    if (!CATEGORIES.some(c => c.key === mapping.categories[event.id])) throw new Error(`Missing/invalid category: ${event.id}`);
    const members = new Set(event.members.map(m => m.material_id));
    if (members.size !== event.members.length || !event.members.some(m => m.relation === "same_occurrence")) throw new Error(`Invalid event members: ${event.id}`);
    if(workflow>=3&&event.members.some(m=>m.relation==='same_occurrence'&&/与本事件主题一致|仅主题相关|只是同角色|只是同版本/.test(m.reason)))throw new Error(`Theme-only root grouping: ${event.id}`);
    for (const id of members) if (!byId.has(id) || byId.get(id)!.decision === "exclude") throw new Error(`Invalid member reference: ${id}`);
    if(workflow>=3){
      const origins=new Set(event.members.filter(m=>m.relation!=='context').map(m=>byId.get(m.material_id)!.origin_group));
      const reason=event.scores.evidence.reason;
      if(origins.size===1&&/(?:多个来源|多家媒体|多个平台|多平台).*(?:相互印证|交叉验证|证据充分|提高可信)/.test(reason)&&!/(?:不构成|不能|缺少|没有)/.test(reason))throw new Error(`Syndication is not independent evidence: ${event.id}`);
    }
    for (const fact of [...event.confirmed_facts, ...event.source_claims]) {
      for (const id of fact.refs) if (!members.has(id) || byId.get(id)!.access === "unavailable") throw new Error(`Invalid evidence reference: ${id}`);
    }
    for(const relation of event.related_events??[])if(relation.refs.some(id=>!members.has(id)))throw new Error(`Invalid related event reference: ${event.id}`);
    for (const fact of event.confirmed_facts) {
      if (!fact.refs.every(id => byId.get(id)!.access === "body" && byId.get(id)!.decision === "use") ||
          !fact.refs.some(id => byId.get(id)!.source_kind === "official")) throw new Error(`Unsupported confirmed fact: ${event.id}`);
    }
    if (event.decision === "recommend" && !event.members.some(m => m.relation!=='context'&&byId.get(m.material_id)!.access === "body" && byId.get(m.material_id)!.decision === "use")) throw new Error(`Recommendation without usable body: ${event.id}`);
    if(workflow>=5&&event.decision==='recommend'&&!recommendationSupport(data.materials,event).eligible)throw new Error(`Single-origin signal is not a recommendation: ${event.id}`);
    if(workflow>=3&&!event.confirmed_facts.length){
      const narrative=[event.occurrence,event.decision_reason,...Object.values(event.scores).map(s=>s.reason)].join('\n');
      if(assertsConfirmation(narrative))throw new Error(`Unsupported narrative confirmation: ${event.id}`);
    }
  }
  for (const id of Object.keys(mapping.categories)) if (!events.has(id)) throw new Error(`Unknown category target: ${id}`);
  for (const id of Object.keys(mapping.existing_stories)) if (!events.has(id)) throw new Error(`Unknown story target: ${id}`);
  for (const id of Object.keys(mapping.existing_relations??{})) if (!mapping.existing_stories[id]) throw new Error(`Relation without continuation: ${id}`);
  if(workflow>=4&&!data.material_outcomes)throw new Error('New workflow requires material_outcomes');
  if(data.material_outcomes){
    const seen=new Set<string>();
    for(const outcome of data.material_outcomes){
      const m=byId.get(outcome.material_id);if(!m||seen.has(outcome.material_id))throw new Error(`Invalid disposition material: ${outcome.material_id}`);seen.add(m.id);
      const actual=data.events.filter(e=>e.members.some(x=>x.material_id===m.id)).map(e=>e.id).sort();
      const listed=[...outcome.event_ids].sort();
      if(JSON.stringify(actual)!==JSON.stringify(listed))throw new Error(`Disposition membership mismatch: ${m.id}`);
      if(actual.length?outcome.status!=='grouped':m.decision==='exclude'?outcome.status!=='excluded':!['pending','not_pursued'].includes(outcome.status))throw new Error(`Disposition status mismatch: ${m.id}`);
      if(workflow>=6&&outcome.status==='not_pursued')throw new Error(`Ambiguous legacy disposition: ${m.id}`);
    }
    if(seen.size!==ids.size)throw new Error(`Missing final disposition: ${data.materials.filter(m=>!seen.has(m.id)).map(m=>m.id).join(', ')}`);
  }
  return { data, mapping };
}

export function researchScore(event: Research["events"][number]): number {
  const s = event.scores;
  return s.impact.value * 3 + s.novelty.value * 2 + s.evidence.value * 2 + s.audience.value * 2 + s.investigability.value;
}

/** Technical qualification only: a readable report remains a source claim when
 * it cannot qualify as this batch's official, dated fact. This never repairs
 * missing URLs/IDs or unavailable evidence, which must still fail validation. */
export function qualifyConfirmedFacts(materials:Research['materials'],events:Research['events']){
  const byId=new Map(materials.map(m=>[m.id,m]));
  const audit:Array<{event_id:string;text:string;refs:string[];reason:string}>=[];
  for(const e of events){const kept:typeof e.confirmed_facts=[];
    for(const fact of e.confirmed_facts){const rows=fact.refs.map(id=>byId.get(id));
      const qualified=rows.every(m=>m&&m.access==='body'&&m.decision==='use')&&rows.some(m=>m?.source_kind==='official');
      if(!qualified&&rows.every(m=>m&&m.access!=='unavailable')){
        if(!e.source_claims.some(c=>c.text===fact.text&&JSON.stringify(c.refs)===JSON.stringify(fact.refs)))e.source_claims.push({...fact});
        audit.push({event_id:e.id,...fact,reason:'读取、日期或官方来源资格不足；降为来源说法，不证明本轮公告事实'});
      }else kept.push(fact);
    }e.confirmed_facts=kept;
  }return audit;
}
export function recommendationSupport(materials:Research['materials'],event:Research['events'][number]){
  const ids=new Set(event.members.filter(m=>m.relation!=='context').map(m=>m.material_id));
  const usable=materials.filter(m=>ids.has(m.id)&&m.access==='body'&&m.decision==='use');
  const origins=new Set(usable.map(m=>m.origin_group));
  const concrete=event.qualification_version==='investigation-v1';
  return {eligible:concrete?usable.length>0&&(event.research_question.trim().length>=8)&&event.keywords.length>0:usable.some(m=>m.source_kind==='official')||origins.size>=2,independent_sources:origins.size};
}
