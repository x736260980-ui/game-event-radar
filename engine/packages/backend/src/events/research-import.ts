// Local, explicit import of completed research. No model/provider or collector imports.
import { randomUUID } from "node:crypto";
import { sql } from "@aihot/backend/db";
import { sha256, stableJson } from "@aihot/backend/lib/ids";
import { upsertMaterial,identityKeyFor } from "@aihot/backend/content/materials";
import { publishArticleTx } from "@aihot/backend/publication/publish";
import type {Research,Mapping} from "@aihot/game-radar/contract";
import { audit } from "../audit.ts";
import { refreshResearchDigests } from "./research-projection.ts";
import {researchDigest} from './research-digest.ts';
import {researchObservationTime} from './research-clock.ts';
import {continuationDigest} from '@aihot/game-radar/update-policy';
import {digestReports,digestInputsHash} from '../publication/story-evidence.ts';
const researchScore=(event:Research['events'][number])=>{const s=event.scores;return s.impact.value*3+s.novelty.value*2+s.evidence.value*2+s.audience.value*2+s.investigability.value;};
const categoryTags: Record<string,string> = {version:"版本机制",resource:"资源付费",character:"角色宣发",story:"剧情内容",operations:"运营权益",community:"社区观点"};

export async function importValidatedResearch(data:Research,mapping:Mapping) {
  const hash = sha256(stableJson({ data, mapping }));
  const subject = `radar-batch:${data.run.id}`;
  return sql.begin(async tx => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${subject}))`;
    const [prior] = await tx<{ after: { hash: string; result: unknown; research?:Research; material_ids?:Record<string,string> } }[]>`SELECT after FROM audit_log WHERE action = 'radar.import' AND subject = ${subject} ORDER BY id DESC LIMIT 1`;
    if (prior) {
      if (prior.after.hash !== hash) throw new Error("Batch already imported with different content; use a new run id instead of overwriting history");
      const [snapshot] = await tx<{id:number;after:{material_ids?:Record<string,string>}}[]>`SELECT id,after FROM audit_log WHERE action='radar.snapshot' AND subject=${subject} ORDER BY id DESC LIMIT 1`;
      if (prior.after.research && prior.after.material_ids) {
        // Reused articles may still carry another batch in raw. The immutable import already
        // has the authoritative mapping; never reconstruct it from raw.batch on a replay.
        if(snapshot&&Object.entries(prior.after.material_ids).some(([id,article])=>snapshot.after.material_ids?.[id]!==article)){
          await audit('research-agent','radar.snapshot',subject,'Repair incomplete replay snapshot from immutable original import mapping; no research or source content changed',snapshot.after,prior.after,{db:tx});
        }
      } else if (!snapshot) {
        const rows = await tx<{id:string; material_id:string}[]>`SELECT id,raw->'material'->>'id' AS material_id FROM articles WHERE raw->>'batch'=${data.run.id}`;
        await audit('research-agent','radar.snapshot',subject,'Append immutable research snapshot for existing import',null,{hash,result:prior.after.result,research:data,material_ids:Object.fromEntries(rows.map(r=>[r.material_id,r.id]))},{db:tx});
      }
      return { reused: true, result: prior.after.result };
    }
    const materialIds = new Map<string, string>();
    const preservedMaterials:string[]=[];
    const previousDigests=new Map<string,string|null>();
    for(const uuid of Object.values(mapping.existing_stories)){
      const [old]=await tx<{id:number;digest:string|null}[]>`SELECT id,digest FROM stories WHERE merged_into IS NULL AND (public_id=${uuid} OR id IN (SELECT story_id FROM story_aliases WHERE public_id=${uuid})) FOR UPDATE`;
      if(!old)throw new Error(`Existing story not found: ${uuid}`);
      if(old.digest){
        const [snapshot]=await tx<{article_ids:string[];inputs_hash:string|null;digest:string}[]>`SELECT article_ids,inputs_hash,digest FROM story_digests WHERE story_id=${old.id} ORDER BY version DESC LIMIT 1`;
        const saved=new Set(snapshot?.article_ids??[]);
        const reports=(await digestReports(tx,[old.id])).filter(r=>saved.has(r.id));
        if(!snapshot&&!reports.length){previousDigests.set(uuid,null);continue;}
        if(!snapshot||snapshot.digest!==old.digest||reports.length!==saved.size||digestInputsHash(reports)!==snapshot.inputs_hash)throw new Error(`Existing evidence changed; explicit review required before continuation: ${uuid}`);
      }
      previousDigests.set(uuid,old.digest);
    }
    const memberEvents = (id: string) => data.events.filter(e => e.members.some(m => m.material_id === id));
    const membershipCount = new Map(data.materials.map(m => [m.id, memberEvents(m.id).length]));
    const representatives = new Map<string, string>();
    const recommended = data.events.filter(e => e.decision === "recommend").sort((a,b) => researchScore(b)-researchScore(a) || a.id.localeCompare(b.id)).slice(0,5);
    for (const event of recommended) {
      const eligible = data.materials.filter(m => m.decision === "use" && m.access === "body" && membershipCount.get(m.id) === 1 && event.members.some(x => x.material_id === m.id && x.relation === "same_occurrence"));
      eligible.sort((a,b) => Number(b.source_kind === "official") - Number(a.source_kind === "official") || (a.published_at ?? "").localeCompare(b.published_at ?? "") || a.id.localeCompare(b.id));
      if (eligible[0]) representatives.set(event.id, eligible[0].id);
    }
    for (const m of data.materials) {
      const sourceId = `research-${sha256(m.source_name + "|" + m.source_kind).slice(0,20)}`;
      const official = m.source_kind === "official";
      await tx`INSERT INTO sources (id,name,kind,config,tier,first_party,participation_mode,enabled,site_fulltext,syndicate_fulltext)
        VALUES (${sourceId},${m.source_name},'external','{}',${official ? "T1" : "T2"},${official},'editorial',false,false,false) ON CONFLICT (id) DO NOTHING`;
      const observed = researchObservationTime(m.observed_on);
      const [existing]=await tx<{id:string;raw:{material?:Research['materials'][number]}}[]>`SELECT id,raw FROM articles WHERE identity_key=${identityKeyFor({sourceId,url:m.url,title:m.title,via:'game-radar'})} FOR UPDATE`;
      if(existing?.raw?.material?.access==='body'&&existing.raw.material.decision==='use'&&(m.access!=='body'||m.decision!=='use')){
        materialIds.set(m.id,existing.id);preservedMaterials.push(m.id);continue;
      }
      const stored = await upsertMaterial({ sourceId, title:m.title, url:m.url, language:"zh", publishedAt:m.published_at ? new Date(`${m.published_at}T00:00:00+08:00`) : null,
        discoveredAt:observed, excerpt:m.excerpt, bodyText:m.access === "body" ? m.excerpt : null,
        bodyStatus:m.access === "body" ? "ok" : m.access === "unavailable" ? "none" : "unconfirmed",
        via:"game-radar", backfill:"external-research-batch", raw:{ batch:data.run.id, material:m, provenance:"external_agent", body_is_short_excerpt:true } },tx);
      if ([...materialIds.values()].includes(stored.articleId)) throw new Error("Duplicate URL in batch: consolidate the source records before importing");
      materialIds.set(m.id, stored.articleId);
      const events = memberEvents(m.id).sort((a,b) => researchScore(b)-researchScore(a));
      const event = events[0];
      const isComposite = events.length > 1;
      const category = event ? mapping.categories[event.id] : "community";
      const chosen = [...representatives.values()].includes(m.id);
      const relevance = m.decision === "exclude" ? "block" : m.access === "unavailable" || !m.published_at ? "unknown" : "pass";
      const summary = [m.summary, `【资料状态】${m.access === "body" ? "已读取相关正文（仅保留短摘录）" : m.access === "excerpt_only" ? "仅摘要或片段" : "无法读取"}；${m.access_note}`,
        `【批次】${data.run.id}，资料截至${data.run.as_of}。${data.run.execution_mode==='manual_backend_api'?'按需后台模型整理及评分，调用记录随批次保留。':'对话Agent按需整理，非后台API评分。'}`,
        event ? `【研究边界】${event.occurrence}` : "", event?.unknowns.length ? `【尚未确认】${event.unknowns.join("；")}` : ""].filter(Boolean).join("\n\n");
      const output = { scope:isComposite ? "composite" : "single", provenance:"external_agent", batch:data.run.id, material_id:m.id,
        researcher:data.run.researcher, method:data.run.method, model_receipt_ids:data.run.model_receipt_ids??[],model_api_calls:data.run.model_api_calls??0,research_priority:event ? researchScore(event) : null,
        score_basis:"event_research_priority_not_independent_article_scores", scores:null,
        event_ids:events.map(e => e.id), source_access:m.access, event_records:events, selection_reason:m.selection_reason };
      await tx`INSERT INTO analyses (article_id,input_revision,origin,model,prompt_version,receipt_ids,relevance,category,tags,subjects,title_zh,summary_zh,reason_zh,score,selected,output)
        SELECT ${stored.articleId},revision,'external_agent',NULL,'game-radar-external-v1','{}',${relevance},${category},${[categoryTags[category] ?? "其他", "星穹铁道"]},'{}',
        ${chosen && event ? event.title : m.title},${summary},${event?.decision_reason ?? m.selection_reason},${event ? researchScore(event) : null},${chosen},${tx.json(output as never)} FROM articles WHERE id = ${stored.articleId}`;
      await tx`UPDATE articles SET processing_state = ${relevance === "block" ? "blocked" : "analyzed"}, grouping_status='complete', grouped_at=now(), selection_adds_value=${chosen} WHERE id=${stored.articleId}`;
    }
    const stories: Array<{ event_id:string; story_id:number; public_id:string }> = [];
    for (const event of data.events) {
      const existingUuid = mapping.existing_stories[event.id];
      const digest = researchDigest(data,event);
      let story: { id:number; public_id:string };
      if (existingUuid) {
        const [found] = await tx<{ id:number; public_id:string;digest:string|null;frame:{decision?:string} }[]>`SELECT id,public_id,digest,frame FROM stories WHERE merged_into IS NULL AND (public_id=${existingUuid} OR id IN (SELECT story_id FROM story_aliases WHERE public_id=${existingUuid})) FOR UPDATE`;
        if (!found) throw new Error(`Existing story not found: ${existingUuid}`);
        story = found;
        const [owned] = await tx`SELECT id FROM stories WHERE id=${story.id} AND frame->>'provenance'='external_agent'`;
        if (!owned) throw new Error("Only research-imported stories can be explicitly continued");
        const cumulative=continuationDigest(previousDigests.get(existingUuid)??null,digest,data.run.id);
        const decision=found.frame.decision==='recommend'&&event.decision!=='recommend'?'recommend':event.decision;
        await tx`UPDATE stories SET digest=${cumulative},digest_updated_at=now(),title=${event.title},frame=${tx.json({provenance:"external_agent",batch:data.run.id,event_id:event.id,decision,cumulative_digest:true} as never)},updated_at=now() WHERE id=${story.id}`;
      } else {
        const uuid = randomUUID();
        const dates = event.members.map(m => data.materials.find(x => x.id === m.material_id)!.published_at).filter((x): x is string => !!x).sort();
        [story] = await tx<{ id:number; public_id:string }[]>`INSERT INTO stories (public_id,title,origin,frame,first_report_at,latest_at,digest,digest_updated_at,latest)
          VALUES (${uuid},${event.title},'manual',${tx.json({provenance:"external_agent",batch:data.run.id,event_id:event.id,decision:event.decision} as never)},
            ${dates[0] ? new Date(`${dates[0]}T00:00:00+08:00`) : null},${dates.at(-1) ? new Date(`${dates.at(-1)}T00:00:00+08:00`) : null},${digest},now(),${event.decision_reason}) RETURNING id,public_id`;
      }
      let [root] = await tx<{id:number}[]>`SELECT id FROM facts WHERE story_id=${story!.id} AND conditions=${event.occurrence} ORDER BY id LIMIT 1`;
      if(!root&&existingUuid&&mapping.existing_relations?.[event.id]==='same_occurrence'){
        const roots=event.members.filter(m=>m.relation==='same_occurrence').map(m=>materialIds.get(m.material_id)!);
        [root]=await tx<{id:number}[]>`SELECT f.id FROM facts f JOIN fact_articles fa ON fa.fact_id=f.id WHERE f.story_id=${story!.id} AND fa.article_id=ANY(${roots}::text[]) AND fa.role<>'mention' ORDER BY f.id LIMIT 1`;
        if(!root)[root]=await tx<{id:number}[]>`SELECT id FROM facts WHERE story_id=${story!.id} ORDER BY id LIMIT 1`;
      }
      if (!root) [root] = await tx<{id:number}[]>`INSERT INTO facts (public_id,story_id,title,manual,conditions) VALUES (${randomUUID()},${story!.id},${event.title},true,${event.occurrence}) RETURNING id`;
      const [primary] = await tx`SELECT article_id FROM fact_articles WHERE fact_id=${root!.id} AND role='primary' LIMIT 1`;
      let rootUsed = !!primary;
      for (const member of event.members) {
        const m = data.materials.find(x => x.id === member.material_id)!;
        const isMention = member.relation === "context" || membershipCount.get(m.id)! > 1;
        // Direct developments get their own fact inside the story; not a duplicate of its root.
        const article = materialIds.get(m.id)!;
        const [priorLink] = await tx<{id:number; story_id:number}[]>`SELECT f.id,f.story_id FROM facts f JOIN fact_articles fa ON fa.fact_id=f.id WHERE fa.article_id=${article} AND fa.role<>'mention' ORDER BY f.id LIMIT 1`;
        if (!isMention && priorLink && Number(priorLink.story_id)!==Number(story!.id)) throw new Error("An existing source already belongs to another event; provide an explicit existing_stories mapping");
        let factId = root!.id;
        if (member.relation === "development" && !isMention) {
          if (priorLink) factId = priorLink.id;
          else {
            let [followup]=await tx<{id:number}[]>`SELECT id FROM facts WHERE story_id=${story!.id} AND title=${m.title} AND conditions=${member.reason} ORDER BY id LIMIT 1`;
            if(!followup)[followup] = await tx<{id:number}[]>`INSERT INTO facts (public_id,story_id,title,manual,conditions) VALUES (${randomUUID()},${story!.id},${m.title},true,${member.reason}) RETURNING id`;
            factId = followup!.id;
          }
        }
        if (!isMention && priorLink && member.relation==='same_occurrence' && Number(priorLink.id)!==Number(factId)) throw new Error("Source occurrence changed; review the explicit event grouping instead of adding duplicate evidence");
        const role = isMention ? "mention" : !rootUsed && factId === root!.id ? "primary" : "report";
        if (role === "primary") rootUsed = true;
        await tx`INSERT INTO fact_articles (fact_id,article_id,role,evidence,manual) VALUES (${factId},${article},${role},${m.excerpt || null},true) ON CONFLICT DO NOTHING`;
        await tx`INSERT INTO grouping_decisions (article_id,fact_id,story_id,verdict,candidates,receipt_id) VALUES (${article},${factId},${story!.id},
          ${stableJson({relation:isMention ? "ROUNDUP" : member.relation === "development" ? "SAME_STORY" : "SAME_OCCURRENCE",note:member.reason,provenance:"external_agent",batch:data.run.id})},'[]',NULL)`;
      }
      stories.push({event_id:event.id,story_id:story!.id,public_id:story!.public_id});
    }
    for (const m of data.materials) if(!preservedMaterials.includes(m.id))await publishArticleTx(tx,materialIds.get(m.id)!,m.published_at ? {releasedAt:researchObservationTime(m.observed_on)} : {});
    await refreshResearchDigests(tx,stories.map(s=>s.story_id),true,data);
    const result = {batch:data.run.id,material_count:materialIds.size,event_count:stories.length,representative_count:representatives.size,stories,preserved_material_ids:preservedMaterials,api_calls:data.run.model_api_calls??0,as_of:data.run.as_of};
    await audit('research-agent','radar.import',subject,data.run.execution_mode==='manual_backend_api'?'Explicit on-demand backend research import; model receipts in research.run':'Explicit external research import; no model receipts',null,{hash,result,research:data,material_ids:Object.fromEntries(materialIds)},{db:tx});
    return {reused:false,result};
  });
}
