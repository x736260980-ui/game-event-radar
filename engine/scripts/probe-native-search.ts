import {writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {deepseekSearch} from '../modules/game-radar/deepseek-search.ts';
import {usageSummary,type Attempt} from '../modules/game-radar/update-policy.ts';
import {closeDb} from '@aihot/backend/db';
const [query,asOf,dir]=process.argv.slice(2);if(!query||!asOf||!dir)throw new Error('query asOf output-directory required');
mkdirSync(dir,{recursive:true});const attempts:Attempt[]=[];
const save=()=>writeFileSync(path.join(dir,'native-search-usage.json'),JSON.stringify(usageSummary(attempts),null,2)+'\n','utf8');
try{const r=await deepseekSearch(query,'official',asOf,3,attempts,save);writeFileSync(path.join(dir,'native-search-result.json'),JSON.stringify(r,null,2)+'\n','utf8');console.log(JSON.stringify({ok:true,count:r.hits.length,searches:r.searches,receipt_id:r.receipt_id}));}
catch(e){console.error(String(e));process.exitCode=1;}finally{save();await closeDb();}
