import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {beijingDay,dueDay,nextSchedule,claimDay,saveDay,readDay} from '../schedule.ts';
import {sourceKind,requiredQueries} from '../update-utils.ts';
import {recommendationSupport} from '../contract.ts';
test('Beijing 08:00 boundary and next occurrence do not depend on server timezone',()=>{
 assert.equal(dueDay(new Date('2026-10-09T23:59:59Z')),null);
 assert.equal(dueDay(new Date('2026-10-09T00:00:00Z')),'2026-10-09');
 assert.equal(dueDay(new Date('2026-10-08T23:59:59Z')),null);
 assert.equal(beijingDay(new Date('2026-10-08T16:01:00Z')),'2026-10-09');
 assert.equal(nextSchedule(new Date('2026-10-09T00:00:00Z')),'2026-10-10T00:00:00.000Z');
});
test('late start claims today once; failures and restarts cannot reset that daily claim',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'radar-schedule-'));
 try {const now=new Date('2026-10-09T12:00:00Z');const s=claimDay(dir,now)!;assert.equal(s.day,'2026-10-09');assert.equal(claimDay(dir,now),null);
 saveDay(dir,{...s,status:'failed',error:'test'});assert.equal(readDay(dir,s.day)?.status,'failed');assert.equal(claimDay(dir,now),null);
 assert.equal(claimDay(dir,new Date('2026-10-10T00:00:00Z'))?.day,'2026-10-10');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('a user-content domain is never globally trusted as official',()=>{
 assert.equal(sourceKind('https://x.com/honkaistarrail/status/123'),'official');
 assert.equal(sourceKind('https://x.com/someplayer/status/123'),'community');
 assert.equal(sourceKind('https://space.bilibili.com/1340190821'),'official');
 assert.equal(sourceKind('https://space.bilibili.com/99999'),'community');
 assert.equal(sourceKind('https://www.douyin.com/video/123'),'community');
});
test('query fallback never removes the sole official or community query',()=>{
 const out=requiredQueries([{scope:'media',query:'星铁攻略甲'},{scope:'media',query:'星铁攻略乙'},{scope:'media',query:'星铁攻略丙'},{scope:'official',query:'星铁官方活动'}],'星铁','2026-10-09');
 assert.equal(out.length,4);assert.ok(out.some(q=>q.scope==='official'));assert.ok(out.some(q=>q.scope==='community'));
});
test('a single player post and its media reprint stay a lead, not independent support',()=>{
 const event:any={members:[{material_id:'A',relation:'same_occurrence'},{material_id:'B',relation:'development'}]};
 const materials:any=[{id:'A',source_kind:'community',access:'body',decision:'use',origin_group:'one-post'},{id:'B',source_kind:'media',access:'body',decision:'use',origin_group:'one-post'}];
 assert.equal(recommendationSupport(materials,event).eligible,false);materials[1].origin_group='different-original';assert.equal(recommendationSupport(materials,event).eligible,true);
 materials[1].origin_group='one-post';materials[0].source_kind='official';assert.equal(recommendationSupport(materials,event).eligible,true);
});
