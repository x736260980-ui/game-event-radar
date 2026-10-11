import '../../../tests/setup.ts';
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sql,closeDb} from '@aihot/backend/db';
import {importResearch} from '../import.ts';
import {researchBatches} from '@aihot/backend/publication/radar';
import {storyTexts} from '@aihot/backend/publication/story-text';
import {refreshResearchDigests} from '../projection.ts';
import {renderStoredResearch} from '@aihot/backend/events/research-projection';
import {repairSyntheticResearchRelease} from '@aihot/backend/events/research-release';
import {audit} from '@aihot/backend/audit';
const original=JSON.parse(readFileSync(new URL('./fixtures/pilot-001/research-input.json',import.meta.url),'utf8'));
const mapping=JSON.parse(readFileSync(new URL('./fixtures/pilot-001/engine-mapping.json',import.meta.url),'utf8'));
after(closeDb);
test('transactional research import, snapshots, continuation and withdrawals',async t=>{
  const input=structuredClone(original);input.run.id='radar-integration-test';
  let result:any;
  await t.test('imports 18 materials and six events without provider receipts',async()=>{
    const out=await importResearch(input,mapping);assert.equal(out.reused,false);result=out.result;
    assert.equal(result.material_count,18);assert.equal(result.event_count,6);assert.equal(result.representative_count,2);
    const [n]=await sql`SELECT count(*)::int AS n FROM receipts`;assert.equal(n!.n,0);
    const texts=await storyTexts(result.stories.map((s:any)=>Number(s.story_id)));
    assert.match(texts.get(Number(result.stories[0].story_id))!.digest!,/研究优先分：72/);
  });
  await t.test('same batch is idempotent and refuses changed content',async()=>{
    assert.equal((await importResearch(input,mapping)).reused,true);
    const changed=structuredClone(input);changed.events[0].decision_reason+=' changed';
    await assert.rejects(importResearch(changed,mapping),/different content/);
    const [n]=await sql`SELECT count(*)::int AS n FROM stories`;assert.equal(n!.n,6);
  });
  await t.test('unchanged snapshot can be re-rendered once, with covered citation labels only',async()=>{
    const id=Number(result.stories[0].story_id);
    await sql`UPDATE stories SET digest='Legacy presentation' WHERE id=${id}`;
    assert.equal(await sql.begin(tx=>renderStoredResearch(tx,input.run.id)),1);
    const digest=(await storyTexts([id])).get(id)!.digest!;
    assert.match(digest,/SRC-013/);assert.match(digest,/研究优先分：72/);
    assert.equal(await sql.begin(tx=>renderStoredResearch(tx,input.run.id)),0);
  });
  await t.test('public history exposes computed scores and no full body',async()=>{
    const batches=await researchBatches();assert.equal(batches.length,1);assert.equal(batches[0]!.events[0]!.score,72);
    assert.equal(batches[0]!.original_material_count,18);assert.ok(batches[0]!.materials.every(m=>m.excerpt===''));
    assert.equal(batches[0]!.material_outcomes.length,18);assert.ok(batches[0]!.material_outcomes.some(o=>o.status==='legacy_unassigned'));
  });
  await t.test('synthetic-noon repair is scoped, idempotent and preserves research dates',async()=>{
    const now=new Date('2026-09-30T01:30:00Z');
    const [before]=await sql`SELECT count(*)::int AS n FROM articles WHERE raw->>'batch'=${input.run.id}`;
    assert.equal(await sql.begin(tx=>repairSyntheticResearchRelease(tx,'nonexistent-batch',now)),0);
    assert.equal(await sql.begin(tx=>repairSyntheticResearchRelease(tx,input.run.id,now)),2);
    assert.equal(await sql.begin(tx=>repairSyntheticResearchRelease(tx,input.run.id,now)),0);
    const [after]=await sql`SELECT count(*)::int AS n FROM articles WHERE raw->>'batch'=${input.run.id}`;
    assert.equal(after!.n,before!.n);
    assert.equal((await researchBatches())[0]!.run.as_of,'2026-09-30');
  });
  await t.test('context membership cannot become independent evidence',async()=>{
    const rows=await sql`SELECT fa.role FROM fact_articles fa JOIN grouping_decisions g ON g.fact_id=fa.fact_id AND g.article_id=fa.article_id WHERE g.verdict::jsonb->>'relation'='ROUNDUP'`;
    assert.ok(rows.length>0);assert.ok(rows.every(r=>r.role==='mention'));
  });
  await t.test('a later failure rolls back articles and analyses',async()=>{
    const broken=structuredClone(input);broken.run.id='failed-run';
    const invalid=structuredClone(mapping);invalid.existing_stories={'EVT-001':'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'};
    const [before]=await sql`SELECT count(*)::int AS n FROM analyses`;
    await assert.rejects(importResearch(broken,invalid),/not found/);
    const [after]=await sql`SELECT count(*)::int AS n FROM analyses`;assert.equal(after!.n,before!.n);
    const [batch]=await sql`SELECT count(*)::int AS n FROM audit_log WHERE subject='radar-batch:failed-run'`;assert.equal(batch!.n,0);
  });
  await t.test('explicit cross-batch continuation preserves six stories and seven facts',async()=>{
    const next=structuredClone(input);next.run.id='radar-integration-next';
    const continued=structuredClone(mapping);continued.existing_stories=Object.fromEntries(result.stories.map((s:any)=>[s.event_id,s.public_id]));
    await importResearch(next,continued);
    const [n]=await sql`SELECT (SELECT count(*) FROM stories)::int AS stories,(SELECT count(*) FROM facts)::int AS facts,(SELECT count(*) FROM receipts)::int AS receipts`;
    assert.equal(n!.stories,6);assert.equal(n!.facts,7);assert.equal(n!.receipts,0);
    assert.equal((await researchBatches()).length,2);
  });
  await t.test('replaying a batch repairs a partial compatibility snapshot without losing reused sources',async()=>{
    const next=structuredClone(input);next.run.id='radar-integration-next';
    const continued=structuredClone(mapping);continued.existing_stories=Object.fromEntries(result.stories.map((s:any)=>[s.event_id,s.public_id]));
    const subject='radar-batch:'+next.run.id;
    const [row]=await sql<{after:any}[]>`SELECT after FROM audit_log WHERE action='radar.import' AND subject=${subject}`;
    const partial=structuredClone(row!.after);delete partial.material_ids['SRC-001'];
    await audit('test','radar.snapshot',subject,'Synthetic regression fixture: incomplete compatibility map',null,partial);
    assert.equal((await researchBatches()).find(b=>b.run.id===next.run.id)!.materials.length,17);
    assert.equal((await importResearch(next,continued)).reused,true);
    const b=(await researchBatches()).find(b=>b.run.id===next.run.id)!;assert.equal(b.materials.length,18);assert.equal(b.hidden_material_count,0);
    const [n]=await sql`SELECT count(*)::int AS n FROM audit_log WHERE action='radar.snapshot' AND subject=${subject}`;
    await importResearch(next,continued);const [again]=await sql`SELECT count(*)::int AS n FROM audit_log WHERE action='radar.snapshot' AND subject=${subject}`;assert.equal(again!.n,n!.n);
  });
  await t.test('same occurrence can be reworded and reported at different URLs without a duplicate root',async()=>{
    const next=structuredClone(input);next.run.id='radar-semantic-next';
    for(const m of next.materials)m.url=m.url+(m.url.includes('?')?'&':'?')+'independent-report=1';
    for(const e of next.events)e.occurrence+='（另一来源对同一次发生的描述）';
    const continued={...structuredClone(mapping),existing_stories:Object.fromEntries(result.stories.map((s:any)=>[s.event_id,s.public_id])),existing_relations:Object.fromEntries(result.stories.map((s:any)=>[s.event_id,'same_occurrence']))};
    await importResearch(next,continued);
    const [n]=await sql`SELECT (SELECT count(*) FROM stories)::int AS stories,(SELECT count(*) FROM facts)::int AS facts`;
    assert.equal(n!.stories,6);assert.equal(n!.facts,7);
    const digest=(await storyTexts([Number(result.stories[0].story_id)])).get(Number(result.stories[0].story_id))!.digest!;
    assert.match(digest,/radar-integration-test/);assert.match(digest,/radar-semantic-next/);
  });
  await t.test('weak rereading does not replace the previous usable body or erase conclusions',async()=>{
    const next=structuredClone(input);next.run.id='radar-weaker-next';
    for(const m of next.materials){m.access='excerpt_only';m.decision='watch';m.excerpt='只读到了搜索摘要';m.summary='读取失败的新摘要';}
    for(const e of next.events){e.confirmed_facts=[];e.decision='watch';}
    const continued={...structuredClone(mapping),existing_stories:Object.fromEntries(result.stories.map((s:any)=>[s.event_id,s.public_id])),existing_relations:Object.fromEntries(result.stories.map((s:any)=>[s.event_id,'same_occurrence']))};
    await importResearch(next,continued);
    const [p]=await sql`SELECT count(*)::int AS n FROM articles WHERE body_status='ok' AND raw->>'batch'=${input.run.id}`;
    assert.ok(p!.n>0);
    const digest=(await storyTexts([Number(result.stories[0].story_id)])).get(Number(result.stories[0].story_id))!.digest!;
    assert.match(digest,/公告事实/);assert.match(digest,/radar-weaker-next/);
  });
  await t.test('a later derived review sorts first without pretending the evidence is newer',async()=>{
    const next=structuredClone(input);next.run.id='radar-derived-next';next.run.derived_on='2026-10-09';
    const continued={...structuredClone(mapping),existing_stories:Object.fromEntries(result.stories.map((s:any)=>[s.event_id,s.public_id])),existing_relations:Object.fromEntries(result.stories.map((s:any)=>[s.event_id,'same_occurrence']))};
    await importResearch(next,continued);
    const [latest]=await researchBatches();assert.equal(latest!.run.id,'radar-derived-next');assert.equal(latest!.run.as_of,input.run.as_of);
  });
  await t.test('changed evidence hides the digest and repair does not silently restore it',async()=>{
    const id=Number(result.stories[0].story_id);
    const [article]=await sql`SELECT fa.article_id FROM fact_articles fa JOIN facts f ON f.id=fa.fact_id JOIN publications p ON p.article_id=fa.article_id WHERE f.story_id=${id} AND fa.role<>'mention' AND p.eligible LIMIT 1`;
    await sql`UPDATE publications SET summary='corrected evidence' WHERE article_id=${article!.article_id}`;
    assert.equal((await storyTexts([id])).get(id)!.digest,null);
    assert.equal(await sql.begin(tx=>refreshResearchDigests(tx,[id])),0);
    assert.equal(await sql.begin(tx=>renderStoredResearch(tx,'radar-integration-next')),0);
    assert.equal((await storyTexts([id])).get(id)!.digest,null);
    await sql`UPDATE publications SET visibility='withdrawn' WHERE article_id=${article!.article_id}`;
    const history=await researchBatches();assert.ok(history.filter(b=>b.run.id!=='radar-semantic-next').every(b=>b.hidden_material_count>0));
    for(const b of history){const visible=new Set(b.materials.map(m=>m.id));assert.ok(b.material_outcomes.every(o=>visible.has(o.material_id)));}
  });
});
