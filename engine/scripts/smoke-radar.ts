// HTTP-only verification of the clean demonstration. No browser or paid calls.
import assert from 'node:assert/strict';
const base=process.argv[2]??'http://127.0.0.1:8788';
let checks=0;
for(const page of ['/','/all','/featured','/research','/materials']){
 const response=await fetch(base+page);assert.equal(response.status,200,page);const html=await response.text();
 assert.match(html,/游戏事件雷达/);checks++;
}
const data=await (await fetch(base+'/api/site/radar/batches')).json();
for(const [run,id,first,second] of [['demo-crossover-v010','EVT-001',76,67],['demo-pearl-v010','EVT-003',57,67]] as const){
 const batch=data.batches.find((b:any)=>b.run.id===run);assert.ok(batch,run);assert.equal(batch.events.length,1);
 const event=batch.events[0];assert.equal(event.dual_score.status,'complete');assert.equal(event.dual_score.first.total,first);assert.equal(event.dual_score.second.total,second);
 assert.equal(event.decision,'recommend');assert.ok(batch.materials.every((m:any)=>m.url.startsWith('http')));
 const page=await (await fetch(base+'/research?batch='+run)).text();assert.match(page,/DeepSeek 初评/);assert.match(page,/Codex 独立复评/);assert.match(page,/下载交接 JSON/);
 const response=await fetch(`${base}/api/site/radar/batches/${run}/events/${id}/handoff`);assert.equal(response.status,200);
 assert.match(response.headers.get('content-disposition')??'',/attachment.*\.json/);const handoff=await response.json();
 assert.equal(handoff.scoring.status,'complete');assert.ok(handoff.sources.length);assert.ok(!('collection_strategy' in handoff));checks+=3;
}
const overview=await (await fetch(base+'/api/site/radar/overview')).json();assert.equal(overview.schedule.enabled,false);checks++;
console.log(JSON.stringify({ok:true,checks,examples:2,browser_used:false,scope:'HTTP SSR, API, paired scores, source URLs and handoff downloads'}));
