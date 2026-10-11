import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evidencePacket,evidenceHash,pendingScore,resolveScores,validateDualScore,weightedScore,type ScoreReview,firstReviewsFromWire} from '../scoring.ts';
import {displayOutcome} from '../view.ts';
const data=JSON.parse(readFileSync(new URL('./fixtures/pilot-001/research-input.json',import.meta.url),'utf8'));
const review=(reviewer:'deepseek'|'codex',decision:'recommend'|'watch'|'drop',n=6):ScoreReview=>({reviewer,model:reviewer,recorded_at:'2026-10-09T19:10:00Z',receipt_id:reviewer==='deepseek'?1:null,blind:true,decision,reason:'存在具体调查问题',source_refs:data.events[0].members.map((m:any)=>m.material_id),scores:Object.fromEntries(['impact','novelty','evidence','audience','investigability'].map(k=>[k,{value:n,reason:'可回查材料有限'}])) as ScoreReview['scores']});
test('blind evidence packet contains no previous scores or decisions for the event',()=>{const p=evidencePacket(data.materials,data.events[0]);assert.ok(!('scores' in p));assert.ok(!('decision_reason' in p));assert.ok(!('dual_score' in p));});

test('flat model wire preserves scores, reasons and weights while rejecting incomplete dimensions',()=>{
 const r=review('deepseek','watch',6),ratings=Object.entries(r.scores).map(([dimension,v])=>({dimension,...v}));
 const wire={items:[{id:'EVT-001',ratings,decision:r.decision,reason:r.reason,source_refs:r.source_refs}]};
 const first=firstReviewsFromWire(wire).items[0];assert.deepEqual(first.scores,r.scores);assert.equal(weightedScore(first.scores),60);
 assert.throws(()=>firstReviewsFromWire({items:[{...wire.items[0],ratings:ratings.slice(0,4)}]}));
 assert.throws(()=>firstReviewsFromWire({items:[{...wire.items[0],ratings:[ratings[0],ratings[0],...ratings.slice(2)]}]}));
});
test('weighted totals are recomputed; disagreement is not hidden by averaging',()=>{const a=review('deepseek','recommend',8),b=review('codex','watch',5),r=resolveScores(a,b,true);assert.equal(weightedScore(a.scores),80);assert.equal(r.decision,'watch');assert.equal(weightedScore(r.scores),50);});
test('both recommend still requires source eligibility',()=>{assert.equal(resolveScores(review('deepseek','recommend'),review('codex','recommend'),false).decision,'watch');});
test('pending cannot recommend or pretend to have second review',()=>{const e=structuredClone(data.events[0]);e.dual_score=pendingScore(data.materials,e,review('deepseek','recommend'));assert.throws(()=>validateDualScore(data.materials,e,true),/Pending/);e.decision='watch';e.scores=e.dual_score.first.scores;validateDualScore(data.materials,e,true);});
test('date, source text or grouping changes invalidate both scores',()=>{const e=structuredClone(data.events[0]);e.decision='watch';e.dual_score=pendingScore(data.materials,e,review('deepseek','watch'));e.scores=e.dual_score.first.scores;const m=structuredClone(data.materials);m.find((m:any)=>m.id===e.members[0].material_id).published_at='2026-09-01';assert.throws(()=>validateDualScore(m,e,true),/Stale/);assert.notEqual(evidenceHash(m,e),e.dual_score.snapshot_hash);});
test('second must be independently recorded Codex and refs must exist',()=>{const e=structuredClone(data.events[0]),a=review('deepseek','recommend'),b=review('codex','recommend');e.dual_score=pendingScore(data.materials,e,a);const r=resolveScores(a,b,true);Object.assign(e,{scores:r.scores,decision:r.decision});Object.assign(e.dual_score,{second:b,status:'complete',resolution:{decision:r.decision,reason:r.reason}});validateDualScore(data.materials,e,true);e.dual_score.second.blind=false;assert.throws(()=>validateDualScore(data.materials,e,true),/independent/);});
test('legacy dispositions distinguish value exclusion from ungrouped reference',()=>{assert.equal(displayOutcome({material_id:'SRC-001',status:'not_pursued',event_ids:[],reason:'与星铁无关的推广'}),'excluded');assert.equal(displayOutcome({material_id:'SRC-001',status:'not_pursued',event_ids:[],reason:'背景资料暂未形成具体事件'}),'pending');});
