import test from 'node:test';
import assert from 'node:assert/strict';
import {discoveryPlan,followupPlan,searchDomains,discoveryHistory} from '../discovery.ts';
import {dedupHits,dedupQueries} from '../update-utils.ts';
import type {ResearchBatch} from '../contract.ts';
test('generic news plans become official, platform-specific community and historical discovery',()=>{
  const plan=discoveryPlan([{scope:'official',query:'官网版本公告'},{scope:'community',query:'玩家讨论 版本 反馈'}],'星穹铁道','2026-10-10',[{title:'4.5末日幻影水温',date:'2026-08-31',keywords:['4.5 末日幻影','仙客天狼']}]);
  assert.equal(plan.length,8);assert.equal(plan.filter(q=>q.scope==='official').length,3);
  assert.ok(plan.some(q=>q.query.includes('site:bilibili.com')));assert.ok(plan.some(q=>q.query.includes('site:taptap.cn')));
  assert.ok(plan.every(q=>!q.query.includes('仙客天狼')));assert.ok(plan.every(q=>q.query.length<=180));
  assert.ok(plan.some(q=>q.query.includes('新角色')));assert.ok(plan.some(q=>q.query.includes('剧情')));
});
test('no model leads means no manufactured follow-up',()=>{
  const initial=discoveryPlan([],'星穹铁道','2026-10-10',[]),follow=followupPlan([],initial,'星穹铁道','2026-10-10');
  assert.deepEqual(follow,[]);
});
test('targeted follow-up retains at most four queries including the independent platform gap',()=>{
  const initial=discoveryPlan([],'星穹铁道','2026-10-10',[]);
  const follow=followupPlan(Array.from({length:4},(_,i)=>({scope:'community' as const,query:'角色专武具体话题'+i})),initial,'星穹铁道','2026-10-10');
  assert.equal(follow.length,4);assert.ok(follow.every(q=>q.query.includes('角色专武')));
});
test('site-directed searches really constrain provider domains; unrelated domains cannot escape scope',()=>{
  assert.deepEqual(searchDomains('site:bilibili.com 水温','community'),['bilibili.com']);
  assert.deepEqual(searchDomains('site:reddit.com/r/HonkaiStarRail 配队','community'),['reddit.com']);
  assert.ok(!searchDomains('site:evil.example','community').includes('evil.example'));
});
test('community selection spreads slots across platforms instead of taking the first ten Bili hits',()=>{
  const hits=[...Array.from({length:10},(_,i)=>({url:`https://www.bilibili.com/video/BV${i}`,title:'a',snippet:'',scopes:['community']})),{url:'https://www.taptap.cn/moment/123',title:'b',snippet:'',scopes:['community']},{url:'https://www.douyin.com/video/123',title:'c',snippet:'',scopes:['community']}];
  const selected=dedupHits(hits,3);assert.equal(new Set(selected.map(h=>new URL(h.url).hostname)).size,3);
});
test('historical leads deduplicate identities, keep dates and are bounded rather than resending all evidence',()=>{
  const make=(day:string,title:string)=>({run:{as_of:day},events:[{title,public_id:'same',decision:'watch',keywords:['水温'],event_date:'2026-08-31'}]}) as ResearchBatch;
  const leads=discoveryHistory([make('2026-09-01','old'),make('2026-10-01','new')]);
  const saved=leads.filter(x=>x.title==='new'||x.title==='old');assert.equal(saved.length,1);assert.equal(saved[0].title,'new');assert.equal(saved[0].date,'2026-08-31');assert.ok(leads.every(x=>!('scores' in x)));
});

test('empty history does not inject the remembered September case',()=>{
  assert.deepEqual(discoveryHistory([]),[]);
  const plan=discoveryPlan([],'星穹铁道','2026-10-10',[]);
  assert.ok(plan.every(q=>!q.query.includes('仙客天狼')));
});

test('same topic on distinct sites remains distinct discovery work',()=>{
  const q=['bilibili.com','douyin.com','bilibili.com'].map(site=>({scope:'community' as const,query:`星穹铁道 site:${site} 活动 奖励 规则 权益 反馈 讨论`}));
  assert.equal(dedupQueries(q).length,2);
});

test('history cannot displace fresh source verification',()=>{
  const history=[{title:'末日幻影',keywords:['水温案例'],date:null},{title:'剧情更新',keywords:['剧情案例'],date:null}];
  for(const day of ['2026-10-10','2026-10-11'])assert.ok(discoveryPlan([],'星穹铁道',day,history).every(q=>!q.query.includes('案例')));
});
