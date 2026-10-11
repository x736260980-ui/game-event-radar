import type {Research} from '@aihot/game-radar/contract';
export function researchDigest(data:Research,event:Research['events'][number],allowedRefs?:Set<string>){
  const supported=(refs:string[])=>!allowedRefs||refs.every(ref=>allowedRefs.has(ref));
  const s=event.scores;
  const score=s.impact.value*3+s.novelty.value*2+s.evidence.value*2+s.audience.value*2+s.investigability.value;
  return [event.occurrence,
    ...event.confirmed_facts.filter(f=>supported(f.refs)).map(f=>`公告事实：${f.text} [${f.refs.join(', ')}]`),
    ...event.source_claims.filter(f=>supported(f.refs)).map(f=>`来源说法：${f.text} [${f.refs.join(', ')}]`),
    event.unknowns.length?`尚未确认：${event.unknowns.join('；')}`:'',
    `研究优先分：${score}/100。${event.decision_reason}`,
    `研究问题：${event.research_question}`,`检索词：${event.keywords.join('、')}`,
    `研究批次 ${data.run.id}；资料截至 ${data.run.as_of}。非预测、非玩家总体结论。`,
    allowedRefs?'综述仅采用当前证据快照覆盖的报道；背景与综合稿补充请在研究批次页查看。':''
  ].filter(Boolean).join('\n\n');
}
