import {readFileSync,writeFileSync} from 'node:fs';
import {ResearchSchema} from '../modules/game-radar/contract.ts';
import {eventHandoff} from '../modules/game-radar/handoff.ts';
const [input,id,output]=process.argv.slice(2);
if(!input||!id||!output)throw new Error('Usage: export-handoff.ts research-input.json EVT-001 output.json');
const batch=ResearchSchema.parse(JSON.parse(readFileSync(input,'utf8'))),event=batch.events.find(e=>e.id===id);
if(!event)throw new Error('Event not found');
writeFileSync(output,JSON.stringify(eventHandoff(batch,event),null,2)+'\n','utf8');
console.log(JSON.stringify({ok:true,event:id,output}));
