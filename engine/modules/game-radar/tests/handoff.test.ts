import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {eventHandoff,contentIdentity} from '../handoff.ts';
import {recommendationSupport} from '../contract.ts';
import {evidencePacket} from '../scoring.ts';
const data=JSON.parse(readFileSync(new URL('./fixtures/pilot-001/research-input.json',import.meta.url),'utf8'));
test('handoff contains source identities and existing terms, without invented collection plans',()=>{
 const result=eventHandoff(data,data.events[0]);
 assert.equal(result.title,data.events[0].title);assert.ok(result.sources.length);assert.deepEqual(result.search_terms,data.events[0].keywords.slice(0,5));
 assert.ok(!('research_question' in result));assert.ok(!('collection_strategy' in result));
 assert.deepEqual(contentIdentity('https://www.bilibili.com/video/BV1abc123/'),{platform:'bilibili',content_id:'BV1abc123'});
 assert.deepEqual(contentIdentity('https://www.douyin.com/note/123456/'),{platform:'douyin',content_id:'123456'});
 assert.equal(contentIdentity('https://evilbilibili.com/video/BV123').platform,'evilbilibili.com');
});
test('context publication dates do not expand the handoff event range',()=>{
 const sample=structuredClone(data);const event=sample.events[0];
 event.members=[{material_id:sample.materials[0].id,relation:'same_occurrence',reason:'原事件'},{material_id:sample.materials[1].id,relation:'context',reason:'之前的背景'}];
 sample.materials[0].published_at='2026-09-28';sample.materials[1].published_at='2026-09-20';
 assert.deepEqual(eventHandoff(sample,event).date_range,{start:'2026-09-28',end:'2026-09-28'});
});
test('new qualification allows one readable concrete community issue; legacy qualification is preserved',()=>{
 const m={...data.materials[0],source_kind:'community',origin_group:'one',access:'body',decision:'use'};
 const e={...data.events[0],members:[{material_id:m.id,relation:'same_occurrence',reason:'具体发生'}],qualification_version:'investigation-v1'};
 assert.equal(recommendationSupport([m],e).eligible,true);
 delete e.qualification_version;assert.equal(recommendationSupport([m],e).eligible,false);
 e.qualification_version='investigation-v1';m.access='unavailable';assert.equal(recommendationSupport([m],e).eligible,false);
});
test('new score packet excludes upstream material verdict and includes player issue',()=>{
 const e={...data.events[0],qualification_version:'investigation-v1',player_discussion:'旧队伍的体验是否改变'};
 const packet=evidencePacket(data.materials,e);assert.equal(packet.player_discussion,e.player_discussion);
 assert.ok(packet.materials.every(m=>!('decision' in m)));assert.ok(!('scores' in packet));
});
