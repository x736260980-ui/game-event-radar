import {config,credential} from '@aihot/backend/config';
import {sql} from '@aihot/backend/db';
import {paidRequest,assertAccepted,completeReceipt,rejectReceivedResponse} from '@aihot/backend/providers/receipts';
import {reserveAttempt,type Attempt} from './update-policy.ts';
import {nativeSearchResults} from './search-input.ts';
import {safeMessage,type Scope} from './update-utils.ts';

export function nativeSearchConfig(){
  const base=credential('models','LLM_BASE_URL')??'';
  const enabled=process.env.RADAR_DEEPSEEK_SEARCH_ENABLED!=='false'&&
    (process.env.RADAR_DEEPSEEK_SEARCH_ENABLED==='true'||/^https:\/\/api\.deepseek\.com(?:\/|$)/.test(base));
  return {enabled,endpoint:(process.env.DEEPSEEK_SEARCH_BASE_URL??'https://api.deepseek.com/anthropic/v1').replace(/\/$/,'')+'/messages',
    key:credential('models','DEEPSEEK_API_KEY')??credential('models','LLM_API_KEY')??'',model:process.env.DEEPSEEK_SEARCH_MODEL??process.env.LLM_MODEL??'deepseek-flash'};
}
export async function deepseekSearch(query:string,scope:Scope,asOf:string,windowDays:number,attempts:Attempt[],save:()=>void){
  const settings=nativeSearchConfig();
  if(!settings.enabled||!settings.key)throw new Error('DeepSeek native search is not configured');
  if(!config.modelCallsEnabled||process.env.COLLECT_ENABLED!=='true')throw new Error('Native search switches are disabled');
  const a=reserveAttempt(attempts,'deepseek_search',query);save();
  const body={model:settings.model,max_tokens:2200,messages:[{role:'user',content:[{type:'text',
    text:`Perform a web search for the query: ${query}\nPrefer original sources published within the ${windowDays} days ending ${asOf}. Return source citations. Search snippets are not verified article bodies.`}]}],
    tools:[{type:'web_search_20250305',name:'web_search',max_uses:3}]};
  try{
    const r=await paidRequest({service:'llm',model:settings.model,purpose:'radar.native_search',subject:asOf+':'+query,
      identity:{version:'radar-native-search-v2',endpoint:settings.endpoint,body},requestSummary:{endpoint:settings.endpoint,query,asOf,windowDays,tool:'web_search_20250305',max_uses:3}},async()=>{
      const res=await fetch(settings.endpoint,{method:'POST',headers:{'content-type':'application/json','x-api-key':settings.key,
        authorization:`Bearer ${settings.key}`,'anthropic-version':'2023-06-01'},body:JSON.stringify(body),signal:AbortSignal.timeout(90000),redirect:'error'});
      const text=await res.text();assertAccepted('deepseek-native',res.status,safeMessage(text,[settings.key]));const raw=JSON.parse(text);
      const u=raw.usage??null;
      return {response:raw,requestId:raw.id??res.headers.get('x-request-id'),usage:u?{...u,total_tokens:Number(u.input_tokens??0)+Number(u.output_tokens??0)}:null,cost:null};
    });
    const raw=r.response as any;
    const u=raw.usage??null;Object.assign(a,{receipt_id:r.receiptId,reused:r.reused,usage:u?{...u,total_tokens:Number(u.input_tokens??0)+Number(u.output_tokens??0)}:null});save();
    let result:ReturnType<typeof nativeSearchResults>;
    try{result=nativeSearchResults(raw,query,scope);}catch(e){await rejectReceivedResponse(r.receiptId,safeMessage(e,[]));throw e;}
    if(result.errors.length&&!result.hits.length){await rejectReceivedResponse(r.receiptId,'Native search tool failed: '+result.errors.join('; '));throw new Error('Native search tool failed: '+result.errors.join('; '));}
    await sql.begin(async tx=>completeReceipt(tx,r.receiptId));
    Object.assign(a,{status:'complete',native_searches:result.searches,result_count:result.hits.length,tool_errors:result.errors});save();
    return {...result,receipt_id:r.receiptId,reused:r.reused};
  }catch(e){Object.assign(a,{status:'failed',error:safeMessage(e,[settings.key]),...((e as any).receiptId?{receipt_id:(e as any).receiptId}:{})});save();throw e;}
}
