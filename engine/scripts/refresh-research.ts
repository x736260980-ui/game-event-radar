import { closeDb,sql } from "@aihot/backend/db";
import { refreshResearchDigests } from "../modules/game-radar/projection.ts";
import {renderStoredResearch} from '@aihot/backend/events/research-projection';
try {
  const batch=process.argv[2];
  if(batch){
    if(!/^[A-Za-z0-9_-]+$/.test(batch))throw new Error('Invalid batch ID');
    const updated=await sql.begin(tx=>renderStoredResearch(tx,batch));
    console.log(JSON.stringify({batch,updated,mode:'render_unchanged_snapshot',api_calls:0}));
  }else{
  const rows = await sql<{id:number}[]>`SELECT id FROM stories WHERE frame->>'provenance'='external_agent' AND merged_into IS NULL`;
  const updated = await sql.begin(tx=>refreshResearchDigests(tx,rows.map(r=>r.id)));
  console.log(JSON.stringify({updated,api_calls:0}));
  }
} finally { await closeDb(); }
