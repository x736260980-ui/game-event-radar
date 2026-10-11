import { guardedFetch } from '@aihot/backend/lib/http-fetch';
import { paidRequest,assertAccepted,completeReceipt } from '@aihot/backend/providers/receipts';
import { sql } from '@aihot/backend/db';
import { bodySegment,canonicalUrl,cleanText,pageKind,safeMessage,isIndexPage,articleLinks,type Hit,type Scope } from './update-utils.ts';
import {reserveAttempt,type Attempt,type AttemptKind} from './update-policy.ts';
import {FIXED_SOURCES,sourceIdentity,isOfficialAccount} from './sources.ts';
import {createHash} from 'node:crypto';
import {deepseekSearch,nativeSearchConfig} from './deepseek-search.ts';
export interface SearchKeys {tavily:string;firecrawl:string}
export interface Reading {url:string;original_url?:string;title:string;text:string;kind:ReturnType<typeof pageKind>;provider:string;discovered_links?:Hit[];identity?:ReturnType<typeof sourceIdentity>;cited_official_links?:Hit[];trace:Array<{provider:string;status:string;receipt_id?:number}>}
function officialLinks(raw:string,parent:string):Hit[]{
  const urls=[...raw.matchAll(/https?:\/\/[^\s<>"')\\]+/g)].map(m=>m[0].replace(/&amp;/g,'&'));
  return [...new Set(urls)].filter(u=>{try{return isOfficialAccount(u)&&/\/status\/\d+/.test(new URL(u).pathname);}catch{return false;}}).slice(0,3).map(url=>({url:canonicalUrl(url),title:'报道引用的官方原帖',snippet:'需读取原帖核实',scopes:['official'],discovery_parent:parent}));
}
export function makeProviders(keys:SearchKeys,asOf:string,attempts:Attempt[]=[],checkpoint:()=>void=()=>{},windowDays=7){
  const receipts:number[]=[];const errors:string[]=[];
  const searchTrace:Array<{query:string;scope:Scope;provider:string;status:string;count?:number;receipt_id?:number}>=[];
  let budgetReady:Promise<unknown>|undefined;
  async function checkSources(previous:Record<string,string>={}){
    return Promise.all(FIXED_SOURCES.map(async source=>{
      const checked_at=new Date().toISOString();
      try{
        const response=await guardedFetch(source.url,{timeoutMs:8000,maxBytes:1024*1024});
        if(response.status<200||response.status>=300)throw new Error(`HTTP ${response.status}`);
        const raw=response.text(),links=articleLinks(raw,source.url,source.name),text=cleanText(raw);
        if(text.length<100||/access denied|captcha|验证后继续|安全验证/i.test(text.slice(0,2000)))throw new Error('入口受阻或只有页面外壳');
        const fingerprint=createHash('sha256').update(JSON.stringify(links.map(l=>l.url).sort())).digest('hex');
        return {...source,checked_at,status:links.length?(previous[source.url]===fingerprint?'no_new_links':'checked'):'no_article_links',fingerprint,links,
          note:links.length?'入口链接检查完成；不是事件正文。':'入口可访问，但未提取到文章链接；不能据此判断没有新资讯。'};
      }catch(e){return {...source,checked_at,status:'blocked',links:[],note:safeMessage(e,[])};}
    }));
  }
  async function post(service:'tavily'|'firecrawl',endpoint:string,input:Record<string,unknown>,transform:(v:any)=>unknown){
    const key=keys[service];if(!key)throw new Error(`${service} API key missing`);
    const attempt=reserveAttempt(attempts,service as AttemptKind,endpoint);checkpoint();
    try{
    // Default budgets for newly connected providers; preserve any operator-set limits.
    budgetReady??=sql`INSERT INTO budgets (service,per_minute,per_hour,per_day) VALUES ('tavily',24,50,100),('firecrawl',6,12,30) ON CONFLICT (service) DO NOTHING`;
    await budgetReady;
    const r=await paidRequest({service,purpose:'radar.web_update',subject:asOf+':'+endpoint,
      identity:{version:'radar-web-v2',asOf,endpoint,input},requestSummary:{endpoint,...input}},async()=>{
      const response=await guardedFetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},body:JSON.stringify(input),timeoutMs:45000,maxBytes:4*1024*1024,route:'direct'});
      const text=response.text();assertAccepted(service,response.status,safeMessage(text,[key]));const raw=JSON.parse(text);
      if(raw.success===false)throw new Error(`${service} returned unsuccessful response`);
      // Store only needed, bounded text in the paid receipt, not whole third-party pages.
      return {response:transform(raw),requestId:raw.request_id??response.headers.get('x-request-id'),usage:null,cost:null};
    });
    await sql.begin(async tx=>completeReceipt(tx,r.receiptId));receipts.push(r.receiptId);
    Object.assign(attempt,{status:'complete',receipt_id:r.receiptId,reused:r.reused});checkpoint();return {data:r.response as any,id:r.receiptId,reused:r.reused};
    }catch(e){Object.assign(attempt,{status:'failed',error:safeMessage(e,[key])});checkpoint();throw e;}
  }
  async function search(query:string,scope:Scope):Promise<Hit[]>{
    try{const r=await deepseekSearch(query,scope,asOf,windowDays,attempts,checkpoint);receipts.push(r.receipt_id);
      searchTrace.push({query,scope,provider:'deepseek_native',status:r.reused?'cached':r.errors.length?'partial: '+r.errors.join('; '):'complete',count:r.hits.length,receipt_id:r.receipt_id});return r.hits;}
    catch(e){const error=safeMessage(e,[nativeSearchConfig().key]);searchTrace.push({query,scope,provider:'deepseek_native',status:error});errors.push(error);throw e;}
  }
  async function read(hits:Hit[]):Promise<Reading[]>{
    const map=new Map<string,Reading>();
    // Cheap ordinary reads first; low concurrency and bounded time/size.
    for(let i=0;i<hits.length;i+=2)await Promise.all(hits.slice(i,i+2).map(async h=>{
      let text='',status='';let discovered:Hit[]=[],cited:Hit[]=[];let identity=sourceIdentity(h.url);
      try{const r=await guardedFetch(h.original_url??h.url,{timeoutMs:8000,maxBytes:1024*1024});status=`HTTP ${r.status}`;
        if(r.status>=200&&r.status<300){const raw=r.text();identity=sourceIdentity(h.url,raw);cited=officialLinks(raw,h.url);const main=/<(?:article|main)\b[^>]*>([\s\S]*?)<\/(?:article|main)>/i.exec(raw);
          if(isIndexPage(h.url)&&!h.discovery_parent)discovered=articleLinks(raw,h.url,h.title);
          const publication=/<meta\b[^>]*(?:property|name)=["'](?:article:published_time|datePublished|pubdate)["'][^>]*content=["']([^"']+)/i.exec(raw)?.[1];
          const revision=/<meta\b[^>]*(?:property|name)=["'](?:article:modified_time|dateModified)["'][^>]*content=["']([^"']+)/i.exec(raw)?.[1];
          text=(publication?`页面发布日期元信息：${publication}\n`:'')+(revision?`页面修订日期元信息：${revision}\n`:'')+bodySegment(main?.[1]??raw,h.title,2100,[h.discovery_query??''],h.url);}
      }catch(e){status=safeMessage(e,[]);}
      const kind=pageKind(h.url,text);map.set(h.url,{url:h.url,original_url:h.original_url??h.url,title:h.title,text,kind,provider:'http',identity,cited_official_links:cited,discovered_links:discovered,trace:[{provider:'http',status}]});
    }));
    const need=hits.filter(h=>!isIndexPage(h.url)&&['shell','unavailable'].includes(map.get(h.url)!.kind));
    for(let i=0;i<need.length;i+=5){const batch=need.slice(i,i+5);
      try{const r=await post('tavily','https://api.tavily.com/extract',{urls:batch.map(h=>h.url),extract_depth:'advanced',format:'markdown'},v=>({results:(v.results??[]).map((x:any)=>{
        const h=batch.find(b=>canonicalUrl(b.url)===canonicalUrl(x.url));return {url:x.url,title:x.title,cited:officialLinks(String(x.raw_content??''),x.url),text:bodySegment(String(x.raw_content??''),h?.title??x.title??'',2200,[h?.discovery_query??''],x.url)};}),failed_results:(v.failed_results??[]).map((x:any)=>({url:x.url,error:safeMessage(x.error,[keys.tavily])}))}));
        for(const h of batch){const row=map.get(h.url)!,found=r.data.results.find((x:any)=>canonicalUrl(x.url)===h.url);row.trace.push({provider:'tavily',status:found?'returned_text':'not_returned',receipt_id:r.id});
          if(found?.text){row.text=found.text;row.cited_official_links=found.cited??row.cited_official_links;row.kind=pageKind(h.url,row.text);row.provider='tavily';}}
      }catch(e){const error=safeMessage(e,[keys.tavily]);errors.push(error);for(const h of batch)map.get(h.url)!.trace.push({provider:'tavily',status:error});}
    }
    for(const h of hits.filter(h=>!isIndexPage(h.url)&&['shell','unavailable'].includes(map.get(h.url)!.kind)).slice(0,Math.max(0,3-attempts.filter(a=>a.kind==='firecrawl').length))){
      const row=map.get(h.url)!;if(!keys.firecrawl)continue;
      try{const r=await post('firecrawl','https://api.firecrawl.dev/v2/scrape',{url:h.original_url??h.url,formats:['markdown'],onlyMainContent:true,waitFor:2000},v=>({cited:officialLinks(String(v.data?.markdown??''),h.url),text:bodySegment(String(v.data?.markdown??''),h.title,2200,[h.discovery_query??''],h.url),status:v.data?.metadata?.statusCode??null}));
        row.trace.push({provider:'firecrawl',status:String(r.data.status??'returned'),receipt_id:r.id});if(r.data.text){row.text=r.data.text;row.cited_official_links=r.data.cited??row.cited_official_links;row.kind=pageKind(h.url,row.text);row.provider='firecrawl';}
      }catch(e){const error=safeMessage(e,[keys.firecrawl]);errors.push(error);row.trace.push({provider:'firecrawl',status:error});}
    }
    for(const h of hits){const row=map.get(h.url)!;if(['shell','unavailable'].includes(row.kind)){row.text=bodySegment(h.snippet,h.title,700,[],h.url);row.kind='unavailable';row.provider='search_excerpt';}}
    return hits.map(h=>map.get(h.url)!);
  }
  return {search,read,checkSources,receipts,errors,searchTrace,get attemptedRequests(){return attempts.filter(a=>a.kind!=='model').length}};
}
