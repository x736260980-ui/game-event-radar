import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import type {ResearchBatch} from '../contract.ts';
import {archiveEvents,archiveMaterials,visibleBatches,displayOutcome,displayEvent,featuredMaterials} from '../view.ts';
const raw=JSON.parse(readFileSync(new URL('./fixtures/pilot-001/research-input.json',import.meta.url),'utf8'));
const batch=(id:string,day:string):ResearchBatch=>({...raw,run:{...raw.run,id,as_of:day},events:raw.events.map((e:any,i:number)=>({...e,score:60,public_id:`public-${i}`,event_date:'2026-09-20'})),material_outcomes:raw.materials.map((m:any)=>({material_id:m.id,status:'pending',event_ids:[],reason:'待归组'}))});
test('technical revisions are not new days and experiment runs remain secondary',()=>{const a=batch('original','2026-10-06'),b=batch('revision','2026-10-06');assert.equal(archiveEvents([b,a]).length,a.events.length);assert.equal(visibleBatches([a,b,batch('starrail-auto-01','2026-10-09')]).length,2);assert.equal(archiveMaterials([b,a]).length,a.materials.length);});
test('historical recommendations do not masquerade as completed dual review',()=>{const a=batch('original','2026-10-06');assert.equal(archiveEvents([a])[0].event.decision,'watch');assert.equal(a.events[0].decision,'recommend');});
test('grouped is independent from recommendation; missing dates are not exclusion',()=>{assert.equal(displayOutcome({material_id:'SRC-001',status:'grouped',event_ids:['EVT-001'],reason:'观察事件'}),'grouped');assert.equal(displayOutcome({material_id:'SRC-002',status:'not_pursued',event_ids:[],reason:'缺根帖日期，保留后续线索'}),'pending');});
test('legacy explicit entertainment and unrelated industry reasons are exclusions',()=>{for(const reason of ['属社区虚构/娱乐性内容','版号资讯与当前游戏事件无直接关联','无实质问答内容'])assert.equal(displayOutcome({material_id:'SRC-001',status:'not_pursued',event_ids:[],reason}),'excluded');});
test('display spelling corrections never rewrite archived evidence or review packets',()=>{const e={...batch('example','2026-10-10').events[0],title:'珍珠配队',keywords:['海瑟音 服装 古老梦华']};const shown=displayEvent(e);assert.equal(shown.title,'Pearl配队');assert.equal(shown.keywords[0],'Hyacine 服装 古老梦华');assert.equal(e.title,'珍珠配队');assert.equal(e.keywords[0],'海瑟音 服装 古老梦华');assert.equal(shown.dual_score,e.dual_score);});

test('watch events may have a featured body without becoming recommended',()=>{
 const a=batch('example','2026-10-10');a.events=[a.events[0]];a.events[0].decision='watch';a.events[0].members=[{material_id:a.materials[0].id,relation:'same_occurrence',reason:'具体发生'}];a.materials[0].access='body';a.materials[0].decision='use';a.material_outcomes[0]={material_id:a.materials[0].id,status:'grouped',event_ids:[a.events[0].id],reason:'观察事件'};
 assert.equal(featuredMaterials([a]).length,1);assert.equal(a.events[0].decision,'watch');
 a.materials[0].access='excerpt_only';assert.equal(featuredMaterials([a]).length,0);
 a.materials[0].access='body';a.events[0].decision='drop';assert.equal(featuredMaterials([a]).length,0);
});
