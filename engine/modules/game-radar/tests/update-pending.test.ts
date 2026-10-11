// Resume from recorded discovery; only an isolated local model stub is contacted.
import {stub,tag} from '../../../tests/setup.ts';
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {runUpdate,type UpdateOptions} from '../update.ts';
import {closeDb} from '@aihot/backend/db';
import {evidenceHash,pendingScore} from '../scoring.ts';
import {importResearch} from '../import.ts';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/starrail-retrospective-20261010-v6/research-input.json',import.meta.url),'utf8'));
const root=mkdtempSync(path.join(tmpdir(),'radar-v6-'));
let packet:any;
let truncate=0;const outputLimits:number[]=[];
const provider=await stub((_hit,req)=>{const body=JSON.parse(req.body);outputLimits.push(body.max_tokens);assert.match(body.messages.find((m:any)=>m.role==='system').content,/翻译错误、撤回或更正/);packet=JSON.parse(body.messages.find((m:any)=>m.role==='user').content);
 if(truncate>0){truncate--;return {choices:[{finish_reason:'length',message:{content:'{"items":['}}],usage:{prompt_tokens:20,completion_tokens:10,total_tokens:30}};}
 return {choices:[{message:{content:JSON.stringify({items:packet.events.map((e:any)=>({id:e.id,ratings:Object.entries(fixture.events[1].scores).map(([dimension,score]:[string,any])=>({dimension,...score})),decision:'recommend',reason:'测试：有官方正文，但必须等待真实Codex复评',source_refs:['SRC-001']}))})}}],usage:{prompt_tokens:20,completion_tokens:10,total_tokens:30}};});
process.env.LLM_BASE_URL=provider.url+'/v1';process.env.LLM_API_KEY='test-key';process.env.LLM_MODEL='local-test-model';
after(async()=>{await provider.close();await closeDb();rmSync(root,{recursive:true,force:true});});
function prepare(n:number){
 const opts:UpdateOptions={runId:'v6-test-'+tag(),game:'崩坏：星穹铁道',asOf:'2026-10-10',windowDays:14,maxMaterials:1,root,publish:false};
 const m=structuredClone(fixture.materials[0]),e=structuredClone(fixture.events[1]);m.summary+=' 测试输入 '+n+' '+opts.runId;delete e.dual_score;e.category='resource';e.rights_watch=false;e.previous_event=null;
 const dir=path.join(root,opts.runId);mkdirSync(dir);writeFileSync(path.join(dir,'update-state.json'),JSON.stringify({version:13,options:opts,status:'started',models:[],attempts:Array.from({length:n},()=>({kind:'model',stage:'previous_failed',status:'failed'})),stages:{fixed_sources:[],plan:[],hits:[],followup_plan:[],final_hits:[],readings:[{url:m.url,title:m.title,text:m.excerpt.repeat(5),kind:'article_text',provider:'recorded',trace:[]}],materials:[m],continuation_candidates:[],synthesis:{events:[e],unassigned_materials:[]}}}),'utf8');return {opts,dir};
}
test('V6 separately scores the exact final packet, publishes pending, and resumes without another model call',async()=>{
 const {opts,dir}=prepare(0);const before=provider.hits();const result=await runUpdate(opts,{tavily:'test-key',firecrawl:''});assert.equal(result.recommendations,0);assert.equal(provider.hits()-before,1);
 const d=JSON.parse(readFileSync(path.join(dir,'research-input.json'),'utf8')),e=d.events[0];assert.equal(d.run.workflow_version,'13');assert.equal(e.decision,'watch');assert.equal(e.dual_score.status,'pending');assert.equal(e.dual_score.first.decision,'recommend');assert.equal(e.dual_score.first.model,'local-test-model');assert.equal(e.dual_score.second,null);assert.equal(e.dual_score.snapshot_hash,evidenceHash(d.materials,e));assert.ok(!('scores' in packet.events[0]));assert.deepEqual(packet.weights,{impact:3,novelty:2,evidence:2,audience:2,investigability:1});
 await runUpdate(opts,{tavily:'test-key',firecrawl:''});assert.equal(provider.hits()-before,1);
});
test('quarantined event does not block its valid sibling, including resume',async()=>{
 const {opts,dir}=prepare(0),file=path.join(dir,'update-state.json');
 const state=JSON.parse(readFileSync(file,'utf8')),bad=structuredClone(state.stages.synthesis.events[0]);bad.id='EVT-099';bad.confirmed_facts=[{text:'无依据确认',refs:['SRC-999']}];
 state.stages.synthesis.events.push(bad);state.stages.repairs={boundary_repair:true};writeFileSync(file,JSON.stringify(state),'utf8');
 const before=provider.hits();await runUpdate(opts,{tavily:'test-key',firecrawl:''});
 const completed=readFileSync(path.join(dir,'research-input.json'),'utf8'),d=JSON.parse(completed);
 assert.equal(d.events.length,1);assert.equal(d.run.quarantined_event_count,1);assert.ok(existsSync(path.join(dir,'quarantined-events.json')));
 await runUpdate(opts,{tavily:'test-key',firecrawl:''});assert.equal(provider.hits()-before,1);assert.equal(readFileSync(path.join(dir,'research-input.json'),'utf8'),completed);
});

test('V8 retains previous attempts while allowing an independent score after eight attempts',async()=>{
 const {opts,dir}=prepare(8),before=provider.hits();await runUpdate(opts,{tavily:'test-key',firecrawl:''});assert.equal(provider.hits(),before+1);assert.equal(existsSync(path.join(dir,'research-input.json')),true);const state=JSON.parse(readFileSync(path.join(dir,'update-state.json'),'utf8'));assert.equal(state.attempts.length,9);assert.equal(state.status,'validated');
});
test('truncated JSON gets one larger bounded repair and both attempts remain recorded',async()=>{
 const {opts,dir}=prepare(0),before=outputLimits.length;truncate=1;await runUpdate(opts,{tavily:'test-key',firecrawl:''});
 assert.equal(outputLimits.length-before,2);assert.ok(outputLimits[before+1]>outputLimits[before]);
 const state=JSON.parse(readFileSync(path.join(dir,'update-state.json'),'utf8'));assert.equal(state.attempts[0].status,'failed');assert.equal(state.attempts[1].status,'complete');assert.equal(state.stages.repairs.independent_first_score,true);
});
test('a second truncated response stops without publication or a third repair on resume',async()=>{
 const {opts,dir}=prepare(0),before=outputLimits.length;truncate=2;
 await assert.rejects(runUpdate(opts,{tavily:'test-key',firecrawl:''}),/output token limit/);assert.equal(outputLimits.length-before,2);
 assert.equal(existsSync(path.join(dir,'research-input.json')),false);
 const state=JSON.parse(readFileSync(path.join(dir,'update-state.json'),'utf8'));assert.equal(state.status,'failed');assert.equal(state.attempts.length,2);assert.equal(state.stages.repairs.independent_first_score,true);
 await assert.rejects(runUpdate(opts,{tavily:'test-key',firecrawl:''}),/repair exhausted/);assert.equal(outputLimits.length-before,2);
});
test('completing a published pending fixture keeps its event identity and derives the report from final decisions',async()=>{
 const d=structuredClone(fixture);d.run={...d.run,id:'pending-fixture-'+tag(),retrospective:false,window_days:14,as_of:'2026-10-10',researcher:'synthetic local test'};delete d.run.coverage;
 d.materials=[d.materials[0]];d.events=[d.events[1]];const e=d.events[0],second=e.dual_score.second;e.dual_score=pendingScore(d.materials,e,e.dual_score.first);e.scores=e.dual_score.first.scores;e.decision='watch';e.decision_reason='等待测试复评';d.material_outcomes=[{material_id:'SRC-001',status:'grouped',event_ids:[e.id],reason:'同一公告'}];d.review={verdict:'old recommendation count must not survive'};
 const mapping={categories:{[e.id]:'resource'},existing_stories:{}};const published=await importResearch(d,mapping);
 const dir=path.join(root,d.run.id);mkdirSync(dir);const output=path.join(root,'completed-fixture-'+tag());
 for(const [name,value] of [['input.json',d],['mapping.json',mapping],['blind.json',{events:[{id:e.id,snapshot_hash:e.dual_score.snapshot_hash,review:second}]}]])writeFileSync(path.join(dir,name as string),JSON.stringify(value),'utf8');
 execFileSync(process.execPath,[fileURLToPath(new URL('../../../scripts/complete-review.ts',import.meta.url)),path.join(dir,'input.json'),path.join(dir,'blind.json'),path.join(dir,'mapping.json'),output],{env:process.env,timeout:30000});
 const completed=JSON.parse(readFileSync(path.join(output,'research-input.json'),'utf8')),m=JSON.parse(readFileSync(path.join(output,'engine-mapping.json'),'utf8'));assert.equal(completed.events[0].dual_score.status,'complete');assert.equal(completed.events[0].decision,'watch');assert.equal(completed.run.model_api_calls,0);assert.equal(completed.run.parent_run_id,d.run.id);assert.ok(m.existing_stories[e.id]);assert.match(completed.review.verdict,/推荐 0 个/);assert.ok(existsSync(path.join(output,'candidates.md')));assert.ok(published);
});
