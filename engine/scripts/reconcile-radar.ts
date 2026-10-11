import {readFileSync} from 'node:fs';
import {z} from 'zod';
import {mergeResearchStories} from '@aihot/backend/events/research-merge';
import {closeDb} from '@aihot/backend/db';
const schema=z.object({pairs:z.array(z.object({from:z.string().uuid(),into:z.string().uuid(),reason:z.string().min(20),reviewed_urls:z.array(z.string().url()).min(2)})).max(5)});
try{
  const plan=schema.parse(JSON.parse(readFileSync(process.argv[2],'utf8')));
  const results=[];for(const p of plan.pairs)results.push(await mergeResearchStories(p.from,p.into,p.reason,p.reviewed_urls));
  console.log(JSON.stringify({ok:true,results,model_calls:0}));
}catch(e){console.error(String(e));process.exitCode=1;}finally{await closeDb();}
