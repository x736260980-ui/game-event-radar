// No API calls. Export identical, score-free evidence packets for a real Codex review.
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {ResearchSchema} from '../modules/game-radar/contract.ts';
import {evidencePacket,evidenceHash} from '../modules/game-radar/scoring.ts';
const [input,output]=process.argv.slice(2);
if(!input)throw new Error('Usage: prepare-review.ts research-input-or-draft.json [evidence-packets.json]');
const data=ResearchSchema.parse(JSON.parse(readFileSync(input,'utf8')));
const packets={run_id:data.run.id,prepared_at:new Date().toISOString(),events:data.events.map(e=>({id:e.id,snapshot_hash:evidenceHash(data.materials,e),evidence:evidencePacket(data.materials,e)}))};
writeFileSync(output??path.join(path.dirname(input),'evidence-packets.json'),JSON.stringify(packets,null,2)+'\n',{encoding:'utf8',flag:'wx'});
console.log(JSON.stringify({ok:true,events:packets.events.length}));
