import type {Research,ResearchBatch} from './contract.ts';

type Event=Research['events'][number]&{public_id?:string|null};
export function contentIdentity(url:string){
 const u=new URL(url),host=u.hostname.toLowerCase();
 const is=(domain:string)=>host===domain||host.endsWith('.'+domain);
 if(is('bilibili.com'))return {platform:'bilibili',content_id:u.pathname.match(/\/(BV[a-zA-Z0-9]+|\d{10,})/)?.[1]??null};
 if(is('douyin.com'))return {platform:'douyin',content_id:u.pathname.match(/\/(?:video|note)\/(\d+)/)?.[1]??null};
 if(is('taptap.cn'))return {platform:'taptap',content_id:u.pathname.match(/\/(?:moment|topic|review)\/(\d+)/)?.[1]??null};
 if(is('reddit.com'))return {platform:'reddit',content_id:u.pathname.match(/\/comments\/([a-z0-9]+)/)?.[1]??null};
 return {platform:host,content_id:null};
}
export function eventHandoff(batch:Pick<ResearchBatch,'run'|'materials'>,event:Event){
 const sources=event.members.map(member=>batch.materials.find(m=>m.id===member.material_id)).filter(m=>!!m);
 const rootIds=new Set(event.members.filter(m=>m.relation!=='context').map(m=>m.material_id));
 const dates=sources.flatMap(m=>rootIds.has(m.id)&&m.published_at?[m.published_at]:[]).sort();
 return {schema_version:'starrail-event-handoff-1.0',event_id:event.public_id??`${batch.run.id}::${event.id}`,title:event.title,game:batch.run.game,
  date_range:{start:dates[0]??null,end:dates.at(-1)??null},summary:event.occurrence,
  ...(event.player_discussion?{player_discussion:event.player_discussion}:{}),
  sources:sources.map(m=>({url:m.url,...contentIdentity(m.url),published_at:m.published_at,access:m.access,relation:event.members.find(member=>member.material_id===m.id)!.relation})),
  platforms:[...new Set(sources.map(m=>contentIdentity(m.url).platform))],
  scoring:{status:event.dual_score?.status??'legacy_single',decision:event.decision,
    first:event.dual_score?{reviewer:event.dual_score.first.reviewer,total:event.dual_score.first.total,decision:event.dual_score.first.decision}:null,
    second:event.dual_score?.second?{reviewer:event.dual_score.second.reviewer,total:event.dual_score.second.total,decision:event.dual_score.second.decision}:null,
    reason:event.decision_reason},unknowns:event.unknowns,search_terms:event.keywords.slice(0,5)};
}
