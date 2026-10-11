import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {usageSummary} from '../modules/game-radar/update-policy.ts';
const root=path.resolve(process.argv[2]??'../runs');
const current=process.argv[3];if(!current||!/^[a-zA-Z0-9_-]+$/.test(current))throw new Error('Supply the completed new run ID');
const read=(id:string,name:string)=>JSON.parse(readFileSync(path.join(root,id,name),'utf8'));
function metrics(id:string){
 const s=read(id,'update-state.json');const d=existsSync(path.join(root,id,'research-input.json'))?read(id,'research-input.json'):null;
 const m=d?.materials??s.stages.materials??[];
 const usage=s.attempts?usageSummary(s.attempts):{actual_tokens:s.models.reduce((n:number,x:any)=>n+(x.reused?0:Number(x.usage?.total_tokens??0)),0),model_attempts:null,web_attempts:null,firecrawl_attempts:null,reused:s.models.filter((x:any)=>x.reused).length,token_reporting_complete:null,cost:null};
 return {id,status:s.status,material_count:m.length,body_segments:m.filter((x:any)=>x.access==='body').length,
   body_rate:m.length?m.filter((x:any)=>x.access==='body').length/m.length:null,
   selected_recent_body:m.filter((x:any)=>x.access==='body'&&x.decision==='use').length,
   excerpt_only:m.filter((x:any)=>x.access==='excerpt_only').length,unavailable:m.filter((x:any)=>x.access==='unavailable').length,
   excluded:m.filter((x:any)=>x.decision==='exclude').map((x:any)=>({id:x.id,reason:x.selection_reason})),
   event_count:d?.events.length??null,recommended:d?.events.filter((x:any)=>x.decision==='recommend').length??null,
   repair_attempts:s.stages.repair_attempted?1:(s.models.some((x:any)=>x.stage==='boundary_repair')?1:0),
   usage,successful_model_stages:s.models.length};
}
const baseline=metrics('starrail-auto-20261006-01');const final=metrics(current);
const trials=['starrail-auto-20261006-02','starrail-auto-20261006-03',current].map(metrics);
const out={baseline,final,trials,total_trial_model_tokens:trials.reduce((n,x)=>n+x.usage.actual_tokens,0),
 notes:['正文率是记录的相关片段读取资格，不是全文抓取成功率或事实准确率。','排除项包含无关、访问失败或旧材料，不能全部算作无关。','基线未保存全部失败尝试计数，不能声称尝试总量下降。','实际费用无供应商账单，保持null；开发失败试验消耗也计入。']};
writeFileSync(path.join(root,current,'comparison.json'),JSON.stringify(out,null,2)+'\n','utf8');
const rows=[['材料数','material_count'],['正文片段数','body_segments'],['近期采用正文','selected_recent_body'],['事件数','event_count'],['推荐数','recommended'],['修复次数','repair_attempts']] as const;
const md=['# 与上一轮十二条试验对照','',`基线：${baseline.id}；新轮：${current}。`,'','| 项目 | 基线 | 新轮 |','|---|---:|---:|',
 ...rows.map(([label,key])=>`| ${label} | ${baseline[key]??'未通过校验'} | ${final[key]??'未通过校验'} |`),
 `| 实际返回模型token | ${baseline.usage.actual_tokens} | ${final.usage.actual_tokens} |`,'',
 `正文片段率：${(100*(baseline.body_rate??0)).toFixed(1)}% → ${(100*(final.body_rate??0)).toFixed(1)}%。`,
 `新轮调用尝试：模型${final.usage.model_attempts}、搜索/提取${final.usage.web_attempts}、Firecrawl${final.usage.firecrawl_attempts}。缓存回执复用${final.usage.reused}。`,
 '',`本次三个开发试验实际返回模型token合计：${out.total_trial_model_tokens}，失败及暂缓发布的试验也计入，不只报被采用材料的消耗。`,
 '',...out.notes.map(x=>'- '+x),'','## 各试验结果','',...trials.map(x=>`- ${x.id}：${x.status}；成功模型阶段${x.successful_model_stages}；token ${x.usage.actual_tokens}；修复${x.repair_attempts}次。`),
 '', '03号仅通过结构校验，发布前语义抽查发现推荐流混入及跨帖拼接，未发布；02和04号修复后仍未通过。对话校核另存starrail-review-20261006-01，不将它标记成自动04号成功。'];
writeFileSync(path.join(root,current,'comparison.md'),md.join('\n')+'\n','utf8');console.log(JSON.stringify(out));
