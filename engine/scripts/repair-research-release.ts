import {sql,closeDb} from '@aihot/backend/db';
import {repairSyntheticResearchRelease} from '@aihot/backend/events/research-release';
const batch=process.argv[2];
if(!batch||!/^[A-Za-z0-9_-]+$/.test(batch))throw new Error('Provide one valid batch ID');
try{
  const repaired=await sql.begin(tx=>repairSyntheticResearchRelease(tx,batch));
  console.log(JSON.stringify({batch,repaired,api_calls:0}));
}finally{await closeDb();}
