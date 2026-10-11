// Complete a genuine conversation review of an already-published pending daily batch.
// No model or search calls. A prepared packet and actual blind Codex review are required.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import path from 'node:path';
import {ResearchSchema,validateResearch,recommendationSupport,MappingSchema} from '../modules/game-radar/contract.ts';
import {evidenceHash,ScoreReviewSchema,resolveScores,weightedScore} from '../modules/game-radar/scoring.ts';
import {researchBatches} from '@aihot/backend/publication/radar';
import {closeDb} from '@aihot/backend/db';
import {finalReview} from '../modules/game-radar/update-policy.ts';
const [inputFile,blindFile,mappingFile,outputDir]=process.argv.slice(2);
if(!inputFile||!blindFile||!mappingFile||!outputDir)throw new Error('Usage: complete-review.ts pending-input.json codex-blind-review.json mapping.json new-output-directory');
if(existsSync(path.join(outputDir,'research-input.json')))throw new Error('Completed output already exists');
try{
 const data=ResearchSchema.parse(JSON.parse(readFileSync(inputFile,'utf8'))),mapping=MappingSchema.parse(JSON.parse(readFileSync(mappingFile,'utf8')));
 const blind=JSON.parse(readFileSync(blindFile,'utf8')) as {events:Array<{id:string;snapshot_hash:string;review:unknown}>};
 if(blind.events.length!==data.events.length||new Set(blind.events.map(e=>e.id)).size!==data.events.length)throw new Error('Blind review coverage mismatch');
 const previous=(await researchBatches()).find(b=>b.run.id===data.run.id);
 if(!previous)throw new Error('Pending research must be published first, so the completed revision can preserve event IDs');
 for(const event of data.events){
  const b=blind.events.find(x=>x.id===event.id),pair=event.dual_score;
  if(!pair||pair.status!=='pending'||!b||pair.snapshot_hash!==evidenceHash(data.materials,event)||b.snapshot_hash!==pair.snapshot_hash)throw new Error('Pending evidence mismatch: '+event.id);
  const review=ScoreReviewSchema.parse(b.review);if(review.reviewer!=='codex'||!review.blind||review.receipt_id!==null)throw new Error('Independent Codex review required');
  pair.second={...review,total:weightedScore(review.scores)};pair.status='complete';const resolution=resolveScores(pair.first,review,recommendationSupport(data.materials,event).eligible);
  pair.resolution={decision:resolution.decision,reason:resolution.reason};event.scores=resolution.scores;event.decision=resolution.decision;event.decision_reason=resolution.reason;
  const old=previous.events.find(e=>e.id===event.id);if(!old?.public_id)throw new Error('Historical event ID missing');
  mapping.existing_stories[event.id]=old.public_id;(mapping.existing_relations??={})[event.id]='same_occurrence';
 }
 data.run.parent_run_id=data.run.id;data.run.id=path.basename(outputDir);data.run.derived_on=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'});
 data.run.source_model_api_calls=data.run.model_api_calls??0;data.run.model_api_calls=0;data.run.review_completed_at=new Date().toISOString();data.run.researcher='DeepSeek初评 + 当前Codex独立复评';
 data.review=finalReview(data);
 const validated=validateResearch(data,mapping);mkdirSync(outputDir,{recursive:true});
 for(const [name,value] of [['research-input.json',validated.data],['engine-mapping.json',validated.mapping],['codex-blind-review.json',blind]])writeFileSync(path.join(outputDir,name as string),JSON.stringify(value,null,2)+'\n',{encoding:'utf8',flag:'wx'});
 writeFileSync(path.join(outputDir,'candidates.md'),'# 复评后的候选事件\n\n'+validated.data.events.map(e=>`## ${e.title}\n\n${e.occurrence}${e.player_discussion?'\n\n社区讨论：'+e.player_discussion:''}\n\n关注理由：${e.decision_reason}\n\n未知：${e.unknowns.join('；')}`).join('\n\n'),{encoding:'utf8',flag:'wx'});
 writeFileSync(path.join(outputDir,'review.md'),'# 复评后处理记录\n\n'+JSON.stringify(data.review,null,2)+'\n',{encoding:'utf8',flag:'wx'});
 console.log(JSON.stringify({ok:true,new_run:data.run.id,model_calls:0,recommendations:data.events.filter(e=>e.decision==='recommend').length}));
}finally{await closeDb();}
