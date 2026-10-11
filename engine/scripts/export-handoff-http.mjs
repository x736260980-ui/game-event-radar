// Export exactly the site's validated handoff. Read-only HTTP; no collection or model calls.
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
const [batch,event,output]=process.argv.slice(2);
if(!batch||!event||!output||!/^[a-zA-Z0-9_-]+$/.test(batch)||!/^EVT-\d{3}$/.test(event))throw new Error('Usage: node scripts/export-handoff-http.mjs batch EVT-001 output.json');
const response=await fetch(`http://127.0.0.1:8788/api/site/radar/batches/${batch}/events/${event}/handoff`);
if(!response.ok)throw new Error(`Handoff HTTP ${response.status}`);
const data=await response.json();
if(!data.sources?.length||data.scoring?.status!=='complete')throw new Error('A completed, sourced handoff is required');
mkdirSync(path.dirname(path.resolve(output)),{recursive:true});
writeFileSync(output,JSON.stringify(data,null,2)+'\n',{encoding:'utf8',flag:'wx'});
console.log(JSON.stringify({ok:true,file:path.resolve(output),event_id:data.event_id,paid_calls:0}));
