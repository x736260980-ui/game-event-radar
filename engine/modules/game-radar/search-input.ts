import {z} from 'zod';
import {canonicalUrl,type Hit} from './update-utils.ts';

export const CodexSearchSchema=z.object({
  version:z.literal(1),provider:z.literal('codex_web'),searched_at:z.string().datetime(),
  as_of:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  queries:z.array(z.string().min(3).max(300)).min(1).max(12),
  results:z.array(z.object({url:z.string().url(),title:z.string().min(1).max(500),snippet:z.string().max(1500),
    query_index:z.number().int().min(0),scope:z.enum(['official','media','community']),
    source_ref:z.string().min(1).max(200)}).strict()).max(30),
}).strict();
export type CodexSearch=z.infer<typeof CodexSearchSchema>;
export function codexSearchHits(value:unknown,asOf:string):Hit[]{
  const input=CodexSearchSchema.parse(value);
  if(input.as_of!==asOf||input.searched_at.slice(0,10)>asOf)throw new Error('Codex search date does not match this update');
  return input.results.map(r=>{
    if(r.query_index>=input.queries.length)throw new Error('Unknown Codex query index');
    return {url:canonicalUrl(r.url),original_url:r.url,title:r.title,snippet:r.snippet,scopes:[r.scope],
      discovery_query:input.queries[r.query_index],search_provenance:[{provider:'codex_web',query:input.queries[r.query_index],source_ref:r.source_ref,searched_at:input.searched_at}]};
  });
}

// Only provider-returned result blocks qualify as native search. Model prose is never mined for URLs.
export function nativeSearchResults(value:any,query:string,scope:string):{hits:Hit[];searches:number;errors:string[]}{
  const blocks=Array.isArray(value?.content)?value.content:[];
  const results=blocks.filter((b:any)=>b.type==='web_search_tool_result');
  if(!results.length)throw new Error('DeepSeek returned no native web_search_tool_result');
  const citations=new Map<string,string>();
  for(const b of blocks.filter((b:any)=>b.type==='text'))for(const c of b.citations??[]){
    if(typeof c.url==='string'&&typeof c.cited_text==='string')citations.set(c.url,c.cited_text.slice(0,1500));
  }
  const hits:Hit[]=[],seen=new Set<string>(),errors:string[]=[];
  for(const block of results){
    if(!Array.isArray(block.content)){errors.push(String(block.content?.error_code??'native search error'));continue;}
    for(const r of block.content){
      if(r.type==='web_search_tool_result_error'){errors.push(String(r.error_code??'native search error'));continue;}
      if(r.type!=='web_search_result'||typeof r.url!=='string')continue;
      let url:string;try{url=canonicalUrl(r.url);}catch{continue;}
      if(seen.has(url))continue;seen.add(url);
      hits.push({url,original_url:r.url,title:typeof r.title==='string'&&r.title?r.title:url,
        snippet:citations.get(r.url)??(typeof r.content==='string'?r.content.slice(0,1500):''),scopes:[scope],discovery_query:query,
        search_provenance:[{provider:'deepseek_native',query,...(typeof r.page_age==='string'?{date_hint:r.page_age}:{})}]});
    }
  }
  return {hits:hits.slice(0,8),searches:blocks.filter((b:any)=>b.type==='server_tool_use'&&b.name==='web_search').length,errors};
}
