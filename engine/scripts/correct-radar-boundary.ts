import {readFileSync} from 'node:fs';
import {sql,closeDb} from '@aihot/backend/db';
import {audit} from '@aihot/backend/audit';
import {ResearchSchema} from '../modules/game-radar/contract.ts';
import {evidenceHash} from '../modules/game-radar/scoring.ts';
const [input,id,refs,reason]=process.argv.slice(2);
try{
 if(!input||!id||!refs||!reason||reason.trim().length<12)throw new Error('Input, event ID, cited material IDs and an explicit boundary reason are required');
 const data=ResearchSchema.parse(JSON.parse(readFileSync(input,'utf8'))),event=data.events.find(e=>e.id===id),source_refs=refs.split(',');
 if(!event||source_refs.some(ref=>!event.members.some(m=>m.material_id===ref)))throw new Error('Unknown event or correction reference');
 const value={run_id:data.run.id,event_id:id,snapshot_hash:evidenceHash(data.materials,event),source_refs,reason};
 const subject=`radar.boundary:${data.run.id}:${id}`;
 await sql.begin(async tx=>{await tx`SELECT pg_advisory_xact_lock(hashtext(${subject}))`;
  const previous=await tx`SELECT id FROM audit_log WHERE action='radar.boundary_exclusion' AND subject=${subject}`;
  if(!previous.length)await audit('codex-conversation','radar.boundary_exclusion',subject,reason,{event},value,{db:tx});
 });
 console.log(JSON.stringify({ok:true,run:data.run.id,event:id,action:'boundary_exclusion',model_calls:0}));
}finally{await closeDb();}
