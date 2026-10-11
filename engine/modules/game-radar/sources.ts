// Exact account identities, not trust in an entire user-content platform.
export const FIXED_SOURCES=[
  {name:'星铁国服官网',url:'https://sr.mihoyo.com/',kind:'official',purpose:'公告原文入口'},
  {name:'星铁全球官网',url:'https://hsr.hoyoverse.com/',kind:'official',purpose:'公告原文入口'},
  {name:'星铁官方X',url:'https://x.com/honkaistarrail',kind:'official',purpose:'官方账号原帖；无法读正文时仅线索'},
  {name:'星铁官方B站',url:'https://space.bilibili.com/1340190821',kind:'official',purpose:'官方动态入口；视频信息不冒充正文'},
  {name:'星铁Reddit社区',url:'https://www.reddit.com/r/HonkaiStarRail/',kind:'community',purpose:'社区讨论，不作官方事实'},
  {name:'TapTap星铁社区',url:'https://www.taptap.cn/app/224267/topic',kind:'community',purpose:'社区讨论入口，不作事件正文'},
] as const;
export const ACCOUNT_VERIFICATION={
  bilibili:'https://apps.apple.com/cn/app/id1523037824',
  x:'https://apps.apple.com/us/app/id1599719154',
  note:'账号由游戏官方应用商店页面的交叉链接核实；抖音尚未核实固定账号，不将普通抖音结果当官方。',
};
export const OFFICIAL_ACCOUNTS=[
  {platform:'x',id:'honkaistarrail',name:'星铁官方',basis:ACCOUNT_VERIFICATION.x},
  {platform:'x',id:'zzz_en',name:'绝区零官方（星铁联动时查）',basis:'https://zenless.hoyoverse.com/'},
  {platform:'bilibili',id:'1340190821',name:'星铁官方',basis:ACCOUNT_VERIFICATION.bilibili},
] as const;
export function isOfficialAccount(url:string):boolean {
  const u=new URL(url),host=u.hostname.toLowerCase(),p=u.pathname.toLowerCase();
  if(['x.com','www.x.com','twitter.com','www.twitter.com'].includes(host))return OFFICIAL_ACCOUNTS.some(a=>a.platform==='x'&&new RegExp(`^/${a.id}(?:/status/\\d+)?/?$`).test(p));
  if(host==='space.bilibili.com')return /^\/1340190821(?:\/dynamic)?\/?$/.test(p);
  return false;
}
/** A quoted official link or a title saying 官方 does not establish authorship. */
export function sourceIdentity(url:string,raw=''){
  if(isOfficialAccount(url))return {status:'verified' as const,basis:'已核实账号的原帖地址',account_url:url};
  if(/(^|\.)bilibili\.com$/.test(new URL(url).hostname)){
    // Only the current video's structured author, never a recommended video's owner.
    try{
      const serialized=raw.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});/)?.[1];
      const video=serialized?JSON.parse(serialized).videoData:null;
      const bvid=new URL(url).pathname.match(/^\/video\/(BV[^/]+)/)?.[1];
      const owner=String(video?.owner?.mid??'');
      if(bvid&&video?.bvid===bvid&&OFFICIAL_ACCOUNTS.some(a=>a.platform==='bilibili'&&a.id===owner))return {status:'verified' as const,basis:'当前视频videoData.owner.mid与已核实官方UID一致',account_url:`https://space.bilibili.com/${owner}`};
    }catch{/* Missing or invalid platform data is not proof of official authorship. */}
  }
  return {status:'unverified' as const,basis:'没有取得可核实的官方作者标识',account_url:null};
}
