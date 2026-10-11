// Re-evaluate saved discovery after fixing a lead-pool bug. No search is repeated;
// attempts, budgets, failures and spent repair slots are inherited, not reset.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import path from 'node:path';
import {dedupHits} from '../modules/game-radar/update-utils.ts';
import {codexSearchHits} from '../modules/game-radar/search-input.ts';
const [source,destination]=process.argv.slice(2);
if(!source||!destination)throw new Error('Usage: replay-native-discovery.ts source-run new-run');
if(existsSync(destination))throw new Error('Replay destination must be new');
const old=JSON.parse(readFileSync(path.join(source,'update-state.json'),'utf8'));
if(old.version!==11||!old.stages.plan||!old.stages.search_results)throw new Error('Recorded V11 discovery is required');
const s=old.stages;
for(const q of [...s.plan,...s.followup_plan??[]])if(!(q.scope+':'+q.query in s.search_results))throw new Error('Incomplete recorded search');
const native=s.plan.flatMap((q:any)=>s.search_results[q.scope+':'+q.query]);
const codex=old.options.codexSearch?codexSearchHits(old.options.codexSearch,old.options.asOf):[];
const stages={plan:s.plan,discovery_history:s.discovery_history,fixed_sources:s.fixed_sources,index_readings:s.index_readings,
  discovery_source_hints:[...(s.discovery_source_hints??[]),...(s.materials??[]).map((m:any)=>({url:m.url,published_at:m.published_at,origin_group:m.origin_group}))],
  followup_plan:s.followup_plan,search_results:s.search_results,search_trace:s.search_trace,search_failures:s.search_failures,
  search_log:s.search_log,repairs:s.repairs,hits:dedupHits([...native,...codex],80)};
const state={version:12,options:{...old.options,runId:path.basename(destination),publish:false},status:'recorded_discovery_replay',
  models:old.models,attempts:old.attempts,web_receipt_ids:old.web_receipt_ids,stages,
  inherited_from:old.options.runId,inherited_at:new Date().toISOString(),reason:'用已保存的原始搜索和日期记录验证V12近期优先、同源名额；继承全部用量和已用修复槽，不重新搜索。'};
mkdirSync(destination,{recursive:true});
writeFileSync(path.join(destination,'update-state.json'),JSON.stringify(state,null,2)+'\n',{encoding:'utf8',flag:'wx'});
writeFileSync(path.join(destination,'search-channel-log.json'),JSON.stringify(s.search_trace,null,2)+'\n',{encoding:'utf8',flag:'wx'});
writeFileSync(path.join(destination,'initial-search-hits.json'),JSON.stringify(stages.hits,null,2)+'\n',{encoding:'utf8',flag:'wx'});
console.log(JSON.stringify({ok:true,hits:stages.hits.length,codex_hits:codex.length,inherited_attempts:old.attempts.length,new_search_calls:0}));
