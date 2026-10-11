import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalUrl,dedupQueries,dedupHits,sourceKind,pageKind,dateCandidates,boundNoteDates,bodySegment,cleanText,safeMessage,articleLinks} from '../update-utils.ts';
test('canonical URLs strip trackers but retain meaningful parameters',()=>{
  assert.equal(canonicalUrl('https://a.example/news/?utm_source=x&id=2#top'),'https://a.example/news?id=2');
  assert.notEqual(canonicalUrl('https://a.example/?id=1'),canonicalUrl('https://a.example/?id=2'));
});
test('language variants share an official source URL',()=>assert.equal(canonicalUrl('https://hsr.hoyoverse.com/en-us/news/123'),canonicalUrl('https://hsr.hoyoverse.com/zh-cn/news/123')));
test('invalid and obvious private URLs cannot be search hits',()=>{for(const u of ['javascript:alert(1)','http://127.0.0.1/','http://localhost/','https://user:pass@example.com/'])assert.throws(()=>canonicalUrl(u));});
test('similar queries deduplicate within but not across source scopes',()=>{
  const qs=dedupQueries([{query:'星穹铁道 官方公告 最新消息',scope:'official'},{query:'星穹铁道 公告',scope:'official'},{query:'星穹铁道 公告',scope:'community'},{query:'星穹铁道 角色PV争议',scope:'community'}]);
  assert.equal(qs.length,3);
});
test('URL dedup preserves scopes and caps balanced selection',()=>{
  const a={url:'https://a.example/a',title:'A',snippet:'a',scopes:['official']};
  const out=dedupHits([a,{...a,url:a.url+'?utm_x=1',scopes:['media'],snippet:'longer'},{...a,url:'https://b.example/b',scopes:['community']}],2);
  assert.equal(out.length,2);assert.deepEqual(out[0].scopes,['official','media']);assert.equal(out[0].snippet,'longer');
});
test('community and brand-looking hosts do not become official',()=>{assert.equal(sourceKind('https://hsr.hoyoverse.com/zh-cn/news/123'),'official');assert.equal(sourceKind('https://www.miyoushe.com/sr/article/123'),'community');assert.equal(sourceKind('https://hsr.hoyoverse.com.evil.example/a'),'community');});
test('video pages are metadata, never transcript evidence',()=>assert.equal(pageKind('https://www.bilibili.com/video/BV123','正文'.repeat(300)),'video_metadata'));
test('empty, challenge and home pages stay weak evidence',()=>{assert.equal(pageKind('https://a.example/a',''),'unavailable');assert.equal(pageKind('https://a.example/a','Access Denied'.repeat(50)),'shell');assert.equal(pageKind('https://a.example/','内容'.repeat(300)),'shell');});
test('official home and community aggregations cannot count as article bodies',()=>{for(const u of ['https://hsr.hoyoverse.com/zh-tw/home','https://hsr.hoyoverse.com/zh-cn/news','https://www.taptap.cn/app/224267/topic?type=official'])assert.equal(pageKind(u,'内容'.repeat(300)),'shell');});
test('date candidates reject nonexistent and future days without asserting publication',()=>assert.deepEqual(dateCandidates('发布2026年10月5日，活动2026-10-10；无效2026-02-30','2026-10-06').map(x=>x.day),['2026-10-05']));
test('unsupported model dates are unknown and cannot block unrelated materials',()=>{
 const n={published_at:'2026-10-09',revised_at:'2026-10-11',event_time:'2026-10-21',date_basis:'正文只有10月21日，无年份'};
 assert.equal(boundNoteDates(n,[{day:'2026-10-09'}],[]).length,2);
 assert.equal(n.published_at,'2026-10-09');assert.equal(n.revised_at,null);assert.equal(n.event_time,null);assert.match(n.date_basis,/记为未知/);
});
test('ordinary body segments are bounded and strip active markup',()=>{assert.equal(bodySegment('<script>ignore me</script><article>'+('文字'.repeat(3000))+'</article>','标题').length,2200);assert.equal(cleanText('<nav>导航</nav><p>内容</p><script>alert(1)</script>'),'内容');});
test('long notes retain an explicitly requested topic without hard-coded game keywords',()=>{const s=bodySegment('版本更新\n2026-09-28\n'+('开场'.repeat(2000))+'交易回滚：新机制'+('说明'.repeat(2000)),'版本更新',2200,['交易回滚']);assert.ok(s.includes('交易回滚'));assert.ok(s.includes('2026-09-28'));assert.ok(s.length<=2200);});

test('index discovery follows only concrete same-host links and records the parent',()=>{
  const links=articleLinks('<a href="/news/123456">角色待遇公告发布</a><a href="/news">新闻列表</a><a href="https://evil.example/news/999999">外部跳转链接</a><a href="javascript:alert(1)">坏链接测试</a>','https://hsr.hoyoverse.com/zh-cn/news','新闻入口');
  assert.equal(links.length,1);assert.equal(links[0].discovery_parent,'https://hsr.hoyoverse.com/zh-cn/news');
});
test('URL dedup retains the original address separately from its provenance key',()=>{const h=dedupHits([{url:'https://hsr.hoyoverse.com/en-us/news/123',title:'test',snippet:'',scopes:['official']}],1)[0];assert.match(h.url,/zh-cn/);assert.match(h.original_url!,/en-us/);});
test('provider errors redact credentials',()=>assert.equal(safeMessage(new Error('key=tvly-abcdefghijkl and custom-secret'),['custom-secret']),'key=[REDACTED] and [REDACTED]'));
test('TapTap post extraction does not borrow an unrelated recommendation feed',()=>{
  const raw='回归求助\n前天 10:32\n请问旧角色如何配队？\n崩坏星穹铁道\n前往论坛\n5.0版本爆料\n'+('末日幻影'.repeat(900));
  const s=bodySegment(raw,'回归求助',2200,['末日幻影'],'https://www.taptap.cn/moment/1234567');
  assert.match(s,/旧角色如何配队/);assert.ok(!s.includes('5.0'));assert.ok(!s.includes('末日幻影'));
});
test('a standalone 404 inside navigation is a shell, not body',()=>assert.equal(pageKind('https://sr.mihoyo.com/news/166089','导航'.repeat(200)+'\n404\n#\n用户协议'),'shell'));
test('activity dates carry their actual context, not a fabricated publication label',()=>{
  const dates=dateCandidates('活动开启时间：2026年9月28日，活动结束时间：2026年10月5日。','2026-10-06');
  assert.equal(dates.length,2);assert.match(dates[0].display,/活动开启时间/);assert.ok(!dates[0].display.includes('发布日期'));
});
test('video extraction stops before related videos even when the focus matches a recommendation',()=>{
 const text=bodySegment('当前前瞻\n2026-10-09\n联动角色介绍\n接下来播放\n流水配队\n'+('配队'.repeat(900)),'当前前瞻',2200,['流水配队'],'https://www.bilibili.com/video/BV1test');
 assert.ok(text.includes('联动角色介绍'));assert.ok(!text.includes('流水配队'));
});
test('TapTap search excerpts also stop before suggested searches and recommendation feeds',()=>{
 const text=bodySegment('冒头\n09/02\n随手发帖\n猜你想搜\n4.6流水与虚构配队','冒头',700,[],'https://www.taptap.cn/moment/844330099749687110');
 assert.ok(text.includes('随手发帖'));assert.ok(!text.includes('4.6流水'));
});
test('announced future event dates stay separate from publication-date candidates',()=>{
 const text='发布于2026年10月9日，活动2026年10月15日开启';
 assert.deepEqual(dateCandidates(text,'2026-10-10').map(d=>d.day),['2026-10-09']);
 assert.deepEqual(dateCandidates(text,'2026-10-10',true).map(d=>d.day),['2026-10-09','2026-10-15']);
});
