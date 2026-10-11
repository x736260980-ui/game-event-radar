import test from 'node:test';
import assert from 'node:assert/strict';
import {researchObservationTime} from '../../../packages/backend/src/events/research-clock.ts';
test('same-day morning observation cannot be released in the future',()=>{
  const now=new Date('2026-10-06T01:30:00Z');
  assert.equal(researchObservationTime('2026-10-06',now).toISOString(),now.toISOString());
});
test('historical and same-day afternoon observations preserve their date-only convention',()=>{
  const now=new Date('2026-10-06T07:00:00Z');
  assert.equal(researchObservationTime('2026-10-05',now).toISOString(),'2026-10-05T04:00:00.000Z');
  assert.equal(researchObservationTime('2026-10-06',now).toISOString(),'2026-10-06T04:00:00.000Z');
});
