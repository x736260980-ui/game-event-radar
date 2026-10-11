// A failed first-score response must not leak into the independent conversation review.
import {readFileSync,writeFileSync} from 'node:fs';
import {ResearchSchema} from '../modules/game-radar/contract.ts';
import {evidenceHash,evidencePacket} from '../modules/game-radar/scoring.ts';
const [input,output]=process.argv.slice(2);
if(!input||!output)throw new Error('Usage: prepare-checkpoint-review.ts update-state.json score-free-packets.json');
const state=JSON.parse(readFileSync(input,'utf8'));
const materials=ResearchSchema.shape.materials.parse(state.stages.materials);
const events=ResearchSchema.shape.events.parse(state.stages.synthesis.events);
writeFileSync(output,JSON.stringify({run_id:state.options.runId,prepared_at:new Date().toISOString(),source:'validated evidence in failed checkpoint; no score response',events:events.map(e=>({id:e.id,snapshot_hash:evidenceHash(materials,e),evidence:evidencePacket(materials,e)}))},null,2)+'\n',{encoding:'utf8',flag:'wx'});
console.log(JSON.stringify({ok:true,events:events.length,paid_calls:0}));
