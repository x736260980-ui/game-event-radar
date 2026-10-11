import test from 'node:test';
import assert from 'node:assert/strict';
import {hasRecentEvidence} from '../attention.ts';
import type {ResearchBatch} from '../contract.ts';
const b={materials:[{id:'SRC-001',published_at:'2026-09-29',access:'body',decision:'watch'}]} as ResearchBatch;
const e={members:[{material_id:'SRC-001',relation:'same_occurrence'}]} as ResearchBatch['events'][number];
test('old Razer announcement cannot become current just because it was reprocessed today',()=>{
 assert.equal(hasRecentEvidence(b,e,'2026-10-11'),false);
});
test('recent new development qualifies; context and unknown dates do not',()=>{
 const d=structuredClone(b),event=structuredClone(e);d.materials[0].published_at='2026-10-09';event.members[0].relation='development';
 assert.equal(hasRecentEvidence(d,event,'2026-10-11'),true);
 event.members[0].relation='context';assert.equal(hasRecentEvidence(d,event,'2026-10-11'),false);
 event.members[0].relation='same_occurrence';d.materials[0].published_at=null;assert.equal(hasRecentEvidence(d,event,'2026-10-11'),false);
});
test('three-day boundary excludes future, day four, unread and excluded materials',()=>{
 const d=structuredClone(b);
 for(const day of ['2026-10-12','2026-10-08']){d.materials[0].published_at=day;assert.equal(hasRecentEvidence(d,e,'2026-10-11'),false);}
 d.materials[0].published_at='2026-10-11';d.materials[0].access='excerpt_only';assert.equal(hasRecentEvidence(d,e,'2026-10-11'),false);
 d.materials[0].access='body';d.materials[0].decision='exclude';assert.equal(hasRecentEvidence(d,e,'2026-10-11'),false);
});
