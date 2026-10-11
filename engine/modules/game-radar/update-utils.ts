// Pure, deterministic preparation. None of these checks establishes semantic truth.
import {isOfficialAccount} from './sources.ts';
export interface Hit { url:string; title:string; snippet:string; scopes:string[]; original_url?:string; discovery_query?:string; discovery_parent?:string; search_provenance?:Array<{provider:string;query:string;source_ref?:string;searched_at?:string;date_hint?:string}> }
export const SCOPES = {
  official: ['hsr.hoyoverse.com','sr.mihoyo.com','zenless.hoyoverse.com','zzz.mihoyo.com','hoyolab.com','x.com','twitter.com','bilibili.com','taptap.cn'],
  community: ['taptap.cn','bilibili.com','ngabbs.com','reddit.com','douyin.com','x.com','twitter.com'],
  media: ['gamersky.com','17173.com','game8.jp','fandomwire.com','sportskeeda.com'],
} as const;
export type Scope = keyof typeof SCOPES;
export function canonicalUrl(value:string):string {
  const u=new URL(value);
  if(!['http:','https:'].includes(u.protocol)||u.username||u.password||/^(localhost|127\.|0\.|10\.|192\.168\.|\[)/i.test(u.hostname))throw new Error('Expected public HTTP(S) URL');
  u.hash='';
  for(const key of [...u.searchParams.keys()])if(/^(utm_|spm|from|share_|tracking)/i.test(key))u.searchParams.delete(key);
  u.searchParams.sort();u.pathname=u.pathname.replace(/\/$/,'')||'/';
  // Language variants of the same official news are one provenance chain.
  if(u.hostname==='hsr.hoyoverse.com')u.pathname=u.pathname.replace(/^\/(zh-tw|en-us)\/news\//,'/zh-cn/news/');
  return u.toString();
}
export function sourceKind(url:string):'official'|'media'|'community' {
  const host=new URL(url).hostname;
  if(['hsr.hoyoverse.com','sr.mihoyo.com','zenless.hoyoverse.com','zzz.mihoyo.com'].includes(host)||isOfficialAccount(url))return 'official';
  return SCOPES.media.some(d=>host===d||host.endsWith('.'+d))?'media':'community';
}
const normalizedQuery=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/https?:\/\/\S+|site:\S+/g,'').replace(/官方公告|最新消息|最新资讯|新闻|公告|版本|\s|[^\p{L}\p{N}]/gu,'');
const grams=(s:string)=>new Set([...s].slice(0,-1).map((c,i)=>c+[...s][i+1]));
export function dedupQueries<T extends {query:string;scope:Scope}>(input:T[]):T[] {
  const out:T[]=[];
  const sites=(q:string)=>[...q.matchAll(/site:([^\s]+)/gi)].map(m=>m[1].toLowerCase().replace(/\/$/,'')).sort().join('|');
  for(const q of input){const s=normalizedQuery(q.query),a=grams(s);if(!s)continue;
    if(out.some(p=>{if(p.scope!==q.scope||sites(p.query)!==sites(q.query))return false;const t=normalizedQuery(p.query);if(t===s)return true;const b=grams(t);const intersection=[...a].filter(v=>b.has(v)).length;return intersection/Math.max(1,a.size+b.size-intersection)>=0.85;}))continue;
    out.push(q);
  }return out;
}
export function requiredQueries(input:Array<{query:string;scope:Scope}>,game:string,asOf:string){
  const out=dedupQueries(input).slice(0,4);
  for(const scope of ['official','community'] as const)if(!out.some(q=>q.scope===scope)){
    if(out.length>=4){
      const replace=out.findIndex(q=>q.scope==='media'||out.filter(x=>x.scope===q.scope).length>1);
      out.splice(replace,1);
    }
    out.push({scope,query:`${game} ${asOf} ${scope==='official'?'官网 honkaistarrail 公告 活动 版本':'TapTap Reddit 玩家讨论 活动 版本'}`});
  }
  return out;
}
export function dedupHits(input:Hit[],max:number):Hit[]{
  const out=new Map<string,Hit>();
  for(const h of input){let key:string;try{key=canonicalUrl(h.url);}catch{continue;}const prev=out.get(key);
    if(prev){prev.scopes=[...new Set([...prev.scopes,...h.scopes])];prev.search_provenance=[...new Map([...(prev.search_provenance??[]),...(h.search_provenance??[])].map(p=>[JSON.stringify(p),p])).values()];if(h.snippet.length>prev.snippet.length)prev.snippet=h.snippet;}
    else out.set(key,{...h,url:key,original_url:h.original_url??h.url});
  }
  // Balance community platforms as well as scopes; one platform must not eat all slots.
  const groups=new Map<string,Hit[]>();
  for(const scope of Object.keys(SCOPES))for(const h of out.values())if(h.scopes.includes(scope)){
    const key=scope==='community'?scope+':'+new URL(h.url).hostname.replace(/^www\./,''):scope;
    const list=groups.get(key)??[];list.push(h);groups.set(key,list);
  }
  const lists=[...groups.values()];const selected=new Map<string,Hit>();
  for(let i=0;selected.size<max&&lists.some(l=>i<l.length);i++)for(const list of lists){if(list[i]&&selected.size<max)selected.set(list[i].url,list[i]);}
  return [...selected.values()];
}
export function cleanText(value:string):string{
  return value.replace(/\\([._-])/g,'$1').replace(/<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>|<nav\b[^>]*>[\s\S]*?<\/nav>|<footer\b[^>]*>[\s\S]*?<\/footer>/gi,'')
    .replace(/!\[[^\]]*\]\([^)]*\)/g,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1')
    .replace(/<\/(?:p|div|h[1-6]|li|section|article)>/gi,'\n').replace(/<[^>]+>/g,'')
    .replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .split(/\r?\n/).map(l=>l.trim()).filter(l=>l&&!/^(登录|登入|注册|下載|下载App|返回首页|首页|广告|关注|分享|版权所有|隐私政策|沪ICP|京ICP|Image \d+)/.test(l)).join('\n');
}
export function bodySegment(raw:string,title:string,max=2200,focusTerms:string[]=[],sourceUrl?:string):string {
  let text=cleanText(raw);
  // Related-story lists are not a later section of this article. Apply before
  // focus extraction so a repeated game/version keyword cannot pull them back.
  const related=/\n(?:Related Articles|Related Stories|関連記事|関連ニュース|更多\s*即時熱門文章|更多\s*即时热门文章|こちらもおすすめ)(?:\s*\n|\s*[>»›])/i.exec(text);
  if(related)text=text.slice(0,related.index);
  if(sourceUrl&&isOfficialAccount(sourceUrl)&&/\/status\//.test(sourceUrl))text=text.split(/\n(?:##?\s*)?(?:Top Comments|Replies|评论区)\b/i)[0];
  // TapTap moment pages append unrelated recommendations after the game card.
  // Never scan the downstream feed for a matching topic and call it this post.
  if(sourceUrl&&/(^|\.)taptap\.cn$/.test(new URL(sourceUrl).hostname)&&/^\/moment\//.test(new URL(sourceUrl).pathname)){
    const boundaries=['前往论坛','猜你想搜','猜你喜欢'].map(label=>text.indexOf(label)).filter(i=>i>=0);
    if(boundaries.length)text=text.slice(0,Math.min(...boundaries));
  }
  if(sourceUrl&&/(^|\.)bilibili\.com$/.test(new URL(sourceUrl).hostname)&&/^\/video\//.test(new URL(sourceUrl).pathname)){
    const boundary=text.indexOf('接下来播放');if(boundary>=0)text=text.slice(0,boundary);
  }
  let at=text.indexOf(title.replace(/\s+/g,' ').trim());
  const review=text.indexOf('玩过');if(review>=0&&/taptap|评价/i.test(title))at=Math.max(0,review-100);
  if(at<0){const tokens=title.match(/[\p{L}\p{N}]{4,}/gu)||[];at=tokens.map(t=>text.indexOf(t)).find(i=>i>=0)??0;}
  const start=Math.max(0,at-120),head=text.slice(start,start+max);
  // Preserve a relevant later section without hard-coding any game or topic.
  const terms=focusTerms.flatMap(t=>t.match(/[\p{L}\p{N}]{2,}/gu)??[]).filter(t=>t.length>=3);
  const focus=terms.map(t=>text.indexOf(t,start+max-600)).filter(i=>i>=start+max-600).sort((a,b)=>a-b)[0];
  if(focus!==undefined)return (text.slice(start,start+600)+'\n[正文分段摘取]\n'+text.slice(Math.max(0,focus-80),focus+max-750)).slice(0,max);
  return head;
}
/** Only concrete, same-host article links; discovery never follows a second hop. */
export function articleLinks(raw:string,parent:string,title:string,max=4):Hit[]{
  const out:Hit[]=[];const host=new URL(parent).hostname;
  const pattern=/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>|\[([^\]]+)\]\(([^)]+)\)/gi;
  for(const m of raw.matchAll(pattern)){
    const label=cleanText(m[2]??m[3]??'');if(label.length<6)continue;
    let url:string;try{url=canonicalUrl(new URL(m[1]??m[4]!,parent).href);}catch{continue;}
    const u=new URL(url);if(u.hostname!==host||isIndexPage(url)||!/\/(?:news|article|topic|post|review|comments|moment)\/(?:\d+|[\w-]{6,})/i.test(u.pathname))continue;
    if(out.some(h=>h.url===url))continue;
    out.push({url,title:label,snippet:`入口标题：${title}；链接文字：${label}`,scopes:[sourceKind(url)],discovery_parent:parent});
    if(out.length>=max)break;
  }return out;
}
export function dateCandidates(text:string,asOf:string,includeFuture=false):Array<{day:string;display:string}> {
  const out=new Map<string,{day:string;display:string}>();
  const matches=[...text.matchAll(/(20\d{2})[年/.-](\d{1,2})[月/.-](\d{1,2})日?/g)].map(m=>({m,year:m[1],month:m[2],day:m[3]}));
  // Unambiguous M/D/YYYY (day > 12) and D/M/YYYY (first > 12).
  // Ambiguous 09/10/2026 is not guessed without locale evidence.
  for(const m of text.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/g)){
    if(Number(m[1])>12)matches.push({m,year:m[3],month:m[2],day:m[1]});
    else if(Number(m[2])>12)matches.push({m,year:m[3],month:m[1],day:m[2]});
  }
  const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
  const words=months.join('|');
  for(const m of text.matchAll(new RegExp('\\b(\\d{1,2})\\s+('+words+')\\s+(20\\d{2})\\b','gi')))
    matches.push({m,year:m[3],month:String(months.indexOf(m[2].toLowerCase())+1),day:m[1]});
  for(const m of text.matchAll(new RegExp('\\b('+words+')\\s+(\\d{1,2}),?\\s+(20\\d{2})\\b','gi')))
    matches.push({m,year:m[3],month:String(months.indexOf(m[1].toLowerCase())+1),day:m[2]});
  for(const m of text.matchAll(/\b(\d{1,2})\.(\d{1,2})\.(20\d{2})\b/g))
    if(Number(m[1])>12)matches.push({m,year:m[3],month:m[2],day:m[1]});
  for(const {m,year,month,day:date} of matches){
    const day=`${year}-${month.padStart(2,'0')}-${date.padStart(2,'0')}`;
    const d=new Date(day+'T00:00:00Z');if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==day||!includeFuture&&day>asOf)continue;
    out.set(day,{day,display:text.slice(Math.max(0,m.index!-40),m.index!+m[0].length+50)});
  }return [...out.values()].slice(0,12);
}
/** Unsupported model dates become unknown, never an invented publication date. */
export function boundNoteDates<T extends {published_at:string|null;revised_at?:string|null;event_time?:string|null;date_basis:string}>(note:T,published:Array<{day:string}>,events:Array<{day:string}>){
  const changes:Array<{field:string;rejected:string}>=[];
  for(const field of ['published_at','revised_at','event_time'] as const){
    const value=note[field],allowed=field==='event_time'?events:published;
    if(value&&!allowed.some(d=>d.day===value)){changes.push({field,rejected:value});(note as Record<string,unknown>)[field]=null;}
  }
  if(changes.length)note.date_basis+=' 日期校核：'+changes.map(c=>`${c.field}=${c.rejected}没有来源候选支持，记为未知`).join('；')+'。';
  return changes;
}
export function pageKind(url:string,text:string):'article_text'|'video_metadata'|'shell'|'unavailable'{
  const {hostname:host,pathname}=new URL(url);
  if(/(^|\.)(bilibili\.com|douyin\.com)$/.test(host)&&/^\/video\//.test(pathname))return text.length?'video_metadata':'unavailable';
  if(!text.trim())return 'unavailable';
  if(text.length<180||/^(Access Denied|Just a moment|验证后继续|请完成验证|Forbidden)/i.test(text.trim())||/(?:^|\n)404(?:\s*\n|$)|404\s*(错误|error|not found)|页面不存在|page not found/i.test(text))return 'shell';
  if(isIndexPage(url))return 'shell';
  return 'article_text';
}
export function isIndexPage(url:string):boolean {
  const u=new URL(url);
  if(/^\/(?:m\/)?(?:zh-cn|zh-tw|en-us)?\/?(?:home|news)?\/?$/.test(u.pathname))return true;
  return /(^|\.)taptap\.cn$/.test(u.hostname)&&/^\/app\/\d+\/(topic|review)\/?$/.test(u.pathname);
}
export function safeMessage(error:unknown,keys:string[]):string {
  let s=error instanceof Error?error.message:String(error);for(const key of keys)if(key)s=s.split(key).join('[REDACTED]');
  return s.replace(/(?:tvly-|fc-|sk-)[A-Za-z0-9_-]{8,}/g,'[REDACTED]').slice(0,500);
}
