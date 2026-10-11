// Local production SSR; no model, search or real DB calls.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {spawn,type ChildProcess} from 'node:child_process';
import type {AddressInfo} from 'node:net';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {researchScore} from '../../../modules/game-radar/contract.ts';
let web:ChildProcess,origin:string;
let activeBatches:any[]=[];
const calls:string[]=[];
const api=createServer((req,res)=>{calls.push(req.url!);res.setHeader('Content-Type','application/json');
 if(req.url==='/api/site/meta')return res.end('{}');
 if(req.url==='/api/site/radar/batches')return res.end(JSON.stringify({batches:activeBatches}));
 if(req.url==='/api/site/radar/overview')return res.end(JSON.stringify({today:'2026-10-09',attention:[],schedule:{enabled:true,active:true,status:'waiting',error:null}}));
 res.statusCode=404;res.end('{}');});
before(async()=>{api.listen(0,'127.0.0.1');await once(api,'listening');web=spawn(process.execPath,[fileURLToPath(new URL('../server.ts',import.meta.url))],{env:{...process.env,WEB_PORT:'0',API_BASE_URL:`http://127.0.0.1:${(api.address() as AddressInfo).port}`},stdio:['ignore','pipe','pipe']});
 await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('web startup timeout')),15000);web.stdout!.on('data',data=>{const m=String(data).match(/"port":(\d+)/);if(m){origin=`http://127.0.0.1:${m[1]}`;clearTimeout(timer);resolve();}});web.on('exit',()=>{clearTimeout(timer);reject(new Error('web exited'));});});});
after(async()=>{if(web?.exitCode===null){web.kill('SIGTERM');await once(web,'exit');}api.closeAllConnections();await new Promise<void>(resolve=>api.close(()=>resolve()));});
test('homepage shows navigation and attention; retired public pages remain absent',async()=>{
 const home=await fetch(origin+'/',{redirect:'manual'});assert.equal(home.status,200);const html=await home.text();assert.match(html,/游戏资讯/);assert.match(html,/今日关注榜/);assert.match(html,/全部动态/);assert.match(html,/精选/);
 assert.match(html,/<canvas/);assert.match(html,/流程示意/);for(const label of ['发现资料','归组事件','独立双评','交接事件'])assert.match(html,new RegExp(label));
 for(const p of ['agent','feedback','changelog','more'])assert.equal((await fetch(origin+'/'+p)).status,404);
});
test('empty radar and materials show truthful empty states without calling model endpoints',async()=>{
 const radar=await fetch(origin+'/research');assert.equal(radar.status,200);const html=await radar.text();assert.match(html,/暂无事件记录/);assert.match(html,/材料记录/);assert.doesNotMatch(html,/Agent 接入|href="\/feedback"|href="\/changelog"|为什么有些资讯|不强行凑满|今日关注榜/);
 const materials=await fetch(origin+'/materials');assert.equal(materials.status,200);const materialHtml=await materials.text();assert.match(materialHtml,/待归组/);assert.doesNotMatch(materialHtml,/单篇玩家长评|本轮不研究/);
 assert.ok(calls.every(p=>p.startsWith('/api/site/')));
});
test('real retrospective fixture renders paired scores, sources and investigation entry without executing source markup',async()=>{
 const d=JSON.parse(readFileSync(new URL('../../../modules/game-radar/tests/fixtures/starrail-retrospective-20261010-v6/research-input.json',import.meta.url),'utf8'));
 activeBatches=[{...d,events:d.events.map((e:any)=>({...e,score:researchScore(e),public_id:null,event_date:'2026-09-28'}))}];
 const r=await fetch(origin+'/research?batch='+d.run.id);assert.equal(r.status,200);const html=(await r.text()).replace(/<!--.*?-->/g,'');
 assert.match(html,/DeepSeek 初评/);assert.match(html,/Codex 独立复评/);assert.match(html,/63 分/);assert.match(html,/70 分/);assert.match(html,/复制事件信息/);assert.match(html,/下载交接 JSON/);assert.match(html,/发生了什么/);assert.doesNotMatch(html,/调查提纲|建议调查|玩家在讨论什么/);assert.match(html,/news\/166468/);assert.match(html,/回溯补录/);
 const featured=await (await fetch(origin+'/featured')).text();const cards=(featured.match(/<article\b[\s\S]*?<\/article>/g)??[]).join('');assert.match(featured,/精选/);assert.match(cards,/HoYoverse发布4.6/);assert.match(cards,/Weekly Question/);
 activeBatches[0].materials[0].title='<script>window.bad=1</script>';
 const materials=await (await fetch(origin+'/materials')).text();assert.match(materials,/&lt;script&gt;/);assert.doesNotMatch(materials,/<script>window.bad=1<\/script>/);
 activeBatches=[];
});
