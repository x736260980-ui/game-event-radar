import test from 'node:test';
import assert from 'node:assert/strict';
import {standaloneScoreAttempt,type Attempt} from '../update-policy.ts';
const failed:Attempt={kind:'model',stage:'deepseek_independent_score',status:'failed',receipt_id:370};
test('standalone scoring retains its one retry across restarts',()=>{
 assert.equal(standaloneScoreAttempt([]),0);
 assert.equal(standaloneScoreAttempt([failed],'failed'),1);
 assert.throws(()=>standaloneScoreAttempt([failed,{...failed,receipt_id:371}],'failed'),/修复已用完/);
});
test('an uncertain or interrupted standalone score cannot be purchased again',()=>{
 for(const status of ['unknown','pending','received','complete',undefined])assert.throws(()=>standaloneScoreAttempt([failed],status),/不确定/);
 assert.throws(()=>standaloneScoreAttempt([{...failed,status:'reserved'}],'failed'),/不确定/);
 assert.throws(()=>standaloneScoreAttempt([{...failed,receipt_id:undefined}],'failed'),/不确定/);
});
