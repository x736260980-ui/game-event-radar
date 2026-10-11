import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isolateEvents} from '../isolation.ts';
import {materialTitle} from '../titles.ts';
const base=JSON.parse(readFileSync(new URL('./fixtures/pilot-001/research-input.json',import.meta.url),'utf8'));
const mapping=JSON.parse(readFileSync(new URL('./fixtures/pilot-001/engine-mapping.json',import.meta.url),'utf8'));
test('invalid event is isolated; valid siblings and original evidence survive',()=>{
 const d=structuredClone(base);d.events[0].confirmed_facts=[{text:'unsupported',refs:['SRC-999']}];const snapshot=JSON.stringify(d);
 const r=isolateEvents(d,mapping);assert.equal(r.rejected.length,1);assert.equal(r.data.events.length,5);
 assert.equal(JSON.stringify(d),snapshot);assert.ok(!r.mapping.categories[d.events[0].id]);
 assert.equal(r.data.materials.length,d.materials.length);assert.equal(r.data.material_outcomes?.length,d.materials.length);
});
test('global invalid date is fatal, not a successful empty batch',()=>{
 const d=structuredClone(base);d.run.as_of='2026-02-30';assert.throws(()=>isolateEvents(d,mapping));
});
test('duplicate event identity remains fatal',()=>{
 const d=structuredClone(base);d.events[1].id=d.events[0].id;assert.throws(()=>isolateEvents(d,mapping),/Duplicate/);
});
test('all bad events leave materials pending, not excluded',()=>{
 const d=structuredClone(base);for(const e of d.events)e.members[0].material_id='SRC-999';
 const r=isolateEvents(d,mapping);assert.equal(r.data.events.length,0);assert.equal(r.rejected.length,d.events.length);
 assert.ok(r.data.material_outcomes!.filter(x=>x.status!=='excluded').every(x=>x.status==='pending'));
});
test('bad continuation is isolated without altering valid siblings',()=>{
 const r=isolateEvents(base,mapping,(_m,events)=>{if(events.some(e=>e.id==='EVT-001'))throw new Error('bad continuation');});
 assert.equal(r.rejected.length,1);assert.equal(r.data.events.length,5);
});
test('Chinese title is display only; source title stays untouched',()=>{
 const m={title:'Ver.4.6アプデ情報まとめ',url:'https://gamewith.jp/houkaistarrail/article/show/402987'};
 assert.equal(materialTitle(m),'星铁4.6版本更新信息汇总');assert.equal(m.title,'Ver.4.6アプデ情報まとめ');
 assert.equal(materialTitle({...m,title_zh:'中文标题'}),'中文标题');
 assert.equal(materialTitle({title:'未翻译原题',url:'https://example.org'}),'未翻译原题');
});
