import {dedupQueries,canonicalUrl,dateCandidates,SCOPES,type Scope,type Hit} from './update-utils.ts';
import type {ResearchBatch} from './contract.ts';

export type SearchQuery={query:string;scope:Scope};
// These are investigation directions, not claims that a controversy exists.
export const WATCH_TOPICS=['版本 关卡 难度 配队 机制','新角色 强度 专武 队伍 抽取取舍','剧情 角色塑造 演出 评价','活动 联动 奖励 体验','运营 规则 权益 补偿 反馈'] as const;
export function discoveryHistory(batches:ResearchBatch[]){
  const seen=new Set<string>();
  return [...batches].sort((a,b)=>b.run.as_of.localeCompare(a.run.as_of)).flatMap(b=>b.events.flatMap(e=>{
    const key=e.public_id??e.title;
    if(seen.has(key)||e.decision==='drop')return [];
    seen.add(key);return [{title:e.title.slice(0,140),keywords:e.keywords.slice(0,4),date:e.event_date}];
  })).slice(0,6);
}
export function searchDomains(query:string,scope:Scope):string[]{
  const requested=[...query.matchAll(/site:([a-z0-9.-]+)(?:\/\S*)?/gi)].map(m=>m[1].toLowerCase());
  const allowed=requested.filter(host=>SCOPES[scope].some(d=>host===d||host.endsWith('.'+d)));
  return allowed.length?[...new Set(allowed)]:[...SCOPES[scope]];
}
function bounded(q:SearchQuery):SearchQuery{
  if(q.scope==='official'&&!/site:/i.test(q.query)&&/\b(?:x|twitter|zzz_en|honkaistarrail)\b/i.test(q.query)){
    const account=/\bzzz_en\b|Zenless|\bZZZ\b|绝区零/i.test(q.query)?'ZZZ_EN':'honkaistarrail';
    q={...q,query:q.query+` site:x.com/${account}`};
  }
  if(q.scope==='community'&&!/site:/i.test(q.query)&&/\bReddit\b/i.test(q.query))q={...q,query:q.query+' site:reddit.com'};
  if(/site:(?:reddit\.com|x\.com)/i.test(q.query)&&/[\u3400-\u9fff]/.test(q.query)){
    const terms=q.query.replace(/崩坏[：:]?星穹铁道|星穹铁道|崩铁/g,'Honkai Star Rail').replace(/卡芙卡/g,'Kafka').replace(/知更鸟/g,'Robin').replace(/绝区零/g,'Zenless Zone Zero').replace(/联动/g,'crossover').replace(/官宣|公布|前瞻/g,'announcement').replace(/[\u3400-\u9fff]+/g,' ');
    return {...q,query:(terms+' player discussion update').replace(/\s+/g,' ').trim().slice(0,180)};
  }return {...q,query:q.query.slice(0,180)};
}
export function discoveryPlan(raw:SearchQuery[],game:string,asOf:string,history:ReturnType<typeof discoveryHistory>):SearchQuery[]{
  const defaults:SearchQuery[]=[{scope:'official',query:`${game} site:sr.mihoyo.com 公告 版本 活动`},{scope:'official',query:'Honkai Star Rail site:x.com/honkaistarrail announcement update'},{scope:'official',query:`${game} 官方 前瞻 公告 site:bilibili.com`}];
  const official=dedupQueries([...raw.filter(q=>q.scope==='official'),...defaults]).slice(0,3);
  const fallback=WATCH_TOPICS.map((topic,i)=>({scope:'community' as const,query:i===4?'Honkai Star Rail site:reddit.com player feedback rewards update':`${game} site:${i%2?'taptap.cn':'bilibili.com'} ${topic}`}));
  return [...official,...dedupQueries([...raw.filter(q=>q.scope!=='official'),...fallback]).slice(0,5)].map(bounded);
}
export function followupPlan(raw:SearchQuery[],initial:SearchQuery[],game:string,asOf:string):SearchQuery[]{
  const existing=new Set(dedupQueries(initial).map(q=>q.scope+':'+q.query));
  return dedupQueries([...raw.filter(q=>q.scope==='official'),...raw.filter(q=>q.scope!=='official')]).filter(q=>!existing.has(q.scope+':'+q.query)).slice(0,4).map(bounded);
}
export function hitExclusion(h:Hit):string|null{
  const u=new URL(h.url);
  if(u.hostname==='show.bilibili.com'||u.hostname==='mall.bilibili.com'||/会员购|漫展票务|商品详情|游戏嘉年华.*票/.test(h.title))return '票务或商品页面';
  if(/换号|卖号|账号出售|收号|换小白|换昔涟|换流萤/.test(h.title))return '账号或收藏品交易';
  if(u.hostname==='search.bilibili.com'||u.hostname==='search.douyin.com')return '搜索聚合页';
  return null;
}

export function selectLeads(pool:Hit[],ids:string[],max:number):Hit[]{
  const candidates=new Map(pool.map((h,i)=>[`HIT-${String(i+1).padStart(3,'0')}`,h]));
  if(ids.length>max||new Set(ids).size!==ids.length||ids.some(id=>!candidates.has(id)))throw new Error('Invalid lead selection');
  return ids.map(id=>candidates.get(id)!);
}

export type KnownSource={url:string;published_at:string|null;origin_group:string};
/** Historical article dates are hints for discovery, not a substitute for rereading.
 * Never use the date of an activity or of our crawl as its publication date. */
export function discoveryClues(pool:Hit[],known:KnownSource[],asOf:string,windowDays:number){
  const byUrl=new Map<string,KnownSource>();
  for(const m of known){try{const key=canonicalUrl(m.url);if(!byUrl.has(key))byUrl.set(key,m);}catch{}}
  const start=new Date(asOf+'T00:00:00Z');start.setUTCDate(start.getUTCDate()-windowDays+1);
  const since=start.toISOString().slice(0,10);
  return pool.map((h,i)=>{
    const saved=byUrl.get(canonicalUrl(h.url));
    const hints=[...new Set([...(h.search_provenance??[]).flatMap(p=>p.date_hint?[p.date_hint]:[]),...dateCandidates(h.title+' '+h.snippet,asOf).map(d=>d.day)])];
    return {id:`HIT-${String(i+1).padStart(3,'0')}`,title:h.title,url:h.url,snippet:h.snippet.slice(0,400),source_kind:sourceKindForClue(h),
      known_published_at:saved?.published_at??null,known_origin:saved?.origin_group??null,
      date_hints:hints,date_status:saved?.published_at?(saved.published_at>=since&&saved.published_at<=asOf?'known_in_window':'known_old'):hints.some(d=>d>=since&&d<=asOf)?'hint_in_window':'unknown',
      date_note:saved?'历史正文记录；本轮仍需读取核查是否修订':'搜索标题/摘要日期只作线索，未证明发布日期'};
  });
}
function sourceKindForClue(h:Hit){return h.scopes.includes('official')?'official_search_scope':h.scopes[0]??'unknown';}
/** Do not semantically merge stories here. Only exact titles / already audited
 * provenance chains share reading slots; retained and deferred IDs are logged. */
export function diversifyLeads(pool:Hit[],ids:string[],max:number,clues:ReturnType<typeof discoveryClues>){
  selectLeads(pool,ids,max);
  const lookup=new Map(clues.map(c=>[c.id,c]));
  const ordered=[...ids].sort((a,b)=>{
    const ranks:Record<string,number>={known_in_window:0,hint_in_window:1,unknown:2,known_old:3};
    const rank=(id:string)=>ranks[lookup.get(id)!.date_status];
    return rank(a)-rank(b);
  });
  const counts=new Map<string,number>(),kept:string[]=[],deferred:Array<{id:string;reason:string}>=[];let old=0;
  for(const id of ordered){const c=lookup.get(id)!;
    const key=c.known_origin??'exact-title:'+c.title.normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
    if((counts.get(key)??0)>=2){deferred.push({id,reason:'同一已记录来源链或完全相同标题已保留两条；不重复占读取名额'});continue;}
    if(c.date_status==='known_old'&&old>=2){deferred.push({id,reason:'旧正文无已核实新进展；保留在线索池，不作为本轮主材料'});continue;}
    kept.push(id);counts.set(key,(counts.get(key)??0)+1);if(c.date_status==='known_old')old++;
  }
  return {hits:selectLeads(pool,kept,max),selected_ids:kept,deferred};
}
