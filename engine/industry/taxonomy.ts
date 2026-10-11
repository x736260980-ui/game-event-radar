// 首轮星铁研究分类；按需导入模式，不沿用 AI 行业分类。
export const CATEGORIES = [
  { key: "version", label: "版本与机制", section: "版本与机制", guide: "版本更新、玩法与战斗机制变化；一般攻略不等于机制争议。" },
  { key: "resource", label: "资源与付费", section: "资源与付费", guide: "抽卡、外观、奖励、预算和消费权益；区分外观消费与战力付费。" },
  { key: "character", label: "角色与宣发", section: "角色与宣发", guide: "角色待遇、PV与宣发资源；不凭玩家猜测确认删减。" },
  { key: "story", label: "剧情与内容", section: "剧情与内容", guide: "剧情逻辑、角色塑造、演出与内容体验。" },
  { key: "operations", label: "运营与权益", section: "运营与权益", guide: "活动、联动、服务、运营回应和明确的玩家权益问题。" },
  { key: "community", label: "社区观点", section: "社区观点", guide: "作者或社区的评价与解释，不把讨论当作事实或玩家总体态度。", commentary: true },
] as const satisfies ReadonlyArray<{ key: string; label: string; section: string; guide: string; commentary?: true }>;
export const RELEASE: { category: string; tag: string; unit: string } | null = null;
export const PLAIN_TERMS: readonly string[] = ["星铁", "星穹铁道", "游戏", "版本", "角色", "玩家", "pv"];
export const ITEM_TYPES = ["version_change", "resource_change", "character_promotion", "story_content", "operations_event", "opinion_analysis", "tutorial_explainer"] as const;
export const CATEGORY_TAGS = ["版本机制", "资源付费", "角色宣发", "剧情内容", "运营权益", "社区观点", "其他"] as const;
export const TOPIC_TAGS = ["星穹铁道", "抽卡", "时装", "奖励", "战斗", "剧情", "角色待遇", "联动", "活动", "幻宠", "货币战争"] as const;
export const ENTITY_TAGS = ["米哈游", "HoYoverse"] as const;
export const TAG_SYNONYMS: Readonly<Record<string, string>> = { 星铁: "星穹铁道", 崩铁: "星穹铁道", 皮肤: "时装", 卡池: "抽卡" };
export const ENTITIES: Record<string, { name: string; displayTag: string | null; aliases: string[]; otherNames?: string[] }> = {
  hoyoverse: { name: "米哈游 / HoYoverse", displayTag: "米哈游", aliases: ["米哈游", "HoYoverse", "崩坏：星穹铁道", "星穹铁道"], otherNames: ["崩坏星穹铁道", "Honkai: Star Rail"] },
};
export const IDENTITY_LEXICON: ReadonlyArray<{ id: string; name: string; patterns: RegExp[] }> = [
  { id: "hoyoverse", name: "米哈游 / HoYoverse", patterns: [/米哈游|hoyoverse|mihoyo|星穹铁道|honkai:\s*star\s*rail/i] },
];
export const PUBLISHER_DOMAINS: ReadonlyArray<{ entityId: string; domains: readonly string[] }> = [
  { entityId: "hoyoverse", domains: ["sr.mihoyo.com", "hsr.hoyoverse.com"] },
];
export const IDENTITY_CONTEXT_ALIASES: ReadonlyArray<{ entityId: string; pattern: RegExp }> = [];
