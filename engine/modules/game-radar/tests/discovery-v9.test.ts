import test from 'node:test';
import assert from 'node:assert/strict';
import {followupPlan,hitExclusion,selectLeads} from '../discovery.ts';
import {isOfficialAccount,sourceIdentity} from '../sources.ts';
import {sourceKind,pageKind,bodySegment,dateCandidates,isIndexPage} from '../update-utils.ts';
import {normalizeUnassigned,eventContinuations,validateContinuations} from '../update-policy.ts';
test('crossover official source is recognized, lookalikes and quoted profiles are not',()=>{
 assert.equal(sourceKind('https://x.com/ZZZ_EN/status/2108529665098805723'),'official');
 assert.equal(isOfficialAccount('https://x.com/ZZZ_EN_fake/status/123'),false);
 assert.equal(sourceIdentity('https://www.bilibili.com/video/BVtest','官方公告 https://space.bilibili.com/1340190821').status,'unverified');
 assert.equal(sourceIdentity('https://www.bilibili.com/video/BVtest','{"owner":{"mid":1340190821}}').status,'unverified');
 assert.equal(sourceIdentity('https://www.bilibili.com/video/BVtest','window.__INITIAL_STATE__={"videoData":{"bvid":"BVtest","owner":{"mid":1340190821}}};').status,'verified');
 assert.equal(sourceIdentity('https://www.bilibili.com/video/BVtest','window.__INITIAL_STATE__={"videoData":{"bvid":"BVother","owner":{"mid":1340190821}}};').status,'unverified');
});
test('model official investigation survives follow-up limits and English sites get English text',()=>{
 const q=followupPlan([{scope:'community',query:'旧角色讨论'},{scope:'official',query:'卡芙卡 知更鸟 绝区零 联动 公布 site:x.com/ZZZ_EN'}],[],'星穹铁道','2026-10-10');
 assert.equal(q[0].scope,'official');assert.match(q[0].query,/Kafka Robin/);assert.doesNotMatch(q[0].query,/[\u3400-\u9fff]/);
});
test('clear commerce noise filtered but real controversy remains',()=>{
 const hit=(title:string,url='https://www.taptap.cn/moment/123')=>({title,url,snippet:'',scopes:['community']});
 assert.ok(hitExclusion(hit('商品详情')));assert.ok(hitExclusion(hit('珍藏流萤换小白')));
 assert.equal(hitExclusion(hit('联动角色付费获取方式争议')),null);
});
test('Bili text dynamics can carry body while video metadata cannot',()=>{
 const body='2026-10-09 官方动态公布版本内容。'.repeat(20);
 assert.equal(pageKind('https://t.bilibili.com/123',body),'article_text');
 assert.equal(pageKind('https://www.bilibili.com/video/BVtest',body),'video_metadata');
});
test('official post excerpt excludes replies and preserves escaped date',()=>{
 const t=bodySegment('Posted: 2026\\-10\\-09\nOfficial crossover\n## Top Comments\nUnconfirmed free character','',1000,[],'https://x.com/ZZZ_EN/status/123');
 assert.ok(!t.includes('Unconfirmed'));assert.equal(dateCandidates(t,'2026-10-10')[0].day,'2026-10-09');
});
test('mobile news directory is not article evidence',()=>{
 assert.equal(isIndexPage('https://zenless.hoyoverse.com/m/zh-tw/news'),true);
 assert.equal(isIndexPage('https://zenless.hoyoverse.com/en-us/news/123456'),false);
});
test('official-account query is restricted to its platform',()=>{
 const result=followupPlan([{scope:'official',query:'Zenless Zone Zero official X Kafka Robin announcement'}],[],'星铁','2026-10-10');
 assert.match(result[0].query,/site:x.com\/ZZZ_EN/);
});
test('membership dominates duplicate unassigned bookkeeping without changing judgments',()=>{
 const materials=[{id:'SRC-001',decision:'use'},{id:'SRC-002',decision:'exclude'},{id:'SRC-003',decision:'watch'}];
 const items=materials.map(m=>({material_id:m.id,status:'pending',reason:'待核查'}));
 assert.deepEqual(normalizeUnassigned(materials as never,[{members:[{material_id:'SRC-001'}]}] as never,items),[items[2]]);
});

test('explicitly uncertain historical relation keeps a separate event without a false merge or repair',()=>{
 const id='6fdeb198-d81b-4fce-84e7-7ab8acff7949';
 const events=[{id:'EVT-001',previous_event:{public_id:id,relation:'uncertain' as const,reason:'相同主题但具体发生时间关系尚不明确。'}}];
 const links=eventContinuations(events);
 assert.deepEqual(links.existing_stories,{});
 assert.equal(links.details['EVT-001'].relation,'uncertain');
 assert.doesNotThrow(()=>validateContinuations({existing_stories:{}} as never,links.details,[]));
 assert.equal(events[0].previous_event.relation,'uncertain');
});

test('lead gate preserves model relevance order and never fills leftover slots with platform noise',()=>{
 const pool=[{url:'https://www.douyin.com/video/1',title:'财富等级怎么隐藏',snippet:'推荐流有星铁',scopes:['community']},{url:'https://x.com/ZZZ_EN/status/2',title:'Star Rail crossover',snippet:'Kafka Robin',scopes:['official']}];
 assert.deepEqual(selectLeads(pool as never,['HIT-002'],12),[pool[1]]);
 assert.deepEqual(selectLeads(pool as never,[],12),[]);
 assert.throws(()=>selectLeads(pool as never,['HIT-003'],12),/Invalid/);
 assert.throws(()=>selectLeads(pool as never,['HIT-002','HIT-002'],12),/Invalid/);
 assert.throws(()=>selectLeads(pool as never,['HIT-001','HIT-002'],1),/Invalid/);
});
