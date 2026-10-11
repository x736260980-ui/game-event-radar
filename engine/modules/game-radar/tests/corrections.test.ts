import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyBoundaryCorrections} from '../corrections.ts';
import {evidenceHash} from '../scoring.ts';
const original=JSON.parse(readFileSync(new URL('./fixtures/starrail-manual-20261010-v8-reviewed/research-input.json',import.meta.url),'utf8'));
test('real recommendation-feed error is removed only from its matching public projection',()=>{
 const event=original.events.find((e:any)=>e.id==='EVT-003');
 const correction={run_id:original.run.id,event_id:event.id,snapshot_hash:evidenceHash(original.materials,event),source_refs:['SRC-011'],reason:'原帖内容与推荐流混淆，配队和流水不是本帖正文。'};
 const fixed=applyBoundaryCorrections(original,[correction]);assert.equal(fixed.events.length,2);assert.equal(original.events.length,3);
 assert.equal(fixed.material_outcomes!.find(o=>o.material_id==='SRC-011')!.status,'excluded');assert.equal(original.material_outcomes.find((o:any)=>o.material_id==='SRC-011').status,'grouped');
 assert.deepEqual(fixed.events[0].dual_score,original.events[0].dual_score);
 assert.equal(applyBoundaryCorrections(original,[{...correction,snapshot_hash:'0'.repeat(64)}]),original);
});
