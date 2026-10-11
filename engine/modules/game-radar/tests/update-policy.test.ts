import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reserveAttempt,claimOutputRepair,continuationCandidates,validateContinuations,finalReview,continuationDigest,eventCategories,eventContinuations,usageSummary,type Attempt} from '../update-policy.ts';
import {validateResearch,researchScore,assertsConfirmation,type ResearchBatch} from '../contract.ts';
const original=JSON.parse(readFileSync(new URL('./fixtures/pilot-001/research-input.json',import.meta.url),'utf8'));
const mapping=JSON.parse(readFileSync(new URL('./fixtures/pilot-001/engine-mapping.json',import.meta.url),'utf8'));
test('model attempts remain recorded without an eight-call cap',()=>{
  let attempts:Attempt[]=[];for(let i=0;i<8;i++)reserveAttempt(attempts,'model','step').status=i%2?'failed':'reserved';
  attempts=JSON.parse(JSON.stringify(attempts));reserveAttempt(attempts,'model','again');assert.equal(attempts.length,9);
});
test('each stage gets one repair slot which survives resume',()=>{
  const stages:any={};const attempts:Attempt[]=[];
  reserveAttempt(attempts,'model','material_check_16').status='failed';
  assert.equal(claimOutputRepair(stages,attempts,'material_check_16'),true);
  assert.equal(claimOutputRepair(JSON.parse(JSON.stringify(stages)),attempts,'material_check_16'),false);
  assert.equal(claimOutputRepair(stages,attempts,'event_synthesis'),true);
  const capped=Array.from({length:8},()=>({kind:'model',stage:'x',status:'failed'} as Attempt));
  assert.equal(claimOutputRepair({},capped),true);
});
test('web requests share a run cap; Firecrawl has a separate three-attempt limit',()=>{
  const a:Attempt[]=[];for(let i=0;i<3;i++)reserveAttempt(a,'firecrawl','read').status='failed';assert.throws(()=>reserveAttempt(a,'firecrawl','read'),/Firecrawl/);
  for(let i=0;i<21;i++)reserveAttempt(a,'tavily','search');assert.throws(()=>reserveAttempt(a,'tavily','search'),/web/);
});
test('semantic candidate retrieval accepts a different URL but does not declare a match',()=>{
  const b:ResearchBatch={...original,original_material_count:18,hidden_material_count:0,api_calls:0,events:original.events.map((e:any)=>({...e,score:researchScore(e),event_date:'2026-09-28',public_id:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'}))};
  const m=structuredClone(original.materials[0]);m.url='https://another.example/post/777';m.title=b.events[0].title;m.summary=b.events[0].occurrence;
  const found=continuationCandidates([b],[m]);assert.equal(found.length,1);assert.equal(found[0].public_id,'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');
});
test('unknown, uncertain and unexplained continuation UUIDs are rejected after repair too',()=>{
  const uuid='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';const m={categories:{},existing_stories:{'EVT-001':uuid}};
  const candidates=[{public_id:uuid,title:'角色PV争议',occurrence:'PV发布',source_urls:[],date:'2026-10-05',decision:'watch'}];
  assert.throws(()=>validateContinuations(m,{},candidates),/Unverified/);
  assert.throws(()=>validateContinuations(m,{'EVT-001':{relation:'uncertain',reason:'只是同角色，关系未确定'}},candidates),/Unverified/);
  assert.throws(()=>validateContinuations(m,{'EVT-001':{relation:'development',reason:'官方发布同一PV争议的直接回应'}},[]),/Unknown/);
  validateContinuations(m,{'EVT-001':{relation:'development',reason:'官方发布同一PV争议的直接回应'}},candidates);
});
test('a dated community controversy may be recommended without official confirmation',()=>{
  const d=structuredClone(original);d.events=d.events.slice(0,1);d.events[0].confirmed_facts=[];
  for(const m of d.materials)if(d.events[0].members.some((x:any)=>x.material_id===m.id))m.source_kind='community';
  const out=validateResearch(d,{categories:{'EVT-001':mapping.categories['EVT-001']}});assert.equal(out.data.events[0].decision,'recommend');
});
test('new-run narrative cannot call unconfirmed claims officially verified',()=>{
  const d=structuredClone(original);d.run.workflow_version='3';d.events[0].confirmed_facts=[];d.events[0].occurrence='官方已确认角色待遇不公';
  assert.throws(()=>validateResearch(d,mapping),/narrative confirmation/);
});

test('awaiting official confirmation is not an unsupported confirmation assertion',()=>{
  for(const text of ['实际影响待官方确认。','没有官方确认。','并非已被证实。','不代表官方已确认。'])assert.equal(assertsConfirmation(text),false,text);
  for(const text of ['官方已确认角色待遇不公。','已被证实。','没有官方确认，但官方已确认价格。'])assert.equal(assertsConfirmation(text),true,text);
  const d=structuredClone(original);d.run.workflow_version='3';d.events[0].confirmed_facts=[];d.events[0].occurrence='社区提出一项说法，实际影响待官方确认。';
  validateResearch(d,mapping);
});
test('review is derived from final decisions, not an independent model success story',()=>{
  const d=structuredClone(original);for(const e of d.events)e.decision='watch';d.review={verdict:'官方已确认'};
  const r=finalReview(d);assert.match(r.verdict,/推荐 0 个/);assert.ok(!r.verdict.includes('官方已确认'));
});
test('a weaker continuation retains previous evidence under distinct batch labels',()=>{
  const digest=continuationDigest('公告事实：此前公告 [SRC-001]','来源说法：新帖猜测 [SRC-001]','new-run');
  assert.match(digest,/此前公告/);assert.match(digest,/新帖猜测/);assert.match(digest,/引用编号仅属于本批次/);
});
test('categories are derived from event IDs, never material IDs',()=>{
  assert.deepEqual(eventCategories([{id:'EVT-003',category:'community'}]),{'EVT-003':'community'});
});
test('cross-batch mappings are derived from their own event, not model-produced material keys',()=>{
  const uuid='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  const c=eventContinuations([{id:'EVT-003',previous_event:{public_id:uuid,relation:'development',reason:'官方针对此前PV争议的明确回应'}},{id:'EVT-004',previous_event:null}]);
  assert.deepEqual(c.existing_stories,{'EVT-003':uuid});
  assert.deepEqual(Object.keys(c.details),['EVT-003']);
  validateContinuations({categories:{},existing_stories:c.existing_stories},c.details,[{public_id:uuid,title:'PV争议',occurrence:'同一PV',date:null,source_urls:[],decision:'watch'}]);
});
test('failure usage is preserved and cached tokens are not counted twice',()=>{
  const a:Attempt[]=[{kind:'model',stage:'bad',status:'failed',usage:{total_tokens:111}},{kind:'model',stage:'cached',status:'complete',reused:true,usage:{total_tokens:111}}];
  assert.equal(usageSummary(a).actual_tokens,111);assert.equal(usageSummary(a).cost,null);
});
test('a theme-only reason is not accepted as the same occurrence in new runs',()=>{
  const d=structuredClone(original);d.run.workflow_version='3';d.events[0].members[0].reason='与本事件主题一致';
  assert.throws(()=>validateResearch(d,mapping),/Theme-only/);
});
test('same-character but uncertain activity cannot be a cross-batch continuation',()=>{
  const id='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  assert.throws(()=>validateContinuations({categories:{},existing_stories:{'EVT-002':id}},
    {'EVT-002':{relation:'uncertain',reason:'同一角色的PV发布与另一日抽卡活动，不是同一次发生'}},
    [{public_id:id,title:'角色PV发布',occurrence:'10月1日发布PV',date:'2026-10-01',source_urls:[],decision:'watch'}]),/Unverified/);
});
test('reprinted rumours cannot claim independent corroboration from one origin',()=>{
  const d=structuredClone(original);d.run.workflow_version='3';d.events=d.events.slice(0,1);const e=d.events[0];e.confirmed_facts=[];
  for(const member of e.members){const m=d.materials.find((x:any)=>x.id===member.material_id);m.origin_group='one-rumour';m.source_kind='community';}
  e.scores.evidence.reason='多个平台转载相互印证，因此证据充分';
  assert.throws(()=>validateResearch(d,{categories:{'EVT-001':mapping.categories['EVT-001']}}),/Syndication/);
});
test('a repaired event is checked again for nonexistent evidence references',()=>{
  const d=structuredClone(original);d.events[0].source_claims.push({text:'修复后新增说法',refs:['SRC-999']});
  assert.throws(()=>validateResearch(d,mapping),/Invalid evidence/);
});
