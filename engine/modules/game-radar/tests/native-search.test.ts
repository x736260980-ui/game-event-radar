import {stub,tag} from '../../../tests/setup.ts';
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {deepseekSearch} from '../deepseek-search.ts';
import {nativeSearchResults,codexSearchHits} from '../search-input.ts';
import {dedupHits} from '../update-utils.ts';
import {usageSummary,reserveAttempt,type Attempt} from '../update-policy.ts';
import {makeProviders} from '../update-providers.ts';
import {closeDb} from '@aihot/backend/db';

const response={id:'native-stub',content:[{type:'server_tool_use',name:'web_search'},
  {type:'web_search_tool_result',content:[{type:'web_search_result',url:'https://x.com/honkaistarrail/status/123',title:'Official update',page_age:'2026-10-10'},
    {type:'web_search_result',url:'http://127.0.0.1/secret',title:'invalid'}]},
  {type:'text',text:'A generated summary with https://fake.example/never-search-result',citations:[{url:'https://x.com/honkaistarrail/status/123',cited_text:'Actual provider citation snippet'}]}],usage:{input_tokens:50,output_tokens:30}};
let requests:any[]=[];
const server=await stub((_hit,req)=>{requests.push(JSON.parse(req.body));assert.equal(req.url,'/messages');return response;});
process.env.RADAR_DEEPSEEK_SEARCH_ENABLED='true';process.env.DEEPSEEK_SEARCH_BASE_URL=server.url;process.env.LLM_API_KEY='test-key';process.env.LLM_MODEL='native-test-model';
after(async()=>{await server.close();await closeDb();});

test('native search uses the real server tool, counts tokens and reuses its receipt on recovery',async()=>{
  const q='Star Rail official '+tag(),attempts:Attempt[]=[];
  const a=await deepseekSearch(q,'official','2026-10-11',3,attempts,()=>{});
  const b=await deepseekSearch(q,'official','2026-10-11',3,attempts,()=>{});
  assert.equal(a.hits.length,1);assert.equal(a.hits[0].snippet,'Actual provider citation snippet');assert.equal(a.searches,1);
  assert.equal(b.reused,true);assert.equal(requests.length,1);assert.equal(requests[0].tools[0].type,'web_search_20250305');
  assert.equal(requests[0].tools[0].max_uses,3);
  assert.equal(usageSummary(attempts).actual_tokens,80);assert.equal(usageSummary(attempts).model_attempts,2);assert.equal(usageSummary(attempts).deepseek_search_attempts,2);
});
test('a prose answer or tool error is not a successful web search',()=>{
  assert.throws(()=>nativeSearchResults({content:[{type:'text',text:'Found https://invented.example'}]},'q','official'),/no native/);
  const r=nativeSearchResults({content:[{type:'web_search_tool_result',content:{type:'web_search_tool_result_error',error_code:'too_many_requests'}}]},'q','official');
  assert.equal(r.hits.length,0);assert.deepEqual(r.errors,['too_many_requests']);
  const partial=nativeSearchResults({content:[...response.content,{type:'web_search_tool_result',content:[{type:'web_search_tool_result_error',error_code:'max_uses_exceeded'}]}]},'q','official');
  assert.equal(partial.hits.length,1);assert.deepEqual(partial.errors,['max_uses_exceeded']);
});
test('provider discovery calls native search even when Tavily credentials exist',async()=>{
  const attempts:Attempt[]=[],p=makeProviders({tavily:'present-but-must-not-search',firecrawl:''},'2026-10-11',attempts);
  const hits=await p.search('Honkai Star Rail '+tag(),'community');assert.equal(hits.length,1);
  assert.deepEqual(attempts.map(a=>a.kind),['deepseek_search']);assert.equal(p.searchTrace[0].provider,'deepseek_native');
});
test('Codex packet keeps traceable queries and cannot invent a future search or body status',()=>{
  const packet={version:1,provider:'codex_web',as_of:'2026-10-11',searched_at:'2026-10-11T01:00:00Z',queries:['Honkai Star Rail official'],results:[
    {url:'https://x.com/honkaistarrail/status/123',title:'Search result',snippet:'Only a search snippet',query_index:0,scope:'official',source_ref:'tool-search-0'}]};
  const hits=codexSearchHits(packet,'2026-10-11');assert.equal(hits[0].search_provenance?.[0].provider,'codex_web');
  assert.throws(()=>codexSearchHits({...packet,as_of:'2026-10-12'},'2026-10-11'),/date/);
  assert.throws(()=>codexSearchHits({...packet,results:[{...packet.results[0],query_index:9}]},'2026-10-11'),/query index/);
  assert.throws(()=>codexSearchHits({...packet,results:[{...packet.results[0],access:'body'}]},'2026-10-11'));
  const merged=dedupHits([...hits,...nativeSearchResults(response,'q','official').hits],10);
  assert.equal(merged.length,1);assert.equal(merged[0].search_provenance?.length,2);
});
test('native searches share web quota across saved attempts and preserve Firecrawl quota',()=>{
  const a:Attempt[]=[];for(let i=0;i<24;i++)reserveAttempt(a,'deepseek_search','x');
  assert.throws(()=>reserveAttempt(JSON.parse(JSON.stringify(a)),'tavily','extract'),/web/);
});
