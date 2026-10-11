// Display-only translations: original evidence titles and score hashes stay unchanged.
const historical:Record<string,string>={
 'https://www-city-yokohama-lg-jp.cache.yimg.jp/city-info/koho-kocho/press/bunka/2026/1010starrail.html':'《崩坏：星穹铁道》与横滨市合作，宣布举办“星穹铁道开拓游戏 in 横滨”',
 'https://search.yahoo.co.jp/realtime/search/matome/4b4e4b9782fe4e849cd50b21014a3832-1790593800?ifr=postmtm_matometl&rkf=1':'星铁4.6开拓任务通关感想：部分用户称“非常有趣”“快让我玩后续”（Yahoo社交讨论汇总）',
 'https://zetneo2025.muragon.com/entry/47747.html':'星铁4.6剧情反应汇总：被“贪饕”吞噬的绝望与幕后人物身份（剧透）',
 'https://note.com/kikurasita1204/n/nef4b944ce983':'末日幻影“仙客天狼”行动策略攻略',
 'https://gamewith.jp/houkaistarrail/article/show/402987':'星铁4.6版本更新信息汇总',
};
export function materialTitle(m:{title:string;url:string;title_zh?:unknown}){
 return typeof m.title_zh==='string'&&m.title_zh.trim()?m.title_zh:historical[m.url]??m.title;
}
