import test from 'node:test';
import assert from 'node:assert/strict';
import {discoveryClues,diversifyLeads} from '../discovery.ts';
import {dateCandidates,bodySegment} from '../update-utils.ts';
import {eventHandoff} from '../handoff.ts';
import {qualifyConfirmedFacts} from '../contract.ts';
const hit=(n:number,title='事件'+n)=>({url:`https://example.org/article/${n}`,title,snippet:'',scopes:['media']});
test('explicit month names and unambiguous European dates remain date candidates, not asserted publication dates',()=>{
 assert.deepEqual(dateCandidates('Опубликовано 29 September 2026; Veröffentlicht am 28.09.2026; September 30, 2026','2026-10-11').map(d=>d.day),['2026-09-29','2026-09-30','2026-09-28']);
 assert.deepEqual(dateCandidates('09.10.2026; November 11, 2026','2026-10-11'),[]);
});
test('verified old dates are not recent, discovery dates cannot replace publication dates',()=>{
 const pool=[hit(1),{...hit(2),snippet:'活动将于2026-10-10开始'}];
 const clues=discoveryClues(pool,[{url:pool[0].url,published_at:'2026-09-28',origin_group:'release'}],'2026-10-11',3);
 assert.equal(clues[0].date_status,'known_old');assert.equal(clues[1].date_status,'hint_in_window');assert.equal(clues[1].known_published_at,null);
});
test('recent candidates precede old announcements and a provenance chain cannot eat all slots',()=>{
 const pool=Array.from({length:6},(_,i)=>hit(i+1));
 const known=pool.map((h,i)=>({url:h.url,published_at:i===5?'2026-10-10':'2026-09-28',origin_group:i===5?'new':'one-press-release'}));
 const clues=discoveryClues(pool,known,'2026-10-11',3),ids=clues.map(c=>c.id);
 const result=diversifyLeads(pool,ids,6,clues);
 assert.equal(result.hits[0].url,pool[5].url);assert.equal(result.hits.length,3);assert.equal(result.deferred.length,3);
 assert.equal(pool.length,6);
});
test('same character is not a dedup key; exact title only limits reading slots',()=>{
 const pool=[hit(1,'珍珠角色PV'),hit(2,'珍珠技能介绍'),hit(3,'珍珠配队测试')];
 const clues=discoveryClues(pool,[],'2026-10-11',3);
 assert.equal(diversifyLeads(pool,clues.map(c=>c.id),3,clues).hits.length,3);
 assert.throws(()=>diversifyLeads(pool,['HIT-999'],3,clues),/Invalid lead/);
});
test('unambiguous US and day-first dates work, ambiguous dates stay unknown',()=>{
 assert.equal(dateCandidates('Posted 9/30/2026','2026-10-11')[0].day,'2026-09-30');
 assert.equal(dateCandidates('Posted 27/09/2026','2026-10-11')[0].day,'2026-09-27');
 assert.deepEqual(dateCandidates('Posted 09/10/2026','2026-10-11'),[]);
});
test('focus extraction cannot use related articles as this article body',()=>{
 const body='真实活动标题\n'+('本篇活动内容\n'.repeat(300))+'\nRelated Articles\n另一款游戏的联动与官方宣布';
 assert.ok(!bodySegment(body,'真实活动标题',600,['官方宣布']).includes('另一款游戏'));
});
test('source claims are never substituted for player feedback in handoff',()=>{
 const batch:any={run:{id:'test',game:'星铁'},materials:[]};
 const event:any={id:'EVT-001',title:'新活动',occurrence:'发布活动',members:[],source_claims:[{text:'官方说可获得奖励'}],keywords:[],unknowns:[],decision:'watch',decision_reason:'待复评'};
 assert.equal('player_discussion' in eventHandoff(batch,event),false);
});
test('readable dated-out claims are downgraded, unavailable or nonexistent references still fail',()=>{
 const event:any={id:'EVT-001',confirmed_facts:[{text:'旧公告',refs:['SRC-001']},{text:'未读',refs:['SRC-002']},{text:'伪造ID',refs:['SRC-999']}],source_claims:[]};
 const audit=qualifyConfirmedFacts([{id:'SRC-001',access:'body',decision:'watch',source_kind:'official'},{id:'SRC-002',access:'unavailable',decision:'watch',source_kind:'official'}] as any,[event]);
 assert.equal(audit.length,1);assert.equal(event.source_claims.length,1);assert.equal(event.confirmed_facts.length,2);
});
