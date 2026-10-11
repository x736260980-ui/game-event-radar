import '../../../tests/setup.ts';
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sql,closeDb} from '@aihot/backend/db';
import {importResearch} from '../import.ts';
import {researchBatches} from '@aihot/backend/publication/radar';
after(closeDb);
test('empty research is a real zero-result batch, not invented news',async()=>{
  const input=JSON.parse(readFileSync(new URL('./fixtures/pilot-001/research-input.json',import.meta.url),'utf8'));
  input.run.id='empty-result-test';input.materials=[];input.events=[];
  const out=await importResearch(input,{categories:{}});
  assert.equal(out.reused,false);
  const batches=await researchBatches();assert.equal(batches.length,1);
  assert.equal(batches[0]!.events.length,0);assert.equal(batches[0]!.original_material_count,0);
  const [n]=await sql`SELECT (SELECT count(*) FROM stories)::int AS stories,(SELECT count(*) FROM articles)::int AS articles,(SELECT count(*) FROM receipts)::int AS receipts`;
  assert.equal(n!.stories,0);assert.equal(n!.articles,0);assert.equal(n!.receipts,0);
});
